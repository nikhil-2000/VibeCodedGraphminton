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
          <CardTitle>Matchup Patterns</CardTitle>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p><span className="text-foreground">Team Skill Imbalance</span> — avg win rate of your team minus avg win rate of opponents per game. Positive = your team was consistently stronger on paper.</p>
            <p><span className="text-foreground">Partner Quality (P)</span> — avg percentile of your partners (by avg points).</p>
            <p><span className="text-foreground">Opponent Quality (O)</span> — avg percentile of your opponents.</p>
            <p><span className="text-foreground">Advantage (P−O)</span> — partner percentile minus opponent percentile per game. Positive = consistently played with stronger players than you faced.</p>
            <p className="text-muted-foreground/60">Sorted by composite rank across Team Skill Imbalance and Advantage (P−O).</p>
          </div>
        </CardHeader>
        <CardContent>
          {loading && fairness.length === 0 && <p className="text-muted-foreground">Loading…</p>}
          {!loading && !error && fairness.length > 0 && (() => {
            const ranked = fairness.map((e) => ({
              ...e,
              _r_imbalance: 0,
              _r_advantage: 0,
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
                if (key === 'partner_advantage') entry._r_advantage = i + 1
              })
            }

            rank(ranked, 'avg_team_skill_imbalance', true)
            rank(ranked, 'partner_advantage', true)

            ranked.forEach((e) => {
              e._composite = (e._r_imbalance + e._r_advantage) / 2
            })

            ranked.sort((a, b) => a._composite - b._composite)

            return (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right w-8">#</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead className="text-right">GP</TableHead>
                      <TableHead className="text-right">P−O</TableHead>
                      <TableHead className="text-right">Skill Δ</TableHead>
                      <TableHead className="text-right">Partner</TableHead>
                      <TableHead className="text-right">Opponent</TableHead>
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
                        <TableCell className={`text-right font-mono ${e.partner_advantage > 0.02 ? 'text-green-400' : e.partner_advantage < -0.02 ? 'text-red-400' : ''}`}>
                          {e.partner_advantage > 0 ? '+' : ''}{(e.partner_advantage * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell className={`text-right font-mono ${e.avg_team_skill_imbalance > 0.02 ? 'text-green-400' : e.avg_team_skill_imbalance < -0.02 ? 'text-red-400' : ''}`}>
                          {e.avg_team_skill_imbalance > 0 ? '+' : ''}{(e.avg_team_skill_imbalance * 100).toFixed(1)}%
                        </TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{(e.partner_quality * 100).toFixed(1)}%</TableCell>
                        <TableCell className="text-right font-mono text-muted-foreground">{(e.opponent_quality * 100).toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )
          })()}
        </CardContent>
      </Card>
    </div>
  )
}
