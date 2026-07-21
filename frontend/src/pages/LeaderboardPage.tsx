import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getLeaderboard, getMatchupQuality } from '../api/stats'
import { usePlayerFilter } from '../context/PlayerFilterContext'
import { useSeasonFilter } from '../context/SeasonFilterContext'
import LeaderboardTable from '../components/LeaderboardTable'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { LeaderboardEntry, MatchupQualityEntry } from '../types'

export default function LeaderboardPage() {
  const { selectedIds } = usePlayerFilter()
  const { selectedSeasonId } = useSeasonFilter()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [sortBy, setSortBy] = useState<'win_rate' | 'avg_points'>('avg_points')
  const [fairness, setFairness] = useState<MatchupQualityEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    Promise.all([
      getLeaderboard(sortBy, selectedIds, selectedSeasonId),
      getMatchupQuality(selectedIds, selectedSeasonId),
    ])
      .then(([lb, fq]) => { setEntries(lb); setFairness(fq) })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [sortBy, selectedIds, selectedSeasonId])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Leaderboard</CardTitle>
          <div className="flex gap-2">
            <Button variant={sortBy === 'win_rate' ? 'default' : 'outline'} size="sm" onClick={() => setSortBy('win_rate')}>
              Win Rate
            </Button>
            <Button variant={sortBy === 'avg_points' ? 'default' : 'outline'} size="sm" onClick={() => setSortBy('avg_points')}>
              Avg Points
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading && entries.length === 0 && <p className="text-muted-foreground">Loading…</p>}
          {error && <p className="text-destructive">{error}</p>}
          {!error && entries.length > 0 && <LeaderboardTable entries={entries} />}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fairness</CardTitle>
          <p className="text-xs text-muted-foreground">
            Team Skill Imbalance = avg win rate of your team minus avg win rate of opponents, per game. Positive = your team was consistently stronger on paper.
            vs Top 3 is normalized for top-3 players (who have one fewer top-3 opponent available).
            Sorted by composite rank across all three metrics.
          </p>
        </CardHeader>
        <CardContent>
          {loading && fairness.length === 0 && <p className="text-muted-foreground">Loading…</p>}
          {!loading && !error && fairness.length > 0 && (() => {
            const ranked = fairness.map((e) => ({
              ...e,
              _r_imbalance: 0,
              _r_top3: 0,
              _r_blowout: 0,
              _composite: 0,
            }))

            const rank = (arr: typeof ranked, key: keyof typeof ranked[0], higherIsBad: boolean) => {
              const sorted = [...arr].sort((a, b) =>
                higherIsBad
                  ? (b[key] as number) - (a[key] as number)
                  : (a[key] as number) - (b[key] as number)
              )
              sorted.forEach((e, i) => {
                const entry = arr.find((x) => x.player_id === e.player_id)!
                if (key === 'avg_team_skill_imbalance') entry._r_imbalance = i + 1
                if (key === 'pct_vs_top3') entry._r_top3 = i + 1
                if (key === 'blowout_win_pct') entry._r_blowout = i + 1
              })
            }

            rank(ranked, 'avg_team_skill_imbalance', true)
            rank(ranked, 'pct_vs_top3', false)
            rank(ranked, 'blowout_win_pct', true)

            ranked.forEach((e) => {
              e._composite = (e._r_imbalance + e._r_top3 + e._r_blowout) / 3
            })

            ranked.sort((a, b) => a._composite - b._composite)

            return (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right w-8">#</TableHead>
                    <TableHead>Player</TableHead>
                    <TableHead className="text-right">GP</TableHead>
                    <TableHead className="text-right">Team Skill Imbalance</TableHead>
                    <TableHead className="text-right">vs Top 3</TableHead>
                    <TableHead className="text-right">Blowout W%</TableHead>
                    <TableHead className="text-right">Blowout Games</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranked.map((e, i) => (
                    <TableRow key={e.player_id}>
                      <TableCell className="text-right text-muted-foreground font-mono">{i + 1}</TableCell>
                      <TableCell className="font-medium">
                        <Link to={`/players/${e.player_id}`} className="hover:text-yellow-400">
                          {e.canonical_name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right">{e.games_played}</TableCell>
                      <TableCell className={`text-right font-mono ${e.avg_team_skill_imbalance > 0.02 ? 'text-green-400' : e.avg_team_skill_imbalance < -0.02 ? 'text-red-400' : ''}`}>
                        {e.avg_team_skill_imbalance > 0 ? '+' : ''}{(e.avg_team_skill_imbalance * 100).toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right">{(e.pct_vs_top3 * 100).toFixed(0)}%</TableCell>
                      <TableCell className="text-right">
                        {e.blowout_win_pct != null ? `${(e.blowout_win_pct * 100).toFixed(0)}%` : '—'}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{e.blowout_games}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )
          })()}
        </CardContent>
      </Card>
    </div>
  )
}
