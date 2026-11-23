import { DatabaseConnection } from '../database/DatabaseConnection.js';

const str = (value) => (value === null || value === undefined ? null : String(value));

// Spec 017: resumo do alvo resolvido na mesma consulta; o registro aparece mesmo se o alvo mudou.
function toTarget(row) {
  switch (row.entity) {
    case 'order':
      return { orderId: str(row.order_id ?? row.entity_id), tableNumber: row.table_number };
    case 'order_item':
      return { orderId: str(row.order_id), tableNumber: row.table_number, menuItem: row.item_menu_name };
    case 'menu_item':
      return { name: row.menu_item_name };
    case 'ingredient':
      return { name: row.ingredient_name, unit: row.ingredient_unit };
    case 'user':
      return { name: row.target_user_name, role: row.target_user_role };
    default:
      return null;
  }
}

// RN-20 (spec 017): leitura da trilha de auditoria (a escrita continua no AuditLogService).
export class AuditLogRepository {
  constructor(database = DatabaseConnection.getInstance()) {
    this.database = database;
  }

  // Do mais recente para o mais antigo; `actions` já vem filtrado pelo papel de quem consulta.
  async findEntries({ actions, userId = null, shiftId = null, from = null, to = null, before = null, limit }) {
    const { rows } = await this.database.query(
      `SELECT a.id, a.action, a.created_at, a.shift_id, a.entity, a.entity_id, a.details,
              u.id AS user_id, u.name AS user_name, u.role AS user_role,
              o.id AS order_id, t.number AS table_number, oim.name AS item_menu_name,
              mi.name AS menu_item_name, ing.name AS ingredient_name, ing.unit AS ingredient_unit,
              tu.name AS target_user_name, tu.role AS target_user_role
       FROM audit_logs a
       JOIN users u ON u.id = a.user_id
       LEFT JOIN order_items oi ON a.entity = 'order_item' AND oi.id = a.entity_id
       LEFT JOIN orders o ON o.id = CASE a.entity WHEN 'order' THEN a.entity_id WHEN 'order_item' THEN oi.order_id END
       LEFT JOIN tables t ON t.id = o.table_id
       LEFT JOIN menu_items oim ON oim.id = oi.menu_item_id
       LEFT JOIN menu_items mi ON a.entity = 'menu_item' AND mi.id = a.entity_id
       LEFT JOIN ingredients ing ON a.entity = 'ingredient' AND ing.id = a.entity_id
       LEFT JOIN users tu ON a.entity = 'user' AND tu.id = a.entity_id
       WHERE a.action = ANY($1::text[])
         AND ($2::bigint IS NULL OR a.user_id = $2)
         AND ($3::bigint IS NULL OR a.shift_id = $3)
         AND ($4::timestamptz IS NULL OR a.created_at >= $4)
         AND ($5::timestamptz IS NULL OR a.created_at < $5)
         AND ($6::bigint IS NULL OR a.id < $6)
       ORDER BY a.id DESC
       LIMIT $7`,
      [actions, userId, shiftId, from, to, before, limit]
    );
    return rows.map((row) => ({
      id: String(row.id),
      action: row.action,
      createdAt: row.created_at,
      shiftId: str(row.shift_id),
      user: { id: String(row.user_id), name: row.user_name, role: row.user_role },
      entity: row.entity,
      entityId: String(row.entity_id),
      details: row.details,
      target: toTarget(row)
    }));
  }

  // Quem tem ao menos um registro visível, para o filtro "Quem fez".
  async findActors(actions) {
    const { rows } = await this.database.query(
      `SELECT u.id, u.name, u.role, u.active
       FROM users u
       WHERE EXISTS (SELECT 1 FROM audit_logs a WHERE a.user_id = u.id AND a.action = ANY($1::text[]))
       ORDER BY lower(u.name), u.id`,
      [actions]
    );
    return rows.map((row) => ({ id: String(row.id), name: row.name, role: row.role, active: row.active }));
  }
}
