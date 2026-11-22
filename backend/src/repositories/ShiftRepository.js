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

  transaction(callback) {
    return this.database.withTransaction(callback);
  }

  // RN-14: `countedAt` diz ao caixa se a contagem cega já foi feita (sem revelar valores).
  async findActive(db = this.database) {
    const { rows } = await db.query(
      `SELECT s.id, s.status, s.opened_at, s.closed_at,
              (SELECT MAX(sc.counted_at) FROM shift_counts sc WHERE sc.shift_id = s.id) AS counted_at
       FROM shifts s
       WHERE s.status = 'open'
       LIMIT 1`
    );
    const row = rows[0];
    return row ? { ...toShift(row), countedAt: row.counted_at } : null;
  }

  async open(userId, db = this.database) {
    const { rows } = await db.query(
      `INSERT INTO shifts (opened_by)
       VALUES ($1)
       RETURNING id, status, opened_at, closed_at`,
      [userId]
    );
    return toShift(rows[0]);
  }

  async hasActiveOrders(shiftId, db = this.database) {
    const { rows } = await db.query(
      `SELECT 1 FROM orders
       WHERE shift_id = $1 AND status IN ('open', 'in_kitchen', 'ready_to_pay')
       LIMIT 1`,
      [shiftId]
    );
    return rows.length > 0;
  }

  // Só encerra se o turno estiver aberto e sem pedidos ativos (RN-02).
  // RN-14: grava quem encerrou e o motivo das diferenças da conferência.
  async close(id, { closedBy, note = null }, db = this.database) {
    const { rows } = await db.query(
      `UPDATE shifts
       SET status = 'closed', closed_at = CURRENT_TIMESTAMP, closed_by = $2, closing_note = $3
       WHERE id = $1 AND status = 'open'
         AND NOT EXISTS (
           SELECT 1 FROM orders
           WHERE shift_id = $1 AND status IN ('open', 'in_kitchen', 'ready_to_pay')
         )
       RETURNING id, status, opened_at, closed_at`,
      [id, closedBy, note]
    );
    return toShift(rows[0]) ?? null;
  }

  async findById(id, { lock = false } = {}, db = this.database) {
    const { rows } = await db.query(
      `SELECT id, status, opened_at, closed_at
       FROM shifts
       WHERE id = $1
       ${lock ? 'FOR UPDATE' : ''}`,
      [id]
    );
    return toShift(rows[0]) ?? null;
  }
}
