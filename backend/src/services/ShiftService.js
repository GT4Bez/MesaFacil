import { ShiftRepository } from '../repositories/ShiftRepository.js';
import { AuditLogService } from './AuditLogService.js';
import { ConflictError, NotFoundError } from '../errors/AppError.js';
import { isPgError } from '../errors/pgErrors.js';

export class ShiftService {
  constructor(shiftRepository = new ShiftRepository(), auditLogService = new AuditLogService()) {
    this.shifts = shiftRepository;
    this.audit = auditLogService;
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

  // RN-11: abertura e fechamento de turno ficam na trilha de auditoria.
  #record(user, shift, action, db) {
    return this.audit.record(
      { userId: user.id, shiftId: shift.id, action, entity: 'shift', entityId: shift.id },
      db
    );
  }
}
