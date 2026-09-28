import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  getPartnershipAnomaliesForPlayer,
  getHeadToHeadAnomaliesForPlayer,
} from '../api/anomalies'
import type { AnomalyEntry, Player } from '../types'

interface SlotProps {
  label: string
  playerName: string | undefined
  seek: boolean
}

function Slot({ label, playerName, seek }: SlotProps) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-medium ${seek ? 'text-green-500' : 'text-red-500'}`}>
        {playerName ?? <span className="text-muted-foreground italic">—</span>}
      </span>
    </div>
  )
}

interface PlayerCardProps {
  player: Player
  attendingIds: number[]
  playerNames: Record<number, string>
}

function PlayerCard({ player, attendingIds, playerNames }: PlayerCardProps) {
  const [partnerUnder, setPartnerUnder] = useState<AnomalyEntry[]>([])
  const [partnerOver, setPartnerOver] = useState<AnomalyEntry[]>([])
  const [h2hUnder, setH2hUnder] = useState<AnomalyEntry[]>([])
  const [h2hOver, setH2hOver] = useState<AnomalyEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState(false)

  useEffect(() => {
    setLoading(true)
    setFetchError(false)
    Promise.all([
      getPartnershipAnomaliesForPlayer(player.id, 'underplayed'),
      getPartnershipAnomaliesForPlayer(player.id, 'overplayed'),
      getHeadToHeadAnomaliesForPlayer(player.id, 'underplayed'),
      getHeadToHeadAnomaliesForPlayer(player.id, 'overplayed'),
    ]).then(([pu, po, hu, ho]) => {
      setPartnerUnder(pu)
      setPartnerOver(po)
      setH2hUnder(hu)
      setH2hOver(ho)
    }).catch(() => setFetchError(true))
    .finally(() => setLoading(false))
  }, [player.id])

  const otherAttending = (e: AnomalyEntry) => {
    const otherId = e.player_a_id === player.id ? e.player_b_id : e.player_a_id
    return attendingIds.includes(otherId) ? otherId : null
  }

  // Pick the top entry where the other player is attending
  const pick = (entries: AnomalyEntry[]) => {
    for (const e of entries) {
      const otherId = otherAttending(e)
      if (otherId !== null) return playerNames[otherId]
    }
    return undefined
  }

  return (
    <Card className={loading ? 'opacity-50 transition-opacity' : 'transition-opacity'}>
      <CardHeader className="pb-2 pt-3">
        <CardTitle className="text-sm">{player.canonical_name}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pb-3">
        {fetchError ? (
          <p className="text-xs text-destructive">Failed to load recommendations.</p>
        ) : (
          <>
            <Slot label="Play with" playerName={pick(partnerUnder)} seek={true} />
            <Slot label="Avoid with" playerName={pick(partnerOver)} seek={false} />
            <Slot label="Play against" playerName={pick(h2hUnder)} seek={true} />
            <Slot label="Avoid against" playerName={pick(h2hOver)} seek={false} />
          </>
        )}
      </CardContent>
    </Card>
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
      <Card>
        <CardHeader>
          <CardTitle>Squad Guide</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No players selected.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Squad Guide</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Fixture recommendations for today's session — filtered to attending players only.
      </p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
