import { BadRequestError, ConflictError, DomainValidationError } from './AppError.js'

// Códigos SQLSTATE do PostgreSQL: https://www.postgresql.org/docs/16/errcodes-appendix.html
const UNIQUE_VIOLATION = '23505'
const FOREIGN_KEY_VIOLATION = '23503'
const CHECK_VIOLATION = '23514'
const NOT_NULL_VIOLATION = '23502'
const INVALID_TEXT_REPRESENTATION = '22P02'
const NUMERIC_VALUE_OUT_OF_RANGE = '22003'

// Spec 021: mensagens das restrições únicas conhecidas (os services tratam as principais antes).
const UNIQUE_MESSAGES = {
  users_email_key: 'Já existe um usuário com este e-mail.',
  ingredients_name_unique_idx: 'Já existe um insumo com esse nome.',
  shifts_single_open_idx: 'Já existe um turno aberto.',
  orders_single_active_per_table_idx: 'A mesa já possui um pedido aberto.',
  shift_counts_unique: 'A contagem deste turno já foi registrada. Atualize a tela.',
  cash_movements_single_float_idx: 'O fundo de troco deste turno já foi registrado.'
}

/**
 * Verifica se o erro veio do driver `pg` com o SQLSTATE (e, opcionalmente, a constraint) informado.
 * Útil nos services para dar mensagens específicas de regra de negócio, por exemplo:
 *   if (isPgError(err, '23505', 'shifts_single_open_idx')) throw new ConflictError('Já existe um turno aberto.')
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
      return new ConflictError(
        UNIQUE_MESSAGES[error.constraint] ?? 'Já existe um cadastro com esses dados (nome, e-mail ou número repetido).'
      )
    case FOREIGN_KEY_VIOLATION:
      // Inserir referência inexistente (422) x apagar/alterar registro ainda referenciado (409).
      return String(error.detail ?? '').includes('is not present in')
        ? new DomainValidationError('Um dos itens escolhidos (mesa, item, insumo ou usuário) não existe mais. Atualize a tela e tente de novo.')
        : new ConflictError('Este cadastro já é usado em pedidos ou movimentos e não pode ser apagado. Desative-o em vez de apagar.')
    case CHECK_VIOLATION:
    case NOT_NULL_VIOLATION:
      return new DomainValidationError(
        'Algum valor está fora do permitido (por exemplo, negativo, em branco ou com opção inexistente). Confira os campos e tente de novo.'
      )
    case INVALID_TEXT_REPRESENTATION:
      return new BadRequestError('Um identificador ou valor veio em formato inválido (por exemplo, letras onde se espera um número).')
    // Ex.: quantidade × ficha técnica ou saldo de estoque além do que a coluna comporta (RN-15).
    case NUMERIC_VALUE_OUT_OF_RANGE:
      return new DomainValidationError('Um valor passou do limite permitido (número grande demais). Confira as quantidades e valores.')
    default:
      return null
  }
}