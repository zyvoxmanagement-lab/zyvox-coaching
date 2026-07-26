import { NextRequest, NextResponse } from 'next/server'
import { getPool, genId } from '@/lib/pg-pool'

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const pool = getPool()
  const body = await req.json()
  await pool.query('DELETE FROM client_goals WHERE client_id = $1 AND goal_type = $2', [params.id, body.goal_type])
  for (const g of (body.goals ?? [])) {
    await pool.query('INSERT INTO client_goals (id, client_id, goal_type, content, point_value, period_label) VALUES ($1,$2,$3,$4,$5,$6)', [genId(), params.id, body.goal_type, g.content, g.point_value ?? 0, g.period_label ?? null])
  }
  const { rows } = await pool.query('SELECT * FROM client_goals WHERE client_id = $1 AND goal_type = $2', [params.id, body.goal_type])
  return NextResponse.json(rows)
}
