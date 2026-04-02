# backend/tests/integration/test_stats.py
from fastapi.testclient import TestClient


def _create_player(client: TestClient, name: str) -> int:
    return client.post("/players", json={
        "canonical_name": name, "is_sub": False, "aliases": []
    }).json()["id"]


def _ingest(client: TestClient, csv: str):
    client.post("/ingest/scores", json={"files": [csv]})


import pytest

@pytest.fixture
def game_fixture(client: TestClient):
    """One game: A+B beat X+Y 21-9. Returns player IDs by key."""
    a = _create_player(client, "PlayerA")
    b = _create_player(client, "PlayerB")
    x = _create_player(client, "PlayerX")
    y = _create_player(client, "PlayerY")
    _ingest(client,
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        "08-04-2024,1,PlayerA,PlayerB,21,PlayerX,PlayerY,9\n"
    )
    return {"a": a, "b": b, "x": x, "y": y}


def test_player_stats(client: TestClient, game_fixture):
    pid = game_fixture["a"]
    response = client.get(f"/players/{pid}/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["games_played"] == 1
    assert data["wins"] == 1
    assert data["losses"] == 0
    assert data["win_rate"] == 1.0
    assert data["avg_points"] == 21.0


def test_player_stats_loser(client: TestClient, game_fixture):
    pid = game_fixture["x"]
    data = client.get(f"/players/{pid}/stats").json()
    assert data["games_played"] == 1
    assert data["wins"] == 0
    assert data["losses"] == 1
    assert data["win_rate"] == 0.0
    assert data["avg_points"] == 9.0


def test_player_stats_not_found(client: TestClient):
    assert client.get("/players/99999/stats").status_code == 404


def test_leaderboard_sort_by_win_rate(client: TestClient, game_fixture):
    response = client.get("/stats/leaderboard?sort_by=win_rate")
    assert response.status_code == 200
    names = [p["canonical_name"] for p in response.json()]
    assert names.index("PlayerA") < names.index("PlayerX")


def test_leaderboard_sort_by_avg_points(client: TestClient, game_fixture):
    response = client.get("/stats/leaderboard?sort_by=avg_points")
    assert response.status_code == 200
    entries = response.json()
    names = [e["canonical_name"] for e in entries]
    assert names.index("PlayerA") < names.index("PlayerX")


def test_leaderboard_default_sort(client: TestClient, game_fixture):
    response = client.get("/stats/leaderboard")
    assert response.status_code == 200
    assert len(response.json()) >= 4
