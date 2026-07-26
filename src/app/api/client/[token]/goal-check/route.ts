import { NextRequest, NextResponse } from 'next/server'
import { getPool, genId } from '@/lib/pg-pool'

const GOAL_CHECK_PTS = 10

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id, total_score FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { date, achieved } = await req.json()
  if (!date) return NextResponse.json({ error: 'date required' }, { status: 400 })

  const { rows: [existing] } = await pool.query('SELECT id, goal_achieved FROM daily_reports WHERE client_id = $1 AND report_date = $2', [client.id, date])
  const newAchieved = achieved ? 1 : 0
  const prevAchieved = existing?.goal_achieved ?? 0

  if (existing) {
    await pool.query('UPDATE daily_reports SET goal_achieved = $1 WHERE id = $2', [newAchieved, existing.id])
  } else {
    await pool.query('INSERT INTO daily_reports (id,client_id,report_date,goal_achieved) VALUES ($1,$2,$3,$4)', [genId(), client.id, date, newAchieved])
  }

  const delta = (newAchieved - prevAchieved) * GOAL_CHECK_PTS
  if (delta !== 0) {
    await pool.query('UPDATE clients SET total_score = total_score + $1 WHERE id = $2', [delta, client.id])
  }

  const { rows: [updated] } = await pool.query('SELECT total_score FROM clients WHERE id = $1', [client.id])
  return NextResponse.json({ goal_achieved: newAchieved, total_score: updated.total_score, delta })
}
