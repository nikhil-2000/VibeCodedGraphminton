from pydantic import BaseModel
from typing import Optional


class PlayerCreate(BaseModel):
    canonical_name: str
    is_sub: bool = False
    aliases: list[str] = []


class PlayerUpdate(BaseModel):
    canonical_name: Optional[str] = None
    is_sub: Optional[bool] = None
    add_aliases: list[str] = []
    remove_aliases: list[str] = []


class AliasResponse(BaseModel):
    id: int
    alias: str
    model_config = {"from_attributes": True}


class PlayerResponse(BaseModel):
    id: int
    canonical_name: str
    is_sub: bool
    aliases: list[AliasResponse]
    model_config = {"from_attributes": True}


# ── Stats ──────────────────────────────────────────────────────────────────

class PlayerStatsResponse(BaseModel):
    player_id: int
    games_played: int
    wins: int
    losses: int
    win_rate: float
    avg_points: float


class LeaderboardEntry(BaseModel):
    player_id: int
    canonical_name: str
    games_played: int
    wins: int
    losses: int
    win_rate: float
    avg_points: float


class PartnershipResponse(BaseModel):
    player_a_id: int
    player_b_id: int
    games_together: int
    wins: int
    losses: int
    win_rate: float


class PlayerPartnershipResponse(BaseModel):
    partner_id: int
    games_together: int
    wins: int
    losses: int
    win_rate: float


class HeadToHeadResponse(BaseModel):
    player_a_id: int
    player_b_id: int
    games_played: int
    player_a_wins: int
    player_b_wins: int


class MatchupResponse(BaseModel):
    pair_a: list[int]
    pair_b: list[int]
    games_played: int
    pair_a_wins: int
    pair_b_wins: int


# ── Games ──────────────────────────────────────────────────────────────────

class GamePlayerRef(BaseModel):
    id: int
    canonical_name: str


class GameResponse(BaseModel):
    id: int
    played_on: str
    session: int | None
    game_number: int
    team_a_score: int
    team_b_score: int


class GameDetailResponse(GameResponse):
    team_a: list[GamePlayerRef]
    team_b: list[GamePlayerRef]


# ── Anomalies ──────────────────────────────────────────────────────────────

class AnomalyEntry(BaseModel):
    player_a_id: int
    player_b_id: int
    actual: int
    expected: float
    deviation: float
