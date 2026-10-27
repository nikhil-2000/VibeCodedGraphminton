from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..deps import FilterContext, get_filter_context
from ..services import fixture_difficulty as fixture_difficulty_service
from ..schemas import FixtureDifficultyEntry, FixtureDifficultyRequest

router = APIRouter()


@router.post("", response_model=list[FixtureDifficultyEntry])
def fixture_difficulty(
    body: FixtureDifficultyRequest,
    even_threshold: int = Query(default=1, ge=0),
    filters: FilterContext = Depends(get_filter_context),
    db: Session = Depends(get_db),
):
    player_ids, season_id = filters
    return fixture_difficulty_service.get_fixture_difficulty(
        db, ranking=body.player_ids, even_threshold=even_threshold,
        player_ids=player_ids, season_id=season_id,
    )
