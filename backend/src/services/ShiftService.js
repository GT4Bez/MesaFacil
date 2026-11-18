import { ShiftRepository } from '../repositories/ShiftRepository.js';
import { ShiftReportRepository } from '../repositories/ShiftReportRepository.js';
import { AuditLogService } from './AuditLogService.js';
import { ConflictError, NotFoundError } from '../errors/AppError.js';
import { isPgError } from '../errors/pgErrors.js';

export class ShiftService {
  constructor(
    shiftRepository = new ShiftRepository(),
    auditLogService = new AuditLogService(),
    shiftReportRepository = new ShiftReportRepository()
  ) {
    this.shifts = shiftRepository;
    this.audit = auditLogService;
    this.reports = shiftReportRepository;
  }

  findActive() {
    return this.shifts.findActive();
  }

  // RN-02: o índice parcial shifts_single_open_idx impede dois turnos abertos.
  async open(user) {
    try {
      return await this.shifts.transaction(async (db) => {
        const shift = await this.shifts.open(user.id, db);
        await this.#record(user, shift, 'shift.opened', db);
        return shift;
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
      const closed = await this.shifts.close(id, db);
      if (closed) {
        await this.#record(user, closed, 'shift.closed', db);
        return closed;
      }

      const shift = await this.shifts.findById(id, db);
      if (!shift) throw new NotFoundError('Turno não encontrado.');
      if (shift.status === 'closed') throw new ConflictError('O turno já está encerrado.');
      throw new ConflictError('Não é possível encerrar o turno com pedidos ativos.');
    });
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

      return {
        shift,
        ...totals,
        byPaymentMethod,
        byMenuItem,
        cancellations: { ordersCount: orders.length, orders, items }
      };
    });
  }

  // RN-11: abertura e fechamento de turno ficam na trilha de auditoria.
  #record(user, shift, action, db) {
    return this.audit.record(
      { userId: user.id, shiftId: shift.id, action, entity: 'shift', entityId: shift.id },
      db
    );
  }
}
