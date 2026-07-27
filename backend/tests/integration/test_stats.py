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


@pytest.fixture
def two_games(client: TestClient):
    """Game 1: Alpha+Beta beat Xray+Yankee 21-9. Game 2: Alpha+Xray beat Beta+Yankee 21-15."""
    a = _create_player(client, "Alpha")
    b = _create_player(client, "Beta")
    x = _create_player(client, "Xray")
    y = _create_player(client, "Yankee")
    _ingest(client,
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        "08-04-2024,1,Alpha,Beta,21,Xray,Yankee,9\n"
        "08-04-2024,2,Alpha,Xray,21,Beta,Yankee,15\n"
    )
    return {"a": a, "b": b, "x": x, "y": y}


def test_all_partnerships(client: TestClient, two_games):
    response = client.get("/stats/partnerships")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 2  # Alpha+Beta and Alpha+Xray


def test_partnerships_for_unknown_player(client: TestClient):
    assert client.get("/stats/partnerships/99999").status_code == 404


def test_partnerships_for_player(client: TestClient, two_games):
    pid = two_games["a"]
    response = client.get(f"/stats/partnerships/{pid}")
    assert response.status_code == 200
    data = response.json()
    partner_ids = [p["partner_id"] for p in data]
    assert two_games["b"] in partner_ids
    assert two_games["x"] in partner_ids


def test_specific_partnership(client: TestClient, two_games):
    a, b = two_games["a"], two_games["b"]
    response = client.get(f"/stats/partnerships/{a}/{b}")
    assert response.status_code == 200
    data = response.json()
    assert data["games_together"] == 1
    assert data["wins"] == 1


def test_head_to_head(client: TestClient, two_games):
    a, b = two_games["a"], two_games["b"]
    response = client.get(f"/stats/head-to-head/{a}/{b}")
    assert response.status_code == 200
    data = response.json()
    # Game 2: Alpha+Xray (team A, 21) beat Beta+Yankee (team B, 15) — Alpha wins
    assert data["player_a_wins"] == 1
    assert data["player_b_wins"] == 0


def test_matchup(client: TestClient, two_games):
    a, b, x, y = two_games["a"], two_games["b"], two_games["x"], two_games["y"]
    response = client.get(f"/stats/matchup/{a},{b}/vs/{x},{y}")
    assert response.status_code == 200
    data = response.json()
    assert data["pair_a_wins"] == 1
    assert data["pair_b_wins"] == 0


@pytest.fixture
def mixed_fixture(client: TestClient):
    """
    Game 1 (regulars only): RegA+RegB beat RegX+RegY 21-9
    Game 2 (includes sub):  RegA+SubS beat RegB+RegY 21-15
    """
    a = _create_player(client, "RegA")
    b = _create_player(client, "RegB")
    x = _create_player(client, "RegX")
    y = _create_player(client, "RegY")
    s = client.post("/players", json={"canonical_name": "SubS", "is_sub": True, "aliases": []}).json()["id"]
    resp = client.post("/ingest/scores", json={"files": [
        "08-04-2024,1,RegA,RegB,21,RegX,RegY,9\n"
        "08-04-2024,2,RegA,SubS,21,RegB,RegY,15\n"
    ]})
    assert resp.status_code == 200, resp.json()
    return {"a": a, "b": b, "x": x, "y": y, "s": s}


def test_leaderboard_player_ids_filter(client: TestClient, mixed_fixture):
    a, b, x, y, s = mixed_fixture["a"], mixed_fixture["b"], mixed_fixture["x"], mixed_fixture["y"], mixed_fixture["s"]
    regular_ids = [a, b, x, y]

    # Unfiltered: RegA has 2 games (played in both)
    unfiltered = {e["player_id"]: e for e in client.get("/stats/leaderboard").json()}
    assert unfiltered[a]["games_played"] == 2

    # Set up preferences with custom player_ids filter
    user_id = "test-filter-user"
    client.post("/preferences", json={
        "player_id": a,
        "preset": "custom",
        "custom_player_ids": regular_ids,
        "season_id": None,
    }, headers={"X-User-ID": user_id})

    # Filtered via prefs: RegA has 1 game, SubS absent
    filtered = {e["player_id"]: e for e in client.get(
        "/stats/leaderboard", headers={"X-User-ID": user_id}
    ).json()}
    assert filtered[a]["games_played"] == 1
    assert s not in filtered


def test_player_stats_player_ids_filter(client: TestClient, mixed_fixture):
    a, s = mixed_fixture["a"], mixed_fixture["s"]
    regular_ids = [mixed_fixture["a"], mixed_fixture["b"], mixed_fixture["x"], mixed_fixture["y"]]

    unfiltered = client.get(f"/stats/player/{a}").json()
    assert unfiltered["games_played"] == 2

    # Set up preferences with custom player_ids filter
    user_id = "test-stats-filter-user"
    client.post("/preferences", json={
        "player_id": a,
        "preset": "custom",
        "custom_player_ids": regular_ids,
        "season_id": None,
    }, headers={"X-User-ID": user_id})

    filtered = client.get(f"/stats/player/{a}", headers={"X-User-ID": user_id}).json()
    assert filtered["games_played"] == 1
