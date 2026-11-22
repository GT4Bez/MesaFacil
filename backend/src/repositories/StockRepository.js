import { DatabaseConnection } from '../database/DatabaseConnection.js';

const INGREDIENT_COLUMNS = 'id, name, unit, stock_quantity, min_stock, unit_cost, active';

const toIngredient = (row) => row && {
  id: String(row.id),
  name: row.name,
  unit: row.unit,
  stockQuantity: Number(row.stock_quantity),
  minStock: Number(row.min_stock),
  unitCost: Number(row.unit_cost),
  active: row.active,
  // RN-15 (regra 4): estoque abaixo do mínimo (inclusive negativo) vira alerta.
  belowMin: Number(row.stock_quantity) < Number(row.min_stock)
};

// RN-15 (spec 009): insumos, ficha técnica e movimentos de estoque.
export class StockRepository {
  constructor(database = DatabaseConnection.getInstance()) {
    this.database = database;
  }

  transaction(callback) {
    return this.database.withTransaction(callback);
  }

  async findIngredients(db = this.database) {
    const { rows } = await db.query(`SELECT ${INGREDIENT_COLUMNS} FROM ingredients ORDER BY lower(name)`);
    return rows.map(toIngredient);
  }

  async findIngredient(id, { lock = false } = {}, db = this.database) {
    const { rows } = await db.query(
      `SELECT ${INGREDIENT_COLUMNS} FROM ingredients WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`,
      [id]
    );
    return toIngredient(rows[0]) ?? null;
  }

  async createIngredient({ name, unit, minStock, unitCost, active }, db = this.database) {
    const { rows } = await db.query(
      `INSERT INTO ingredients (name, unit, min_stock, unit_cost, active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING ${INGREDIENT_COLUMNS}`,
      [name, unit, minStock, unitCost, active]
    );
    return toIngredient(rows[0]);
  }

  async updateIngredient(id, fields, db = this.database) {
    const columns = { name: 'name', minStock: 'min_stock', unitCost: 'unit_cost', active: 'active' };
    const keys = Object.keys(fields);
    const assignments = keys.map((key, index) => `${columns[key]} = $${index + 2}`).join(', ');
    const { rows } = await db.query(
      `UPDATE ingredients SET ${assignments} WHERE id = $1 RETURNING ${INGREDIENT_COLUMNS}`,
      [id, ...keys.map((key) => fields[key])]
    );
    return toIngredient(rows[0]) ?? null;
  }

  // Entrada e ajuste: grava o movimento com o custo do momento e atualiza o saldo
  // (na entrada, o custo do insumo passa a ser o da última compra, regra 6).
  async addMovement({ ingredientId, type, quantity, unitCost, userId, shiftId = null, reason = null }, db = this.database) {
    await db.query(
      `INSERT INTO stock_movements (ingredient_id, type, quantity, unit_cost, user_id, shift_id, reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [ingredientId, type, quantity, unitCost, userId, shiftId, reason]
    );
    const { rows } = await db.query(
      `UPDATE ingredients
       SET stock_quantity = stock_quantity + $2,
           unit_cost = CASE WHEN $3 = 'purchase' THEN $4 ELSE unit_cost END
       WHERE id = $1
       RETURNING ${INGREDIENT_COLUMNS}`,
      [ingredientId, quantity, type, unitCost]
    );
    return toIngredient(rows[0]);
  }

  // RN-15 (regra 3): baixa dos itens enviados à cozinha, na transação do envio. Os insumos são
  // travados em ordem de id para que envios simultâneos não entrem em deadlock.
  async recordSales({ orderItemIds, shiftId, userId }, db = this.database) {
    if (!orderItemIds.length) return;
    await db.query(
      `SELECT i.id FROM ingredients i
       WHERE i.id IN (
         SELECT r.ingredient_id FROM order_items oi
         JOIN menu_item_recipes r ON r.menu_item_id = oi.menu_item_id
         WHERE oi.id = ANY($1::bigint[])
       )
       ORDER BY i.id
       FOR UPDATE`,
      [orderItemIds]
    );
    await db.query(
      `WITH moved AS (
         INSERT INTO stock_movements (ingredient_id, type, quantity, unit_cost, order_item_id, shift_id, user_id)
         SELECT r.ingredient_id, 'sale', -(oi.quantity * r.quantity), i.unit_cost, oi.id, $2, $3
         FROM order_items oi
         JOIN menu_item_recipes r ON r.menu_item_id = oi.menu_item_id
         JOIN ingredients i ON i.id = r.ingredient_id
         WHERE oi.id = ANY($1::bigint[])
         RETURNING ingredient_id, quantity
       )
       UPDATE ingredients i
       SET stock_quantity = i.stock_quantity + totals.quantity
       FROM (SELECT ingredient_id, SUM(quantity) AS quantity FROM moved GROUP BY ingredient_id) totals
       WHERE i.id = totals.ingredient_id`,
      [orderItemIds, shiftId, userId]
    );
  }

  async findRecipe(menuItemId, db = this.database) {
    const { rows } = await db.query(
      `SELECT r.ingredient_id, i.name, i.unit, r.quantity, i.unit_cost, i.active
       FROM menu_item_recipes r
       JOIN ingredients i ON i.id = r.ingredient_id
       WHERE r.menu_item_id = $1
       ORDER BY lower(i.name)`,
      [menuItemId]
    );
    return rows.map((row) => ({
      ingredientId: String(row.ingredient_id),
      name: row.name,
      unit: row.unit,
      quantity: Number(row.quantity),
      unitCost: Number(row.unit_cost),
      active: row.active
    }));
  }

  // A ficha é substituída inteira a cada gravação (regra 2).
  async replaceRecipe(menuItemId, items, db = this.database) {
    await db.query(`DELETE FROM menu_item_recipes WHERE menu_item_id = $1`, [menuItemId]);
    if (!items.length) return;
    await db.query(
      `INSERT INTO menu_item_recipes (menu_item_id, ingredient_id, quantity)
       SELECT $1, t.ingredient_id, t.quantity
       FROM unnest($2::bigint[], $3::numeric[]) AS t(ingredient_id, quantity)`,
      [menuItemId, items.map((item) => item.ingredientId), items.map((item) => item.quantity)]
    );
  }
}
