from sqlalchemy.orm import Session
from sqlalchemy import func, case
from ..models import Player, Game, GamePlayer


def get_player_stats(db: Session, player_id: int) -> dict:
    won_case = case(
        ((GamePlayer.team == "A") & (Game.team_a_score > Game.team_b_score), 1),
        ((GamePlayer.team == "B") & (Game.team_b_score > Game.team_a_score), 1),
        else_=0,
    )
    points_case = case(
        (GamePlayer.team == "A", Game.team_a_score),
        else_=Game.team_b_score,
    )

    result = (
        db.query(
            func.count(GamePlayer.id).label("games_played"),
            func.sum(won_case).label("wins"),
            func.avg(points_case).label("avg_points"),
        )
        .join(Game, GamePlayer.game_id == Game.id)
        .filter(GamePlayer.player_id == player_id)
        .one()
    )

    games_played = result.games_played or 0
    wins = int(result.wins or 0)
    return {
        "player_id": player_id,
        "games_played": games_played,
        "wins": wins,
        "losses": games_played - wins,
        "win_rate": round(wins / games_played, 4) if games_played else 0.0,
        "avg_points": round(float(result.avg_points or 0), 2),
    }


def get_leaderboard(db: Session, sort_by: str = "win_rate") -> list[dict]:
    won_case = case(
        ((GamePlayer.team == "A") & (Game.team_a_score > Game.team_b_score), 1),
        ((GamePlayer.team == "B") & (Game.team_b_score > Game.team_a_score), 1),
        else_=0,
    )
    points_case = case(
        (GamePlayer.team == "A", Game.team_a_score),
        else_=Game.team_b_score,
    )

    rows = (
        db.query(
            Player.id,
            Player.canonical_name,
            func.count(GamePlayer.id).label("games_played"),
            func.sum(won_case).label("wins"),
            func.avg(points_case).label("avg_points"),
        )
        .join(GamePlayer, Player.id == GamePlayer.player_id)
        .join(Game, GamePlayer.game_id == Game.id)
        .group_by(Player.id, Player.canonical_name)
        .all()
    )

    entries = []
    for row in rows:
        games = row.games_played or 0
        wins = int(row.wins or 0)
        entries.append({
            "player_id": row.id,
            "canonical_name": row.canonical_name,
            "games_played": games,
            "wins": wins,
            "losses": games - wins,
            "win_rate": round(wins / games, 4) if games else 0.0,
            "avg_points": round(float(row.avg_points or 0), 2),
        })

    sort_key = "avg_points" if sort_by == "avg_points" else "win_rate"
    return sorted(entries, key=lambda e: e[sort_key], reverse=True)
