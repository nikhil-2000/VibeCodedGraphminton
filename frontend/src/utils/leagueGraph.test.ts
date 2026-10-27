import { describe, it, expect } from 'vitest'
import { leagueEdges, leagueLeaderboard } from './leagueGraph'
import type { GameDetail } from '../types'

const p = (id: number) => ({ id, canonical_name: `P${id}` })
const game = (id: number, a: number[], b: number[], sa: number, sb: number): GameDetail => ({
  id, played_on: '2024-04-08', session: 1, season_id: 1, game_number: id,
  team_a_score: sa, team_b_score: sb, team_a: a.map(p), team_b: b.map(p),
})

describe('leagueEdges', () => {
  it('adds 2 with-edges and 4 against-edges per game', () => {
    const edges = leagueEdges([game(1, [1, 2], [3, 4], 21, 10)])
    expect(edges.filter((e) => e.kind === 'with')).toHaveLength(2)
    expect(edges.filter((e) => e.kind === 'against')).toHaveLength(4)
  })

  it('merges repeats and remembers the game that created the edge', () => {
    const edges = leagueEdges([game(1, [1, 2], [3, 4], 21, 10), game(2, [2, 1], [4, 5], 21, 10)])
    const pair = edges.find((e) => e.kind === 'with' && e.a === 1 && e.b === 2)!
    expect(pair.count).toBe(2)
    expect(pair.born).toBe(0)
    expect(edges.find((e) => e.kind === 'against' && e.b === 5)!.born).toBe(1)
  })
})

describe('leagueLeaderboard', () => {
  it('uses own-team points and wins', () => {
    const lb = leagueLeaderboard([game(1, [1, 2], [3, 4], 21, 10), game(2, [1, 3], [2, 4], 15, 21)])
    const p1 = lb.find((e) => e.player_id === 1)!
    expect(p1).toMatchObject({ games_played: 2, wins: 1, losses: 1, win_rate: 0.5, avg_points: 18 })
    expect(lb[0].player_id).toBe(2) // 21 + 21 avg
  })
})
