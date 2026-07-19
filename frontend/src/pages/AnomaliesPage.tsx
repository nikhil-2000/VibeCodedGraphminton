import { useState, useEffect, useRef } from 'react'
import {
  getPartnershipAnomalies,
  getHeadToHeadAnomalies,
  getPartnershipAnomaliesForPlayer,
  getHeadToHeadAnomaliesForPlayer,
} from '../api/anomalies'
import { getPlayers } from '../api/players'
import { usePlayerFilter } from '../context/PlayerFilterContext'
import { useSeasonFilter } from '../context/SeasonFilterContext'
import AnomalyTable from '../components/AnomalyTable'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import type { AnomalyEntry } from '../types'

type Tab = 'partnerships' | 'head-to-head'
type Direction = 'overplayed' | 'underplayed'

export default function AnomaliesPage() {
  const { selectedIds } = usePlayerFilter()
  const { selectedSeasonId } = useSeasonFilter()
  const [tab, setTab] = useState<Tab>('partnerships')
  const [direction, setDirection] = useState<Direction>('overplayed')
  const [entries, setEntries] = useState<AnomalyEntry[]>([])
  const [playerNames, setPlayerNames] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [focusedPlayerId, setFocusedPlayerId] = useState<number | null>(null)
  const [summary, setSummary] = useState<{
    moreWith: [number, number][]
    lessWith: [number, number][]
    moreAgainst: [number, number][]
    lessAgainst: [number, number][]
  } | null>(null)
  const summaryAbort = useRef<AbortController | null>(null)

  useEffect(() => {
    getPlayers().then((players) =>
      setPlayerNames(Object.fromEntries(players.map((p) => [p.id, p.canonical_name])))
    )
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    const promise = focusedPlayerId !== null
      ? (tab === 'partnerships'
          ? getPartnershipAnomaliesForPlayer(focusedPlayerId, direction, selectedIds, selectedSeasonId)
          : getHeadToHeadAnomaliesForPlayer(focusedPlayerId, direction, selectedIds, selectedSeasonId))
      : (tab === 'partnerships'
          ? getPartnershipAnomalies(direction, 20, selectedIds, selectedSeasonId)
          : getHeadToHeadAnomalies(direction, 20, selectedIds, selectedSeasonId))
    promise
      .then(setEntries)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [tab, direction, selectedIds, selectedSeasonId, focusedPlayerId])

  useEffect(() => {
    summaryAbort.current?.abort()
    const ctrl = new AbortController()
    summaryAbort.current = ctrl
    const pair = (e: AnomalyEntry): [number, number] => [e.player_a_id, e.player_b_id]
    const partnerOf = (id: number) => (e: AnomalyEntry): [number, number] =>
      [id, e.player_a_id === id ? e.player_b_id : e.player_a_id]
    Promise.all(
      focusedPlayerId !== null
        ? [
            getPartnershipAnomaliesForPlayer(focusedPlayerId, 'underplayed', selectedIds, selectedSeasonId),
            getPartnershipAnomaliesForPlayer(focusedPlayerId, 'overplayed', selectedIds, selectedSeasonId),
            getHeadToHeadAnomaliesForPlayer(focusedPlayerId, 'underplayed', selectedIds, selectedSeasonId),
            getHeadToHeadAnomaliesForPlayer(focusedPlayerId, 'overplayed', selectedIds, selectedSeasonId),
          ]
        : [
            getPartnershipAnomalies('underplayed', 3, selectedIds, selectedSeasonId),
            getPartnershipAnomalies('overplayed', 3, selectedIds, selectedSeasonId),
            getHeadToHeadAnomalies('underplayed', 3, selectedIds, selectedSeasonId),
            getHeadToHeadAnomalies('overplayed', 3, selectedIds, selectedSeasonId),
          ]
    ).then(([moreWith, lessWith, moreAgainst, lessAgainst]) => {
      if (ctrl.signal.aborted) return
      const toIds = focusedPlayerId !== null ? partnerOf(focusedPlayerId) : pair
      setSummary({
        moreWith: moreWith.slice(0, 3).map(toIds),
        lessWith: lessWith.slice(0, 3).map(toIds),
        moreAgainst: moreAgainst.slice(0, 3).map(toIds),
        lessAgainst: lessAgainst.slice(0, 3).map(toIds),
      })
    }).catch(() => {})
  }, [focusedPlayerId, selectedIds, selectedSeasonId])

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Anomalies</h1>

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
            {Object.entries(playerNames)
              .sort(([, a], [, b]) => a.localeCompare(b))
              .map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <p className="mb-4 text-xs text-muted-foreground">
        Deviation = actual − expected (based on random pairing probability).
        {direction === 'overplayed'
          ? ' Positive = more frequent than random chance.'
          : ' Negative = less frequent than random chance.'}
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
        <div className="ml-auto flex items-center gap-2">
          {(['overplayed', 'underplayed'] as Direction[]).map((d) => (
            <Button
              key={d}
              variant={direction === d ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setDirection(d)}
              className="capitalize"
            >
              {d}
            </Button>
          ))}
        </div>
      </div>

      {summary && (
        <div className="mb-4 rounded-lg border p-4 text-sm space-y-1">
          {(focusedPlayerId !== null
            ? [
                { label: 'Play more with', pairs: summary.moreWith },
                { label: 'Play less with', pairs: summary.lessWith },
                { label: 'Face more', pairs: summary.moreAgainst },
                { label: 'Face less', pairs: summary.lessAgainst },
              ]
            : [
                { label: 'Most underplayed partnerships', pairs: summary.moreWith },
                { label: 'Most overplayed partnerships', pairs: summary.lessWith },
                { label: 'Most underplayed head-to-head', pairs: summary.moreAgainst },
                { label: 'Most overplayed head-to-head', pairs: summary.lessAgainst },
              ]
          ).filter(({ pairs }) => pairs.length > 0).map(({ label, pairs }) => (
            <p key={label}>
              <span className="text-muted-foreground">{label}: </span>
              {pairs.map(([a, b]) =>
                focusedPlayerId !== null
                  ? (playerNames[b] ?? `#${b}`)
                  : `${playerNames[a] ?? `#${a}`} & ${playerNames[b] ?? `#${b}`}`
              ).join(', ')}
            </p>
          ))}
        </div>
      )}

      {loading && entries.length === 0 && <p className="text-muted-foreground">Loading…</p>}
      {error && <p className="text-destructive">{error}</p>}
      {!error && entries.length > 0 && <AnomalyTable entries={entries} playerNames={playerNames} />}
    </div>
  )
}
