from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from ..models import Player, PlayerAlias
from ..schemas import PlayerCreate, PlayerUpdate


def create_player(db: Session, data: PlayerCreate) -> Player:
    player = Player(canonical_name=data.canonical_name, is_sub=data.is_sub)
    db.add(player)
    try:
        db.flush()  # get player.id without committing
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Player '{data.canonical_name}' already exists")

    # canonical name always becomes an alias
    all_aliases = list({data.canonical_name} | set(data.aliases))
    for alias_str in all_aliases:
        alias = PlayerAlias(player_id=player.id, alias=alias_str)
        db.add(alias)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="One or more aliases already belong to another player")

    db.refresh(player)
    return player
