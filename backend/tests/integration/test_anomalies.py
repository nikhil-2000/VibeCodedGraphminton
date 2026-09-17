import pytest
from fastapi.testclient import TestClient


def _create_player(client: TestClient, name: str) -> int:
    return client.post("/players", json={"canonical_name": name, "is_sub": False, "aliases": []}).json()["id"]


@pytest.fixture
def anomaly_seed(client: TestClient):
    """
    4 players, 4 sessions. AnoA+AnoB always partner (overplayed partnership).
    AnoC+AnoD always partner (overplayed partnership).
    AnoA+AnoC, AnoA+AnoD, AnoB+AnoC, AnoB+AnoD never partner (underplayed).
    All cross-team pairs face each other every game (overplayed h2h).
    AnoA+AnoB and AnoC+AnoD never face each other (underplayed h2h).
    """
    a = _create_player(client, "AnoA")
    b = _create_player(client, "AnoB")
    c = _create_player(client, "AnoC")
    d = _create_player(client, "AnoD")

    # Each date is a separate file (single-date-per-file rule)
    for date in ["08-04-2024", "15-04-2024", "22-04-2024", "29-04-2024"]:
        client.post("/ingest/scores", json={"files": [
            f"Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
            f"{date},1,AnoA,AnoB,21,AnoC,AnoD,9\n"
        ]})

    return {"a": a, "b": b, "c": c, "d": d}


def test_overplayed_partnerships(client: TestClient, anomaly_seed):
    response = client.get("/anomalies/partnerships/overplayed?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    # AnoA+AnoB and AnoC+AnoD both played together 4 times — should appear at top
    top_pair_ids = {data[0]["player_a_id"], data[0]["player_b_id"]}
    ab = {anomaly_seed["a"], anomaly_seed["b"]}
    cd = {anomaly_seed["c"], anomaly_seed["d"]}
    assert top_pair_ids == ab or top_pair_ids == cd


def test_underplayed_partnerships(client: TestClient, anomaly_seed):
    response = client.get("/anomalies/partnerships/underplayed?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    # AnoA+AnoC, AnoA+AnoD, AnoB+AnoC, AnoB+AnoD never partnered — should appear
    all_pairs = [{d["player_a_id"], d["player_b_id"]} for d in data]
    assert {anomaly_seed["a"], anomaly_seed["c"]} in all_pairs


def test_overplayed_head_to_head(client: TestClient, anomaly_seed):
    response = client.get("/anomalies/head-to-head/overplayed?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    # All cross-team pairs face each other 4 times — top result should have actual == 4
    assert data[0]["actual"] == 4


def test_underplayed_head_to_head(client: TestClient, anomaly_seed):
    response = client.get("/anomalies/head-to-head/underplayed?limit=10")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    # AnoA+AnoB and AnoC+AnoD never face each other (always same team)
    all_pairs = [{d["player_a_id"], d["player_b_id"]} for d in data]
    assert {anomaly_seed["a"], anomaly_seed["b"]} in all_pairs
    assert {anomaly_seed["c"], anomaly_seed["d"]} in all_pairs


def test_partnership_focus_player(client: TestClient, anomaly_seed):
    a = anomaly_seed["a"]
    response = client.get(f"/anomalies/partnerships/overplayed/{a}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    for row in data:
        assert row["player_a_id"] == a or row["player_b_id"] == a


def test_partnership_focus_player_returns_all_rows(client: TestClient, anomaly_seed):
    a = anomaly_seed["a"]
    response = client.get(f"/anomalies/partnerships/underplayed/{a}")
    assert response.status_code == 200
    data = response.json()
    for row in data:
        assert row["player_a_id"] == a or row["player_b_id"] == a


def test_head_to_head_focus_player(client: TestClient, anomaly_seed):
    a = anomaly_seed["a"]
    response = client.get(f"/anomalies/head-to-head/overplayed/{a}")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    for row in data:
        assert row["player_a_id"] == a or row["player_b_id"] == a


def test_head_to_head_focus_player_underplayed(client: TestClient, anomaly_seed):
    a = anomaly_seed["a"]
    response = client.get(f"/anomalies/head-to-head/underplayed/{a}")
    assert response.status_code == 200
    data = response.json()
    for row in data:
        assert row["player_a_id"] == a or row["player_b_id"] == a


def test_anomalies_exclude_sub_games_by_default(client: TestClient):
    """Sub partnerships should never appear in anomalies — no filter needed."""
    reg_ids = []
    for name in ["AnoRegA", "AnoRegB", "AnoRegX", "AnoRegY"]:
        reg_ids.append(client.post("/players", json={"canonical_name": name, "is_sub": False, "aliases": []}).json()["id"])
    sub_id = client.post("/players", json={"canonical_name": "AnoSubS", "is_sub": True, "aliases": []}).json()["id"]

    # 4 games: 3 regulars-only (to build up overplayed AnoRegA+AnoRegB), 1 with sub
    for date in ["09-04-2024", "16-04-2024", "23-04-2024"]:
        client.post("/ingest/scores", json={"files": [
            f"{date},1,AnoRegA,AnoRegB,21,AnoRegX,AnoRegY,9\n"
        ]})
    client.post("/ingest/scores", json={"files": [
        "30-04-2024,1,AnoRegA,AnoSubS,21,AnoRegX,AnoRegY,9\n"
    ]})

    # Without any filter — sub should never appear
    for endpoint in [
        "/anomalies/partnerships/overplayed",
        "/anomalies/partnerships/underplayed",
        "/anomalies/head-to-head/overplayed",
        "/anomalies/head-to-head/underplayed",
    ]:
        data = client.get(endpoint).json()
        for entry in data:
            assert entry["player_a_id"] != sub_id, f"Sub appeared in {endpoint}: {entry}"
            assert entry["player_b_id"] != sub_id, f"Sub appeared in {endpoint}: {entry}"
