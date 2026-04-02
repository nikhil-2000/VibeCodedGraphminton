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
