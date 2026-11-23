import { DatabaseConnection } from '../database/DatabaseConnection.js';

export class TableRepository {
  constructor(database = DatabaseConnection.getInstance()) {
    this.database = database;
  }

  // Status derivado do pedido ativo, para não depender de tables.status estar sincronizado.
  // activeOrderId vem do pedido ativo da mesa (no máximo um, garantido pelo índice da RN-01).
  async findAll() {
    const { rows } = await this.database.query(
      `SELECT t.id, t.number, o.id AS active_order_id, o.status AS order_status
       FROM tables t
       LEFT JOIN orders o
         ON o.table_id = t.id AND o.status IN ('open', 'in_kitchen', 'ready_to_pay')
       ORDER BY t.number`
    );
    return rows.map((row) => ({
      id: String(row.id),
      number: row.number,
      status: row.active_order_id == null ? 'available' : 'occupied',
      activeOrderId: row.active_order_id == null ? null : String(row.active_order_id),
      // Spec 019: o status do pedido ativo (ex.: ready_to_pay vira "Aguardando pagamento" na tela).
      orderStatus: row.order_status ?? null
    }));
  }
}
