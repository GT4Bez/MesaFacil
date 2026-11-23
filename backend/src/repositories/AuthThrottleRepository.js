import { DatabaseConnection } from '../database/DatabaseConnection.js';

// RN-19 (spec 015): contagem de falhas de senha por escopo e chave.
// Janela e bloqueio usam o relógio do banco (now()), o mesmo para todas as instâncias da API.
export class AuthThrottleRepository {
  constructor(database = DatabaseConnection.getInstance()) {
    this.database = database;
  }

  transaction(callback) {
    return this.database.withTransaction(callback);
  }

  // Minutos restantes do bloqueio (arredondados para cima) ou null se a chave está livre.
  async lockedMinutes(scope, key, db = this.database) {
    const { rows } = await db.query(
      `SELECT CEIL(EXTRACT(EPOCH FROM locked_until - now()) / 60)::int AS minutes
       FROM auth_throttles
       WHERE scope = $1 AND key = $2 AND locked_until > now()`,
      [scope, key]
    );
    return rows[0] ? Math.max(rows[0].minutes, 1) : null;
  }

  // Soma uma falha numa única instrução (o upsert trava a linha). Janela vencida (e sem bloqueio
  // ativo) recomeça do 1; uma falha que chegue durante o bloqueio não o desfaz.
  // Ao chegar em `maxFailures`, grava o bloqueio uma única vez; `lockedNow` indica essa transição.
  async registerFailure(scope, key, { maxFailures, minutes }, db = this.database) {
    const interval = `${minutes} minutes`;
    const { rows } = await db.query(
      `INSERT INTO auth_throttles AS t (scope, key, failures, window_started_at)
       VALUES ($1, $2, 1, now())
       ON CONFLICT (scope, key) DO UPDATE SET
         failures = CASE WHEN (t.window_started_at <= now() - $3::interval AND COALESCE(t.locked_until <= now(), true)) THEN 1 ELSE t.failures + 1 END,
         window_started_at = CASE WHEN (t.window_started_at <= now() - $3::interval AND COALESCE(t.locked_until <= now(), true)) THEN now() ELSE t.window_started_at END,
         locked_until = CASE WHEN (t.window_started_at <= now() - $3::interval AND COALESCE(t.locked_until <= now(), true)) THEN NULL ELSE t.locked_until END
       RETURNING failures`,
      [scope, key, interval]
    );
    if (rows[0].failures < maxFailures) return { lockedNow: false };
    const locked = await db.query(
      `UPDATE auth_throttles SET locked_until = now() + $3::interval
       WHERE scope = $1 AND key = $2 AND locked_until IS NULL
       RETURNING locked_until`,
      [scope, key, interval]
    );
    return { lockedNow: locked.rowCount === 1 };
  }

  async reset(scope, key, db = this.database) {
    await db.query(`DELETE FROM auth_throttles WHERE scope = $1 AND key = $2`, [scope, key]);
  }

  // Desbloqueio pelo admin: login (pelo e-mail atual) e troca de senha do usuário.
  async resetUser(userId, db = this.database) {
    await db.query(
      `DELETE FROM auth_throttles
       WHERE (scope = 'password_change' AND key = $1::text)
          OR (scope = 'login' AND key = (SELECT email FROM users WHERE id = $1::bigint))`,
      [String(userId)]
    );
  }
}
