-- Zyvox Coaching Management App Schema

-- Clients table
CREATE TABLE clients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  access_token UUID DEFAULT gen_random_uuid() UNIQUE NOT NULL,
  total_score INTEGER DEFAULT 0,
  current_level INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  note TEXT
);

-- Ideal map (理想実現マップ)
CREATE TABLE ideal_maps (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE UNIQUE,
  ideal_life TEXT,
  bottleneck TEXT,
  goal TEXT,
  determination TEXT,
  discipline TEXT,
  mindset TEXT,
  new_environment TEXT,
  goal_3y TEXT,
  goal_1y TEXT,
  goal_3m TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Goals (今月・今週・今日のタスク)
CREATE TABLE client_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  goal_type TEXT NOT NULL CHECK (goal_type IN ('monthly', 'weekly', 'daily', 'tasks')),
  content TEXT NOT NULL,
  period_label TEXT,
  is_achieved BOOLEAN DEFAULT FALSE,
  point_value INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Daily reports (日報)
CREATE TABLE daily_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  today_goal TEXT,
  result TEXT,
  achieved BOOLEAN,
  reason TEXT,
  tomorrow_goal TEXT,
  memo TEXT,
  coach_fb TEXT,
  coach_ff TEXT,
  score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(client_id, report_date)
);

-- Score logs
CREATE TABLE score_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  score_delta INTEGER NOT NULL DEFAULT 0,
  cumulative_score INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Monthly meeting memos
CREATE TABLE monthly_meetings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  meeting_date DATE NOT NULL,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER ideal_maps_updated_at BEFORE UPDATE ON ideal_maps FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER client_goals_updated_at BEFORE UPDATE ON client_goals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER daily_reports_updated_at BEFORE UPDATE ON daily_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER monthly_meetings_updated_at BEFORE UPDATE ON monthly_meetings FOR EACH ROW EXECUTE FUNCTION update_updated_at();
