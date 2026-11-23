import { DatabaseConnection } from '../database/DatabaseConnection.js';

const toMovement = (row) => row && {
  id: String(row.id),
  type: row.type,
  amount: Number(row.amount),
  reason: row.reason,
  createdAt: row.created_at
};

// RN-13 (spec 007): fundo, sangria e reforço da gaveta de dinheiro do turno.
export class CashMovementRepository {
  constructor(database = DatabaseConnection.getInstance()) {
    this.database = database;
  }

  async create({ shiftId, userId, type, amount, reason = null, approvedBy = null }, db = this.database) {
    const { rows } = await db.query(
      `INSERT INTO cash_movements (shift_id, user_id, type, amount, reason, approved_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, type, amount, reason, created_at`,
      [shiftId, userId, type, amount, reason, approvedBy]
    );
    return toMovement(rows[0]);
  }

  async findByShift(shiftId, db = this.database) {
    const { rows } = await db.query(
      `SELECT cm.id, cm.type, cm.amount, cm.reason, cm.created_at, u.name AS by, a.name AS approved_by
       FROM cash_movements cm
       JOIN users u ON u.id = cm.user_id
       LEFT JOIN users a ON a.id = cm.approved_by
       WHERE cm.shift_id = $1
       ORDER BY cm.id`,
      [shiftId]
    );
    // RN-18: `approvedBy` é o nome de quem autorizou a sangria do caixa (ou null).
    return rows.map((row) => ({ ...toMovement(row), by: row.by, approvedBy: row.approved_by }));
  }

  // Único cálculo do dinheiro esperado na gaveta (RN-13), usado pela sangria, pelo relatório (spec 010)
  // e pela conferência cega (spec 008). Pagamentos entram líquidos de troco; turno sem fundo conta 0.
  async findCashSummary(shiftId, db = this.database) {
    const { rows } = await db.query(
      `WITH movements AS (
         SELECT
           COALESCE(SUM(amount) FILTER (WHERE type = 'opening_float'), 0) AS opening_float,
           COALESCE(SUM(amount) FILTER (WHERE type = 'withdrawal'), 0) AS withdrawals,
           COALESCE(SUM(amount) FILTER (WHERE type = 'reinforcement'), 0) AS reinforcements
         FROM cash_movements
         WHERE shift_id = $1
       ),
       cash AS (
         SELECT COALESCE(SUM(p.amount - p.change_amount), 0) AS payments
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         WHERE o.shift_id = $1 AND o.status <> 'canceled' AND p.payment_method = 'cash'
       )
       SELECT m.opening_float, cash.payments AS cash_payments, m.withdrawals, m.reinforcements,
              m.opening_float + cash.payments - m.withdrawals + m.reinforcements AS expected
       FROM movements m, cash`,
      [shiftId]
    );
    const row = rows[0];
    return {
      openingFloat: Number(row.opening_float),
      cashPayments: Number(row.cash_payments),
      withdrawals: Number(row.withdrawals),
      reinforcements: Number(row.reinforcements),
      expected: Number(row.expected)
    };
  }
}
