import { OrderRepository, ACTIVE_ORDER_STATUSES } from '../repositories/OrderRepository.js';
import { MenuItemRepository } from '../repositories/MenuItemRepository.js';
import {
  BadRequestError,
  ConflictError,
  DomainValidationError,
  ForbiddenError,
  NotFoundError
} from '../errors/AppError.js';
import { isPgError } from '../errors/pgErrors.js';

const SERVICE_TAX_RATE = 0.1;
const PAYMENT_METHODS = ['cash', 'card', 'pix'];
const KITCHEN_FLOW = { sent: 'preparing', preparing: 'ready' };
const MAX_PG_INT = 2147483647;
const MAX_PG_MONEY = 99999999.99;
const ORDER_TRANSITION_ROLES = {
  in_kitchen: ['waiter', 'manager'],
  ready_to_pay: ['waiter', 'manager'],
  closed: ['cashier', 'manager'],
  canceled: ['manager']
};

const roundMoney = (value) => Math.round(value * 100) / 100;
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0 && value <= MAX_PG_INT;

export class OrderService {
  constructor(
    orderRepository = new OrderRepository(),
    menuItemRepository = new MenuItemRepository()
  ) {
    this.orders = orderRepository;
    this.menuItems = menuItemRepository;
  }

  // RN-01 e RN-02: só abre pedido com turno aberto e sem outro pedido ativo na mesa.
  async create({ tableId } = {}, user) {
    if (!tableId) throw new BadRequestError('Informe a mesa.');

    try {
      return await this.orders.transaction(async (db) => {
        if (!(await this.orders.tableExists(tableId, db))) {
          throw new NotFoundError('Mesa não encontrada.');
        }
        const shiftId = await this.orders.findOpenShiftId(db);
        if (!shiftId) throw new ConflictError('Não há turno aberto.');

        const id = await this.orders.create({ tableId, shiftId, userId: user.id }, db);
        await this.orders.setTableStatus(tableId, 'occupied', db);
        return { id };
      });
    } catch (error) {
      if (isPgError(error, '23505', 'orders_single_active_per_table_idx')) {
        throw new ConflictError('A mesa já possui um pedido aberto.');
      }
      throw error;
    }
  }

  async findById(id) {
    const order = await this.orders.findById(id);
    if (!order) throw new NotFoundError('Pedido não encontrado.');
    const items = await this.orders.findItems(id);
    return { id: order.id, status: order.status, createdAt: order.createdAt, table: order.table, items };
  }

  async addItem(orderId, { menuItemId, quantity = 1, notes } = {}) {
    if (!menuItemId) throw new BadRequestError('Informe o item do cardápio.');
    if (!isPositiveInteger(quantity)) throw new DomainValidationError('Quantidade inválida.');

    return this.orders.transaction(async (db) => {
      const order = await this.#lockOrder(orderId, db);
      if (!['open', 'in_kitchen'].includes(order.status)) {
        throw new ConflictError('Não é possível adicionar itens a este pedido.');
      }
      const menuItem = await this.menuItems.findAvailableById(menuItemId, db);
      if (!menuItem) throw new NotFoundError('Item do cardápio indisponível.');

      // RN-09: o preço é congelado no momento do lançamento.
      const id = await this.orders.addItem(
        {
          orderId,
          menuItemId,
          quantity,
          unitPrice: menuItem.price,
          notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null
        },
        db
      );
      return { id };
    });
  }

  // RN-04: depois de enviado, o item não muda mais.
  async updateItemQuantity(itemId, { quantity } = {}) {
    if (!isPositiveInteger(quantity)) throw new DomainValidationError('Quantidade inválida.');
    return this.orders.transaction(async (db) => {
      const item = await this.#lockItem(itemId, db);
      if (item.status !== 'pending') {
        throw new ConflictError('Só é possível alterar itens que ainda não foram enviados.');
      }
      await this.orders.updateItemQuantity(itemId, quantity, db);
      return { id: item.id };
    });
  }

  async updateItemStatus(itemId, { status, reason } = {}, user) {
    return this.orders.transaction(async (db) => {
      const item = await this.#lockItem(itemId, db);

      if (status === 'canceled') {
        if (item.status === 'canceled') throw new ConflictError('O item já está cancelado.');
        if (item.status !== 'pending') {
          // RN-05: item enviado só é cancelado por gerente, com motivo.
          if (user.role !== 'manager') {
            throw new ForbiddenError('Apenas o gerente pode cancelar itens já enviados.');
          }
          if (typeof reason !== 'string' || !reason.trim()) {
            throw new DomainValidationError('Informe o motivo do cancelamento.');
          }
          await this.orders.cancelItem(itemId, { canceledBy: user.id, reason: reason.trim() }, db);
        } else {
          if (!['waiter', 'manager'].includes(user.role)) {
            throw new ForbiddenError('Apenas o garçom ou gerente pode remover itens pendentes.');
          }
          await this.orders.cancelItem(itemId, {}, db);
        }
        return { id: item.id, status };
      }

      if (status === 'preparing' || status === 'ready') {
        if (!['kitchen', 'manager'].includes(user.role)) {
          throw new ForbiddenError('Apenas a cozinha pode atualizar o preparo.');
        }
        if (KITCHEN_FLOW[item.status] !== status) {
          throw new ConflictError('Transição de status do item inválida.');
        }
        await this.orders.updateItemStatus(itemId, status, db);
        return { id: item.id, status };
      }

      throw new BadRequestError('Status do item inválido.');
    });
  }

  // RN-03: máquina de estados do pedido.
  async updateStatus(orderId, { status } = {}, user) {
    const allowedRoles = ORDER_TRANSITION_ROLES[status];
    if (!allowedRoles) throw new BadRequestError('Status do pedido inválido.');
    if (!allowedRoles.includes(user.role)) {
      throw new ForbiddenError('Você não possui permissão para alterar para este status.');
    }

    return this.orders.transaction(async (db) => {
      const order = await this.#lockOrder(orderId, db);
      const items = await this.orders.findItems(orderId, db);

      switch (status) {
        case 'in_kitchen':
          if (!['open', 'in_kitchen'].includes(order.status)) throw this.#invalidTransition();
          if (!items.some((item) => item.status === 'pending')) {
            throw new ConflictError('Não há itens pendentes para enviar à cozinha.');
          }
          await this.orders.sendPendingItems(orderId, db);
          break;

        case 'ready_to_pay':
          if (order.status !== 'in_kitchen') throw this.#invalidTransition();
          // RN-06: a cozinha precisa ter terminado todos os itens.
          if (!items.every((item) => ['ready', 'canceled'].includes(item.status))) {
            throw new ConflictError('Ainda há itens em preparo na cozinha.');
          }
          break;

        case 'closed': {
          if (order.status !== 'ready_to_pay') throw this.#invalidTransition();
          // RN-07: o saldo (sem a taxa de serviço, que é opcional) precisa estar quitado.
          const payments = await this.orders.findPayments(orderId, db);
          if (this.#remaining(items, payments, false) > 0) {
            throw new ConflictError('O pedido ainda possui saldo em aberto.');
          }
          await this.orders.setTableStatus(order.tableId, 'available', db);
          break;
        }

        case 'canceled':
          if (!ACTIVE_ORDER_STATUSES.includes(order.status)) throw this.#invalidTransition();
          await this.orders.setTableStatus(order.tableId, 'available', db);
          break;
      }

      await this.orders.updateStatus(orderId, status, db);
      return { id: order.id, status };
    });
  }

  // RN-08: taxa de serviço opcional de 10% sobre os itens não cancelados.
  async getBill(orderId, { serviceTax = false } = {}) {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError('Pedido não encontrado.');

    const items = (await this.orders.findItems(orderId)).filter(
      (item) => item.status !== 'canceled'
    );
    const payments = await this.orders.findPayments(orderId);
    const subtotal = this.#subtotal(items);
    const serviceTaxAmount = serviceTax ? roundMoney(subtotal * SERVICE_TAX_RATE) : 0;
    const total = roundMoney(subtotal + serviceTaxAmount);

    return {
      orderId: order.id,
      status: order.status,
      table: order.table,
      items: items.map(({ id, name, quantity, unitPrice }) => ({ id, name, quantity, unitPrice })),
      subtotal,
      serviceTaxAmount,
      total,
      remainingBalance: this.#remaining(items, payments, serviceTax),
      payments
    };
  }

  async addPayment(orderId, { amount, method } = {}) {
    const normalizedAmount = typeof amount === 'number' && Number.isFinite(amount)
      ? roundMoney(amount)
      : 0;
    if (!(normalizedAmount > 0) || normalizedAmount > MAX_PG_MONEY) {
      throw new DomainValidationError('Valor do pagamento inválido.');
    }
    if (!PAYMENT_METHODS.includes(method)) {
      throw new DomainValidationError('Forma de pagamento inválida.');
    }
    return this.orders.transaction(async (db) => {
      const order = await this.#lockOrder(orderId, db);
      if (!ACTIVE_ORDER_STATUSES.includes(order.status)) {
        throw new ConflictError('Não é possível registrar pagamento neste pedido.');
      }
      const id = await this.orders.addPayment(
        { orderId, amount: normalizedAmount, method },
        db
      );
      return { id };
    });
  }

  #subtotal(items) {
    return roundMoney(
      items
        .filter((item) => item.status !== 'canceled')
        .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    );
  }

  #remaining(items, payments, serviceTax) {
    const subtotal = this.#subtotal(items);
    const total = serviceTax ? subtotal + roundMoney(subtotal * SERVICE_TAX_RATE) : subtotal;
    const paid = payments.reduce((sum, payment) => sum + payment.amount, 0);
    return roundMoney(total - paid);
  }

  async #lockOrder(orderId, db) {
    const order = await this.orders.findById(orderId, { lock: true }, db);
    if (!order) throw new NotFoundError('Pedido não encontrado.');
    return order;
  }

  // Trava o pedido do item para serializar alterações na mesma comanda.
  async #lockItem(itemId, db) {
    const item = await this.orders.findItemById(itemId, db);
    if (!item) throw new NotFoundError('Item não encontrado.');
    const order = await this.#lockOrder(item.orderId, db);
    if (!ACTIVE_ORDER_STATUSES.includes(order.status)) {
      throw new ConflictError('O pedido deste item já foi encerrado.');
    }
    return (await this.orders.findItemById(itemId, db)) ?? item;
  }

  #invalidTransition() {
    return new ConflictError('Transição de status do pedido inválida.');
  }
}
