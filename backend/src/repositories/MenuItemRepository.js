import { DatabaseConnection } from '../database/DatabaseConnection.js';

export class MenuItemRepository {
  constructor(database = DatabaseConnection.getInstance()) {
    this.database = database;
  }

  // RN-09: itens com available = false saem das novas listagens.
  async findAvailable() {
    const { rows } = await this.database.query(
      `SELECT id, name, category, price
       FROM menu_items
       WHERE available
       ORDER BY category, name`
    );
    return rows.map((row) => ({
      id: String(row.id),
      name: row.name,
      category: row.category,
      price: Number(row.price)
    }));
  }

  async findAvailableById(id, db = this.database) {
    const { rows } = await db.query(
      `SELECT id, price FROM menu_items WHERE id = $1 AND available`,
      [id]
    );
    return rows[0] ?? null;
  }
}
