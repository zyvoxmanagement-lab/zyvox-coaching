import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/pg-pool'

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekRange() {
  const today = new Date()
  const day = today.getDay()
  const daysBack = day === 0 ? 6 : day - 1
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - daysBack)
  const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)
  return { ws: localDate(weekStart), we: localDate(weekEnd) }
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const pool = getPool()
  const { id } = params
  const { ws, we } = getWeekRange()
  const { rows: [client] } = await pool.query('SELECT * FROM clients WHERE id = $1', [id])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { rows: [idealMap] } = await pool.query('SELECT * FROM ideal_maps WHERE client_id = $1 AND deleted_at IS NULL ORDER BY map_date DESC LIMIT 1', [id])
  const { rows: goals } = await pool.query('SELECT * FROM client_goals WHERE client_id = $1', [id])
  const { rows: reports } = await pool.query('SELECT * FROM daily_reports WHERE client_id = $1 ORDER BY report_date DESC', [id])
  const { rows: meetings } = await pool.query('SELECT * FROM monthly_meetings WHERE client_id = $1 ORDER BY meeting_date DESC', [id])
  const { rows: completions } = await pool.query('SELECT task_id, completion_date, completed FROM daily_completions WHERE client_id = $1 AND completion_date >= $2 AND completion_date <= $3', [id, ws, we])
  return NextResponse.json({ ...client, ideal_maps: idealMap ?? null, client_goals: goals, daily_reports: reports, monthly_meetings: meetings, weekly_completions: completions, week_start: ws, week_end: we })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const pool = getPool()
  const body = await req.json()
  const keys = Object.keys(body)
  const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
  await pool.query(`UPDATE clients SET ${setClauses} WHERE id = $${keys.length + 1}`, [...Object.values(body), params.id])
  const { rows: [row] } = await pool.query('SELECT * FROM clients WHERE id = $1', [params.id])
  return NextResponse.json(row)
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const pool = getPool()
  await pool.query('DELETE FROM clients WHERE id = $1', [params.id])
  return NextResponse.json({ success: true })
}
