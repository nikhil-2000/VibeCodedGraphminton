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


# ---------------------------------------------------------------------------
# Coverage gaps: head_to_head_all, pairings_faced, leaderboard game_ids filter,
# specific_partnership zero-games path, _win_split loser branch
# ---------------------------------------------------------------------------

@pytest.fixture
def h2h_fixture(client: TestClient):
    """Two games where A and X always oppose each other.

    Game 1 (Apr 8):  A+B beat X+Y 21-9   (A wins)
    Game 2 (Apr 15): X+Y beat A+B 21-15  (A loses)

    Two separate ingest calls because ingest/scores requires all rows
    in a single call to share the same date.
    """
    a = _create_player(client, "H2HA")
    b = _create_player(client, "H2HB")
    x = _create_player(client, "H2HX")
    y = _create_player(client, "H2HY")
    _ingest(client,
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        "08-04-2024,1,H2HA,H2HB,21,H2HX,H2HY,9\n"
    )
    _ingest(client,
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        "15-04-2024,1,H2HX,H2HY,21,H2HA,H2HB,15\n"
    )
    games = client.get("/games").json()
    game_ids = [g["id"] for g in games]
    return {"a": a, "b": b, "x": x, "y": y, "game_ids": game_ids}


# --- get_head_to_head_all ---

def test_head_to_head_all_returns_opponents(client: TestClient, h2h_fixture):
    pid = h2h_fixture["a"]
    r = client.get(f"/stats/head-to-head/{pid}/all")
    assert r.status_code == 200
    rows = {entry["opponent_id"]: entry for entry in r.json()}
    # A faced X and Y across both games
    assert h2h_fixture["x"] in rows
    assert h2h_fixture["y"] in rows


def test_head_to_head_all_win_loss_counts(client: TestClient, h2h_fixture):
    """A played X twice: won once, lost once."""
    pid = h2h_fixture["a"]
    r = client.get(f"/stats/head-to-head/{pid}/all")
    rows = {entry["opponent_id"]: entry for entry in r.json()}
    a_vs_x = rows[h2h_fixture["x"]]
    assert a_vs_x["games_played"] == 2
    assert a_vs_x["wins"] == 1
    assert a_vs_x["losses"] == 1


def test_head_to_head_all_sorted_by_win_rate(client: TestClient, h2h_fixture):
    """Result sorted descending by win rate."""
    r = client.get(f"/stats/head-to-head/{h2h_fixture['a']}/all")
    rates = [
        row["wins"] / row["games_played"] if row["games_played"] else 0
        for row in r.json()
    ]
    assert rates == sorted(rates, reverse=True)


def test_head_to_head_all_no_win_rate_field(client: TestClient, h2h_fixture):
    """win_rate is intentionally absent from the head-to-head-all response."""
    r = client.get(f"/stats/head-to-head/{h2h_fixture['a']}/all")
    for entry in r.json():
        assert "win_rate" not in entry


def test_head_to_head_loser_perspective(client: TestClient, h2h_fixture):
    """X won game 2 against A — _win_split's else branch."""
    pid = h2h_fixture["x"]
    r = client.get(f"/stats/head-to-head/{pid}/all")
    rows = {entry["opponent_id"]: entry for entry in r.json()}
    x_vs_a = rows[h2h_fixture["a"]]
    assert x_vs_a["wins"] == 1
    assert x_vs_a["losses"] == 1


# --- get_pairings_faced ---

def test_pairings_faced_returns_opposing_pairs(client: TestClient, h2h_fixture):
    pid = h2h_fixture["a"]
    r = client.get(f"/stats/pairings-faced/{pid}")
    assert r.status_code == 200
    data = r.json()
    assert len(data) >= 1
    entry = data[0]
    for field in ("pair_player_a_id", "pair_player_a_name",
                  "pair_player_b_id", "pair_player_b_name",
                  "games_faced", "wins", "losses", "win_rate"):
        assert field in entry, f"missing field: {field}"


def test_pairings_faced_correct_counts(client: TestClient, h2h_fixture):
    """A faced X+Y twice: won once, lost once."""
    pid = h2h_fixture["a"]
    r = client.get(f"/stats/pairings-faced/{pid}")
    x_id, y_id = h2h_fixture["x"], h2h_fixture["y"]
    pairs = {
        (e["pair_player_a_id"], e["pair_player_b_id"]): e
        for e in r.json()
    }
    lo, hi = min(x_id, y_id), max(x_id, y_id)
    assert (lo, hi) in pairs
    entry = pairs[(lo, hi)]
    assert entry["games_faced"] == 2
    assert entry["wins"] == 1
    assert entry["losses"] == 1
    assert entry["win_rate"] == 0.5


def test_pairings_faced_sorted_by_games_faced(client: TestClient, h2h_fixture):
    """Results sorted descending by games_faced."""
    r = client.get(f"/stats/pairings-faced/{h2h_fixture['a']}")
    counts = [e["games_faced"] for e in r.json()]
    assert counts == sorted(counts, reverse=True)


def test_pairings_faced_pair_ids_normalised(client: TestClient, h2h_fixture):
    """pair_player_a_id is always <= pair_player_b_id."""
    r = client.get(f"/stats/pairings-faced/{h2h_fixture['a']}")
    for entry in r.json():
        assert entry["pair_player_a_id"] <= entry["pair_player_b_id"]


# --- leaderboard game_ids filter ---

def test_leaderboard_game_ids_filter(client: TestClient, h2h_fixture):
    """Passing explicit game_ids limits the leaderboard to those games."""
    first_game_id = min(h2h_fixture["game_ids"])
    r = client.get(f"/stats/leaderboard?game_ids={first_game_id}")
    assert r.status_code == 200
    # All four players played but each only appears once
    filtered = {e["player_id"]: e for e in r.json()}
    assert len(filtered) == 4
    for entry in filtered.values():
        assert entry["games_played"] == 1
    # Unfiltered has 2 games each
    unfiltered = {e["player_id"]: e for e in client.get("/stats/leaderboard").json()}
    for pid, entry in filtered.items():
        assert entry["games_played"] < unfiltered[pid]["games_played"]


# --- specific_partnership zero-games path ---

def test_specific_partnership_no_shared_games(client: TestClient, h2h_fixture):
    """A and X were never partners — should return zeros, not 404."""
    a_id = h2h_fixture["a"]
    x_id = h2h_fixture["x"]
    r = client.get(f"/stats/partnerships/{a_id}/{x_id}")
    assert r.status_code == 200
    body = r.json()
    assert body["games_together"] == 0
    assert body["wins"] == 0
    assert body["losses"] == 0
    assert body["win_rate"] == 0.0


# --- _win_split: loser branch in get_head_to_head and get_matchup ---

def test_head_to_head_player_b_wins(client: TestClient, h2h_fixture):
    """X won game 2 as player_a in that ingest — hitting _win_split else branch."""
    a_id, x_id = h2h_fixture["a"], h2h_fixture["x"]
    r = client.get(f"/stats/head-to-head/{a_id}/{x_id}")
    assert r.status_code == 200
    data = r.json()
    assert data["player_a_wins"] == 1
    assert data["player_b_wins"] == 1
    assert data["games_played"] == 2


def test_matchup_second_pair_wins(client: TestClient, h2h_fixture):
    """H2HX+H2HY won one game — pair_b_wins > 0 hits _win_split else branch."""
    a_id, b_id = h2h_fixture["a"], h2h_fixture["b"]
    x_id, y_id = h2h_fixture["x"], h2h_fixture["y"]
    r = client.get(f"/stats/matchup/{a_id},{b_id}/vs/{x_id},{y_id}")
    assert r.status_code == 200
    data = r.json()
    assert data["pair_a_wins"] == 1
    assert data["pair_b_wins"] == 1
    assert data["games_played"] == 2
