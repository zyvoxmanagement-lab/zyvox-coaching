import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'placeholder'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Client = {
  id: string
  name: string
  email: string | null
  access_token: string
  total_score: number
  current_level: number
  created_at: string
  updated_at: string
  note: string | null
  is_hidden: boolean | null
  real_name: string | null
  instagram_name: string | null
  phone: string | null
  memo: string | null
}

export type IdealMap = {
  id: string
  client_id: string
  ideal_life: string | null
  bottleneck: string | null
  goal: string | null
  determination: string | null
  discipline: string | null
  mindset: string | null
  new_environment: string | null
  goal_3y: string | null
  goal_1y: string | null
  goal_3m: string | null
  updated_at: string
}

export type ClientGoal = {
  id: string
  client_id: string
  goal_type: 'monthly' | 'weekly' | 'daily' | 'tasks'
  content: string
  period_label: string | null
  is_achieved: boolean
  point_value: number
  created_at: string
}

export type DailyReport = {
  id: string
  client_id: string
  report_date: string
  today_goal: string | null
  result: string | null
  achieved: boolean | null
  reason: string | null
  tomorrow_goal: string | null
  memo: string | null
  slots: string | null
  coach_fb: string | null
  coach_ff: string | null
  score: number
  created_at: string
  updated_at: string
}

export type MonthlyMeeting = {
  id: string
  client_id: string
  meeting_date: string
  memo: string | null
  created_at: string
}
