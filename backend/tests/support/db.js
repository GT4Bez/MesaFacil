import './env.js'
import { readdir, readFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseConnection } from '../../src/database/DatabaseConnection.js'

const MIGRATIONS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '../../../sql/migrations')

const databaseName = () => new URL(process.env.TEST_DATABASE_URL).pathname.slice(1)

let schemaReady

// Recria o schema a partir de sql/migrations uma única vez por execução.
// Recusa qualquer banco cujo nome não termine em _test (proteção contra apagar dados reais).
export function setupSchema() {
  schemaReady ??= (async () => {
    if (!process.env.TEST_DATABASE_URL) {
      throw new Error('Defina TEST_DATABASE_URL (ex.: postgresql://mesafacil:mesafacil@localhost:5432/mesafacil_test).')
    }
    if (!databaseName().endsWith('_test')) {
      throw new Error(`TEST_DATABASE_URL deve apontar para um banco *_test (recebido: ${databaseName()}).`)
    }

    const db = DatabaseConnection.getInstance()
    await db.query('DROP SCHEMA IF EXISTS public CASCADE')
    await db.query('CREATE SCHEMA public')
    const files = (await readdir(MIGRATIONS_DIR)).filter((file) => file.endsWith('.sql')).sort()
    for (const file of files) {
      await db.query(await readFile(resolve(MIGRATIONS_DIR, file), 'utf8'))
    }
  })()
  return schemaReady
}

// Limpa todas as tabelas e reinicia os IDs, mantendo o schema.
export async function resetDb() {
  const db = DatabaseConnection.getInstance()
  const { rows } = await db.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)
  if (rows.length === 0) return
  const tables = rows.map(({ tablename }) => `"${tablename}"`).join(', ')
  await db.query(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`)
}

export const query = (text, params) => DatabaseConnection.getInstance().query(text, params)
