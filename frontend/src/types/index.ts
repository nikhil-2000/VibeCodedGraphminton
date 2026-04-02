export interface Player {
  id: number
  canonical_name: string
  is_sub: boolean
  aliases: string[]
}

export interface PlayerStats {
  player_id: number
  games_played: number
  wins: number
  losses: number
  win_rate: number
  avg_points: number
}

export interface LeaderboardEntry extends PlayerStats {
  canonical_name: string
}

export interface Partnership {
  player_a_id: number
  player_b_id: number
  games_together: number
  wins: number
  losses: number
  win_rate: number
}

export interface PlayerPartnership {
  partner_id: number
  games_together: number
  wins: number
  losses: number
  win_rate: number
}

export interface HeadToHead {
  player_a_id: number
  player_b_id: number
  games_played: number
  player_a_wins: number
  player_b_wins: number
}

export interface Game {
  id: number
  played_on: string
  session: number | null
  game_number: number
  team_a_score: number
  team_b_score: number
}

export interface GameDetail extends Game {
  team_a: { id: number; canonical_name: string }[]
  team_b: { id: number; canonical_name: string }[]
}

export interface AnomalyEntry {
  player_a_id: number
  player_b_id: number
  actual: number
  expected: number
  deviation: number
}

export interface IngestResult {
  ingested: number
  errors: string[]
}
