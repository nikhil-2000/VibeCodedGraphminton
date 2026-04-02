from dataclasses import dataclass
from datetime import date, datetime


@dataclass
class RawGameRow:
    row_number: int
    played_on: date
    week_number: int
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


def parse_csv_rows(lines: list[str], week_number: int) -> tuple[list[RawGameRow], list[str]]:
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
            week_number=week_number,
            game_number=game_number,
            name_a=parts[2],
            name_b=parts[3],
            team_a_score=team_a_score,
            name_x=parts[5],
            name_y=parts[6],
            team_b_score=team_b_score,
        ))

    return rows, errors


import os
from sqlalchemy.orm import Session
from ..models import PlayerAlias, Game, GamePlayer


def resolve_aliases(db: Session) -> dict[str, int]:
    """Return mapping of alias (lowercased) → player_id for all aliases in DB."""
    rows = db.query(PlayerAlias.alias, PlayerAlias.player_id).all()
    return {row.alias.lower(): row.player_id for row in rows}


def ingest_csv_file(
    db: Session,
    filepath: str,
    week_number: int,
    alias_map: dict[str, int],
) -> tuple[int, list[str]]:
    """Parse and validate one CSV file. Returns (games_loaded, errors).

    If there are any errors, nothing is written to the DB.
    """
    with open(filepath) as f:
        lines = f.readlines()

    rows, parse_errors = parse_csv_rows(lines, week_number)
    if parse_errors:
        return 0, parse_errors

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
            Game.week_number == row.week_number,
            Game.game_number == row.game_number,
        ).first()
        if existing:
            continue

        game = Game(
            played_on=row.played_on,
            week_number=row.week_number,
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
