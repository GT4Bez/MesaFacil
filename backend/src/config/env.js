import dotenv from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(currentDirectory, '../../../.env') });

const required = ['DATABASE_URL', 'JWT_SECRET'];
for (const key of required) {
  if (!process.env[key] || process.env[key] === 'changeme') {
    throw new Error(`Variável de ambiente obrigatória não configurada: ${key}`);
  }
}

const port = Number(process.env.PORT ?? 3001);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT deve ser um número entre 1 e 65535.');
}

// RN-18 (spec 014): sangria do caixa acima deste valor exige a autorização do gerente.
const rawWithdrawalLimit = process.env.CASH_WITHDRAWAL_APPROVAL_LIMIT;
const cashWithdrawalApprovalLimit =
  rawWithdrawalLimit === undefined || rawWithdrawalLimit.trim() === '' ? 200 : Number(rawWithdrawalLimit);
if (!Number.isFinite(cashWithdrawalApprovalLimit) || cashWithdrawalApprovalLimit < 0) {
  throw new Error('CASH_WITHDRAWAL_APPROVAL_LIMIT deve ser um número maior ou igual a 0.');
}

export const env = Object.freeze({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port,
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  cashWithdrawalApprovalLimit: Math.round(cashWithdrawalApprovalLimit * 100) / 100,
  // Origens permitidas no CORS, separadas por vírgula. Padrão: dev server do Vite.
  corsOrigins: (process.env.CORS_ORIGIN ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
});