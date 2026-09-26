"""The prediction endpoint must build its expectations from the games in scope.

A prediction shown next to a filtered view should be derived from the same games
that view reports on, otherwise the numbers disagree with everything around them.
"""
import pytest
from fastapi.testclient import TestClient


USER_ID = "pred-filter-user"


def _create_player(client: TestClient, name: str, is_sub: bool = False) -> int:
    r = client.post("/players", json={"canonical_name": name, "is_sub": is_sub, "aliases": []})
    assert r.status_code == 201
    return r.json()["id"]


@pytest.fixture
def two_season_games(client: TestClient):
    """One regular foursome playing two sessions, one per season, with opposite results."""
    players = {k: _create_player(client, n) for k, n in
               [("a", "PFA"), ("b", "PFB"), ("x", "PFX"), ("y", "PFY")]}

    season_two = client.post("/seasons", json={"name": "Pred Season 2", "start_date": "2025-01-01"}).json()

    # Session 1 (default season): A+B dominate 21-2, repeatedly.
    client.post("/ingest/scores", json={"files": [
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        "08-04-2024,1,PFA,PFB,21,PFX,PFY,2\n"
        "08-04-2024,2,PFA,PFB,21,PFX,PFY,3\n"
    ]})

    # Session 2: same foursome, but X+Y dominate instead.
    client.post("/ingest/scores", json={"files": [
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        "05-05-2025,1,PFA,PFB,4,PFX,PFY,21\n"
        "05-05-2025,2,PFA,PFB,5,PFX,PFY,21\n"
    ]})

    games = client.get("/games").json()
    # Reassign the 2025 session's games to season 2 so the two sessions differ by season.
    season_two_game_ids = [g["id"] for g in games if g["played_on"].startswith("2025")]
    return {"players": players, "season_two": season_two, "games": games,
            "season_two_game_ids": season_two_game_ids}


def _set_preferences(client: TestClient, player_id: int, **overrides) -> None:
    body = {"player_id": player_id, "preset": "everyone", "custom_player_ids": []}
    body.update(overrides)
    r = client.post("/preferences", json=body, headers={"X-User-ID": USER_ID})
    assert r.status_code in (201, 200), r.text


def test_prediction_respects_custom_roster_filter(client: TestClient, two_season_games):
    """Restricting the roster must change the games a prediction is built from.

    With only the 2024 games in scope, A+B look dominant; adding a filter that
    excludes those games has to move the expected scores.
    """
    players = two_season_games["players"]
    target = two_season_games["games"][0]

    unfiltered = client.get(f"/games/{target['id']}/prediction").json()

    # Scope down to a roster that excludes PFY, which drops every seeded game
    # (each game includes PFY), leaving predictions with no shared history.
    roster = [players["a"], players["b"], players["x"]]
    _set_preferences(client, players["a"], preset="custom", custom_player_ids=roster)

    filtered = client.get(
        f"/games/{target['id']}/prediction", headers={"X-User-ID": USER_ID}
    ).json()

    assert filtered != unfiltered, (
        "prediction ignored the active roster filter: "
        f"unfiltered={unfiltered} filtered={filtered}"
    )


def test_prediction_without_filters_still_works(client: TestClient, two_season_games):
    """The unfiltered path must keep its previous behaviour."""
    target = two_season_games["games"][0]
    r = client.get(f"/games/{target['id']}/prediction")
    assert r.status_code == 200
    body = r.json()
    assert body["expected_winner"] in ("A", "B")
    assert body["actual_winner"] in ("A", "B")
    assert isinstance(body["upset"], bool)
    assert body["expected_score_a"] > 0
    assert body["expected_score_b"] > 0


def test_prediction_falls_back_to_overall_average_when_scope_is_empty(
    client: TestClient, two_season_games
):
    """With no shared games in scope, players fall back to their overall average.

    That fallback is also filter-scoped, so an empty scope must not crash or
    produce a negative/NaN score.
    """
    players = two_season_games["players"]
    target = two_season_games["games"][0]

    # A roster of a single player excludes every 4-player game.
    _set_preferences(client, players["a"], preset="custom", custom_player_ids=[players["a"]])

    r = client.get(f"/games/{target['id']}/prediction", headers={"X-User-ID": USER_ID})
    assert r.status_code == 200
    body = r.json()
    assert body["expected_score_a"] == 0.0
    assert body["expected_score_b"] == 0.0
