from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..services import games as games_service
from ..schemas import GameResponse, GameDetailResponse

router = APIRouter()


@router.get("", response_model=list[GameDetailResponse])
def list_games(
    week: Optional[int] = None,
    player_id: Optional[int] = None,
    team: Optional[str] = None,
    vs: Optional[str] = None,
    season_id: Optional[int] = None,
    db: Session = Depends(get_db),
):
    team_ids = None
    vs_ids = None
    if team:
        try:
            a, b = [int(x) for x in team.split(",")]
            team_ids = (a, b)
        except ValueError:
            raise HTTPException(status_code=422, detail="team must be two comma-separated player IDs")
    if vs:
        try:
            a, b = [int(x) for x in vs.split(",")]
            vs_ids = (a, b)
        except ValueError:
            raise HTTPException(status_code=422, detail="vs must be two comma-separated player IDs")

    return games_service.get_games(db, week=week, player_id=player_id, team_ids=team_ids, vs_ids=vs_ids, season_id=season_id)


@router.get("/{game_id}", response_model=GameDetailResponse)
def get_game(game_id: int, db: Session = Depends(get_db)):
    try:
        return games_service.get_game_detail(db, game_id)
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
