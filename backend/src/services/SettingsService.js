import { SettingsRepository } from '../repositories/SettingsRepository.js';
import { AuditLogService } from './AuditLogService.js';
import { DomainValidationError } from '../errors/AppError.js';

// Spec 022: cada configuração tem chave no banco, nome na API, padrão e validação.
const DEFINITIONS = {
  maxItemQuantityPerLaunch: {
    key: 'max_item_quantity_per_launch',
    fallback: 10,
    parse(value) {
      if (!Number.isInteger(value) || value < 1 || value > 99) {
        throw new DomainValidationError(
          'O máximo de unidades iguais por lançamento deve ser um número inteiro de 1 a 99.'
        );
      }
      return value;
    }
  }
};
const BY_KEY = Object.fromEntries(Object.entries(DEFINITIONS).map(([name, def]) => [def.key, name]));

export class SettingsService {
  constructor(repository = new SettingsRepository(), auditLogService = new AuditLogService()) {
    this.repository = repository;
    this.audit = auditLogService;
  }

  // `{ maxItemQuantityPerLaunch, updatedAt, updatedBy }`; sem linha no banco, vale o padrão.
  async get(db) {
    const settings = Object.fromEntries(Object.entries(DEFINITIONS).map(([name, def]) => [name, def.fallback]));
    let updatedAt = null;
    let updatedBy = null;
    for (const row of await this.repository.findAll(db)) {
      const name = BY_KEY[row.key];
      if (!name) continue;
      settings[name] = row.value;
      if (!updatedAt || row.updated_at > updatedAt) {
        updatedAt = row.updated_at;
        updatedBy = row.updated_by;
      }
    }
    return { ...settings, updatedAt, updatedBy };
  }

  async maxItemQuantityPerLaunch(db) {
    return (await this.get(db)).maxItemQuantityPerLaunch;
  }

  // RN-21: só o admin chega aqui (rota). Cada mudança vai para a auditoria na mesma transação.
  async update(body = {}, user) {
    const changes = Object.entries(body ?? {}).filter(([name]) => Object.hasOwn(DEFINITIONS, name));
    if (changes.length === 0) {
      throw new DomainValidationError(
        `Informe ao menos uma configuração: ${Object.keys(DEFINITIONS).join(', ')}.`
      );
    }
    const parsed = changes.map(([name, value]) => [name, DEFINITIONS[name].parse(value)]);

    return this.repository.transaction(async (db) => {
      for (const [name, value] of parsed) {
        const { key, fallback } = DEFINITIONS[name];
        const current = await this.repository.findForUpdate(key, db);
        const from = current ? current.value : fallback;
        if (from === value) continue;
        const id = await this.repository.upsert(key, value, user.id, db);
        await this.audit.record(
          { userId: user.id, action: 'setting.updated', entity: 'setting', entityId: id, details: { key, from, to: value } },
          db
        );
      }
      return this.get(db);
    });
  }
}
