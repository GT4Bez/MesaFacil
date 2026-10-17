import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ProcessPaymentDTO {
  orderId: number;
  amountPaid: number;
}

export async function processPaymentService(data: ProcessPaymentDTO) {
  const { orderId, amountPaid } = data;

  // Buscar o pedido com seus itens, incluindo o produto do cardápio (menuItem) e pagamentos
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          menuItem: true, // Garante o acesso ao preço unitário correto do cardápio
        },
      },
      payments: true,
    },
  });

  if (!order) {
    const error: any = new Error('Pedido não encontrado.');
    error.statusCode = 404;
    throw error;
  }

  // RN-06: Validar se todos os itens estão concluídos antes de permitir pagamento/fechamento
  const hasPendingItems = order.items.some(
    (item: any) => item.status !== 'ready' && item.status !== 'delivered' && item.status !== 'cancelled'
  );

  if (hasPendingItems) {
    const error: any = new Error('Não é possível prosseguir para o pagamento: existem itens pendentes ou em preparo.');
    error.statusCode = 422; // Unprocessable Entity
    throw error;
  }

  // Registrar o pagamento
  const payment = await prisma.payment.create({
    data: {
      orderId,
      amount: amountPaid,
    },
  });

  // Calcular saldo restante (RN-07)
  const previousPaymentsTotal = order.payments.reduce(
    (acc: number, p: any) => acc + Number(p.amount),
    0
  );
  const totalPaid = previousPaymentsTotal + Number(amountPaid);
  
  // Cálculo do valor total utilizando o preço unitário do item relacionado no menu
  const totalOrderAmount = order.items
    .filter((item: any) => item.status !== 'cancelled')
    .reduce((acc: number, item: any) => {
      const itemPrice = Number(item.menuItem?.price || item.price || 0);
      const itemQuantity = Number(item.quantity || 1);
      return acc + (itemPrice * itemQuantity);
    }, 0);

  const remainingBalance = totalOrderAmount - totalPaid;

  // RN-07: Fechamento restrito ao saldo restante <= 0
  if (remainingBalance <= 0) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'closed', // Fechando a comanda/mesa corretamente
      },
    });
  }

  return {
    payment,
    totalPaid,
    remainingBalance: remainingBalance <= 0 ? 0 : remainingBalance,
    orderClosed: remainingBalance <= 0,
  };
}