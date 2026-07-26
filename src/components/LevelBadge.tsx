import { getLevelFromScore, getLevelProgress, getNextLevelThreshold } from '@/lib/level-system'

export default function LevelBadge({ score, showBar = true }: { score: number; showBar?: boolean }) {
  const level = getLevelFromScore(score)
  const progress = getLevelProgress(score)
  const nextThreshold = getNextLevelThreshold(score)

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-bold px-2 py-0.5 rounded-full border border-gold-500/40 text-gold-400 tracking-wider">
          Lv.{level}
        </span>
        <span className="text-xs text-slate-400">{score.toLocaleString()} pt</span>
      </div>
      {showBar && (
        <div>
          <div className="level-bar">
            <div className="level-bar-fill" style={{ width: `${progress}%` }} />
          </div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            次のLvまで {(nextThreshold - score).toLocaleString()} pt
          </div>
        </div>
      )}
    </div>
  )
}
