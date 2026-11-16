import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/pg-pool'

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekRange(startDay: number, anchorDate?: string) {
  const anchor = anchorDate ? new Date(anchorDate) : new Date()
  const day = anchor.getDay()
  const daysBack = (day - startDay + 7) % 7
  const start = new Date(anchor); start.setDate(anchor.getDate() - daysBack)
  const end = new Date(start); end.setDate(start.getDate() + 6)
  return { start: localDate(start), end: localDate(end) }
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const weekStartDay = parseInt(req.nextUrl.searchParams.get('weekStart') ?? '1')
  const weekDate = req.nextUrl.searchParams.get('weekDate') ?? undefined
  const { rows: [client] } = await pool.query('SELECT id, name, total_score, current_level FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { start, end } = getWeekRange(weekStartDay, weekDate)
  const { rows: goals } = await pool.query('SELECT * FROM client_goals WHERE client_id = $1', [client.id])
  const { rows: [idealMap] } = await pool.query('SELECT * FROM ideal_maps WHERE client_id = $1 AND deleted_at IS NULL ORDER BY map_date DESC, id DESC LIMIT 1', [client.id])
  const { rows: completions } = await pool.query('SELECT task_id, slot_id, completion_date, completed FROM daily_completions WHERE client_id = $1 AND completion_date >= $2 AND completion_date <= $3', [client.id, start, end])
  const { rows: reports } = await pool.query('SELECT * FROM daily_reports WHERE client_id = $1 AND report_date >= $2 AND report_date <= $3 ORDER BY report_date DESC', [client.id, start, end])
  return NextResponse.json({ ...client, ideal_maps: idealMap ?? null, client_goals: goals, weekly_completions: completions, daily_reports: reports, week_start: start, week_end: end })
}
