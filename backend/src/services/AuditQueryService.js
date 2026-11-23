import { AuditLogRepository } from '../repositories/AuditLogRepository.js';
import { AUDIT_CATEGORIES, ADMIN_ONLY_CATEGORIES, visibleActions } from '../domain/auditCategories.js';
import { parseDateRange, parseId, parseLimit } from '../domain/query.js';
import { DomainValidationError, ForbiddenError } from '../errors/AppError.js';

const DEFAULT_PAGE = 50;
const MAX_PAGE = 100;

// RN-20 (spec 017): consulta da trilha de auditoria, só leitura.
export class AuditQueryService {
  constructor(repository = new AuditLogRepository()) {
    this.repository = repository;
  }

  async list(query = {}, user) {
    const isAdmin = user.role === 'admin';
    const category = this.#category(query.category, isAdmin);
    const limit = parseLimit(query.limit, { fallback: DEFAULT_PAGE, max: MAX_PAGE });
    const filters = {
      actions: visibleActions({ isAdmin, category }),
      before: parseId(query.before, 'before'),
      userId: parseId(query.userId, 'userId'),
      shiftId: parseId(query.shiftId, 'shiftId'),
      ...parseDateRange(query)
    };
    // Um a mais para saber se há próxima página.
    const page = await this.repository.findEntries({ ...filters, limit: limit + 1 });
    const entries = page.slice(0, limit);
    return { entries, nextBefore: page.length > limit ? entries.at(-1).id : null };
  }

  async actors(user) {
    return { actors: await this.repository.findActors(visibleActions({ isAdmin: user.role === 'admin' })) };
  }

  #category(value, isAdmin) {
    if (value === undefined) return null;
    if (typeof value !== 'string' || !Object.hasOwn(AUDIT_CATEGORIES, value)) {
      throw new DomainValidationError(`category inválida: use ${Object.keys(AUDIT_CATEGORIES).join(', ')}.`);
    }
    if (!isAdmin && ADMIN_ONLY_CATEGORIES.includes(value)) {
      throw new ForbiddenError('Só o admin consulta a administração de usuários.');
    }
    return value;
  }
}
