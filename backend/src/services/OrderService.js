import { OrderRepository, ACTIVE_ORDER_STATUSES } from '../repositories/OrderRepository.js';
import { MenuItemRepository } from '../repositories/MenuItemRepository.js';
import { StockRepository } from '../repositories/StockRepository.js';
import { AuditLogService } from './AuditLogService.js';
import { hasRole } from '../auth/roles.js';
import {
  BadRequestError,
  ConflictError,
  DomainValidationError,
  ForbiddenError,
  NotFoundError
} from '../errors/AppError.js';
import { isPgError } from '../errors/pgErrors.js';
import { MAX_PG_MONEY, roundMoney, toMoney } from '../domain/money.js';

const SERVICE_TAX_RATE = 0.1;
const PAYMENT_METHODS = ['cash', 'card', 'pix'];
const KITCHEN_FLOW = { sent: 'preparing', preparing: 'ready' };
const MAX_PG_INT = 2147483647;
const ORDER_TRANSITION_ROLES = {
  in_kitchen: ['waiter', 'manager'],
  ready_to_pay: ['waiter', 'manager'],
  closed: ['cashier', 'manager'],
  canceled: ['manager']
};

const cleanReason = (reason) => (typeof reason === 'string' ? reason.trim() : '');
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0 && value <= MAX_PG_INT;

export class OrderService {
  constructor(
    orderRepository = new OrderRepository(),
    menuItemRepository = new MenuItemRepository(),
    auditLogService = new AuditLogService(),
    stockRepository = new StockRepository()
  ) {
    this.orders = orderRepository;
    this.menuItems = menuItemRepository;
    this.audit = auditLogService;
    this.stock = stockRepository;
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
    return {
      id: order.id,
      status: order.status,
      createdAt: order.createdAt,
      table: order.table,
      cancellation: order.cancellation,
      items
    };
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
      const { item } = await this.#lockItem(itemId, db);
      if (item.status !== 'pending') {
        throw new ConflictError('Só é possível alterar itens que ainda não foram enviados.');
      }
      await this.orders.updateItemQuantity(itemId, quantity, db);
      return { id: item.id };
    });
  }

  async updateItemStatus(itemId, { status, reason } = {}, user) {
    return this.orders.transaction(async (db) => {
      const { item, order } = await this.#lockItem(itemId, db);

      if (status === 'canceled') {
        if (item.status === 'canceled') throw new ConflictError('O item já está cancelado.');
        if (item.status !== 'pending') {
          // RN-05: item enviado só é cancelado por gerente, com motivo.
          if (!hasRole(user, 'manager')) {
            throw new ForbiddenError('Apenas o gerente pode cancelar itens já enviados.');
          }
          const cleaned = cleanReason(reason);
          if (!cleaned) throw new DomainValidationError('Informe o motivo do cancelamento.');
          await this.orders.cancelItem(itemId, { canceledBy: user.id, reason: cleaned }, db);
          await this.audit.record(
            {
              userId: user.id,
              shiftId: order.shiftId,
              action: 'order_item.canceled',
              entity: 'order_item',
              entityId: item.id,
              details: { orderId: order.id, reason: cleaned, previousStatus: item.status }
            },
            db
          );
        } else {
          if (!hasRole(user, 'waiter', 'manager')) {
            throw new ForbiddenError('Apenas o garçom ou gerente pode remover itens pendentes.');
          }
          await this.orders.cancelItem(itemId, {}, db);
        }
        return { id: item.id, status };
      }

      if (status === 'preparing' || status === 'ready') {
        if (!hasRole(user, 'kitchen', 'manager')) {
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
  async updateStatus(orderId, { status, reason } = {}, user) {
    const allowedRoles = ORDER_TRANSITION_ROLES[status];
    if (!allowedRoles) throw new BadRequestError('Status do pedido inválido.');
    if (!hasRole(user, ...allowedRoles)) {
      throw new ForbiddenError('Você não possui permissão para alterar para este status.');
    }
    // RN-11: cancelar o pedido exige motivo.
    const cancellationReason = cleanReason(reason);
    if (status === 'canceled' && !cancellationReason) {
      throw new DomainValidationError('Informe o motivo do cancelamento.');
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
          {
            // RN-15: a baixa dos insumos acontece no envio, na mesma transação.
            const sentIds = await this.orders.sendPendingItems(orderId, db);
            await this.stock.recordSales({ orderItemIds: sentIds, shiftId: order.shiftId, userId: user.id }, db);
          }
          break;

        case 'ready_to_pay':
          if (order.status === 'open') {
            throw new ConflictError('Envie os itens para a cozinha antes de pedir a conta.');
          }
          if (order.status !== 'in_kitchen') throw this.#invalidTransition();
          // RN-06: a cozinha precisa ter terminado todos os itens.
          if (!items.every((item) => ['ready', 'canceled'].includes(item.status))) {
            throw new ConflictError('Ainda há itens em preparo na cozinha.');
          }
          break;

        case 'closed': {
          // RN-03: só encerra depois que a conta foi pedida (ready_to_pay).
          if (['open', 'in_kitchen'].includes(order.status)) {
            throw new ConflictError('O pedido só pode ser encerrado depois que a conta for pedida.');
          }
          if (order.status !== 'ready_to_pay') throw this.#invalidTransition();
          // RN-07 e RN-12: o saldo considerando a taxa de serviço persistida precisa estar quitado.
          const payments = await this.orders.findPayments(orderId, db);
          if (this.#remaining(items, payments, order.serviceTax) > 0) {
            throw new ConflictError('O pedido ainda possui saldo em aberto.');
          }
          await this.orders.setTableStatus(order.tableId, 'available', db);
          break;
        }

        case 'canceled':
          if (!ACTIVE_ORDER_STATUSES.includes(order.status)) throw this.#invalidTransition();
          // RN-11: estorno está fora de escopo, então pedido com pagamento não é cancelado.
          if ((await this.orders.findPayments(orderId, db)).length > 0) {
            throw new ConflictError('Pedido com pagamento registrado não pode ser cancelado.');
          }
          await this.orders.cancelOrder(orderId, { canceledBy: user.id, reason: cancellationReason }, db);
          await this.orders.setTableStatus(order.tableId, 'available', db);
          await this.audit.record(
            {
              userId: user.id,
              shiftId: order.shiftId,
              action: 'order.canceled',
              entity: 'order',
              entityId: order.id,
              details: { reason: cancellationReason, previousStatus: order.status }
            },
            db
          );
          return { id: order.id, status };
      }

      await this.orders.updateStatus(orderId, status, db);
      return { id: order.id, status };
    });
  }

  // RN-08 / RN-12: taxa de serviço persistida no pedido e saldo considerando valores líquidos.
  async getBill(orderId) {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundError('Pedido não encontrado.');

    const items = await this.orders.findItems(orderId);
    const payments = await this.orders.findPayments(orderId);
    return this.#buildBill(order, items, payments);
  }

  async setServiceTax(orderId, { enabled } = {}) {
    if (typeof enabled !== 'boolean') {
      throw new DomainValidationError('Informe se a taxa de serviço está ativa.');
    }

    return this.orders.transaction(async (db) => {
      const order = await this.#lockOrder(orderId, db);
      if (!ACTIVE_ORDER_STATUSES.includes(order.status)) {
        throw new ConflictError('Não é possível alterar a taxa de um pedido encerrado ou cancelado.');
      }
      const items = await this.orders.findItems(orderId, db);
      const payments = await this.orders.findPayments(orderId, db);

      // RN-12: não desliga a taxa se o total já pago ficaria maior que o novo subtotal.
      if (!enabled && order.serviceTax && roundMoney(this.#effectivePaid(payments) - this.#subtotal(items)) > 0) {
        throw new ConflictError('O valor já pago é maior que o total sem a taxa de serviço.');
      }

      if (order.serviceTax !== enabled) {
        await this.orders.updateServiceTax(orderId, enabled, db);
      }
      return this.#buildBill({ ...order, serviceTax: enabled }, items, payments);
    });
  }

  // RN-12: trava o pedido em fila (FOR UPDATE), impede overpayment em cartão/Pix e calcula troco em dinheiro.
  async addPayment(orderId, { amount, method } = {}) {
    const normalizedAmount = toMoney(amount) ?? 0;
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
      const items = await this.orders.findItems(orderId, db);
      const payments = await this.orders.findPayments(orderId, db);
      const remainingBefore = this.#remaining(items, payments, order.serviceTax);
      if (remainingBefore <= 0) {
        throw new ConflictError('O pedido já está quitado.');
      }

      let changeAmount = 0;
      if (normalizedAmount > remainingBefore) {
        if (method !== 'cash') {
          throw new DomainValidationError('Pagamento em cartão ou Pix não pode exceder o saldo restante.');
        }
        changeAmount = roundMoney(normalizedAmount - remainingBefore);
      }

      const id = await this.orders.addPayment(
        { orderId, amount: normalizedAmount, changeAmount, method },
        db
      );
      const effectivePaid = roundMoney(normalizedAmount - changeAmount);
      return {
        id,
        amount: normalizedAmount,
        changeAmount,
        remainingBalance: roundMoney(remainingBefore - effectivePaid)
      };
    });
  }

  #buildBill(order, allItems, payments) {
    const items = allItems.filter((item) => item.status !== 'canceled');
    const subtotal = this.#subtotal(items);
    const serviceTaxAmount = order.serviceTax ? roundMoney(subtotal * SERVICE_TAX_RATE) : 0;
    const total = roundMoney(subtotal + serviceTaxAmount);

    return {
      orderId: order.id,
      status: order.status,
      table: order.table,
      serviceTax: order.serviceTax,
      items: items.map(({ id, name, quantity, unitPrice }) => ({ id, name, quantity, unitPrice })),
      subtotal,
      serviceTaxAmount,
      total,
      remainingBalance: roundMoney(total - this.#effectivePaid(payments)),
      payments
    };
  }

  #subtotal(items) {
    return roundMoney(
      items
        .filter((item) => item.status !== 'canceled')
        .reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    );
  }

  #effectivePaid(payments) {
    return roundMoney(
      payments.reduce((sum, payment) => sum + (payment.amount - (payment.changeAmount ?? 0)), 0)
    );
  }

  #remaining(items, payments, serviceTax) {
    const subtotal = this.#subtotal(items);
    const total = serviceTax ? roundMoney(subtotal + roundMoney(subtotal * SERVICE_TAX_RATE)) : subtotal;
    return roundMoney(total - this.#effectivePaid(payments));
  }

  async #lockOrder(orderId, db) {
    const order = await this.orders.findById(orderId, { lock: true }, db);
    if (!order) throw new NotFoundError('Pedido não encontrado.');
    return order;
  }

  // Trava o pedido do item para serializar alterações na mesma comanda.
  async #lockItem(itemId, db) {
    const found = await this.orders.findItemById(itemId, db);
    if (!found) throw new NotFoundError('Item não encontrado.');
    const order = await this.#lockOrder(found.orderId, db);
    if (!ACTIVE_ORDER_STATUSES.includes(order.status)) {
      throw new ConflictError('O pedido deste item já foi encerrado.');
    }
    return { item: (await this.orders.findItemById(itemId, db)) ?? found, order };
  }

  #invalidTransition() {
    return new ConflictError('Transição de status do pedido inválida.');
  }
}
