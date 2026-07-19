from dataclasses import dataclass
from datetime import date, datetime


@dataclass
class RawGameRow:
    row_number: int
    played_on: date
    game_number: int
    name_a: str
    name_b: str
    team_a_score: int
    name_x: str
    name_y: str
    team_b_score: int


def validate_game_row(row: RawGameRow) -> list[str]:
    """Returns list of error messages. Empty list means valid."""
    errors = []
    winning_score = max(row.team_a_score, row.team_b_score)
    losing_score = min(row.team_a_score, row.team_b_score)

    if winning_score < 21:
        errors.append(f"Row {row.row_number}: winning score {winning_score} must be >= 21")

    if winning_score - losing_score < 2:
        errors.append(
            f"Row {row.row_number}: score margin {winning_score - losing_score} must be >= 2"
        )

    all_names = [row.name_a, row.name_b, row.name_x, row.name_y]
    seen: set[str] = set()
    for name in all_names:
        lower = name.lower()
        if lower in seen:
            errors.append(f"Row {row.row_number}: duplicate player '{name}' in same game")
            break
        seen.add(lower)

    return errors


def parse_csv_rows(lines: list[str]) -> tuple[list[RawGameRow], list[str]]:
    """Parse CSV lines (including optional header) into RawGameRow objects.

    Returns (rows, parse_errors). Validation errors are separate — call
    validate_game_row on each row.
    """
    rows: list[RawGameRow] = []
    errors: list[str] = []

    start = 1 if lines and lines[0].startswith("Date") else 0

    for i, line in enumerate(lines[start:], start=start + 1):
        line = line.strip()
        if not line:
            continue

        parts = [p.strip() for p in line.split(",")]
        if len(parts) != 8:
            errors.append(f"Row {i}: expected 8 columns, got {len(parts)}")
            continue

        try:
            played_on = datetime.strptime(parts[0], "%d-%m-%Y").date()
            game_number = int(parts[1])
            team_a_score = int(parts[4])
            team_b_score = int(parts[7])
        except ValueError as exc:
            errors.append(f"Row {i}: parse error — {exc}")
            continue

        rows.append(RawGameRow(
            row_number=i,
            played_on=played_on,
            game_number=game_number,
            name_a=parts[2],
            name_b=parts[3],
            team_a_score=team_a_score,
            name_x=parts[5],
            name_y=parts[6],
            team_b_score=team_b_score,
        ))

    return rows, errors


from sqlalchemy.orm import Session
from ..models import PlayerAlias, Game, GamePlayer
from .seasons import resolve_season_for_date


def resolve_aliases(db: Session) -> dict[str, int]:
    """Return mapping of alias (lowercased) → player_id for all aliases in DB."""
    rows = db.query(PlayerAlias.alias, PlayerAlias.player_id).all()
    return {row.alias.lower(): row.player_id for row in rows}


def ingest_csv_file(
    db: Session,
    lines: list[str],
    alias_map: dict[str, int],
) -> tuple[int, list[str]]:
    """Parse and validate CSV lines. Returns (games_loaded, errors).

    If there are any errors, nothing is written to the DB.
    """
    rows, parse_errors = parse_csv_rows(lines)
    if parse_errors:
        return 0, parse_errors

    dates = {row.played_on for row in rows}
    if len(dates) > 1:
        return 0, [f"All rows must share the same date, found: {', '.join(str(d) for d in sorted(dates))}"]

    played_on = next(iter(dates))
    season = resolve_season_for_date(db, played_on)
    if not season:
        return 0, [f"No season found covering date {played_on}. Create a season first."]

    all_errors: list[str] = []

    for row in rows:
        all_errors.extend(validate_game_row(row))
        for name in [row.name_a, row.name_b, row.name_x, row.name_y]:
            if name.lower() not in alias_map:
                all_errors.append(f"Row {row.row_number}: unknown player '{name}'")

    if all_errors:
        return 0, all_errors

    loaded = 0
    for row in rows:
        existing = db.query(Game).filter(
            Game.played_on == row.played_on,
            Game.game_number == row.game_number,
        ).first()
        if existing:
            continue

        game = Game(
            played_on=row.played_on,
            season_id=season.id,
            game_number=row.game_number,
            team_a_score=row.team_a_score,
            team_b_score=row.team_b_score,
        )
        db.add(game)
        db.flush()

        for name, team in [
            (row.name_a, "A"), (row.name_b, "A"),
            (row.name_x, "B"), (row.name_y, "B"),
        ]:
            db.add(GamePlayer(
                game_id=game.id,
                player_id=alias_map[name.lower()],
                team=team,
            ))
        loaded += 1

    return loaded, []


def validate_game_row_ids(
    row_number: int,
    team_a: list[int],
    score_a: int,
    team_b: list[int],
    score_b: int,
    known_player_ids: set[int],
) -> list[str]:
    """Validate a single structured game row (player IDs already resolved).
    Returns list of error strings; empty = valid."""
    errors: list[str] = []

    if len(team_a) != 2:
        errors.append(f"Row {row_number}: team A must have exactly 2 players")
    if len(team_b) != 2:
        errors.append(f"Row {row_number}: team B must have exactly 2 players")

    winning_score = max(score_a, score_b)
    losing_score = min(score_a, score_b)
    if winning_score < 21:
        errors.append(f"Row {row_number}: winning score {winning_score} must be >= 21")
    if winning_score - losing_score < 2:
        errors.append(f"Row {row_number}: score margin must be >= 2")

    all_ids = list(team_a) + list(team_b)
    if len(set(all_ids)) < len(all_ids):
        errors.append(f"Row {row_number}: duplicate player in same game")

    for pid in all_ids:
        if pid not in known_player_ids:
            errors.append(f"Row {row_number}: unknown player ID {pid}")

    return errors


def validate_games(
    db: Session,
    played_on_str: str,
    games: list,
) -> list[dict]:
    """Validate date, season coverage, and game rows. Returns list of {row, errors} dicts."""
    try:
        played_on = date.fromisoformat(played_on_str)
    except ValueError:
        return [{"row": 0, "errors": [f"Invalid date format: {played_on_str!r}, expected YYYY-MM-DD"]}]

    if not resolve_season_for_date(db, played_on):
        return [{"row": 0, "errors": [f"No season found covering date {played_on}. Create a season first."]}]

    from ..models import Player as PlayerModel
    known_ids: set[int] = {row.id for row in db.query(PlayerModel.id).all()}
    result = []
    for i, game in enumerate(games, start=1):
        errs = validate_game_row_ids(i, game.team_a, game.score_a, game.team_b, game.score_b, known_ids)
        if errs:
            result.append({"row": i, "errors": errs})
    return result


def ingest_games(
    db: Session,
    played_on_str: str,
    games: list,
) -> tuple[int, list[str]]:
    """Persist a list of GameRowIn objects. Validates first; returns (games_loaded, errors)."""
    from ..models import Player as PlayerModel
    known_ids: set[int] = {row.id for row in db.query(PlayerModel.id).all()}

    all_errors: list[str] = []
    for i, game in enumerate(games, start=1):
        all_errors.extend(validate_game_row_ids(i, game.team_a, game.score_a, game.team_b, game.score_b, known_ids))
    if all_errors:
        return 0, all_errors

    try:
        played_on = date.fromisoformat(played_on_str)
    except ValueError:
        return 0, [f"Invalid date format: {played_on_str!r}, expected YYYY-MM-DD"]

    # Season is required — Game.season_id is NOT NULL
    season = resolve_season_for_date(db, played_on)
    if not season:
        return 0, [f"No season found covering date {played_on}. Create a season first."]

    loaded = 0
    for i, game in enumerate(games, start=1):
        existing = db.query(Game).filter(
            Game.played_on == played_on,
            Game.game_number == i,
        ).first()
        if existing:
            continue

        g = Game(
            played_on=played_on,
            season_id=season.id,
            game_number=i,
            team_a_score=game.score_a,
            team_b_score=game.score_b,
        )
        db.add(g)
        db.flush()

        for pid, team in [
            (game.team_a[0], "A"), (game.team_a[1], "A"),
            (game.team_b[0], "B"), (game.team_b[1], "B"),
        ]:
            db.add(GamePlayer(game_id=g.id, player_id=pid, team=team))
        loaded += 1

    return loaded, []
