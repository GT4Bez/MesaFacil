import { DatabaseConnection } from '../database/DatabaseConnection.js';
import { ACTIVE_ORDER_STATUSES } from './OrderRepository.js';

export class KitchenRepository {
  constructor(database = DatabaseConnection.getInstance()) {
    this.database = database;
  }

  // Itens na fila da cozinha (sent/preparing) de pedidos ativos, do envio mais antigo para o mais novo.
  async findQueueItems() {
    const { rows } = await this.database.query(
      `SELECT oi.id, oi.order_id, t.number AS table_number, m.name, oi.quantity, oi.notes,
              oi.status, oi.sent_at
       FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       JOIN tables t ON t.id = o.table_id
       JOIN menu_items m ON m.id = oi.menu_item_id
       WHERE oi.status IN ('sent', 'preparing')
         AND o.status = ANY($1)
       ORDER BY oi.sent_at, oi.id`,
      [ACTIVE_ORDER_STATUSES]
    );
    return rows.map((row) => ({
      id: String(row.id),
      orderId: String(row.order_id),
      tableNumber: row.table_number,
      name: row.name,
      quantity: row.quantity,
      notes: row.notes,
      status: row.status,
      sentAt: row.sent_at
    }));
  }
}
