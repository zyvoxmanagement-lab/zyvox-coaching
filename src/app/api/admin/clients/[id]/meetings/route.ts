import { NextRequest, NextResponse } from 'next/server'
import { getPool, genId } from '@/lib/pg-pool'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const pool = getPool()
  const body = await req.json()
  const id = genId()
  await pool.query('INSERT INTO monthly_meetings (id, client_id, meeting_date, memo) VALUES ($1,$2,$3,$4)', [id, params.id, body.meeting_date ?? null, body.memo ?? null])
  const { rows: [row] } = await pool.query('SELECT * FROM monthly_meetings WHERE id = $1', [id])
  return NextResponse.json(row, { status: 201 })
}
