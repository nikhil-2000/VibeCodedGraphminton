from typing import Optional
from fastapi import Header, Depends
from sqlalchemy.orm import Session
from .database import get_db
from .models import UserPreferences, Player


def get_filter_context(
    x_user_id: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> tuple[list[int] | None, int | None]:
    if not x_user_id:
        return None, None

    prefs = db.query(UserPreferences).filter(UserPreferences.id == x_user_id).first()
    if not prefs:
        return None, None

    season_id = prefs.season_id

    if prefs.preset == "everyone":
        return None, season_id

    if prefs.preset == "custom":
        return prefs.custom_player_ids or None, season_id

    # "regulars" — players where is_sub is False
    regular_players = db.query(Player).filter(Player.is_sub == False).all()
    return [p.id for p in regular_players], season_id
