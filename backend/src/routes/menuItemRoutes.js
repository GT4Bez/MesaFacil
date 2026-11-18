import { Router } from 'express';
import { MenuItemService } from '../services/MenuItemService.js';
import { authenticateToken, requireRole } from '../middlewares/authMiddleware.js';
import { ForbiddenError } from '../errors/AppError.js';

const router = Router();
const menuItemService = new MenuItemService();

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

router.use(authenticateToken);

// ?all=true lista também os itens fora de linha, só para o gerente.
router.get('/', async (req, res) => {
  const all = req.query.all === 'true';
  if (all && req.user.role !== 'manager') {
    throw new ForbiddenError('Você não possui permissão para esta ação.');
  }
  ok(res, await menuItemService.list({ all }));
});

router.get('/categories', async (req, res) => ok(res, await menuItemService.listCategories()));

router.post('/', requireRole('manager'), async (req, res) =>
  ok(res, await menuItemService.create(req.body), 201));

router.patch('/:id', requireRole('manager'), async (req, res) =>
  ok(res, await menuItemService.update(req.params.id, req.body)));

export default router;
