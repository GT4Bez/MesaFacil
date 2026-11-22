import { ShiftRepository } from '../repositories/ShiftRepository.js';
import { ShiftReportRepository } from '../repositories/ShiftReportRepository.js';
import { CashMovementRepository } from '../repositories/CashMovementRepository.js';
import { COUNT_METHODS, ShiftCountRepository } from '../repositories/ShiftCountRepository.js';
import { AuditLogService } from './AuditLogService.js';
import { hasRole } from '../auth/roles.js';
import { ConflictError, DomainValidationError, NotFoundError } from '../errors/AppError.js';
import { isPgError } from '../errors/pgErrors.js';
import { MAX_PG_MONEY, roundMoney, toMoney } from '../domain/money.js';

const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');
const MOVEMENT_ACTIONS = { withdrawal: 'cash.withdrawal', reinforcement: 'cash.reinforcement' };

export class ShiftService {
  constructor(
    shiftRepository = new ShiftRepository(),
    auditLogService = new AuditLogService(),
    shiftReportRepository = new ShiftReportRepository(),
    cashMovementRepository = new CashMovementRepository(),
    shiftCountRepository = new ShiftCountRepository()
  ) {
    this.shifts = shiftRepository;
    this.audit = auditLogService;
    this.reports = shiftReportRepository;
    this.cash = cashMovementRepository;
    this.counts = shiftCountRepository;
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

  // RN-14: contagem cega. O caixa declara o que contou; o esperado é calculado e congelado aqui,
  // mas nunca volta na resposta. Recontar substitui a contagem anterior.
  async count(id, { declared, note } = {}, user) {
    const values = {};
    for (const method of COUNT_METHODS) {
      const value = toMoney(declared?.[method]);
      if (value === null || value < 0 || value > MAX_PG_MONEY) {
        throw new DomainValidationError('Informe os valores contados de dinheiro, cartão e Pix (0 ou mais).');
      }
      values[method] = value;
    }
    const cleanedNote = cleanText(note) || null;

    return this.shifts.transaction(async (db) => {
      const shift = await this.#lockOpenShift(id, db);
      if (await this.shifts.hasActiveOrders(shift.id, db)) {
        throw new ConflictError('Feche as comandas abertas antes da contagem.');
      }
      const expected = await this.#expectedByMethod(shift.id, db);
      const countedAt = await this.counts.replace(
        { shiftId: shift.id, userId: user.id, declared: values, expected, note: cleanedNote },
        db
      );
      await this.#record(user, shift, 'shift.counted', db, { declared: values, note: cleanedNote });
      return { shiftId: shift.id, countedAt, declared: values, note: cleanedNote };
    });
  }

  // RN-02 + RN-14: o gerente encerra depois da contagem do caixa; diferença exige motivo.
  async close(id, user, { reason } = {}) {
    return this.shifts.transaction(async (db) => {
      // RN-02: trava o turno com FOR UPDATE antes de checar pedidos ativos para aguardar
      // o commit de eventuais POST /orders concorrentes (que mantêm FOR SHARE no turno).
      const shift = await this.#lockOpenShift(id, db);
      if (await this.shifts.hasActiveOrders(id, db)) {
        throw new ConflictError('Não é possível encerrar o turno com pedidos ativos.');
      }

      const count = await this.counts.findByShift(shift.id, db);
      if (!count) throw new ConflictError('O caixa ainda não fez a contagem de fechamento.');
      if (await this.#isStale(count, shift.id, db)) {
        throw new ConflictError(
          'Houve pagamento ou movimento de caixa depois da contagem. Peça ao caixa uma nova contagem.'
        );
      }
      const note = cleanText(reason) || null;
      if (count.methods.some((item) => item.difference !== 0) && !note) {
        throw new DomainValidationError('Há diferença na conferência: informe o motivo.');
      }

      const closed = await this.shifts.close(id, { closedBy: user.id, note }, db);
      if (!closed) throw new ConflictError('Não é possível encerrar o turno com pedidos ativos.');
      await this.#record(user, closed, 'shift.closed', db, { closing: count.methods, reason: note });
      return { ...closed, closing: { ...count, reason: note } };
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
      const count = await this.counts.findByShift(id, db);
      const { closingNote, ...shiftData } = shift;

      return {
        shift: shiftData,
        ...totals,
        byPaymentMethod,
        byMenuItem,
        cancellations: { ordersCount: orders.length, orders, items },
        cash: { ...cashSummary, movements },
        // RN-14: conferência cega; `stale` indica contagem desatualizada com o turno aberto.
        closing: count && {
          ...count,
          reason: closingNote,
          stale: shift.status === 'open' && (await this.#isStale(count, id, db))
        }
      };
    });
  }

  async #lockOpenShift(id, db) {
    const shift = await this.shifts.findById(id, { lock: true }, db);
    if (!shift) throw new NotFoundError('Turno não encontrado.');
    if (shift.status === 'closed') throw new ConflictError('O turno já está encerrado.');
    return shift;
  }

  // Esperado por forma: dinheiro pela RN-13 (fundo, troco, sangria e reforço); cartão e Pix líquidos.
  async #expectedByMethod(shiftId, db) {
    const byMethod = await this.reports.findByPaymentMethod(shiftId, db);
    const expected = Object.fromEntries(byMethod.map(({ method, total }) => [method, roundMoney(total)]));
    expected.cash = roundMoney((await this.cash.findCashSummary(shiftId, db)).expected);
    return expected;
  }

  // A contagem vale enquanto o esperado de cada forma for o mesmo de quando ela foi feita.
  async #isStale(count, shiftId, db) {
    const current = await this.#expectedByMethod(shiftId, db);
    return count.methods.some((item) => roundMoney(item.expected) !== current[item.method]);
  }

  // RN-11: abertura e fechamento de turno ficam na trilha de auditoria.
  #record(user, shift, action, db, details = {}) {
    return this.audit.record(
      { userId: user.id, shiftId: shift.id, action, entity: 'shift', entityId: shift.id, details },
      db
    );
  }
}
