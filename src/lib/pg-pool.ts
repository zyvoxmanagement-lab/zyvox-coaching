import { Pool } from 'pg'
import crypto from 'crypto'

export function genId() { return crypto.randomUUID() }

let pool: Pool | null = null
let migrated = false

export function getPool(): Pool {
  if (!pool) {
    // 旧Neonホスト形式 postgres.PROJECT_ID → postgres.PROJECT_ID.cloud.neon.tech
    const raw = process.env.DATABASE_URL ?? ''
    // Handle port number: @postgres.ID/ or @postgres.ID:5432/
    const connectionString = raw.replace(
      /(@postgres\.[a-z0-9-]+)((?::\d+)?\/)/,
      '$1.cloud.neon.tech$2'
    )
    try {
      const u = new URL(connectionString)
      console.log('[pg-pool] host after fix:', u.hostname)
    } catch {}
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 5,
    })
  }
  if (!migrated) {
    migrated = true
    pool.query(`ALTER TABLE clients ADD COLUMN IF NOT EXISTS coaching_start_date DATE`).catch(() => {})
  }
  return pool
}
