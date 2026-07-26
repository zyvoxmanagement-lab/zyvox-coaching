import { Pool } from 'pg'
import crypto from 'crypto'

export function genId() { return crypto.randomUUID() }

let pool: Pool | null = null

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
    })
  }
  return pool
}
