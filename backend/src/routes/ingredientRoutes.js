import { Router } from 'express';
import { IngredientService } from '../services/IngredientService.js';
import { authenticateToken, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();
const ingredientService = new IngredientService();

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

// RN-15 (spec 009): insumos só para o gerente (o admin passa pelo hasRole).
router.use(authenticateToken, requireRole('manager'));

router.get('/', async (req, res) => ok(res, await ingredientService.list()));

router.post('/', async (req, res) => ok(res, await ingredientService.create(req.body), 201));

// Spec 016: histórico de movimentos do insumo (limit, before e type na query).
router.get('/:id/movements', async (req, res) =>
  ok(res, await ingredientService.listMovements(req.params.id, req.query)));

router.patch('/:id', async (req, res) => ok(res, await ingredientService.update(req.params.id, req.body)));

router.post('/:id/purchases', async (req, res) =>
  ok(res, await ingredientService.addPurchase(req.params.id, req.body, req.user), 201));

router.post('/:id/adjustments', async (req, res) =>
  ok(res, await ingredientService.addAdjustment(req.params.id, req.body, req.user), 201));

export default router;
