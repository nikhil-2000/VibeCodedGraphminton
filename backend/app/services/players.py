from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from ..models import Player, PlayerAlias
from ..schemas import PlayerCreate


def create_player(db: Session, data: PlayerCreate) -> Player:
    player = Player(canonical_name=data.canonical_name, is_sub=data.is_sub)
    db.add(player)
    try:
        db.flush()
    except IntegrityError:
        raise ValueError(f"Player '{data.canonical_name}' already exists")

    all_aliases = list({data.canonical_name} | set(data.aliases))
    for alias_str in all_aliases:
        db.add(PlayerAlias(player_id=player.id, alias=alias_str))
    try:
        db.flush()
    except IntegrityError:
        raise ValueError("One or more aliases already belong to another player")

    db.refresh(player)
    return player


def get_all_players(db: Session, is_sub: Optional[bool] = None) -> List[Player]:
    query = db.query(Player)
    if is_sub is not None:
        query = query.filter(Player.is_sub == is_sub)
    return query.all()


def get_player(db: Session, player_id: int) -> Player:
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise KeyError(f"Player {player_id} not found")
    return player
