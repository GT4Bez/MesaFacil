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

// Specs 016 e 018: histórico de movimentos do insumo (limit, before, type, from, to e shiftId na query).
router.get('/:id/movements', async (req, res) =>
  ok(res, await ingredientService.listMovements(req.params.id, req.query)));

// Spec 018: o mesmo recorte em CSV. Os erros continuam no envelope JSON.
router.get('/:id/movements.csv', async (req, res) => {
  const { filename, csv } = await ingredientService.exportMovements(req.params.id, req.query);
  res
    .status(200)
    .set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"` })
    .send(csv);
});

router.patch('/:id', async (req, res) => ok(res, await ingredientService.update(req.params.id, req.body)));

router.post('/:id/purchases', async (req, res) =>
  ok(res, await ingredientService.addPurchase(req.params.id, req.body, req.user), 201));

router.post('/:id/adjustments', async (req, res) =>
  ok(res, await ingredientService.addAdjustment(req.params.id, req.body, req.user), 201));

export default router;
