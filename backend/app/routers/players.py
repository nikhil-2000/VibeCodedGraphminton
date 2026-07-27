from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas import PlayerCreate, PlayerUpdate, PlayerResponse, PlayerStatsResponse
from ..services import players as player_service
from ..services import stats as stats_service

router = APIRouter()


@router.post("", response_model=PlayerResponse, status_code=201)
def create_player(data: PlayerCreate, db: Session = Depends(get_db)):
    try:
        player = player_service.create_player(db, data)
        db.commit()
        return player
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("", response_model=List[PlayerResponse])
def list_players(is_sub: Optional[bool] = Query(default=None), db: Session = Depends(get_db)):
    return player_service.get_all_players(db, is_sub=is_sub)


@router.get("/{player_id}", response_model=PlayerResponse)
def get_player(player_id: int, db: Session = Depends(get_db)):
    try:
        return player_service.get_player(db, player_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.patch("/{player_id}", response_model=PlayerResponse)
def update_player(player_id: int, data: PlayerUpdate, db: Session = Depends(get_db)):
    try:
        player = player_service.update_player(db, player_id, data)
        db.commit()
        return player
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/{player_id}/stats", response_model=PlayerStatsResponse)
def get_player_stats(
    player_id: int,
    player_ids: list[int] = Query(default=[]),
    season_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
):
    try:
        return stats_service.get_player_stats(db, player_id, player_ids or None, season_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@router.delete("/{player_id}", status_code=204)
def delete_player(player_id: int, db: Session = Depends(get_db)):
    try:
        player_service.delete_player(db, player_id)
        db.commit()
        return Response(status_code=204)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
