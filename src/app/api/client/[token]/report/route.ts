import { NextRequest, NextResponse } from 'next/server'
import { getPool, genId } from '@/lib/pg-pool'

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const b = await req.json()
  // score: user inputs 1-10, store mapped pts (10→20, else N)
  const reportScore = b.score != null ? (b.score === 10 ? 20 : b.score) : null
  await pool.query(
    `INSERT INTO daily_reports (id,client_id,report_date,today_goal,score,reason,tomorrow_goal,memo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (client_id,report_date) DO UPDATE SET
       today_goal=$4, score=$5, reason=$6, tomorrow_goal=$7, memo=$8`,
    [genId(), client.id, b.report_date, b.today_goal ?? null, reportScore, b.reason ?? null, b.tomorrow_goal ?? null, b.reason ?? null]
  )
  const { rows: [row] } = await pool.query('SELECT * FROM daily_reports WHERE client_id=$1 AND report_date=$2', [client.id, b.report_date])
  return NextResponse.json(row, { status: 201 })
}
