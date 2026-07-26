import { NextRequest, NextResponse } from 'next/server'
import { getPool, genId } from '@/lib/pg-pool'

export async function GET(_: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { rows } = await pool.query("SELECT * FROM client_goals WHERE client_id = $1 AND goal_type = 'monthly' AND period_label = 'reward' ORDER BY sort_order ASC, point_value ASC", [client.id])
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { content, point_value } = await req.json()
  const id = genId()
  const { rows: [maxRow] } = await pool.query("SELECT MAX(sort_order) as m FROM client_goals WHERE client_id = $1 AND period_label = 'reward'", [client.id])
  const nextOrder = (maxRow.m ?? -1) + 1
  await pool.query("INSERT INTO client_goals (id,client_id,goal_type,period_label,content,point_value,sort_order) VALUES ($1,$2,'monthly','reward',$3,$4,$5)", [id, client.id, content, point_value, nextOrder])
  const { rows: [row] } = await pool.query('SELECT * FROM client_goals WHERE id = $1', [id])
  return NextResponse.json(row)
}

export async function PATCH(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json()
  if (Array.isArray(body)) {
    for (const { id, sort_order } of body) {
      await pool.query("UPDATE client_goals SET sort_order = $1 WHERE id = $2 AND client_id = $3 AND period_label = 'reward'", [sort_order, id, client.id])
    }
    return NextResponse.json({ success: true })
  }
  const { id, content, point_value } = body
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  if (content !== undefined) await pool.query("UPDATE client_goals SET content = $1 WHERE id = $2 AND client_id = $3 AND period_label = 'reward'", [content, id, client.id])
  if (point_value !== undefined) await pool.query("UPDATE client_goals SET point_value = $1 WHERE id = $2 AND client_id = $3 AND period_label = 'reward'", [point_value, id, client.id])
  const { rows: [row] } = await pool.query('SELECT * FROM client_goals WHERE id = $1', [id])
  return NextResponse.json(row)
}

export async function DELETE(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { id } = await req.json()
  await pool.query("DELETE FROM client_goals WHERE id = $1 AND client_id = $2 AND period_label = 'reward'", [id, client.id])
  return NextResponse.json({ success: true })
}
