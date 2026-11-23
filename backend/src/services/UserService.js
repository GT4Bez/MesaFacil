import bcrypt from 'bcrypt';
import { UserRepository } from '../repositories/UserRepository.js';
import { AuditLogService } from './AuditLogService.js';
import { AuthThrottleService } from './AuthThrottleService.js';
import { ROLES } from '../auth/roles.js';
import { ConflictError, DomainValidationError, NotFoundError } from '../errors/AppError.js';
import { isPgError } from '../errors/pgErrors.js';

const BCRYPT_ROUNDS = 10;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseName(value) {
  const name = typeof value === 'string' ? value.trim() : '';
  if (!name || name.length > 100) throw new DomainValidationError('O nome deve ter entre 1 e 100 caracteres.');
  return name;
}

function parseEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!EMAIL_PATTERN.test(email) || email.length > 255) throw new DomainValidationError('E-mail inválido.');
  return email;
}

function parseRole(value) {
  if (!ROLES.includes(value)) throw new DomainValidationError('Papel inválido.');
  return value;
}

// bcrypt só considera os primeiros 72 bytes, então o limite é em bytes.
function parsePassword(value) {
  if (typeof value !== 'string' || value.length < 8 || Buffer.byteLength(value) > 72) {
    throw new DomainValidationError('A senha deve ter entre 8 e 72 caracteres.');
  }
  return value;
}

function parseActive(value) {
  if (typeof value !== 'boolean') throw new DomainValidationError('Situação inválida.');
  return value;
}

const PARSERS = { name: parseName, email: parseEmail, role: parseRole, active: parseActive };

// RN-16: administração de usuários (só admin) e conta do próprio usuário.
export class UserService {
  constructor(
    userRepository = new UserRepository(),
    auditLogService = new AuditLogService(),
    authThrottleService = new AuthThrottleService()
  ) {
    this.users = userRepository;
    this.audit = auditLogService;
    this.throttle = authThrottleService;
  }

  list({ role, active } = {}) {
    const filters = {};
    if (role !== undefined) filters.role = parseRole(role);
    if (active !== undefined) {
      if (!['true', 'false'].includes(active)) throw new DomainValidationError('Filtro de situação inválido.');
      filters.active = active === 'true';
    }
    return this.users.findAll(filters);
  }

  async create(body = {}, actor) {
    const fields = {
      name: parseName(body.name),
      email: parseEmail(body.email),
      role: parseRole(body.role),
      passwordHash: await bcrypt.hash(parsePassword(body.password), BCRYPT_ROUNDS)
    };

    return this.#withUniqueEmail(() =>
      this.users.transaction(async (db) => {
        const user = await this.users.create(fields, db);
        await this.#record(actor, 'user.created', user.id, { role: user.role }, db);
        return user;
      })
    );
  }

  async update(id, body = {}, actor) {
    const fields = {};
    for (const [field, parse] of Object.entries(PARSERS)) {
      if (body[field] !== undefined) fields[field] = parse(body[field]);
    }
    if (Object.keys(fields).length === 0) {
      throw new DomainValidationError('Informe ao menos um campo para atualizar.');
    }

    return this.#withUniqueEmail(() =>
      this.users.transaction(async (db) => {
        // Trava primeiro os admins ativos e depois o alvo: ordem fixa evita deadlock.
        const activeAdminIds = await this.users.lockActiveAdminIds(db);
        const current = await this.users.findById(id, { lock: true }, db);
        if (!current) throw new NotFoundError('Usuário não encontrado.');

        const deactivating = current.active && fields.active === false;
        const demotingAdmin = current.role === 'admin' && fields.role !== undefined && fields.role !== 'admin';

        if ((deactivating || demotingAdmin) && current.id === actor.id) {
          throw new ConflictError('Você não pode desativar nem rebaixar o próprio usuário.');
        }
        if (activeAdminIds.includes(current.id) && (deactivating || demotingAdmin) && activeAdminIds.length === 1) {
          throw new ConflictError('O sistema precisa manter ao menos um administrador ativo.');
        }

        const updated = await this.users.update(
          current.id,
          fields,
          { revokeSessions: deactivating || demotingAdmin },
          db
        );

        const changes = {};
        for (const field of Object.keys(fields)) {
          if (current[field] !== updated[field]) changes[field] = { from: current[field], to: updated[field] };
        }
        if (Object.keys(changes).length > 0) {
          await this.#record(actor, 'user.updated', updated.id, { changes }, db);
        }
        return updated;
      })
    );
  }

  // O admin redefine sem saber a senha atual; os tokens anteriores do usuário deixam de valer.
  // RN-19: também desbloqueia o login e a troca de senha do usuário.
  async resetPassword(id, { password } = {}, actor) {
    const passwordHash = await bcrypt.hash(parsePassword(password), BCRYPT_ROUNDS);
    return this.users.transaction(async (db) => {
      if (!(await this.users.updatePassword(id, passwordHash, db))) {
        throw new NotFoundError('Usuário não encontrado.');
      }
      await this.throttle.resetUser(id, db);
      await this.#record(actor, 'user.password_reset', id, {}, db);
      return { id: String(id) };
    });
  }

  async me(user) {
    const found = await this.users.findById(user.id);
    if (!found) throw new NotFoundError('Usuário não encontrado.');
    return found;
  }

  // Troca da própria senha: exige a atual. Os tokens anteriores (inclusive o atual) deixam de valer.
  // RN-19: o bloqueio é conferido antes de qualquer bcrypt, e a senha atual errada conta como falha.
  async changeOwnPassword(user, { currentPassword, newPassword } = {}) {
    if (typeof currentPassword !== 'string' || !currentPassword) {
      throw new DomainValidationError('Informe a senha atual.');
    }
    await this.throttle.assertNotLocked('password_change', user.id);
    const passwordHash = await bcrypt.hash(parsePassword(newPassword), BCRYPT_ROUNDS);

    let wrongPassword = false;
    try {
      const result = await this.users.transaction(async (db) => {
        const currentHash = await this.users.findPasswordHash(user.id, db);
        if (!currentHash || !(await bcrypt.compare(currentPassword, currentHash))) {
          wrongPassword = true;
          throw new DomainValidationError('Senha atual incorreta.');
        }
        await this.users.updatePassword(user.id, passwordHash, db);
        await this.#record(user, 'user.password_changed', user.id, {}, db);
        return { id: user.id };
      });
      await this.throttle.reset('password_change', user.id);
      return result;
    } catch (error) {
      // Fora da transação da troca, que sofreu rollback: a falha precisa ficar gravada.
      if (wrongPassword) await this.throttle.registerFailure('password_change', user.id, { userId: user.id });
      throw error;
    }
  }

  async #withUniqueEmail(action) {
    try {
      return await action();
    } catch (error) {
      if (isPgError(error, '23505', 'users_email_key')) {
        throw new ConflictError('Já existe um usuário com este e-mail.');
      }
      throw error;
    }
  }

  #record(actor, action, entityId, details, db) {
    return this.audit.record({ userId: actor.id, action, entity: 'user', entityId, details }, db);
  }
}
