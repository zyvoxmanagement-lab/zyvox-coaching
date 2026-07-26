import { NextRequest, NextResponse } from 'next/server'
import { getPool, genId } from '@/lib/pg-pool'

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { content, week_start } = await req.json()
  await pool.query(
    `INSERT INTO client_goals (id,client_id,goal_type,period_label,content,point_value) VALUES ($1,$2,'weekly_memo',$3,$4,0)
     ON CONFLICT DO NOTHING`,
    [genId(), client.id, week_start, content]
  )
  await pool.query("UPDATE client_goals SET content = $1 WHERE client_id = $2 AND goal_type = 'weekly_memo' AND period_label = $3", [content, client.id, week_start])
  return NextResponse.json({ success: true })
}
