import { NextRequest, NextResponse } from 'next/server'
import { getPool, genId } from '@/lib/pg-pool'

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { date, memo } = await req.json()
  await pool.query(
    `INSERT INTO daily_reports (id,client_id,report_date,slots) VALUES ($1,$2,$3,$4)
     ON CONFLICT (client_id,report_date) DO UPDATE SET slots = EXCLUDED.slots`,
    [genId(), client.id, date, memo ?? '']
  )
  return NextResponse.json({ success: true })
}
