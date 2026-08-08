from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import require_admin
from ..models import Season
from ..schemas import SeasonCreate, SeasonUpdate, SeasonResponse
from ..services import seasons as season_svc

router = APIRouter(prefix="/seasons", tags=["seasons"])


@router.get("", response_model=list[SeasonResponse])
def list_seasons(db: Session = Depends(get_db)):
    seasons = season_svc.get_all_seasons(db)
    counts = season_svc.get_season_game_counts(db)
    result = []
    for s in seasons:
        data = SeasonResponse.model_validate(s)
        data.game_count = counts.get(s.id, 0)
        result.append(data)
    return result


@router.get("/{season_id}", response_model=SeasonResponse)
def get_season(season_id: int, db: Session = Depends(get_db)):
    season = season_svc.get_season(db, season_id)
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    return season


@router.patch("/{season_id}", response_model=SeasonResponse)
def update_season(season_id: int, body: SeasonUpdate, db: Session = Depends(get_db)):
    season = season_svc.update_season(db, season_id, body.name, body.start_date, body.end_date)
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    db.commit()
    db.refresh(season)
    return season


@router.post("", response_model=SeasonResponse, status_code=201)
def create_season(body: SeasonCreate, db: Session = Depends(get_db)):
    existing = db.query(Season).filter_by(name=body.name).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Season '{body.name}' already exists")
    season = season_svc.create_season(db, body.name, body.start_date, body.end_date)
    db.commit()
    db.refresh(season)
    counts = season_svc.get_season_game_counts(db)
    data = SeasonResponse.model_validate(season)
    data.game_count = counts.get(season.id, 0)
    return data


@router.delete("/{season_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_season(season_id: int, db: Session = Depends(get_db)):
    try:
        season_svc.delete_season(db, season_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Season not found")
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    return Response(status_code=204)
