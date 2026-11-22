import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { hasRole } from '../auth/roles.js';
import {
  BadRequestError,
  DomainValidationError,
  ForbiddenError,
  UnauthorizedError
} from '../errors/AppError.js';

export class AuthService {
  constructor(userRepository = new UserRepository()) {
    this.userRepository = userRepository;
  }

  async login({ email, password } = {}) {
    if (typeof email !== 'string' || typeof password !== 'string' ||
        !email.trim() || !password) {
      throw new BadRequestError('Informe e-mail e senha.');
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.userRepository.findByEmail(normalizedEmail);

    // RN-16: usuário desativado recebe a mesma resposta de credencial inválida.
    if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) {
      throw new UnauthorizedError('E-mail ou senha inválidos.');
    }

    const safeUser = {
      id: String(user.id),
      name: user.name,
      email: user.email,
      role: user.role
    };

    // tokenVersion permite revogar o token (desativação, troca de senha) sem esperar expirar.
    const token = jwt.sign({ ...safeUser, tokenVersion: user.token_version }, env.jwtSecret, {
      expiresIn: env.jwtExpiresIn
    });

    return { token, user: safeUser };
  }

  // RN-17: confere a autorização de um gerente (ou admin) sem abrir sessão para ele.
  // Qualquer falha devolve a mesma mensagem, e 403 (não 401) para não derrubar a sessão de quem pede.
  async verifyApprover({ email, password } = {}) {
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      throw new DomainValidationError('Informe o e-mail e a senha do gerente.');
    }
    const approver = await this.userRepository.findByEmail(email.trim().toLowerCase());
    if (
      !approver ||
      !approver.active ||
      !hasRole(approver, 'manager') ||
      !(await bcrypt.compare(password, approver.password_hash))
    ) {
      throw new ForbiddenError('Autorização do gerente inválida.');
    }
    return { id: String(approver.id), name: approver.name };
  }
}
