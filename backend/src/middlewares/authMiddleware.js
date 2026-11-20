import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ForbiddenError, UnauthorizedError } from '../errors/AppError.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { hasRole } from '../auth/roles.js';

const userRepository = new UserRepository();

// RN-16: além da assinatura do JWT, confere no banco a cada requisição se o usuário segue ativo
// e se o token não foi revogado (token_version). O papel vem do banco, então troca vale na hora.
export async function authenticateToken(req, res, next) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Token de autenticação não informado.'));
  }

  let payload;
  try {
    payload = jwt.verify(authorization.slice(7).trim(), env.jwtSecret);
  } catch {
    return next(new UnauthorizedError('Token inválido ou expirado.'));
  }

  const user = await userRepository.findSessionUser(payload.id);
  if (!user || !user.active || user.tokenVersion !== payload.tokenVersion) {
    return next(new UnauthorizedError('Sessão encerrada. Faça login novamente.'));
  }

  req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
  return next();
}

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (!hasRole(req.user, ...allowedRoles)) {
      return next(new ForbiddenError('Você não possui permissão para esta ação.'));
    }
    return next();
  };
}
