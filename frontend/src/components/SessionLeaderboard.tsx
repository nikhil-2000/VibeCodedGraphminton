import { useState } from 'react'
import { BarChart2, ChevronDown, ChevronUp } from 'lucide-react'
import { getLeaderboard } from '../api/stats'
import LeaderboardTable from './LeaderboardTable'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { LeaderboardEntry } from '../types'

interface Props {
  gameIds: number[]
}

export default function SessionLeaderboard({ gameIds }: Props) {
  const [open, setOpen] = useState(false)
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (next && entries === null) {
      setLoading(true)
      setError(null)
      getLeaderboard('avg_points', gameIds)
        .then(setEntries)
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false))
    }
  }

  return (
    <Collapsible open={open} onOpenChange={handleOpenChange}>
      <CollapsibleTrigger className="mt-3 inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
        <BarChart2 className="h-3.5 w-3.5" />
        Session Stats
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 rounded-md border bg-card p-3">
          {loading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {error && <p className="text-xs text-destructive">{error}</p>}
          {!loading && !error && entries && entries.length > 0 && (
            <LeaderboardTable entries={entries} />
          )}
          {!loading && !error && entries && entries.length === 0 && (
            <p className="text-xs text-muted-foreground">No stats available.</p>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
