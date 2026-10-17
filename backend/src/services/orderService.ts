import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface CreateOrderDTO {
  tableId: number;
  userId: number;
}

export async function createOrderService(data: CreateOrderDTO) {
  const { tableId, userId } = data;

  // RN-02: Validar obrigatoriamente se existe um turno aberto (shift.status = 'open')
  const activeShift = await prisma.shift.findFirst({
    where: { status: 'open' },
  });

  if (!activeShift) {
    const error: any = new Error('Nenhum turno aberto encontrado no momento.');
    error.statusCode = 422;
    throw error;
  }

  // RN-01: Impedir abertura de dois pedidos simultâneos para a mesma mesa
  const existingActiveOrder = await prisma.order.findFirst({
    where: {
      tableId,
      status: { not: 'closed' },
    },
  });

  if (existingActiveOrder) {
    const error: any = new Error('Já existe um pedido ativo para esta mesa.');
    error.statusCode = 409; // Conflict
    throw error;
  }

  // Criação do pedido vinculado ao turno ativo
  const newOrder = await prisma.order.create({
    data: {
      tableId,
      userId,
      shiftId: activeShift.id,
      status: 'pending',
    },
  });

  return newOrder;
}