import { useState, useEffect } from 'react'
import { getLeaderboard } from '../api/stats'
import LeaderboardTable from '../components/LeaderboardTable'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { LeaderboardEntry } from '../types'

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [sortBy, setSortBy] = useState<'win_rate' | 'avg_points'>('win_rate')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    getLeaderboard(sortBy)
      .then(setEntries)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [sortBy])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Leaderboard</CardTitle>
        <div className="flex gap-2">
          <Button
            variant={sortBy === 'win_rate' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortBy('win_rate')}
          >
            Win Rate
          </Button>
          <Button
            variant={sortBy === 'avg_points' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setSortBy('avg_points')}
          >
            Avg Points
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && <p className="text-muted-foreground">Loading…</p>}
        {error && <p className="text-destructive">{error}</p>}
        {!loading && !error && <LeaderboardTable entries={entries} />}
      </CardContent>
    </Card>
  )
}
