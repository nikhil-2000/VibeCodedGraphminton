"""Coverage for /stats/vs-pairings-leaderboard.

Ranks players by how often they faced pairs drawn entirely from a given
set of players.
"""
import pytest
from fastapi.testclient import TestClient


def _create_player(client: TestClient, name: str) -> int:
    r = client.post("/players", json={"canonical_name": name, "is_sub": False, "aliases": []})
    assert r.status_code == 201
    return r.json()["id"]


@pytest.fixture
def seeded(client: TestClient):
    ids = {n: _create_player(client, n) for n in ("VA", "VB", "VX", "VY", "VZ")}
    # VX+VY partner as opponents of VA+VB twice; VA loses once, wins once.
    # Third game swaps VY for VZ so VX+VZ is a different opposing pair.
    client.post("/ingest/scores", json={"files": [
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        "08-04-2024,1,VA,VB,21,VX,VY,9\n"
        "08-04-2024,2,VA,VB,15,VX,VY,21\n"
        "08-04-2024,3,VA,VB,21,VX,VZ,11\n"
    ]})
    return ids


def test_empty_pair_player_ids_returns_empty(client: TestClient, seeded):
    r = client.get("/stats/vs-pairings-leaderboard")
    assert r.status_code == 200
    assert r.json() == []


def test_counts_games_against_pairs_drawn_from_the_given_players(client: TestClient, seeded):
    """With VX and VY given, only the two VX+VY games count."""
    r = client.get(
        f"/stats/vs-pairings-leaderboard?pair_player_ids={seeded['VX']}&pair_player_ids={seeded['VY']}"
    )
    assert r.status_code == 200
    rows = {row["canonical_name"]: row for row in r.json()}

    # VA and VB each faced the VX+VY pair twice, winning one of the two.
    for name in ("VA", "VB"):
        assert rows[name]["games_faced"] == 2
        assert rows[name]["wins"] == 1
        assert rows[name]["losses"] == 1
        assert rows[name]["win_rate"] == 0.5

    # VX and VY were the pair, never facing it, so they must not appear.
    assert "VX" not in rows and "VY" not in rows


def test_widening_the_player_set_includes_more_opposing_pairs(client: TestClient, seeded):
    """Adding VZ admits the VX+VZ pair, so VA/VB's faced count rises to 3."""
    q = "&".join(
        f"pair_player_ids={seeded[n]}" for n in ("VX", "VY", "VZ")
    )
    rows = {r["canonical_name"]: r for r in client.get(f"/stats/vs-pairings-leaderboard?{q}").json()}
    assert rows["VA"]["games_faced"] == 3
    assert rows["VA"]["wins"] == 2


def test_single_player_set_has_no_pairs_to_face(client: TestClient, seeded):
    """A pair needs two players, so one id alone yields no rows."""
    r = client.get(f"/stats/vs-pairings-leaderboard?pair_player_ids={seeded['VX']}")
    assert r.status_code == 200
    assert r.json() == []


def test_sort_by_games_faced_is_descending(client: TestClient, seeded):
    q = "&".join(f"pair_player_ids={seeded[n]}" for n in ("VX", "VY", "VZ"))
    rows = client.get(f"/stats/vs-pairings-leaderboard?{q}&sort_by=games_faced").json()
    counts = [r["games_faced"] for r in rows]
    assert counts == sorted(counts, reverse=True)


def test_sort_by_win_rate_is_descending(client: TestClient, seeded):
    q = "&".join(f"pair_player_ids={seeded[n]}" for n in ("VX", "VY", "VZ"))
    rows = client.get(f"/stats/vs-pairings-leaderboard?{q}&sort_by=win_rate").json()
    rates = [r["win_rate"] for r in rows]
    assert rates == sorted(rates, reverse=True)
