import { Router } from 'express';
import { AuditQueryService } from '../services/AuditQueryService.js';
import { authenticateToken, requireRole } from '../middlewares/authMiddleware.js';

const router = Router();
const auditQueryService = new AuditQueryService();

const ok = (res, data) => res.status(200).json({ success: true, data });

// RN-20 (spec 017): trilha de auditoria para o gerente (o admin passa pelo hasRole).
router.use(authenticateToken, requireRole('manager'));

router.get('/', async (req, res) => ok(res, await auditQueryService.list(req.query, req.user)));

router.get('/actors', async (req, res) => ok(res, await auditQueryService.actors(req.user)));

export default router;
