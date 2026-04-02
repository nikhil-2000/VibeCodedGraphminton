from typing import Literal
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..services import stats as stats_service

router = APIRouter()


@router.get("/leaderboard")
def leaderboard(
    sort_by: Literal["win_rate", "avg_points"] = "win_rate",
    db: Session = Depends(get_db),
):
    return stats_service.get_leaderboard(db, sort_by)
