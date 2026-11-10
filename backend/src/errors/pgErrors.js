import { BadRequestError, ConflictError, DomainValidationError } from './AppError.js'

// Códigos SQLSTATE do PostgreSQL: https://www.postgresql.org/docs/16/errcodes-appendix.html
const UNIQUE_VIOLATION = '23505'
const FOREIGN_KEY_VIOLATION = '23503'
const CHECK_VIOLATION = '23514'
const NOT_NULL_VIOLATION = '23502'
const INVALID_TEXT_REPRESENTATION = '22P02'

/**
 * Verifica se o erro veio do driver `pg` com o SQLSTATE (e, opcionalmente, a constraint) informado.
 * Útil nos services para dar mensagens específicas de regra de negócio, por exemplo:
 *   if (isPgError(err, '23505', 'shifts_only_one_open_idx')) throw new ConflictError('Já existe um turno aberto.')
 */
export function isPgError(error, code, constraint) {
  if (!error || error.code !== code) return false
  return constraint === undefined || error.constraint === constraint
}

/**
 * Traduz erros do PostgreSQL em AppError com mensagem genérica (sem vazar tabela, coluna ou SQL).
 * Retorna null se o erro não for um erro conhecido do banco.
 */
export function translatePgError(error) {
  if (!error || typeof error.code !== 'string') return null

  switch (error.code) {
    case UNIQUE_VIOLATION:
      return new ConflictError('Já existe um registro com esses dados.')
    case FOREIGN_KEY_VIOLATION:
      // Inserir referência inexistente (422) x apagar/alterar registro ainda referenciado (409).
      return String(error.detail ?? '').includes('is not present in')
        ? new DomainValidationError('Um dos registros referenciados não existe.')
        : new ConflictError('O registro está relacionado a outros dados.')
    case CHECK_VIOLATION:
    case NOT_NULL_VIOLATION:
      return new DomainValidationError('Dados inválidos.')
    case INVALID_TEXT_REPRESENTATION:
      return new BadRequestError('Formato de identificador ou valor inválido.')
    default:
      return null
  }
}