import { DatabaseConnection } from '../database/DatabaseConnection.js';

export class TableRepository {
  constructor(database = DatabaseConnection.getInstance()) {
    this.database = database;
  }

  // activeOrderId vem do pedido ativo da mesa (no máximo um, garantido pelo índice da RN-01).
  async findAll() {
    const { rows } = await this.database.query(
      `SELECT t.id, t.number, t.status, o.id AS active_order_id
       FROM tables t
       LEFT JOIN orders o
         ON o.table_id = t.id AND o.status IN ('open', 'in_kitchen', 'ready_to_pay')
       ORDER BY t.number`
    );
    return rows.map((row) => ({
      id: String(row.id),
      number: row.number,
      status: row.status,
      activeOrderId: row.active_order_id == null ? null : String(row.active_order_id)
    }));
  }
}
