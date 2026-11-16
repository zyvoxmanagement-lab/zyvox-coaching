'use client'
import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import LevelBadge from '@/components/LevelBadge'
import type { Client, IdealMap, ClientGoal, DailyReport, MonthlyMeeting } from '@/lib/supabase'

type Tab = 'overview' | 'week' | 'ideal-map' | 'goals' | 'reports' | 'meetings'

type TimeSlot = { id: string; time: string; task_id: string; task_name: string; point_value: number }

type ClientDetail = Client & {
  ideal_maps: IdealMap | null
  client_goals: ClientGoal[]
  daily_reports: DailyReport[]
  monthly_meetings: MonthlyMeeting[]
  weekly_completions: { task_id: string; completion_date: string; completed: boolean }[]
  week_start: string
  coaching_start_date?: string | null
}

const IDEAL_MAP_FIELDS = [
  { key: 'ideal_life', label: '理想の人生' },
  { key: 'bottleneck', label: '現状/ボトルネック' },
  { key: 'goal', label: 'ゴール' },
  { key: 'determination', label: '覚悟（犠牲）' },
  { key: 'discipline', label: '規律習慣' },
  { key: 'mindset', label: 'マインドセット' },
  { key: 'new_environment', label: '新たな環境' },
  { key: 'goal_3y', label: '3年後ゴール' },
  { key: 'goal_1y', label: '1年後ゴール' },
  { key: 'goal_3m', label: '3ヶ月後ゴール' },
] as const

const DAY_NAMES = ['月', '火', '水', '木', '金', '土', '日']

function getWeekDates(weekStart: string): string[] {
  const dates: string[] = []
  const base = new Date(weekStart)
  for (let i = 0; i < 7; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    dates.push(d.toISOString().split('T')[0])
  }
  return dates
}

export default function ClientDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [client, setClient] = useState<ClientDetail | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [expandedDay, setExpandedDay] = useState<string | null>(null)

  // 顧客情報
  const [infoForm, setInfoForm] = useState({ real_name: '', instagram_name: '', phone: '', email: '', note: '', memo: '', coaching_start_date: '' })
  const [savingInfo, setSavingInfo] = useState(false)

  // Ideal map edit state
  const [idealMap, setIdealMap] = useState<Record<string, string>>({})
  // Goals edit state
  const [monthlyGoal, setMonthlyGoal] = useState('')
  const [weeklyGoal, setWeeklyGoal] = useState('')
  const [tasks, setTasks] = useState<{ content: string; point_value: number }[]>([])
  // Selected report for FB/FF
  const [selectedReport, setSelectedReport] = useState<DailyReport | null>(null)
  const [fbForm, setFbForm] = useState({ coach_fb: '', coach_ff: '', score: 0 })
  // Meeting memo
  const [meetingForm, setMeetingForm] = useState({ meeting_date: new Date().toISOString().split('T')[0], memo: '' })

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/clients/${id}`)
    if (!res.ok) { router.push('/admin/clients'); return }
    const data: ClientDetail = await res.json()
    setClient(data)
    setInfoForm({
      real_name: data.real_name ?? '',
      instagram_name: data.instagram_name ?? '',
      phone: data.phone ?? '',
      email: data.email ?? '',
      note: data.note ?? '',
      memo: data.memo ?? '',
      coaching_start_date: data.coaching_start_date ? data.coaching_start_date.split('T')[0] : '',
    })
    const im = data.ideal_maps
    if (im) {
      const map: Record<string, string> = {}
      IDEAL_MAP_FIELDS.forEach(f => { map[f.key] = (im as Record<string, string | null>)[f.key] ?? '' })
      setIdealMap(map)
    }
    const monthly = data.client_goals.find(g => g.goal_type === 'monthly')
    const weekly = data.client_goals.find(g => g.goal_type === 'weekly')
    const taskList = data.client_goals.filter(g => g.goal_type === 'tasks')
    setMonthlyGoal(monthly?.content ?? '')
    setWeeklyGoal(weekly?.content ?? '')
    setTasks(taskList.length > 0 ? taskList.map(t => ({ content: t.content, point_value: t.point_value })) : [{ content: '', point_value: 10 }])
    setLoading(false)
  }, [id, router])

  useEffect(() => { load() }, [load])

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  async function saveInfo() {
    setSavingInfo(true)
    await fetch(`/api/admin/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(infoForm),
    })
    setSavingInfo(false)
    flash('保存しました ✓')
    load()
  }

  async function toggleHidden() {
    if (!client) return
    const newVal = !client.is_hidden
    await fetch(`/api/admin/clients/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_hidden: newVal }),
    })
    setClient(c => c ? { ...c, is_hidden: newVal } : c)
    flash(newVal ? '非表示にしました' : '表示に戻しました')
  }

  async function saveIdealMap() {
    setSaving(true)
    await fetch(`/api/admin/clients/${id}/ideal-map`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(idealMap),
    })
    setSaving(false)
    flash('保存しました ✓')
  }

  async function saveGoals() {
    setSaving(true)
    await fetch(`/api/admin/clients/${id}/goals`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal_type: 'monthly', goals: monthlyGoal ? [{ content: monthlyGoal, point_value: 500 }] : [] }),
    })
    await fetch(`/api/admin/clients/${id}/goals`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal_type: 'weekly', goals: weeklyGoal ? [{ content: weeklyGoal, point_value: 100 }] : [] }),
    })
    await fetch(`/api/admin/clients/${id}/goals`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ goal_type: 'tasks', goals: tasks.filter(t => t.content.trim()) }),
    })
    setSaving(false)
    flash('保存しました ✓')
    load()
  }

  async function saveFbFf() {
    if (!selectedReport) return
    setSaving(true)
    await fetch(`/api/admin/clients/${id}/reports/${selectedReport.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fbForm),
    })
    setSaving(false)
    flash('フィードバックを保存しました ✓')
    setSelectedReport(null)
    load()
  }

  async function saveMeeting() {
    setSaving(true)
    await fetch(`/api/admin/clients/${id}/meetings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(meetingForm),
    })
    setSaving(false)
    flash('ミーティングメモを保存しました ✓')
    setMeetingForm({ meeting_date: new Date().toISOString().split('T')[0], memo: '' })
    load()
  }

  async function copyClientUrl() {
    if (!client) return
    const url = `${window.location.origin}/client/${client.access_token}`
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
    flash('URLをコピーしました ✓')
  }

  if (loading) {
    return <div className="space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="glass-card rounded-xl p-6 shimmer h-24" />)}</div>
  }
  if (!client) return null

  const today = new Date().toISOString().split('T')[0]
  const weekDates = client.week_start ? getWeekDates(client.week_start) : []
  const weeklyGoalContent = client.client_goals.find(g => g.goal_type === 'weekly')?.content ?? ''
  const monthlyGoalContent = client.client_goals.find(g => g.goal_type === 'monthly')?.content ?? ''

  // Build lookup maps
  const reportByDate = Object.fromEntries(client.daily_reports.map(r => [r.report_date, r]))
  const completionSet = new Set(
    client.weekly_completions.filter(c => c.completed).map(c => `${c.task_id}_${c.completion_date}`)
  )
  const completionsByDate: Record<string, typeof client.weekly_completions> = {}
  client.weekly_completions.forEach(c => {
    if (!completionsByDate[c.completion_date]) completionsByDate[c.completion_date] = []
    completionsByDate[c.completion_date].push(c)
  })

  function parseMemo(memo: string | null | undefined): TimeSlot[] {
    if (!memo) return []
    try { return JSON.parse(memo) as TimeSlot[] } catch { return [] }
  }

  const pendingFb = client.daily_reports.filter(r => !r.coach_fb && r.result).length

  type Tab = 'overview' | 'week' | 'info' | 'ideal-map' | 'goals' | 'reports' | 'meetings'
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'overview', label: '概要' },
    { id: 'week', label: '今週の状況' },
    { id: 'info', label: '顧客情報' },
    { id: 'ideal-map', label: '理想実現マップ' },
    { id: 'goals', label: 'ゴール・タスク' },
    { id: 'reports', label: '日報', badge: pendingFb },
    { id: 'meetings', label: 'ミーティング' },
  ]

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/admin/clients" className="text-xs text-slate-400 hover:text-slate-300">← 顧客一覧</Link>
          <h1 className="text-2xl font-bold text-white mt-1">{client.name}</h1>
          {client.email && <div className="text-sm text-slate-400">{client.email}</div>}
          <div className="mt-2">
            <LevelBadge score={client.total_score} />
          </div>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <a
            href={`/client/${client?.access_token}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-gold px-3 py-2 rounded-xl text-xs text-center"
          >
            👁 顧客画面を見る
          </a>
          <button onClick={copyClientUrl} className="btn-emerald px-3 py-2 rounded-xl text-xs">
            🔗 URLコピー
          </button>
          <button
            onClick={toggleHidden}
            className={`px-3 py-2 rounded-xl text-xs border transition-colors ${client.is_hidden ? 'border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10' : 'border-slate-700 text-slate-500 hover:text-slate-300 hover:border-slate-500'}`}
          >
            {client.is_hidden ? '👁 表示に戻す' : '🙈 非表示'}
          </button>
        </div>
      </div>

      {msg && (
        <div className="glass-card-emerald rounded-xl px-4 py-2 text-sm text-emerald-400">{msg}</div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-thin">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`relative px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors ${
              tab === t.id
                ? 'bg-gold-500/20 text-gold-400 border border-gold-500/30'
                : 'text-slate-400 hover:text-slate-300 border border-transparent'
            }`}
          >
            {t.label}
            {t.badge ? (
              <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold">{t.badge}</span>
            ) : null}
          </button>
        ))}
      </div>

      {/* ── 概要 ── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="glass-card rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">総スコア</div>
              <div className="text-2xl font-bold text-gold-400">{client.total_score.toLocaleString()}</div>
              <div className="text-xs text-slate-500">pt</div>
            </div>
            <div className="glass-card rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">日報数</div>
              {(() => {
                const startDate = client.coaching_start_date ? client.coaching_start_date.split('T')[0] : null
                if (!startDate) return <><div className="text-2xl font-bold text-white">{client.daily_reports.length}</div><div className="text-xs text-slate-500">件</div></>
                const start = new Date(startDate)
                const todayDate = new Date(today)
                const totalDays = Math.floor((todayDate.getTime() - start.getTime()) / 86400000) + 1
                const submittedDays = client.daily_reports.filter(r => r.report_date >= startDate).length
                return <>
                  <div className="text-2xl font-bold text-white">{submittedDays}<span className="text-base text-slate-400">/{totalDays}</span></div>
                  <div className="text-xs text-slate-500">日</div>
                </>
              })()}
            </div>
            <div className="glass-card rounded-xl p-4 col-span-2 sm:col-span-1">
              <div className="text-xs text-slate-400 mb-1">登録日</div>
              <div className="text-sm font-medium text-white">
                {new Date(client.created_at).toLocaleDateString('ja-JP')}
              </div>
            </div>
          </div>

          {/* 今週・今日のゴール */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {weeklyGoalContent && (
              <div className="glass-card rounded-xl p-4 border-l-2 border-gold-500/40">
                <div className="text-xs text-slate-400 mb-1">今週のゴール</div>
                <p className="text-sm text-white" dangerouslySetInnerHTML={{ __html: weeklyGoalContent }} />
              </div>
            )}
            {reportByDate[today]?.today_goal && (
              <div className="glass-card rounded-xl p-4 border-l-2 border-emerald-500/40">
                <div className="text-xs text-slate-400 mb-1">今日のゴール</div>
                <p className="text-sm text-white">{reportByDate[today].today_goal}</p>
              </div>
            )}
          </div>

          {/* 今週のタスク完了状況 */}
          {weekDates.length > 0 && (
            <div className="glass-card rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-3">今週の完了状況</div>
              <div className="flex gap-2">
                {weekDates.map((date, i) => {
                  const comps = completionsByDate[date] ?? []
                  const done = comps.filter(c => c.completed).length
                  const report = reportByDate[date]
                  const slots = parseMemo(report?.memo)
                  const total = slots.length
                  const isToday = date === today
                  return (
                    <div key={date} className="flex-1 text-center">
                      <div className={`text-xs mb-1 ${isToday ? 'text-gold-400 font-semibold' : 'text-slate-500'}`}>{DAY_NAMES[i]}</div>
                      <div className={`rounded-lg p-1.5 text-center ${isToday ? 'bg-gold-500/15' : 'bg-slate-800/60'}`}>
                        {total > 0 ? (
                          <>
                            <div className={`text-sm font-bold ${done === total ? 'text-emerald-400' : 'text-white'}`}>{done}/{total}</div>
                            {done === total && <div className="text-[10px] text-emerald-400">✓</div>}
                          </>
                        ) : (
                          <div className="text-xs text-slate-600">-</div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {client.note && (
            <div className="glass-card rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-2">管理メモ</div>
              <p className="text-sm text-slate-300 whitespace-pre-wrap">{client.note}</p>
            </div>
          )}

          {/* Latest reports preview */}
          <div>
            <div className="text-xs text-slate-400 mb-2 uppercase tracking-wider">最新の日報</div>
            {client.daily_reports.slice(0, 3).map(r => (
              <div key={r.id} className="glass-card rounded-xl p-4 mb-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-slate-400">{r.report_date}</span>
                  <div className="flex items-center gap-2">
                    {!r.coach_fb && r.result && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">未FB</span>
                    )}
                    {r.achieved !== null && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${r.achieved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                        {r.achieved ? '達成 ✓' : '未達成'}
                      </span>
                    )}
                  </div>
                </div>
                {r.result && <p className="text-sm text-slate-300 line-clamp-2">{r.result}</p>}
                <button
                  onClick={() => { setSelectedReport(r); setFbForm({ coach_fb: r.coach_fb ?? '', coach_ff: r.coach_ff ?? '', score: r.score }); setTab('reports') }}
                  className="text-xs text-gold-400 hover:text-gold-300 mt-2"
                >
                  FB/FF を入力 →
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── 今週の状況 ── */}
      {tab === 'week' && (
        <div className="space-y-4">
          {/* ゴールサマリ */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="glass-card rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">今週のゴール</div>
              {weeklyGoalContent
                ? <p className="text-sm text-white" dangerouslySetInnerHTML={{ __html: weeklyGoalContent }} />
                : <span className="text-slate-500 text-sm">未設定</span>}
            </div>
            <div className="glass-card rounded-xl p-4">
              <div className="text-xs text-slate-400 mb-1">今月のゴール</div>
              {monthlyGoalContent
                ? <p className="text-sm text-white" dangerouslySetInnerHTML={{ __html: monthlyGoalContent }} />
                : <span className="text-slate-500 text-sm">未設定</span>}
            </div>
          </div>

          {/* 7日アコーディオン */}
          <div className="space-y-2">
            {weekDates.map((date, i) => {
              const report = reportByDate[date]
              const slots = parseMemo(report?.memo)
              const dayComps = completionsByDate[date] ?? []
              const doneCount = dayComps.filter(c => c.completed).length
              const isToday = date === today
              const isExpanded = expandedDay === date

              return (
                <div key={date} className={`glass-card rounded-xl overflow-hidden ${isToday ? 'border border-gold-500/30' : ''}`}>
                  <button
                    onClick={() => setExpandedDay(isExpanded ? null : date)}
                    className="w-full px-4 py-3 flex items-center gap-3 text-left hover:bg-white/5 transition-colors"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold shrink-0 ${isToday ? 'bg-gold-500/20 text-gold-400' : 'bg-slate-800 text-slate-400'}`}>
                      {DAY_NAMES[i]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${isToday ? 'text-gold-400' : 'text-white'}`}>{date}</span>
                        {isToday && <span className="text-xs bg-gold-500/20 text-gold-400 px-1.5 py-0.5 rounded">TODAY</span>}
                      </div>
                      {report?.today_goal && (
                        <div className="text-xs text-slate-400 mt-0.5 truncate">目標：{report.today_goal}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {slots.length > 0 && (
                        <span className={`text-xs font-medium ${doneCount === slots.length ? 'text-emerald-400' : 'text-slate-400'}`}>
                          {doneCount}/{slots.length}
                        </span>
                      )}
                      {report && !report.coach_fb && report.result && (
                        <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">未FB</span>
                      )}
                      {report?.achieved !== null && report?.achieved !== undefined && (
                        <span className={`text-xs ${report.achieved ? 'text-emerald-400' : 'text-slate-600'}`}>
                          {report.achieved ? '✓達成' : '✗'}
                        </span>
                      )}
                      <span className="text-slate-600 text-xs">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-3 border-t border-slate-700/50 pt-3">
                      {/* タイムスロット */}
                      {slots.length > 0 ? (
                        <div className="space-y-1.5">
                          <div className="text-xs text-slate-500 uppercase tracking-wider mb-2">タイムスロット</div>
                          {slots.map(slot => {
                            const done = completionSet.has(`${slot.task_id}_${date}`)
                            return (
                              <div key={slot.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${done ? 'bg-emerald-500/10' : 'bg-slate-800/60'}`}>
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${done ? 'border-emerald-400 bg-emerald-400' : 'border-slate-600'}`}>
                                  {done && <span className="text-[10px] text-slate-900 font-bold">✓</span>}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className={`text-sm ${done ? 'text-emerald-300 line-through decoration-emerald-600' : 'text-white'}`}>
                                    {slot.task_name}
                                  </div>
                                  <div className="text-xs text-slate-500">{slot.time} · {slot.point_value}pt</div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="text-xs text-slate-600 py-2">スロット未設定</div>
                      )}

                      {/* 日報内容 */}
                      {report && (
                        <div className="space-y-2 border-t border-slate-700/40 pt-3">
                          <div className="text-xs text-slate-500 uppercase tracking-wider">日報</div>
                          {report.result && (
                            <div>
                              <div className="text-xs text-slate-400 mb-0.5">実行結果</div>
                              <p className="text-sm text-slate-300 whitespace-pre-wrap">{report.result}</p>
                            </div>
                          )}
                          {report.reason && (
                            <div>
                              <div className="text-xs text-slate-400 mb-0.5">できなかった理由</div>
                              <p className="text-sm text-slate-300">{report.reason}</p>
                            </div>
                          )}
                          {report.tomorrow_goal && (
                            <div>
                              <div className="text-xs text-slate-400 mb-0.5">明日のゴール</div>
                              <p className="text-sm text-slate-300">{report.tomorrow_goal}</p>
                            </div>
                          )}
                          {report.coach_fb && (
                            <div className="bg-emerald-500/10 rounded-lg p-3">
                              <div className="text-xs text-emerald-400 mb-0.5">FB済</div>
                              <p className="text-sm text-emerald-300">{report.coach_fb}</p>
                            </div>
                          )}
                          {!report.coach_fb && report.result && (
                            <button
                              onClick={() => { setSelectedReport(report); setFbForm({ coach_fb: report.coach_fb ?? '', coach_ff: report.coach_ff ?? '', score: report.score }); setTab('reports') }}
                              className="text-xs text-gold-400 hover:text-gold-300 underline"
                            >
                              FB/FF を入力 →
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 顧客情報 ── */}
      {tab === 'info' && (
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <h3 className="text-sm font-semibold text-white">個人情報</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">本名</label>
                <input
                  type="text"
                  value={infoForm.real_name}
                  onChange={e => setInfoForm(f => ({ ...f, real_name: e.target.value }))}
                  className="input-dark w-full px-4 py-2.5 rounded-xl text-sm"
                  placeholder="山田 太郎"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">インスタグラム名</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">@</span>
                  <input
                    type="text"
                    value={infoForm.instagram_name}
                    onChange={e => setInfoForm(f => ({ ...f, instagram_name: e.target.value }))}
                    className="input-dark w-full pl-7 pr-4 py-2.5 rounded-xl text-sm"
                    placeholder="username"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">メールアドレス</label>
                <input
                  type="email"
                  value={infoForm.email}
                  onChange={e => setInfoForm(f => ({ ...f, email: e.target.value }))}
                  className="input-dark w-full px-4 py-2.5 rounded-xl text-sm"
                  placeholder="example@email.com"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">電話番号</label>
                <input
                  type="tel"
                  value={infoForm.phone}
                  onChange={e => setInfoForm(f => ({ ...f, phone: e.target.value }))}
                  className="input-dark w-full px-4 py-2.5 rounded-xl text-sm"
                  placeholder="090-0000-0000"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">コーチング開始日</label>
              <input
                type="date"
                value={infoForm.coaching_start_date}
                onChange={e => setInfoForm(f => ({ ...f, coaching_start_date: e.target.value }))}
                className="input-dark w-full px-4 py-2.5 rounded-xl text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">管理メモ（外部非公開）</label>
              <textarea
                value={infoForm.note}
                onChange={e => setInfoForm(f => ({ ...f, note: e.target.value }))}
                className="input-dark w-full px-4 py-2.5 rounded-xl text-sm"
                rows={3}
                placeholder="契約詳細、特記事項など..."
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">コーチングメモ</label>
              <textarea
                value={infoForm.memo}
                onChange={e => setInfoForm(f => ({ ...f, memo: e.target.value }))}
                className="input-dark w-full px-4 py-2.5 rounded-xl text-sm"
                rows={4}
                placeholder="顧客の特徴、コーチング方針など..."
              />
            </div>
            <button onClick={saveInfo} disabled={savingInfo} className="btn-gold w-full py-3 rounded-xl text-sm disabled:opacity-50">
              {savingInfo ? '保存中...' : '保存する'}
            </button>
          </div>
        </div>
      )}

      {/* ── 理想実現マップ ── */}
      {tab === 'ideal-map' && (
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-6 space-y-4">
            {IDEAL_MAP_FIELDS.map(f => (
              <div key={f.key}>
                <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">{f.label}</label>
                <textarea
                  value={idealMap[f.key] ?? ''}
                  onChange={e => setIdealMap(m => ({ ...m, [f.key]: e.target.value }))}
                  className="input-dark w-full px-4 py-2.5 rounded-xl text-sm"
                  rows={2}
                  placeholder={`${f.label}を入力...`}
                />
              </div>
            ))}
            <button onClick={saveIdealMap} disabled={saving} className="btn-gold w-full py-3 rounded-xl text-sm disabled:opacity-50">
              {saving ? '保存中...' : '保存する'}
            </button>
          </div>
        </div>
      )}

      {/* ── ゴール・タスク ── */}
      {tab === 'goals' && (
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-6 space-y-5">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">今月のゴール（+500P）</label>
              <textarea
                value={monthlyGoal}
                onChange={e => setMonthlyGoal(e.target.value)}
                className="input-dark w-full px-4 py-2.5 rounded-xl text-sm"
                rows={3}
                placeholder="今月達成すべきゴールを入力..."
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">今週のゴール（+100P）</label>
              <textarea
                value={weeklyGoal}
                onChange={e => setWeeklyGoal(e.target.value)}
                className="input-dark w-full px-4 py-2.5 rounded-xl text-sm"
                rows={3}
                placeholder="今週達成すべきゴールを入力..."
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-slate-400 uppercase tracking-wider">タスクライブラリ</label>
                <button
                  onClick={() => setTasks(t => [...t, { content: '', point_value: 10 }])}
                  className="text-xs text-gold-400 hover:text-gold-300"
                >
                  + タスク追加
                </button>
              </div>
              <div className="space-y-2">
                {tasks.map((task, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={task.content}
                      onChange={e => setTasks(ts => ts.map((t, j) => j === i ? { ...t, content: e.target.value } : t))}
                      className="input-dark flex-1 px-3 py-2 rounded-xl text-sm"
                      placeholder={`タスク ${i + 1}`}
                    />
                    <input
                      type="number"
                      value={task.point_value}
                      onChange={e => setTasks(ts => ts.map((t, j) => j === i ? { ...t, point_value: Number(e.target.value) } : t))}
                      className="input-dark w-20 px-3 py-2 rounded-xl text-sm text-center"
                      placeholder="pt"
                    />
                    <button onClick={() => setTasks(ts => ts.filter((_, j) => j !== i))} className="text-slate-600 hover:text-red-400 transition-colors">✕</button>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={saveGoals} disabled={saving} className="btn-gold w-full py-3 rounded-xl text-sm disabled:opacity-50">
              {saving ? '保存中...' : 'ゴール・タスクを保存'}
            </button>
          </div>
        </div>
      )}

      {/* ── 日報 ── */}
      {tab === 'reports' && (
        <div className="space-y-4">
          {selectedReport ? (
            <div className="glass-card rounded-2xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-white">{selectedReport.report_date} の日報</h3>
                <button onClick={() => setSelectedReport(null)} className="text-slate-400 hover:text-white text-sm">← 戻る</button>
              </div>
              <div className="space-y-3 text-sm">
                {selectedReport.today_goal && <div><span className="text-slate-400">今日のゴール：</span><span className="text-white">{selectedReport.today_goal}</span></div>}
                {selectedReport.result && <div><span className="text-slate-400">実行結果：</span><span className="text-white">{selectedReport.result}</span></div>}
                {selectedReport.achieved !== null && <div><span className="text-slate-400">達成：</span><span className={selectedReport.achieved ? 'text-emerald-400' : 'text-red-400'}>{selectedReport.achieved ? '✓ 達成' : '✗ 未達成'}</span></div>}
                {selectedReport.reason && <div><span className="text-slate-400">できなかった理由：</span><span className="text-white">{selectedReport.reason}</span></div>}
                {selectedReport.tomorrow_goal && <div><span className="text-slate-400">明日のゴール：</span><span className="text-white">{selectedReport.tomorrow_goal}</span></div>}
                {selectedReport.memo && <div><span className="text-slate-400">メモ：</span><span className="text-white">{selectedReport.memo}</span></div>}
              </div>
              <div className="border-t border-slate-700 pt-4 space-y-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">FB（良かった点）</label>
                  <textarea value={fbForm.coach_fb} onChange={e => setFbForm(f => ({ ...f, coach_fb: e.target.value }))} className="input-dark w-full px-4 py-2.5 rounded-xl text-sm" rows={3} placeholder="良かった点を入力..." />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">FF（次回改善点）</label>
                  <textarea value={fbForm.coach_ff} onChange={e => setFbForm(f => ({ ...f, coach_ff: e.target.value }))} className="input-dark w-full px-4 py-2.5 rounded-xl text-sm" rows={3} placeholder="改善点を入力..." />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1.5 uppercase tracking-wider">スコア加算 (pt)</label>
                  <input type="number" value={fbForm.score} onChange={e => setFbForm(f => ({ ...f, score: Number(e.target.value) }))} className="input-dark w-32 px-4 py-2.5 rounded-xl text-sm" />
                </div>
                <button onClick={saveFbFf} disabled={saving} className="btn-gold w-full py-3 rounded-xl text-sm disabled:opacity-50">
                  {saving ? '保存中...' : 'FB/FFを保存'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {client.daily_reports.length === 0 && (
                <div className="glass-card rounded-xl p-8 text-center text-slate-500 text-sm">まだ日報がありません</div>
              )}
              {client.daily_reports.map(r => (
                <button
                  key={r.id}
                  onClick={() => { setSelectedReport(r); setFbForm({ coach_fb: r.coach_fb ?? '', coach_ff: r.coach_ff ?? '', score: r.score }) }}
                  className="glass-card w-full rounded-xl px-4 py-3 text-left hover:border-gold-500/30 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">{r.report_date}</span>
                    <div className="flex items-center gap-2">
                      {r.score !== 0 && <span className="text-xs text-gold-400">+{r.score}pt</span>}
                      {!r.coach_fb && r.result && <span className="text-xs bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">未FB</span>}
                      {r.coach_fb && <span className="text-xs text-emerald-400">FB済</span>}
                      {r.achieved !== null && (
                        <span className={`text-xs ${r.achieved ? 'text-emerald-400' : 'text-red-400'}`}>{r.achieved ? '✓' : '✗'}</span>
                      )}
                    </div>
                  </div>
                  {r.result && <p className="text-xs text-slate-400 mt-1 line-clamp-1">{r.result}</p>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── ミーティング ── */}
      {tab === 'meetings' && (
        <div className="space-y-4">
          <div className="glass-card rounded-2xl p-6 space-y-4">
            <h3 className="font-semibold text-white text-sm">新しいミーティングメモ</h3>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">日付</label>
              <input type="date" value={meetingForm.meeting_date} onChange={e => setMeetingForm(f => ({ ...f, meeting_date: e.target.value }))} className="input-dark px-4 py-2.5 rounded-xl text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">メモ</label>
              <textarea value={meetingForm.memo} onChange={e => setMeetingForm(f => ({ ...f, memo: e.target.value }))} className="input-dark w-full px-4 py-2.5 rounded-xl text-sm" rows={6} placeholder="ミーティング内容を記録..." />
            </div>
            <button onClick={saveMeeting} disabled={saving} className="btn-gold w-full py-3 rounded-xl text-sm disabled:opacity-50">
              {saving ? '保存中...' : '保存する'}
            </button>
          </div>
          <div className="space-y-2">
            {client.monthly_meetings.map(m => (
              <div key={m.id} className="glass-card rounded-xl p-4">
                <div className="text-xs text-slate-400 mb-2">{m.meeting_date}</div>
                <p className="text-sm text-slate-300 whitespace-pre-wrap">{m.memo}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
