import { StockRepository } from '../repositories/StockRepository.js';
import { MenuItemRepository } from '../repositories/MenuItemRepository.js';
import { ShiftRepository } from '../repositories/ShiftRepository.js';
import { AuditLogService } from './AuditLogService.js';
import { ConflictError, DomainValidationError, NotFoundError } from '../errors/AppError.js';
import { isPgError } from '../errors/pgErrors.js';
import { MAX_PG_MONEY, roundMoney, toMoney } from '../domain/money.js';

const UNITS = ['un', 'kg', 'l'];
const MAX_STOCK = 999999999.999;
const MAX_RECIPE = 9999999.999;
const roundQuantity = (value) => Math.round(value * 1000) / 1000;
// Número finito arredondado a 3 casas (quantidades de estoque); qualquer outra coisa vira null.
const toQuantity = (value) =>
  typeof value === 'number' && Number.isFinite(value) ? roundQuantity(value) : null;
const cleanText = (value) => (typeof value === 'string' ? value.trim() : '');

function parseIngredient(body = {}, { partial }) {
  const fields = {};
  if (body.name !== undefined || !partial) {
    const name = cleanText(body.name);
    if (!name || name.length > 100) throw new DomainValidationError('O nome deve ter entre 1 e 100 caracteres.');
    fields.name = name;
  }
  if (!partial) {
    if (!UNITS.includes(body.unit)) throw new DomainValidationError('Unidade inválida: use un, kg ou l.');
    fields.unit = body.unit;
  } else if (body.unit !== undefined) {
    // Mudar a unidade reinterpretaria o estoque e as fichas já gravadas.
    throw new DomainValidationError('A unidade não muda depois do cadastro.');
  }
  if (body.minStock !== undefined || !partial) {
    const minStock = toQuantity(body.minStock ?? 0);
    if (minStock === null || minStock < 0 || minStock > MAX_STOCK) {
      throw new DomainValidationError('Estoque mínimo inválido (0 ou mais).');
    }
    fields.minStock = minStock;
  }
  if (body.unitCost !== undefined || !partial) {
    const unitCost = toMoney(body.unitCost ?? 0);
    if (unitCost === null || unitCost < 0 || unitCost > MAX_PG_MONEY) {
      throw new DomainValidationError('Custo unitário inválido (0 ou mais).');
    }
    fields.unitCost = unitCost;
  }
  if (body.active !== undefined || !partial) {
    const active = body.active ?? true;
    if (typeof active !== 'boolean') throw new DomainValidationError('Situação do insumo inválida.');
    fields.active = active;
  }
  return fields;
}

// RN-15 (spec 009): cadastro de insumos, entrada, ajuste e ficha técnica dos itens do cardápio.
export class IngredientService {
  constructor(
    stockRepository = new StockRepository(),
    menuItemRepository = new MenuItemRepository(),
    shiftRepository = new ShiftRepository(),
    auditLogService = new AuditLogService()
  ) {
    this.stock = stockRepository;
    this.menuItems = menuItemRepository;
    this.shifts = shiftRepository;
    this.audit = auditLogService;
  }

  list() {
    return this.stock.findIngredients();
  }

  async create(body) {
    try {
      return await this.stock.createIngredient(parseIngredient(body, { partial: false }));
    } catch (error) {
      throw this.#duplicate(error);
    }
  }

  async update(id, body) {
    const fields = parseIngredient(body, { partial: true });
    if (Object.keys(fields).length === 0) throw new DomainValidationError('Informe ao menos um campo para atualizar.');
    try {
      const updated = await this.stock.updateIngredient(id, fields);
      if (!updated) throw new NotFoundError('Insumo não encontrado.');
      return updated;
    } catch (error) {
      throw this.#duplicate(error);
    }
  }

  // Regra 6: entrada soma ao estoque e o custo do insumo passa a ser o da compra.
  async addPurchase(id, { quantity, unitCost } = {}, user) {
    const amount = toQuantity(quantity);
    if (amount === null || !(amount > 0) || amount > MAX_STOCK) {
      throw new DomainValidationError('Quantidade da entrada inválida.');
    }
    const cost = toMoney(unitCost);
    if (cost === null || cost < 0 || cost > MAX_PG_MONEY) throw new DomainValidationError('Custo unitário inválido.');

    return this.stock.transaction(async (db) => {
      await this.#lockIngredient(id, db);
      const shift = await this.shifts.findActive(db);
      return this.stock.addMovement(
        { ingredientId: id, type: 'purchase', quantity: amount, unitCost: cost, userId: user.id, shiftId: shift?.id ?? null },
        db
      );
    });
  }

  // Regra 7: o gerente informa o que contou; o sistema grava a diferença e audita.
  async addAdjustment(id, { countedQuantity, reason } = {}, user) {
    const counted = toQuantity(countedQuantity);
    if (counted === null || counted < 0 || counted > MAX_STOCK) {
      throw new DomainValidationError('Quantidade contada inválida (0 ou mais).');
    }
    const cleaned = cleanText(reason);
    if (!cleaned) throw new DomainValidationError('Informe o motivo do ajuste.');

    return this.stock.transaction(async (db) => {
      const ingredient = await this.#lockIngredient(id, db);
      const difference = roundQuantity(counted - ingredient.stockQuantity);
      if (difference === 0) throw new DomainValidationError('O estoque já está com essa quantidade.');
      const shift = await this.shifts.findActive(db);
      const updated = await this.stock.addMovement(
        {
          ingredientId: id,
          type: 'adjustment',
          quantity: difference,
          unitCost: ingredient.unitCost,
          userId: user.id,
          shiftId: shift?.id ?? null,
          reason: cleaned
        },
        db
      );
      await this.audit.record(
        {
          userId: user.id,
          shiftId: shift?.id ?? null,
          action: 'stock.adjusted',
          entity: 'ingredient',
          entityId: ingredient.id,
          details: { from: ingredient.stockQuantity, to: counted, difference, reason: cleaned }
        },
        db
      );
      return updated;
    });
  }

  // Regra 9: custo do item = Σ (quantidade da ficha × custo atual do insumo), com a margem.
  async getRecipe(menuItemId) {
    const menuItem = await this.menuItems.findById(menuItemId);
    if (!menuItem) throw new NotFoundError('Item do cardápio não encontrado.');
    return this.#withCost(menuItem, await this.stock.findRecipe(menuItem.id));
  }

  async saveRecipe(menuItemId, { items } = {}) {
    if (!Array.isArray(items)) throw new DomainValidationError('Informe a lista de insumos da ficha.');
    const parsed = items.map((item) => {
      const quantity = toQuantity(item?.quantity);
      if (quantity === null || !(quantity > 0) || quantity > MAX_RECIPE) {
        throw new DomainValidationError('Quantidade da ficha inválida (maior que 0).');
      }
      if (item?.ingredientId === undefined || item?.ingredientId === null || item.ingredientId === '') {
        throw new DomainValidationError('Informe o insumo de cada linha da ficha.');
      }
      return { ingredientId: String(item.ingredientId), quantity };
    });
    if (new Set(parsed.map((item) => item.ingredientId)).size !== parsed.length) {
      throw new DomainValidationError('A ficha não pode repetir o mesmo insumo.');
    }

    return this.stock.transaction(async (db) => {
      const menuItem = await this.menuItems.findById(menuItemId, { lock: true }, db);
      if (!menuItem) throw new NotFoundError('Item do cardápio não encontrado.');
      // FOR SHARE: uma desativação simultânea espera a ficha ser gravada (e vice-versa).
      const ingredients = await this.stock.lockIngredients(parsed.map((item) => item.ingredientId), 'SHARE', db);
      const byId = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
      // Insumo desativado que já estava na ficha pode continuar (a ficha segue editável);
      // o que não pode é incluir um insumo inativo novo.
      const current = new Set((await this.stock.findRecipe(menuItem.id, db)).map((item) => item.ingredientId));
      for (const item of parsed) {
        const ingredient = byId.get(item.ingredientId);
        if (!ingredient) throw new NotFoundError('Insumo não encontrado.');
        if (!ingredient.active && !current.has(ingredient.id)) {
          throw new ConflictError(`O insumo ${ingredient.name} está inativo.`);
        }
      }
      await this.stock.replaceRecipe(menuItem.id, parsed, db);
      return this.#withCost(menuItem, await this.stock.findRecipe(menuItem.id, db));
    });
  }

  #withCost(menuItem, recipe) {
    const items = recipe.map((item) => ({ ...item, cost: roundMoney(item.quantity * item.unitCost) }));
    // O total é a soma das linhas já arredondadas, para a tela fechar a conta linha a linha.
    const cost = roundMoney(items.reduce((sum, item) => sum + item.cost, 0));
    const margin = roundMoney(menuItem.price - cost);
    return {
      menuItemId: menuItem.id,
      price: menuItem.price,
      items,
      cost,
      margin,
      marginPercent: menuItem.price > 0 ? Math.round((margin / menuItem.price) * 1000) / 10 : null
    };
  }

  async #lockIngredient(id, db) {
    const ingredient = await this.stock.findIngredient(id, { lock: true }, db);
    if (!ingredient) throw new NotFoundError('Insumo não encontrado.');
    return ingredient;
  }

  #duplicate(error) {
    return isPgError(error, '23505', 'ingredients_name_unique_idx')
      ? new ConflictError('Já existe um insumo com esse nome.')
      : error;
  }
}
