import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { UserRepository } from '../repositories/UserRepository.js';
import { BadRequestError, UnauthorizedError } from '../errors/AppError.js';

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

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new UnauthorizedError('E-mail ou senha inválidos.');
    }

    const safeUser = {
      id: String(user.id),
      name: user.name,
      email: user.email,
      role: user.role
    };

    const token = jwt.sign(safeUser, env.jwtSecret, {
      expiresIn: env.jwtExpiresIn
    });

    return { token, user: safeUser };
  }
}