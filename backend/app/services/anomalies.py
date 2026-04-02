from typing import Any
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func
from ..models import Game, GamePlayer


MIN_GAMES_THRESHOLD = 3  # players with fewer games are excluded from underplayed results


def _get_player_game_counts(db: Session) -> dict[int, int]:
    rows = (
        db.query(GamePlayer.player_id, func.count().label("games"))
        .group_by(GamePlayer.player_id)
        .all()
    )
    return {row.player_id: row.games for row in rows}


def _get_total_games(db: Session) -> int:
    return db.query(func.count(Game.id)).scalar() or 0


def _get_all_player_pairs(player_counts: dict[int, int]) -> list[tuple[int, int]]:
    ids = sorted(player_counts.keys())
    return [(ids[i], ids[j]) for i in range(len(ids)) for j in range(i + 1, len(ids))]


def _expected_frequency(games_a: int, games_b: int, total: int, prob_given_same_game: float) -> float:
    """
    Expected co-occurrence assuming random pairing.

    In a 4-player game there are 3 distinct ways to split into 2 teams:
      - Partnership prob given same game  = 1/3
      - Head-to-head prob given same game = 2/3
    """
    if total == 0:
        return 0.0
    return (games_a / total) * (games_b / total) * total * prob_given_same_game


def get_partnership_anomalies(db: Session, overplayed: bool, limit: int = 10) -> list[dict[str, Any]]:
    gp1 = aliased(GamePlayer)
    gp2 = aliased(GamePlayer)

    actual_counts = {
        (min(r.a, r.b), max(r.a, r.b)): int(r.n)
        for r in db.query(
            gp1.player_id.label("a"),
            gp2.player_id.label("b"),
            func.count().label("n"),
        )
        .join(gp2, (gp1.game_id == gp2.game_id) & (gp1.team == gp2.team) & (gp1.player_id < gp2.player_id))
        .group_by(gp1.player_id, gp2.player_id)
        .all()
    }

    player_counts = _get_player_game_counts(db)
    total = _get_total_games(db)
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


def get_head_to_head_anomalies(db: Session, overplayed: bool, limit: int = 10) -> list[dict[str, Any]]:
    gp1 = aliased(GamePlayer)
    gp2 = aliased(GamePlayer)

    actual_counts = {
        (min(r.a, r.b), max(r.a, r.b)): int(r.n)
        for r in db.query(
            gp1.player_id.label("a"),
            gp2.player_id.label("b"),
            func.count().label("n"),
        )
        .join(gp2, (gp1.game_id == gp2.game_id) & (gp1.team != gp2.team) & (gp1.player_id < gp2.player_id))
        .group_by(gp1.player_id, gp2.player_id)
        .all()
    }

    player_counts = _get_player_game_counts(db)
    total = _get_total_games(db)
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
