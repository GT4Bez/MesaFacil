import { AppError } from '../errors/AppError.js';

export function errorMiddleware(error, req, res, next) {
  if (res.headersSent) return next(error);

  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code
    });
  }

  console.error(error);
  return res.status(500).json({
    success: false,
    error: 'Ocorreu um erro interno no servidor.',
    code: 'INTERNAL_ERROR'
  });
}