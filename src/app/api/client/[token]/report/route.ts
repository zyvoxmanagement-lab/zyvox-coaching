import { NextRequest, NextResponse } from 'next/server'
import { getPool, genId } from '@/lib/pg-pool'

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const b = await req.json()
  const achieved = b.achieved === null ? null : (b.achieved ? true : false)
  await pool.query(
    `INSERT INTO daily_reports (id,client_id,report_date,today_goal,result,achieved,reason,tomorrow_goal,memo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (client_id,report_date) DO UPDATE SET
       today_goal=$4, result=$5, achieved=$6, reason=$7, tomorrow_goal=$8, memo=$9`,
    [genId(), client.id, b.report_date, b.today_goal ?? null, b.result ?? null, achieved, b.reason ?? null, b.tomorrow_goal ?? null, b.memo ?? null]
  )
  const { rows: [row] } = await pool.query('SELECT * FROM daily_reports WHERE client_id=$1 AND report_date=$2', [client.id, b.report_date])
  return NextResponse.json(row, { status: 201 })
}
