import { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { getPlayer, getPlayerStats, getPlayerPartnerships, deletePlayer, updatePlayer } from '../api/players'
import { getHeadToHeadAll, getLeaderboard, getPairingsFaced, getVsPairingsLeaderboard } from '../api/stats'
import { getPartnershipAnomaliesForPlayer, getHeadToHeadAnomaliesForPlayer } from '../api/anomalies'
import GameCard from '../components/GameCard'
import PairingsFacedCard from '../components/PairingsFacedCard'
import { usePlayerFilter } from '../context/PlayerFilterContext'
import { useFilteredGames } from '../hooks/useFilteredGames'
import StatCard from '../components/StatCard'
import PartnershipTable from '../components/PartnershipTable'
import SkewPill from '../components/SkewPill'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import LeaderboardTable from '../components/LeaderboardTable'
import type { Player, PlayerStats, PlayerPartnership, HeadToHeadRecord, GameDetail, PairingsFacedEntry, LeaderboardEntry, VsPairingsLeaderboardEntry } from '../types'

export default function PlayerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const playerId = Number(id)

  const navigate = useNavigate()
  const { allPlayers, reloadPlayers } = usePlayerFilter()

  const [player, setPlayer] = useState<Player | null>(null)
  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [partnerships, setPartnerships] = useState<PlayerPartnership[]>([])
  const [h2hRecords, setH2hRecords] = useState<HeadToHeadRecord[]>([])
  const [pairingsFaced, setPairingsFaced] = useState<PairingsFacedEntry[]>([])
  const [partnerAnomalyMap, setPartnerAnomalyMap] = useState<Record<number, 'over' | 'under'>>({})
  const [opponentAnomalyMap, setOpponentAnomalyMap] = useState<Record<number, 'over' | 'under'>>({})
  const { games } = useFilteredGames({ player_id: playerId })
  const { games: allGames } = useFilteredGames()
  const [topIds, setTopIds] = useState<Set<number>>(new Set())
  const [bottomIds, setBottomIds] = useState<Set<number>>(new Set())
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([])
  const [error, setError] = useState<string | null>(null)

  type LeaderboardKind = 'games' | 'wins' | 'losses' | 'win_rate' | 'avg_points' | 'close' | 'normal' | 'blowout' | 'vs_top3' | 'vs_bottom3'
  const [statsDialog, setStatsDialog] = useState<LeaderboardKind | null>(null)
  const [closenessLeaderboard, setClosenessLeaderboard] = useState<LeaderboardEntry[]>([])
  const [closenessLeaderboardError, setClosenessLeaderboardError] = useState<string | null>(null)
  const [vsLeaderboard, setVsLeaderboard] = useState<VsPairingsLeaderboardEntry[]>([])
  const [vsLeaderboardError, setVsLeaderboardError] = useState<string | null>(null)
  const [vsSort, setVsSort] = useState<'games_faced' | 'win_rate'>('games_faced')
  const [closenessSort, setClosenessSort] = useState<'win_rate' | 'avg_points'>('win_rate')

  const playerNames = Object.fromEntries(allPlayers.map((p) => [p.id, p.canonical_name]))

  // delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // edit dialog
  const [editOpen, setEditOpen] = useState(false)
  const [editIsSub, setEditIsSub] = useState(false)
  const [aliasInput, setAliasInput] = useState('')
  const [pendingAliases, setPendingAliases] = useState<string[]>([])
  const [removedAliases, setRemovedAliases] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      getPlayer(playerId),
      getPlayerStats(playerId),
      getPlayerPartnerships(playerId),
      getHeadToHeadAll(playerId),
      getPartnershipAnomaliesForPlayer(playerId, 'overplayed'),
      getPartnershipAnomaliesForPlayer(playerId, 'underplayed'),
      getHeadToHeadAnomaliesForPlayer(playerId, 'overplayed'),
      getHeadToHeadAnomaliesForPlayer(playerId, 'underplayed'),
      getLeaderboard('avg_points'),
      getPairingsFaced(playerId),
    ])
      .then(([p, s, partners, h2h, partnerOver, partnerUnder, oppOver, oppUnder, lb, faced]) => {
        setPlayer(p)
        setStats(s)
        setPartnerships(partners)
        setH2hRecords(h2h)

        const pMap: Record<number, 'over' | 'under'> = {}
        for (const e of partnerUnder) {
          const id = e.player_a_id === playerId ? e.player_b_id : e.player_a_id
          pMap[id] = 'under'
        }
        for (const e of partnerOver) {
          const id = e.player_a_id === playerId ? e.player_b_id : e.player_a_id
          pMap[id] = 'over'
        }
        setPartnerAnomalyMap(pMap)

        const oMap: Record<number, 'over' | 'under'> = {}
        for (const e of oppUnder) {
          const id = e.player_a_id === playerId ? e.player_b_id : e.player_a_id
          oMap[id] = 'under'
        }
        for (const e of oppOver) {
          const id = e.player_a_id === playerId ? e.player_b_id : e.player_a_id
          oMap[id] = 'over'
        }
        setOpponentAnomalyMap(oMap)

        const others = lb.filter((e) => e.player_id !== playerId)
        const third = Math.ceil(others.length / 3)
        setTopIds(new Set(others.slice(0, third).map((e) => e.player_id)))
        setBottomIds(new Set(others.slice(others.length - third).map((e) => e.player_id)))
        setLeaderboard(lb)
        setPairingsFaced(faced)
      })
      .catch((e: Error) => setError(e.message))
  }, [playerId])

  const openEdit = () => {
    if (!player) return
    setEditIsSub(player.is_sub)
    setPendingAliases([])
    setRemovedAliases([])
    setAliasInput('')
    setSaveError(null)
    setEditOpen(true)
  }

  const addAlias = () => {
    const trimmed = aliasInput.trim()
    if (!trimmed || pendingAliases.includes(trimmed)) return
    setPendingAliases((prev) => [...prev, trimmed])
    setAliasInput('')
  }

  const removeExistingAlias = (alias: string) => {
    setRemovedAliases((prev) =>
      prev.includes(alias) ? prev.filter((a) => a !== alias) : [...prev, alias]
    )
  }

  const removePendingAlias = (alias: string) => {
    setPendingAliases((prev) => prev.filter((a) => a !== alias))
  }

  const handleSave = async () => {
    if (!player) return
    setSaving(true)
    setSaveError(null)
    try {
      const updated = await updatePlayer(playerId, {
        is_sub: editIsSub,
        add_aliases: pendingAliases,
        remove_aliases: removedAliases,
      })
      setPlayer(updated)
      reloadPlayers()
      setEditOpen(false)
    } catch (e) {
      setSaveError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = () => {
    setDeleting(true)
    setDeleteError(null)
    deletePlayer(playerId)
      .then(() => { reloadPlayers(); navigate('/players') })
      .catch((e: Error) => { setDeleteError(e.message); setDeleting(false) })
  }

  const getClosenessGameIds = (bucket: 'close' | 'normal' | 'blowout') =>
    allGames
      .filter((g) => {
        const gap = Math.abs(g.team_a_score - g.team_b_score)
        const b = gap <= 3 ? 'close' : gap <= 6 ? 'normal' : 'blowout'
        return b === bucket
      })
      .map((g) => g.id)

  const fetchClosenessLeaderboard = (bucket: 'close' | 'normal' | 'blowout', sort: 'win_rate' | 'avg_points') => {
    setClosenessLeaderboardError(null)
    setClosenessLeaderboard([])
    getLeaderboard(sort, getClosenessGameIds(bucket))
      .then(setClosenessLeaderboard)
      .catch(() => setClosenessLeaderboardError('Failed to load leaderboard'))
  }

  const openClosenessDialog = (bucket: 'close' | 'normal' | 'blowout') => {
    setClosenessSort('win_rate')
    fetchClosenessLeaderboard(bucket, 'win_rate')
    setStatsDialog(bucket)
  }

  const gameCloseness = games.reduce(
    (acc, g) => {
      const onTeamA = g.team_a.some((p) => p.id === playerId)
      const won = onTeamA ? g.team_a_score > g.team_b_score : g.team_b_score > g.team_a_score
      const gap = Math.abs(g.team_a_score - g.team_b_score)
      const bucket = gap <= 3 ? 'close' : gap <= 6 ? 'normal' : 'blowout'
      acc[bucket].wins += won ? 1 : 0
      acc[bucket].losses += won ? 0 : 1
      return acc
    },
    {
      close: { wins: 0, losses: 0 },
      normal: { wins: 0, losses: 0 },
      blowout: { wins: 0, losses: 0 },
    }
  )

  const lbOthers = leaderboard.filter((e) => e.player_id !== playerId)
  const top3Entries = lbOthers.slice(0, 3)
  const bottom3Entries = lbOthers.slice(-3)
  const top3Ids = new Set(top3Entries.map((e) => e.player_id))
  const bottom3Ids = new Set(bottom3Entries.map((e) => e.player_id))
  const top3Names = top3Entries.map((e) => e.canonical_name).join(', ')
  const bottom3Names = bottom3Entries.map((e) => e.canonical_name).join(', ')
  const totalFacedGames = pairingsFaced.reduce((sum, e) => sum + e.games_faced, 0)
  const vsTop3Games = pairingsFaced
    .filter((e) => top3Ids.has(e.pair_player_a_id) && top3Ids.has(e.pair_player_b_id))
    .reduce((sum, e) => sum + e.games_faced, 0)
  const vsBottom3Games = pairingsFaced
    .filter((e) => bottom3Ids.has(e.pair_player_a_id) && bottom3Ids.has(e.pair_player_b_id))
    .reduce((sum, e) => sum + e.games_faced, 0)
  const vsTop3Pct = totalFacedGames > 0 ? `${((vsTop3Games / totalFacedGames) * 100).toFixed(1)}%` : '—'
  const vsBottom3Pct = totalFacedGames > 0 ? `${((vsBottom3Games / totalFacedGames) * 100).toFixed(1)}%` : '—'

  const top3OverlapsBottom3 = [...top3Ids].some((id) => bottom3Ids.has(id))

  const fetchVsLeaderboard = (kind: 'vs_top3' | 'vs_bottom3', sort: 'games_faced' | 'win_rate') => {
    setVsLeaderboardError(null)
    setVsLeaderboard([])
    const ids = kind === 'vs_top3' ? [...top3Ids] : [...bottom3Ids]
    getVsPairingsLeaderboard(ids, sort)
      .then(setVsLeaderboard)
      .catch(() => setVsLeaderboardError('Failed to load leaderboard'))
  }

  const dialogEntries = useMemo(() => {
    if (!statsDialog || ['close', 'normal', 'blowout', 'vs_top3', 'vs_bottom3'].includes(statsDialog)) return leaderboard
    const sorted = [...leaderboard]
    if (statsDialog === 'games') sorted.sort((a, b) => b.games_played - a.games_played)
    else if (statsDialog === 'wins') sorted.sort((a, b) => b.wins - a.wins)
    else if (statsDialog === 'losses') sorted.sort((a, b) => b.losses - a.losses)
    else if (statsDialog === 'win_rate') sorted.sort((a, b) => b.win_rate - a.win_rate)
    return sorted
  }, [statsDialog, leaderboard])

  const dialogTitles: Record<string, string> = {
    games: 'Games played',
    wins: 'Wins',
    losses: 'Losses',
    win_rate: 'Win rate',
    avg_points: 'Avg points',
    close: 'Close games (≤3)',
    normal: 'Normal games (4–6)',
    blowout: 'Blowout games (7+)',
    vs_top3: 'vs Top 3 pairs — games faced',
    vs_bottom3: 'vs Bottom 3 pairs — games faced',
  }

  if (error) return <p className="text-destructive">{error}</p>
  if (!player || !stats) return <p className="text-muted-foreground">Loading…</p>

  const existingAliases = player.aliases.map((a) => a.alias)

  return (
    <div>
      <div className="mb-2 text-sm text-muted-foreground">
        <Link to="/players" className="hover:text-yellow-400">Players</Link>
        {' / '}
        {player.canonical_name}
      </div>
      <div className="mb-1 flex items-center gap-3">
        <h1 className="text-2xl font-bold">{player.canonical_name}</h1>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
          player.is_sub
            ? 'bg-yellow-500/20 text-yellow-400'
            : 'bg-muted text-muted-foreground'
        }`}>
          {player.is_sub ? 'Sub' : 'Regular'}
        </span>
        <Button variant="outline" size="sm" onClick={openEdit}>Edit</Button>
        <Button variant="destructive" size="sm" onClick={() => { setDeleteError(null); setDeleteOpen(true) }}>
          Delete
        </Button>
      </div>
      {existingAliases.length > 0 && (
        <p className="mb-6 text-sm text-muted-foreground">
          Also known as: {existingAliases.join(', ')}
        </p>
      )}

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatCard label="Games" value={stats.games_played} onLeaderboardClick={() => setStatsDialog('games')} />
        <StatCard label="Wins" value={stats.wins} onLeaderboardClick={() => setStatsDialog('wins')} />
        <StatCard label="Losses" value={stats.losses} onLeaderboardClick={() => setStatsDialog('losses')} />
        <StatCard label="Win Rate" value={`${(stats.win_rate * 100).toFixed(1)}%`} onLeaderboardClick={() => setStatsDialog('win_rate')} />
        <StatCard label="Avg Pts" value={stats.avg_points.toFixed(2)} onLeaderboardClick={() => setStatsDialog('avg_points')} />
        <StatCard label="Close (≤3)" value={`${gameCloseness.close.wins}–${gameCloseness.close.losses}`} sub={`${gameCloseness.close.wins + gameCloseness.close.losses} games`} onLeaderboardClick={() => openClosenessDialog('close')} />
        <StatCard label="Normal (4–6)" value={`${gameCloseness.normal.wins}–${gameCloseness.normal.losses}`} sub={`${gameCloseness.normal.wins + gameCloseness.normal.losses} games`} onLeaderboardClick={() => openClosenessDialog('normal')} />
        <StatCard label="Blowout (7+)" value={`${gameCloseness.blowout.wins}–${gameCloseness.blowout.losses}`} sub={`${gameCloseness.blowout.wins + gameCloseness.blowout.losses} games`} onLeaderboardClick={() => openClosenessDialog('blowout')} />
        <StatCard label="vs Top 3 pair" value={vsTop3Pct} sub={top3Names || undefined} onLeaderboardClick={top3OverlapsBottom3 ? undefined : () => { setVsSort('games_faced'); fetchVsLeaderboard('vs_top3', 'games_faced'); setStatsDialog('vs_top3') }} disabledReason={top3OverlapsBottom3 ? 'Top 3 and Bottom 3 overlap — not enough players for distinct tiers' : undefined} />
        <StatCard label="vs Bottom 3 pair" value={vsBottom3Pct} sub={bottom3Names || undefined} onLeaderboardClick={top3OverlapsBottom3 ? undefined : () => { setVsSort('games_faced'); fetchVsLeaderboard('vs_bottom3', 'games_faced'); setStatsDialog('vs_bottom3') }} disabledReason={top3OverlapsBottom3 ? 'Top 3 and Bottom 3 overlap — not enough players for distinct tiers' : undefined} />
      </div>

      <div className="mb-3 flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-blue-400" /> Overplayed</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-orange-400" /> Underplayed</span>
      </div>

      <Card>
        <CardHeader><CardTitle>Partnerships</CardTitle></CardHeader>
        <CardContent>
          {partnerships.length === 0
            ? <p className="text-muted-foreground">No partnerships yet.</p>
            : (() => {
                let pTop = 0, pMid = 0, pBot = 0
                for (const p of partnerships) {
                  if (topIds.has(p.partner_id)) pTop += p.games_together
                  else if (bottomIds.has(p.partner_id)) pBot += p.games_together
                  else pMid += p.games_together
                }
                return (
                  <>
                    <SkewPill top={pTop} mid={pMid} bottom={pBot} label="Played with" topLabel="Top third" bottomLabel="Bottom third" />
                    <PartnershipTable partnerships={partnerships} playerNames={playerNames} anomalyMap={partnerAnomalyMap} />
                  </>
                )
              })()
          }
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader><CardTitle>Head-to-Head</CardTitle></CardHeader>
        <CardContent>
          {h2hRecords.length === 0
            ? <p className="text-muted-foreground">No head-to-head records yet.</p>
            : (() => {
                let hTop = 0, hMid = 0, hBot = 0
                for (const r of h2hRecords) {
                  if (topIds.has(r.opponent_id)) hTop += r.games_played
                  else if (bottomIds.has(r.opponent_id)) hBot += r.games_played
                  else hMid += r.games_played
                }
                return (
                  <>
                    <SkewPill top={hTop} mid={hMid} bottom={hBot} label="Played against" topLabel="Top third" bottomLabel="Bottom third" />
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-6" />
                            <TableHead>Opponent</TableHead>
                            <TableHead className="text-right">GP</TableHead>
                            <TableHead className="text-right">Win %</TableHead>
                            <TableHead className="text-right">Avg Pts</TableHead>
                            <TableHead className="text-right">W</TableHead>
                            <TableHead className="text-right">L</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {[...h2hRecords]
                            .sort((a, b) => (b.wins / b.games_played) - (a.wins / a.games_played))
                            .map((r) => (
                              <TableRow key={r.opponent_id}>
                                <TableCell className="w-6">
                                  {opponentAnomalyMap[r.opponent_id] && (
                                    <span
                                      className={`inline-block h-2 w-2 rounded-full ${opponentAnomalyMap[r.opponent_id] === 'over' ? 'bg-blue-400' : 'bg-orange-400'}`}
                                      title={opponentAnomalyMap[r.opponent_id] === 'over' ? 'Overplayed' : 'Underplayed'}
                                    />
                                  )}
                                </TableCell>
                                <TableCell className="font-medium">
                                  <Link to={`/players/${r.opponent_id}`} className="hover:text-yellow-400">
                                    {playerNames[r.opponent_id] ?? r.opponent_id}
                                  </Link>
                                </TableCell>
                                <TableCell className="text-right">{r.games_played}</TableCell>
                                <TableCell className="text-right">{(r.wins / r.games_played * 100).toFixed(1)}%</TableCell>
                                <TableCell className="text-right">{r.avg_points.toFixed(2)}</TableCell>
                                <TableCell className="text-right text-green-400">{r.wins}</TableCell>
                                <TableCell className="text-right text-red-400">{r.losses}</TableCell>
                              </TableRow>
                            ))}
                        </TableBody>
                      </Table>
                    </div>
                  </>
                )
              })()
            }
        </CardContent>
      </Card>

      <PairingsFacedCard playerId={playerId} facedEntries={pairingsFaced} />

      <Card className="mt-6">
        <CardHeader><CardTitle>Games</CardTitle></CardHeader>
        <CardContent>
          {games.length === 0
            ? <p className="text-muted-foreground">No games yet.</p>
            : Object.entries(
                games.reduce<Record<string, GameDetail[]>>((acc, g) => {
                  const key = g.session !== null ? `Session ${g.session}` : g.played_on
                  ;(acc[key] ??= []).push(g)
                  return acc
                }, {})
              ).map(([sessionLabel, sessionGames]) => (
                <div key={sessionLabel} className="mb-6 last:mb-0">
                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {sessionLabel} — {sessionGames[0].played_on}
                  </h3>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                    {sessionGames.map((g) => (
                      <GameCard key={g.id} game={g} perspectivePlayerId={playerId} />
                    ))}
                  </div>
                </div>
              ))
          }
        </CardContent>
      </Card>

      {/* Stats leaderboard dialog */}
      <Dialog open={statsDialog !== null} onOpenChange={(open) => { if (!open) setStatsDialog(null) }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{statsDialog ? dialogTitles[statsDialog] : ''}</DialogTitle>
          </DialogHeader>
          {statsDialog && ['vs_top3', 'vs_bottom3'].includes(statsDialog) ? (
            <div>
              <div className="mb-3 flex gap-2">
                {(['games_faced', 'win_rate'] as const).map((s) => (
                  <Button
                    key={s}
                    variant={vsSort === s ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setVsSort(s)
                      fetchVsLeaderboard(statsDialog as 'vs_top3' | 'vs_bottom3', s)
                    }}
                  >
                    {s === 'games_faced' ? 'Games faced' : 'Win rate'}
                  </Button>
                ))}
              </div>
              {vsLeaderboardError ? (
                <p className="text-sm text-destructive">{vsLeaderboardError}</p>
              ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Player</TableHead>
                      <TableHead className="text-right">Games</TableHead>
                      <TableHead className="text-right">Win %</TableHead>
                      <TableHead className="text-right">W</TableHead>
                      <TableHead className="text-right">L</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vsLeaderboard.map((e, i) => (
                      <TableRow key={e.player_id} className={e.player_id === playerId ? 'bg-muted/50' : ''}>
                        <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                        <TableCell className="font-medium">
                          <Link to={`/players/${e.player_id}`} className="hover:text-yellow-400">{e.canonical_name}</Link>
                        </TableCell>
                        <TableCell className="text-right">{e.games_faced}</TableCell>
                        <TableCell className="text-right">{(e.win_rate * 100).toFixed(1)}%</TableCell>
                        <TableCell className="text-right text-green-400">{e.wins}</TableCell>
                        <TableCell className="text-right text-red-400">{e.losses}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              )}
            </div>
          ) : statsDialog && ['close', 'normal', 'blowout'].includes(statsDialog) ? (
            <div>
              <div className="mb-3 flex gap-2">
                {(['win_rate', 'avg_points'] as const).map((s) => (
                  <Button
                    key={s}
                    variant={closenessSort === s ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setClosenessSort(s)
                      fetchClosenessLeaderboard(statsDialog as 'close' | 'normal' | 'blowout', s)
                    }}
                  >
                    {s === 'win_rate' ? 'Win rate' : 'Avg points'}
                  </Button>
                ))}
              </div>
              {closenessLeaderboardError
                ? <p className="text-sm text-destructive">{closenessLeaderboardError}</p>
                : <LeaderboardTable entries={closenessLeaderboard} highlightPlayerId={playerId} />
              }
            </div>
          ) : (
            <LeaderboardTable entries={dialogEntries} highlightPlayerId={playerId} />
          )}
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={(open) => { if (!saving) setEditOpen(open) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit {player.canonical_name}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5">
            {/* is_sub toggle */}
            <div className="flex items-center justify-between">
              <span className="text-sm">Player type</span>
              <div className="flex rounded-md border border-border text-xs">
                <button
                  onClick={() => setEditIsSub(false)}
                  className={`px-3 py-1.5 rounded-l-md transition-colors ${!editIsSub ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/50'}`}
                >
                  Regular
                </button>
                <button
                  onClick={() => setEditIsSub(true)}
                  className={`px-3 py-1.5 rounded-r-md transition-colors ${editIsSub ? 'bg-yellow-500/20 text-yellow-400' : 'text-muted-foreground hover:bg-muted/50'}`}
                >
                  Sub
                </button>
              </div>
            </div>

            {/* existing aliases */}
            <div>
              <p className="mb-2 text-sm font-medium">Aliases</p>
              {existingAliases.length === 0 && pendingAliases.length === 0 && (
                <p className="text-xs text-muted-foreground">No aliases yet.</p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {existingAliases.map((alias) => {
                  const removed = removedAliases.includes(alias)
                  return (
                    <button
                      key={alias}
                      onClick={() => removeExistingAlias(alias)}
                      className={`flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs transition-colors ${
                        removed
                          ? 'bg-destructive/20 text-destructive line-through'
                          : 'bg-muted text-foreground hover:bg-destructive/10 hover:text-destructive'
                      }`}
                      title={removed ? 'Click to restore' : 'Click to remove'}
                    >
                      {alias}
                      <span className="opacity-60">{removed ? '↩' : '×'}</span>
                    </button>
                  )
                })}
                {pendingAliases.map((alias) => (
                  <button
                    key={alias}
                    onClick={() => removePendingAlias(alias)}
                    className="flex items-center gap-1 rounded-full bg-green-500/20 px-2.5 py-0.5 text-xs text-green-400 hover:bg-destructive/10 hover:text-destructive"
                    title="Click to remove"
                  >
                    {alias} <span className="opacity-60">×</span>
                  </button>
                ))}
              </div>
            </div>

            {/* add alias */}
            <div className="flex gap-2">
              <Input
                placeholder="New alias…"
                value={aliasInput}
                onChange={(e) => setAliasInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAlias() } }}
                className="h-8 text-sm"
              />
              <Button variant="outline" size="sm" onClick={addAlias} disabled={!aliasInput.trim()}>
                Add
              </Button>
            </div>

            {saveError && <p className="text-sm text-destructive">{saveError}</p>}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete dialog */}
      <Dialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {player.canonical_name}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This cannot be undone. Players with recorded games cannot be deleted.
          </p>
          {deleteError && <p className="text-sm text-destructive">{deleteError}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
