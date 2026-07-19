import pytest
from fastapi.testclient import TestClient


def _create_player(client: TestClient, name: str) -> int:
    return client.post("/players", json={"canonical_name": name, "is_sub": False, "aliases": []}).json()["id"]


def test_ingest_games_creates_game(client: TestClient):
    ids = [_create_player(client, n) for n in ["IGA", "IGB", "IGC", "IGD"]]
    resp = client.post("/ingest/games", json={
        "played_on": "2024-04-08",
        "games": [{"team_a": [ids[0], ids[1]], "score_a": 21, "team_b": [ids[2], ids[3]], "score_b": 9}]
    })
    assert resp.status_code == 200
    assert resp.json()["games_loaded"] == 1


def test_ingest_games_invalid_score(client: TestClient):
    ids = [_create_player(client, n) for n in ["IGE", "IGF", "IGG", "IGH"]]
    resp = client.post("/ingest/games", json={
        "played_on": "2024-04-08",
        "games": [{"team_a": [ids[0], ids[1]], "score_a": 15, "team_b": [ids[2], ids[3]], "score_b": 9}]
    })
    assert resp.status_code == 422


def test_ingest_games_duplicate_player(client: TestClient):
    ids = [_create_player(client, n) for n in ["IGI", "IGJ", "IGK"]]
    resp = client.post("/ingest/games", json={
        "played_on": "2024-04-08",
        "games": [{"team_a": [ids[0], ids[1]], "score_a": 21, "team_b": [ids[2], ids[0]], "score_b": 9}]
    })
    assert resp.status_code == 422


def test_ingest_games_unknown_player_id(client: TestClient):
    ids = [_create_player(client, n) for n in ["IGL", "IGM", "IGN"]]
    resp = client.post("/ingest/games", json={
        "played_on": "2024-04-08",
        "games": [{"team_a": [ids[0], ids[1]], "score_a": 21, "team_b": [ids[2], 999999], "score_b": 9}]
    })
    assert resp.status_code == 422


def test_ingest_games_skips_duplicates(client: TestClient):
    ids = [_create_player(client, n) for n in ["IGO", "IGP", "IGQ", "IGR"]]
    payload = {
        "played_on": "2024-04-09",
        "games": [{"team_a": [ids[0], ids[1]], "score_a": 21, "team_b": [ids[2], ids[3]], "score_b": 9}]
    }
    r1 = client.post("/ingest/games", json=payload)
    assert r1.status_code == 200
    assert r1.json()["games_loaded"] == 1
    r2 = client.post("/ingest/games", json=payload)
    assert r2.status_code == 200
    assert r2.json()["games_loaded"] == 0  # duplicate skipped
