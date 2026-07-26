'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

export default function AdminNav() {
  const router = useRouter()

  async function handleLogout() {
    await fetch('/api/admin/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  return (
    <nav className="border-b border-gold-600/20 bg-navy-900/80 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        <Link href="/admin" className="text-xl font-bold tracking-widest gold-gradient">
          ZYVOX
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/admin" className="text-slate-400 hover:text-gold-400 text-sm transition-colors">
            ダッシュボード
          </Link>
          <Link href="/admin/clients" className="text-slate-400 hover:text-gold-400 text-sm transition-colors">
            顧客一覧
          </Link>
          <Link href="/admin/clients/new" className="btn-gold px-3 py-1.5 rounded-lg text-xs">
            + 顧客追加
          </Link>
          <button onClick={handleLogout} className="text-slate-500 hover:text-slate-300 text-xs transition-colors">
            ログアウト
          </button>
        </div>
      </div>
    </nav>
  )
}
