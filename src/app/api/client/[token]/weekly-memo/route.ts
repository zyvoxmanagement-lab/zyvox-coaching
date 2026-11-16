import { NextRequest, NextResponse } from 'next/server'
import { getPool, genId } from '@/lib/pg-pool'

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const week_start = req.nextUrl.searchParams.get('week_start')
  if (!week_start) return NextResponse.json({ content: null })
  const { rows: [row] } = await pool.query(
    "SELECT content FROM client_goals WHERE client_id=$1 AND goal_type='weekly_memo' AND period_label=$2",
    [client.id, week_start]
  )
  return NextResponse.json({ content: row?.content ?? null })
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { content, week_start } = await req.json()
  const { rows: [existing] } = await pool.query(
    "SELECT content FROM client_goals WHERE client_id=$1 AND goal_type='weekly_memo' AND period_label=$2",
    [client.id, week_start]
  )
  if (existing?.content && existing.content !== content) {
    await pool.query(
      "INSERT INTO goal_history (id,client_id,goal_type,period_label,content) VALUES ($1,$2,'weekly_memo',$3,$4)",
      [genId(), client.id, week_start, existing.content]
    ).catch(() => {})
  }
  await pool.query(
    `INSERT INTO client_goals (id,client_id,goal_type,period_label,content,point_value)
     SELECT $1,$2,'weekly_memo',$3,$4,0
     WHERE NOT EXISTS (SELECT 1 FROM client_goals WHERE client_id=$2 AND goal_type='weekly_memo' AND period_label=$3)`,
    [genId(), client.id, week_start, content]
  )
  await pool.query("UPDATE client_goals SET content = $1 WHERE client_id = $2 AND goal_type = 'weekly_memo' AND period_label = $3", [content, client.id, week_start])
  return NextResponse.json({ success: true })
}
