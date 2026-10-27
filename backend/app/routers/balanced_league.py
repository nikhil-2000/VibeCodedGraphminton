from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..deps import FilterContext, get_filter_context
from ..services import balanced_league as balanced_league_service
from ..schemas import BalancedLeagueResponse

router = APIRouter()


@router.get("", response_model=BalancedLeagueResponse)
def balanced_league(
    min_coverage: float = Query(default=1.0, gt=0, le=1),
    max_players: int | None = Query(default=None, ge=4),
    filters: FilterContext = Depends(get_filter_context),
    db: Session = Depends(get_db),
):
    player_ids, season_id = filters
    return balanced_league_service.get_balanced_league(
        db, min_coverage=min_coverage, max_players=max_players,
        player_ids=player_ids, season_id=season_id,
    )
