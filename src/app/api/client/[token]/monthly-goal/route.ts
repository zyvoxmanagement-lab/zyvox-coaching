import { NextRequest, NextResponse } from 'next/server'
import { getPool, genId } from '@/lib/pg-pool'

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { content, period_label } = await req.json()
  await pool.query(
    `INSERT INTO client_goals (id,client_id,goal_type,period_label,content,point_value) VALUES ($1,$2,'monthly',$3,$4,0)
     ON CONFLICT DO NOTHING`,
    [genId(), client.id, period_label, content]
  )
  await pool.query("UPDATE client_goals SET content = $1 WHERE client_id = $2 AND goal_type = 'monthly' AND period_label = $3", [content, client.id, period_label])
  return NextResponse.json({ success: true })
}

export async function GET(_: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { rows } = await pool.query("SELECT * FROM client_goals WHERE client_id = $1 AND goal_type = 'monthly' AND period_label != 'reward' ORDER BY period_label DESC", [client.id])
  return NextResponse.json(rows)
}
