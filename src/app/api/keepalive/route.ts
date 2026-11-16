import { NextResponse } from 'next/server'
import { getPool } from '@/lib/pg-pool'

export const runtime = 'nodejs'

export async function GET() {
  try {
    const pool = getPool()
    await pool.query('SELECT 1')
    return NextResponse.json({ ok: true, ts: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
