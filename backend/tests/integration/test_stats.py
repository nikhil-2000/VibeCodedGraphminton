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
def sub_fixture(client: TestClient):
    """
    Two games:
      Game 1 (regulars only, 08-04-2024): RegA+RegB beat RegX+RegY 21-9
      Game 2 (has sub, 08-04-2024):       RegA+SubS beat RegB+RegY 21-15
    RegA plays in both; SubS is a sub.
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


def test_leaderboard_excludes_subs(client: TestClient, sub_fixture):
    """Subs never appear on the leaderboard."""
    s = sub_fixture["s"]
    entries = client.get("/stats/leaderboard").json()
    player_ids_on_board = [e["player_id"] for e in entries]
    assert s not in player_ids_on_board


def test_leaderboard_regular_counts_sub_week_games(client: TestClient, sub_fixture):
    """Regulars get credit for games played in sub weeks (RegA played 2 games)."""
    a = sub_fixture["a"]
    entries = {e["player_id"]: e for e in client.get("/stats/leaderboard").json()}
    assert entries[a]["games_played"] == 2


def test_partnerships_exclude_sub_games(client: TestClient, sub_fixture):
    """Partnerships involving a sub should not appear."""
    s = sub_fixture["s"]
    data = client.get("/stats/partnerships").json()
    for p in data:
        assert s not in (p["player_a_id"], p["player_b_id"]), \
            f"SubS appeared in partnership: {p}"


def test_partnerships_regular_only_game_counts(client: TestClient, sub_fixture):
    """RegA+RegB partnership only counts game 1 (not game 2 which had SubS)."""
    a, b = sub_fixture["a"], sub_fixture["b"]
    resp = client.get(f"/stats/partnerships/{a}/{b}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["games_together"] == 1


def test_head_to_head_excludes_sub_games(client: TestClient, sub_fixture):
    """H2H between RegA and RegB only counts game 2... but game 2 has SubS so it's excluded."""
    a, b = sub_fixture["a"], sub_fixture["b"]
    # Game 1: RegA+RegB on same team — not h2h
    # Game 2: RegA+SubS vs RegB+RegY — excluded (has sub)
    # Result: 0 h2h games
    data = client.get(f"/stats/head-to-head/{a}/{b}").json()
    assert data["games_played"] == 0


def test_player_stats_include_sub_games(client: TestClient, sub_fixture):
    """Individual player stats count all games including sub weeks."""
    a = sub_fixture["a"]
    data = client.get(f"/stats/player/{a}").json()
    assert data["games_played"] == 2


def test_leaderboard_mini_league_excludes_subs_shows_sub_week_games(client: TestClient, sub_fixture):
    """
    With a custom player filter of just regulars [a, b, x, y]:
    - SubS must not appear
    - RegA must still have 2 games (sub week counts for individual stats)
    """
    a, b, x, y, s = sub_fixture["a"], sub_fixture["b"], sub_fixture["x"], sub_fixture["y"], sub_fixture["s"]
    user_id = "test-mini-league-user"
    client.post("/preferences", json={
        "player_id": a,
        "preset": "custom",
        "custom_player_ids": [a, b, x, y],
        "season_id": None,
    }, headers={"X-User-ID": user_id})

    entries = {e["player_id"]: e for e in client.get(
        "/stats/leaderboard", headers={"X-User-ID": user_id}
    ).json()}
    assert s not in entries, "SubS should not appear in leaderboard"
    assert entries[a]["games_played"] == 2, "RegA played in sub week, should count"


def test_suggested_games_exclude_sub_players(client: TestClient, sub_fixture):
    """Sub players must not appear in suggested games."""
    data = client.get("/stats/suggested-games").json()
    for suggestion in data:
        assert "SubS" not in suggestion["team_a"], \
            f"SubS appeared in team_a of suggested game: {suggestion}"
        assert "SubS" not in suggestion["team_b"], \
            f"SubS appeared in team_b of suggested game: {suggestion}"


def test_pairings_leaderboard(client: TestClient, game_fixture):
    response = client.get("/stats/pairings-leaderboard")
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2  # A+B and X+Y
    # Each entry has expected fields
    entry = data[0]
    assert "player_a_id" in entry
    assert "player_a_name" in entry
    assert "player_b_id" in entry
    assert "player_b_name" in entry
    assert "games_together" in entry
    assert "wins" in entry
    assert "losses" in entry
    assert "win_rate" in entry
    assert "avg_points" in entry


def test_pairings_leaderboard_sort_by_win_rate(client: TestClient, game_fixture):
    data = client.get("/stats/pairings-leaderboard?sort_by=win_rate").json()
    # A+B won (win_rate=1.0) should be first
    assert data[0]["win_rate"] >= data[1]["win_rate"]
    names_a = {data[0]["player_a_name"], data[0]["player_b_name"]}
    assert names_a == {"PlayerA", "PlayerB"}


def test_pairings_leaderboard_sort_by_avg_points(client: TestClient, game_fixture):
    data = client.get("/stats/pairings-leaderboard?sort_by=avg_points").json()
    # A+B scored 21, X+Y scored 9 — A+B first
    assert data[0]["avg_points"] >= data[1]["avg_points"]
    assert data[0]["avg_points"] == 21.0
    assert data[1]["avg_points"] == 9.0
