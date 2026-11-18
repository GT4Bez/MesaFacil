import { MenuItemRepository } from '../repositories/MenuItemRepository.js';
import { ShiftRepository } from '../repositories/ShiftRepository.js';
import { AuditLogService } from './AuditLogService.js';
import { DomainValidationError, NotFoundError } from '../errors/AppError.js';

const MAX_PRICE = 99999999.99;
const TEXT_LIMITS = { name: 100, category: 50 };

const roundMoney = (value) => Math.round(value * 100) / 100;

// Valida e normaliza os campos recebidos; `partial` permite omitir campos (PATCH).
function parseMenuItem(body = {}, { partial }) {
  const fields = {};

  for (const [field, limit] of Object.entries(TEXT_LIMITS)) {
    if (body[field] === undefined && partial) continue;
    const value = typeof body[field] === 'string' ? body[field].trim() : '';
    if (!value || value.length > limit) {
      throw new DomainValidationError(`O campo ${field} deve ter entre 1 e ${limit} caracteres.`);
    }
    fields[field] = value;
  }

  if (body.price !== undefined || !partial) {
    const { price } = body;
    if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > MAX_PRICE) {
      throw new DomainValidationError('Preço inválido.');
    }
    fields.price = roundMoney(price);
  }

  if (body.available !== undefined) {
    if (typeof body.available !== 'boolean') throw new DomainValidationError('Disponibilidade inválida.');
    fields.available = body.available;
  } else if (!partial) {
    fields.available = true;
  }

  return fields;
}

export class MenuItemService {
  constructor(
    menuItemRepository = new MenuItemRepository(),
    shiftRepository = new ShiftRepository(),
    auditLogService = new AuditLogService()
  ) {
    this.menuItems = menuItemRepository;
    this.shifts = shiftRepository;
    this.audit = auditLogService;
  }

  list({ all = false } = {}) {
    return all ? this.menuItems.findAll() : this.menuItems.findAvailable();
  }

  listCategories() {
    return this.menuItems.findCategories();
  }

  create(body) {
    return this.menuItems.create(parseMenuItem(body, { partial: false }));
  }

  // Não existe exclusão: o item sai de linha com available = false (RN-09 preserva o histórico).
  async update(id, body, user) {
    const fields = parseMenuItem(body, { partial: true });
    if (Object.keys(fields).length === 0) {
      throw new DomainValidationError('Informe ao menos um campo para atualizar.');
    }

    return this.menuItems.transaction(async (db) => {
      const current = await this.menuItems.findById(id, { lock: true }, db);
      if (!current) throw new NotFoundError('Item do cardápio não encontrado.');
      const updated = await this.menuItems.update(id, fields, db);

      // RN-11: mudança de preço fica na auditoria, ligada ao turno aberto (se houver).
      if (updated.price !== current.price) {
        const shift = await this.shifts.findActive(db);
        await this.audit.record(
          {
            userId: user.id,
            shiftId: shift?.id ?? null,
            action: 'menu_item.price_changed',
            entity: 'menu_item',
            entityId: updated.id,
            details: { from: current.price, to: updated.price }
          },
          db
        );
      }
      return updated;
    });
  }
}
