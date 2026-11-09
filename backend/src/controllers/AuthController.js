import { AuthService } from '../services/AuthService.js';

export class AuthController {
  constructor(authService = new AuthService()) {
    this.authService = authService;
    this.login = this.login.bind(this);
  }

  async login(req, res, next) {
    try {
      const result = await this.authService.login(req.body);
      return res.status(200).json({ success: true, data: result });
    } catch (error) {
      return next(error);
    }
  }
}