import { NextRequest, NextResponse } from 'next/server'
import { getPool, genId } from '@/lib/pg-pool'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const pool = getPool()
  const body = await req.json()
  const { rows: [exists] } = await pool.query('SELECT id FROM ideal_maps WHERE client_id = $1', [params.id])
  if (!exists) {
    await pool.query('INSERT INTO ideal_maps (id, client_id) VALUES ($1, $2)', [genId(), params.id])
  }
  const keys = Object.keys(body)
  if (keys.length > 0) {
    const setClauses = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
    await pool.query(`UPDATE ideal_maps SET ${setClauses} WHERE client_id = $${keys.length + 1}`, [...Object.values(body), params.id])
  }
  const { rows: [row] } = await pool.query('SELECT * FROM ideal_maps WHERE client_id = $1', [params.id])
  return NextResponse.json(row)
}
