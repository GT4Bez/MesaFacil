import { Router } from 'express';
import { ShiftService } from '../services/ShiftService.js';
import { authenticateToken, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();
const shiftService = new ShiftService();

router.use(authenticateToken);

router.get('/active', async (req, res) => {
  res.json({ success: true, data: await shiftService.findActive() });
});

router.post('/', requireRole('manager'), async (req, res) => {
  res.status(201).json({ success: true, data: await shiftService.open(req.user, req.body) });
});

// RN-13: sangria e reforço (spec 007).
router.get('/:id/cash-movements', requireRole('cashier', 'manager'), async (req, res) => {
  res.json({ success: true, data: await shiftService.listCashMovements(req.params.id) });
});

router.post('/:id/cash-movements', requireRole('cashier', 'manager'), async (req, res) => {
  res.status(201).json({
    success: true,
    data: await shiftService.addCashMovement(req.params.id, req.body, req.user)
  });
});

router.get('/:id/report', requireRole('manager'), async (req, res) => {
  res.json({ success: true, data: await shiftService.getReport(req.params.id) });
});

// RN-14: contagem cega do caixa (o admin passa pelo hasRole) e fechamento pelo gerente (spec 008).
router.put('/:id/count', requireRole('cashier'), async (req, res) => {
  res.json({ success: true, data: await shiftService.count(req.params.id, req.body, req.user) });
});

router.patch('/:id/close', requireRole('manager'), async (req, res) => {
  res.json({ success: true, data: await shiftService.close(req.params.id, req.user, req.body) });
});

export default router;
