import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/pg-pool'
import { cookies } from 'next/headers'

export async function POST(req: NextRequest) {
  const c = await cookies()
  if (c.get('admin_auth')?.value !== 'ok') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
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
