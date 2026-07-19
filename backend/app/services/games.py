from typing import Any
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func, select
from ..models import Game, GamePlayer, Player


# Session rank subquery: ranks each distinct played_on date chronologically (1, 2, 3, …)
_session_rank = (
    select(
        Game.played_on,
        func.dense_rank().over(order_by=Game.played_on).label("session"),
    )
    .distinct()
    .subquery()
)


def get_games(
    db: Session,
    week: int | None = None,
    player_id: int | None = None,
    team_ids: tuple[int, int] | None = None,
    vs_ids: tuple[int, int] | None = None,
    season_id: int | None = None,
) -> list[dict[str, Any]]:
    ranked = (
        db.query(Game, _session_rank.c.session)
        .join(_session_rank, _session_rank.c.played_on == Game.played_on)
    )

    if season_id is not None:
        ranked = ranked.filter(Game.season_id == season_id)

    if week is not None:
        ranked = ranked.filter(_session_rank.c.session == week)

    if player_id is not None:
        ranked = ranked.join(GamePlayer, GamePlayer.game_id == Game.id).filter(
            GamePlayer.player_id == player_id
        )

    if team_ids is not None:
        gp1 = aliased(GamePlayer)
        gp2 = aliased(GamePlayer)
        ranked = (
            ranked
            .join(gp1, (gp1.game_id == Game.id) & (gp1.player_id == team_ids[0]))
            .join(gp2, (gp2.game_id == Game.id) & (gp2.player_id == team_ids[1]) & (gp2.team == gp1.team))
        )

    if vs_ids is not None:
        gp1 = aliased(GamePlayer)
        gp2 = aliased(GamePlayer)
        ranked = (
            ranked
            .join(gp1, (gp1.game_id == Game.id) & (gp1.player_id == vs_ids[0]))
            .join(gp2, (gp2.game_id == Game.id) & (gp2.player_id == vs_ids[1]) & (gp2.team != gp1.team))
        )

    return [_game_summary(g, session) for g, session in ranked.distinct().all()]


def get_game_detail(db: Session, game_id: int) -> dict[str, Any]:
    game = db.get(Game, game_id)
    if not game:
        raise KeyError(f"Game {game_id} not found")

    team_a = (
        db.query(Player)
        .join(GamePlayer, GamePlayer.player_id == Player.id)
        .filter(GamePlayer.game_id == game_id, GamePlayer.team == "A")
        .all()
    )
    team_b = (
        db.query(Player)
        .join(GamePlayer, GamePlayer.player_id == Player.id)
        .filter(GamePlayer.game_id == game_id, GamePlayer.team == "B")
        .all()
    )

    detail: dict[str, Any] = _game_summary(game)
    detail["team_a"] = [{"id": p.id, "canonical_name": p.canonical_name} for p in team_a]
    detail["team_b"] = [{"id": p.id, "canonical_name": p.canonical_name} for p in team_b]
    return detail


def _game_summary(game: Game, session: int | None = None) -> dict[str, Any]:
    return {
        "id": game.id,
        "played_on": str(game.played_on),
        "session": session,
        "season_id": game.season_id,
        "game_number": game.game_number,
        "team_a_score": game.team_a_score,
        "team_b_score": game.team_b_score,
    }
