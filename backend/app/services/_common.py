"""Shared building blocks for the stats and anomalies services.

Every stat in this app is derived from the same handful of ideas: "did this
player's team win", "how many points did their team score", and "which games
count given the active season/roster filters". These helpers hold the single
definition of each so the query modules stay declarative.
"""
from typing import Any
from sqlalchemy.orm import Session
from sqlalchemy import func, case, select
from sqlalchemy.sql import Select
from sqlalchemy.sql.elements import ColumnElement
from ..models import Game, GamePlayer


def won_case(gp: Any = GamePlayer) -> ColumnElement[int]:
    """1 when gp's team won the game, else 0. `gp` may be a GamePlayer alias."""
    return case(
        ((gp.team == "A") & (Game.team_a_score > Game.team_b_score), 1),
        ((gp.team == "B") & (Game.team_b_score > Game.team_a_score), 1),
        else_=0,
    )


def points_for_case(gp: Any = GamePlayer) -> ColumnElement[int]:
    """The score gp's own team put up."""
    return case((gp.team == "A", Game.team_a_score), else_=Game.team_b_score)


def points_against_case(gp: Any = GamePlayer) -> ColumnElement[int]:
    """The score gp's opponents put up."""
    return case((gp.team == "A", Game.team_b_score), else_=Game.team_a_score)


def win_record(games: int | None, wins: int | None, avg_points: Any = None) -> dict[str, Any]:
    """The games/wins/losses/win_rate block shared by every leaderboard-shaped row.

    Omits avg_points entirely when not supplied, since some stats (e.g. pairings
    faced) report a win record without a points average.
    """
    games = games or 0
    wins = int(wins or 0)
    record: dict[str, Any] = {
        "games_played": games,
        "wins": wins,
        "losses": games - wins,
        "win_rate": round(wins / games, 4) if games else 0.0,
    }
    if avg_points is not None:
        record["avg_points"] = round(float(avg_points or 0), 2)
    return record


def normalize_pair(a: int, b: int) -> tuple[int, int]:
    """Order a player pair so (a, b) and (b, a) key the same entry."""
    return (a, b) if a <= b else (b, a)


def winner_from_perspective(game: Game, team: str) -> bool:
    """True when the side sitting on `team` ('A' or 'B') won `game`."""
    if team == "A":
        return game.team_a_score > game.team_b_score
    return game.team_b_score > game.team_a_score


def valid_game_ids(player_ids: list[int] | None, season_id: int | None = None) -> "Select[tuple[int]] | None":
    """A Select of the game IDs matching the active filters, or None for "all games".

    A game survives the roster filter only if *every* one of its players is in
    `player_ids` — so a session including a sub drops out of a regulars-only view.
    """
    if not player_ids and season_id is None:
        return None
    base = select(Game.id)
    if season_id is not None:
        base = base.where(Game.season_id == season_id)
    if player_ids:
        excluded = select(GamePlayer.game_id).where(GamePlayer.player_id.notin_(player_ids))
        base = base.where(~Game.id.in_(excluded))
    return base


def valid_game_id_set(db: Session, player_ids: list[int] | None, season_id: int | None = None) -> set[int] | None:
    """Materialised form of `valid_game_ids`, for callers that need a count.

    The anomaly expectation model divides by the number of games in scope, so it
    needs the actual set rather than a predicate.
    """
    subquery = valid_game_ids(player_ids, season_id)
    if subquery is None:
        return None
    return {row[0] for row in db.execute(subquery).all()}


def total_games_in_scope(db: Session, valid_ids: set[int] | None) -> int:
    """How many games the filters leave in play."""
    if valid_ids is not None:
        return len(valid_ids)
    return db.query(func.count(Game.id)).scalar() or 0
