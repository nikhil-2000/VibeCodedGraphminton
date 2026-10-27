import { useEffect, useMemo, useState } from 'react'
import { getLeaderboard } from '../api/stats'
import { getFixtureDifficulty } from '../api/fixture-difficulty'
import { usePlayerFilter } from '../context/PlayerFilterContext'
import { useSeasonFilter } from '../context/SeasonFilterContext'
import RankingList from '../components/RankingList'
import FixtureDifficultyTable from '../components/FixtureDifficultyTable'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { clearRanking, loadRanking, mergeVisibleOrder, reconcileRanking, saveRanking } from '../utils/rankingOrder'
import type { FixtureDifficultyEntry } from '../types'

const DEBOUNCE_MS = 300

export default function FixtureDifficultyPage() {
  const { selectedIds, allPlayers } = usePlayerFilter()
  const { selectedSeasonId } = useSeasonFilter()
  const [stored, setStored] = useState<number[]>(loadRanking)
  const [defaultOrder, setDefaultOrder] = useState<number[] | null>(null)
  const [entries, setEntries] = useState<FixtureDifficultyEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const playerNames = useMemo(
    () => Object.fromEntries(allPlayers.map((p) => [p.id, p.canonical_name])),
    [allPlayers],
  )

  // The default ranking is the leaderboard order (avg points), which already respects the active filters.
  useEffect(() => {
    getLeaderboard('avg_points')
      .then((lb) => setDefaultOrder(lb.map((e) => e.player_id)))
      .catch((e: Error) => setError(e.message))
  }, [selectedSeasonId, selectedIds])

  const ranking = useMemo(
    () => (defaultOrder === null ? [] : reconcileRanking(stored, defaultOrder, selectedIds)),
    [stored, defaultOrder, selectedIds],
  )
  const rankingKey = ranking.join(',')

  useEffect(() => {
    if (ranking.length === 0) {
      setEntries([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const timer = setTimeout(() => {
      getFixtureDifficulty(ranking)
        .then(setEntries)
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false))
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- rankingKey stands in for the ranking array identity
  }, [rankingKey, selectedSeasonId, selectedIds])

  const handleReorder = (ids: number[]) => {
    const next = mergeVisibleOrder(stored, ids)
    setStored(next)
    saveRanking(next)
  }

  const handleReset = () => {
    setStored([])
    clearRanking()
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Fixture Difficulty</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Rank the players how you rate them. Each game is judged only by those ranks (scores are ignored): add up the
          ranks on each team, and the side with the lower total is favoured. A gap of 1 or less is even.
          Net difficulty = (favourable − underdog) ÷ games, so positive means easier games. Strong players are favoured
          more often by default, so “vs expected” compares each player with what a random draw would give their rank.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_1fr]">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Your ranking</CardTitle>
            <Button variant="outline" size="sm" onClick={handleReset} disabled={stored.length === 0}>
              Reset
            </Button>
          </CardHeader>
          <CardContent>
            {defaultOrder === null && !error && <p className="text-sm text-muted-foreground">Loading…</p>}
            {ranking.length > 0 && <RankingList ids={ranking} playerNames={playerNames} onReorder={handleReorder} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Game difficulty</CardTitle>
          </CardHeader>
          <CardContent>
            {error && <p className="text-destructive">{error}</p>}
            {!error && (
              <div className={loading ? 'pointer-events-none opacity-50 transition-opacity' : 'transition-opacity'}>
                <FixtureDifficultyTable entries={entries} playerNames={playerNames} />
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
