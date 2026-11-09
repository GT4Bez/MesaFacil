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
  constructor(message = 'Requisição inválida.') { super(message, 400, 'BAD_REQUEST'); }
}
export class UnauthorizedError extends AppError {
  constructor(message = 'Não autorizado.') { super(message, 401, 'UNAUTHORIZED'); }
}
export class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado.') { super(message, 403, 'FORBIDDEN'); }
}
export class NotFoundError extends AppError {
  constructor(message = 'Registro não encontrado.') { super(message, 404, 'NOT_FOUND'); }
}
export class ConflictError extends AppError {
  constructor(message = 'Conflito de dados.') { super(message, 409, 'CONFLICT'); }
}
export class DomainValidationError extends AppError {
  constructor(message = 'Dados inválidos.') { super(message, 422, 'VALIDATION_ERROR'); }
}