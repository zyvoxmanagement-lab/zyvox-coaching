import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import LevelBadge from '@/components/LevelBadge'

export const dynamic = 'force-dynamic'

export default async function AdminDashboard() {
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, email, total_score, current_level, created_at')
    .order('total_score', { ascending: false })
    .limit(5)

  const { count: totalClients } = await supabase.from('clients').select('*', { count: 'exact', head: true })

  const today = new Date().toISOString().split('T')[0]
  const { count: todayReports } = await supabase
    .from('daily_reports')
    .select('*', { count: 'exact', head: true })
    .eq('report_date', today)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">ダッシュボード</h1>
        <p className="text-slate-400 text-sm mt-1">Zyvox コーチング管理システム</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="glass-card rounded-xl p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">総顧客数</div>
          <div className="text-3xl font-bold text-white">{totalClients ?? 0}</div>
          <div className="text-xs text-slate-500 mt-0.5">名</div>
        </div>
        <div className="glass-card rounded-xl p-4">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">本日の日報</div>
          <div className="text-3xl font-bold text-emerald-400">{todayReports ?? 0}</div>
          <div className="text-xs text-slate-500 mt-0.5">件提出済み</div>
        </div>
        <div className="glass-card rounded-xl p-4 col-span-2 sm:col-span-1">
          <div className="text-xs text-slate-400 uppercase tracking-wider mb-1">日付</div>
          <div className="text-xl font-semibold text-white">
            {new Date().toLocaleDateString('ja-JP', { month: 'long', day: 'numeric', weekday: 'short' })}
          </div>
        </div>
      </div>

      {/* Top clients */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">スコアランキング</h2>
          <Link href="/admin/clients" className="text-xs text-gold-400 hover:text-gold-300">
            全員表示 →
          </Link>
        </div>
        <div className="space-y-2">
          {clients?.map((client, i) => (
            <Link
              key={client.id}
              href={`/admin/clients/${client.id}`}
              className="glass-card rounded-xl px-4 py-3 flex items-center gap-4 hover:border-gold-500/30 transition-colors"
            >
              <span className="text-slate-500 text-sm w-5 text-center font-mono">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white text-sm truncate">{client.name}</div>
                <LevelBadge score={client.total_score} showBar={false} />
              </div>
              <div className="text-right shrink-0">
                <div className="text-gold-400 font-bold text-sm">{client.total_score.toLocaleString()} pt</div>
              </div>
            </Link>
          ))}
          {(!clients || clients.length === 0) && (
            <div className="glass-card rounded-xl p-8 text-center text-slate-500 text-sm">
              まだ顧客が登録されていません。
              <Link href="/admin/clients/new" className="text-gold-400 ml-1">顧客を追加する</Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
