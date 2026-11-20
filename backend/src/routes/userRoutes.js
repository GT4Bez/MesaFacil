import { Router } from 'express';
import { UserService } from '../services/UserService.js';
import { authenticateToken, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();
const userService = new UserService();

const ok = (res, data, status = 200) => res.status(status).json({ success: true, data });

// RN-16: só o admin administra usuários (o gerente recebe 403).
router.use(authenticateToken, requireRole('admin'));

router.get('/', async (req, res) => ok(res, await userService.list(req.query)));

router.post('/', async (req, res) => ok(res, await userService.create(req.body, req.user), 201));

router.patch('/:id', async (req, res) => ok(res, await userService.update(req.params.id, req.body, req.user)));

router.put('/:id/password', async (req, res) =>
  ok(res, await userService.resetPassword(req.params.id, req.body, req.user)));

export default router;
