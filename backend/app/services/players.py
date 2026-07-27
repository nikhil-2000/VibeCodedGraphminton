from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from ..models import Player, PlayerAlias, GamePlayer
from ..schemas import PlayerCreate, PlayerUpdate


def create_player(db: Session, data: PlayerCreate) -> Player:
    player = Player(canonical_name=data.canonical_name, is_sub=data.is_sub, is_admin=data.is_admin)
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
    q = db.query(Player)
    if is_sub is not None:
        q = q.filter(Player.is_sub == is_sub)
    return q.all()


def get_player(db: Session, player_id: int) -> Player:
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise KeyError(f"Player {player_id} not found")
    return player


def update_player(db: Session, player_id: int, data: PlayerUpdate) -> Player:
    player = get_player(db, player_id)

    if data.is_sub is not None:
        player.is_sub = data.is_sub
    if data.is_admin is not None:
        player.is_admin = data.is_admin

    for alias_str in data.remove_aliases:
        if alias_str == player.canonical_name:
            raise ValueError("Cannot remove the canonical name alias")
        alias = db.query(PlayerAlias).filter(
            PlayerAlias.player_id == player_id,
            PlayerAlias.alias == alias_str,
        ).first()
        if alias:
            db.delete(alias)

    existing = {a.alias for a in player.aliases}
    for alias_str in data.add_aliases:
        if alias_str not in existing:
            db.add(PlayerAlias(player_id=player_id, alias=alias_str))

    try:
        db.flush()
    except IntegrityError:
        raise ValueError("One or more aliases already belong to another player")

    db.refresh(player)
    return player


def delete_player(db: Session, player_id: int) -> None:
    player = get_player(db, player_id)  # raises KeyError if not found
    has_games = db.query(GamePlayer).filter(GamePlayer.player_id == player_id).first()
    if has_games:
        raise ValueError(f"'{player.canonical_name}' has recorded games and cannot be deleted")
    db.delete(player)
    db.flush()
