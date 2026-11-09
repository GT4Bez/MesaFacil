import { DatabaseConnection } from '../database/DatabaseConnection.js';

export class UserRepository {
  constructor(database = DatabaseConnection.getInstance()) {
    this.database = database;
  }

  async findByEmail(email) {
    const { rows } = await this.database.query(
      `SELECT id, name, email, password_hash, role
       FROM users
       WHERE email = $1
       LIMIT 1`,
      [email]
    );
    return rows[0] ?? null;
  }

  async findById(id) {
    const { rows } = await this.database.query(
      `SELECT id, name, email, role
       FROM users
       WHERE id = $1
       LIMIT 1`,
      [id]
    );
    return rows[0] ?? null;
  }
}