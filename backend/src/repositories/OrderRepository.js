import { DatabaseConnection } from '../database/DatabaseConnection.js';

export const ACTIVE_ORDER_STATUSES = ['open', 'in_kitchen', 'ready_to_pay'];

const toItem = (row) => ({
  id: String(row.id),
  orderId: String(row.order_id),
  menuItemId: String(row.menu_item_id),
  name: row.name,
  quantity: row.quantity,
  unitPrice: Number(row.unit_price),
  notes: row.notes,
  status: row.status
});

// Os métodos aceitam `db` para rodar dentro de uma transação (client do pool).
export class OrderRepository {
  constructor(database = DatabaseConnection.getInstance()) {
    this.database = database;
  }

  transaction(callback) {
    return this.database.withTransaction(callback);
  }

  async findOpenShiftId(db = this.database) {
    const { rows } = await db.query(
      `SELECT id FROM shifts WHERE status = 'open' LIMIT 1 FOR SHARE`
    );
    return rows[0]?.id ?? null;
  }

  async tableExists(tableId, db = this.database) {
    const { rows } = await db.query(`SELECT 1 FROM tables WHERE id = $1`, [tableId]);
    return rows.length > 0;
  }

  async create({ tableId, shiftId, userId }, db = this.database) {
    const { rows } = await db.query(
      `INSERT INTO orders (table_id, shift_id, user_id)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [tableId, shiftId, userId]
    );
    return String(rows[0].id);
  }

  async setTableStatus(tableId, status, db = this.database) {
    await db.query(`UPDATE tables SET status = $2 WHERE id = $1`, [tableId, status]);
  }

  // `lock` trava a linha do pedido até o fim da transação (evita corrida entre ações).
  async findById(id, { lock = false } = {}, db = this.database) {
    const { rows } = await db.query(
      `SELECT o.id, o.table_id, o.shift_id, o.status, o.service_tax, o.created_at, t.number AS table_number,
              o.cancellation_reason, o.canceled_by, cu.name AS canceled_by_name
       FROM orders o
       JOIN tables t ON t.id = o.table_id
       LEFT JOIN users cu ON cu.id = o.canceled_by
       WHERE o.id = $1
       ${lock ? 'FOR UPDATE OF o' : ''}`,
      [id]
    );
    const row = rows[0];
    return row && {
      id: String(row.id),
      tableId: String(row.table_id),
      shiftId: String(row.shift_id),
      status: row.status,
      serviceTax: Boolean(row.service_tax),
      createdAt: row.created_at,
      table: { number: row.table_number },
      cancellation: row.canceled_by
        ? {
            reason: row.cancellation_reason,
            canceledBy: { id: String(row.canceled_by), name: row.canceled_by_name }
          }
        : null
    };
  }

  async findItems(orderId, db = this.database) {
    const { rows } = await db.query(
      `SELECT oi.id, oi.order_id, oi.menu_item_id, m.name, oi.quantity, oi.unit_price,
              oi.notes, oi.status
       FROM order_items oi
       JOIN menu_items m ON m.id = oi.menu_item_id
       WHERE oi.order_id = $1
       ORDER BY oi.id`,
      [orderId]
    );
    return rows.map(toItem);
  }

  async updateStatus(id, status, db = this.database) {
    await db.query(`UPDATE orders SET status = $2 WHERE id = $1`, [id, status]);
  }

  async updateServiceTax(id, enabled, db = this.database) {
    await db.query(`UPDATE orders SET service_tax = $2 WHERE id = $1`, [id, enabled]);
  }

  async addItem({ orderId, menuItemId, quantity, unitPrice, notes }, db = this.database) {
    const { rows } = await db.query(
      `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [orderId, menuItemId, quantity, unitPrice, notes]
    );
    return String(rows[0].id);
  }

  async findItemById(id, db = this.database) {
    const { rows } = await db.query(
      `SELECT oi.id, oi.order_id, oi.menu_item_id, m.name, oi.quantity, oi.unit_price,
              oi.notes, oi.status
       FROM order_items oi
       JOIN menu_items m ON m.id = oi.menu_item_id
       WHERE oi.id = $1`,
      [id]
    );
    return rows[0] ? toItem(rows[0]) : null;
  }

  async updateItemQuantity(id, quantity, db = this.database) {
    await db.query(`UPDATE order_items SET quantity = $2 WHERE id = $1`, [id, quantity]);
  }

  async updateItemStatus(id, status, db = this.database) {
    await db.query(`UPDATE order_items SET status = $2 WHERE id = $1`, [id, status]);
  }

  async cancelItem(id, { canceledBy = null, reason = null } = {}, db = this.database) {
    await db.query(
      `UPDATE order_items
       SET status = 'canceled', canceled_by = $2, cancellation_reason = $3
       WHERE id = $1`,
      [id, canceledBy, reason]
    );
  }

  // RN-11: cancela o pedido e todos os itens ainda ativos com o mesmo responsável e motivo.
  async cancelOrder(id, { canceledBy, reason }, db = this.database) {
    await db.query(
      `UPDATE order_items
       SET status = 'canceled', canceled_by = $2, cancellation_reason = $3
       WHERE order_id = $1 AND status <> 'canceled'`,
      [id, canceledBy, reason]
    );
    await db.query(
      `UPDATE orders
       SET status = 'canceled', canceled_by = $2, cancellation_reason = $3
       WHERE id = $1`,
      [id, canceledBy, reason]
    );
  }

  async sendPendingItems(orderId, db = this.database) {
    await db.query(
      `UPDATE order_items
       SET status = 'sent', sent_at = CURRENT_TIMESTAMP
       WHERE order_id = $1 AND status = 'pending'`,
      [orderId]
    );
  }

  async findPayments(orderId, db = this.database) {
    const { rows } = await db.query(
      `SELECT id, amount, change_amount, payment_method, created_at
       FROM payments
       WHERE order_id = $1
       ORDER BY id`,
      [orderId]
    );
    return rows.map((row) => ({
      id: String(row.id),
      amount: Number(row.amount),
      changeAmount: Number(row.change_amount),
      method: row.payment_method,
      createdAt: row.created_at
    }));
  }

  async addPayment({ orderId, amount, changeAmount = 0, method }, db = this.database) {
    const { rows } = await db.query(
      `INSERT INTO payments (order_id, amount, change_amount, payment_method)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [orderId, amount, changeAmount, method]
    );
    return String(rows[0].id);
  }
}
