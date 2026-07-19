import pytest
from fastapi.testclient import TestClient


def _create_player(client: TestClient, name: str) -> int:
    return client.post("/players", json={"canonical_name": name, "is_sub": False, "aliases": []}).json()["id"]


@pytest.fixture
def seeded_games(client: TestClient):
    a = _create_player(client, "GA")
    b = _create_player(client, "GB")
    x = _create_player(client, "GX")
    y = _create_player(client, "GY")

    client.post("/ingest/scores", json={"files": [
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        "08-04-2024,1,GA,GB,21,GX,GY,9\n"
        "08-04-2024,2,GA,GX,21,GB,GY,15\n"
    ]})
    return {"a": a, "b": b, "x": x, "y": y}


def test_list_games(client: TestClient, seeded_games):
    response = client.get("/games")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_filter_games_by_week(client: TestClient, seeded_games):
    # seeded data is the only session → session rank 1
    response = client.get("/games?week=1")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_filter_games_by_player(client: TestClient, seeded_games):
    pid = seeded_games["a"]
    response = client.get(f"/games?player_id={pid}")
    assert response.status_code == 200
    assert len(response.json()) == 2  # GA played in both games


def test_filter_games_by_team(client: TestClient, seeded_games):
    a, b = seeded_games["a"], seeded_games["b"]
    response = client.get(f"/games?team={a},{b}")
    assert response.status_code == 200
    assert len(response.json()) == 1  # GA+GB only partnered in game 1


def test_filter_games_by_vs(client: TestClient, seeded_games):
    a, x = seeded_games["a"], seeded_games["x"]
    response = client.get(f"/games?vs={a},{x}")
    assert response.status_code == 200
    # GA (team A) and GX (team B) are opponents in game 1, partners in game 2
    assert len(response.json()) == 1


def test_get_game_detail(client: TestClient, seeded_games):
    games = client.get("/games").json()
    game_id = games[0]["id"]
    response = client.get(f"/games/{game_id}")
    assert response.status_code == 200
    data = response.json()
    assert "team_a" in data
    assert len(data["team_a"]) == 2
    assert len(data["team_b"]) == 2


def test_get_game_not_found(client: TestClient):
    assert client.get("/games/99999").status_code == 404


# ── Deletion tests ──────────────────────────────────────────────────────────

def test_delete_game(client: TestClient, seeded_games):
    games = client.get("/games").json()
    game_id = games[0]["id"]
    resp = client.delete(f"/games/{game_id}")
    assert resp.status_code == 204
    remaining = client.get("/games").json()
    assert all(g["id"] != game_id for g in remaining)


def test_delete_game_not_found(client: TestClient):
    resp = client.delete("/games/999999")
    assert resp.status_code == 404


def test_delete_session(client: TestClient, seeded_games):
    resp = client.delete("/games/session/2024-04-08")
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 2
    assert client.get("/games").json() == []


def test_delete_session_no_games(client: TestClient):
    resp = client.delete("/games/session/2000-01-01")
    assert resp.status_code == 200
    assert resp.json()["deleted"] == 0


def test_delete_session_invalid_date(client: TestClient):
    resp = client.delete("/games/session/not-a-date")
    assert resp.status_code == 422
