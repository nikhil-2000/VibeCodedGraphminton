from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..deps import get_filter_context
from ..services import stats as stats_service
from ..schemas import (
    LeaderboardEntry,
    MatchupQualityEntry,
    PartnershipResponse,
    PlayerPartnershipResponse,
    PlayerStatsResponse,
    HeadToHeadResponse,
    MatchupResponse,
    HeadToHeadBulkEntry,
    SuggestedGame,
)

router = APIRouter()


@router.get("/player/{player_id}", response_model=PlayerStatsResponse)
def player_stats(
    player_id: int,
    filters: tuple = Depends(get_filter_context),
    db: Session = Depends(get_db),
):
    player_ids, season_id = filters
    try:
        return stats_service.get_player_stats(db, player_id, player_ids, season_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/suggested-games", response_model=list[SuggestedGame])
def suggested_games(
    top_n: int = Query(default=5, ge=1, le=20),
    focus_player_id: Optional[int] = Query(default=None),
    filters: tuple = Depends(get_filter_context),
    db: Session = Depends(get_db),
):
    player_ids, season_id = filters
    return stats_service.get_suggested_games(db, player_ids, season_id, top_n, focus_player_id)


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
def leaderboard(
    sort_by: Literal["win_rate", "avg_points"] = "win_rate",
    filters: tuple = Depends(get_filter_context),
    db: Session = Depends(get_db),
):
    player_ids, season_id = filters
    return stats_service.get_leaderboard(db, sort_by, player_ids, season_id)


@router.get("/partnerships", response_model=list[PartnershipResponse])
def all_partnerships(
    filters: tuple = Depends(get_filter_context),
    db: Session = Depends(get_db),
):
    player_ids, season_id = filters
    return stats_service.get_all_partnerships(db, player_ids=player_ids, season_id=season_id)


@router.get("/partnerships/{player_id}", response_model=list[PlayerPartnershipResponse])
def partnerships_for_player(
    player_id: int,
    filters: tuple = Depends(get_filter_context),
    db: Session = Depends(get_db),
):
    player_ids, season_id = filters
    try:
        return stats_service.get_partnership_for_player(db, player_id, player_ids, season_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/partnerships/{player_a_id}/{player_b_id}", response_model=PartnershipResponse)
def specific_partnership(
    player_a_id: int,
    player_b_id: int,
    filters: tuple = Depends(get_filter_context),
    db: Session = Depends(get_db),
):
    player_ids, season_id = filters
    return stats_service.get_specific_partnership(db, player_a_id, player_b_id, player_ids, season_id)


@router.get("/head-to-head/{player_id}/all", response_model=list[HeadToHeadBulkEntry])
def head_to_head_all(
    player_id: int,
    filters: tuple = Depends(get_filter_context),
    db: Session = Depends(get_db),
):
    player_ids, season_id = filters
    return stats_service.get_head_to_head_all(db, player_id, player_ids, season_id)


@router.get("/head-to-head/{player_a_id}/{player_b_id}", response_model=HeadToHeadResponse)
def head_to_head(
    player_a_id: int,
    player_b_id: int,
    filters: tuple = Depends(get_filter_context),
    db: Session = Depends(get_db),
):
    player_ids, season_id = filters
    return stats_service.get_head_to_head(db, player_a_id, player_b_id, player_ids, season_id)


@router.get("/matchup/{pair_a_ids}/vs/{pair_b_ids}", response_model=MatchupResponse)
def matchup(
    pair_a_ids: str,
    pair_b_ids: str,
    filters: tuple = Depends(get_filter_context),
    db: Session = Depends(get_db),
):
    player_ids, season_id = filters
    try:
        a1, a2 = [int(x) for x in pair_a_ids.split(",")]
        b1, b2 = [int(x) for x in pair_b_ids.split(",")]
    except ValueError:
        raise HTTPException(status_code=422, detail="Pair IDs must be comma-separated integers e.g. /1,2/vs/3,4")
    return stats_service.get_matchup(db, (a1, a2), (b1, b2), player_ids, season_id)


@router.get("/matchup-quality", response_model=list[MatchupQualityEntry])
def matchup_quality(
    filters: tuple = Depends(get_filter_context),
    db: Session = Depends(get_db),
):
    player_ids, season_id = filters
    return stats_service.get_matchup_quality(db, player_ids, season_id)
