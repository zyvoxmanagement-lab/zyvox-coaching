import { NextRequest, NextResponse } from 'next/server'
import { createAdminToken } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const { password } = await req.json()
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'zyvox2024'

  if (password !== adminPassword) {
    return NextResponse.json({ error: 'パスワードが違います' }, { status: 401 })
  }

  const token = await createAdminToken()
  const res = NextResponse.json({ success: true })
  res.cookies.set('admin_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  })
  return res
}
