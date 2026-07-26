'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { getLevelProgress, getNextLevelThreshold, getLevelFromScore, getCurrentLevelThreshold } from '@/lib/level-system'
import type { ClientGoal, DailyReport } from '@/lib/supabase'

type Tab = 'home' | 'tasks' | 'report' | 'map' | 'reward' | 'chart' | 'history' | 'plan'
type WeekStart = 0 | 1
type ChartPeriod = 'daily' | 'weekly' | 'monthly'

type Completion = { task_id: string; slot_id?: string; completion_date: string; completed: boolean }
type TimeSlot = { id: string; time: string; task_id: string; task_name: string; point_value: number; task_memo?: string }
type ChartPoint = { label: string; score: number }

type ClientData = {
  id: string; name: string; total_score: number; current_level: number
  ideal_maps: Record<string, string | null> | null
  client_goals: ClientGoal[]; daily_reports: DailyReport[]
  weekly_completions: Completion[]; week_start: string
}

const IDEAL_MAP_LABELS: [string, string][] = [
  ['ideal_life', '理想の人生'], ['bottleneck', '現状/ボトルネック'],
  ['determination', '覚悟（犠牲）'], ['discipline', '規律習慣'],
  ['mindset', 'マインドセット'], ['new_environment', '新たな環境'],
  ['goal_3y', '3年後ゴール'], ['goal_1y', '1年後ゴール'], ['goal_3m', '3ヶ月後ゴール'],
  ['origin', '原点'],
]

const DAY_LABELS_MON_JA = ['月', '火', '水', '木', '金', '土', '日']
const DAY_LABELS_SUN_JA = ['日', '月', '火', '水', '木', '金', '土']
const DAY_LABELS_MON_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAY_LABELS_SUN_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getWeekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart); d.setDate(d.getDate() + i)
    return localDate(d)
  })
}

function getAnchorDate(weekStartDay: WeekStart, offset: number): string {
  const today = new Date()
  const day = today.getDay()
  const daysBack = weekStartDay === 1 ? (day === 0 ? 6 : day - 1) : day
  const monday = new Date(today)
  monday.setDate(today.getDate() - daysBack + offset * 7)
  return localDate(monday)
}

function ck(slotId: string, date: string) { return `${slotId}_${date}` }
function genId() { return Math.random().toString(36).slice(2, 10) }
function parseMemo(memo: string | null | undefined): TimeSlot[] {
  if (!memo) return []
  try { return JSON.parse(memo) as TimeSlot[] } catch { return [] }
}

// ──────────────────────────────────────────
// Execution Plan Tab
// ──────────────────────────────────────────
type PlanStatus = 'notstarted' | 'inprogress' | 'done'
type PlanNode = { id: string; title: string; status: PlanStatus; startDate: string; endDate: string; children: PlanNode[]; collapsed: boolean; struck?: boolean }

type PlanVersion = { id: string; date: string; nodes: PlanNode[] }

function planGenId() { return Math.random().toString(36).slice(2, 10) }
function planNode(title = '', status: PlanStatus = 'notstarted'): PlanNode {
  return { id: planGenId(), title, status, startDate: '', endDate: '', children: [], collapsed: false }
}

const STATUS_LABELS_JA: Record<PlanStatus, string> = { notstarted: '未着手', inprogress: '進行中', done: '完了' }
const STATUS_LABELS_EN: Record<PlanStatus, string> = { notstarted: 'Not Started', inprogress: 'In Progress', done: 'Done' }
const STATUS_COLORS: Record<PlanStatus, string> = { notstarted: '#475569', inprogress: '#3b82f6', done: '#10b981' }

function updateNode(nodes: PlanNode[], id: string, updater: (n: PlanNode) => PlanNode): PlanNode[] {
  return nodes.map(n => {
    if (n.id === id) return updater(n)
    return { ...n, children: updateNode(n.children, id, updater) }
  })
}
function removeNode(nodes: PlanNode[], id: string): PlanNode[] {
  return nodes.filter(n => n.id !== id).map(n => ({ ...n, children: removeNode(n.children, id) }))
}
function addChild(nodes: PlanNode[], parentId: string, child: PlanNode): PlanNode[] {
  return nodes.map(n => {
    if (n.id === parentId) return { ...n, children: [child, ...n.children] }
    return { ...n, children: addChild(n.children, parentId, child) }
  })
}

function reorderNodes(nodes: PlanNode[], draggedId: string, targetId: string, before: boolean): PlanNode[] {
  // まずdraggedNodeを全体から取り出す
  let dragged: PlanNode | null = null
  function extract(ns: PlanNode[]): PlanNode[] {
    return ns.filter(n => { if (n.id === draggedId) { dragged = n; return false } return true })
      .map(n => ({ ...n, children: extract(n.children) }))
  }
  const without = extract(nodes)
  if (!dragged) return nodes
  // targetの位置に挿入
  function insert(ns: PlanNode[]): PlanNode[] {
    const idx = ns.findIndex(n => n.id === targetId)
    if (idx !== -1) {
      const result = [...ns]
      result.splice(before ? idx : idx + 1, 0, dragged!)
      return result
    }
    return ns.map(n => ({ ...n, children: insert(n.children) }))
  }
  return insert(without)
}

function PlanRow({ node, depth, onUpdate, onRemove, onAddChild, lang, draggedId, onDragStart, onDrop }: {
  node: PlanNode; depth: number; lang: 'en' | 'ja'
  onUpdate: (id: string, u: (n: PlanNode) => PlanNode) => void
  onRemove: (id: string) => void
  onAddChild: (parentId: string) => void
  draggedId: string | null
  onDragStart: (id: string) => void
  onDrop: (targetId: string, before: boolean) => void
}) {
  const [editing, setEditing] = useState<'title' | 'start' | 'end' | null>(null)
  const [draft, setDraft] = useState('')
  const [dropPos, setDropPos] = useState<'before' | 'after' | null>(null)

  function startEdit(field: 'title' | 'start' | 'end') {
    setEditing(field)
    setDraft(field === 'title' ? node.title : field === 'start' ? node.startDate : node.endDate)
  }
  function commit(field: 'title' | 'start' | 'end') {
    onUpdate(node.id, n => ({ ...n, [field === 'title' ? 'title' : field === 'start' ? 'startDate' : 'endDate']: draft }))
    setEditing(null)
  }
  function cycleStatus() {
    const order: PlanStatus[] = ['notstarted', 'inprogress', 'done']
    const next = order[(order.indexOf(node.status) + 1) % 3]
    onUpdate(node.id, n => ({ ...n, status: next }))
  }

  const indent = depth * 16
  const isDragging = draggedId === node.id

  return (
    <>
      <div
        draggable
        onDragStart={e => { e.stopPropagation(); onDragStart(node.id) }}
        onDragOver={e => {
          if (draggedId === node.id) return
          e.preventDefault(); e.stopPropagation()
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
          setDropPos(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after')
        }}
        onDragLeave={() => setDropPos(null)}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); if (dropPos) { onDrop(node.id, dropPos === 'before'); setDropPos(null) } }}
        onDragEnd={() => setDropPos(null)}
        className={`flex items-center gap-2 px-3 py-2 border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors relative ${isDragging ? 'opacity-40' : ''}`}
        style={{ paddingLeft: `${12 + indent}px` }}
      >
        {dropPos === 'before' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-gold-400 pointer-events-none" />}
        {dropPos === 'after' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-400 pointer-events-none" />}

        {/* drag handle */}
        <span className="text-slate-500 hover:text-slate-300 text-sm cursor-grab active:cursor-grabbing shrink-0 select-none leading-none">⠿</span>

        {/* toggle */}
        <button
          onClick={() => onUpdate(node.id, n => ({ ...n, collapsed: !n.collapsed }))}
          className="w-4 h-4 shrink-0 flex items-center justify-center text-slate-600 hover:text-slate-400 text-[10px]"
        >
          {node.children.length > 0 ? (node.collapsed ? '▶' : '▼') : <span className="w-2 h-2 rounded-full bg-slate-700 inline-block" />}
        </button>

        {/* status badge */}
        <button
          onClick={cycleStatus}
          className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors"
          style={{ color: STATUS_COLORS[node.status], borderColor: STATUS_COLORS[node.status] + '60', background: STATUS_COLORS[node.status] + '18' }}
        >
          {(lang === 'en' ? STATUS_LABELS_EN : STATUS_LABELS_JA)[node.status]}
        </button>

        {/* title */}
        {editing === 'title' ? (
          <input
            autoFocus
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onBlur={() => commit('title')}
            onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) commit('title'); if (e.key === 'Escape') setEditing(null) }}
            className="input-dark flex-1 min-w-0 px-2 py-1 rounded-lg text-xs"
          />
        ) : (
          <button onClick={() => startEdit('title')} className={`flex-1 min-w-0 text-left text-xs truncate ${node.struck ? 'line-through text-red-400/70' : 'text-slate-200 hover:text-white'}`}>{node.title || <span className="text-slate-600">{lang === 'en' ? 'Enter title...' : 'タイトルを入力...'}</span>}</button>
        )}

        {/* dates */}
        <div className="flex items-center gap-1 shrink-0">
          {editing === 'start' ? (
            <input autoFocus type="date" value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => commit('start')} className="input-dark w-28 px-1 py-0.5 rounded text-[10px] text-center" />
          ) : (
            <button onClick={() => startEdit('start')} className="text-[10px] text-slate-500 hover:text-slate-300 w-16 text-center">{node.startDate || (lang === 'en' ? 'Start' : '開始')}</button>
          )}
          <span className="text-slate-700 text-[9px]">→</span>
          {editing === 'end' ? (
            <input autoFocus type="date" value={draft} onChange={e => setDraft(e.target.value)} onBlur={() => commit('end')} className="input-dark w-28 px-1 py-0.5 rounded text-[10px] text-center" />
          ) : (
            <button onClick={() => startEdit('end')} className="text-[10px] text-slate-500 hover:text-slate-300 w-16 text-center">{node.endDate || (lang === 'en' ? 'Due' : '期限')}</button>
          )}
        </div>

        {/* actions */}
        <button onClick={() => onUpdate(node.id, n => ({ ...n, struck: !n.struck }))} className={`shrink-0 w-5 h-5 flex items-center justify-center text-[10px] transition-colors ${node.struck ? 'text-red-400' : 'text-slate-600 hover:text-red-400'}`} title={lang === 'en' ? 'Strike through' : '訂正線'}>S̶</button>
        <button onClick={() => onAddChild(node.id)} className="shrink-0 w-5 h-5 flex items-center justify-center text-slate-600 hover:text-gold-400 text-[11px] transition-colors">＋</button>
        <button onClick={() => { if (confirm(lang === 'en' ? 'Delete?' : '削除しますか？')) onRemove(node.id) }} className="shrink-0 w-5 h-5 flex items-center justify-center text-slate-700 hover:text-red-400 text-[10px] transition-colors">✕</button>
      </div>

      {!node.collapsed && node.children.map(child => (
        <PlanRow key={child.id} node={child} depth={depth + 1} onUpdate={onUpdate} onRemove={onRemove} onAddChild={onAddChild} lang={lang} draggedId={draggedId} onDragStart={onDragStart} onDrop={onDrop} />
      ))}
    </>
  )
}

function PlanCard({ version, lang, onSave, onDuplicate, onDelete }: {
  version: PlanVersion; lang: 'en' | 'ja'
  onSave: (id: string, nodes: PlanNode[]) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
}) {
  const [nodes, setNodes] = useState<PlanNode[]>(version.nodes)
  const [saved, setSaved] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)

  function handleDrop(targetId: string, before: boolean) {
    if (!draggedId || draggedId === targetId) return
    const reordered = reorderNodes(nodes, draggedId, targetId, before)
    setDraggedId(null)
    save(reordered)
  }

  function save(updated: PlanNode[]) {
    setNodes(updated)
    onSave(version.id, updated)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  function handleUpdate(id: string, updater: (n: PlanNode) => PlanNode) { save(updateNode(nodes, id, updater)) }
  function handleRemove(id: string) { save(removeNode(nodes, id)) }
  function handleAddChild(parentId: string) { save(addChild(nodes, parentId, planNode())) }
  function handleAddRoot() { save([planNode(), ...nodes]) }

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-slate-500 font-medium">{version.date}</span>
        <div className="flex items-center gap-2">
          {saved && <span className="text-[10px] text-emerald-400">{lang === 'en' ? 'Saved ✓' : '保存 ✓'}</span>}
          <button onClick={() => onDuplicate(version.id)} className="text-[10px] text-slate-500 hover:text-gold-400 border border-slate-700 hover:border-gold-500/50 px-2 py-0.5 rounded transition-colors">
            {lang === 'en' ? 'Duplicate' : '複製'}
          </button>
          <button onClick={() => { if (confirm(lang === 'en' ? 'Delete this plan?' : 'この計画を削除しますか？')) onDelete(version.id) }} className="text-[10px] text-slate-600 hover:text-red-400 transition-colors">✕</button>
        </div>
      </div>
      <div className="glass-card rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700/60 bg-slate-800/40">
          <div className="w-4 shrink-0" />
          <div className="w-14 shrink-0 text-[9px] text-slate-500 font-bold uppercase tracking-wider">{lang === 'en' ? 'Status' : '状態'}</div>
          <div className="flex-1 text-[9px] text-slate-500 font-bold uppercase tracking-wider">{lang === 'en' ? 'Project / Task' : 'プロジェクト / タスク'}</div>
          <div className="flex gap-1 shrink-0">
            <div className="w-16 text-[9px] text-slate-500 text-center">{lang === 'en' ? 'Start' : '開始'}</div>
            <div className="w-2" />
            <div className="w-16 text-[9px] text-slate-500 text-center">{lang === 'en' ? 'Due' : '期限'}</div>
          </div>
          <div className="w-10 shrink-0" />
        </div>
        {nodes.length === 0 ? (
          <div className="py-8 text-center text-slate-600 text-sm">{lang === 'en' ? 'No projects yet' : 'プロジェクトがありません'}</div>
        ) : (
          nodes.map(node => (
            <PlanRow key={node.id} node={node} depth={0} onUpdate={handleUpdate} onRemove={handleRemove} onAddChild={handleAddChild} lang={lang} draggedId={draggedId} onDragStart={setDraggedId} onDrop={handleDrop} />
          ))
        )}
        <div className="px-3 py-2 border-t border-slate-800/40">
          <button onClick={handleAddRoot} className="text-xs text-slate-500 hover:text-gold-400 transition-colors">
            ＋ {lang === 'en' ? 'Add Project' : 'プロジェクトを追加'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ExecutionPlanTab({ token, lang }: { token: string; lang: 'en' | 'ja' }) {
  const VERSIONS_KEY = `exec_plans_${token}`
  const OLD_KEY = `exec_plan_v1_${token}`

  const [versions, setVersions] = useState<PlanVersion[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const existing = localStorage.getItem(VERSIONS_KEY)
      if (existing) return JSON.parse(existing)
      const old = localStorage.getItem(OLD_KEY)
      if (old) {
        const today = localDate(new Date())
        return [{ id: planGenId(), date: today, nodes: JSON.parse(old) }]
      }
      return []
    } catch { return [] }
  })

  function persist(updated: PlanVersion[]) {
    setVersions(updated)
    localStorage.setItem(VERSIONS_KEY, JSON.stringify(updated))
  }

  function handleSave(id: string, nodes: PlanNode[]) {
    persist(versions.map(v => v.id === id ? { ...v, nodes } : v))
  }

  function handleDuplicate(id: string) {
    const src = versions.find(v => v.id === id)
    if (!src) return
    const today = localDate(new Date())
    const copy: PlanVersion = { id: planGenId(), date: today, nodes: JSON.parse(JSON.stringify(src.nodes)) }
    persist([copy, ...versions])
  }

  function handleDelete(id: string) {
    const target = versions.find(v => v.id === id)
    if (target) {
      const TRASH_KEY = `exec_plans_trash_${token}`
      try {
        const existing = localStorage.getItem(TRASH_KEY)
        const trash: PlanVersion[] = existing ? JSON.parse(existing) : []
        localStorage.setItem(TRASH_KEY, JSON.stringify([target, ...trash]))
      } catch {}
    }
    persist(versions.filter(v => v.id !== id))
  }

  function handleAddNew() {
    const today = localDate(new Date())
    const blank: PlanVersion = { id: planGenId(), date: today, nodes: [] }
    persist([blank, ...versions])
  }

  return (
    <>
      <div className="flex items-center justify-between pt-1 mb-3">
        <h2 className="text-lg font-bold text-white">{lang === 'en' ? 'Execution Plan' : '実行計画'}</h2>
        <button onClick={handleAddNew} className="btn-gold px-3 py-1.5 rounded-lg text-xs font-semibold">
          ＋ {lang === 'en' ? 'New Plan' : '新しい計画'}
        </button>
      </div>

      {versions.length === 0 ? (
        <div className="glass-card rounded-2xl py-12 text-center text-slate-600 text-sm">
          {lang === 'en' ? 'No plans yet' : '計画がありません'}
        </div>
      ) : (
        versions.map(v => (
          <PlanCard key={v.id} version={v} lang={lang} onSave={handleSave} onDuplicate={handleDuplicate} onDelete={handleDelete} />
        ))
      )}
    </>
  )
}

// ──────────────────────────────────────────
// Ideal Map Node (must be outside MapTab to avoid remount bug)
// ──────────────────────────────────────────
type MapNodeProps = {
  nodeKey: string; label: string; accent?: boolean; size?: 'sm' | 'md' | 'lg'
  val: string; isEditing: boolean; draft: string; savedKey: string | null
  onOpen: (key: string) => void
  onDraftChange: (v: string) => void
  onCommit: (key: string) => void
  onEscape: () => void
  editableLabel?: boolean
  labelDraft?: string
  isEditingLabel?: boolean
  onLabelClick?: () => void
  onLabelChange?: (v: string) => void
  onLabelCommit?: () => void
  onLabelEscape?: () => void
}
function MapNode({ nodeKey, label, accent = false, size = 'md', val, isEditing, draft, savedKey, onOpen, onDraftChange, onCommit, onEscape, editableLabel, labelDraft, isEditingLabel, onLabelClick, onLabelChange, onLabelCommit, onLabelEscape }: MapNodeProps) {
  const sizeClass = size === 'lg' ? 'p-4' : size === 'sm' ? 'p-2.5' : 'p-3'
  const textSize = size === 'lg' ? 'text-sm' : 'text-xs'
  return (
    <div
      className={`relative rounded-2xl border cursor-pointer transition-all ${accent ? 'bg-gold-500/10 border-gold-500/40' : 'glass-card border-slate-700/60'} ${isEditing ? 'border-gold-400/60 ring-1 ring-gold-400/30' : 'hover:border-slate-600'} ${sizeClass}`}
      onClick={() => !isEditing && !isEditingLabel && onOpen(nodeKey)}
    >
      {editableLabel && isEditingLabel ? (
        <input
          autoFocus
          value={labelDraft ?? ''}
          onChange={e => onLabelChange?.(e.target.value)}
          onBlur={() => onLabelCommit?.()}
          onKeyDown={e => { if (e.key === 'Enter') onLabelCommit?.(); if (e.key === 'Escape') onLabelEscape?.() }}
          onClick={e => e.stopPropagation()}
          className="input-dark w-full px-1 py-0.5 rounded text-[9px] font-bold mb-1 bg-transparent border border-gold-500/40"
        />
      ) : (
        <div
          className={`text-[9px] font-bold tracking-widest uppercase mb-1 ${accent ? 'text-gold-400' : 'text-slate-500'} ${editableLabel ? 'cursor-text hover:text-gold-400/70' : ''}`}
          onClick={editableLabel ? e => { e.stopPropagation(); onLabelClick?.() } : undefined}
          title={editableLabel ? 'タップしてラベルを編集' : undefined}
        >{label}</div>
      )}
      {isEditing ? (
        <textarea
          autoFocus
          value={draft}
          onChange={e => onDraftChange(e.target.value)}
          onBlur={() => onCommit(nodeKey)}
          onKeyDown={e => { if (e.key === 'Escape') onEscape(); else if (e.key === 'Enter' && e.metaKey) onCommit(nodeKey) }}
          className="input-dark w-full px-2 py-1.5 rounded-xl resize-none bg-transparent border border-gold-500/30"
          rows={3}
          placeholder={`${label}を入力...`}
          onClick={e => e.stopPropagation()}
        />
      ) : (
        <div className={`${textSize} ${val ? 'text-slate-300' : 'text-slate-600'} leading-relaxed line-clamp-3 min-h-[2.5rem]`}>
          {val || 'タップして入力...'}
        </div>
      )}
      {savedKey === nodeKey && !isEditing && (
        <span className="absolute top-1 right-2 text-[9px] text-emerald-400">保存 ✓</span>
      )}
    </div>
  )
}

// ──────────────────────────────────────────
// Ideal Map Tab (Visual Map)
// ──────────────────────────────────────────
type IdealMap = { id: string; map_date: string | null; ideal_life?: string; bottleneck?: string; determination?: string; discipline?: string; mindset?: string; new_environment?: string; goal_3y?: string; goal_1y?: string; goal_3m?: string; goal_labels?: string | null; origin?: string }

const MONTH_ABBR_GLOBAL = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function makeDefaultGoalLabels(): Record<string, string> {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth() + 1
  const d = now.getDate()
  const m3 = m + 3 > 12 ? m + 3 - 12 : m + 3
  const y3m = m + 3 > 12 ? y + 1 : y
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    goal_3y: `${y + 3}-${pad(m)}-${pad(d)}`,
    goal_1y: `${y + 1}-${pad(m)}-${pad(d)}`,
    goal_3m: `${y3m}-${pad(m3)}-${pad(d)}`,
  }
}
const DEFAULT_GOAL_LABELS: Record<string, string> = makeDefaultGoalLabels()

// Parse "YYYY-MM-DD", "YYYY-MM", or legacy "N年M月まで" → { year, month, day }
function parseGoalLabel(label: string): { year: number; month: number; day: number } | null {
  const isoFull = label.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoFull) return { year: parseInt(isoFull[1]), month: parseInt(isoFull[2]), day: parseInt(isoFull[3]) }
  const isoShort = label.match(/^(\d{4})-(\d{2})$/)
  if (isoShort) return { year: parseInt(isoShort[1]), month: parseInt(isoShort[2]), day: 1 }
  const yearMatch = label.match(/(\d{4})年/)
  const monthMatch = label.match(/(\d{1,2})月/)
  if (!yearMatch) return null
  return { year: parseInt(yearMatch[1]), month: monthMatch ? parseInt(monthMatch[1]) : new Date().getMonth() + 1, day: 1 }
}

function goalRemainingText(label: string, lang: 'en' | 'ja' = 'ja'): string {
  const parsed = parseGoalLabel(label)
  if (!parsed) return ''
  const now = new Date()
  const months = (parsed.year - now.getFullYear()) * 12 + (parsed.month - (now.getMonth() + 1))
  if (months <= 0) return ''
  if (lang === 'en') {
    if (months >= 12) return `${Math.round(months / 12)}y left`
    return `${months}mo left`
  }
  if (months >= 12) return `あと${Math.round(months / 12)}年`
  return `あと${months}ヶ月`
}

function formatGoalLabel(label: string, lang: 'en' | 'ja'): string {
  const parsed = parseGoalLabel(label)
  if (!parsed) return label
  if (lang === 'en') return `${MONTH_ABBR_GLOBAL[parsed.month - 1]} ${parsed.day}, ${parsed.year}`
  return `${parsed.year}年${parsed.month}月${parsed.day}日`
}

function SingleMapCard({ mapData, token, onDelete, lang, onGoalLabelsChange }: { mapData: IdealMap; token: string; onDelete: (id: string) => void; lang: 'en' | 'ja'; onGoalLabelsChange?: (labels: Record<string, string>) => void }) {
  const [map, setMap] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    IDEAL_MAP_LABELS.forEach(([k]) => { m[k] = (mapData as any)[k] ?? '' })
    return m
  })
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [savedKey, setSavedKey] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [dateEdit, setDateEdit] = useState(false)
  const [dateDraft, setDateDraft] = useState(mapData.map_date ?? '')
  const saveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const [goalLabels, setGoalLabels] = useState<Record<string, string>>(() => {
    try { return mapData.goal_labels ? { ...DEFAULT_GOAL_LABELS, ...JSON.parse(mapData.goal_labels) } : { ...DEFAULT_GOAL_LABELS } }
    catch { return { ...DEFAULT_GOAL_LABELS } }
  })

  function setGoalDeadline(key: string, yyyymmdd: string) {
    const updated = { ...goalLabels, [key]: yyyymmdd }
    setGoalLabels(updated)
    onGoalLabelsChange?.(updated)
    fetch(`/api/client/${token}/ideal-map`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map_id: mapData.id, goal_labels: JSON.stringify(updated) }),
    })
  }

  function openEdit(key: string) { setEditing(key); setDraft(map[key] ?? '') }

  function commitEdit(key: string) {
    const val = draft
    setMap(m => ({ ...m, [key]: val }))
    setEditing(null)
    if (saveTimers.current[key]) clearTimeout(saveTimers.current[key])
    saveTimers.current[key] = setTimeout(async () => {
      await fetch(`/api/client/${token}/ideal-map`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ map_id: mapData.id, [key]: val }),
      })
      setSavedKey(key)
      setTimeout(() => setSavedKey(k => k === key ? null : k), 2000)
    }, 300)
  }

  async function commitDate() {
    setDateEdit(false)
    await fetch(`/api/client/${token}/ideal-map`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map_id: mapData.id, map_date: dateDraft }),
    })
  }

  const nodeProps = (key: string) => ({
    val: map[key] ?? '', isEditing: editing === key, draft, savedKey,
    onOpen: openEdit, onDraftChange: setDraft, onCommit: commitEdit, onEscape: () => setEditing(null),
  })


  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      {/* ヘッダー */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
        {dateEdit ? (
          <input autoFocus type="date" value={dateDraft} onChange={e => setDateDraft(e.target.value)}
            onBlur={commitDate} onKeyDown={e => { if (e.key === 'Enter') commitDate() }}
            className="input-dark px-2 py-1 rounded-lg text-xs flex-1" />
        ) : (
          <button onClick={() => setDateEdit(true)} className="flex-1 text-left">
            <span className="text-xs font-bold text-gold-400">{dateDraft || (lang === 'en' ? 'No date' : '日付未設定')}</span>
            <span className="text-[9px] text-slate-600 ml-2">{lang === 'en' ? 'Tap to edit' : 'タップして編集'}</span>
          </button>
        )}
        <button onClick={() => onDelete(mapData.id)}
          className="text-slate-700 hover:text-red-400 text-[10px] shrink-0 px-1" title={lang === 'en' ? 'Move to trash' : 'ゴミ箱へ'}>🗑</button>
        <button onClick={() => setCollapsed(v => !v)}
          className={`text-slate-500 text-xs transition-transform inline-block shrink-0 ${collapsed ? '' : 'rotate-180'}`}>▾</button>
      </div>

      {!collapsed && (
        <div className="p-4 space-y-2">
          <MapNode nodeKey="ideal_life" label={lang === 'en' ? '🌟 Ideal Life' : '🌟 理想の人生'} accent size="lg" {...nodeProps('ideal_life')} />
          <div className="flex justify-center text-gold-500/40 text-lg leading-none">↓</div>
          <div className="grid grid-cols-3 gap-2">
            {(['goal_3y', 'goal_1y', 'goal_3m'] as const).map(key => {
              const label = goalLabels[key] ?? DEFAULT_GOAL_LABELS[key]
              const parsed = parseGoalLabel(label) ?? { year: new Date().getFullYear() + 1, month: new Date().getMonth() + 1, day: new Date().getDate() }
              const remaining = goalRemainingText(label, lang)
              const nowY = new Date().getFullYear()
              const nodeSize = key === 'goal_3y' ? 'lg' : key === 'goal_1y' ? 'md' : 'sm'
              const titleSize = key === 'goal_3y' ? 'text-[11px]' : key === 'goal_1y' ? 'text-[10px]' : 'text-[9px]'
              const selectSize = key === 'goal_3y' ? 'text-[10px]' : 'text-[9px]'
              return (
                <div key={key} className="glass-card rounded-xl p-2 flex flex-col gap-1.5">
                  <div className={`${titleSize} text-gold-400/70 font-bold text-center`}>
                    {key === 'goal_3y' ? (lang === 'en' ? '3Y Goal' : '3年後') : key === 'goal_1y' ? (lang === 'en' ? '1Y Goal' : '1年後') : (lang === 'en' ? '3M Goal' : '3ヶ月後')}
                  </div>
                  <div className="flex gap-1 justify-center flex-wrap">
                    <select value={parsed.year} onChange={e => setGoalDeadline(key, `${e.target.value}-${String(parsed.month).padStart(2,'0')}-${String(parsed.day).padStart(2,'0')}`)}
                      className={`input-dark ${selectSize} px-1 py-0.5 rounded text-center appearance-none`}>
                      {Array.from({ length: 13 }, (_, i) => nowY - 1 + i).map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                    <select value={parsed.month} onChange={e => setGoalDeadline(key, `${parsed.year}-${String(e.target.value).padStart(2,'0')}-${String(parsed.day).padStart(2,'0')}`)}
                      className={`input-dark ${selectSize} px-1 py-0.5 rounded text-center appearance-none`}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select value={parsed.day} onChange={e => setGoalDeadline(key, `${parsed.year}-${String(parsed.month).padStart(2,'0')}-${String(e.target.value).padStart(2,'0')}`)}
                      className={`input-dark ${selectSize} px-1 py-0.5 rounded text-center appearance-none`}>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                  {remaining && <div className="text-[9px] text-slate-400 text-center">{remaining}</div>}
                  <MapNode nodeKey={key} size={nodeSize} label="" {...nodeProps(key)} />
                </div>
              )
            })}
          </div>
          <div className="flex justify-center text-gold-500/40 text-lg leading-none">↓</div>
          <MapNode nodeKey="bottleneck" label={lang === 'en' ? '⚡ Current / Bottleneck' : '⚡ 現状/ボトルネック'} {...nodeProps('bottleneck')} />
          <div className="border-t border-slate-700/50 my-1" />
          <div className="text-[10px] text-slate-600 uppercase tracking-widest text-center">{lang === 'en' ? '── Pillars ──' : '── 支柱 ──'}</div>
          <div className="grid grid-cols-2 gap-2">
            <MapNode nodeKey="determination" label={lang === 'en' ? '💪 Commitment' : '💪 覚悟（犠牲）'} size="sm" {...nodeProps('determination')} />
            <MapNode nodeKey="discipline" label={lang === 'en' ? '📅 Discipline' : '📅 規律習慣'} size="sm" {...nodeProps('discipline')} />
            <MapNode nodeKey="mindset" label={lang === 'en' ? '🧠 Mindset' : '🧠 マインドセット'} size="sm" {...nodeProps('mindset')} />
            <MapNode nodeKey="new_environment" label={lang === 'en' ? '🌐 New Environment' : '🌐 新たな環境'} size="sm" {...nodeProps('new_environment')} />
          </div>
          <div className="border-t border-slate-700/50 my-1" />
          <MapNode nodeKey="origin" label={lang === 'en' ? '🌱 Origin' : '🌱 原点'} size="sm" {...nodeProps('origin')} />
        </div>
      )}
    </div>
  )
}

function MapTab({ token, lang, onGoalLabelsChange }: { token: string; lang: 'en' | 'ja'; onGoalLabelsChange?: (labels: Record<string, string>) => void }) {
  const [maps, setMaps] = useState<IdealMap[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    fetch(`/api/client/${token}/ideal-map`)
      .then(r => r.json()).then(d => { setMaps(Array.isArray(d) ? d : []); setLoading(false) })
  }, [token])

  async function addMap() {
    setAdding(true)
    const today = localDate(new Date())
    const source = maps[0]
    const body = source ? {
      map_date: today, ideal_life: source.ideal_life, bottleneck: source.bottleneck,
      determination: source.determination, discipline: source.discipline, mindset: source.mindset,
      new_environment: source.new_environment, goal_3y: source.goal_3y, goal_1y: source.goal_1y,
      goal_3m: source.goal_3m, goal_labels: source.goal_labels, origin: source.origin,
    } : { map_date: today }
    const res = await fetch(`/api/client/${token}/ideal-map`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    const newMap = await res.json()
    setMaps(m => [newMap, ...m])
    setAdding(false)
  }

  function deleteMap(id: string) {
    setMaps(m => m.filter(x => x.id !== id))
    fetch(`/api/client/${token}/ideal-map`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map_id: id }),
    })
  }

  return (
    <>
      <div className="flex items-center justify-between pt-1 mb-3">
        <div>
          <h2 className="text-lg font-bold text-white">{lang === 'en' ? 'Vision Map' : 'ビジョンマップ'}</h2>
          <p className="text-[10px] text-slate-600 mt-0.5">{maps.length} {lang === 'en' ? 'maps · Tap date to edit' : '件 · 日付タップで編集'}</p>
        </div>
        <button onClick={addMap} disabled={adding}
          className="btn-gold px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-40">
          {adding ? '...' : `＋ ${lang === 'en' ? 'New Map' : '新しいマップ'}`}
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">{[...Array(2)].map((_, i) => <div key={i} className="glass-card rounded-2xl p-4 h-40 shimmer" />)}</div>
      ) : maps.length === 0 ? (
        <div className="glass-card rounded-2xl p-8 text-center text-slate-500 text-sm">
          {lang === 'en' ? 'No maps yet' : 'マップがありません'}<br />
          <button onClick={addMap} className="mt-3 btn-gold px-4 py-2 rounded-xl text-xs font-bold">＋ {lang === 'en' ? 'Create First Map' : '最初のマップを作成'}</button>
        </div>
      ) : (
        <div className="space-y-4">
          {maps.map(m => (
            <SingleMapCard key={m.id} mapData={m} token={token} onDelete={deleteMap} lang={lang} onGoalLabelsChange={onGoalLabelsChange} />
          ))}
        </div>
      )}
    </>
  )
}

// ──────────────────────────────────────────
// Log Tab (formerly History)
// ──────────────────────────────────────────
function HistoryTab({ lang, token, dailyReports, onMapRestored, T }: {
  lang: 'en' | 'ja'; token: string; dailyReports: DailyReport[]
  onMapRestored: () => void; T: Record<string, unknown>
}) {
  const PLAN_TRASH_KEY = `exec_plans_trash_${token}`
  const PLAN_VERSIONS_KEY = `exec_plans_${token}`

  const [mapTrash, setMapTrash] = useState<IdealMap[]>([])
  const [showMapTrash, setShowMapTrash] = useState(false)
  const [showPlanTrash, setShowPlanTrash] = useState(false)

  // plan trash: read fresh from localStorage every time section opens
  const planTrash: PlanVersion[] = (() => {
    if (typeof window === 'undefined') return []
    try { const s = localStorage.getItem(PLAN_TRASH_KEY); return s ? JSON.parse(s) : [] } catch { return [] }
  })()

  useEffect(() => {
    if (!showMapTrash) return
    fetch(`/api/client/${token}/ideal-map?trash=1`)
      .then(r => r.json()).then(d => setMapTrash(Array.isArray(d) ? d : []))
  }, [showMapTrash, token])

  async function restoreMap(id: string) {
    await fetch(`/api/client/${token}/ideal-map`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map_id: id, restore: true }),
    })
    setMapTrash(t => t.filter(x => x.id !== id))
    onMapRestored()
  }

  function permanentDeleteMap(id: string) {
    setMapTrash(t => t.filter(x => x.id !== id))
    fetch(`/api/client/${token}/ideal-map`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ map_id: id, permanent: true }),
    })
  }

  function restorePlan(id: string) {
    const current: PlanVersion[] = (() => { try { const s = localStorage.getItem(PLAN_TRASH_KEY); return s ? JSON.parse(s) : [] } catch { return [] } })()
    const target = current.find(v => v.id === id)
    if (!target) return
    try {
      const vs: PlanVersion[] = (() => { try { const s = localStorage.getItem(PLAN_VERSIONS_KEY); return s ? JSON.parse(s) : [] } catch { return [] } })()
      localStorage.setItem(PLAN_VERSIONS_KEY, JSON.stringify([target, ...vs]))
      localStorage.setItem(PLAN_TRASH_KEY, JSON.stringify(current.filter(v => v.id !== id)))
    } catch {}
    // force re-render by toggling
    setShowPlanTrash(false); setTimeout(() => setShowPlanTrash(true), 0)
  }

  function permanentDeletePlan(id: string) {
    const current: PlanVersion[] = (() => { try { const s = localStorage.getItem(PLAN_TRASH_KEY); return s ? JSON.parse(s) : [] } catch { return [] } })()
    localStorage.setItem(PLAN_TRASH_KEY, JSON.stringify(current.filter(v => v.id !== id)))
    setShowPlanTrash(false); setTimeout(() => setShowPlanTrash(true), 0)
  }

  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30)
  const cutoffStr = cutoff.toISOString().split('T')[0]
  const recent = dailyReports.filter(r => r.report_date >= cutoffStr)

  return (
    <>
      <h2 className="text-lg font-bold text-white pt-1">{lang === 'en' ? 'Log' : 'ログ'}</h2>

      {/* Daily reports */}
      <div className="text-[10px] text-slate-600 uppercase tracking-widest mb-2">{lang === 'en' ? '── Daily Reports ──' : '── 日報 ──'}</div>
      <div className="space-y-3">
        {recent.length === 0 ? (
          <div className="glass-card rounded-xl p-8 text-center text-slate-500 text-sm">{String(T.noRecentReports ?? (lang === 'en' ? 'No recent reports' : '最近の日報なし'))}</div>
        ) : recent.map(r => (
          <div key={r.id} className="glass-card rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-medium">{r.report_date}</span>
              <div className="flex gap-2">
                {r.score > 0 && <span className="text-xs text-gold-400">+{r.score}pt</span>}
                {r.achieved !== null && (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.achieved ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                    {r.achieved ? String(T.achieved ?? '達成') : String(T.notAchieved ?? '未達成')}
                  </span>
                )}
              </div>
            </div>
            {r.today_goal && <p className="text-xs text-slate-500 mb-1">ゴール：{r.today_goal}</p>}
            {r.result && <p className="text-sm text-slate-300">{r.result}</p>}
            {(r.coach_fb || r.coach_ff) && (
              <div className="border-t border-slate-700 pt-2 mt-2 space-y-1">
                {r.coach_fb && <p className="text-xs text-slate-300"><span className="text-gold-400">FB：</span>{r.coach_fb}</p>}
                {r.coach_ff && <p className="text-xs text-slate-300"><span className="text-emerald-400">FF：</span>{r.coach_ff}</p>}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Map Trash */}
      <div className="mt-6 border-t border-slate-800 pt-4">
        <button onClick={() => setShowMapTrash(v => !v)} className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors font-medium">
          🗑 {lang === 'en' ? 'Deleted Maps' : '削除済みマップ'} {showMapTrash ? '▴' : '▾'}
        </button>
        {showMapTrash && (
          <div className="mt-2 space-y-2">
            {mapTrash.length === 0 ? (
              <p className="text-[11px] text-slate-700 py-3 text-center">{lang === 'en' ? 'Empty' : '空です'}</p>
            ) : mapTrash.map(m => (
              <div key={m.id} className="glass-card rounded-xl px-3 py-2.5 flex items-center gap-3">
                <span className="text-xs text-slate-400 flex-1">{m.map_date ?? '—'}</span>
                <button onClick={() => restoreMap(m.id)} className="text-[11px] text-emerald-500 hover:text-emerald-400 font-medium transition-colors">{lang === 'en' ? 'Restore' : '復元'}</button>
                <button onClick={() => { if (confirm(lang === 'en' ? 'Delete permanently?' : '完全に削除しますか？')) permanentDeleteMap(m.id) }} className="text-[11px] text-slate-600 hover:text-red-400 transition-colors">{lang === 'en' ? 'Delete' : '完全削除'}</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Plan Trash */}
      <div className="mt-3">
        <button onClick={() => setShowPlanTrash(v => !v)} className="flex items-center gap-2 text-xs text-slate-500 hover:text-slate-300 transition-colors font-medium">
          🗑 {lang === 'en' ? 'Deleted Plans' : '削除済みプラン'} {showPlanTrash ? '▴' : '▾'}
        </button>
        {showPlanTrash && (
          <div className="mt-2 space-y-2">
            {planTrash.length === 0 ? (
              <p className="text-[11px] text-slate-700 py-3 text-center">{lang === 'en' ? 'Empty' : '空です'}</p>
            ) : planTrash.map(v => (
              <div key={v.id} className="glass-card rounded-xl px-3 py-2.5 flex items-center gap-3">
                <span className="text-xs text-slate-400 flex-1">{v.date} · {v.nodes.length} {lang === 'en' ? 'projects' : 'プロジェクト'}</span>
                <button onClick={() => restorePlan(v.id)} className="text-[11px] text-emerald-500 hover:text-emerald-400 font-medium transition-colors">{lang === 'en' ? 'Restore' : '復元'}</button>
                <button onClick={() => { if (confirm(lang === 'en' ? 'Delete permanently?' : '完全に削除しますか？')) permanentDeletePlan(v.id) }} className="text-[11px] text-slate-600 hover:text-red-400 transition-colors">{lang === 'en' ? 'Delete' : '完全削除'}</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}

// ──────────────────────────────────────────
// Rewards Tab
// ──────────────────────────────────────────
type Reward = { id: string; content: string; point_value: number; sort_order: number }

function RewardsTab({ token, score, lang }: { token: string; score: number; lang: 'en' | 'ja' }) {
  const [rewards, setRewards] = useState<Reward[]>([])
  const [loading, setLoading] = useState(true)
  const [newPt, setNewPt] = useState('')
  const [newContent, setNewContent] = useState('')
  const [adding, setAdding] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPt, setEditPt] = useState('')
  const [editContent, setEditContent] = useState('')

  async function reload() {
    const d = await fetch(`/api/client/${token}/rewards`).then(r => r.json())
    if (Array.isArray(d)) setRewards(d)
  }

  useEffect(() => {
    reload().then(() => setLoading(false))
  }, [token])

  async function addReward() {
    const pt = parseInt(newPt)
    if (!newContent.trim() || isNaN(pt) || pt <= 0) return
    setAdding(true)
    await fetch(`/api/client/${token}/rewards`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: newContent.trim(), point_value: pt }),
    })
    await reload()
    setNewPt(''); setNewContent(''); setAdding(false)
  }

  async function deleteReward(id: string) {
    setRewards(r => r.filter(x => x.id !== id))
    await fetch(`/api/client/${token}/rewards`, {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
  }

  function startEdit(r: Reward) {
    setEditingId(r.id)
    setEditPt(String(r.point_value))
    setEditContent(r.content)
  }

  async function saveEdit() {
    if (!editingId) return
    const pt = parseInt(editPt)
    if (!editContent.trim() || isNaN(pt) || pt <= 0) return
    setRewards(rs => rs.map(r => r.id === editingId ? { ...r, content: editContent.trim(), point_value: pt } : r))
    setEditingId(null)
    await fetch(`/api/client/${token}/rewards`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: editingId, content: editContent.trim(), point_value: pt }),
    })
  }

  async function move(index: number, dir: -1 | 1) {
    const next = [...rewards]
    const swap = index + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[index], next[swap]] = [next[swap], next[index]]
    const reindexed = next.map((r, i) => ({ ...r, sort_order: i }))
    setRewards(reindexed)
    await fetch(`/api/client/${token}/rewards`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reindexed.map(r => ({ id: r.id, sort_order: r.sort_order }))),
    })
  }

  return (
    <>
      <div className="pt-1 mb-4">
        <h2 className="text-lg font-bold text-white">{lang === 'en' ? 'Rewards List' : 'ご褒美リスト'}</h2>
        <p className="text-xs text-slate-500 mt-0.5">{lang === 'en' ? 'Set rewards at each milestone' : 'ポイントの節目ごとにご褒美を設定しよう'}</p>
      </div>

      <div className="glass-card rounded-2xl px-4 py-3 mb-4 flex items-center gap-3">
        <span className="text-2xl font-bold text-white">{score.toLocaleString()}</span>
        <span className="text-sm text-slate-400">pt {lang === 'en' ? 'reached' : '到達済み'}</span>
      </div>

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="glass-card rounded-xl p-4 shimmer h-14" />)}</div>
      ) : rewards.length === 0 ? (
        <div className="glass-card rounded-xl p-8 text-center text-slate-500 text-sm mb-4">{lang === 'en' ? 'No rewards set yet' : 'まだご褒美がありません'}</div>
      ) : (
        <div className="space-y-2 mb-4">
          {rewards.map((r, i) => {
            const reached = score >= r.point_value
            const isEditing = editingId === r.id
            return (
              <div key={r.id} className={`glass-card rounded-2xl px-3 py-2.5 flex items-center gap-2 ${reached ? 'border-emerald-500/30' : ''}`}>
                {/* 並び替えボタン */}
                <div className="flex flex-col gap-0.5 shrink-0">
                  <button onClick={() => move(i, -1)} disabled={i === 0}
                    className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-[10px] leading-none px-0.5">▲</button>
                  <button onClick={() => move(i, 1)} disabled={i === rewards.length - 1}
                    className="text-slate-600 hover:text-slate-300 disabled:opacity-20 text-[10px] leading-none px-0.5">▼</button>
                </div>

                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 ${reached ? 'bg-emerald-500/20' : 'bg-slate-800'}`}>
                  {reached ? '🎉' : '🏆'}
                </div>

                {isEditing ? (
                  /* 編集モード */
                  <div className="flex-1 min-w-0 flex items-center gap-1.5">
                    <input
                      type="number"
                      value={editPt}
                      onChange={e => setEditPt(e.target.value)}
                      className="input-dark w-20 shrink-0 px-2 py-1 rounded-lg text-xs text-center"
                      autoFocus
                    />
                    <span className="text-slate-600 text-xs shrink-0">pt</span>
                    <input
                      type="text"
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null) }}
                      className="input-dark flex-1 min-w-0 px-2 py-1 rounded-lg text-xs"
                    />
                    <button onClick={saveEdit} className="text-emerald-400 hover:text-emerald-300 text-xs shrink-0 font-bold px-1">✓</button>
                    <button onClick={() => setEditingId(null)} className="text-slate-500 hover:text-slate-300 text-xs shrink-0 px-1">✕</button>
                  </div>
                ) : (
                  /* 表示モード */
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-medium truncate">{r.content}</div>
                    <div className={`text-[11px] font-bold ${reached ? 'text-emerald-400' : 'text-gold-400'}`}>
                      {r.point_value.toLocaleString()} pt {reached ? '✓ ' + (lang === 'en' ? 'Achieved!' : '達成！') : `— ${lang === 'en' ? (r.point_value - score).toLocaleString() + ' pt left' : 'あと ' + (r.point_value - score).toLocaleString() + ' pt'}`}
                    </div>
                  </div>
                )}

                {!isEditing && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => startEdit(r)} className="text-slate-600 hover:text-slate-300 text-xs p-1">✎</button>
                    <button onClick={() => deleteReward(r.id)} className="text-slate-700 hover:text-red-400 text-xs p-1">✕</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="glass-card rounded-2xl p-4 space-y-3">
        <div className="text-[10px] text-gold-400 font-bold uppercase tracking-widest">{lang === 'en' ? 'Add Reward' : 'ご褒美を追加する'}</div>
        <div className="flex gap-2">
          <input type="number" value={newPt} onChange={e => setNewPt(e.target.value)}
            placeholder={lang === 'en' ? 'Points' : 'ポイント'} className="input-dark w-28 shrink-0 px-3 py-2.5 rounded-xl text-sm text-center" />
          <span className="text-slate-500 self-center text-sm shrink-0">pt</span>
          <input type="text" value={newContent} onChange={e => setNewContent(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addReward() }}
            placeholder={lang === 'en' ? 'e.g. Go out for dinner' : '例：焼肉に行く'} className="input-dark flex-1 px-3 py-2.5 rounded-xl text-sm" />
        </div>
        <button onClick={addReward} disabled={adding || !newContent.trim() || !newPt}
          className="btn-gold w-full py-3 rounded-xl text-sm font-semibold disabled:opacity-40">
          {adding ? (lang === 'en' ? 'Adding...' : '追加中...') : (lang === 'en' ? 'Add Reward' : 'ご褒美を追加')}
        </button>
      </div>
    </>
  )
}

// ──────────────────────────────────────────
// SVG Line Chart
// ──────────────────────────────────────────
function LineChart({ points, color = '#00d8ff', period }: { points: ChartPoint[]; color?: string; period?: ChartPeriod }) {
  const [hovered, setHovered] = useState<number | null>(null)

  if (points.length < 2) {
    return <div className="flex items-center justify-center h-full text-slate-600 text-xs">データが少なすぎます</div>
  }

  const rotateLabels = true
  const showValueLabels = true
  const labelStep = 1

  const W = 600; const H = 200
  const bottomPad = 68
  const PAD = { top: showValueLabels ? 36 : 16, right: 16, bottom: bottomPad, left: 48 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const scores = points.map(p => p.score)
  const minScore = Math.min(...scores)
  const maxScore = Math.max(...scores)
  const scoreRange = maxScore - minScore || 1
  const padded = scoreRange * 0.1

  const sx = (i: number) => PAD.left + (i / (points.length - 1)) * chartW
  const sy = (v: number) => PAD.top + chartH - ((v - minScore + padded) / (scoreRange + padded * 2)) * chartH

  // y-axis ticks (4 steps)
  const yTicks = Array.from({ length: 5 }, (_, i) => minScore + (scoreRange / 4) * i)

  // x-axis labels
  const xLabels = points.map((p, i) => ({ i, label: p.label, show: i % labelStep === 0 || i === points.length - 1 }))

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${sx(i)} ${sy(p.score)}`).join(' ')

  // Area fill path
  const areaD = `${pathD} L ${sx(points.length - 1)} ${PAD.top + chartH} L ${sx(0)} ${PAD.top + chartH} Z`

  const hIdx = hovered
  const hp = hIdx !== null ? points[hIdx] : null

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.18" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* grid lines */}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={PAD.left} y1={sy(v)} x2={PAD.left + chartW} y2={sy(v)} stroke="#1e293b" strokeWidth="1" />
          <text x={PAD.left - 6} y={sy(v)} textAnchor="end" dominantBaseline="middle" fill="#475569" fontSize="9">
            {v >= 1000 ? `${(v / 1000).toFixed(1)}k` : Math.round(v)}
          </text>
        </g>
      ))}

      {/* area */}
      <path d={areaD} fill="url(#chartFill)" />

      {/* line */}
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

      {/* x labels */}
      {xLabels.filter(l => l.show).map(({ i, label }) =>
        rotateLabels ? (
          <text
            key={i}
            transform={`translate(${sx(i)},${PAD.top + chartH + 8}) rotate(-70)`}
            textAnchor="end"
            fill="#475569"
            fontSize="8"
          >{label}</text>
        ) : (
          <text key={i} x={sx(i)} y={PAD.top + chartH + 14} textAnchor="middle" fill="#475569" fontSize="9">{label}</text>
        )
      )}

      {/* value labels above each point (weekly) */}
      {showValueLabels && points.map((p, i) => (
        <text
          key={`v${i}`}
          transform={`translate(${sx(i)},${sy(p.score) - 5}) rotate(-70)`}
          textAnchor="start"
          fill={color}
          fontSize="8"
          opacity="0.9"
        >{p.score.toLocaleString()}</text>
      ))}

      {/* hover zones */}
      {points.map((_, i) => (
        <rect key={i}
          x={sx(i) - (chartW / points.length) / 2} y={PAD.top}
          width={chartW / points.length} height={chartH}
          fill="transparent"
          onMouseEnter={() => setHovered(i)}
          onMouseLeave={() => setHovered(null)}
        />
      ))}

      {/* hover dot + tooltip */}
      {hIdx !== null && hp && (
        <>
          <line x1={sx(hIdx)} y1={PAD.top} x2={sx(hIdx)} y2={PAD.top + chartH} stroke={color} strokeWidth="1" strokeDasharray="3,3" opacity="0.5" />
          <circle cx={sx(hIdx)} cy={sy(hp.score)} r="4" fill={color} />
          <circle cx={sx(hIdx)} cy={sy(hp.score)} r="7" fill={color} opacity="0.2" />
          {/* tooltip box */}
          <rect
            x={Math.min(sx(hIdx) - 36, W - 80)} y={sy(hp.score) - 32}
            width="72" height="24" rx="6"
            fill="#0d1117" stroke={color} strokeWidth="1" opacity="0.95"
          />
          <text x={Math.min(sx(hIdx), W - 44)} y={sy(hp.score) - 16} textAnchor="middle" fill={color} fontSize="10" fontWeight="bold">
            {hp.score.toLocaleString()}pt
          </text>
        </>
      )}
    </svg>
  )
}

// ──────────────────────────────────────────
// Main page
// ──────────────────────────────────────────
export default function ClientPortal() {
  const params = useParams()
  const router = useRouter()
  const token = params.token as string

  const [data, setData] = useState<ClientData | null>(null)
  const [tab, setTab] = useState<Tab>('home')
  const [mapRefreshKey, setMapRefreshKey] = useState(0)
  const [loading, setLoading] = useState(true)
  const [weekLoading, setWeekLoading] = useState(false)
  const [msg, setMsg] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [completions, setCompletions] = useState<Record<string, boolean>>({})
  const [score, setScore] = useState(0)
  const [levelUpMsg, setLevelUpMsg] = useState<string | null>(null)
  const prevLevelRef = useRef<number>(0)

  useEffect(() => {
    const newLevel = getLevelFromScore(score)
    if (prevLevelRef.current > 0 && newLevel > prevLevelRef.current) {
      setLevelUpMsg(`🎉 Lv.${newLevel} にアップ！`)
      const t = setTimeout(() => setLevelUpMsg(null), 3500)
      return () => clearTimeout(t)
    }
    prevLevelRef.current = newLevel
  }, [score])

  const [toggling, setToggling] = useState<string | null>(null)
  const [weekStartDay, setWeekStartDay] = useState<WeekStart>(1)
  const [weekOffset, setWeekOffset] = useState(0)

  const slotsCache = useRef<Record<number, Record<string, TimeSlot[]>>>({})
  const completionsCache = useRef<Record<number, Record<string, boolean>>>({})
  const weekDataCache = useRef<Record<number, { week_start: string; daily_reports: DailyReport[] }>>({})

  const [slots, setSlots] = useState<Record<string, TimeSlot[]>>({})
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set())

  // クイック追加フォーム (日付ごと)
  const [quickAdd, setQuickAdd] = useState<Record<string, { time: string; search: string; task_id: string; task_name: string; point_value: number; task_memo?: string }>>({})
  const [showSearch, setShowSearch] = useState<string | null>(null)

  // インラインタスク新規作成
  const [showNewTaskFor, setShowNewTaskFor] = useState<string | null>(null) // date
  const [inlineTask, setInlineTask] = useState({ content: '', point_value: 10 })
  const [savingInlineTask, setSavingInlineTask] = useState(false)

  // スロット編集
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null)
  const [editingSlotDraft, setEditingSlotDraft] = useState<{ time: string; task_id: string; task_name: string; point_value: number }>({ time: '', task_id: '', task_name: '', point_value: 0 })
  const [editSlotSearch, setEditSlotSearch] = useState('')
  const [showEditSlotSearch, setShowEditSlotSearch] = useState(false)

  // 全日付の目標テキスト（編集可能）
  const [weekGoals, setWeekGoals] = useState<Record<string, string>>({})
  const goalTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [goalChecked, setGoalChecked] = useState<Record<string, boolean>>({})
  // 今週の目標インライン入力
  const [weeklyGoalText, setWeeklyGoalText] = useState('')
  const weeklyGoalTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 今週のメモ（週ごとに保存）
  const [weeklyMemoText, setWeeklyMemoText] = useState('')
  const weeklyMemoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [showLevelBar, setShowLevelBar] = useState(true)

  // 今月のゴール
  const [monthlyGoalText, setMonthlyGoalText] = useState('')
  const monthlyGoalTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const monthlyGoalRef = useRef<HTMLDivElement | null>(null)
  const monthlyGoalExternal = useRef(false)  // 外部からのデータ更新フラグ
  const [monthGoalColorBar, setMonthGoalColorBar] = useState(false)

  // 外部データ更新時だけdivのinnerHTMLを書き換える（ユーザー入力中は触らない）
  useEffect(() => {
    if (monthlyGoalExternal.current && monthlyGoalRef.current) {
      monthlyGoalRef.current.innerHTML = monthlyGoalText
      monthlyGoalExternal.current = false
    }
  }, [monthlyGoalText])

  // 週が変わったらweeklyMemo・weeklyGoalを更新
  useEffect(() => {
    if (!data) return
    const ws = (weekDataCache.current[weekOffset]?.week_start) ?? data.week_start
    const wm = (data.client_goals as any[]).find(g => g.goal_type === 'weekly_memo' && g.period_label === ws)
    setWeeklyMemoText(wm?.content ?? '')
    const wg = (data.client_goals as any[]).find(g => g.goal_type === 'weekly' && g.period_label === ws)
      ?? (weekOffset === 0 ? (data.client_goals as any[]).find(g => g.goal_type === 'weekly' && !g.period_label) : null)
    setWeeklyGoalText(wg?.content ?? '')
  }, [weekOffset, data])


  // ドラッグ
  const [dragSlotId, setDragSlotId] = useState<string | null>(null)
  const [slotDropTarget, setSlotDropTarget] = useState<{ id: string; pos: 'before' | 'after' } | null>(null)
  const [dragTaskId, setDragTaskId] = useState<string | null>(null)
  const [taskDropTarget, setTaskDropTarget] = useState<{ id: string; pos: 'before' | 'after' } | null>(null)
  const [taskOrder, setTaskOrder] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(`task_order_${token}`) ?? '[]') } catch { return [] }
  })

  // タスクライブラリ
  const [newTask, setNewTask] = useState({ content: '', point_value: 10 })
  const [addingTask, setAddingTask] = useState(false)
  const [showAddForm, setShowAddForm] = useState(false)
  const [libSearch, setLibSearch] = useState('')
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editingTaskDraft, setEditingTaskDraft] = useState({ content: '', point_value: 10 })
  const [savingTaskEdit, setSavingTaskEdit] = useState(false)
  const [taskMemos, setTaskMemos] = useState<Record<string, string>>({})
  const [slotMemos, setSlotMemos] = useState<Record<string, string>>({})

  // グラフ
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('daily')
  const [chartData, setChartData] = useState<{ daily: ChartPoint[]; weekly: ChartPoint[]; monthly: ChartPoint[] } | null>(null)
  const [chartLoading, setChartLoading] = useState(false)
  const [homeGoals, setHomeGoals] = useState<IdealMap | null>(null)
  const [homeGoalDrafts, setHomeGoalDrafts] = useState<Record<string, string>>({})
  const homeGoalTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  useEffect(() => {
    const saved = localStorage.getItem('zyvox_theme') as 'dark' | 'light' | null
    if (saved) setTheme(saved)
  }, [])
  useEffect(() => {
    document.body.classList.toggle('theme-light', theme === 'light')
    localStorage.setItem('zyvox_theme', theme)
  }, [theme])

  const [colorTheme, setColorTheme] = useState<'blue' | 'yellow' | 'red'>('blue')
  useEffect(() => {
    const saved = localStorage.getItem('zyvox_color') as 'blue' | 'yellow' | 'red' | null
    if (saved) setColorTheme(saved)
  }, [])
  function setColor(c: 'blue' | 'yellow' | 'red') {
    setColorTheme(c)
    localStorage.setItem('zyvox_color', c)
  }
  const accentHex = colorTheme === 'yellow' ? '#facc15' : colorTheme === 'red' ? '#ff4646' : '#00d8ff'

  const [lang, setLang] = useState<'en' | 'ja'>('en')
  useEffect(() => {
    const saved = localStorage.getItem('zyvox_lang') as 'en' | 'ja' | null
    if (saved) setLang(saved)
  }, [])
  function toggleLang() {
    setLang(l => {
      const next = l === 'en' ? 'ja' : 'en'
      localStorage.setItem('zyvox_lang', next)
      return next
    })
  }
  const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const T = {
    daily: lang === 'en' ? 'Daily' : '日次',
    weekly: lang === 'en' ? 'Weekly' : '週次',
    monthly: lang === 'en' ? 'Monthly' : '月次',
    vsPrev: (p: ChartPeriod) => lang === 'en'
      ? (p === 'daily' ? 'vs Yesterday' : p === 'weekly' ? 'vs Last Week' : 'vs Last Month')
      : (p === 'daily' ? '前日比' : p === 'weekly' ? '前週比' : '前月比'),
    monthGoalLabel: (m: string) => {
      const mn = parseInt(m.split('-')[1] ?? '1')
      return lang === 'en' ? `GOALS · ${MONTH_ABBR[mn - 1]}` : `今月のゴール`
    },
    goals: 'GOALS',
    rewards: lang === 'en' ? 'Rewards' : '報酬設定',
    rewardAdd: lang === 'en' ? '+ Add Reward' : '+ 報酬を追加',
    rewardEmpty: lang === 'en' ? 'No rewards set yet' : 'まだ報酬が設定されていません',
    plan: lang === 'en' ? 'Plan' : '実行計画',
    visionMap: lang === 'en' ? 'Vision Map' : '理想実現マップ',
    report: lang === 'en' ? 'Report' : '日報',
    reportHistory: lang === 'en' ? 'Report History' : '日報履歴',
    reportSubmitted: lang === 'en' ? "Today's Report ✓ Submitted" : '本日の日報 ✓ 提出済み',
    reportToday: lang === 'en' ? "Today's Report" : '本日の日報',
    noRecentReports: lang === 'en' ? 'No reports in the last 30 days' : '直近30日の日報がありません',
    achieved: lang === 'en' ? '✓ Achieved' : '✓ 達成',
    notAchieved: lang === 'en' ? '✗ Not Achieved' : '✗ 未達成',
    addRewardLabel: lang === 'en' ? 'Add New Reward' : '新しい報酬を追加',
    weekLabel: (offset: number) => lang === 'en'
      ? (offset === 0 ? 'This Week' : offset === 1 ? 'Next Week' : offset === -1 ? 'Last Week' : offset > 0 ? `+${offset}W` : `${Math.abs(offset)}W ago`)
      : (offset === 0 ? '今週' : offset === 1 ? '来週' : offset === -1 ? '先週' : offset > 0 ? `${offset}週後` : `${Math.abs(offset)}週前`),
    thisWeek: lang === 'en' ? 'This Week' : '今週',
    weekStart: (s: number) => lang === 'en' ? (s === 1 ? 'Mon' : 'Sun') : (s === 1 ? '月始' : '日始'),
    monthGoalPlaceholder: lang === 'en' ? 'Monthly goal...' : '今月達成したいこと...',
    weekGoalPlaceholder: lang === 'en' ? 'Weekly goal...' : '今週の目標...',
    todayGoalPlaceholder: lang === 'en' ? "Today's goal..." : '今日の目標...',
    memo: lang === 'en' ? 'Memo' : 'メモ',
    memoPlaceholder: lang === 'en' ? 'Notes...' : 'メモ...',
    searchTask: lang === 'en' ? 'Search tasks...' : 'タスクを検索...',
    noTaskYet: lang === 'en' ? 'Add a task first' : 'まずタスクを登録',
    cancel: lang === 'en' ? 'Cancel' : 'キャンセル',
    save: lang === 'en' ? 'Save' : '保存',
    saving: lang === 'en' ? 'Saving...' : '保存中...',
    addNewTask: lang === 'en' ? 'Add New Task' : '新しいタスクを追加',
    createAndSelect: lang === 'en' ? 'Create & Select' : '作成して選択',
    dateLabel: lang === 'en' ? 'Date' : '日付',
    todayGoalLabel: lang === 'en' ? "Today's Goal" : '今日の目標',
    resultLabel: lang === 'en' ? 'Result' : '実行結果',
    causeLabel: lang === 'en' ? 'Cause' : '原因分析',
    tomorrowGoalLabel: lang === 'en' ? "Tomorrow's Goal" : '明日の目標',
    improvementLabel: lang === 'en' ? 'Improvement' : '改善・学び',
    reportPrompt: lang === 'en' ? "Enter today's report →" : '今日の報告を入力する →',
    todayGoalFormPlaceholder: lang === 'en' ? 'What you want to achieve today...' : '今日達成したいこと...',
    resultPlaceholder: lang === 'en' ? 'What you did, results...' : '今日やったこと、結果...',
    causePlaceholder: lang === 'en' ? 'Why you missed it...' : 'なぜ達成できなかったか...',
    tomorrowPlaceholder: lang === 'en' ? 'What you want to achieve tomorrow...' : '明日達成したいこと...',
    improvementPlaceholder: lang === 'en' ? 'Improvements, learnings...' : '改善点、気づき、次に活かすこと...',
  }

  const memoSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const today = localDate(new Date())

  const [reportForm, setReportForm] = useState({
    report_date: today, today_goal: '', result: '',
    achieved: null as boolean | null,
    reason: '', tomorrow_goal: '', memo: '',
  })

  useEffect(() => {
    const saved = localStorage.getItem('weekStartDay')
    if (saved === '0') setWeekStartDay(0)
  }, [])

  const loadWeek = useCallback(async (offset: number, initial = false) => {
    if (!initial) setWeekLoading(true)
    const anchor = getAnchorDate(weekStartDay, offset)
    const res = await fetch(`/api/client/${token}?weekStart=${weekStartDay}&weekDate=${anchor}`)
    if (!res.ok) { setData(null as unknown as ClientData); setWeekLoading(false); setLoading(false); return }
    const d: ClientData = await res.json()

    if (initial) {
      setData(d)
      setScore(d.total_score)
      const memos: Record<string, string> = {}
      d.client_goals.filter((g: ClientGoal) => g.goal_type === 'tasks').forEach((g: any) => { memos[g.id] = g.memo ?? '' })
      setTaskMemos(memos)
    }

    const map: Record<string, boolean> = {}
    d.weekly_completions.forEach(c => { map[ck(c.slot_id ?? c.task_id, c.completion_date)] = c.completed })
    completionsCache.current[offset] = map

    const slotMap: Record<string, TimeSlot[]> = {}
    d.daily_reports.forEach(r => {
      const parsed = parseMemo(r.slots ?? r.memo)
      if (parsed.length > 0) slotMap[r.report_date] = parsed
    })
    slotsCache.current[offset] = slotMap
    weekDataCache.current[offset] = { week_start: d.week_start, daily_reports: d.daily_reports }

    const goalsMap: Record<string, string> = {}
    const checkedMap: Record<string, boolean> = {}
    d.daily_reports.forEach(r => {
      if (r.today_goal) goalsMap[r.report_date] = r.today_goal
      if ((r as any).goal_achieved) checkedMap[r.report_date] = true
    })

    setSlots(slotMap)
    setCompletions(map)
    setWeekGoals(goalsMap)
    setGoalChecked(prev => ({ ...prev, ...checkedMap }))

    // 週のゴール・メモは毎回（週切替時も）更新
    const ws = d.week_start
    const wg = (d.client_goals as any[]).find(g => g.goal_type === 'weekly' && g.period_label === ws)
      ?? (offset === 0 ? (d.client_goals as any[]).find(g => g.goal_type === 'weekly' && !g.period_label) : null)
    setWeeklyGoalText(wg?.content ?? '')
    const wm = (d.client_goals as any[]).find(g => g.goal_type === 'weekly_memo' && g.period_label === ws)
    setWeeklyMemoText(wm?.content ?? '')

    if (initial) {
      setExpandedDates(new Set([today]))
      const tr = d.daily_reports.find(r => r.report_date === today)
      if (tr) {
        setReportForm({ report_date: today, today_goal: tr.today_goal ?? '', result: tr.result ?? '', achieved: tr.achieved ?? null, reason: tr.reason ?? '', tomorrow_goal: tr.tomorrow_goal ?? '', memo: '' })
      }
      const cm = today.slice(0, 7)
      const mg = d.client_goals.find((g: ClientGoal) => g.goal_type === 'monthly' && g.period_label === cm)
      monthlyGoalExternal.current = true
      setMonthlyGoalText(mg?.content ?? '')
    }
    setWeekLoading(false)
    setLoading(false)
  }, [token, weekStartDay, today, router])

  useEffect(() => { loadWeek(0, true) }, [loadWeek])

  // グラフデータ取得 (ホーム表示時)
  useEffect(() => {
    if (tab !== 'home' || chartData) return
    setChartLoading(true)
    fetch(`/api/client/${token}/chart`)
      .then(r => r.json())
      .then(d => {
        setChartData({
          daily: d.daily.map((p: { date: string; score: number }) => ({ label: p.date.slice(5), score: p.score })),
          weekly: d.weekly.map((p: { week: string; score: number }) => ({ label: p.week.slice(5), score: p.score })),
          monthly: d.monthly.map((p: { month: string; score: number }) => { const mn = parseInt(p.month.slice(5)) - 1; return { label: lang === 'ja' ? `${mn + 1}月` : (MONTH_ABBR[mn] ?? p.month), score: p.score } }),
        })
      })
      .finally(() => setChartLoading(false))
  }, [tab, token, chartData])

  // 理想マップのゴール取得 (ホームタブ表示のたびに再取得)
  useEffect(() => {
    if (tab !== 'home') return
    fetch(`/api/client/${token}/ideal-map`)
      .then(r => r.json())
      .then((d: IdealMap[]) => {
        const map = Array.isArray(d) && d.length > 0 ? d[0] : null as unknown as IdealMap
        setHomeGoals(map)
        if (map) setHomeGoalDrafts({ goal_3y: map.goal_3y ?? '', goal_1y: map.goal_1y ?? '', goal_3m: map.goal_3m ?? '' })
      })
      .catch(() => {})
  }, [tab, token])

  async function switchWeek(offset: number) {
    setWeekOffset(offset); setExpandedDates(new Set()); setShowSearch(null)
    if (slotsCache.current[offset]) {
      setSlots(slotsCache.current[offset])
      setCompletions(completionsCache.current[offset] ?? {})
      const cached = weekDataCache.current[offset]
      if (cached) {
        const goalsMap: Record<string, string> = {}
        cached.daily_reports.forEach(r => { if (r.today_goal) goalsMap[r.report_date] = r.today_goal })
        setWeekGoals(goalsMap)
      }
    } else { await loadWeek(offset) }
  }

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(''), 2500) }

  function saveSlots(date: string, updated: TimeSlot[]) {
    if (memoSaveTimers.current[date]) clearTimeout(memoSaveTimers.current[date])
    memoSaveTimers.current[date] = setTimeout(async () => {
      await fetch(`/api/client/${token}/memo`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, memo: JSON.stringify(updated) }),
      })
    }, 500)
  }

  function reorderSlotArray(date: string, draggedId: string, targetId: string, before: boolean) {
    const arr = [...(slots[date] ?? [])]
    const dragIdx = arr.findIndex(s => s.id === draggedId)
    if (dragIdx === -1) return
    const [dragged] = arr.splice(dragIdx, 1)
    const targetIdx = arr.findIndex(s => s.id === targetId)
    if (targetIdx === -1) return
    arr.splice(before ? targetIdx : targetIdx + 1, 0, dragged)
    setSlots(s => ({ ...s, [date]: arr }))
    slotsCache.current[weekOffset] = { ...(slotsCache.current[weekOffset] ?? {}), [date]: arr }
    saveSlots(date, arr)
  }

  function reorderTasks(draggedId: string, targetId: string, before: boolean) {
    const base = getOrderedTasks()
    const arr = [...base]
    const dragIdx = arr.findIndex(t => t.id === draggedId)
    if (dragIdx === -1) return
    const [dragged] = arr.splice(dragIdx, 1)
    const targetIdx = arr.findIndex(t => t.id === targetId)
    if (targetIdx === -1) return
    arr.splice(before ? targetIdx : targetIdx + 1, 0, dragged)
    const newOrder = arr.map(t => t.id)
    setTaskOrder(newOrder)
    localStorage.setItem(`task_order_${token}`, JSON.stringify(newOrder))
  }

  function getOrderedTasks() {
    const ordered = taskOrder.map(id => tasks.find(t => t.id === id)).filter(Boolean) as typeof tasks
    const rest = tasks.filter(t => !taskOrder.includes(t.id))
    return [...ordered, ...rest]
  }

  function commitQuickAdd(date: string) {
    const q = quickAdd[date]
    if (!q?.task_id || !q?.time) return
    const slot: TimeSlot = { id: genId(), time: q.time, task_id: q.task_id, task_name: q.task_name, point_value: q.point_value, task_memo: q.task_memo }
    const updated = [...(slots[date] ?? []), slot]
    setSlots(s => ({ ...s, [date]: updated }))
    slotsCache.current[weekOffset] = { ...(slotsCache.current[weekOffset] ?? {}), [date]: updated }
    saveSlots(date, updated)
    setQuickAdd(q2 => ({ ...q2, [date]: { time: '', search: '', task_id: '', task_name: '', point_value: 0 } }))
    setShowSearch(null)
  }

  async function toggleGoalCheck(date: string) {
    const newVal = !goalChecked[date]
    setGoalChecked(prev => ({ ...prev, [date]: newVal }))
    const res = await fetch(`/api/client/${token}/goal-check`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, achieved: newVal }),
    })
    if (res.ok) {
      const data = await res.json()
      setScore(data.total_score)
      if (newVal) flash('+10pt 目標達成！ 🎯')
    } else {
      setGoalChecked(prev => ({ ...prev, [date]: !newVal }))
    }
  }

  function startEditSlot(slot: TimeSlot) {
    setEditingSlotId(slot.id)
    setEditingSlotDraft({ time: slot.time, task_id: slot.task_id, task_name: slot.task_name, point_value: slot.point_value })
    setEditSlotSearch('')
    setShowEditSlotSearch(false)
  }

  async function commitEditSlot(date: string) {
    if (!editingSlotId) return
    const updated = (slots[date] ?? []).map(s =>
      s.id === editingSlotId ? { ...s, ...editingSlotDraft } : s
    )
    setSlots(s => ({ ...s, [date]: updated }))
    slotsCache.current[weekOffset] = { ...(slotsCache.current[weekOffset] ?? {}), [date]: updated }
    saveSlots(date, updated)
    // task_id が紐づくclient_goalsも更新する
    if (editingSlotDraft.task_id) {
      const res = await fetch(`/api/client/${token}/manage-tasks`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: editingSlotDraft.task_id, content: editingSlotDraft.task_name, point_value: editingSlotDraft.point_value }),
      })
      if (res.ok) {
        const updatedTask = await res.json()
        setData(prev => prev ? {
          ...prev,
          client_goals: prev.client_goals.map(g => g.id === editingSlotDraft.task_id ? { ...g, ...updatedTask } : g)
        } : prev)
      }
    }
    setEditingSlotId(null)
    setShowEditSlotSearch(false)
  }

  function removeSlot(date: string, slotId: string) {
    const updated = (slots[date] ?? []).filter(s => s.id !== slotId)
    setSlots(s => ({ ...s, [date]: updated }))
    slotsCache.current[weekOffset] = { ...(slotsCache.current[weekOffset] ?? {}), [date]: updated }
    saveSlots(date, updated)
  }

  async function toggleTask(taskId: string, slotId: string, date: string, pointValue: number) {
    const key = ck(slotId, date)
    if (toggling === key) return
    const newVal = !completions[key]
    setCompletions(c => ({ ...c, [key]: newVal }))
    setScore(s => Math.max(0, newVal ? s + pointValue : s - pointValue))
    setToggling(key)
    const res = await fetch(`/api/client/${token}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, slot_id: slotId, completion_date: date, completed: newVal }),
    })
    setToggling(null)
    if (res.ok) { const d = await res.json(); setScore(d.total_score) }
    else {
      setCompletions(c => ({ ...c, [key]: !newVal }))
      setScore(s => Math.max(0, newVal ? s - pointValue : s + pointValue))
    }
  }

  async function clearAllTasks(date: string) {
    const daySlots = slots[date] ?? []
    const doneTasks = daySlots.filter(s => completions[ck(s.id, date)])
    if (doneTasks.length === 0) return
    for (const slot of doneTasks) {
      setCompletions(c => ({ ...c, [ck(slot.id, date)]: false }))
      setScore(s => Math.max(0, s - slot.point_value))
      await fetch(`/api/client/${token}/tasks`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task_id: slot.task_id, slot_id: slot.id, completion_date: date, completed: false }),
      })
    }
  }

  function saveGoal(date: string, value: string) {
    setWeekGoals(g => ({ ...g, [date]: value }))
    if (goalTimers.current[date]) clearTimeout(goalTimers.current[date])
    goalTimers.current[date] = setTimeout(() => {
      fetch(`/api/client/${token}/report`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_date: date, today_goal: value }),
      })
    }, 800)
  }

  // インラインでタスクを新規作成して、そのままクイック追加に乗せる
  async function saveInlineTask(date: string) {
    if (!inlineTask.content.trim()) return
    setSavingInlineTask(true)
    const res = await fetch(`/api/client/${token}/manage-tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(inlineTask),
    })
    if (res.ok) {
      const created = await res.json()
      const taskId = created?.id ?? created?.[0]?.id ?? ''
      // data.client_goalsに新タスクを即追加
      setData(prev => prev ? { ...prev, client_goals: [...prev.client_goals, created] } : prev)
      // スロットも再取得
      await loadWeek(weekOffset, false)
      // 作成したタスクをそのままクイック追加に乗せる
      const q = quickAdd[date] ?? { time: '', search: '', task_id: '', task_name: '', point_value: 0 }
      setQuickAdd(qa => ({ ...qa, [date]: { ...q, task_id: taskId, task_name: inlineTask.content, point_value: inlineTask.point_value, search: '' } }))
      setInlineTask({ content: '', point_value: 10 })
      setShowNewTaskFor(null)
    }
    setSavingInlineTask(false)
  }

  async function addTask(e?: React.FormEvent | React.MouseEvent) {
    e?.preventDefault()
    if (!newTask.content.trim()) return
    setAddingTask(true)
    const res = await fetch(`/api/client/${token}/manage-tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTask),
    })
    if (res.ok) { setNewTask({ content: '', point_value: 10 }); flash('タスクを追加しました ✓'); loadWeek(weekOffset, true) }
    else { flash('エラーが発生しました') }
    setAddingTask(false)
  }

  async function deleteTask(taskId: string) {
    if (!confirm('このタスクを削除しますか？')) return
    await fetch(`/api/client/${token}/manage-tasks`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ task_id: taskId }) })
    setData(prev => prev ? { ...prev, client_goals: prev.client_goals.filter(g => g.id !== taskId) } : prev)
    flash('タスクを削除しました')
  }

  function startEditTask(t: ClientGoal) {
    setEditingTaskId(t.id)
    setEditingTaskDraft({ content: t.content, point_value: t.point_value })
  }

  async function commitEditTask() {
    if (!editingTaskId) return
    setSavingTaskEdit(true)
    const taskId = editingTaskId
    const newContent = editingTaskDraft.content
    const newPt = editingTaskDraft.point_value
    const res = await fetch(`/api/client/${token}/manage-tasks`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId, content: newContent, point_value: newPt }),
    })
    if (res.ok) {
      const updated = await res.json()
      setData(prev => prev ? {
        ...prev,
        client_goals: prev.client_goals.map(g => g.id === taskId ? { ...g, ...updated } : g)
      } : prev)
      // state updater の外でスロット更新を計算してからsetSlots + saveSlots
      const slotUpdates: { date: string; newSlots: TimeSlot[] }[] = []
      Object.keys(slots).forEach(date => {
        const daySlots = slots[date]
        if (!daySlots.some(s => s.task_id === taskId)) return
        const newSlots = daySlots.map(s =>
          s.task_id === taskId ? { ...s, task_name: newContent, point_value: newPt } : s
        )
        slotUpdates.push({ date, newSlots })
      })
      if (slotUpdates.length > 0) {
        const patch: Record<string, TimeSlot[]> = {}
        slotUpdates.forEach(({ date, newSlots }) => { patch[date] = newSlots })
        setSlots(prev => ({ ...prev, ...patch }))
        slotUpdates.forEach(({ date, newSlots }) => saveSlots(date, newSlots))
      }
      Object.values(slotsCache.current).forEach(weekSlots => {
        if (!weekSlots) return
        Object.keys(weekSlots).forEach(date => {
          weekSlots[date] = weekSlots[date].map(s =>
            s.task_id === taskId ? { ...s, task_name: newContent, point_value: newPt } : s
          )
        })
      })
    }
    setSavingTaskEdit(false)
    setEditingTaskId(null)
    flash('タスクを更新しました ✓')
  }

  function updateSlotMemo(date: string, slotId: string, memo: string) {
    const updated = (slots[date] ?? []).map(s => s.id === slotId ? { ...s, task_memo: memo } : s)
    setSlots(s => ({ ...s, [date]: updated }))
    slotsCache.current[weekOffset] = { ...(slotsCache.current[weekOffset] ?? {}), [date]: updated }
    saveSlots(date, updated)
  }

  async function submitReport(e: React.FormEvent) {
    e.preventDefault(); setSubmitting(true)
    const res = await fetch(`/api/client/${token}/report`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reportForm),
    })
    if (res.ok) { flash('日報を提出しました ✓'); loadWeek(0, true); setTab('home') }
    else { flash('エラーが発生しました') }
    setSubmitting(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 theme-bg">
        <div className="text-2xl font-bold tracking-widest gold-gradient">ZYVOX</div>
        <div className="text-slate-500 text-sm">読み込み中...</div>
      </div>
    )
  }
  if (!data) return (
    <div className="min-h-screen flex items-center justify-center theme-bg">
      <div className="text-center space-y-3">
        <div className="text-4xl">🔍</div>
        <div className="text-white font-bold">ページが見つかりません</div>
        <div className="text-slate-500 text-sm">URLを確認してください</div>
      </div>
    </div>
  )

  const currentMonth = today.slice(0, 7) // 'YYYY-MM'
  const monthlyGoal = data.client_goals.find(g => g.goal_type === 'monthly' && g.period_label !== 'reward' && g.period_label === currentMonth)
  const weeklyGoal = data.client_goals.find(g => g.goal_type === 'weekly')
  const tasks = data.client_goals.filter(g => g.goal_type === 'tasks')
  const filteredLib = tasks.filter(t => libSearch === '' || t.content.toLowerCase().includes(libSearch.toLowerCase()))

  const currentWeekData = weekDataCache.current[weekOffset]
  const weekStart = currentWeekData?.week_start ?? data.week_start
  const weekDates = getWeekDates(weekStart)

  const dayLabels = weekStartDay === 1
    ? (lang === 'en' ? DAY_LABELS_MON_EN : DAY_LABELS_MON_JA)
    : (lang === 'en' ? DAY_LABELS_SUN_EN : DAY_LABELS_SUN_JA)

  const todayReport = (weekDataCache.current[0]?.daily_reports ?? data.daily_reports).find(r => r.report_date === today)
  const latestFb = data.daily_reports.find(r => r.coach_fb || r.coach_ff)
  const level = getLevelFromScore(score)
  const progress = getLevelProgress(score)
  const nextThreshold = getNextLevelThreshold(score)
  const currentThreshold = getCurrentLevelThreshold(score)

  const weekLabel = T.weekLabel(weekOffset)
  const d0 = new Date(weekStart); const d6 = new Date(weekStart); d6.setDate(d6.getDate() + 6)
  const weekRangeLabel = `${d0.getMonth()+1}/${d0.getDate()} – ${d6.getMonth()+1}/${d6.getDate()}`

  const chartPoints = chartData
    ? (chartPeriod === 'daily' ? chartData.daily : chartPeriod === 'weekly' ? chartData.weekly : chartData.monthly)
    : []

  const tabs: { id: Tab; icon: string; label: string }[] = [
    { id: 'home', icon: '⌂', label: 'Home' },
    { id: 'report', icon: '✎', label: 'Report' },
    { id: 'plan', icon: '▦', label: 'Plan' },
    { id: 'map', icon: '◈', label: 'Map' },
    { id: 'reward', icon: '🏆', label: 'Reward' },
    { id: 'history', icon: '◷', label: 'History' },
  ]

  return (
    <div data-theme={theme} data-color={colorTheme} className="min-h-screen flex flex-col theme-bg" onClick={() => { setShowSearch(null); setShowNewTaskFor(null) }}>
      {levelUpMsg && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[200] animate-bounce">
          <div className="bg-gradient-to-r from-yellow-400 to-orange-400 text-black font-bold px-6 py-3 rounded-full shadow-2xl text-lg tracking-wide">
            {levelUpMsg}
          </div>
        </div>
      )}
      <header className="sticky top-0 z-50 border-b theme-border-nav theme-bg-header backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <span className="text-lg font-bold tracking-widest gold-gradient">ZYVOX</span>
          <div className="flex items-center gap-2">
            {/* カラーテーマピッカー */}
            <div className="flex items-center gap-1">
              {([
                { id: 'blue', hex: '#00d8ff' },
                { id: 'yellow', hex: '#facc15' },
                { id: 'red', hex: '#ff4646' },
              ] as const).map(c => (
                <button
                  key={c.id}
                  onClick={e => { e.stopPropagation(); setColor(c.id) }}
                  className="w-4 h-4 rounded-full transition-all"
                  style={{
                    background: c.hex,
                    boxShadow: colorTheme === c.id ? `0 0 0 2px #111, 0 0 0 3.5px ${c.hex}` : 'none',
                    opacity: colorTheme === c.id ? 1 : 0.45,
                  }}
                  title={c.id}
                />
              ))}
            </div>
            <button
              onClick={toggleLang}
              className="h-7 px-2 rounded-full border border-slate-700 flex items-center justify-center text-slate-400 hover:border-gold-500/50 hover:text-gold-400 transition-colors text-[11px] font-bold tracking-wide"
            >
              {lang === 'en' ? 'EN' : 'JA'}
            </button>
            <button
              onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
              className="w-8 h-8 rounded-full border border-slate-700 flex items-center justify-center text-slate-400 hover:border-gold-500/50 hover:text-gold-400 transition-colors text-sm"
              title={theme === 'dark' ? 'ライトモード' : 'ダークモード'}
            >
              {theme === 'dark' ? '☀' : '🌙'}
            </button>
            <div className="text-right">
              <div className="text-sm font-semibold text-white leading-tight">{data.name}</div>
              <div className="flex items-center gap-2 justify-end mt-0.5">
                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded border border-gold-500/40 text-gold-400">Lv.{level}</span>
                <span className="text-[11px] text-slate-400">{score.toLocaleString()} pt</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {msg && (
        <div className="max-w-3xl mx-auto w-full px-4 mt-2">
          <div className="rounded-xl px-4 py-2 text-sm text-emerald-400 text-center bg-emerald-500/10 border border-emerald-500/20">{msg}</div>
        </div>
      )}

      <main className="flex-1 max-w-3xl mx-auto w-full px-3 py-3 pb-28 space-y-3">

        {/* ======= HOME ======= */}
        {tab === 'home' && (
          <>
            {/* グラフ */}
            <div className="glass-card rounded-2xl p-4">
              {chartLoading ? (
                <div className="h-36 flex items-center justify-center text-slate-600 text-xs">読み込み中...</div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-white">{score.toLocaleString()}</span>
                      <span className="text-sm text-slate-400">pt</span>
                      <span className="text-xs font-bold text-gold-400 ml-1">Lv.{level}</span>
                    </div>
                    <div className="flex gap-1">
                      {(['daily', 'weekly', 'monthly'] as ChartPeriod[]).map(p => (
                        <button key={p} onClick={() => setChartPeriod(p)}
                          className={`px-2 py-1 rounded-lg text-[10px] border transition-colors font-medium ${chartPeriod === p ? 'bg-gold-500/20 border-gold-500/50 text-gold-400' : 'border-slate-700 text-slate-500'}`}>
                          {p === 'daily' ? T.daily : p === 'weekly' ? T.weekly : T.monthly}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="h-52">
                    <LineChart points={chartPoints} period={chartPeriod} color={accentHex} />
                  </div>
                </>
              )}
            </div>

            <div className="glass-card rounded-xl px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-gold-400">Lv.{level}</span>
                <div className="flex-1 min-w-0">
                  {showLevelBar && (
                    <>
                      <div className="level-bar my-0.5"><div className="level-bar-fill" style={{ width: `${progress}%` }} /></div>
                      <div className="flex justify-between">
                        <span className="text-[9px] text-slate-600">{currentThreshold.toLocaleString()}</span>
                        <span className="text-[9px] text-slate-500">{lang === 'en' ? `${(nextThreshold - score).toLocaleString()} pt to next` : `次まで ${(nextThreshold - score).toLocaleString()} pt`}</span>
                        <span className="text-[9px] text-slate-600">{nextThreshold.toLocaleString()}</span>
                      </div>
                    </>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-white">{score.toLocaleString()}<span className="text-[10px] text-slate-400 ml-0.5">pt</span></div>
                </div>
                <button onClick={() => setShowLevelBar(v => !v)} className="text-[10px] text-slate-600 hover:text-slate-400 shrink-0">
                  {showLevelBar ? '▲' : '▼'}
                </button>
              </div>
            </div>

            {/* 年後ゴール (編集可能) */}
            {homeGoals && (() => {
              const labels: Record<string, string> = (() => {
                try { return homeGoals.goal_labels ? { ...DEFAULT_GOAL_LABELS, ...JSON.parse(homeGoals.goal_labels) } : { ...DEFAULT_GOAL_LABELS } }
                catch { return { ...DEFAULT_GOAL_LABELS } }
              })()
              const goalKeys = ['goal_3y', 'goal_1y', 'goal_3m'] as const
              const saveGoal = (key: string, val: string) => {
                if (!homeGoals.id) return
                if (homeGoalTimers.current[key]) clearTimeout(homeGoalTimers.current[key])
                homeGoalTimers.current[key] = setTimeout(() => {
                  fetch(`/api/client/${token}/ideal-map`, {
                    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ map_id: homeGoals.id, [key]: val }),
                  })
                }, 800)
              }
              return (
                <div className="glass-card rounded-xl px-3 py-2.5">
                  <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-2">{T.goals}</div>
                  <div className="flex flex-col gap-2">
                    {goalKeys.map(key => {
                      const labelSize = key === 'goal_3y' ? 'text-xs' : key === 'goal_1y' ? 'text-[10px]' : 'text-[10px]'
                      const textSize = key === 'goal_3y' ? 'text-base' : key === 'goal_1y' ? 'text-sm' : 'text-sm'
                      const py = key === 'goal_3y' ? 'py-2' : key === 'goal_1y' ? 'py-1.5' : 'py-1'
                      return (
                        <div key={key} className={`border-l-2 pl-2.5 ${key === 'goal_3y' ? 'border-gold-500/60' : key === 'goal_1y' ? 'border-gold-500/35' : 'border-gold-500/20'} ${py}`}>
                          <div className="flex items-baseline gap-1.5 mb-0.5">
                            <div className={`${labelSize} text-gold-400/70 font-bold`}>{formatGoalLabel(labels[key], lang)}</div>
                            {goalRemainingText(labels[key], lang) && <div className="text-[9px] text-slate-500">{goalRemainingText(labels[key], lang)}</div>}
                          </div>
                          <textarea
                            value={homeGoalDrafts[key] ?? ''}
                            onChange={e => {
                              const val = e.target.value
                              setHomeGoalDrafts(d => ({ ...d, [key]: val }))
                              e.target.style.height = 'auto'
                              e.target.style.height = e.target.scrollHeight + 'px'
                              saveGoal(key, val)
                            }}
                            ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }}
                            className={`bg-transparent border-none outline-none ${textSize} text-slate-300 placeholder-slate-700 w-full resize-none overflow-hidden leading-snug`}
                            placeholder="入力..."
                            rows={1}
                          />
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            {/* 今月のゴール */}
            <div className="glass-card rounded-xl px-3 py-2.5">
              <div className="flex items-center justify-between mb-1">
                <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">
                  {T.monthGoalLabel(currentMonth)}
                </div>
                <button
                  onMouseDown={e => { e.preventDefault(); setMonthGoalColorBar(v => !v) }}
                  className="text-[9px] text-slate-600 hover:text-slate-400 transition-colors px-1"
                  title="文字色を変える"
                >🎨</button>
              </div>
              {monthGoalColorBar && (
                <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                  {[
                    { label: 'リセット', color: '', display: '#94a3b8' },
                    { label: '赤', color: '#ff5555', display: '#ff5555' },
                    { label: 'オレンジ', color: '#fb923c', display: '#fb923c' },
                    { label: '黄', color: '#facc15', display: '#facc15' },
                    { label: '緑', color: '#4ade80', display: '#4ade80' },
                    { label: '青', color: '#60a5fa', display: '#60a5fa' },
                    { label: 'シアン', color: '#22d3ee', display: '#22d3ee' },
                    { label: 'ピンク', color: '#f472b6', display: '#f472b6' },
                  ].map(c => (
                    <button
                      key={c.label}
                      title={c.label}
                      onMouseDown={e => {
                        e.preventDefault()
                        monthlyGoalRef.current?.focus()
                        if (c.color) {
                          document.execCommand('foreColor', false, c.color)
                        } else {
                          document.execCommand('removeFormat', false)
                        }
                        const html = monthlyGoalRef.current?.innerHTML ?? ''
                        setMonthlyGoalText(html)
                        if (monthlyGoalTimer.current) clearTimeout(monthlyGoalTimer.current)
                        monthlyGoalTimer.current = setTimeout(() => {
                          fetch(`/api/client/${token}/monthly-goal`, {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ content: html, period_label: currentMonth }),
                          })
                        }, 300)
                      }}
                      className="w-4 h-4 rounded-full border border-slate-700 shrink-0 transition-transform hover:scale-110"
                      style={{ background: c.display }}
                    />
                  ))}
                </div>
              )}
              <div
                ref={monthlyGoalRef}
                contentEditable
                suppressContentEditableWarning
                onFocus={() => setMonthGoalColorBar(true)}
                onInput={() => {
                  const html = monthlyGoalRef.current?.innerHTML ?? ''
                  if (monthlyGoalTimer.current) clearTimeout(monthlyGoalTimer.current)
                  monthlyGoalTimer.current = setTimeout(() => {
                    fetch(`/api/client/${token}/monthly-goal`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ content: html, period_label: currentMonth }),
                    })
                  }, 800)
                }}
                className={`bg-transparent border-none outline-none text-sm text-slate-300 w-full leading-relaxed min-h-[1.5em] empty:before:text-slate-700 ${lang === 'en' ? "empty:before:content-['Monthly_goal...']" : "empty:before:content-['今月達成したいこと...']"}`}
                style={{ wordBreak: 'break-all', whiteSpace: 'pre-wrap' }}
              />
            </div>

            {/* ★ Week ToDo */}
            <div className="glass-card rounded-2xl">
              <div className="flex items-center justify-between px-3 pt-3 pb-2 border-b border-slate-800/60">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <button onClick={() => switchWeek(weekOffset - 1)} className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:border-slate-500 text-sm transition-colors">‹</button>
                  <div className="shrink-0 text-center">
                    <div className={`text-xs font-bold ${weekOffset === 0 ? 'text-gold-400' : weekOffset > 0 ? 'text-emerald-400' : 'text-slate-400'}`}>{weekLabel}</div>
                    <div className="text-[9px] text-slate-600">{weekRangeLabel}</div>
                  </div>
                  <button onClick={() => switchWeek(weekOffset + 1)} className="w-7 h-7 shrink-0 flex items-center justify-center rounded-lg border border-slate-700 text-slate-400 hover:border-slate-500 text-sm transition-colors">›</button>
                  {weekOffset !== 0 && <button onClick={() => switchWeek(0)} className="text-[9px] text-slate-600 hover:text-slate-400 underline shrink-0">{T.thisWeek}</button>}
                </div>
                <button onClick={() => { const n: WeekStart = weekStartDay === 1 ? 0 : 1; setWeekStartDay(n); localStorage.setItem('weekStartDay', String(n)) }}
                  className="text-[9px] border border-slate-700 text-slate-500 px-1.5 py-1 rounded-lg hover:text-slate-400 transition-colors">
                  {T.weekStart(weekStartDay)}
                </button>
              </div>
              {/* 週の目標（2行テキストエリア） */}
              <textarea
                rows={2}
                value={weeklyGoalText}
                onChange={e => {
                  setWeeklyGoalText(e.target.value)
                  const ws = weekStart
                  if (weeklyGoalTimer.current) clearTimeout(weeklyGoalTimer.current)
                  weeklyGoalTimer.current = setTimeout(() => {
                    fetch(`/api/client/${token}/weekly-goal`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ content: e.target.value, week_start: ws }),
                    })
                    setData(prev => {
                      if (!prev) return prev
                      const goals = prev.client_goals as any[]
                      const exists = goals.some(g => g.goal_type === 'weekly' && g.period_label === ws)
                      return {
                        ...prev,
                        client_goals: exists
                          ? goals.map(g => g.goal_type === 'weekly' && g.period_label === ws ? { ...g, content: e.target.value } : g)
                          : [...goals, { id: 'wg_' + ws, client_id: '', goal_type: 'weekly', period_label: ws, content: e.target.value, point_value: 0 }]
                      }
                    })
                  }, 800)
                }}
                className="w-full px-3 py-2 bg-transparent border-none border-t border-slate-800/60 outline-none resize-none text-xs text-slate-300 placeholder-slate-700"
                placeholder={T.weekGoalPlaceholder}
              />

              {weekLoading ? (
                <div className="py-8 text-center text-slate-600 text-xs">読み込み中...</div>
              ) : (
                <div className="divide-y divide-slate-800/40">
                  {weekDates.map((date, i) => {
                    const isToday = date === today
                    const isFuture = date > today
                    const isExpanded = expandedDates.has(date)
                    const daySlots = slots[date] ?? []
                    const donePts = daySlots.filter(s => completions[ck(s.id, date)]).reduce((sum, s) => sum + s.point_value, 0)
                    const doneCount = daySlots.filter(s => completions[ck(s.id, date)]).length
                    const d = new Date(date)
                    const q = quickAdd[date] ?? { time: '', search: '', task_id: '', task_name: '', point_value: 0 }
                    const filteredForDate = getOrderedTasks().filter(t => q.search === '' || t.content.toLowerCase().includes(q.search.toLowerCase()))

                    return (
                      <div key={date}>
                        <div className={`flex items-center gap-2 px-3 py-2 transition-colors hover:bg-slate-800/30 ${isToday ? 'bg-gold-500/5' : ''}`}>
                          {/* クリックで展開する左エリア */}
                          <button
                            onClick={() => setExpandedDates(prev => { const s = new Set(prev); isExpanded ? s.delete(date) : s.add(date); return s })}
                            className="flex items-center gap-2 shrink-0"
                          >
                            <span className={`text-sm font-bold w-10 shrink-0 ${isToday ? 'text-gold-400' : isFuture && weekOffset === 0 ? 'text-slate-500' : 'text-slate-300'}`}>{dayLabels[i]}</span>
                            <span className={`text-xs w-5 shrink-0 ${isToday ? 'text-gold-400' : 'text-slate-600'}`}>{d.getDate()}</span>
                            {isToday && <span className="text-[8px] px-1 py-0.5 rounded bg-gold-500/20 text-gold-400 font-bold">TODAY</span>}
                          </button>

                          {/* 今日の目標インライン入力（全日） */}
                          <input
                            type="text"
                            value={weekGoals[date] ?? ''}
                            onChange={e => saveGoal(date, e.target.value)}
                            onClick={e => e.stopPropagation()}
                            className={`flex-1 min-w-0 bg-transparent border-none outline-none text-xs placeholder-slate-700 ${isToday ? 'text-slate-300' : 'text-slate-500'} ${goalChecked[date] ? 'line-through text-slate-600' : ''}`}
                            placeholder={T.todayGoalPlaceholder}
                          />
                          {/* 目標達成チェック */}
                          {weekGoals[date] && (
                            <button
                              onClick={e => { e.stopPropagation(); toggleGoalCheck(date) }}
                              className={`shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-all text-[9px] font-bold ${goalChecked[date] ? 'bg-gold-500 border-gold-400 text-navy-950' : 'border-slate-700 text-slate-700 hover:border-gold-500/50 hover:text-gold-400'}`}
                              title={goalChecked[date] ? '達成済み (+10pt)' : '達成としてマーク (+10pt)'}
                            >
                              {goalChecked[date] ? '✓' : ''}
                            </button>
                          )}

                          {/* 右側：進捗ドット＋展開 */}
                          <button
                            onClick={() => setExpandedDates(prev => { const s = new Set(prev); isExpanded ? s.delete(date) : s.add(date); return s })}
                            className="flex items-center gap-1.5 shrink-0"
                          >
                            {daySlots.length > 0 ? (
                              <>
                                <div className="flex gap-0.5">{daySlots.slice(0, 8).map(s => <div key={s.id} className={`w-1.5 h-1.5 rounded-full ${completions[ck(s.id, date)] ? 'bg-emerald-400' : 'bg-slate-700'}`} />)}</div>
                                <span className="text-[10px] text-slate-500">{doneCount}/{daySlots.length}</span>
                                {donePts > 0 && <span className="text-[10px] text-gold-400 font-bold">+{donePts}</span>}
                              </>
                            ) : <span className="text-[10px] text-slate-700">—</span>}
                            <span className={`text-slate-700 text-[10px] ml-0.5 transition-transform inline-block ${isExpanded ? 'rotate-180' : ''}`}>▾</span>
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="theme-bg-sub px-3 pt-1.5 pb-2 space-y-0.5" onClick={e => e.stopPropagation()}>
                            {daySlots.map(slot => {
                              const done = !!completions[ck(slot.id, date)]
                              const isLoad = toggling === ck(slot.id, date)
                              const isEditing = editingSlotId === slot.id
                              const editSearch = editingSlotDraft.task_name
                              const filteredEdit = tasks.filter(t => editSlotSearch === '' || t.content.toLowerCase().includes(editSlotSearch.toLowerCase()))

                              if (isEditing) {
                                return (
                                  <div key={slot.id} className="rounded-lg border border-gold-500/30 bg-slate-800/50 px-2 py-1.5 space-y-1.5">
                                    <div className="flex gap-1.5">
                                      <input
                                        type="text"
                                        value={editingSlotDraft.time}
                                        onChange={e => setEditingSlotDraft(d => ({ ...d, time: e.target.value }))}
                                        className="input-dark w-20 shrink-0 px-2 py-1 rounded-lg text-xs font-mono text-center"
                                        placeholder="8-10"
                                      />
                                      <div className="flex-1 relative">
                                        <input
                                          type="text"
                                          value={editingSlotDraft.task_name || editSlotSearch}
                                          onChange={e => { setEditSlotSearch(e.target.value); setEditingSlotDraft(d => ({ ...d, task_name: e.target.value })); setShowEditSlotSearch(true) }}
                                          onFocus={() => { setShowEditSlotSearch(true) }}
                                          className="input-dark w-full px-2 py-1 rounded-lg text-xs text-slate-200"
                                          placeholder={T.searchTask}
                                        />
                                        {showEditSlotSearch && (
                                          <div className="absolute bottom-full left-0 right-0 mb-1 z-50 max-h-[50vh] overflow-y-auto rounded-xl border border-slate-700 theme-bg shadow-xl divide-y divide-slate-800/50">
                                            {filteredEdit.map(t => (
                                              <button key={t.id} onMouseDown={e => { e.preventDefault(); setEditingSlotDraft(d => ({ ...d, task_id: t.id, task_name: t.content, point_value: t.point_value })); setEditSlotSearch(''); setShowEditSlotSearch(false) }}
                                                className="w-full text-left px-3 py-2 flex items-center gap-2 hover:bg-slate-700/30">
                                                <span className="text-xs text-slate-300 truncate">{t.content}</span>
                                                <span className="text-[10px] text-gold-400/70 shrink-0">+{t.point_value}pt</span>
                                              </button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <input type="number" min={1} value={editingSlotDraft.point_value}
                                        onChange={e => setEditingSlotDraft(d => ({ ...d, point_value: parseInt(e.target.value) || 1 }))}
                                        className="input-dark w-14 shrink-0 px-2 py-1 rounded-lg text-xs text-center" />
                                      <span className="text-[10px] text-slate-500 shrink-0">pt</span>
                                      <div className="flex gap-1 flex-wrap">
                                        {[1,2,3,5,10,20].map(pt => (
                                          <button key={pt} type="button" onClick={() => setEditingSlotDraft(d => ({ ...d, point_value: pt }))}
                                            className={`px-1.5 py-0.5 rounded text-[10px] border ${editingSlotDraft.point_value === pt ? 'bg-gold-500/20 border-gold-500/50 text-gold-400' : 'border-slate-700 text-slate-500'}`}>{pt}</button>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="flex gap-1.5">
                                      <button onClick={() => setEditingSlotId(null)} className="flex-1 py-1 rounded-lg text-[10px] text-slate-500 border border-slate-700">{T.cancel}</button>
                                      <button onClick={() => commitEditSlot(date)} className="flex-1 py-1 rounded-lg text-[10px] btn-gold font-bold">{T.save}</button>
                                    </div>
                                  </div>
                                )
                              }

                              const slotDropHere = slotDropTarget?.id === slot.id ? slotDropTarget.pos : null
                              return (
                                <div
                                  key={slot.id}
                                  draggable
                                  onDragStart={e => { e.stopPropagation(); setDragSlotId(slot.id) }}
                                  onDragOver={e => { if (dragSlotId === slot.id) return; e.preventDefault(); e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setSlotDropTarget({ id: slot.id, pos: e.clientY < r.top + r.height / 2 ? 'before' : 'after' }) }}
                                  onDragLeave={() => setSlotDropTarget(null)}
                                  onDrop={e => { e.preventDefault(); e.stopPropagation(); if (dragSlotId && slotDropHere) { reorderSlotArray(date, dragSlotId, slot.id, slotDropHere === 'before'); setDragSlotId(null); setSlotDropTarget(null) } }}
                                  onDragEnd={() => { setDragSlotId(null); setSlotDropTarget(null) }}
                                  className={`relative flex items-center gap-1.5 rounded-lg px-2 py-0.5 border transition-colors ${done ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-slate-800/30 border-slate-700/30'} ${dragSlotId === slot.id ? 'opacity-40' : ''}`}
                                >
                                  {slotDropHere === 'before' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-gold-400 pointer-events-none rounded" />}
                                  {slotDropHere === 'after' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-400 pointer-events-none rounded" />}
                                  <span className="text-slate-500 hover:text-slate-300 text-sm cursor-grab active:cursor-grabbing shrink-0 select-none leading-none">⠿</span>
                                  <button onClick={() => toggleTask(slot.task_id, slot.id, date, slot.point_value)} disabled={isLoad}
                                    className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-all active:scale-90 disabled:opacity-40 ${done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'}`}>
                                    {isLoad ? <span className="text-[6px] text-slate-500">…</span> : done ? <span className="text-white text-[8px] font-bold">✓</span> : null}
                                  </button>
                                  <button onClick={() => startEditSlot(slot)} className={`text-[10px] font-mono shrink-0 min-w-[32px] text-left hover:text-gold-400 transition-colors ${done ? 'text-emerald-400/50' : 'text-slate-500'}`}>{slot.time || '—'}</button>
                                  <button onClick={() => startEditSlot(slot)} className="shrink-0 text-xs text-left">
                                    <span className={done ? 'line-through text-slate-500' : 'text-slate-200'}>{data.client_goals.find(g => g.id === slot.task_id)?.content ?? slot.task_name}</span>
                                  </button>
                                  <input
                                    type="text"
                                    value={slotMemos[slot.id] !== undefined ? slotMemos[slot.id] : (slot.task_memo ?? '')}
                                    onChange={e => setSlotMemos(m => ({ ...m, [slot.id]: e.target.value }))}
                                    onBlur={e => updateSlotMemo(date, slot.id, e.target.value)}
                                    onClick={e => e.stopPropagation()}
                                    className="flex-1 min-w-0 bg-transparent border-none outline-none text-[10px] text-slate-500 placeholder-slate-700"
                                    placeholder={T.memoPlaceholder}
                                  />
                                  <span className="text-[10px] text-gold-400/60 shrink-0">+{slot.point_value}</span>
                                  <button onClick={() => removeSlot(date, slot.id)} className="text-slate-700 hover:text-red-400 text-[10px] shrink-0 w-5 h-5 flex items-center justify-center transition-colors">✕</button>
                                </div>
                              )
                            })}

                            {/* クイック追加フォーム */}
                            <div className="relative flex gap-1.5 mt-1">
                              <input type="text" value={q.time}
                                onChange={e => setQuickAdd(qa => ({ ...qa, [date]: { ...q, time: e.target.value } }))}
                                onKeyDown={e => { if (e.key === 'Enter') commitQuickAdd(date) }}
                                className="input-dark w-20 shrink-0 px-2 py-2 rounded-lg text-xs font-mono text-center"
                                placeholder="8-10" />

                              <div className="flex-1 relative">
                                <input type="text"
                                  value={q.task_id ? q.task_name : q.search}
                                  onChange={e => { setQuickAdd(qa => ({ ...qa, [date]: { ...q, search: e.target.value, task_id: '', task_name: '', point_value: 0 } })); setShowSearch(date) }}
                                  onFocus={() => setShowSearch(date)}
                                  onKeyDown={e => { if (e.key === 'Enter' && q.task_id) commitQuickAdd(date) }}
                                  onDoubleClick={() => { if (q.task_id) commitQuickAdd(date) }}
                                  className={`input-dark w-full px-2 py-2 rounded-lg text-xs ${q.task_id ? 'text-gold-400' : 'text-slate-300'}`}
                                  placeholder={tasks.length === 0 ? T.noTaskYet : T.searchTask}
                                  readOnly={!!q.task_id} />
                                {q.task_id && (
                                  <button onClick={() => setQuickAdd(qa => ({ ...qa, [date]: { ...q, task_id: '', task_name: '', point_value: 0, search: '' } }))}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400 text-[10px]">✕</button>
                                )}
                                {showSearch === date && !q.task_id && (
                                  <div className="absolute bottom-full left-0 right-0 mb-1 z-50 max-h-[50vh] overflow-y-auto rounded-xl border border-slate-700 theme-bg shadow-xl divide-y divide-slate-800/50">
                                    {filteredForDate.map(t => (
                                      <div key={t.id} className="divide-y divide-slate-800/30">
                                        {editingTaskId === t.id ? (
                                          <div className="px-3 py-2 space-y-1.5 bg-slate-800/60" onMouseDown={e => e.preventDefault()}>
                                            <input type="text" value={editingTaskDraft.content}
                                              onChange={e => setEditingTaskDraft(d => ({ ...d, content: e.target.value }))}
                                              className="input-dark w-full px-2 py-1 rounded-lg text-xs" placeholder="タスク名" autoFocus />
                                            <div className="flex items-center gap-1.5">
                                              <input type="number" min={1} value={editingTaskDraft.point_value}
                                                onChange={e => setEditingTaskDraft(d => ({ ...d, point_value: parseInt(e.target.value) || 1 }))}
                                                className="input-dark w-14 px-2 py-1 rounded-lg text-xs text-center" />
                                              <span className="text-[10px] text-slate-500 shrink-0">pt</span>
                                              <div className="flex gap-1 flex-wrap">
                                                {[1, 2, 3, 5, 10, 20].map(pt => (
                                                  <button key={pt} type="button" onMouseDown={e => { e.preventDefault(); setEditingTaskDraft(d => ({ ...d, point_value: pt })) }}
                                                    className={`px-1.5 py-0.5 rounded text-[10px] border ${editingTaskDraft.point_value === pt ? 'bg-gold-500/20 border-gold-500/50 text-gold-400' : 'border-slate-700 text-slate-500'}`}>{pt}</button>
                                                ))}
                                              </div>
                                            </div>
                                            <div className="flex gap-1.5">
                                              <button onMouseDown={e => { e.preventDefault(); setEditingTaskId(null) }} className="flex-1 py-1 rounded-lg text-[10px] border border-slate-700 text-slate-500">{T.cancel}</button>
                                              <button onMouseDown={e => { e.preventDefault(); commitEditTask() }} disabled={savingTaskEdit || !editingTaskDraft.content.trim()}
                                                className="flex-1 py-1 rounded-lg text-[10px] btn-gold font-bold disabled:opacity-40">{savingTaskEdit ? '...' : T.save}</button>
                                            </div>
                                          </div>
                                        ) : (() => {
                                          const taskDropHere = taskDropTarget?.id === t.id ? taskDropTarget.pos : null
                                          return (
                                          <div
                                            className={`relative flex items-center hover:bg-slate-700/30 transition-colors group ${dragTaskId === t.id ? 'opacity-40' : ''}`}
                                            draggable
                                            onDragStart={e => { e.stopPropagation(); setDragTaskId(t.id) }}
                                            onDragOver={e => { if (dragTaskId === t.id) return; e.preventDefault(); e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setTaskDropTarget({ id: t.id, pos: e.clientY < r.top + r.height / 2 ? 'before' : 'after' }) }}
                                            onDragLeave={() => setTaskDropTarget(null)}
                                            onDrop={e => { e.preventDefault(); e.stopPropagation(); if (dragTaskId && taskDropHere) { reorderTasks(dragTaskId, t.id, taskDropHere === 'before'); setDragTaskId(null); setTaskDropTarget(null) } }}
                                            onDragEnd={() => { setDragTaskId(null); setTaskDropTarget(null) }}
                                          >
                                            {taskDropHere === 'before' && <div className="absolute top-0 left-0 right-0 h-0.5 bg-gold-400 pointer-events-none" />}
                                            {taskDropHere === 'after' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gold-400 pointer-events-none" />}
                                            <span onMouseDown={e => e.preventDefault()} className="pl-2 text-slate-600 hover:text-slate-400 text-sm cursor-grab active:cursor-grabbing shrink-0 select-none leading-none">⠿</span>
                                            <button
                                              onMouseDown={e => { e.preventDefault(); setQuickAdd(qa => ({ ...qa, [date]: { ...q, task_id: t.id, task_name: t.content, point_value: t.point_value, task_memo: '', search: '' } })); setShowSearch(null) }}
                                              onDoubleClick={e => { e.preventDefault(); setQuickAdd(qa => ({ ...qa, [date]: { ...q, task_id: t.id, task_name: t.content, point_value: t.point_value, task_memo: '', search: '' } })); setShowSearch(null); setTimeout(() => commitQuickAdd(date), 0) }}
                                              className="flex-1 text-left px-3 py-2 min-w-0">
                                              <div className="flex items-center gap-2">
                                                <span className="text-xs text-slate-300 truncate">{t.content}</span>
                                                <span className="text-[10px] text-gold-400/70 shrink-0">+{t.point_value}pt</span>
                                              </div>
                                            </button>
                                            <button onMouseDown={e => { e.preventDefault(); startEditTask(t) }}
                                              className="px-2 py-2 text-slate-600 hover:text-gold-400 text-[10px] opacity-0 group-hover:opacity-100 transition-all shrink-0">✎</button>
                                            <button onMouseDown={e => { e.preventDefault(); deleteTask(t.id) }}
                                              className="px-2 py-2 text-slate-700 hover:text-red-400 text-[10px] opacity-0 group-hover:opacity-100 transition-all shrink-0">✕</button>
                                          </div>
                                          )
                                        })()}
                                      </div>
                                    ))}
                                    <button
                                      onMouseDown={e => {
                                        e.preventDefault()
                                        setShowNewTaskFor(date)
                                        setShowSearch(null)
                                        setTimeout(() => {
                                          document.getElementById(`new-task-form-${date}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                        }, 100)
                                      }}
                                      className="w-full text-left px-3 py-2.5 flex items-center gap-2 hover:bg-gold-500/10 transition-colors">
                                      <span className="text-[10px] text-gold-400 font-bold">＋ 新しいタスクを作る</span>
                                      {q.search && <span className="text-[10px] text-slate-500">「{q.search}」</span>}
                                    </button>
                                  </div>
                                )}
                              </div>

                              <button onClick={() => commitQuickAdd(date)} disabled={!q.task_id || !q.time}
                                className="shrink-0 w-9 h-[34px] rounded-lg btn-gold flex items-center justify-center text-sm font-bold disabled:opacity-30 disabled:cursor-not-allowed">
                                +
                              </button>
                            </div>

                            {/* ★ インラインタスク作成フォーム */}
                            {showNewTaskFor === date && (
                              <div id={`new-task-form-${date}`} className="bg-slate-800/50 rounded-xl p-3 space-y-2 border border-slate-700/50" onClick={e => e.stopPropagation()}>
                                <div className="text-[9px] text-gold-400 font-bold uppercase tracking-wider">{T.addNewTask}</div>
                                <input type="text" value={inlineTask.content}
                                  onChange={e => setInlineTask(t => ({ ...t, content: e.target.value }))}
                                  onKeyDown={e => { if (e.key === 'Enter' && !e.nativeEvent.isComposing) saveInlineTask(date) }}
                                  className="input-dark w-full px-3 py-2 rounded-lg text-xs" placeholder="タスク名" autoFocus />
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number"
                                    min={1}
                                    value={inlineTask.point_value}
                                    onChange={e => setInlineTask(t => ({ ...t, point_value: parseInt(e.target.value) || 1 }))}
                                    className="input-dark w-20 shrink-0 px-3 py-1.5 rounded-lg text-xs text-center"
                                  />
                                  <span className="text-xs text-slate-500 shrink-0">pt</span>
                                  <div className="flex gap-1 flex-wrap">
                                    {[1, 2, 3, 5, 10, 20].map(pt => (
                                      <button key={pt} type="button" onClick={() => setInlineTask(t => ({ ...t, point_value: pt }))}
                                        className={`px-2 py-1 rounded-lg text-[10px] border transition-colors ${inlineTask.point_value === pt ? 'bg-gold-500/20 border-gold-500/50 text-gold-400 font-bold' : 'border-slate-700 text-slate-400'}`}>
                                        {pt}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button onClick={() => setShowNewTaskFor(null)} className="flex-1 py-1.5 rounded-lg text-[10px] text-slate-500 border border-slate-700">{T.cancel}</button>
                                  <button onClick={() => saveInlineTask(date)} disabled={savingInlineTask || !inlineTask.content.trim()}
                                    className="flex-1 py-1.5 rounded-lg text-[10px] btn-gold font-bold disabled:opacity-40">
                                    {savingInlineTask ? T.saving : T.createAndSelect}
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 今週のメモ */}
            <div className="glass-card rounded-xl px-3 py-2.5">
              <div className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mb-1">
                {T.memo}
              </div>
              <textarea
                value={weeklyMemoText}
                onChange={e => {
                  const val = e.target.value
                  setWeeklyMemoText(val)
                  e.target.style.height = 'auto'
                  e.target.style.height = e.target.scrollHeight + 'px'
                  if (weeklyMemoTimer.current) clearTimeout(weeklyMemoTimer.current)
                  weeklyMemoTimer.current = setTimeout(() => {
                    fetch(`/api/client/${token}/weekly-memo`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ content: val, week_start: weekStart }),
                    }).then(async () => {
                      // client_goalsキャッシュを更新して週切り替え時に反映
                      setData(prev => {
                        if (!prev) return prev
                        const exists = (prev.client_goals as any[]).some(g => g.goal_type === 'weekly_memo' && g.period_label === weekStart)
                        const updated = exists
                          ? prev.client_goals.map((g: any) => g.goal_type === 'weekly_memo' && g.period_label === weekStart ? { ...g, content: val } : g)
                          : [...prev.client_goals, { id: 'wm_' + weekStart, client_id: prev.id ?? '', goal_type: 'weekly_memo', period_label: weekStart, content: val, point_value: 0 }]
                        return { ...prev, client_goals: updated }
                      })
                    })
                  }, 800)
                }}
                ref={el => { if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' } }}
                className="bg-transparent border-none outline-none text-xs text-slate-300 placeholder-slate-700 w-full resize-none overflow-hidden leading-relaxed"
                placeholder={T.memoPlaceholder}
                rows={2}
              />
            </div>

            {todayReport && todayReport.result ? (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
                <div className="text-[10px] text-emerald-400 font-bold mb-1">{T.reportSubmitted}</div>
                {todayReport.result && <p className="text-xs text-slate-300 line-clamp-2">{todayReport.result}</p>}
                {(todayReport.coach_fb || todayReport.coach_ff) && (
                  <div className="mt-2 pt-2 border-t border-emerald-500/20 space-y-1">
                    {todayReport.coach_fb && <p className="text-xs text-slate-300"><span className="text-gold-400 font-medium">FB：</span>{todayReport.coach_fb}</p>}
                    {todayReport.coach_ff && <p className="text-xs text-slate-300"><span className="text-emerald-400 font-medium">FF：</span>{todayReport.coach_ff}</p>}
                  </div>
                )}
              </div>
            ) : (
              <button onClick={() => setTab('report')} className="glass-card w-full rounded-xl px-3 py-2.5 text-left hover:border-gold-500/30 transition-colors">
                <div className="text-[10px] text-slate-400 mb-0.5">{T.reportToday}</div>
                <div className="text-sm text-gold-400 font-medium">{T.reportPrompt}</div>
              </button>
            )}

            {latestFb && (latestFb.coach_fb || latestFb.coach_ff) && latestFb.report_date !== today && (
              <div className="glass-card rounded-xl px-3 py-2.5">
                <div className="text-[10px] text-slate-400 uppercase tracking-widest mb-1">コーチからのフィードバック <span className="text-slate-600 normal-case">{latestFb.report_date}</span></div>
                {latestFb.coach_fb && <p className="text-xs text-slate-300 mb-1"><span className="text-gold-400">FB：</span>{latestFb.coach_fb}</p>}
                {latestFb.coach_ff && <p className="text-xs text-slate-300"><span className="text-emerald-400">FF：</span>{latestFb.coach_ff}</p>}
              </div>
            )}
          </>
        )}

        {/* ======= REPORT ======= */}
        {tab === 'report' && (
          <>
            <div className="flex items-baseline gap-2 pt-1 mb-1">
              <h2 className="text-lg font-bold text-white">{lang === 'en' ? 'DAILY REPORT' : '日報'}</h2>
              {lang === 'en' && <span className="text-[10px] text-slate-600 tracking-widest">日報</span>}
            </div>
            <form onSubmit={submitReport} className="space-y-3">
              <div className="glass-card rounded-2xl p-4 space-y-4">
                <div>
                  <label className="flex items-baseline gap-1.5 mb-1.5">
                    <span className="text-[10px] font-bold text-gold-400/80 uppercase tracking-widest">DATE</span>
                    <span className="text-[9px] text-slate-600">{T.dateLabel}</span>
                  </label>
                  <input type="date" value={reportForm.report_date} onChange={e => setReportForm(f => ({ ...f, report_date: e.target.value }))} className="input-dark px-4 py-3 rounded-xl text-sm w-full" />
                </div>
                <div>
                  <label className="flex items-baseline gap-1.5 mb-1.5">
                    <span className="text-[10px] font-bold text-gold-400/80 uppercase tracking-widest">GOAL</span>
                    <span className="text-[9px] text-slate-600">{T.todayGoalLabel}</span>
                  </label>
                  <textarea value={reportForm.today_goal} onChange={e => setReportForm(f => ({ ...f, today_goal: e.target.value }))} className="input-dark w-full px-4 py-3 rounded-xl text-sm" rows={2} placeholder={T.todayGoalFormPlaceholder} />
                </div>
                <div>
                  <label className="flex items-baseline gap-1.5 mb-1.5">
                    <span className="text-[10px] font-bold text-gold-400/80 uppercase tracking-widest">RESULT</span>
                    <span className="text-[9px] text-slate-600">{T.resultLabel}</span>
                  </label>
                  <textarea value={reportForm.result} onChange={e => setReportForm(f => ({ ...f, result: e.target.value }))} className="input-dark w-full px-4 py-3 rounded-xl text-sm" rows={4} placeholder={T.resultPlaceholder} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setReportForm(f => ({ ...f, achieved: true }))} className={`py-3 rounded-xl text-sm border font-medium transition-colors ${reportForm.achieved === true ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400' : 'border-slate-700 text-slate-500'}`}>✓ ACHIEVED</button>
                  <button type="button" onClick={() => setReportForm(f => ({ ...f, achieved: false }))} className={`py-3 rounded-xl text-sm border font-medium transition-colors ${reportForm.achieved === false ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'border-slate-700 text-slate-500'}`}>✗ MISSED</button>
                </div>
                {reportForm.achieved === false && (
                  <div>
                    <label className="flex items-baseline gap-1.5 mb-1.5">
                      <span className="text-[10px] font-bold text-gold-400/80 uppercase tracking-widest">CAUSE</span>
                      <span className="text-[9px] text-slate-600">{T.causeLabel}</span>
                    </label>
                    <textarea value={reportForm.reason} onChange={e => setReportForm(f => ({ ...f, reason: e.target.value }))} className="input-dark w-full px-4 py-3 rounded-xl text-sm" rows={3} placeholder={T.causePlaceholder} />
                  </div>
                )}
                <div>
                  <label className="flex items-baseline gap-1.5 mb-1.5">
                    <span className="text-[10px] font-bold text-gold-400/80 uppercase tracking-widest">NEXT GOAL</span>
                    <span className="text-[9px] text-slate-600">{T.tomorrowGoalLabel}</span>
                  </label>
                  <textarea value={reportForm.tomorrow_goal} onChange={e => setReportForm(f => ({ ...f, tomorrow_goal: e.target.value }))} className="input-dark w-full px-4 py-3 rounded-xl text-sm" rows={2} placeholder={T.tomorrowPlaceholder} />
                </div>
                <div>
                  <label className="flex items-baseline gap-1.5 mb-1.5">
                    <span className="text-[10px] font-bold text-gold-400/80 uppercase tracking-widest">IMPROVEMENT</span>
                    <span className="text-[9px] text-slate-600">{T.improvementLabel}</span>
                  </label>
                  <textarea value={reportForm.memo} onChange={e => setReportForm(f => ({ ...f, memo: e.target.value }))} className="input-dark w-full px-4 py-3 rounded-xl text-sm" rows={2} placeholder={T.improvementPlaceholder} />
                </div>
              </div>
              <button type="submit" disabled={submitting} className="btn-gold w-full py-4 rounded-xl text-sm font-semibold disabled:opacity-50">
                {submitting ? 'SUBMITTING...' : 'SUBMIT REPORT'}
              </button>
            </form>
          </>
        )}

        {/* ======= MAP ======= */}
        {tab === 'map' && (
          <MapTab key={mapRefreshKey} token={token} lang={lang} onGoalLabelsChange={labels => setHomeGoals(prev => prev ? { ...prev, goal_labels: JSON.stringify(labels) } : prev)} />
        )}

        {/* ======= PLAN ======= */}
        {tab === 'plan' && (
          <ExecutionPlanTab token={token} lang={lang} />
        )}

        {/* ======= REWARD ======= */}
        {tab === 'reward' && (
          <RewardsTab token={token} score={score} lang={lang} />
        )}

        {/* ======= HISTORY ======= */}
        {tab === 'history' && (
          <HistoryTab
            lang={lang} token={token} dailyReports={data.daily_reports}
            onMapRestored={() => setMapRefreshKey(k => k + 1)}
            T={T}
          />
        )}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 border-t theme-border-nav theme-bg-header backdrop-blur-md z-50">
        <div className="max-w-3xl mx-auto flex">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 flex flex-col items-center justify-center py-3 gap-0.5 transition-colors ${tab === t.id ? 'text-gold-400' : 'text-slate-600 hover:text-slate-400'}`}>
              <span className="text-base leading-none">{t.icon}</span>
              <span className="text-[9px] tracking-wide mt-0.5">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
