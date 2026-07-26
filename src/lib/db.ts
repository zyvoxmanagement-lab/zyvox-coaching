import Database from 'better-sqlite3'
import path from 'path'
import crypto from 'crypto'

export function genId() { return crypto.randomUUID() }

const DB_PATH = path.join('/Users/jackj', 'zyvox-data.sqlite')

let _db: Database.Database | null = null

export function getDb(): Database.Database {
  if (_db) return _db
  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')
  initSchema(_db)
  return _db
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      note TEXT,
      access_token TEXT UNIQUE NOT NULL,
      total_score INTEGER DEFAULT 0,
      current_level INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS client_goals (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      goal_type TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      point_value INTEGER DEFAULT 0,
      period_label TEXT,
      memo TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_reports (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      report_date TEXT NOT NULL,
      today_goal TEXT,
      result TEXT,
      achieved INTEGER,
      reason TEXT,
      tomorrow_goal TEXT,
      memo TEXT,
      score INTEGER DEFAULT 0,
      coach_fb TEXT,
      coach_ff TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(client_id, report_date),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS daily_completions (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      task_id TEXT NOT NULL,
      slot_id TEXT,
      completion_date TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      UNIQUE(slot_id, completion_date),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS ideal_maps (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      ideal_life TEXT,
      bottleneck TEXT,
      determination TEXT,
      discipline TEXT,
      mindset TEXT,
      new_environment TEXT,
      goal_3y TEXT,
      goal_1y TEXT,
      goal_3m TEXT,
      map_date TEXT,
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS monthly_meetings (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      meeting_date TEXT,
      memo TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
    );
  `)
  // マイグレーション: client_goalsにmemo/sort_orderカラムがなければ追加
  const cgCols = db.prepare("PRAGMA table_info(client_goals)").all() as { name: string }[]
  if (!cgCols.find(c => c.name === 'memo')) {
    db.exec("ALTER TABLE client_goals ADD COLUMN memo TEXT")
  }
  if (!cgCols.find(c => c.name === 'sort_order')) {
    db.exec("ALTER TABLE client_goals ADD COLUMN sort_order INTEGER DEFAULT 0")
    // 既存rewardのsort_orderをpoint_value順で初期化
    db.exec(`
      UPDATE client_goals SET sort_order = (
        SELECT COUNT(*) FROM client_goals g2
        WHERE g2.client_id = client_goals.client_id
          AND g2.period_label = 'reward'
          AND g2.point_value < client_goals.point_value
      ) WHERE period_label = 'reward'
    `)
  }

  // マイグレーション: daily_reportsにgoal_achieved/slotsカラムを追加
  const drInfo = db.prepare("PRAGMA table_info(daily_reports)").all() as { name: string }[]
  if (!drInfo.find(c => c.name === 'goal_achieved')) {
    db.exec("ALTER TABLE daily_reports ADD COLUMN goal_achieved INTEGER DEFAULT 0")
  }
  if (!drInfo.find(c => c.name === 'slots')) {
    db.exec("ALTER TABLE daily_reports ADD COLUMN slots TEXT")
    db.exec("UPDATE daily_reports SET slots = memo WHERE memo LIKE '[%'")
    db.exec("UPDATE daily_reports SET memo = NULL WHERE memo LIKE '[%'")
  }

  // マイグレーション: daily_completionsにslot_idを追加、UNIQUE制約変更
  const dcInfo = db.prepare("PRAGMA table_info(daily_completions)").all() as { name: string }[]
  if (!dcInfo.find(c => c.name === 'slot_id')) {
    db.exec(`
      CREATE TABLE daily_completions_new (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        task_id TEXT NOT NULL,
        slot_id TEXT,
        completion_date TEXT NOT NULL,
        completed INTEGER DEFAULT 0,
        UNIQUE(slot_id, completion_date),
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      );
      DROP TABLE daily_completions;
      ALTER TABLE daily_completions_new RENAME TO daily_completions;
    `)
  }

  // マイグレーション: ideal_mapsをUNIQUE制約なし・map_date列ありに再作成
  const imInfo = db.prepare("PRAGMA table_info(ideal_maps)").all() as { name: string }[]
  if (!imInfo.find(c => c.name === 'goal_labels')) {
    db.exec("ALTER TABLE ideal_maps ADD COLUMN goal_labels TEXT")
  }
  if (!imInfo.find(c => c.name === 'origin')) {
    db.exec("ALTER TABLE ideal_maps ADD COLUMN origin TEXT")
  }
  if (!imInfo.find(c => c.name === 'deleted_at')) {
    db.exec("ALTER TABLE ideal_maps ADD COLUMN deleted_at TEXT")
  }
  const hasMapDate = imInfo.find(c => c.name === 'map_date')
  if (!hasMapDate) {
    db.exec(`
      CREATE TABLE ideal_maps_new (
        id TEXT PRIMARY KEY,
        client_id TEXT NOT NULL,
        ideal_life TEXT, bottleneck TEXT, determination TEXT, discipline TEXT,
        mindset TEXT, new_environment TEXT, goal_3y TEXT, goal_1y TEXT, goal_3m TEXT,
        map_date TEXT,
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
      );
      INSERT INTO ideal_maps_new (id,client_id,ideal_life,bottleneck,determination,discipline,mindset,new_environment,goal_3y,goal_1y,goal_3m,map_date)
        SELECT id,client_id,ideal_life,bottleneck,determination,discipline,mindset,new_environment,goal_3y,goal_1y,goal_3m,date('now') FROM ideal_maps;
      DROP TABLE ideal_maps;
      ALTER TABLE ideal_maps_new RENAME TO ideal_maps;
    `)
  }
}
