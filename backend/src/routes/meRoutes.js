import { Router } from 'express';
import { UserService } from '../services/UserService.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = Router();
const userService = new UserService();

const ok = (res, data) => res.json({ success: true, data });

// Conta do próprio usuário: disponível para todos os papéis.
router.use(authenticateToken);

router.get('/', async (req, res) => ok(res, await userService.me(req.user)));

router.patch('/password', async (req, res) => ok(res, await userService.changeOwnPassword(req.user, req.body)));

export default router;
