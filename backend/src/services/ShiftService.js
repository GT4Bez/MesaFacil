import { ShiftRepository } from '../repositories/ShiftRepository.js';
import { ShiftReportRepository } from '../repositories/ShiftReportRepository.js';
import { CashMovementRepository } from '../repositories/CashMovementRepository.js';
import { AuditLogService } from './AuditLogService.js';
import { hasRole } from '../auth/roles.js';
import { ConflictError, DomainValidationError, NotFoundError } from '../errors/AppError.js';
import { isPgError } from '../errors/pgErrors.js';
import { MAX_PG_MONEY, toMoney } from '../domain/money.js';

const MOVEMENT_ACTIONS = { withdrawal: 'cash.withdrawal', reinforcement: 'cash.reinforcement' };

export class ShiftService {
  constructor(
    shiftRepository = new ShiftRepository(),
    auditLogService = new AuditLogService(),
    shiftReportRepository = new ShiftReportRepository(),
    cashMovementRepository = new CashMovementRepository()
  ) {
    this.shifts = shiftRepository;
    this.audit = auditLogService;
    this.reports = shiftReportRepository;
    this.cash = cashMovementRepository;
  }

  findActive() {
    return this.shifts.findActive();
  }

  // RN-02: o índice parcial shifts_single_open_idx impede dois turnos abertos.
  // RN-13: o turno abre com o fundo de troco (pode ser 0), registrado como movimento e auditado.
  async open(user, { openingFloat } = {}) {
    const float = toMoney(openingFloat);
    if (float === null || float < 0 || float > MAX_PG_MONEY) {
      throw new DomainValidationError('Informe o fundo de troco (0 ou mais).');
    }
    try {
      return await this.shifts.transaction(async (db) => {
        const shift = await this.shifts.open(user.id, db);
        await this.cash.create({ shiftId: shift.id, userId: user.id, type: 'opening_float', amount: float }, db);
        await this.#record(user, shift, 'shift.opened', db, { openingFloat: float });
        return { ...shift, openingFloat: float };
      });
    } catch (error) {
      if (isPgError(error, '23505', 'shifts_single_open_idx')) {
        throw new ConflictError('Já existe um turno aberto.');
      }
      throw error;
    }
  }

  async close(id, user) {
    return this.shifts.transaction(async (db) => {
      // RN-02: trava o turno com FOR UPDATE antes de checar pedidos ativos para aguardar
      // o commit de eventuais POST /orders concorrentes (que mantêm FOR SHARE no turno).
      const shift = await this.shifts.findById(id, { lock: true }, db);
      if (!shift) throw new NotFoundError('Turno não encontrado.');
      if (shift.status === 'closed') throw new ConflictError('O turno já está encerrado.');
      if (await this.shifts.hasActiveOrders(id, db)) {
        throw new ConflictError('Não é possível encerrar o turno com pedidos ativos.');
      }

      const closed = await this.shifts.close(id, db);
      if (!closed) throw new ConflictError('Não é possível encerrar o turno com pedidos ativos.');
      await this.#record(user, closed, 'shift.closed', db);
      return closed;
    });
  }

  // RN-13: sangria e reforço. O turno fica travado (FOR UPDATE) para que movimentos simultâneos
  // não passem do saldo nem entrem depois do fechamento. O esperado só volta para gerente/admin.
  async addCashMovement(shiftId, { type, amount, reason } = {}, user) {
    const action = MOVEMENT_ACTIONS[type];
    if (!action) throw new DomainValidationError('Tipo de movimento inválido: use sangria ou reforço.');
    const value = toMoney(amount);
    if (value === null || !(value > 0) || value > MAX_PG_MONEY) {
      throw new DomainValidationError('Valor do movimento inválido.');
    }
    const cleaned = typeof reason === 'string' ? reason.trim() : '';
    if (!cleaned) throw new DomainValidationError('Informe o motivo do movimento.');

    return this.shifts.transaction(async (db) => {
      const shift = await this.shifts.findById(shiftId, { lock: true }, db);
      if (!shift) throw new NotFoundError('Turno não encontrado.');
      if (shift.status === 'closed') throw new ConflictError('O turno já está encerrado.');

      if (type === 'withdrawal' && value > (await this.cash.findCashSummary(shift.id, db)).expected) {
        // Mensagem genérica: o valor esperado não pode vazar para o caixa (conferência cega, spec 008).
        throw new DomainValidationError('A sangria é maior que o dinheiro disponível na gaveta.');
      }

      const movement = await this.cash.create(
        { shiftId: shift.id, userId: user.id, type, amount: value, reason: cleaned },
        db
      );
      await this.audit.record(
        {
          userId: user.id,
          shiftId: shift.id,
          action,
          entity: 'cash_movement',
          entityId: movement.id,
          details: { amount: value, reason: cleaned }
        },
        db
      );

      if (!hasRole(user, 'manager')) return movement;
      return { ...movement, expectedCash: (await this.cash.findCashSummary(shift.id, db)).expected };
    });
  }

  async listCashMovements(shiftId) {
    const shift = await this.shifts.findById(shiftId);
    if (!shift) throw new NotFoundError('Turno não encontrado.');
    return this.cash.findByShift(shift.id);
  }

  // RN-10: relatório derivado do banco; com o turno aberto, é parcial.
  async getReport(id) {
    return this.reports.snapshot(async (db) => {
      const shift = await this.reports.findShift(id, db);
      if (!shift) throw new NotFoundError('Turno não encontrado.');

      const totals = await this.reports.findTotals(id, db);
      const byPaymentMethod = await this.reports.findByPaymentMethod(id, db);
      const byMenuItem = await this.reports.findByMenuItem(id, db);
      const orders = await this.reports.findCanceledOrders(id, db);
      const items = await this.reports.findCanceledItems(id, db);
      const cashSummary = await this.cash.findCashSummary(id, db);
      const movements = await this.cash.findByShift(id, db);

      return {
        shift,
        ...totals,
        byPaymentMethod,
        byMenuItem,
        cancellations: { ordersCount: orders.length, orders, items },
        cash: { ...cashSummary, movements }
      };
    });
  }

  // RN-11: abertura e fechamento de turno ficam na trilha de auditoria.
  #record(user, shift, action, db, details = {}) {
    return this.audit.record(
      { userId: user.id, shiftId: shift.id, action, entity: 'shift', entityId: shift.id, details },
      db
    );
  }
}
