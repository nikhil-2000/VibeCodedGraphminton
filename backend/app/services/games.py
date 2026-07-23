from typing import Any
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func, select, case
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
    player_ids: list[int] | None = None,
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

    if player_ids:
        excluded = (
            db.query(GamePlayer.game_id)
            .filter(GamePlayer.player_id.notin_(player_ids))
            .distinct()
            .subquery()
        )
        ranked = ranked.filter(Game.id.notin_(excluded))

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

    rows = ranked.order_by(Game.played_on.desc(), Game.game_number.asc()).distinct().all()
    game_ids = [g.id for g, _ in rows]

    # Batch-fetch team members for all returned games (avoids N+1)
    gp_rows = (
        db.query(GamePlayer.game_id, GamePlayer.player_id, GamePlayer.team, Player.canonical_name)
        .join(Player, Player.id == GamePlayer.player_id)
        .filter(GamePlayer.game_id.in_(game_ids))
        .all()
    )
    teams: dict[int, dict[str, list]] = {}
    for r in gp_rows:
        if r.game_id not in teams:
            teams[r.game_id] = {"A": [], "B": []}
        teams[r.game_id][r.team].append({"id": r.player_id, "canonical_name": r.canonical_name})

    result = []
    for g, session in rows:
        summary = _game_summary(g, session)
        game_teams = teams.get(g.id, {"A": [], "B": []})
        summary["team_a"] = game_teams["A"]
        summary["team_b"] = game_teams["B"]
        result.append(summary)
    return result


def delete_game(db: Session, game_id: int) -> None:
    game = db.get(Game, game_id)
    if not game:
        raise KeyError(f"Game {game_id} not found")
    db.query(GamePlayer).filter(GamePlayer.game_id == game_id).delete()
    db.delete(game)
    db.commit()


def delete_session(db: Session, played_on_str: str) -> int:
    from datetime import date
    try:
        played_on = date.fromisoformat(played_on_str)
    except ValueError:
        raise ValueError(f"Invalid date: {played_on_str!r}")
    game_ids = [g.id for g in db.query(Game.id).filter(Game.played_on == played_on).all()]
    if not game_ids:
        return 0
    db.query(GamePlayer).filter(GamePlayer.game_id.in_(game_ids)).delete(synchronize_session=False)
    deleted = db.query(Game).filter(Game.played_on == played_on).delete(synchronize_session=False)
    db.commit()
    return deleted


def get_game_detail(db: Session, game_id: int) -> dict[str, Any]:
    game = db.get(Game, game_id)
    if not game:
        raise KeyError(f"Game {game_id} not found")
    return _game_detail(db, game)


def _game_detail(db: Session, game: Game, session: int | None = None) -> dict[str, Any]:
    team_a = (
        db.query(Player)
        .join(GamePlayer, GamePlayer.player_id == Player.id)
        .filter(GamePlayer.game_id == game.id, GamePlayer.team == "A")
        .all()
    )
    team_b = (
        db.query(Player)
        .join(GamePlayer, GamePlayer.player_id == Player.id)
        .filter(GamePlayer.game_id == game.id, GamePlayer.team == "B")
        .all()
    )
    detail: dict[str, Any] = _game_summary(game, session)
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


def get_game_prediction(db: Session, game_id: int) -> dict[str, Any]:
    game = db.get(Game, game_id)
    if not game:
        raise KeyError(f"Game {game_id} not found")

    a_ids = [r.player_id for r in db.query(GamePlayer.player_id).filter(
        GamePlayer.game_id == game_id, GamePlayer.team == "A"
    ).all()]
    b_ids = [r.player_id for r in db.query(GamePlayer.player_id).filter(
        GamePlayer.game_id == game_id, GamePlayer.team == "B"
    ).all()]

    def _avg_with_partner(pid: int, partner_id: int) -> float | None:
        gpa = aliased(GamePlayer)
        gpb = aliased(GamePlayer)
        pts = case((gpa.team == "A", Game.team_a_score), else_=Game.team_b_score)
        result = (
            db.query(func.avg(pts))
            .join(gpa, (gpa.game_id == Game.id) & (gpa.player_id == pid))
            .join(gpb, (gpb.game_id == Game.id) & (gpb.player_id == partner_id) & (gpb.team == gpa.team))
            .scalar()
        )
        return float(result) if result is not None else None

    def _avg_vs_opponent(pid: int, opp_id: int) -> float | None:
        gpa = aliased(GamePlayer)
        gpo = aliased(GamePlayer)
        pts = case((gpa.team == "A", Game.team_a_score), else_=Game.team_b_score)
        result = (
            db.query(func.avg(pts))
            .join(gpa, (gpa.game_id == Game.id) & (gpa.player_id == pid))
            .join(gpo, (gpo.game_id == Game.id) & (gpo.player_id == opp_id) & (gpo.team != gpa.team))
            .scalar()
        )
        return float(result) if result is not None else None

    def _overall_avg(pid: int) -> float:
        pts = case((GamePlayer.team == "A", Game.team_a_score), else_=Game.team_b_score)
        result = (
            db.query(func.avg(pts))
            .join(Game, GamePlayer.game_id == Game.id)
            .filter(GamePlayer.player_id == pid)
            .scalar()
        )
        return float(result or 0)

    def _expected_for_player(pid: int, partner_id: int, opp1_id: int, opp2_id: int) -> float:
        scores = [
            _avg_with_partner(pid, partner_id),
            _avg_vs_opponent(pid, opp1_id),
            _avg_vs_opponent(pid, opp2_id),
        ]
        valid = [s for s in scores if s is not None]
        return sum(valid) / len(valid) if valid else _overall_avg(pid)

    exp_a = (
        _expected_for_player(a_ids[0], a_ids[1], b_ids[0], b_ids[1])
        + _expected_for_player(a_ids[1], a_ids[0], b_ids[0], b_ids[1])
    ) / 2
    exp_b = (
        _expected_for_player(b_ids[0], b_ids[1], a_ids[0], a_ids[1])
        + _expected_for_player(b_ids[1], b_ids[0], a_ids[0], a_ids[1])
    ) / 2

    actual_winner = "A" if game.team_a_score > game.team_b_score else "B"
    expected_winner = "A" if exp_a >= exp_b else "B"

    return {
        "expected_score_a": round(exp_a, 1),
        "expected_score_b": round(exp_b, 1),
        "expected_winner": expected_winner,
        "actual_winner": actual_winner,
        "upset": expected_winner != actual_winner,
    }
