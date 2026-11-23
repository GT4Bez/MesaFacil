export class AppError extends Error {
  constructor(message, statusCode = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'A requisição veio incompleta ou em formato inválido.') { super(message, 400, 'BAD_REQUEST'); }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Você não está logado. Faça login para continuar.') { super(message, 401, 'UNAUTHORIZED'); }
}
export class ForbiddenError extends AppError {
  constructor(message = 'Seu usuário não tem permissão para esta ação.') { super(message, 403, 'FORBIDDEN'); }
}
export class NotFoundError extends AppError {
  constructor(message = 'Não encontrado: o registro pode ter sido removido. Atualize a tela.') { super(message, 404, 'NOT_FOUND'); }
}
export class ConflictError extends AppError {
  constructor(message = 'A ação não combina com o estado atual dos dados. Atualize a tela e tente de novo.') { super(message, 409, 'CONFLICT'); }
}
export class DomainValidationError extends AppError {
  constructor(message = 'Algum campo está inválido. Confira os dados e tente de novo.') { super(message, 422, 'VALIDATION_ERROR'); }
}

// RN-19: chave bloqueada por excesso de tentativas de senha.
export class TooManyAttemptsError extends AppError {
  constructor(message = 'Muitas tentativas. Tente novamente mais tarde.') { super(message, 429, 'TOO_MANY_ATTEMPTS'); }
}
