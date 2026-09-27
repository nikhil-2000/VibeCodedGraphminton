import { BarChart2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

interface Props {
  label: string
  value: string | number
  sub?: string
  onLeaderboardClick?: () => void
  /** When set, the leaderboard icon is shown but non-interactive, with this text as a tooltip. */
  disabledReason?: string
}

export default function StatCard({ label, value, sub, onLeaderboardClick, disabledReason }: Props) {
  return (
    <Card>
      <CardContent>
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          {onLeaderboardClick && (
            <button
              onClick={onLeaderboardClick}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="View leaderboard"
            >
              <BarChart2 size={14} />
            </button>
          )}
          {!onLeaderboardClick && disabledReason && (
            <span
              title={disabledReason}
              className="text-muted-foreground/40 cursor-not-allowed"
              aria-label="Leaderboard unavailable"
            >
              <BarChart2 size={14} />
            </span>
          )}
        </div>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}
