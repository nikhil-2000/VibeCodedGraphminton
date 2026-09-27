from typing import NamedTuple, Optional
from fastapi import Header, Depends
from sqlalchemy.orm import Session
from .database import get_db
from .models import UserPreferences, Player


class FilterContext(NamedTuple):
    player_ids: list[int] | None
    season_id: int | None


def get_filter_context(
    x_user_id: Optional[str] = Header(default=None),
    db: Session = Depends(get_db),
) -> FilterContext:
    if not x_user_id:
        return FilterContext(None, None)

    prefs = db.query(UserPreferences).filter(UserPreferences.id == x_user_id).first()
    if not prefs:
        return FilterContext(None, None)

    season_id = prefs.season_id

    if prefs.preset == "everyone":
        return FilterContext(None, season_id)

    if prefs.preset == "custom":
        return FilterContext(prefs.custom_player_ids or None, season_id)

    # "regulars" — players where is_sub is False
    regular_players = db.query(Player).filter(Player.is_sub == False).all()
    return FilterContext([p.id for p in regular_players], season_id)
