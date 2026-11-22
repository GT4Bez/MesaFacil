import { Router } from 'express';
import { OrderService } from '../services/OrderService.js';
import { authenticateToken, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();
const orderService = new OrderService();

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

// Montado na raiz: o token é exigido rota a rota para não afetar caminhos de outros routers.
router.post('/orders', authenticateToken, requireRole('waiter', 'manager'), async (req, res) =>
  ok(res, await orderService.create(req.body, req.user), 201));

router.get('/orders/:id', authenticateToken, async (req, res) => ok(res, await orderService.findById(req.params.id)));

router.patch('/orders/:id/status', authenticateToken, async (req, res) =>
  ok(res, await orderService.updateStatus(req.params.id, req.body, req.user)));

router.post('/orders/:id/items', authenticateToken, requireRole('waiter', 'manager'), async (req, res) =>
  ok(res, await orderService.addItem(req.params.id, req.body), 201));

router.patch('/order-items/:id/quantity', authenticateToken, requireRole('waiter', 'manager'), async (req, res) =>
  ok(res, await orderService.updateItemQuantity(req.params.id, req.body)));

router.patch('/order-items/:id/status', authenticateToken, async (req, res) =>
  ok(res, await orderService.updateItemStatus(req.params.id, req.body, req.user)));

// RN-17: o caixa cancela com a autorização (e-mail e senha) de um gerente.
router.post('/order-items/:id/authorized-cancel', authenticateToken, requireRole('cashier'), async (req, res) =>
  ok(res, await orderService.authorizedCancelItem(req.params.id, req.body, req.user)));

router.get('/orders/:id/bill', authenticateToken, async (req, res) =>
  ok(res, await orderService.getBill(req.params.id)));

router.patch('/orders/:id/service-tax', authenticateToken, requireRole('cashier', 'manager'), async (req, res) =>
  ok(res, await orderService.setServiceTax(req.params.id, req.body)));

router.post('/orders/:id/payments', authenticateToken, requireRole('cashier', 'manager'), async (req, res) =>
  ok(res, await orderService.addPayment(req.params.id, req.body), 201));

export default router;
