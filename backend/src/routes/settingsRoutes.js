import { Router } from 'express';
import { SettingsService } from '../services/SettingsService.js';
import { authenticateToken, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();
const settingsService = new SettingsService();

const ok = (res, data) => res.json({ success: true, data });

// Spec 022: todos leem (a Comanda limita o seletor); só o admin altera.
router.get('/', authenticateToken, async (req, res) => ok(res, await settingsService.get()));
router.patch('/', authenticateToken, requireRole('admin'), async (req, res) =>
  ok(res, await settingsService.update(req.body, req.user)));

export default router;
