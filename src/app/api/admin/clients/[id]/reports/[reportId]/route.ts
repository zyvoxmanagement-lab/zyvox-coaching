import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/pg-pool'
import { getLevelFromScore } from '@/lib/level-system'

export async function PATCH(req: NextRequest, { params }: { params: { id: string; reportId: string } }) {
  const pool = getPool()
  const body = await req.json()
  await pool.query(
    'UPDATE daily_reports SET coach_fb = $1, coach_ff = $2, score = $3 WHERE id = $4 AND client_id = $5',
    [body.coach_fb ?? null, body.coach_ff ?? null, body.score ?? 0, params.reportId, params.id]
  )
  if (body.score !== undefined) {
    const { rows: [rep] } = await pool.query('SELECT COALESCE(SUM(score),0) as s FROM daily_reports WHERE client_id = $1', [params.id])
    const { rows: completions } = await pool.query('SELECT task_id FROM daily_completions WHERE client_id = $1 AND completed = 1', [params.id])
    let taskScore = 0
    for (const c of completions) {
      const { rows: [g] } = await pool.query('SELECT point_value FROM client_goals WHERE id = $1', [c.task_id])
      taskScore += g?.point_value ?? 0
    }
    const total = Number(rep.s) + taskScore
    await pool.query('UPDATE clients SET total_score = $1, current_level = $2 WHERE id = $3', [total, getLevelFromScore(total), params.id])
  }
  const { rows: [row] } = await pool.query('SELECT * FROM daily_reports WHERE id = $1', [params.reportId])
  return NextResponse.json(row)
}
