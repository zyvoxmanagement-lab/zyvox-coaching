'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import LevelBadge from '@/components/LevelBadge'
import type { Client } from '@/lib/supabase'

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [showHidden, setShowHidden] = useState(false)

  useEffect(() => {
    fetch('/api/admin/clients').then(r => r.json()).then(data => {
      setClients(Array.isArray(data) ? data : [])
      setLoading(false)
    })
  }, [])

  async function handleDelete(id: string, name: string) {
    if (!confirm(`「${name}」を削除しますか？この操作は取り消せません。`)) return
    await fetch(`/api/admin/clients/${id}`, { method: 'DELETE' })
    setClients(c => c.filter(x => x.id !== id))
  }

  async function toggleHidden(client: Client) {
    const newVal = !client.is_hidden
    setClients(cs => cs.map(c => c.id === client.id ? { ...c, is_hidden: newVal } : c))
    await fetch(`/api/admin/clients/${client.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_hidden: newVal }),
    })
  }

  async function copyClientUrl(token: string) {
    const url = `${window.location.origin}/client/${token}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      const el = document.createElement('textarea')
      el.value = url
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    alert('URLをコピーしました')
  }

  const visible = clients.filter(c => !c.is_hidden)
  const hidden = clients.filter(c => c.is_hidden)

  const filterList = (list: Client[]) =>
    list.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.real_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.instagram_name ?? '').toLowerCase().includes(search.toLowerCase())
    )

  const filtered = filterList(visible)
  const filteredHidden = filterList(hidden)

  function ClientRow({ client, dimmed }: { client: Client; dimmed?: boolean }) {
    return (
      <div className={`glass-card rounded-xl px-4 py-3 flex items-center gap-4 ${dimmed ? 'opacity-50' : ''}`}>
        <div className="flex-1 min-w-0">
          <Link href={`/admin/clients/${client.id}`} className="font-medium text-white hover:text-gold-400 transition-colors">
            {client.name}
          </Link>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {client.real_name && <span className="text-xs text-slate-500">{client.real_name}</span>}
            {client.instagram_name && <span className="text-xs text-slate-600">@{client.instagram_name}</span>}
            {client.email && <span className="text-xs text-slate-600">{client.email}</span>}
          </div>
          <div className="mt-1">
            <LevelBadge score={client.total_score} />
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => copyClientUrl(client.access_token)}
            className="text-xs text-slate-400 hover:text-emerald-400 transition-colors px-2 py-1 rounded-lg border border-slate-700 hover:border-emerald-500/30"
            title="顧客URLをコピー"
          >
            🔗
          </button>
          <Link
            href={`/admin/clients/${client.id}`}
            className="text-xs text-slate-400 hover:text-gold-400 transition-colors px-2 py-1 rounded-lg border border-slate-700 hover:border-gold-500/30"
          >
            詳細
          </Link>
          <button
            onClick={() => toggleHidden(client)}
            className={`text-xs px-2 py-1 rounded-lg border transition-colors ${client.is_hidden ? 'text-emerald-400 border-emerald-500/30 hover:border-emerald-400' : 'text-slate-600 border-slate-800 hover:text-slate-400 hover:border-slate-600'}`}
            title={client.is_hidden ? '表示に戻す' : '非表示にする'}
          >
            {client.is_hidden ? '表示' : '非表示'}
          </button>
          <button
            onClick={() => handleDelete(client.id, client.name)}
            className="text-xs text-slate-600 hover:text-red-400 transition-colors px-2 py-1 rounded-lg border border-slate-800 hover:border-red-500/30"
          >
            削除
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">顧客一覧</h1>
          <p className="text-slate-400 text-sm mt-0.5">{visible.length} 名 {hidden.length > 0 && `/ 非表示 ${hidden.length} 名`}</p>
        </div>
        <Link href="/admin/clients/new" className="btn-gold px-4 py-2 rounded-xl text-sm">
          + 顧客追加
        </Link>
      </div>

      <input
        type="text"
        placeholder="名前・メール・インスタ名で検索..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="input-dark w-full px-4 py-2.5 rounded-xl text-sm"
      />

      {loading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="glass-card rounded-xl p-4 shimmer h-20" />
          ))}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {filtered.map(client => <ClientRow key={client.id} client={client} />)}
            {filtered.length === 0 && (
              <div className="glass-card rounded-xl p-8 text-center text-slate-500 text-sm">
                {search ? '検索結果がありません' : 'まだ顧客が登録されていません'}
              </div>
            )}
          </div>

          {/* 非表示リスト */}
          {hidden.length > 0 && (
            <div>
              <button
                onClick={() => setShowHidden(v => !v)}
                className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors mb-3"
              >
                <span className={`transition-transform inline-block ${showHidden ? 'rotate-90' : ''}`}>▶</span>
                非表示リスト（{hidden.length} 名）
              </button>
              {showHidden && (
                <div className="space-y-2">
                  {filteredHidden.map(client => <ClientRow key={client.id} client={client} dimmed />)}
                  {filteredHidden.length === 0 && search && (
                    <div className="glass-card rounded-xl p-4 text-center text-slate-600 text-xs">該当なし</div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
