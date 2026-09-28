import { useState, useEffect } from 'react'
import {
  getPartnershipAnomalies,
  getHeadToHeadAnomalies,
  getPartnershipAnomaliesForPlayer,
  getHeadToHeadAnomaliesForPlayer,
  getImbalanceTrend,
} from '../api/anomalies'
import { getSuggestedGames } from '../api/stats'
import { usePlayerFilter } from '../context/PlayerFilterContext'
import { useSeasonFilter } from '../context/SeasonFilterContext'
import { useCurrentUser } from '../context/CurrentUserContext'
import AnomalyTable from '../components/AnomalyTable'
import SquadGuidePanel from '../components/SquadGuidePanel'
import ImbalanceTrendCard from '../components/ImbalanceTrendCard'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { SuggestedGame, ImbalanceTrendPoint } from '../types'

type Tab = 'partnerships' | 'head-to-head'
type Direction = 'overplayed' | 'underplayed'

export default function AnomaliesPage() {
  const { selectedIds, allPlayers } = usePlayerFilter()
  const { selectedSeasonId } = useSeasonFilter()
  const { isAdmin } = useCurrentUser()
  const [tab, setTab] = useState<Tab>('partnerships')
  const [direction] = useState<Direction>('overplayed')
  const [entries, setEntries] = useState<import('../types').AnomalyEntry[]>([])
  const [overEntries, setOverEntries] = useState<import('../types').AnomalyEntry[]>([])
  const [underEntries, setUnderEntries] = useState<import('../types').AnomalyEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [focusedPlayerId, setFocusedPlayerId] = useState<number | null>(null)
  const [suggestedGames, setSuggestedGames] = useState<SuggestedGame[]>([])
  const [suggestionsLoading, setSuggestionsLoading] = useState(true)
  const [trendData, setTrendData] = useState<ImbalanceTrendPoint[]>([])
  const [trendLoading, setTrendLoading] = useState(true)

  const filteredPlayers = allPlayers.filter((p) => selectedIds.includes(p.id))
  const playerNames = Object.fromEntries(allPlayers.map((p) => [p.id, p.canonical_name]))

  useEffect(() => {
    if (focusedPlayerId !== null && !selectedIds.includes(focusedPlayerId)) {
      setFocusedPlayerId(null)
    }
  }, [selectedIds, focusedPlayerId])

  useEffect(() => {
    setSuggestionsLoading(true)
    getSuggestedGames(5, focusedPlayerId ?? undefined)
      .then(setSuggestedGames)
      .finally(() => setSuggestionsLoading(false))
  }, [focusedPlayerId])

  useEffect(() => {
    setTrendLoading(true)
    getImbalanceTrend(10)
      .then(setTrendData)
      .finally(() => setTrendLoading(false))
  }, [selectedSeasonId, selectedIds])

  useEffect(() => {
    setLoading(true)
    setError(null)
    if (focusedPlayerId !== null) {
      const fetcher = tab === 'partnerships' ? getPartnershipAnomaliesForPlayer : getHeadToHeadAnomaliesForPlayer
      fetcher(focusedPlayerId)
        .then((all) => setEntries([...all].sort((a, b) => b.deviation - a.deviation)))
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false))
    } else {
      const fetcher = tab === 'partnerships' ? getPartnershipAnomalies : getHeadToHeadAnomalies
      Promise.all([
        fetcher('overplayed', 10),
        fetcher('underplayed', 10),
      ])
        .then(([over, under]) => { setOverEntries(over); setUnderEntries(under) })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false))
    }
  }, [tab, direction, focusedPlayerId])

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Fixtures</h1>

      <div className="mb-4">
        <Select
          value={focusedPlayerId !== null ? String(focusedPlayerId) : 'all'}
          onValueChange={(v) => setFocusedPlayerId(v === 'all' ? null : Number(v))}
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <span>
              {focusedPlayerId === null
                ? 'All players'
                : (playerNames[focusedPlayerId] ?? 'Player')}
            </span>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All players</SelectItem>
            {[...filteredPlayers]
              .sort((a, b) => a.canonical_name.localeCompare(b.canonical_name))
              .map((p) => (
                <SelectItem key={p.id} value={String(p.id)}>{p.canonical_name}</SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        Deviation = actual − expected (based on random pairing probability).
        {focusedPlayerId !== null
          ? ' Positive = more frequent, negative = less frequent than random chance.'
          : ' Positive = more frequent, negative = less frequent than random chance.'}
      </p>

      <div className="mb-4 flex gap-2">
        {(['partnerships', 'head-to-head'] as Tab[]).map((t) => (
          <Button
            key={t}
            variant={tab === t ? 'default' : 'outline'}
            size="sm"
            onClick={() => setTab(t)}
            className="capitalize"
          >
            {t}
          </Button>
        ))}
      </div>

      {error && <p className="text-destructive">{error}</p>}
      {!error && (
        <div className={loading ? 'pointer-events-none opacity-50 transition-opacity' : 'transition-opacity'}>
          {focusedPlayerId !== null && (
            <AnomalyTable entries={entries} playerNames={playerNames} focusedPlayerId={focusedPlayerId} />
          )}
          {focusedPlayerId === null && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <h2 className="mb-3 text-sm font-semibold text-green-500">Overplayed</h2>
                <AnomalyTable entries={overEntries} playerNames={playerNames} />
              </div>
              <div>
                <h2 className="mb-3 text-sm font-semibold text-red-500">Underplayed</h2>
                <AnomalyTable entries={underEntries} playerNames={playerNames} />
              </div>
            </div>
          )}
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Suggested Games</CardTitle>
          <p className="text-xs text-muted-foreground">Games that address the most underplayed pairings and matchups.</p>
        </CardHeader>
        <CardContent>
          {suggestionsLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
          {!suggestionsLoading && suggestedGames.length === 0 && (
            <p className="text-sm text-muted-foreground">No suggestions available.</p>
          )}
          {!suggestionsLoading && suggestedGames.length > 0 && (
            <div className="space-y-4">
              {suggestedGames.map((g, i) => (
                <div key={i} className="rounded-lg border p-3">
                  <p className="font-medium">
                    {g.team_a.join(' & ')}
                    <span className="mx-2 text-muted-foreground">vs</span>
                    {g.team_b.join(' & ')}
                  </p>
                  {g.fixes.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {g.fixes.map((fix, j) => (
                        <span key={j} className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                          {fix}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {focusedPlayerId === null && (
        <div className="mt-8">
          <SquadGuidePanel attendingPlayers={filteredPlayers} playerNames={playerNames} />
        </div>
      )}

      {isAdmin && (
        <>
          <ImbalanceTrendCard
            data={trendData}
            loading={trendLoading}
            title="Partnership Imbalance Trend"
            subtitle="Cumulative Σdeviation² / games for partnerships — lower means more uniform."
            dataKey="partnership_score"
            color="var(--chart-1)"
          />
          <ImbalanceTrendCard
            data={trendData}
            loading={trendLoading}
            title="Head-to-Head Imbalance Trend"
            subtitle="Cumulative Σdeviation² / games for head-to-head matchups — lower means more uniform."
            dataKey="head_to_head_score"
            color="var(--chart-2)"
          />
        </>
      )}
    </div>
  )
}
