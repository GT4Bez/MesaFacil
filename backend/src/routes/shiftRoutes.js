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
  res.status(201).json({ success: true, data: await shiftService.open(req.user) });
});

router.get('/:id/report', requireRole('manager'), async (req, res) => {
  res.json({ success: true, data: await shiftService.getReport(req.params.id) });
});

router.patch('/:id/close', requireRole('manager'), async (req, res) => {
  res.json({ success: true, data: await shiftService.close(req.params.id, req.user) });
});

export default router;
