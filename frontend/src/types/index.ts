// Auto-generated types re-exported from the FastAPI OpenAPI spec.
// To regenerate: run `backend/export_openapi.py` then `npm run generate-types` in frontend/.
import type { components } from "./api.gen";

type Schema = components["schemas"];

export type Season = Schema["SeasonResponse"];
export type SeasonCreate = Schema["SeasonCreate"];
export type SeasonUpdate = Schema["SeasonUpdate"];
export type Player = Schema["PlayerResponse"];
export type PlayerCreate = Schema["PlayerCreate"];
export type PlayerUpdate = Schema["PlayerUpdate"];
export type PlayerStats = Schema["PlayerStatsResponse"];
export type LeaderboardEntry = Schema["LeaderboardEntry"];
export type Partnership = Schema["PartnershipResponse"];
export type PlayerPartnership = Schema["PlayerPartnershipResponse"] & { avg_points: number };
export type HeadToHead = Schema["HeadToHeadResponse"];
export type Matchup = Schema["MatchupResponse"];
export type Game = Schema["GameDetailResponse"];
export type GameDetail = Schema["GameDetailResponse"];
export type AnomalyEntry = Schema["AnomalyEntry"];
export type IngestRequest = Schema["IngestRequest"];
export type IngestResult = Schema["IngestResponse"];

export type MatchupQualityEntry = {
  player_id: number
  canonical_name: string
  games_played: number
  avg_point_diff: number
  avg_team_skill_imbalance: number
  partner_quality: number
  opponent_quality: number
  partner_advantage: number
  blowout_win_pct: number | null
  blowout_games: number
}

export type SuggestedGame = {
  team_a: string[]
  team_b: string[]
  score: number
  fixes: string[]
}

export type HeadToHeadRecord = {
  opponent_id: number
  games_played: number
  wins: number
  losses: number
  avg_points: number
}
