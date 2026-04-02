from datetime import date
from app.services.ingest import RawGameRow, validate_game_row, parse_csv_rows


def test_valid_game_passes_validation():
    row = RawGameRow(
        row_number=2, played_on=date(2024, 4, 8),
        game_number=1,
        name_a="Bhavin", name_b="Chets",
        team_a_score=21,
        name_x="Chan", name_y="Jayesh",
        team_b_score=9,
    )
    assert validate_game_row(row) == []


def test_winning_score_below_21_is_invalid():
    row = RawGameRow(
        row_number=2, played_on=date(2024, 4, 8),
        game_number=1,
        name_a="A", name_b="B", team_a_score=20,
        name_x="C", name_y="D", team_b_score=5,
    )
    errors = validate_game_row(row)
    assert len(errors) == 1
    assert "21" in errors[0]


def test_margin_below_2_is_invalid():
    row = RawGameRow(
        row_number=2, played_on=date(2024, 4, 8),
        game_number=1,
        name_a="A", name_b="B", team_a_score=21,
        name_x="C", name_y="D", team_b_score=20,
    )
    errors = validate_game_row(row)
    assert len(errors) == 1
    assert "margin" in errors[0].lower()


def test_deuce_style_score_is_valid():
    # e.g. 22-20 is valid (>=21, margin >=2)
    row = RawGameRow(
        row_number=2, played_on=date(2024, 4, 8),
        game_number=1,
        name_a="A", name_b="B", team_a_score=22,
        name_x="C", name_y="D", team_b_score=20,
    )
    assert validate_game_row(row) == []


def test_duplicate_player_in_game_is_invalid():
    row = RawGameRow(
        row_number=2, played_on=date(2024, 4, 8),
        game_number=1,
        name_a="Bhavin", name_b="Bhavin", team_a_score=21,
        name_x="Chan", name_y="Jayesh", team_b_score=9,
    )
    errors = validate_game_row(row)
    assert len(errors) == 1
    assert "duplicate" in errors[0].lower()


def test_parse_csv_rows_valid():
    lines = [
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY",
        "08-04-2024,1,Bhavin,Chets,21,Chan,Jayesh,9",
        "08-04-2024,2,Bhavin,Chan,16,Chets,Jayesh,21",
    ]
    rows, errors = parse_csv_rows(lines)
    assert errors == []
    assert len(rows) == 2
    assert rows[0].name_a == "Bhavin"
    assert rows[0].team_a_score == 21
    assert rows[0].played_on == date(2024, 4, 8)


def test_parse_csv_rows_wrong_column_count():
    lines = ["Date,GameNo,A,B,PtsAB,X,Y,PtsXY", "08-04-2024,1,Bhavin,Chets,21"]
    rows, errors = parse_csv_rows(lines)
    assert len(errors) == 1
    assert "columns" in errors[0].lower()


def test_parse_csv_rows_bad_date():
    lines = ["Date,GameNo,A,B,PtsAB,X,Y,PtsXY", "not-a-date,1,A,B,21,C,D,9"]
    rows, errors = parse_csv_rows(lines)
    assert len(errors) == 1
    assert "parse error" in errors[0].lower()


def test_cross_team_duplicate_player_is_invalid():
    row = RawGameRow(
        row_number=3, played_on=date(2024, 4, 8),
        game_number=1,
        name_a="Bhavin", name_b="Chets", team_a_score=21,
        name_x="Bhavin", name_y="Jayesh", team_b_score=9,
    )
    errors = validate_game_row(row)
    assert len(errors) == 1
    assert "duplicate" in errors[0].lower()


def test_duplicate_player_case_insensitive():
    row = RawGameRow(
        row_number=4, played_on=date(2024, 4, 8),
        game_number=1,
        name_a="Bhavin", name_b="Chets", team_a_score=21,
        name_x="bhavin", name_y="Jayesh", team_b_score=9,
    )
    errors = validate_game_row(row)
    assert len(errors) == 1
    assert "duplicate" in errors[0].lower()
