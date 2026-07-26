import { NextRequest, NextResponse } from 'next/server'
import { getPool, genId } from '@/lib/pg-pool'
import { getLevelFromScore } from '@/lib/level-system'

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { task_id, slot_id, completion_date, completed } = await req.json()
  const key = slot_id ?? task_id
  await pool.query(
    `INSERT INTO daily_completions (id,client_id,task_id,slot_id,completion_date,completed) VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (slot_id,completion_date) DO UPDATE SET completed = EXCLUDED.completed`,
    [genId(), client.id, task_id, key, completion_date, completed ? 1 : 0]
  )
  const { rows: completions } = await pool.query('SELECT task_id FROM daily_completions WHERE client_id = $1 AND completed = 1', [client.id])
  let taskScore = 0
  for (const c of completions) {
    const { rows: [g] } = await pool.query('SELECT point_value FROM client_goals WHERE id = $1', [c.task_id])
    taskScore += g?.point_value ?? 0
  }
  const { rows: [rep] } = await pool.query('SELECT COALESCE(SUM(score),0) as s FROM daily_reports WHERE client_id = $1', [client.id])
  const total = taskScore + Number(rep.s)
  const level = getLevelFromScore(total)
  await pool.query('UPDATE clients SET total_score = $1, current_level = $2 WHERE id = $3', [total, level, client.id])
  return NextResponse.json({ total_score: total, current_level: level })
}
