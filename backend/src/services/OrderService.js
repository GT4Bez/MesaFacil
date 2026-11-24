import { OrderRepository, ACTIVE_ORDER_STATUSES } from '../repositories/OrderRepository.js';
import { MenuItemRepository } from '../repositories/MenuItemRepository.js';
import { StockRepository } from '../repositories/StockRepository.js';
import { AuditLogService } from './AuditLogService.js';
import { AuthService } from './AuthService.js';
import { SettingsService } from './SettingsService.js';
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
import {
  formatBRL,
  ITEM_STATUS_LABELS,
  ORDER_STATUS_LABELS,
  orList,
  PAYMENT_METHOD_LABELS,
  permissionMessage,
  plural
} from '../domain/labels.js';

const SERVICE_TAX_RATE = 0.1;
const PAYMENT_METHODS = ['cash', 'card', 'pix'];
const KITCHEN_FLOW = { sent: 'preparing', preparing: 'ready' };
const MAX_PG_INT = 2147483647;
const MAX_REOPEN_REASON = 200;
const ORDER_TRANSITION_ROLES = {
  in_kitchen: ['waiter', 'manager'],
  ready_to_pay: ['waiter', 'manager'],
  closed: ['cashier', 'manager'],
  canceled: ['manager']
};

// Spec 021: o que cada transição significa, para a mensagem de permissão.
const TRANSITION_ACTIONS = {
  in_kitchen: 'enviar o pedido para a cozinha',
  ready_to_pay: 'pedir a conta',
  closed: 'encerrar o pedido',
  canceled: 'cancelar o pedido'
};
const QUANTITY_MESSAGE = 'A quantidade deve ser um número inteiro maior que zero.';
const orderStatus = (status) => `"${ORDER_STATUS_LABELS[status] ?? status}"`;
const itemStatus = (status) => `"${ITEM_STATUS_LABELS[status] ?? status}"`;

const cleanReason = (reason) => (typeof reason === 'string' ? reason.trim() : '');
const isPositiveInteger = (value) => Number.isInteger(value) && value > 0 && value <= MAX_PG_INT;

export class OrderService {
  constructor(
    orderRepository = new OrderRepository(),
    menuItemRepository = new MenuItemRepository(),
    auditLogService = new AuditLogService(),
    authService = new AuthService(),
    stockRepository = new StockRepository(),
    settingsService = new SettingsService()
  ) {
    this.settings = settingsService;
    this.orders = orderRepository;
    this.menuItems = menuItemRepository;
    this.audit = auditLogService;
    this.auth = authService;
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
        if (!shiftId) {
          throw new ConflictError('Não há turno aberto. O gerente precisa abrir o turno (tela Turno) antes de iniciar atendimentos.');
        }

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

  async addItem(orderId, { menuItemId, quantity = 1, notes } = {}, user = null) {
    if (!menuItemId) throw new BadRequestError('Informe o item do cardápio.');
    if (!isPositiveInteger(quantity)) throw new DomainValidationError(QUANTITY_MESSAGE);

    return this.orders.transaction(async (db) => {
      // RN-21 (spec 022): o garçom lança no máximo N unidades iguais por vez; gerente e admin, sem limite.
      if (user?.role === 'waiter') {
        const max = await this.settings.maxItemQuantityPerLaunch(db);
        if (quantity > max) {
          throw new DomainValidationError(
            `Cada lançamento do garçom pode ter no máximo ${max} unidades do mesmo item. Para mais, faça outro lançamento ou peça ao gerente.`
          );
        }
      }
      const order = await this.#lockOrder(orderId, db);
      if (!['open', 'in_kitchen'].includes(order.status)) {
        throw new ConflictError(this.#closedForItems(order.status));
      }
      const menuItem = await this.menuItems.findAvailableById(menuItemId, db);
      if (!menuItem) throw new NotFoundError('Este item do cardápio está fora de linha ou não existe mais. Atualize o cardápio e escolha outro.');

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
    if (!isPositiveInteger(quantity)) throw new DomainValidationError(QUANTITY_MESSAGE);
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
    if (!['canceled', 'preparing', 'ready'].includes(status)) {
      throw new BadRequestError('Status do item inválido: use "canceled", "preparing" ou "ready".');
    }
    if ((status === 'preparing' || status === 'ready') && !hasRole(user, 'kitchen', 'manager')) {
      throw new ForbiddenError('Apenas a cozinha pode atualizar o preparo.');
    }

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
          await this.#assertPaidFitsWithout(item, order, db);
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
          await this.#assertPaidFitsWithout(item, order, db);
          await this.orders.cancelItem(itemId, {}, db);
        }
        return { id: item.id, status };
      }

      if (KITCHEN_FLOW[item.status] !== status) {
        throw new ConflictError(
          `O item está ${itemStatus(item.status)} e não pode passar para ${itemStatus(status)}. A sequência na cozinha é Enviado → Em preparo → Pronto.`
        );
      }
      await this.orders.updateItemStatus(itemId, status, db);
      return { id: item.id, status };
    });
  }

  // RN-17: o caixa cancela item com a autorização de um gerente, sem trocar de sessão.
  async authorizedCancelItem(itemId, { reason, approver } = {}, user) {
    const cleaned = cleanReason(reason);
    if (!cleaned) throw new DomainValidationError('Informe o motivo do cancelamento.');
    // Credenciais conferidas antes de travar o pedido: sem lock segurado nem 404/409 antes da autorização.
    const approvedBy = await this.auth.verifyApprover(approver ?? {}, user);

    return this.orders.transaction(async (db) => {
      const { item, order } = await this.#lockItem(itemId, db);
      if (item.status === 'canceled') throw new ConflictError('O item já está cancelado.');
      await this.#assertPaidFitsWithout(item, order, db);
      await this.orders.cancelItem(itemId, { canceledBy: approvedBy.id, reason: cleaned }, db);
      await this.audit.record(
        {
          userId: user.id,
          shiftId: order.shiftId,
          action: 'order_item.canceled',
          entity: 'order_item',
          entityId: item.id,
          details: { orderId: order.id, reason: cleaned, previousStatus: item.status, approvedBy }
        },
        db
      );
      return { id: item.id, status: 'canceled', approvedBy };
    });
  }

  // RN-03: máquina de estados do pedido.
  async updateStatus(orderId, { status, reason } = {}, user) {
    const allowedRoles = ORDER_TRANSITION_ROLES[status];
    if (!allowedRoles) {
      throw new BadRequestError('Status do pedido inválido: use "in_kitchen", "ready_to_pay", "closed" ou "canceled".');
    }
    if (!hasRole(user, ...allowedRoles)) {
      throw new ForbiddenError(permissionMessage(allowedRoles, user, TRANSITION_ACTIONS[status]));
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
          if (!['open', 'in_kitchen'].includes(order.status)) throw this.#invalidTransition(order.status, status);
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
          if (order.status !== 'in_kitchen') throw this.#invalidTransition(order.status, status);
          {
            // RN-06: a cozinha precisa ter terminado todos os itens.
            const waiting = items.filter((item) => !['ready', 'canceled'].includes(item.status));
            if (waiting.length > 0) {
              throw new ConflictError(
                `${plural(waiting.length, 'item ainda não está pronto', 'itens ainda não estão prontos')} na cozinha. Peça a conta quando a cozinha terminar.`
              );
            }
          }
          break;

        case 'closed': {
          // RN-03: só encerra depois que a conta foi pedida (ready_to_pay).
          if (['open', 'in_kitchen'].includes(order.status)) {
            throw new ConflictError('O pedido só pode ser encerrado depois que a conta for pedida.');
          }
          if (order.status !== 'ready_to_pay') throw this.#invalidTransition(order.status, status);
          // RN-07 e RN-12: o saldo considerando a taxa de serviço persistida precisa estar quitado.
          const payments = await this.orders.findPayments(orderId, db);
          const remaining = this.#remaining(items, payments, order.serviceTax);
          if (remaining > 0) {
            throw new ConflictError(`Ainda faltam ${formatBRL(remaining)} para quitar o pedido. Registre o pagamento antes de encerrar.`);
          }
          await this.orders.setTableStatus(order.tableId, 'available', db);
          break;
        }

        case 'canceled':
          if (!ACTIVE_ORDER_STATUSES.includes(order.status)) throw this.#invalidTransition(order.status, status);
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

  // Spec 019: a conta pedida volta ao atendimento (ready_to_pay -> in_kitchen) para lançar mais itens.
  // Os pagamentos já registrados permanecem; a reabertura fica na auditoria.
  async reopen(orderId, { reason } = {}, user) {
    if (reason !== undefined && reason !== null && typeof reason !== 'string') {
      throw new DomainValidationError('O motivo deve ser um texto.');
    }
    const cleaned = cleanReason(reason);
    if (cleaned.length > MAX_REOPEN_REASON) {
      throw new DomainValidationError(`O motivo deve ter até ${MAX_REOPEN_REASON} caracteres.`);
    }

    return this.orders.transaction(async (db) => {
      const order = await this.#lockOrder(orderId, db);
      if (order.status !== 'ready_to_pay') {
        throw new ConflictError(
          `Só dá para reabrir uma conta que está "Aguardando pagamento". Este pedido está ${orderStatus(order.status)}.`
        );
      }
      const paidAmount = this.#effectivePaid(await this.orders.findPayments(orderId, db));
      await this.orders.updateStatus(orderId, 'in_kitchen', db);
      await this.audit.record(
        {
          userId: user.id,
          shiftId: order.shiftId,
          action: 'order.reopened',
          entity: 'order',
          entityId: order.id,
          details: { reason: cleaned || null, paidAmount }
        },
        db
      );
      return { id: order.id, status: 'in_kitchen' };
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
      throw new DomainValidationError('O valor do pagamento deve ser um número maior que zero.');
    }
    if (!PAYMENT_METHODS.includes(method)) {
      throw new DomainValidationError(
        `Forma de pagamento inválida: use ${orList(Object.values(PAYMENT_METHOD_LABELS))}.`
      );
    }
    return this.orders.transaction(async (db) => {
      const order = await this.#lockOrder(orderId, db);
      if (!ACTIVE_ORDER_STATUSES.includes(order.status)) {
        throw new ConflictError(`Não dá para registrar pagamento: o pedido está ${orderStatus(order.status)}.`);
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

  // RN-17 (regra 5): sem estorno, um cancelamento não pode deixar o valor pago acima do novo total.
  async #assertPaidFitsWithout(item, order, db) {
    const payments = await this.orders.findPayments(order.id, db);
    if (payments.length === 0) return;
    const items = await this.orders.findItems(order.id, db);
    const remaining = this.#remaining(
      items.filter((other) => String(other.id) !== String(item.id)),
      payments,
      order.serviceTax
    );
    if (remaining < 0) {
      throw new ConflictError('O valor já pago passaria do novo total da conta. Estorno não é suportado.');
    }
  }

  async #lockOrder(orderId, db) {
    const order = await this.orders.findById(orderId, { lock: true }, db);
    if (!order) throw new NotFoundError('Pedido não encontrado.');
    return order;
  }

  // Trava o pedido do item para serializar alterações na mesma comanda.
  async #lockItem(itemId, db) {
    const found = await this.orders.findItemById(itemId, db);
    if (!found) throw new NotFoundError('Item da comanda não encontrado. Atualize a tela.');
    const order = await this.#lockOrder(found.orderId, db);
    if (!ACTIVE_ORDER_STATUSES.includes(order.status)) {
      throw new ConflictError(`O pedido deste item está ${orderStatus(order.status)} e não aceita mais alterações.`);
    }
    return { item: (await this.orders.findItemById(itemId, db)) ?? found, order };
  }

  // Spec 021: diz o status atual, o pedido e o que fazer.
  #invalidTransition(from, to) {
    const hint = {
      ready_to_pay: ' Reabra a conta para voltar ao atendimento.',
      closed: ' O atendimento já terminou.',
      canceled: ' O atendimento já terminou.'
    }[from] ?? '';
    return new ConflictError(`O pedido está ${orderStatus(from)} e não pode passar para ${orderStatus(to)}.${hint}`);
  }

  // Spec 021: por que o pedido não aceita itens novos.
  #closedForItems(status) {
    if (status === 'ready_to_pay') {
      return 'A conta já foi pedida (Aguardando pagamento). Reabra a conta para lançar mais itens.';
    }
    return `O pedido está ${orderStatus(status)}. Abra um novo atendimento na mesa para lançar itens.`;
  }
}
