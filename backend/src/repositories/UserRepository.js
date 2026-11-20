import { DatabaseConnection } from '../database/DatabaseConnection.js';

const PUBLIC_COLUMNS = 'id, name, email, role, active, created_at';

// Formato público do usuário: nunca inclui o hash da senha.
const toUser = (row) => row && {
  id: String(row.id),
  name: row.name,
  email: row.email,
  role: row.role,
  active: row.active,
  createdAt: row.created_at
};

export class UserRepository {
  constructor(database = DatabaseConnection.getInstance()) {
    this.database = database;
  }

  transaction(callback) {
    return this.database.withTransaction(callback);
  }

  // Usado só no login: inclui hash, situação e versão do token.
  async findByEmail(email) {
    const { rows } = await this.database.query(
      `SELECT id, name, email, password_hash, role, active, token_version
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );
    return rows[0] ?? null;
  }

  // Conferência feita pelo middleware a cada requisição (RN-16).
  async findSessionUser(id) {
    if (!/^\d+$/.test(String(id ?? ''))) return null;
    const { rows } = await this.database.query(
      `SELECT id, name, email, role, active, token_version FROM users WHERE id = $1`,
      [id]
    );
    const row = rows[0];
    return row && {
      id: String(row.id),
      name: row.name,
      email: row.email,
      role: row.role,
      active: row.active,
      tokenVersion: row.token_version
    };
  }

  async findById(id, { lock = false } = {}, db = this.database) {
    const { rows } = await db.query(
      `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1 ${lock ? 'FOR UPDATE' : ''}`,
      [id]
    );
    return toUser(rows[0]) ?? null;
  }

  async findPasswordHash(id, db = this.database) {
    const { rows } = await db.query(`SELECT password_hash FROM users WHERE id = $1 FOR UPDATE`, [id]);
    return rows[0]?.password_hash ?? null;
  }

  async findAll({ role, active } = {}) {
    const conditions = [];
    const params = [];
    if (role !== undefined) {
      params.push(role);
      conditions.push(`role = $${params.length}`);
    }
    if (active !== undefined) {
      params.push(active);
      conditions.push(`active = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await this.database.query(
      `SELECT ${PUBLIC_COLUMNS} FROM users ${where} ORDER BY name, id`,
      params
    );
    return rows.map(toUser);
  }

  // Trava os admins ativos (em ordem fixa) para que duas alterações simultâneas
  // não deixem o sistema sem nenhum admin (RN-16).
  async lockActiveAdminIds(db) {
    const { rows } = await db.query(
      `SELECT id FROM users WHERE role = 'admin' AND active ORDER BY id FOR UPDATE`
    );
    return rows.map((row) => String(row.id));
  }

  async create({ name, email, role, passwordHash }, db = this.database) {
    const { rows } = await db.query(
      `INSERT INTO users (name, email, role, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING ${PUBLIC_COLUMNS}`,
      [name, email, role, passwordHash]
    );
    return toUser(rows[0]);
  }

  // `fields` só contém colunas já validadas pelo service (name, email, role, active).
  async update(id, fields, { revokeSessions = false } = {}, db = this.database) {
    const columns = Object.keys(fields);
    const assignments = columns.map((column, index) => `${column} = $${index + 2}`);
    if (revokeSessions) assignments.push('token_version = token_version + 1');
    const { rows } = await db.query(
      `UPDATE users SET ${assignments.join(', ')} WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`,
      [id, ...columns.map((column) => fields[column])]
    );
    return toUser(rows[0]) ?? null;
  }

  // Trocar a senha sempre revoga os tokens emitidos antes.
  async updatePassword(id, passwordHash, db = this.database) {
    const { rowCount } = await db.query(
      `UPDATE users SET password_hash = $2, token_version = token_version + 1 WHERE id = $1`,
      [id, passwordHash]
    );
    return rowCount > 0;
  }
}
