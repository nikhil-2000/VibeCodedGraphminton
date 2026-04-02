from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..services import stats as stats_service
from ..schemas import (
    LeaderboardEntry,
    PartnershipResponse,
    PlayerPartnershipResponse,
    HeadToHeadResponse,
    MatchupResponse,
)

router = APIRouter()


@router.get("/leaderboard", response_model=list[LeaderboardEntry])
def leaderboard(
    sort_by: Literal["win_rate", "avg_points"] = "win_rate",
    db: Session = Depends(get_db),
):
    return stats_service.get_leaderboard(db, sort_by)


@router.get("/partnerships", response_model=list[PartnershipResponse])
def all_partnerships(db: Session = Depends(get_db)):
    return stats_service.get_all_partnerships(db)


@router.get("/partnerships/{player_id}", response_model=list[PlayerPartnershipResponse])
def partnerships_for_player(player_id: int, db: Session = Depends(get_db)):
    try:
        return stats_service.get_partnership_for_player(db, player_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/partnerships/{player_a_id}/{player_b_id}", response_model=PartnershipResponse)
def specific_partnership(player_a_id: int, player_b_id: int, db: Session = Depends(get_db)):
    return stats_service.get_specific_partnership(db, player_a_id, player_b_id)


@router.get("/head-to-head/{player_a_id}/{player_b_id}", response_model=HeadToHeadResponse)
def head_to_head(player_a_id: int, player_b_id: int, db: Session = Depends(get_db)):
    return stats_service.get_head_to_head(db, player_a_id, player_b_id)


@router.get("/matchup/{pair_a_ids}/vs/{pair_b_ids}", response_model=MatchupResponse)
def matchup(pair_a_ids: str, pair_b_ids: str, db: Session = Depends(get_db)):
    try:
        a1, a2 = [int(x) for x in pair_a_ids.split(",")]
        b1, b2 = [int(x) for x in pair_b_ids.split(",")]
    except ValueError:
        raise HTTPException(status_code=422, detail="Pair IDs must be comma-separated integers e.g. /1,2/vs/3,4")
    return stats_service.get_matchup(db, (a1, a2), (b1, b2))
