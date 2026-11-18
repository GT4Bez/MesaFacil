import { Router } from 'express';
import { KitchenService } from '../services/KitchenService.js';
import { authenticateToken, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();
const kitchenService = new KitchenService();

router.use(authenticateToken, requireRole('kitchen', 'manager'));

// Fila do KDS; as transições continuam em PATCH /order-items/:id/status.
router.get('/orders', async (req, res) => {
  res.json({ success: true, data: await kitchenService.listQueue() });
});

export default router;
