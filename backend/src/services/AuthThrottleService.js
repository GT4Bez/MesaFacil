import { AuthThrottleRepository } from '../repositories/AuthThrottleRepository.js';
import { AuditLogService } from './AuditLogService.js';
import { TooManyAttemptsError } from '../errors/AppError.js';

// RN-19 (spec 015): 5 falhas seguidas em 15 minutos bloqueiam a chave por 15 minutos.
export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;

const LOCK_ACTIONS = {
  login: 'auth.login_locked',
  approval: 'auth.approval_locked',
  password_change: 'auth.password_change_locked'
};

export const tooManyAttemptsMessage = (minutes) =>
  `Muitas tentativas. Tente novamente em ${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}.`;

export class AuthThrottleService {
  constructor(throttleRepository = new AuthThrottleRepository(), auditLogService = new AuditLogService()) {
    this.throttles = throttleRepository;
    this.audit = auditLogService;
  }

  // Chamado antes de qualquer bcrypt: chave bloqueada nem confere a senha.
  async assertNotLocked(scope, key) {
    const minutes = await this.throttles.lockedMinutes(scope, String(key));
    if (minutes !== null) throw new TooManyAttemptsError(tooManyAttemptsMessage(minutes));
  }

  // Transação própria: a falha e a auditoria do bloqueio ficam gravadas mesmo que a operação
  // que conferiu a senha sofra rollback. `userId` nulo (e-mail inexistente) não audita.
  async registerFailure(scope, key, { userId = null, details = {} } = {}) {
    await this.throttles.transaction(async (db) => {
      const { lockedNow } = await this.throttles.registerFailure(
        scope,
        String(key),
        { maxFailures: MAX_FAILURES, minutes: LOCK_MINUTES },
        db
      );
      if (lockedNow && userId) {
        await this.audit.record(
          { userId, action: LOCK_ACTIONS[scope], entity: 'user', entityId: userId, details },
          db
        );
      }
    });
  }

  reset(scope, key) {
    return this.throttles.reset(scope, String(key));
  }

  resetUser(userId, db) {
    return this.throttles.resetUser(userId, db);
  }
}
