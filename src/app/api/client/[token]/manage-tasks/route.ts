import { NextRequest, NextResponse } from 'next/server'
import { getPool, genId } from '@/lib/pg-pool'

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { content, point_value } = await req.json()
  if (!content?.trim()) return NextResponse.json({ error: 'タスク名を入力してください' }, { status: 400 })
  const id = genId()
  await pool.query("INSERT INTO client_goals (id,client_id,goal_type,content,point_value) VALUES ($1,$2,'tasks',$3,$4)", [id, client.id, content.trim(), point_value ?? 10])
  const { rows: [row] } = await pool.query('SELECT * FROM client_goals WHERE id = $1', [id])
  return NextResponse.json(row, { status: 201 })
}

export async function PATCH(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { task_id, content, point_value } = await req.json()
  if (!task_id) return NextResponse.json({ error: 'task_id required' }, { status: 400 })
  await pool.query(
    'UPDATE client_goals SET content = COALESCE($1, content), point_value = COALESCE($2, point_value) WHERE id = $3 AND client_id = $4',
    [content ?? null, point_value ?? null, task_id, client.id]
  )
  const { rows: [row] } = await pool.query('SELECT * FROM client_goals WHERE id = $1', [task_id])
  return NextResponse.json(row)
}

export async function DELETE(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { task_id } = await req.json()
  await pool.query("DELETE FROM client_goals WHERE id = $1 AND client_id = $2 AND goal_type = 'tasks'", [task_id, client.id])
  return NextResponse.json({ success: true })
}
