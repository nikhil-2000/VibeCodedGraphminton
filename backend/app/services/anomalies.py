from typing import Any
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func
from ..models import Game, GamePlayer


MIN_GAMES_THRESHOLD = 3


def _valid_game_id_set(db: Session, player_ids: list[int] | None, season_id: int | None = None) -> set[int] | None:
    """Returns the set of game IDs filtered by player_ids and/or season_id.
    Returns None when no filters apply (no filter)."""
    if not player_ids and season_id is None:
        return None
    q = db.query(Game.id)
    if season_id is not None:
        q = q.filter(Game.season_id == season_id)
    all_ids = {row.id for row in q.all()}
    if player_ids:
        excluded = {
            row.game_id
            for row in db.query(GamePlayer.game_id)
            .filter(GamePlayer.player_id.notin_(player_ids))
            .distinct()
            .all()
        }
        return all_ids - excluded
    return all_ids


def _get_player_game_counts(db: Session, valid_game_ids: set[int] | None = None) -> dict[int, int]:
    q = db.query(GamePlayer.player_id, func.count().label("games")).group_by(GamePlayer.player_id)
    if valid_game_ids is not None:
        q = q.filter(GamePlayer.game_id.in_(valid_game_ids))
    rows = q.all()
    return {row.player_id: row.games for row in rows}


def _get_total_games(db: Session, valid_game_ids: set[int] | None = None) -> int:
    q = db.query(func.count(Game.id))
    if valid_game_ids is not None:
        q = q.filter(Game.id.in_(valid_game_ids))
    return q.scalar() or 0


def _get_all_player_pairs(player_counts: dict[int, int]) -> list[tuple[int, int]]:
    ids = sorted(player_counts.keys())
    return [(ids[i], ids[j]) for i in range(len(ids)) for j in range(i + 1, len(ids))]


def _expected_frequency(games_a: int, games_b: int, total: int, prob_given_same_game: float) -> float:
    if total == 0:
        return 0.0
    return (games_a / total) * (games_b / total) * total * prob_given_same_game


def get_partnership_anomalies(db: Session, overplayed: bool, limit: int = 10, player_ids: list[int] | None = None, season_id: int | None = None) -> list[dict[str, Any]]:
    valid_game_ids = _valid_game_id_set(db, player_ids, season_id)
    gp1 = aliased(GamePlayer)
    gp2 = aliased(GamePlayer)

    q = (
        db.query(
            gp1.player_id.label("a"),
            gp2.player_id.label("b"),
            func.count().label("n"),
        )
        .join(gp2, (gp1.game_id == gp2.game_id) & (gp1.team == gp2.team) & (gp1.player_id < gp2.player_id))
        .group_by(gp1.player_id, gp2.player_id)
    )
    if valid_game_ids is not None:
        q = q.filter(gp1.game_id.in_(valid_game_ids))

    actual_counts = {(min(r.a, r.b), max(r.a, r.b)): int(r.n) for r in q.all()}

    player_counts = _get_player_game_counts(db, valid_game_ids)
    total = _get_total_games(db, valid_game_ids)
    all_pairs = _get_all_player_pairs(player_counts)

    results: list[dict[str, Any]] = []
    for a, b in all_pairs:
        if not overplayed:
            if player_counts.get(a, 0) < MIN_GAMES_THRESHOLD:
                continue
            if player_counts.get(b, 0) < MIN_GAMES_THRESHOLD:
                continue

        actual = actual_counts.get((a, b), 0)
        expected = _expected_frequency(player_counts.get(a, 0), player_counts.get(b, 0), total, 1 / 3)
        deviation = actual - expected

        if overplayed and deviation <= 0:
            continue
        if not overplayed and deviation >= 0:
            continue

        results.append({
            "player_a_id": a,
            "player_b_id": b,
            "actual": actual,
            "expected": round(expected, 2),
            "deviation": round(deviation, 2),
        })

    results.sort(key=lambda r: r["deviation"], reverse=overplayed)
    return results[:limit]


def get_head_to_head_anomalies(db: Session, overplayed: bool, limit: int = 10, player_ids: list[int] | None = None, season_id: int | None = None) -> list[dict[str, Any]]:
    valid_game_ids = _valid_game_id_set(db, player_ids, season_id)
    gp1 = aliased(GamePlayer)
    gp2 = aliased(GamePlayer)

    q = (
        db.query(
            gp1.player_id.label("a"),
            gp2.player_id.label("b"),
            func.count().label("n"),
        )
        .join(gp2, (gp1.game_id == gp2.game_id) & (gp1.team != gp2.team) & (gp1.player_id < gp2.player_id))
        .group_by(gp1.player_id, gp2.player_id)
    )
    if valid_game_ids is not None:
        q = q.filter(gp1.game_id.in_(valid_game_ids))

    actual_counts = {(min(r.a, r.b), max(r.a, r.b)): int(r.n) for r in q.all()}

    player_counts = _get_player_game_counts(db, valid_game_ids)
    total = _get_total_games(db, valid_game_ids)
    all_pairs = _get_all_player_pairs(player_counts)

    results: list[dict[str, Any]] = []
    for a, b in all_pairs:
        if not overplayed:
            if player_counts.get(a, 0) < MIN_GAMES_THRESHOLD:
                continue
            if player_counts.get(b, 0) < MIN_GAMES_THRESHOLD:
                continue

        actual = actual_counts.get((a, b), 0)
        expected = _expected_frequency(player_counts.get(a, 0), player_counts.get(b, 0), total, 2 / 3)
        deviation = actual - expected

        if overplayed and deviation <= 0:
            continue
        if not overplayed and deviation >= 0:
            continue

        results.append({
            "player_a_id": a,
            "player_b_id": b,
            "actual": actual,
            "expected": round(expected, 2),
            "deviation": round(deviation, 2),
        })

    results.sort(key=lambda r: r["deviation"], reverse=overplayed)
    return results[:limit]
