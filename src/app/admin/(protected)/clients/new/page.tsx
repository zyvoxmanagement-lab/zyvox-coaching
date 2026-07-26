'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewClientPage() {
  const router = useRouter()
  const [form, setForm] = useState({ name: '', email: '', note: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const res = await fetch('/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      const data = await res.json()
      router.push(`/admin/clients/${data.id}`)
    } else {
      const d = await res.json()
      setError(d.error ?? 'エラーが発生しました')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div>
        <Link href="/admin/clients" className="text-xs text-slate-400 hover:text-slate-300">← 顧客一覧</Link>
        <h1 className="text-2xl font-bold text-white mt-2">新規顧客追加</h1>
      </div>

      <div className="glass-card rounded-2xl p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">名前 *</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              className="input-dark w-full px-4 py-3 rounded-xl text-sm"
              placeholder="山田 太郎"
              required
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">メールアドレス</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="input-dark w-full px-4 py-3 rounded-xl text-sm"
              placeholder="taro@example.com"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">メモ（管理者のみ）</label>
            <textarea
              value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              className="input-dark w-full px-4 py-3 rounded-xl text-sm"
              placeholder="顧客についての管理メモ..."
              rows={3}
            />
          </div>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-3 pt-2">
            <Link href="/admin/clients" className="flex-1 text-center py-3 rounded-xl text-sm border border-slate-700 text-slate-400 hover:text-white transition-colors">
              キャンセル
            </Link>
            <button type="submit" disabled={loading} className="flex-1 btn-gold py-3 rounded-xl text-sm disabled:opacity-50">
              {loading ? '作成中...' : '顧客を作成'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
