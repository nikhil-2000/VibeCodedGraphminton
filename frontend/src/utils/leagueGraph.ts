import type { GameDetail, LeaderboardEntry } from '../types'

export type EdgeKind = 'with' | 'against'

export interface LeagueEdge {
  key: string
  a: number
  b: number
  kind: EdgeKind
  count: number
  /** Index (into the games list) of the game that first created this edge. */
  born: number
}

const edgeKey = (kind: EdgeKind, x: number, y: number) => `${kind}:${Math.min(x, y)}-${Math.max(x, y)}`

/**
 * Every game adds a "with" edge inside each team and an "against" edge between
 * each cross-team pair, so one game adds 2 + 4 edges. Repeats bump `count`.
 */
export function leagueEdges(games: GameDetail[]): LeagueEdge[] {
  const edges = new Map<string, LeagueEdge>()
  const add = (kind: EdgeKind, x: number, y: number, born: number) => {
    const key = edgeKey(kind, x, y)
    const existing = edges.get(key)
    if (existing) existing.count += 1
    else edges.set(key, { key, a: Math.min(x, y), b: Math.max(x, y), kind, count: 1, born })
  }
  games.forEach((g, i) => {
    const [a, b] = [g.team_a.map((p) => p.id), g.team_b.map((p) => p.id)]
    for (const team of [a, b]) if (team.length === 2) add('with', team[0], team[1], i)
    for (const x of a) for (const y of b) add('against', x, y, i)
  })
  return [...edges.values()]
}

export function leagueNames(games: GameDetail[]): Record<number, string> {
  const names: Record<number, string> = {}
  for (const g of games) for (const p of [...g.team_a, ...g.team_b]) names[p.id] = p.canonical_name
  return names
}

/** Same definitions as the backend leaderboard: avg_points is the player's own team score. */
export function leagueLeaderboard(games: GameDetail[], sortBy: 'win_rate' | 'avg_points' = 'avg_points'): LeaderboardEntry[] {
  const rows = new Map<number, { name: string; games: number; wins: number; points: number }>()
  for (const g of games) {
    const sides = [
      { team: g.team_a, own: g.team_a_score, opp: g.team_b_score },
      { team: g.team_b, own: g.team_b_score, opp: g.team_a_score },
    ]
    for (const { team, own, opp } of sides) {
      for (const p of team) {
        const row = rows.get(p.id) ?? { name: p.canonical_name, games: 0, wins: 0, points: 0 }
        row.games += 1
        row.wins += own > opp ? 1 : 0
        row.points += own
        rows.set(p.id, row)
      }
    }
  }
  const entries = [...rows].map(([player_id, r]) => ({
    player_id,
    canonical_name: r.name,
    games_played: r.games,
    wins: r.wins,
    losses: r.games - r.wins,
    win_rate: Math.round((r.wins / r.games) * 10000) / 10000,
    avg_points: Math.round((r.points / r.games) * 100) / 100,
  }))
  return entries.sort((x, y) => y[sortBy] - x[sortBy])
}
