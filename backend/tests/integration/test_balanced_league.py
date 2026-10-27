import pytest
from fastapi.testclient import TestClient


def _create_player(client: TestClient, name: str) -> int:
    return client.post("/players", json={"canonical_name": name, "is_sub": False, "aliases": []}).json()["id"]


@pytest.fixture
def seed(client: TestClient) -> dict[str, int]:
    """Five players. Week 1 plays all 3 splits of p1-p4; week 2 only 1 split of p1,p2,p3,p5."""
    ids = {f"p{i}": _create_player(client, f"Bl{i}") for i in range(1, 6)}
    weeks = [
        ("08-04-2024", ["Bl1,Bl2,21,Bl3,Bl4,10", "Bl1,Bl3,21,Bl2,Bl4,12", "Bl1,Bl4,15,Bl2,Bl3,21"]),
        ("15-04-2024", ["Bl1,Bl2,21,Bl3,Bl5,18"]),
    ]
    for date, games in weeks:
        rows = "".join(f"{date},{n},{g}\n" for n, g in enumerate(games, start=1))
        client.post("/ingest/scores", json={"files": [f"Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n{rows}"]})
    return ids


def test_strict_league_stops_after_the_seed(client: TestClient, seed):
    body = client.get("/balanced-league").json()
    assert len(body["steps"]) == 1
    assert sorted(body["player_ids"]) == sorted(seed[f"p{i}"] for i in range(1, 5))
    assert len(body["games"]) == 3
    assert body["steps"][0]["game_ids"] == [g["id"] for g in body["games"]]


def test_relaxing_coverage_cannot_add_a_poorly_covered_player(client: TestClient, seed):
    # p5 is in 1 of the 12 matchups it would need
    body = client.get("/balanced-league", params={"min_coverage": 0.5}).json()
    assert len(body["steps"]) == 1


def test_low_coverage_admits_p5(client: TestClient, seed):
    body = client.get("/balanced-league", params={"min_coverage": 0.05}).json()
    assert [len(s["player_ids"]) for s in body["steps"]] == [4, 1]
    assert body["steps"][1]["player_ids"] == [seed["p5"]]
    assert (body["steps"][1]["covered"], body["steps"][1]["required"]) == (1, 12)
    assert len(body["games"]) == 4


def test_rejects_out_of_range_coverage(client: TestClient, seed):
    assert client.get("/balanced-league", params={"min_coverage": 0}).status_code == 422
    assert client.get("/balanced-league", params={"min_coverage": 1.5}).status_code == 422
