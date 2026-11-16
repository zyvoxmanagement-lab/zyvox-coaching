import { NextRequest, NextResponse } from 'next/server'
import { getPool, genId } from '@/lib/pg-pool'

export async function GET(_: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { rows: [row] } = await pool.query(
    "SELECT content FROM client_goals WHERE client_id = $1 AND goal_type = 'execution_plan' LIMIT 1",
    [client.id]
  )
  return NextResponse.json({ versions: row?.content ? JSON.parse(row.content) : null })
}

export async function PUT(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { versions } = await req.json()
  const content = JSON.stringify(versions)
  const { rows: [existing] } = await pool.query(
    "SELECT id FROM client_goals WHERE client_id = $1 AND goal_type = 'execution_plan' LIMIT 1",
    [client.id]
  )
  if (existing) {
    await pool.query('UPDATE client_goals SET content = $1 WHERE id = $2', [content, existing.id])
  } else {
    await pool.query(
      'INSERT INTO client_goals (id, client_id, goal_type, content, point_value) VALUES ($1, $2, $3, $4, 0)',
      [genId(), client.id, 'execution_plan', content]
    )
  }
  return NextResponse.json({ ok: true })
}
