import { DatabaseConnection } from '../database/DatabaseConnection.js';

const COLUMNS = 'id, name, category, price, available';

const toMenuItem = (row) => row && {
  id: String(row.id),
  name: row.name,
  category: row.category,
  price: Number(row.price),
  available: row.available
};

export class MenuItemRepository {
  constructor(database = DatabaseConnection.getInstance()) {
    this.database = database;
  }

  transaction(callback) {
    return this.database.withTransaction(callback);
  }

  // RN-09: itens com available = false saem das novas listagens.
  async findAvailable() {
    const { rows } = await this.database.query(
      `SELECT ${COLUMNS} FROM menu_items WHERE available ORDER BY category, name`
    );
    // Contrato do salão: sem o campo `available` (todos são disponíveis).
    return rows.map(toMenuItem).map(({ available, ...item }) => item);
  }

  async findAll() {
    const { rows } = await this.database.query(
      `SELECT ${COLUMNS} FROM menu_items ORDER BY category, name`
    );
    return rows.map(toMenuItem);
  }

  async findCategories() {
    const { rows } = await this.database.query(
      `SELECT DISTINCT category FROM menu_items ORDER BY category`
    );
    return rows.map((row) => row.category);
  }

  // `lock` trava a linha até o fim da transação (usado ao alterar o item).
  async findById(id, { lock = false } = {}, db = this.database) {
    const { rows } = await db.query(
      `SELECT ${COLUMNS} FROM menu_items WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`,
      [id]
    );
    return toMenuItem(rows[0]) ?? null;
  }

  async findAvailableById(id, db = this.database) {
    const { rows } = await db.query(
      `SELECT id, price FROM menu_items WHERE id = $1 AND available`,
      [id]
    );
    return rows[0] ?? null;
  }

  async create({ name, category, price, available }, db = this.database) {
    const { rows } = await db.query(
      `INSERT INTO menu_items (name, category, price, available)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [name, category, price, available]
    );
    return toMenuItem(rows[0]);
  }

  // `fields` só contém colunas já validadas pelo service (name, category, price, available).
  async update(id, fields, db = this.database) {
    const columns = Object.keys(fields);
    const assignments = columns.map((column, index) => `${column} = $${index + 2}`).join(', ');
    const { rows } = await db.query(
      `UPDATE menu_items SET ${assignments} WHERE id = $1 RETURNING ${COLUMNS}`,
      [id, ...columns.map((column) => fields[column])]
    );
    return toMenuItem(rows[0]) ?? null;
  }
}
