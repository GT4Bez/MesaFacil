import { Router } from 'express';
import { TableRepository } from '../repositories/TableRepository.js';
import { authenticateToken } from '../middlewares/authMiddleware.js';

const router = Router();
const tableRepository = new TableRepository();

router.use(authenticateToken);

router.get('/', async (req, res) => {
  const tables = await tableRepository.findAll();
  res.json({ success: true, data: tables });
});

export default router;
