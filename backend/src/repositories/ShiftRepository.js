import { DatabaseConnection } from '../database/DatabaseConnection.js';

const toShift = (row) => row && {
  id: String(row.id),
  status: row.status,
  openedAt: row.opened_at,
  closedAt: row.closed_at
};

export class ShiftRepository {
  constructor(database = DatabaseConnection.getInstance()) {
    this.database = database;
  }

  async findActive() {
    const { rows } = await this.database.query(
      `SELECT id, status, opened_at, closed_at
       FROM shifts
       WHERE status = 'open'
       LIMIT 1`
    );
    return toShift(rows[0]) ?? null;
  }

  async open(userId) {
    const { rows } = await this.database.query(
      `INSERT INTO shifts (opened_by)
       VALUES ($1)
       RETURNING id, status, opened_at, closed_at`,
      [userId]
    );
    return toShift(rows[0]);
  }

  // Só encerra se o turno estiver aberto e sem pedidos ativos (RN-02).
  async close(id) {
    const { rows } = await this.database.query(
      `UPDATE shifts
       SET status = 'closed', closed_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = 'open'
         AND NOT EXISTS (
           SELECT 1 FROM orders
           WHERE shift_id = $1 AND status IN ('open', 'in_kitchen', 'ready_to_pay')
         )
       RETURNING id, status, opened_at, closed_at`,
      [id]
    );
    return toShift(rows[0]) ?? null;
  }

  async findById(id) {
    const { rows } = await this.database.query(
      `SELECT id, status, opened_at, closed_at FROM shifts WHERE id = $1`,
      [id]
    );
    return toShift(rows[0]) ?? null;
  }
}
