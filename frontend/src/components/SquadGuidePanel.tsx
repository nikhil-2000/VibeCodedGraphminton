import { useState, useEffect } from 'react'
import { getPartnershipAnomaliesForPlayer, getHeadToHeadAnomaliesForPlayer } from '../api/anomalies'
import type { AnomalyEntry, Player } from '../types'

interface SlotProps {
  label: string
  playerName: string | undefined
  seek: boolean
}

function Slot({ label, playerName, seek }: SlotProps) {
  const bg = seek ? 'bg-green-950/60 border-green-900/50' : 'bg-red-950/60 border-red-900/50'
  const nameColor = seek ? 'text-green-100' : 'text-red-100'
  const labelColor = seek ? 'text-green-500' : 'text-red-500'
  return (
    <div className={`rounded-md border px-3 py-2 ${bg}`}>
      <p className={`mb-1 text-[10px] font-semibold uppercase tracking-wider ${labelColor}`}>{label}</p>
      <p className={`text-sm font-semibold ${playerName ? nameColor : 'text-muted-foreground'}`}>
        {playerName ?? '—'}
      </p>
    </div>
  )
}

interface PlayerCardProps {
  player: Player
  attendingIds: number[]
  playerNames: Record<number, string>
}

function PlayerCard({ player, attendingIds, playerNames }: PlayerCardProps) {
  const [partnerships, setPartnerships] = useState<AnomalyEntry[]>([])
  const [headToHead, setHeadToHead] = useState<AnomalyEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setFetchError(false)
    Promise.all([
      getPartnershipAnomaliesForPlayer(player.id),
      getHeadToHeadAnomaliesForPlayer(player.id),
    ]).then(([p, h]) => {
      setPartnerships(p)
      setHeadToHead(h)
    }).catch(() => setFetchError(true))
    .finally(() => setLoading(false))
  }, [player.id])

  const pick = (entries: AnomalyEntry[], seek: boolean) => {
    const filtered = seek
      ? entries.filter((e) => e.deviation < 0)
      : entries.filter((e) => e.deviation > 0)
    for (const e of filtered) {
      const otherId = e.player_a_id === player.id ? e.player_b_id : e.player_a_id
      if (attendingIds.includes(otherId)) return playerNames[otherId]
    }
    return undefined
  }

  return (
    <div className={`rounded-xl border border-border bg-card p-4 transition-opacity ${loading ? 'opacity-50' : ''}`}>
      <p className="mb-3 text-base font-bold text-foreground">{player.canonical_name}</p>
      {fetchError ? (
        <p className="text-xs text-destructive">Failed to load recommendations.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Slot label="Play with" playerName={pick(partnerships, true)} seek={true} />
          <Slot label="Play against" playerName={pick(headToHead, true)} seek={true} />
          <Slot label="Avoid with" playerName={pick(partnerships, false)} seek={false} />
          <Slot label="Avoid against" playerName={pick(headToHead, false)} seek={false} />
        </div>
      )}
    </div>
  )
}

interface Props {
  attendingPlayers: Player[]
  playerNames: Record<number, string>
}

export default function SquadGuidePanel({ attendingPlayers, playerNames }: Props) {
  const attendingIds = attendingPlayers.map((p) => p.id)

  if (attendingPlayers.length === 0) {
    return (
      <div>
        <h2 className="mb-3 text-lg font-semibold">Squad Guide</h2>
        <p className="text-sm text-muted-foreground">No players selected.</p>
      </div>
    )
  }

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold">Squad Guide</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Play patterns based on historical data — filtered to attending players only.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {attendingPlayers.map((p) => (
          <PlayerCard
            key={p.id}
            player={p}
            attendingIds={attendingIds}
            playerNames={playerNames}
          />
        ))}
      </div>
    </div>
  )
}
