from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import func
from ..models import Season, Game


def get_all_seasons(db: Session) -> list[Season]:
    return db.query(Season).order_by(Season.start_date).all()


def get_season(db: Session, season_id: int) -> Season | None:
    return db.get(Season, season_id)


def create_season(db: Session, name: str, start_date: date, end_date: date | None = None) -> Season:
    season = Season(name=name, start_date=start_date, end_date=end_date)
    db.add(season)
    db.flush()
    return season


def resolve_season_for_date(db: Session, played_on: date) -> Season | None:
    """Return the season whose date range covers played_on, or None."""
    q = db.query(Season).filter(Season.start_date <= played_on)
    seasons = q.all()
    for season in seasons:
        if season.end_date is None or season.end_date >= played_on:
            return season
    return None


def get_season_game_counts(db: Session) -> dict[int, int]:
    rows = db.query(Game.season_id, func.count(Game.id)).group_by(Game.season_id).all()
    return {season_id: count for season_id, count in rows}
