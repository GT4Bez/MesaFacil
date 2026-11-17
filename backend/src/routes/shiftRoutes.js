import { Router } from 'express';
import { ShiftRepository } from '../repositories/ShiftRepository.js';
import { authenticateToken, requireRole } from '../middlewares/authMiddleware.js';
import { ConflictError, NotFoundError } from '../errors/AppError.js';
import { isPgError } from '../errors/pgErrors.js';

const router = Router();
const shiftRepository = new ShiftRepository();

router.use(authenticateToken);

router.get('/active', async (req, res) => {
  const shift = await shiftRepository.findActive();
  res.json({ success: true, data: shift });
});

router.post('/', requireRole('manager'), async (req, res) => {
  try {
    const shift = await shiftRepository.open(req.user.id);
    res.status(201).json({ success: true, data: shift });
  } catch (error) {
    if (isPgError(error, '23505', 'shifts_single_open_idx')) {
      throw new ConflictError('Já existe um turno aberto.');
    }
    throw error;
  }
});

router.patch('/:id/close', requireRole('manager'), async (req, res) => {
  const closed = await shiftRepository.close(req.params.id);
  if (closed) return res.json({ success: true, data: closed });

  const shift = await shiftRepository.findById(req.params.id);
  if (!shift) throw new NotFoundError('Turno não encontrado.');
  if (shift.status === 'closed') throw new ConflictError('O turno já está encerrado.');
  throw new ConflictError('Não é possível encerrar o turno com pedidos ativos.');
});

export default router;
