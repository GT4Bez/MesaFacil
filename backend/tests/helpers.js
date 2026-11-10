// Deve ser importado ANTES de qualquer módulo de src/ (env.js valida as variáveis ao carregar).
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test'
process.env.JWT_SECRET = 'segredo-de-teste-nao-usar-em-producao'
process.env.JWT_EXPIRES_IN = '1h'
process.env.CORS_ORIGIN = 'http://localhost:5173, http://127.0.0.1:5173'

export const TEST_PASSWORD = '123'