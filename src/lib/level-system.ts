// Level thresholds from LevelMaster sheet
const LEVEL_THRESHOLDS: number[] = [
  0,    // Lv0 (placeholder)
  10, 20, 30, 40, 50, 60, 70, 80, 90, 100,           // Lv1-10  (+10)
  150, 200, 250, 300, 350, 400, 450, 500, 550, 600,   // Lv11-20 (+50)
  650, 700, 750, 800, 850, 900, 950, 1000, 1050, 1100, // Lv21-30 (+50)
  1170, 1240, 1310, 1380, 1450, 1520, 1590, 1660, 1730, 1800, // Lv31-40 (+70)
  1900, 2000, 2100, 2200, 2300, 2400, 2500, 2600, 2700, 2800, // Lv41-50 (+100)
  2940, 3080, 3220, 3360, 3500, 3640, 3780, 3920, 4060, 4200, // Lv51-60 (+140)
  4390, 4580, 4770, 4960, 5150, 5340, 5530, 5720, 5910, 6100, // Lv61-70 (+190)
  6350, 6600, 6850, 7100, 7350, 7600, 7850, 8100, 8350, 8600, // Lv71-80 (+250)
  8920, 9240, 9560, 9880, 10200, 10520, 10840, 11160, 11480, 11800, // Lv81-90 (+320)
  12200, 12600, 13000, 13400, 13800, 14200, 14600, 15000, 15400, 15800, // Lv91-100 (+400)
  16290, 16780, 17270, 17760, 18250, 18740, 19230, 19720, 20210, 20700, // Lv101-110 (+490)
  21190, 21680, 22170, 22660, 23150, 23640, 24130, 24620, 25110, 25600, // Lv111-120 (+490)
  26200, 26800, 27400, 28000, 28600, 29200, 29800, 30400, 31000, 31600, // Lv121-130 (+600)
  32200, 32800, 33400, 34000, 34600, 35200, 35800, 36400, 37000, 37600, // Lv131-140 (+600)
  38200, 38800, 39400, 40000, 40600, 41200, 41800, 42400, 43000, 43600, // Lv141-150 (+600)
]

// Lv150以降は+600ペースで無限に続く
const LV150_THRESHOLD = 43600
const LV150_STEP = 600

function thresholdForLevel(level: number): number {
  if (level < LEVEL_THRESHOLDS.length) return LEVEL_THRESHOLDS[level]
  return LV150_THRESHOLD + (level - 150) * LV150_STEP
}

export function getLevelFromScore(score: number): number {
  // まず定義済みテーブルを検索
  let level = 1
  for (let i = 1; i < LEVEL_THRESHOLDS.length; i++) {
    if (score >= LEVEL_THRESHOLDS[i]) level = i
    else break
  }
  // Lv150以上かつまだ上がれるなら延長
  if (level >= 150) {
    const extra = Math.floor((score - LV150_THRESHOLD) / LV150_STEP)
    level = 150 + Math.max(0, extra)
  }
  return level
}

export function getNextLevelThreshold(score: number): number {
  const level = getLevelFromScore(score)
  return thresholdForLevel(level + 1)
}

export function getCurrentLevelThreshold(score: number): number {
  return thresholdForLevel(getLevelFromScore(score))
}

export function getLevelProgress(score: number): number {
  const current = getCurrentLevelThreshold(score)
  const next = getNextLevelThreshold(score)
  if (next === current) return 100
  return Math.round(((score - current) / (next - current)) * 100)
}

export function getMaxLevel(): number {
  return Infinity
}
