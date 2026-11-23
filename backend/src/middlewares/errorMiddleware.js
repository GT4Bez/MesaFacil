import { randomUUID } from 'node:crypto'
import { AppError, BadRequestError } from '../errors/AppError.js'
import { translatePgError } from '../errors/pgErrors.js'

function normalize(error) {
  if (error instanceof AppError) return error
  // JSON malformado no corpo (express.json) é erro do cliente, não do servidor.
  if (error?.type === 'entity.parse.failed') {
    return new BadRequestError('O corpo da requisição não é um JSON válido. Confira vírgulas, aspas e chaves.')
  }
  return translatePgError(error)
}

export function errorMiddleware(error, req, res, next) {
  if (res.headersSent) return next(error)

  const appError = normalize(error)
  if (appError) {
    return res.status(appError.statusCode).json({
      success: false,
      error: appError.message,
      code: appError.code,
    })
  }

  // Spec 021: o código liga a mensagem que a pessoa viu à linha do log com a causa.
  const reference = randomUUID().slice(0, 8).toUpperCase()
  console.error(`[erro ${reference}] ${req.method} ${req.originalUrl}`, error)
  return res.status(500).json({
    success: false,
    error: `Erro inesperado no servidor. Tente de novo; se continuar, informe o código ${reference} ao suporte.`,
    code: 'INTERNAL_ERROR',
    reference,
  })
}
