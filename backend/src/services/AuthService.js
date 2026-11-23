import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { AuthThrottleService } from './AuthThrottleService.js';
import { hasRole } from '../auth/roles.js';
import {
  BadRequestError,
  DomainValidationError,
  ForbiddenError,
  UnauthorizedError
} from '../errors/AppError.js';

export class AuthService {
  constructor(userRepository = new UserRepository(), authThrottleService = new AuthThrottleService()) {
    this.userRepository = userRepository;
    this.throttle = authThrottleService;
  }

  async login({ email, password } = {}) {
    if (typeof email !== 'string' || typeof password !== 'string' ||
        !email.trim() || !password) {
      throw new BadRequestError('Informe e-mail e senha.');
    }

    const normalizedEmail = email.trim().toLowerCase();
    // RN-19: chave bloqueada não chega a conferir a senha, nem com a senha certa.
    await this.throttle.assertNotLocked('login', normalizedEmail);
    const user = await this.userRepository.findByEmail(normalizedEmail);

    // RN-16: usuário desativado recebe a mesma resposta de credencial inválida.
    // RN-19: e-mail inexistente também conta como falha, para não revelar quais e-mails existem.
    if (!user || !user.active || !(await bcrypt.compare(password, user.password_hash))) {
      await this.throttle.registerFailure('login', normalizedEmail, { userId: user?.id ?? null });
      throw new UnauthorizedError('E-mail ou senha inválidos.');
    }
    await this.throttle.reset('login', normalizedEmail);

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
  async verifyApprover({ email, password } = {}, requester) {
    if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
      throw new DomainValidationError('Informe o e-mail e a senha do gerente.');
    }
    // RN-19: a chave é quem pede (o caixa), para que tentativas erradas não bloqueiem o login do gerente.
    await this.throttle.assertNotLocked('approval', requester.id);
    const approverEmail = email.trim().toLowerCase();
    const approver = await this.userRepository.findByEmail(approverEmail);
    if (
      !approver ||
      !approver.active ||
      !hasRole(approver, 'manager') ||
      !(await bcrypt.compare(password, approver.password_hash))
    ) {
      await this.throttle.registerFailure('approval', requester.id, {
        userId: requester.id,
        details: { approverEmail }
      });
      throw new ForbiddenError('Autorização recusada: e-mail ou senha do gerente incorretos, ou o usuário não é um gerente ativo.');
    }
    await this.throttle.reset('approval', requester.id);
    return { id: String(approver.id), name: approver.name };
  }
}
