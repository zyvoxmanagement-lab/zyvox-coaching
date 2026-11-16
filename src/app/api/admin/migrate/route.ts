import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/pg-pool'

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({}))
  if (password !== (process.env.ADMIN_PASSWORD ?? 'zyvox2024')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const pool = getPool()
  await pool.query(`
    CREATE TABLE IF NOT EXISTS goal_history (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      goal_type TEXT NOT NULL,
      period_label TEXT,
      content TEXT NOT NULL,
      saved_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query('CREATE INDEX IF NOT EXISTS goal_history_client_idx ON goal_history(client_id, goal_type, period_label, saved_at DESC)')
  return NextResponse.json({ success: true })
}
