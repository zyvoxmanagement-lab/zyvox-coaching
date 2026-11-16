import { NextRequest, NextResponse } from 'next/server'
import { getPool } from '@/lib/pg-pool'

function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const pool = getPool()
  const { rows: [client] } = await pool.query('SELECT id FROM clients WHERE access_token = $1', [params.token])
  if (!client) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { rows: goals } = await pool.query("SELECT id, point_value FROM client_goals WHERE client_id = $1 AND goal_type = 'tasks'", [client.id])
  const goalMap: Record<string, number> = {}
  goals.forEach((g: { id: string; point_value: number }) => { goalMap[g.id] = g.point_value })

  const { rows: completions } = await pool.query('SELECT task_id, completion_date FROM daily_completions WHERE client_id = $1 AND completed = 1', [client.id])
  const { rows: reports } = await pool.query('SELECT report_date, score FROM daily_reports WHERE client_id = $1', [client.id])

  const todayParam = req.nextUrl.searchParams.get('today')
  const today = todayParam && /^\d{4}-\d{2}-\d{2}$/.test(todayParam) ? todayParam : localDate(new Date())
  const dailyScores: Record<string, number> = {}
  completions.forEach((c: { task_id: string; completion_date: string }) => {
    dailyScores[c.completion_date] = (dailyScores[c.completion_date] ?? 0) + (goalMap[c.task_id] ?? 0)
  })
  reports.forEach((r: { report_date: string; score: number }) => {
    dailyScores[r.report_date] = (dailyScores[r.report_date] ?? 0) + (r.score ?? 0)
  })

  const allDays = Object.keys(dailyScores).filter(d => d <= today).sort()
  const firstDay = allDays[0]
  let cumTotal = 0
  const cumulativeByDate: Record<string, number> = {}
  allDays.forEach(date => { cumTotal += dailyScores[date]; cumulativeByDate[date] = cumTotal })

  // 直近12ヶ月
  const monthly: { month: string; score: number }[] = []
  const todayD = new Date(today + 'T00:00:00')
  const startDate = new Date(todayD); startDate.setMonth(startDate.getMonth() - 11)
  const monthStart = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`
  const monthEnd = today.slice(0, 7)
  if (firstDay) {
    let m = monthStart
    let lastScore = 0
    // monthStartより前の最新スコアを取得
    Object.keys(cumulativeByDate).filter(d => d.slice(0, 7) < monthStart).sort().forEach(d => { lastScore = cumulativeByDate[d] })
    while (m <= monthEnd) {
      const daysInMonth = Object.keys(cumulativeByDate).filter(d => d.startsWith(m)).sort()
      lastScore = daysInMonth.length > 0 ? cumulativeByDate[daysInMonth[daysInMonth.length - 1]] : lastScore
      monthly.push({ month: m, score: lastScore })
      const [y, mo] = m.split('-').map(Number)
      m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`
    }
  }

  function addDays(base: string, days: number): string {
    const d = new Date(base + 'T00:00:00'); d.setDate(d.getDate() + days); return localDate(d)
  }

  const weekWindowStartStr = addDays(today, -26 * 7)
  let weekBaseline = 0
  Object.entries(dailyScores).forEach(([date, score]) => {
    if (date < weekWindowStartStr && date <= today) weekBaseline += score
  })
  const weekMap: Record<string, number> = {}
  let wRun = weekBaseline
  for (let i = 26 * 7; i >= 0; i--) {
    const dateStr = addDays(today, -i)
    if (dateStr > today) continue
    wRun += dailyScores[dateStr] ?? 0
    const d = new Date(dateStr + 'T00:00:00')
    const day = d.getDay()
    const mon = new Date(d); mon.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
    weekMap[localDate(mon)] = wRun
  }
  const weekly = Object.entries(weekMap).sort(([a], [b]) => a.localeCompare(b)).map(([week, score]) => ({ week, score }))

  const dailyWindowStartStr = addDays(today, -13)
  let dailyBaseline = 0
  Object.entries(dailyScores).forEach(([date, score]) => {
    if (date < dailyWindowStartStr && date <= today) dailyBaseline += score
  })
  const daily: { date: string; score: number }[] = []
  let dRun = dailyBaseline
  for (let i = 13; i >= 0; i--) {
    const dateStr = addDays(today, -i)
    dRun += dailyScores[dateStr] ?? 0
    daily.push({ date: dateStr, score: dRun })
  }

  return NextResponse.json({ daily, weekly, monthly })
}
