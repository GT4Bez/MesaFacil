import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { TEST_PASSWORD } from './env.js'
import { query } from './db.js'

const ROLE_NAMES = { waiter: 'Garçom', kitchen: 'Cozinha', cashier: 'Caixa', manager: 'Gerente' }
const ROLE_EMAILS = { waiter: 'garcom', kitchen: 'cozinha', cashier: 'caixa', manager: 'gerente' }

let passwordHash

export async function createUser(role, overrides = {}) {
  passwordHash ??= await bcrypt.hash(TEST_PASSWORD, 4)
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, email, role`,
    [
      overrides.name ?? ROLE_NAMES[role],
      overrides.email ?? `${ROLE_EMAILS[role]}@mesafacil.com`,
      passwordHash,
      role,
    ]
  )
  return { ...rows[0], id: String(rows[0].id) }
}

export const tokenFor = (user) =>
  jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role }, process.env.JWT_SECRET)

// Um usuário por papel, com token pronto para as chamadas HTTP.
export async function createStaff() {
  const staff = {}
  for (const role of Object.keys(ROLE_NAMES)) {
    const user = await createUser(role)
    staff[role] = { ...user, token: tokenFor(user) }
  }
  return staff
}

export async function createTables(count = 2) {
  const ids = []
  for (let number = 1; number <= count; number++) {
    const { rows } = await query(`INSERT INTO tables (number) VALUES ($1) RETURNING id`, [number])
    ids.push(String(rows[0].id))
  }
  return ids
}

export async function createMenuItem({ name = 'Prato', category = 'Pratos', price = 10, available = true } = {}) {
  const { rows } = await query(
    `INSERT INTO menu_items (name, category, price, available) VALUES ($1, $2, $3, $4) RETURNING id`,
    [name, category, price, available]
  )
  return String(rows[0].id)
}
