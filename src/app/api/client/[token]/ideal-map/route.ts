import { NextRequest, NextResponse } from 'next/server'
import { getPool, genId } from '@/lib/pg-pool'

const MAP_FIELDS = ['ideal_life','bottleneck','determination','discipline','mindset','new_environment','goal_3y','goal_1y','goal_3m','map_date','goal_labels','origin']

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { searchParams } = new URL(req.url)
  if (searchParams.get('trash') === '1') {
    const { rows } = await pool.query('SELECT * FROM ideal_maps WHERE client_id = $1 AND deleted_at IS NOT NULL ORDER BY deleted_at DESC', [client.id])
    return NextResponse.json(rows)
  }
  const { rows } = await pool.query('SELECT * FROM ideal_maps WHERE client_id = $1 AND deleted_at IS NULL ORDER BY map_date DESC, id DESC', [client.id])
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json()
  const id = genId()
  const today = localDate(new Date())
  const copyFields = MAP_FIELDS.filter(f => f !== 'map_date' && body[f] != null)
  const cols = ['id', 'client_id', 'map_date', ...copyFields]
  const vals = [id, client.id, body.map_date ?? today, ...copyFields.map((f: string) => body[f])]
  const placeholders = vals.map((_: unknown, i: number) => `$${i + 1}`)
  await pool.query(`INSERT INTO ideal_maps (${cols.join(',')}) VALUES (${placeholders.join(',')})`, vals)
  const { rows: [row] } = await pool.query('SELECT * FROM ideal_maps WHERE id = $1', [id])
  return NextResponse.json(row, { status: 201 })
}

export async function PATCH(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const body = await req.json()
  const { map_id, restore, ...fields } = body
  if (!map_id) return NextResponse.json({ error: 'map_id required' }, { status: 400 })
  if (restore) {
    await pool.query('UPDATE ideal_maps SET deleted_at = NULL WHERE id = $1 AND client_id = $2', [map_id, client.id])
    const { rows: [row] } = await pool.query('SELECT * FROM ideal_maps WHERE id = $1', [map_id])
    return NextResponse.json(row)
  }
  const allowed = Object.fromEntries(Object.entries(fields).filter(([k]) => MAP_FIELDS.includes(k)))
  if (Object.keys(allowed).length === 0) return NextResponse.json({ error: 'no valid fields' }, { status: 400 })
  const setClauses = Object.keys(allowed).map((k, i) => `${k} = $${i + 1}`).join(', ')
  const values = [...Object.values(allowed), map_id, client.id]
  await pool.query(`UPDATE ideal_maps SET ${setClauses} WHERE id = $${Object.keys(allowed).length + 1} AND client_id = $${Object.keys(allowed).length + 2}`, values)
  const { rows: [row] } = await pool.query('SELECT * FROM ideal_maps WHERE id = $1', [map_id])
  return NextResponse.json(row)
}

export async function DELETE(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const { map_id, permanent } = await req.json()
  if (!map_id) return NextResponse.json({ error: 'map_id required' }, { status: 400 })
  if (permanent) {
    await pool.query('DELETE FROM ideal_maps WHERE id = $1 AND client_id = $2', [map_id, client.id])
  } else {
    await pool.query('UPDATE ideal_maps SET deleted_at = $1 WHERE id = $2 AND client_id = $3', [new Date().toISOString(), map_id, client.id])
  }
  return NextResponse.json({ success: true })
}
