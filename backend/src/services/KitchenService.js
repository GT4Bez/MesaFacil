import { KitchenRepository } from '../repositories/KitchenRepository.js';

export class KitchenService {
  constructor(kitchenRepository = new KitchenRepository()) {
    this.kitchen = kitchenRepository;
  }

  // Agrupa por pedido mantendo a ordem de chegada: o pedido com o item mais antigo vem primeiro
  // (os itens já chegam ordenados por sent_at, e o Map preserva a ordem de inserção).
  async listQueue() {
    const orders = new Map();
    for (const { orderId, tableNumber, ...item } of await this.kitchen.findQueueItems()) {
      if (!orders.has(orderId)) {
        orders.set(orderId, { orderId, table: { number: tableNumber }, items: [] });
      }
      orders.get(orderId).items.push(item);
    }
    return [...orders.values()];
  }
}
