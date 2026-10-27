import pytest
from fastapi.testclient import TestClient


def _create_player(client: TestClient, name: str) -> int:
    return client.post("/players", json={"canonical_name": name, "is_sub": False, "aliases": []}).json()["id"]


@pytest.fixture
def seed(client: TestClient) -> dict[str, int]:
    """Six players p1..p6 (p6 never plays), three sessions.

    Scores deliberately contradict the ranking p1 > p2 > ... — p1/p2 lose their
    game 9-21 — to prove the endpoint ignores them.
      s1: p1+p2 vs p3+p4  (sums 3 v 7)
      s2: p1+p4 vs p2+p3  (sums 5 v 5)
      s3: p1+p5 vs p2+p3  (sums 6 v 5)
    """
    ids = {f"p{i}": _create_player(client, f"Fd{i}") for i in range(1, 7)}
    sessions = [
        ("08-04-2024", "Fd1,Fd2,9,Fd3,Fd4,21"),
        ("15-04-2024", "Fd1,Fd4,21,Fd2,Fd3,19"),
        ("22-04-2024", "Fd1,Fd5,21,Fd2,Fd3,3"),
    ]
    for date, game in sessions:
        client.post("/ingest/scores", json={"files": [f"Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n{date},1,{game}\n"]})
    return ids


def _post(client: TestClient, ranking: list[int], **params):
    return client.post("/fixture-difficulty", params=params, json={"player_ids": ranking})


def _by_player(response) -> dict[int, dict]:
    return {e["player_id"]: e for e in response.json()}


def test_classification_follows_the_ranking_not_the_scores(client: TestClient, seed):
    ranking = [seed[f"p{i}"] for i in range(1, 7)]
    response = _post(client, ranking)
    assert response.status_code == 200
    entries = _by_player(response)

    p1, p3, p4, p5 = (entries[seed[k]] for k in ("p1", "p3", "p4", "p5"))
    assert (p1["favourable"], p1["even"], p1["underdog"]) == (1, 2, 0)
    assert (p3["favourable"], p3["even"], p3["underdog"]) == (0, 2, 1)
    assert (p4["favourable"], p4["even"], p4["underdog"]) == (0, 1, 1)
    assert (p5["favourable"], p5["even"], p5["underdog"]) == (0, 1, 0)
    assert p1["net_difficulty"] == pytest.approx(1 / 3, abs=1e-4)
    assert p4["net_difficulty"] == pytest.approx(-0.5)
    assert p1["favourable_pct"] == pytest.approx(1 / 3, abs=1e-4)
    assert p1["rank"] == 1


def test_reversing_the_ranking_flips_the_outcome(client: TestClient, seed):
    ranking = [seed[f"p{i}"] for i in range(6, 0, -1)]
    entries = _by_player(_post(client, ranking))
    # p1 is now rank 6 and p3/p4 are ranks 4/3: session 1 flips
    assert entries[seed["p1"]]["underdog"] == 1
    assert entries[seed["p1"]]["favourable"] == 0
    assert entries[seed["p3"]]["favourable"] == 1


def test_players_without_games_have_null_ratios_and_sort_last(client: TestClient, seed):
    # p6 is ranked first but has no games
    ranking = [seed["p6"]] + [seed[f"p{i}"] for i in range(1, 6)]
    entries = _post(client, ranking).json()
    assert entries[-1]["player_id"] == seed["p6"]
    assert entries[-1]["games_played"] == 0
    assert entries[-1]["net_difficulty"] is None
    assert entries[-1]["favourable_pct"] is None
    assert entries[-1]["vs_expected"] is None
    assert [e["rank"] for e in entries[:-1]] == [2, 3, 4, 5, 6]


def test_vs_expected_is_net_minus_baseline(client: TestClient, seed):
    ranking = [seed[f"p{i}"] for i in range(1, 7)]
    entry = _by_player(_post(client, ranking))[seed["p1"]]
    assert entry["expected_net"] is not None
    assert entry["vs_expected"] == pytest.approx(entry["net_difficulty"] - entry["expected_net"], abs=1e-3)


def test_even_threshold_is_configurable(client: TestClient, seed):
    ranking = [seed[f"p{i}"] for i in range(1, 7)]
    # session 1 has a rank-sum gap of 4, so a threshold of 4 makes it even for everyone
    entries = _by_player(_post(client, ranking, even_threshold=4))
    assert all(e["favourable"] == 0 and e["underdog"] == 0 for e in entries.values())


def test_games_with_unranked_players_are_skipped(client: TestClient, seed):
    ranking = [seed[f"p{i}"] for i in range(1, 5)]  # p5 unranked, so session 3 is skipped
    entries = _by_player(_post(client, ranking))
    assert entries[seed["p1"]]["games_played"] == 2


def test_player_filter_is_respected(client: TestClient, seed):
    user = "fd-user-0000-0000-0000-000000000001"
    client.post(
        "/preferences",
        json={"player_id": seed["p1"], "preset": "custom", "custom_player_ids": [seed[f"p{i}"] for i in range(1, 5)]},
        headers={"X-User-ID": user},
    )
    ranking = [seed[f"p{i}"] for i in range(1, 5)]
    response = client.post("/fixture-difficulty", json={"player_ids": ranking}, headers={"X-User-ID": user})
    # session 3 includes p5, who is outside the filter, so only two games remain
    assert _by_player(response)[seed["p1"]]["games_played"] == 2


def test_duplicate_ids_are_rejected(client: TestClient, seed):
    response = _post(client, [seed["p1"], seed["p1"], seed["p2"]])
    assert response.status_code == 422
