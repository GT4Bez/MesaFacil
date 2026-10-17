import type { Request, Response } from 'express';
import { processPaymentService } from '../services/paymentService';

export async function processPayment(req: Request, res: Response) {
  try {
    const { orderId, amountPaid } = req.body;

    const result = await processPaymentService({
      orderId: Number(orderId),
      amountPaid: Number(amountPaid),
    });

    return res.status(200).json(result);
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({ error: error.message });
  }
}