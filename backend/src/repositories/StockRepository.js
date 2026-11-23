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

// Specs 016 e 018: filtros opcionais do histórico sobre o alias da tabela; acrescenta os valores em `params`.
function movementFilters({ type = null, from = null, to = null, shiftId = null } = {}, params, alias) {
  const where = [];
  if (type !== null) where.push(`${alias}.type = $${params.push(type)}`);
  if (from !== null) where.push(`${alias}.created_at >= $${params.push(from)}`);
  if (to !== null) where.push(`${alias}.created_at < $${params.push(to)}`);
  if (shiftId !== null) where.push(`${alias}.shift_id = $${params.push(shiftId)}`);
  return where;
}

// RN-15 (spec 009): insumos, ficha técnica e movimentos de estoque.
export class StockRepository {
  constructor(database = DatabaseConnection.getInstance()) {
    this.database = database;
  }

  transaction(callback) {
    return this.database.withTransaction(callback);
  }

  // Leitura num snapshot único (spec 016): saldo acumulado e `consistent` olham o mesmo estado.
  snapshot(callback) {
    return this.database.withTransaction(async (db) => {
      await db.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      return callback(db);
    });
  }

  // Specs 016 e 018: histórico do insumo. O saldo depois de cada movimento é a soma acumulada de
  // TODOS os movimentos, calculada antes do filtro e do cursor. `order: 'asc'` atende a exportação CSV.
  async findMovements(ingredientId, { limit, before = null, order = 'desc', ...filters }, db = this.database) {
    const params = [ingredientId];
    const where = movementFilters(filters, params, 'h');
    if (before !== null) where.push(`h.id < $${params.push(before)}`);
    const { rows } = await db.query(
      `WITH history AS (
         SELECT sm.*, SUM(sm.quantity) OVER (ORDER BY sm.id) AS balance_after
         FROM stock_movements sm
         WHERE sm.ingredient_id = $1
       )
       SELECT h.id, h.type, h.quantity, h.unit_cost, h.balance_after, h.created_at, h.reason, h.shift_id,
              u.name AS by, oi.order_id, oi.quantity AS item_quantity, t.number AS table_number, mi.name AS menu_item
       FROM history h
       JOIN users u ON u.id = h.user_id
       LEFT JOIN order_items oi ON oi.id = h.order_item_id
       LEFT JOIN orders o ON o.id = oi.order_id
       LEFT JOIN tables t ON t.id = o.table_id
       LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY h.id ${order === 'asc' ? 'ASC' : 'DESC'}
       LIMIT $${params.push(limit)}`,
      params
    );
    return rows.map((row) => ({
      id: String(row.id),
      type: row.type,
      quantity: Number(row.quantity),
      unitCost: Number(row.unit_cost),
      balanceAfter: Number(row.balance_after),
      createdAt: row.created_at,
      by: row.by,
      reason: row.reason,
      shiftId: row.shift_id === null ? null : String(row.shift_id),
      sale: row.order_id === null ? null : {
        orderId: String(row.order_id),
        tableNumber: row.table_number,
        menuItem: row.menu_item,
        itemQuantity: row.item_quantity
      }
    }));
  }

  // Spec 018: resumo do recorte inteiro, não só da página.
  async summarizeMovements(ingredientId, filters, db = this.database) {
    const params = [ingredientId];
    const where = movementFilters(filters, params, 'sm');
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS count,
              COALESCE(SUM(sm.quantity) FILTER (WHERE sm.quantity > 0), 0) AS inflow,
              COALESCE(SUM(sm.quantity) FILTER (WHERE sm.quantity < 0), 0) AS outflow
       FROM stock_movements sm
       WHERE ${['sm.ingredient_id = $1', ...where].join(' AND ')}`,
      params
    );
    const inflow = Number(rows[0].inflow);
    const outflow = Number(rows[0].outflow);
    return { count: rows[0].count, in: inflow, out: outflow, net: Math.round((inflow + outflow) * 1000) / 1000 };
  }

  // Spec 016: o estoque bate com a soma de todos os movimentos (insumo sem movimentos: 0 = 0).
  async isConsistent(ingredientId, db = this.database) {
    const { rows } = await db.query(
      `SELECT i.stock_quantity = COALESCE((SELECT SUM(quantity) FROM stock_movements WHERE ingredient_id = i.id), 0)
                AS consistent
       FROM ingredients i
       WHERE i.id = $1`,
      [ingredientId]
    );
    return rows[0]?.consistent ?? null;
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

  // RN-15 (regra 3): baixa dos itens enviados à cozinha, na transação do envio. O consumo é lido
  // uma vez; os insumos dessa lista fixa são travados em ordem de id (envios simultâneos não entram
  // em deadlock) e só eles são baixados, mesmo que uma ficha mude no meio do caminho.
  async recordSales({ orderItemIds, shiftId, userId }, db = this.database) {
    if (!orderItemIds.length) return;
    const { rows: consumption } = await db.query(
      `SELECT oi.id AS order_item_id, r.ingredient_id, -(oi.quantity * r.quantity) AS quantity
       FROM order_items oi
       JOIN menu_item_recipes r ON r.menu_item_id = oi.menu_item_id
       WHERE oi.id = ANY($1::bigint[])`,
      [orderItemIds]
    );
    if (!consumption.length) return;
    const ingredientIds = [...new Set(consumption.map((row) => String(row.ingredient_id)))];
    const locked = await this.lockIngredients(ingredientIds, 'UPDATE', db);
    const costs = new Map(locked.map((row) => [row.id, row.unitCost]));

    await db.query(
      `INSERT INTO stock_movements (ingredient_id, type, quantity, unit_cost, order_item_id, shift_id, user_id)
       SELECT t.ingredient_id, 'sale', t.quantity, t.unit_cost, t.order_item_id, $5, $6
       FROM unnest($1::bigint[], $2::numeric[], $3::numeric[], $4::bigint[])
         AS t(ingredient_id, quantity, unit_cost, order_item_id)`,
      [
        consumption.map((row) => row.ingredient_id),
        consumption.map((row) => row.quantity),
        consumption.map((row) => costs.get(String(row.ingredient_id))),
        consumption.map((row) => row.order_item_id),
        shiftId,
        userId
      ]
    );
    await db.query(
      `UPDATE ingredients i
       SET stock_quantity = i.stock_quantity + totals.quantity
       FROM (
         SELECT t.ingredient_id, SUM(t.quantity) AS quantity
         FROM unnest($1::bigint[], $2::numeric[]) AS t(ingredient_id, quantity)
         GROUP BY t.ingredient_id
       ) totals
       WHERE i.id = totals.ingredient_id`,
      [consumption.map((row) => row.ingredient_id), consumption.map((row) => row.quantity)]
    );
  }

  // Trava os insumos em ordem de id (FOR UPDATE ou FOR SHARE), sempre na mesma ordem.
  async lockIngredients(ids, mode, db = this.database) {
    if (!ids.length) return [];
    const { rows } = await db.query(
      `SELECT ${INGREDIENT_COLUMNS} FROM ingredients
       WHERE id = ANY($1::bigint[])
       ORDER BY id
       FOR ${mode === 'SHARE' ? 'SHARE' : 'UPDATE'}`,
      [ids]
    );
    return rows.map(toIngredient);
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
