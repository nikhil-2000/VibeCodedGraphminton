from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas import PlayerCreate, PlayerResponse
from ..services import players as player_service

router = APIRouter()


@router.post("", response_model=PlayerResponse, status_code=201)
def create_player(data: PlayerCreate, db: Session = Depends(get_db)):
    try:
        player = player_service.create_player(db, data)
        db.commit()
        return player
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
