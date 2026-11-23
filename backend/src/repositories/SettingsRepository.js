import { DatabaseConnection } from '../database/DatabaseConnection.js';

// Spec 022: configurações do sistema (chave → valor JSON).
export class SettingsRepository {
  constructor(database = DatabaseConnection.getInstance()) {
    this.database = database;
  }

  transaction(callback) {
    return this.database.withTransaction(callback);
  }

  async findAll(db = this.database) {
    const { rows } = await db.query(
      `SELECT s.key, s.value, s.updated_at, u.name AS updated_by
       FROM settings s
       LEFT JOIN users u ON u.id = s.updated_by`
    );
    return rows;
  }

  // Trava a linha para a mudança e a auditoria verem o mesmo valor anterior.
  async findForUpdate(key, db) {
    const { rows } = await db.query(`SELECT id, value FROM settings WHERE key = $1 FOR UPDATE`, [key]);
    return rows[0] ?? null;
  }

  async upsert(key, value, userId, db) {
    const { rows } = await db.query(
      `INSERT INTO settings (key, value, updated_by, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE
         SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at
       RETURNING id`,
      [key, JSON.stringify(value), userId]
    );
    return String(rows[0].id);
  }
}
