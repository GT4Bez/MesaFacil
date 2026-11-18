import { DatabaseConnection } from '../database/DatabaseConnection.js';

// RN-10: todas as agregações do relatório do turno são feitas no PostgreSQL.
export class ShiftReportRepository {
  constructor(database = DatabaseConnection.getInstance()) {
    this.database = database;
  }

  // Executa as consultas num snapshot único, para que os blocos do relatório sejam coerentes entre si.
  snapshot(callback) {
    return this.database.withTransaction(async (db) => {
      await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      return callback(db);
    });
  }

  async findShift(id, db = this.database) {
    const { rows } = await db.query(
      `SELECT s.id, s.status, s.opened_at, s.closed_at, u.name AS opened_by
       FROM shifts s
       JOIN users u ON u.id = s.opened_by
       WHERE s.id = $1`,
      [id]
    );
    const row = rows[0];
    return row && {
      id: String(row.id),
      status: row.status,
      openedAt: row.opened_at,
      closedAt: row.closed_at,
      openedBy: row.opened_by
    };
  }

  // Faturamento: pagamentos de pedidos não cancelados; ticket médio sobre pedidos `closed`.
  async findTotals(shiftId, db = this.database) {
    const { rows } = await db.query(
      `WITH paid AS (
         SELECT COALESCE(SUM(p.amount), 0) AS total
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         WHERE o.shift_id = $1 AND o.status <> 'canceled'
       ),
       closed AS (
         SELECT COUNT(*)::int AS orders FROM orders WHERE shift_id = $1 AND status = 'closed'
       )
       SELECT paid.total,
              closed.orders,
              COALESCE(ROUND(paid.total / NULLIF(closed.orders, 0), 2), 0) AS average_ticket
       FROM paid, closed`,
      [shiftId]
    );
    const row = rows[0];
    return {
      totalShift: Number(row.total),
      ordersClosed: row.orders,
      averageTicket: Number(row.average_ticket)
    };
  }

  // Sempre devolve cash, card e pix, nessa ordem, com 0 quando não houver pagamento.
  async findByPaymentMethod(shiftId, db = this.database) {
    const { rows } = await db.query(
      `SELECT m.method,
              COALESCE(SUM(p.amount), 0) AS total,
              COUNT(p.id)::int AS count
       FROM unnest(ARRAY['cash', 'card', 'pix']) WITH ORDINALITY AS m(method, position)
       LEFT JOIN (
         SELECT p.id, p.amount, p.payment_method
         FROM payments p
         JOIN orders o ON o.id = p.order_id
         WHERE o.shift_id = $1 AND o.status <> 'canceled'
       ) p ON p.payment_method = m.method
       GROUP BY m.method, m.position
       ORDER BY m.position`,
      [shiftId]
    );
    return rows.map((row) => ({ method: row.method, total: Number(row.total), count: row.count }));
  }

  // RN-09: vendas pelo preço congelado, só itens ativos de pedidos encerrados.
  async findByMenuItem(shiftId, db = this.database) {
    const { rows } = await db.query(
      `SELECT m.id, m.name,
              SUM(oi.quantity)::int AS quantity,
              SUM(oi.quantity * oi.unit_price) AS total
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN menu_items m ON m.id = oi.menu_item_id
       WHERE o.shift_id = $1 AND o.status = 'closed' AND oi.status <> 'canceled'
       GROUP BY m.id, m.name
       ORDER BY total DESC, m.name`,
      [shiftId]
    );
    return rows.map((row) => ({
      menuItemId: String(row.id),
      name: row.name,
      quantity: row.quantity,
      total: Number(row.total)
    }));
  }

  async findCanceledOrders(shiftId, db = this.database) {
    const { rows } = await db.query(
      `SELECT o.id, o.cancellation_reason, u.name AS canceled_by
       FROM orders o
       LEFT JOIN users u ON u.id = o.canceled_by
       WHERE o.shift_id = $1 AND o.status = 'canceled'
       ORDER BY o.id`,
      [shiftId]
    );
    return rows.map((row) => ({
      orderId: String(row.id),
      reason: row.cancellation_reason,
      by: row.canceled_by
    }));
  }

  // Cancelamentos gerenciais de itens (RN-05). Itens de pedidos cancelados já aparecem no pedido.
  async findCanceledItems(shiftId, db = this.database) {
    const { rows } = await db.query(
      `SELECT oi.id, m.name, oi.quantity, oi.cancellation_reason, u.name AS canceled_by
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN menu_items m ON m.id = oi.menu_item_id
       JOIN users u ON u.id = oi.canceled_by
       WHERE o.shift_id = $1 AND oi.status = 'canceled' AND o.status <> 'canceled'
       ORDER BY oi.id`,
      [shiftId]
    );
    return rows.map((row) => ({
      orderItemId: String(row.id),
      name: row.name,
      quantity: row.quantity,
      reason: row.cancellation_reason,
      by: row.canceled_by
    }));
  }
}
