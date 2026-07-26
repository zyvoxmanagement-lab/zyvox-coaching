import { NextRequest, NextResponse } from 'next/server'
import { getPool, genId } from '@/lib/pg-pool'
import crypto from 'crypto'

export async function GET() {
  const pool = getPool()
  const { rows } = await pool.query('SELECT * FROM clients ORDER BY created_at DESC')
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const pool = getPool()
  const body = await req.json()
  const id = genId()
  const access_token = crypto.randomUUID()
  await pool.query('INSERT INTO clients (id, name, email, note, access_token) VALUES ($1, $2, $3, $4, $5)', [id, body.name, body.email ?? null, body.note ?? null, access_token])
  await pool.query('INSERT INTO ideal_maps (id, client_id) VALUES ($1, $2)', [genId(), id])
  const { rows: [client] } = await pool.query('SELECT * FROM clients WHERE id = $1', [id])
  return NextResponse.json(client, { status: 201 })
}
