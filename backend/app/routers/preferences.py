from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from ..database import get_db
from ..models import UserPreferences
from ..schemas import UserPreferencesCreate, UserPreferencesResponse, UserPreferencesUpdate

router = APIRouter(prefix="/preferences", tags=["preferences"])


def _get_user_id(x_user_id: Optional[str] = Header(default=None)) -> str:
    if not x_user_id:
        raise HTTPException(status_code=422, detail="X-User-ID header required")
    return x_user_id


@router.get("", response_model=UserPreferencesResponse)
def get_preferences(user_id: str = Depends(_get_user_id), db: Session = Depends(get_db)):
    prefs = db.query(UserPreferences).filter(UserPreferences.id == user_id).first()
    if not prefs:
        raise HTTPException(status_code=404, detail="Preferences not found")
    return prefs


@router.post("", response_model=UserPreferencesResponse, status_code=201)
def create_preferences(
    body: UserPreferencesCreate,
    user_id: str = Depends(_get_user_id),
    db: Session = Depends(get_db),
):
    existing = db.query(UserPreferences).filter(UserPreferences.id == user_id).first()
    if existing:
        raise HTTPException(status_code=409, detail="Preferences already exist")
    prefs = UserPreferences(
        id=user_id,
        player_id=body.player_id,
        season_id=body.season_id,
        preset=body.preset,
        custom_player_ids=body.custom_player_ids,
    )
    db.add(prefs)
    db.commit()
    db.refresh(prefs)
    return prefs


@router.patch("", response_model=UserPreferencesResponse)
def update_preferences(
    body: UserPreferencesUpdate,
    user_id: str = Depends(_get_user_id),
    db: Session = Depends(get_db),
):
    prefs = db.query(UserPreferences).filter(UserPreferences.id == user_id).first()
    if not prefs:
        raise HTTPException(status_code=404, detail="Preferences not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(prefs, field, value)
    db.commit()
    db.refresh(prefs)
    return prefs
