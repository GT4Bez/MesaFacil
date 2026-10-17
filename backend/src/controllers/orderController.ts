import type { Request, Response } from 'express';
import { createOrderService } from '../services/orderService';

export async function createOrder(req: Request, res: Response) {
  try {
    const { tableId, userId } = req.body;

    const order = await createOrderService({
      tableId: Number(tableId),
      userId: Number(userId),
    });

    return res.status(201).json(order);
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ error: error.message });
  }
}