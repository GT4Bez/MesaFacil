import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError.js';

export function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Token de autenticação não informado.'));
  }

  const token = authorization.slice(7).trim();
  try {
    const payload = jwt.verify(token, env.jwtSecret);
    req.user = {
      id: String(payload.id),
      name: payload.name,
      email: payload.email,
      role: payload.role
    };
    return next();
  } catch {
    return next(new UnauthorizedError('Token inválido ou expirado.'));
  }
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!allowedRoles.includes(req.user.role)) {
      return next(new ForbiddenError('Você não possui permissão para esta ação.'));
    }
    return next();
  };
}