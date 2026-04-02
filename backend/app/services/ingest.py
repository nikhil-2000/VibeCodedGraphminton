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
