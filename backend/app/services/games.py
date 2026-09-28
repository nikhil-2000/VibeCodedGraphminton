from typing import Any
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func, select
from ..models import Game, GamePlayer, Player
from ._common import points_for_case, valid_game_ids


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
        ranked = ranked.filter(Game.id.notin_(excluded.select()))

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


def get_game_prediction(
    db: Session,
    game_id: int,
    player_ids: list[int] | None = None,
    season_id: int | None = None,
) -> dict[str, Any]:
    """Predict a game's score from how its players have performed in games in scope.

    Honours the active season/roster filters, so a prediction shown alongside a
    filtered view is built from the same games the rest of that view reports on.
    """
    game = db.get(Game, game_id)
    if not game:
        raise KeyError(f"Game {game_id} not found")

    valid_ids = valid_game_ids(player_ids, season_id)

    # Single query: get both teams' player IDs
    team_rows = db.query(GamePlayer.player_id, GamePlayer.team).filter(
        GamePlayer.game_id == game_id
    ).all()
    a_ids = [r.player_id for r in team_rows if r.team == "A"]
    b_ids = [r.player_id for r in team_rows if r.team == "B"]

    all_ids = a_ids + b_ids

    # Batch query: avg score when player plays with each specific partner (same team)
    gpa = aliased(GamePlayer)
    gpb = aliased(GamePlayer)
    q_partner = (
        db.query(gpa.player_id, gpb.player_id, func.avg(points_for_case(gpa)))
        .join(gpa, (gpa.game_id == Game.id) & gpa.player_id.in_(all_ids))
        .join(gpb, (gpb.game_id == Game.id) & (gpb.team == gpa.team) & gpb.player_id.in_(all_ids) & (gpb.player_id != gpa.player_id))
        .group_by(gpa.player_id, gpb.player_id)
    )
    q_partner = q_partner.filter(Game.id.in_(valid_ids)) if valid_ids is not None else q_partner
    partner_avg: dict[tuple[int, int], float] = {
        (pid, partner): float(avg) for pid, partner, avg in q_partner.all() if avg is not None
    }

    # Batch query: avg score when player faces each specific opponent (different team)
    gpc = aliased(GamePlayer)
    gpd = aliased(GamePlayer)
    q_opp = (
        db.query(gpc.player_id, gpd.player_id, func.avg(points_for_case(gpc)))
        .join(gpc, (gpc.game_id == Game.id) & gpc.player_id.in_(all_ids))
        .join(gpd, (gpd.game_id == Game.id) & (gpd.team != gpc.team) & gpd.player_id.in_(all_ids))
        .group_by(gpc.player_id, gpd.player_id)
    )
    q_opp = q_opp.filter(Game.id.in_(valid_ids)) if valid_ids is not None else q_opp
    opp_avg: dict[tuple[int, int], float] = {
        (pid, opp): float(avg) for pid, opp, avg in q_opp.all() if avg is not None
    }

    # Batch query: overall avg score per player (fallback)
    q_overall = (
        db.query(GamePlayer.player_id, func.avg(points_for_case()))
        .join(Game, GamePlayer.game_id == Game.id)
        .filter(GamePlayer.player_id.in_(all_ids))
        .group_by(GamePlayer.player_id)
    )
    q_overall = q_overall.filter(Game.id.in_(valid_ids)) if valid_ids is not None else q_overall
    overall_avg: dict[int, float] = {pid: float(avg or 0) for pid, avg in q_overall.all()}

    def _expected_for_player(pid: int, partner_id: int, opp1_id: int, opp2_id: int) -> float:
        scores = [
            partner_avg.get((pid, partner_id)),
            opp_avg.get((pid, opp1_id)),
            opp_avg.get((pid, opp2_id)),
        ]
        valid = [s for s in scores if s is not None]
        return sum(valid) / len(valid) if valid else overall_avg.get(pid, 0.0)

    def _expected_for_team(team: list[int], opponents: list[int]) -> float:
        # Badminton is always 2-a-side; the ingest enforces this.  If somehow a
        # game record is corrupted (partial ingest, manual DB edit) we want a
        # clear error rather than a silent IndexError → 500.
        assert len(team) == 2 and len(opponents) == 2, (
            f"Expected 2 players per side, got {len(team)} vs {len(opponents)} "
            f"for game {game_id}"
        )
        return (
            _expected_for_player(team[0], team[1], opponents[0], opponents[1])
            + _expected_for_player(team[1], team[0], opponents[0], opponents[1])
        ) / 2

    exp_a = _expected_for_team(a_ids, b_ids)
    exp_b = _expected_for_team(b_ids, a_ids)

    actual_winner = "A" if game.team_a_score > game.team_b_score else "B"
    expected_winner = "A" if exp_a >= exp_b else "B"

    return {
        "expected_score_a": round(exp_a, 1),
        "expected_score_b": round(exp_b, 1),
        "expected_winner": expected_winner,
        "actual_winner": actual_winner,
        "upset": expected_winner != actual_winner,
    }
