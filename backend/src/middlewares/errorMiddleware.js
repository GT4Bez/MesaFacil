import { AppError, BadRequestError } from '../errors/AppError.js'
import { translatePgError } from '../errors/pgErrors.js'

function normalize(error) {
  if (error instanceof AppError) return error
  // JSON malformado no corpo (express.json) é erro do cliente, não do servidor.
  if (error?.type === 'entity.parse.failed') return new BadRequestError('JSON inválido no corpo da requisição.')
  return translatePgError(error)
}

export function errorMiddleware(error, req, res, next) {
  if (res.headersSent) return next(error)

  const appError = normalize(error)
  if (appError) {
    return res.status(appError.statusCode).json({
      success: false,
      error: { code: appError.code, message: appError.message },
    })
  }

  console.error(error)
  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Ocorreu um erro interno no servidor.',
    },
  })
}