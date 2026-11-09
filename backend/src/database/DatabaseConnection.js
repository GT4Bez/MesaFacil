import pg from 'pg';
import { env } from '../config/env.js';

const { Pool } = pg;

export class DatabaseConnection {
  static instance;

  constructor() {
    if (DatabaseConnection.instance) return DatabaseConnection.instance;
    this.pool = new Pool({ connectionString: env.databaseUrl });
    DatabaseConnection.instance = this;
  }

  static getInstance() {
    return DatabaseConnection.instance ?? new DatabaseConnection();
  }

  query(text, params = []) {
    return this.pool.query(text, params);
  }

  async withTransaction(callback) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
    DatabaseConnection.instance = null;
  }
}