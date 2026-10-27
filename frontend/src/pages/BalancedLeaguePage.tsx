import { useEffect, useMemo, useRef, useState } from 'react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { getBalancedLeague } from '../api/balanced-league'
import { useSeasonFilter } from '../context/SeasonFilterContext'
import { usePlayerFilter } from '../context/PlayerFilterContext'
import { useCurrentUser } from '../context/CurrentUserContext'
import BalancedLeagueGraph from '../components/BalancedLeagueGraph'
import LeaderboardTable from '../components/LeaderboardTable'
import GameCard from '../components/GameCard'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { leagueLeaderboard, leagueNames } from '../utils/leagueGraph'
import type { BalancedLeague } from '../types'

const TICK_MS = 350

// Perfect balance runs out fast on real data, so offer looser targets.
const STRICTNESS = [
  { label: 'Perfect', value: 1 },
  { label: '90%', value: 0.9 },
  { label: '75%', value: 0.75 },
  { label: '50%', value: 0.5 },
  { label: '25%', value: 0.25 },
]

export default function BalancedLeaguePage() {
  const { selectedIds } = usePlayerFilter()
  const { selectedSeasonId } = useSeasonFilter()
  const { currentPlayer } = useCurrentUser()
  const [minCoverage, setMinCoverage] = useState(1)
  const [result, setResult] = useState<{ key: string; league: BalancedLeague | null; error: string | null } | null>(null)
  const [shown, setShown] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [sortBy, setSortBy] = useState<'win_rate' | 'avg_points'>('avg_points')
  const requestKey = `${minCoverage}|${selectedSeasonId}|${selectedIds.join(',')}`
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined)

  useEffect(() => {
    getBalancedLeague(minCoverage)
      .then((l) => {
        setResult({ key: requestKey, league: l, error: null })
        // Replay each new league from scratch so the edges visibly build up.
        setShown(0)
        setPlaying(l.games.length > 0)
      })
      .catch((e: Error) => setResult({ key: requestKey, league: null, error: e.message }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- requestKey stands in for the filter values it is built from
  }, [requestKey])

  const loading = result?.key !== requestKey
  const league = result?.league ?? null
  const error = result?.error ?? null

  const total = league?.games.length ?? 0

  useEffect(() => {
    if (!playing) return
    timer.current = setInterval(() => {
      setShown((s) => {
        if (s + 1 >= total) setPlaying(false)
        return Math.min(s + 1, total)
      })
    }, TICK_MS)
    return () => clearInterval(timer.current)
  }, [playing, total])

  const names = useMemo(() => leagueNames(league?.games ?? []), [league])
  const visible = useMemo(() => league?.games.slice(0, shown) ?? [], [league, shown])
  const leaderboard = useMemo(() => leagueLeaderboard(visible, sortBy), [visible, sortBy])

  // Which step the newest revealed game belongs to.
  const stepIndex = useMemo(() => {
    if (!league || shown === 0) return -1
    let seen = 0
    return league.steps.findIndex((s) => (seen += s.game_ids.length) >= shown)
  }, [league, shown])
  const step = league && stepIndex >= 0 ? league.steps[stepIndex] : null
  const done = total > 0 && shown >= total

  const handlePlayPause = () => {
    if (done) setShown(0)
    setPlaying((p) => (done ? true : !p))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Balanced League</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Picks real games so that, for a group of players, every pairing is played: all three ways to split any four
          players into two teams. It starts with the four most active players, then keeps adding whoever completes the
          most new matchups. When no player can be added with full coverage, lower the target to let players in with
          some matchups missing.
        </p>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>Matchup network</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Coverage needed to add a player:</span>
            {STRICTNESS.map((s) => (
              <Button key={s.value} size="sm" variant={minCoverage === s.value ? 'default' : 'outline'} onClick={() => setMinCoverage(s.value)}>
                {s.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {error && <p className="text-destructive">{error}</p>}
          {loading && <p className="text-muted-foreground">Loading…</p>}
          {!loading && !error && total === 0 && (
            <p className="text-muted-foreground">
              No four players have a game for every split at this coverage. Try a lower target.
            </p>
          )}
          {!error && total > 0 && (
            <>
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" variant="outline" onClick={handlePlayPause}>
                  {done ? <RotateCcw size={14} /> : playing ? <Pause size={14} /> : <Play size={14} />}
                  {done ? 'Replay' : playing ? 'Pause' : 'Play'}
                </Button>
                <input
                  type="range"
                  min={0}
                  max={total}
                  value={shown}
                  aria-label="Games shown"
                  onChange={(e) => { setPlaying(false); setShown(Number(e.target.value)) }}
                  className="min-w-40 flex-1 accent-yellow-400"
                />
                <span className="text-xs tabular-nums text-muted-foreground">{shown} / {total} games</span>
              </div>
              <p className="min-h-5 text-sm">
                {step && (
                  <>
                    <span className="font-medium">
                      {stepIndex === 0 ? 'Seed' : '+'} {step.player_ids.map((id) => names[id]).join(', ')}
                    </span>
                    <span className="text-muted-foreground">
                      {' '}· {step.covered}/{step.required} matchups covered
                      {step.coverage < 1 && ' (relaxed)'}
                    </span>
                  </>
                )}
              </p>
              <div className="overflow-hidden rounded-lg border border-border" style={{ height: 520 }}>
                <BalancedLeagueGraph games={visible} names={names} />
              </div>
              <p className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
                <span><span className="text-green-400">━</span> partnered</span>
                <span><span className="text-red-400">┅</span> opposed</span>
                <span><span className="text-yellow-400">━</span> newest game</span>
              </p>
            </>
          )}
        </CardContent>
      </Card>

      {shown > 0 && (
        <>
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
              <LeaderboardTable entries={leaderboard} highlightPlayerId={currentPlayer?.id} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Games</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                {visible.map((g) => (
                  <GameCard key={g.id} game={g} />
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
