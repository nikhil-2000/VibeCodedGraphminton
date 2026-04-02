# Graph-minton Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the FastAPI + PostgreSQL backend for Graph-minton covering roadmap items 1–4: player management, score ingestion, stats queries, and anomaly detection.

**Architecture:** Four SQLAlchemy models (`Player`, `PlayerAlias`, `Game`, `GamePlayer`) back a REST API organised into five routers. A services layer holds all business logic (CSV parsing, validation, stats queries, anomaly calculations) separate from the HTTP layer. Integration tests run against a real Postgres test database via Docker.

**Tech Stack:** Python 3.12, FastAPI 0.115, SQLAlchemy 2.0 (sync), Alembic, psycopg2-binary, Pydantic v2, pytest, httpx

---

## File Map

```
backend/
  app/
    __init__.py
    main.py              ← FastAPI app, router registration, create_all on startup
    database.py          ← engine, SessionLocal, Base, get_db dependency
    models.py            ← SQLAlchemy ORM models (Player, PlayerAlias, Game, GamePlayer)
    schemas.py           ← Pydantic request/response models
    routers/
      __init__.py
      players.py         ← /players routes
      ingest.py          ← /ingest/scores route
      stats.py           ← /stats/* routes
      anomalies.py       ← /anomalies/* routes
      games.py           ← /games routes
    services/
      __init__.py
      players.py         ← player + alias DB operations
      ingest.py          ← CSV parsing, game validation, alias resolution
      stats.py           ← stats SQL queries
      anomalies.py       ← anomaly calculation logic
      games.py           ← games query logic
  tests/
    conftest.py          ← test DB engine, session + client fixtures
    test_players.py
    test_ingest.py
    test_stats.py
    test_anomalies.py
    test_games.py
  requirements.txt
  Dockerfile
docker-compose.yml
docker-compose.test.yml  ← overrides DATABASE_URL for test DB
```

---

## Roadmap Item 1: Data Ingestion

### Task 1: Project skeleton

**Files:**
- Create: `docker-compose.yml`
- Create: `docker-compose.test.yml`
- Create: `backend/Dockerfile`
- Create: `backend/requirements.txt`
- Create: `backend/app/__init__.py`
- Create: `backend/app/database.py`
- Create: `backend/app/main.py`
- Create: `backend/app/routers/__init__.py`
- Create: `backend/app/services/__init__.py`

- [ ] **Step 1: Create `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_DB: graphminton
      POSTGRES_USER: graphminton
      POSTGRES_PASSWORD: graphminton
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://graphminton:graphminton@db:5432/graphminton
    volumes:
      - ./data:/app/data
    depends_on:
      - db
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

volumes:
  postgres_data:
```

- [ ] **Step 2: Create `docker-compose.test.yml`**

```yaml
services:
  db:
    environment:
      POSTGRES_DB: graphminton_test

  backend:
    environment:
      DATABASE_URL: postgresql://graphminton:graphminton@db:5432/graphminton_test
```

- [ ] **Step 3: Create `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
```

- [ ] **Step 4: Create `backend/requirements.txt`**

```
fastapi==0.115.0
uvicorn[standard]==0.30.6
sqlalchemy==2.0.35
psycopg2-binary==2.9.9
pydantic==2.9.2
alembic==1.13.3
pytest==8.3.3
httpx==0.27.2
pytest-asyncio==0.24.0
```

- [ ] **Step 5: Create `backend/app/database.py`**

```python
import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://graphminton:graphminton@localhost:5432/graphminton",
)

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 6: Create `backend/app/main.py`**

```python
from fastapi import FastAPI
from .database import engine, Base

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Graph-minton API")

# Routers added in later tasks
```

- [ ] **Step 7: Create empty `__init__.py` files**

```bash
touch backend/app/__init__.py
touch backend/app/routers/__init__.py
touch backend/app/services/__init__.py
```

- [ ] **Step 8: Start containers and verify Postgres is reachable**

```bash
docker compose up -d db
docker compose logs db
```

Expected: `database system is ready to accept connections`

- [ ] **Step 9: Commit**

```bash
git add docker-compose.yml docker-compose.test.yml backend/
git commit -m "feat: project skeleton — Docker Compose, FastAPI app shell"
```

---

### Task 2: Database models

**Files:**
- Create: `backend/app/models.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write test that importing models doesn't raise**

Create `backend/tests/__init__.py` (empty) and `backend/tests/conftest.py`:

```python
# backend/tests/conftest.py
import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

os.environ.setdefault(
    "DATABASE_URL",
    "postgresql://graphminton:graphminton@localhost:5432/graphminton_test",
)

from app.main import app
from app.database import get_db, Base

TEST_DATABASE_URL = os.environ["DATABASE_URL"]


@pytest.fixture(scope="session")
def test_engine():
    eng = create_engine(TEST_DATABASE_URL)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)


@pytest.fixture(scope="function")
def db(test_engine):
    connection = test_engine.connect()
    transaction = connection.begin()
    TestingSession = sessionmaker(bind=connection)
    session = TestingSession()
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(scope="function")
def client(db):
    def override_get_db():
        yield db
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

Write `backend/tests/test_players.py` first test:

```python
def test_models_import():
    from app.models import Player, PlayerAlias, Game, GamePlayer
    assert Player.__tablename__ == "players"
    assert PlayerAlias.__tablename__ == "player_aliases"
    assert Game.__tablename__ == "games"
    assert GamePlayer.__tablename__ == "game_players"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd backend && pytest tests/test_players.py::test_models_import -v
```

Expected: `ImportError: cannot import name 'Player'`

- [ ] **Step 3: Create `backend/app/models.py`**

```python
from sqlalchemy import (
    Column, Integer, String, Boolean, Date,
    ForeignKey, UniqueConstraint,
)
from sqlalchemy.orm import relationship
from .database import Base


class Player(Base):
    __tablename__ = "players"

    id = Column(Integer, primary_key=True, index=True)
    canonical_name = Column(String, unique=True, nullable=False, index=True)
    is_sub = Column(Boolean, default=False, nullable=False)

    aliases = relationship("PlayerAlias", back_populates="player", cascade="all, delete-orphan")
    game_players = relationship("GamePlayer", back_populates="player")


class PlayerAlias(Base):
    __tablename__ = "player_aliases"

    id = Column(Integer, primary_key=True, index=True)
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    alias = Column(String, unique=True, nullable=False, index=True)

    player = relationship("Player", back_populates="aliases")


class Game(Base):
    __tablename__ = "games"

    id = Column(Integer, primary_key=True, index=True)
    played_on = Column(Date, nullable=False)
    week_number = Column(Integer, nullable=False)
    game_number = Column(Integer, nullable=False)
    team_a_score = Column(Integer, nullable=False)
    team_b_score = Column(Integer, nullable=False)

    game_players = relationship("GamePlayer", back_populates="game")

    __table_args__ = (
        UniqueConstraint("week_number", "game_number", name="uq_week_game"),
    )


class GamePlayer(Base):
    __tablename__ = "game_players"

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False)
    player_id = Column(Integer, ForeignKey("players.id"), nullable=False)
    team = Column(String(1), nullable=False)  # 'A' or 'B'

    game = relationship("Game", back_populates="game_players")
    player = relationship("Player", back_populates="game_players")
```

- [ ] **Step 4: Import models in `main.py` so `create_all` picks them up**

```python
from fastapi import FastAPI
from .database import engine, Base
from . import models  # noqa: F401 — registers models with Base

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Graph-minton API")
```

- [ ] **Step 5: Run test to verify it passes**

```bash
cd backend && pytest tests/test_players.py::test_models_import -v
```

Expected: `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/app/models.py backend/app/main.py backend/tests/
git commit -m "feat: SQLAlchemy models — Player, PlayerAlias, Game, GamePlayer"
```

---

### Task 3: POST /players — create player with aliases

**Files:**
- Create: `backend/app/schemas.py`
- Create: `backend/app/services/players.py`
- Create: `backend/app/routers/players.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_players.py  (add to existing file)
def test_create_player(client):
    response = client.post("/players", json={
        "canonical_name": "Nikhil P",
        "is_sub": False,
        "aliases": ["Nik", "Nikhil", "Niks"],
    })
    assert response.status_code == 201
    data = response.json()
    assert data["canonical_name"] == "Nikhil P"
    assert data["is_sub"] is False
    alias_values = [a["alias"] for a in data["aliases"]]
    assert "Nikhil P" in alias_values  # canonical auto-added
    assert "Nik" in alias_values


def test_create_player_duplicate_alias_rejected(client):
    client.post("/players", json={"canonical_name": "Player A", "is_sub": False, "aliases": ["Ace"]})
    response = client.post("/players", json={"canonical_name": "Player B", "is_sub": False, "aliases": ["Ace"]})
    assert response.status_code == 400
    assert "alias" in response.json()["detail"].lower()


def test_create_sub_player(client):
    response = client.post("/players", json={
        "canonical_name": "Dave",
        "is_sub": True,
        "aliases": ["Dave", "David K"],
    })
    assert response.status_code == 201
    assert response.json()["is_sub"] is True
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_players.py -k "create" -v
```

Expected: `404 Not Found` (route doesn't exist yet)

- [ ] **Step 3: Create `backend/app/schemas.py`**

```python
from pydantic import BaseModel
from typing import Optional


class PlayerCreate(BaseModel):
    canonical_name: str
    is_sub: bool = False
    aliases: list[str] = []


class PlayerUpdate(BaseModel):
    canonical_name: Optional[str] = None
    is_sub: Optional[bool] = None
    add_aliases: list[str] = []
    remove_aliases: list[str] = []


class AliasResponse(BaseModel):
    id: int
    alias: str
    model_config = {"from_attributes": True}


class PlayerResponse(BaseModel):
    id: int
    canonical_name: str
    is_sub: bool
    aliases: list[AliasResponse]
    model_config = {"from_attributes": True}
```

- [ ] **Step 4: Create `backend/app/services/players.py`**

```python
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from fastapi import HTTPException
from ..models import Player, PlayerAlias
from ..schemas import PlayerCreate, PlayerUpdate


def create_player(db: Session, data: PlayerCreate) -> Player:
    player = Player(canonical_name=data.canonical_name, is_sub=data.is_sub)
    db.add(player)
    try:
        db.flush()  # get player.id without committing
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Player '{data.canonical_name}' already exists")

    # canonical name always becomes an alias
    all_aliases = list({data.canonical_name} | set(data.aliases))
    for alias_str in all_aliases:
        alias = PlayerAlias(player_id=player.id, alias=alias_str)
        db.add(alias)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="One or more aliases already belong to another player")

    db.refresh(player)
    return player
```

- [ ] **Step 5: Create `backend/app/routers/players.py`**

```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas import PlayerCreate, PlayerResponse
from ..services import players as player_service
from ..models import Player

router = APIRouter()


@router.post("", response_model=PlayerResponse, status_code=201)
def create_player(data: PlayerCreate, db: Session = Depends(get_db)):
    return player_service.create_player(db, data)
```

- [ ] **Step 6: Register router in `main.py`**

```python
from fastapi import FastAPI
from .database import engine, Base
from . import models  # noqa: F401
from .routers import players

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Graph-minton API")
app.include_router(players.router, prefix="/players", tags=["players"])
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_players.py -k "create" -v
```

Expected: all 3 `PASSED`

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas.py backend/app/services/players.py backend/app/routers/players.py backend/app/main.py
git commit -m "feat: POST /players — create player with aliases"
```

---

### Task 4: GET /players and GET /players/{id}

**Files:**
- Modify: `backend/app/services/players.py`
- Modify: `backend/app/routers/players.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_players.py
def test_list_players(client):
    client.post("/players", json={"canonical_name": "Bhavin", "is_sub": False, "aliases": []})
    client.post("/players", json={"canonical_name": "Chan", "is_sub": True, "aliases": []})
    response = client.get("/players")
    assert response.status_code == 200
    names = [p["canonical_name"] for p in response.json()]
    assert "Bhavin" in names
    assert "Chan" in names


def test_list_players_filter_by_is_sub(client):
    client.post("/players", json={"canonical_name": "Regular", "is_sub": False, "aliases": []})
    client.post("/players", json={"canonical_name": "Sub", "is_sub": True, "aliases": []})
    response = client.get("/players?is_sub=true")
    assert response.status_code == 200
    assert all(p["is_sub"] for p in response.json())


def test_get_player_by_id(client):
    created = client.post("/players", json={"canonical_name": "Jayesh", "is_sub": False, "aliases": ["Jay"]}).json()
    response = client.get(f"/players/{created['id']}")
    assert response.status_code == 200
    assert response.json()["canonical_name"] == "Jayesh"


def test_get_player_not_found(client):
    response = client.get("/players/99999")
    assert response.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_players.py -k "list or get_player" -v
```

Expected: all `FAILED`

- [ ] **Step 3: Add service functions to `backend/app/services/players.py`**

```python
from typing import Optional

def get_all_players(db: Session, is_sub: Optional[bool] = None) -> list[Player]:
    query = db.query(Player)
    if is_sub is not None:
        query = query.filter(Player.is_sub == is_sub)
    return query.all()


def get_player(db: Session, player_id: int) -> Player:
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail=f"Player {player_id} not found")
    return player
```

- [ ] **Step 4: Add routes to `backend/app/routers/players.py`**

```python
from typing import Optional

@router.get("", response_model=list[PlayerResponse])
def list_players(is_sub: Optional[bool] = None, db: Session = Depends(get_db)):
    return player_service.get_all_players(db, is_sub)


@router.get("/{player_id}", response_model=PlayerResponse)
def get_player(player_id: int, db: Session = Depends(get_db)):
    return player_service.get_player(db, player_id)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_players.py -k "list or get_player" -v
```

Expected: all `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/players.py backend/app/routers/players.py
git commit -m "feat: GET /players and GET /players/{id}"
```

---

### Task 5: PATCH /players/{id}

**Files:**
- Modify: `backend/app/services/players.py`
- Modify: `backend/app/routers/players.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_players.py
def test_patch_player_promote_sub(client):
    created = client.post("/players", json={"canonical_name": "TempSub", "is_sub": True, "aliases": []}).json()
    response = client.patch(f"/players/{created['id']}", json={"is_sub": False})
    assert response.status_code == 200
    assert response.json()["is_sub"] is False


def test_patch_player_add_aliases(client):
    created = client.post("/players", json={"canonical_name": "Rajesh", "is_sub": False, "aliases": []}).json()
    response = client.patch(f"/players/{created['id']}", json={"add_aliases": ["Raj", "RJ"]})
    assert response.status_code == 200
    aliases = [a["alias"] for a in response.json()["aliases"]]
    assert "Raj" in aliases
    assert "RJ" in aliases


def test_patch_player_remove_aliases(client):
    created = client.post("/players", json={"canonical_name": "Nalin", "is_sub": False, "aliases": ["Nal"]}).json()
    response = client.patch(f"/players/{created['id']}", json={"remove_aliases": ["Nal"]})
    assert response.status_code == 200
    aliases = [a["alias"] for a in response.json()["aliases"]]
    assert "Nal" not in aliases


def test_patch_cannot_remove_canonical_alias(client):
    created = client.post("/players", json={"canonical_name": "CM", "is_sub": False, "aliases": []}).json()
    response = client.patch(f"/players/{created['id']}", json={"remove_aliases": ["CM"]})
    assert response.status_code == 400
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_players.py -k "patch" -v
```

Expected: all `FAILED`

- [ ] **Step 3: Add `update_player` to `backend/app/services/players.py`**

```python
def update_player(db: Session, player_id: int, data: PlayerUpdate) -> Player:
    player = get_player(db, player_id)

    if data.canonical_name is not None:
        player.canonical_name = data.canonical_name
    if data.is_sub is not None:
        player.is_sub = data.is_sub

    for alias_str in data.remove_aliases:
        if alias_str == player.canonical_name:
            raise HTTPException(status_code=400, detail="Cannot remove the canonical name alias")
        alias = db.query(PlayerAlias).filter(
            PlayerAlias.player_id == player_id,
            PlayerAlias.alias == alias_str,
        ).first()
        if alias:
            db.delete(alias)

    existing = {a.alias for a in player.aliases}
    for alias_str in data.add_aliases:
        if alias_str not in existing:
            db.add(PlayerAlias(player_id=player_id, alias=alias_str))

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="One or more aliases already belong to another player")

    db.refresh(player)
    return player
```

- [ ] **Step 4: Add route to `backend/app/routers/players.py`**

```python
from ..schemas import PlayerUpdate

@router.patch("/{player_id}", response_model=PlayerResponse)
def update_player(player_id: int, data: PlayerUpdate, db: Session = Depends(get_db)):
    return player_service.update_player(db, player_id, data)
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_players.py -k "patch" -v
```

Expected: all `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/players.py backend/app/routers/players.py
git commit -m "feat: PATCH /players/{id} — update name, is_sub, add/remove aliases"
```

---

### Task 6: CSV parsing and game validation (unit tests, no DB)

**Files:**
- Create: `backend/app/services/ingest.py`
- Create: `backend/tests/test_ingest.py`

- [ ] **Step 1: Write failing unit tests**

```python
# backend/tests/test_ingest.py
from datetime import date
from app.services.ingest import RawGameRow, validate_game_row, parse_csv_rows


def test_valid_game_passes_validation():
    row = RawGameRow(
        row_number=2, played_on=date(2024, 4, 8),
        week_number=1, game_number=1,
        name_a="Bhavin", name_b="Chets",
        team_a_score=21,
        name_x="Chan", name_y="Jayesh",
        team_b_score=9,
    )
    assert validate_game_row(row) == []


def test_winning_score_below_21_is_invalid():
    row = RawGameRow(
        row_number=2, played_on=date(2024, 4, 8),
        week_number=1, game_number=1,
        name_a="A", name_b="B", team_a_score=20,
        name_x="C", name_y="D", team_b_score=5,
    )
    errors = validate_game_row(row)
    assert len(errors) == 1
    assert "21" in errors[0]


def test_margin_below_2_is_invalid():
    row = RawGameRow(
        row_number=2, played_on=date(2024, 4, 8),
        week_number=1, game_number=1,
        name_a="A", name_b="B", team_a_score=21,
        name_x="C", name_y="D", team_b_score=20,
    )
    errors = validate_game_row(row)
    assert len(errors) == 1
    assert "margin" in errors[0].lower()


def test_deuce_style_score_is_valid():
    # e.g. 22-20 is valid (>=21, margin >=2)
    row = RawGameRow(
        row_number=2, played_on=date(2024, 4, 8),
        week_number=1, game_number=1,
        name_a="A", name_b="B", team_a_score=22,
        name_x="C", name_y="D", team_b_score=20,
    )
    assert validate_game_row(row) == []


def test_duplicate_player_in_game_is_invalid():
    row = RawGameRow(
        row_number=2, played_on=date(2024, 4, 8),
        week_number=1, game_number=1,
        name_a="Bhavin", name_b="Bhavin", team_a_score=21,
        name_x="Chan", name_y="Jayesh", team_b_score=9,
    )
    errors = validate_game_row(row)
    assert len(errors) == 1
    assert "duplicate" in errors[0].lower()


def test_parse_csv_rows_valid():
    lines = [
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY",
        "08-04-2024,1,Bhavin,Chets,21,Chan,Jayesh,9",
        "08-04-2024,2,Bhavin,Chan,16,Chets,Jayesh,21",
    ]
    rows, errors = parse_csv_rows(lines, week_number=1)
    assert errors == []
    assert len(rows) == 2
    assert rows[0].name_a == "Bhavin"
    assert rows[0].team_a_score == 21
    assert rows[0].played_on == date(2024, 4, 8)


def test_parse_csv_rows_wrong_column_count():
    lines = ["Date,GameNo,A,B,PtsAB,X,Y,PtsXY", "08-04-2024,1,Bhavin,Chets,21"]
    rows, errors = parse_csv_rows(lines, week_number=1)
    assert len(errors) == 1
    assert "columns" in errors[0].lower()


def test_parse_csv_rows_bad_date():
    lines = ["Date,GameNo,A,B,PtsAB,X,Y,PtsXY", "not-a-date,1,A,B,21,C,D,9"]
    rows, errors = parse_csv_rows(lines, week_number=1)
    assert len(errors) == 1
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_ingest.py -v
```

Expected: `ImportError: cannot import name 'RawGameRow'`

- [ ] **Step 3: Create `backend/app/services/ingest.py`**

```python
from dataclasses import dataclass
from datetime import date, datetime


@dataclass
class RawGameRow:
    row_number: int
    played_on: date
    week_number: int
    game_number: int
    name_a: str
    name_b: str
    team_a_score: int
    name_x: str
    name_y: str
    team_b_score: int


def validate_game_row(row: RawGameRow) -> list[str]:
    """Returns list of error messages. Empty list means valid."""
    errors = []
    winning_score = max(row.team_a_score, row.team_b_score)
    losing_score = min(row.team_a_score, row.team_b_score)

    if winning_score < 21:
        errors.append(f"Row {row.row_number}: winning score {winning_score} must be >= 21")

    if winning_score - losing_score < 2:
        errors.append(
            f"Row {row.row_number}: score margin {winning_score - losing_score} must be >= 2"
        )

    all_names = [row.name_a, row.name_b, row.name_x, row.name_y]
    seen: set[str] = set()
    for name in all_names:
        lower = name.lower()
        if lower in seen:
            errors.append(f"Row {row.row_number}: duplicate player '{name}' in same game")
            break
        seen.add(lower)

    return errors


def parse_csv_rows(lines: list[str], week_number: int) -> tuple[list[RawGameRow], list[str]]:
    """Parse CSV lines (including optional header) into RawGameRow objects.

    Returns (rows, parse_errors). Validation errors are separate — call
    validate_game_row on each row.
    """
    rows: list[RawGameRow] = []
    errors: list[str] = []

    start = 1 if lines and lines[0].startswith("Date") else 0

    for i, line in enumerate(lines[start:], start=start + 1):
        line = line.strip()
        if not line:
            continue

        parts = [p.strip() for p in line.split(",")]
        if len(parts) != 8:
            errors.append(f"Row {i}: expected 8 columns, got {len(parts)}")
            continue

        try:
            played_on = datetime.strptime(parts[0], "%d-%m-%Y").date()
            game_number = int(parts[1])
            team_a_score = int(parts[4])
            team_b_score = int(parts[7])
        except ValueError as exc:
            errors.append(f"Row {i}: parse error — {exc}")
            continue

        rows.append(RawGameRow(
            row_number=i,
            played_on=played_on,
            week_number=week_number,
            game_number=game_number,
            name_a=parts[2],
            name_b=parts[3],
            team_a_score=team_a_score,
            name_x=parts[5],
            name_y=parts[6],
            team_b_score=team_b_score,
        ))

    return rows, errors
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_ingest.py -v
```

Expected: all `PASSED`

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/ingest.py backend/tests/test_ingest.py
git commit -m "feat: CSV parser and game validation logic (unit tested)"
```

---

### Task 7: POST /ingest/scores

**Files:**
- Modify: `backend/app/services/ingest.py`
- Create: `backend/app/routers/ingest.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write failing integration tests**

```python
# backend/tests/test_ingest.py  (add to existing file)
import os
import tempfile
import pytest


def _create_csv(content: str) -> str:
    f = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False)
    f.write(content)
    f.close()
    return f.name


def _setup_players(client):
    """Create players needed for test CSV fixtures."""
    players = [
        {"canonical_name": "Bhavin", "is_sub": False, "aliases": []},
        {"canonical_name": "Chetan", "is_sub": False, "aliases": ["Chets", "Chet"]},
        {"canonical_name": "Chan", "is_sub": False, "aliases": []},
        {"canonical_name": "Jayesh", "is_sub": False, "aliases": ["Jay"]},
    ]
    for p in players:
        client.post("/players", json=p)


def test_ingest_scores_valid_file(client, monkeypatch):
    _setup_players(client)
    csv_content = (
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        "08-04-2024,1,Bhavin,Chets,21,Chan,Jayesh,9\n"
        "08-04-2024,2,Bhavin,Chan,16,Chets,Jayesh,21\n"
    )
    csv_path = _create_csv(csv_content)
    monkeypatch.setenv("DATA_DIR", os.path.dirname(csv_path))

    # Rename to Week99.csv pattern expected by ingestion
    import shutil
    week_path = os.path.join(os.path.dirname(csv_path), "Week99.csv")
    shutil.copy(csv_path, week_path)

    response = client.post("/ingest/scores", json={"filenames": ["Week99.csv"]})
    assert response.status_code == 200
    data = response.json()
    assert data["games_loaded"] == 2
    assert data["errors"] == []


def test_ingest_scores_unknown_player_rejects_whole_file(client, monkeypatch):
    _setup_players(client)
    csv_content = (
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        "08-04-2024,1,Bhavin,Chets,21,Chan,Jayesh,9\n"
        "08-04-2024,2,Bhavin,UNKNOWN_PLAYER,16,Chets,Jayesh,21\n"
    )
    csv_path = _create_csv(csv_content)
    monkeypatch.setenv("DATA_DIR", os.path.dirname(csv_path))
    import shutil
    week_path = os.path.join(os.path.dirname(csv_path), "Week98.csv")
    shutil.copy(csv_path, week_path)

    response = client.post("/ingest/scores", json={"filenames": ["Week98.csv"]})
    assert response.status_code == 422
    errors = response.json()["detail"]
    assert any("UNKNOWN_PLAYER" in e for e in errors)


def test_ingest_scores_invalid_score_rejects_whole_file(client, monkeypatch):
    _setup_players(client)
    csv_content = (
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        "08-04-2024,1,Bhavin,Chets,15,Chan,Jayesh,9\n"  # 15 < 21
    )
    csv_path = _create_csv(csv_content)
    monkeypatch.setenv("DATA_DIR", os.path.dirname(csv_path))
    import shutil
    week_path = os.path.join(os.path.dirname(csv_path), "Week97.csv")
    shutil.copy(csv_path, week_path)

    response = client.post("/ingest/scores", json={"filenames": ["Week97.csv"]})
    assert response.status_code == 422


def test_ingest_scores_idempotent(client, monkeypatch):
    _setup_players(client)
    csv_content = (
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        "08-04-2024,1,Bhavin,Chets,21,Chan,Jayesh,9\n"
    )
    csv_path = _create_csv(csv_content)
    monkeypatch.setenv("DATA_DIR", os.path.dirname(csv_path))
    import shutil
    week_path = os.path.join(os.path.dirname(csv_path), "Week96.csv")
    shutil.copy(csv_path, week_path)

    client.post("/ingest/scores", json={"filenames": ["Week96.csv"]})
    response = client.post("/ingest/scores", json={"filenames": ["Week96.csv"]})
    assert response.status_code == 200
    assert response.json()["games_loaded"] == 0  # already exists, skipped
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_ingest.py -k "ingest_scores" -v
```

Expected: `404 Not Found`

- [ ] **Step 3: Add ingestion logic to `backend/app/services/ingest.py`**

```python
import os
import re
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert
from ..models import Player, PlayerAlias, Game, GamePlayer


def resolve_aliases(db: Session) -> dict[str, int]:
    """Return mapping of alias (lowercased) → player_id for all aliases in DB."""
    rows = db.query(PlayerAlias.alias, PlayerAlias.player_id).all()
    return {row.alias.lower(): row.player_id for row in rows}


def ingest_csv_file(
    db: Session,
    filepath: str,
    week_number: int,
    alias_map: dict[str, int],
) -> tuple[int, list[str]]:
    """Parse and validate one CSV file. Returns (games_loaded, errors).

    If there are any errors, nothing is written to the DB.
    """
    with open(filepath) as f:
        lines = f.readlines()

    rows, parse_errors = parse_csv_rows(lines, week_number)
    if parse_errors:
        return 0, parse_errors

    all_errors: list[str] = []

    # Validate all rows before writing anything
    for row in rows:
        all_errors.extend(validate_game_row(row))
        for name in [row.name_a, row.name_b, row.name_x, row.name_y]:
            if name.lower() not in alias_map:
                all_errors.append(f"Row {row.row_number}: unknown player '{name}'")

    if all_errors:
        return 0, all_errors

    # Write to DB
    loaded = 0
    for row in rows:
        # Skip if already ingested (idempotency)
        existing = db.query(Game).filter(
            Game.week_number == row.week_number,
            Game.game_number == row.game_number,
        ).first()
        if existing:
            continue

        game = Game(
            played_on=row.played_on,
            week_number=row.week_number,
            game_number=row.game_number,
            team_a_score=row.team_a_score,
            team_b_score=row.team_b_score,
        )
        db.add(game)
        db.flush()

        for name, team in [
            (row.name_a, "A"), (row.name_b, "A"),
            (row.name_x, "B"), (row.name_y, "B"),
        ]:
            db.add(GamePlayer(
                game_id=game.id,
                player_id=alias_map[name.lower()],
                team=team,
            ))
        loaded += 1

    db.commit()
    return loaded, []
```

- [ ] **Step 4: Create `backend/app/routers/ingest.py`**

```python
import os
import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..services.ingest import resolve_aliases, ingest_csv_file

router = APIRouter()

DATA_DIR = os.environ.get("DATA_DIR", "/app/data/scores")


class IngestRequest(BaseModel):
    filenames: list[str] = []  # empty = ingest all WeekXX.csv files in DATA_DIR


class IngestResponse(BaseModel):
    games_loaded: int
    errors: list[str]


@router.post("/scores", response_model=IngestResponse)
def ingest_scores(request: IngestRequest, db: Session = Depends(get_db)):
    alias_map = resolve_aliases(db)

    if request.filenames:
        filenames = request.filenames
    else:
        filenames = sorted(
            f for f in os.listdir(DATA_DIR)
            if re.match(r"Week\d+\.csv", f, re.IGNORECASE)
        )

    all_errors: list[str] = []
    total_loaded = 0

    for filename in filenames:
        match = re.search(r"(\d+)", filename)
        if not match:
            all_errors.append(f"{filename}: cannot determine week number from filename")
            continue
        week_number = int(match.group(1))
        filepath = os.path.join(DATA_DIR, filename)
        if not os.path.exists(filepath):
            all_errors.append(f"{filename}: file not found")
            continue

        loaded, errors = ingest_csv_file(db, filepath, week_number, alias_map)
        if errors:
            all_errors.extend([f"{filename} — {e}" for e in errors])
        else:
            total_loaded += loaded

    if all_errors:
        raise HTTPException(status_code=422, detail=all_errors)

    return IngestResponse(games_loaded=total_loaded, errors=[])
```

- [ ] **Step 5: Register ingest router in `main.py`**

```python
from .routers import players, ingest

app.include_router(ingest.router, prefix="/ingest", tags=["ingest"])
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_ingest.py -k "ingest_scores" -v
```

Expected: all `PASSED`

- [ ] **Step 7: Ingest the real data — verify it loads cleanly**

First create all players via the API (use FastAPI docs at http://localhost:8000/docs):

Players to create (from `data/aliases/`):
- `{ "canonical_name": "Bijal", "is_sub": false, "aliases": ["Bij"] }`
- `{ "canonical_name": "CM", "is_sub": false, "aliases": ["Cm"] }`
- `{ "canonical_name": "Chetan", "is_sub": false, "aliases": ["Chet", "Chets"] }`
- `{ "canonical_name": "Jayesh", "is_sub": false, "aliases": ["Jay"] }`
- `{ "canonical_name": "Nalin", "is_sub": false, "aliases": ["Nal"] }`
- `{ "canonical_name": "Nikhil P", "is_sub": false, "aliases": ["Nik", "Nikhil", "Niks"] }`
- `{ "canonical_name": "Nikhil S", "is_sub": false, "aliases": ["Nik S"] }`
- `{ "canonical_name": "Rajesh", "is_sub": false, "aliases": ["Raj"] }`

Then run ingestion — any 422 responses will list the unresolved names; create sub players for those.

```bash
curl -X POST http://localhost:8000/ingest/scores \
  -H "Content-Type: application/json" \
  -d '{"filenames": []}'
```

Expected: `{"games_loaded": <N>, "errors": []}`

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/ingest.py backend/app/routers/ingest.py backend/app/main.py
git commit -m "feat: POST /ingest/scores — bulk CSV ingestion with full-file rejection"
```

---

## Roadmap Item 2: Stats & Queries

### Task 8: Player stats and leaderboard

**Files:**
- Create: `backend/app/services/stats.py`
- Create: `backend/app/routers/stats.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_stats.py
import pytest


def _create_player(client, name, aliases=None):
    resp = client.post("/players", json={
        "canonical_name": name, "is_sub": False, "aliases": aliases or []
    })
    return resp.json()["id"]


def _load_games(client, player_ids):
    """Directly insert known game data via ingest for predictable stats."""
    # We'll use a helper fixture instead — see conftest additions below
    pass


@pytest.fixture
def two_player_game(client):
    """One game: A+B beat X+Y 21-9."""
    a = _create_player(client, "PlayerA")
    b = _create_player(client, "PlayerB")
    x = _create_player(client, "PlayerX")
    y = _create_player(client, "PlayerY")

    import tempfile, os, shutil
    csv = (
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        f"08-04-2024,1,PlayerA,PlayerB,21,PlayerX,PlayerY,9\n"
    )
    tmp = tempfile.mkdtemp()
    path = os.path.join(tmp, "Week50.csv")
    with open(path, "w") as f:
        f.write(csv)

    import unittest.mock as mock
    with mock.patch("app.routers.ingest.DATA_DIR", tmp):
        client.post("/ingest/scores", json={"filenames": ["Week50.csv"]})

    return {"a": a, "b": b, "x": x, "y": y}


def test_player_stats(client, two_player_game):
    pid = two_player_game["a"]
    response = client.get(f"/players/{pid}/stats")
    assert response.status_code == 200
    data = response.json()
    assert data["games_played"] == 1
    assert data["wins"] == 1
    assert data["losses"] == 0
    assert data["win_rate"] == 1.0
    assert data["avg_points"] == 21.0


def test_leaderboard_sort_by_win_rate(client, two_player_game):
    response = client.get("/stats/leaderboard?sort_by=win_rate")
    assert response.status_code == 200
    names = [p["canonical_name"] for p in response.json()]
    # Winners (A, B) should rank before losers (X, Y)
    assert names.index("PlayerA") < names.index("PlayerX")


def test_leaderboard_sort_by_avg_points(client, two_player_game):
    response = client.get("/stats/leaderboard?sort_by=avg_points")
    assert response.status_code == 200
    entries = response.json()
    # PlayerA scored 21, PlayerX scored 9
    a_entry = next(e for e in entries if e["canonical_name"] == "PlayerA")
    x_entry = next(e for e in entries if e["canonical_name"] == "PlayerX")
    assert a_entry["avg_points"] > x_entry["avg_points"]
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_stats.py -v
```

Expected: `404 Not Found`

- [ ] **Step 3: Create `backend/app/services/stats.py`**

```python
from sqlalchemy.orm import Session
from sqlalchemy import func, case, text
from ..models import Player, Game, GamePlayer


def get_player_stats(db: Session, player_id: int) -> dict:
    won_case = case(
        (
            (GamePlayer.team == "A") & (Game.team_a_score > Game.team_b_score),
            1,
        ),
        (
            (GamePlayer.team == "B") & (Game.team_b_score > Game.team_a_score),
            1,
        ),
        else_=0,
    )
    points_case = case(
        (GamePlayer.team == "A", Game.team_a_score),
        else_=Game.team_b_score,
    )

    result = (
        db.query(
            func.count(GamePlayer.id).label("games_played"),
            func.sum(won_case).label("wins"),
            func.round(func.avg(points_case), 2).label("avg_points"),
        )
        .join(Game, GamePlayer.game_id == Game.id)
        .filter(GamePlayer.player_id == player_id)
        .one()
    )

    games_played = result.games_played or 0
    wins = int(result.wins or 0)
    return {
        "player_id": player_id,
        "games_played": games_played,
        "wins": wins,
        "losses": games_played - wins,
        "win_rate": round(wins / games_played, 4) if games_played else 0.0,
        "avg_points": float(result.avg_points or 0),
    }


def get_leaderboard(db: Session, sort_by: str = "win_rate") -> list[dict]:
    won_case = case(
        (
            (GamePlayer.team == "A") & (Game.team_a_score > Game.team_b_score),
            1,
        ),
        (
            (GamePlayer.team == "B") & (Game.team_b_score > Game.team_a_score),
            1,
        ),
        else_=0,
    )
    points_case = case(
        (GamePlayer.team == "A", Game.team_a_score),
        else_=Game.team_b_score,
    )

    rows = (
        db.query(
            Player.id,
            Player.canonical_name,
            func.count(GamePlayer.id).label("games_played"),
            func.sum(won_case).label("wins"),
            func.round(func.avg(points_case), 2).label("avg_points"),
        )
        .join(GamePlayer, Player.id == GamePlayer.player_id)
        .join(Game, GamePlayer.game_id == Game.id)
        .group_by(Player.id, Player.canonical_name)
        .all()
    )

    entries = []
    for row in rows:
        games = row.games_played or 0
        wins = int(row.wins or 0)
        entries.append({
            "player_id": row.id,
            "canonical_name": row.canonical_name,
            "games_played": games,
            "wins": wins,
            "losses": games - wins,
            "win_rate": round(wins / games, 4) if games else 0.0,
            "avg_points": float(row.avg_points or 0),
        })

    sort_key = "avg_points" if sort_by == "avg_points" else "win_rate"
    return sorted(entries, key=lambda e: e[sort_key], reverse=True)
```

- [ ] **Step 4: Create `backend/app/routers/stats.py`**

```python
from typing import Literal
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..services import stats as stats_service
from ..services.players import get_player

router = APIRouter()


@router.get("/leaderboard")
def leaderboard(sort_by: Literal["win_rate", "avg_points"] = "win_rate", db: Session = Depends(get_db)):
    return stats_service.get_leaderboard(db, sort_by)
```

- [ ] **Step 5: Add player stats route to `backend/app/routers/players.py`**

```python
from ..services import stats as stats_service

@router.get("/{player_id}/stats")
def get_player_stats(player_id: int, db: Session = Depends(get_db)):
    get_player(db, player_id)  # 404 if not found
    return stats_service.get_player_stats(db, player_id)
```

- [ ] **Step 6: Register stats router in `main.py`**

```python
from .routers import players, ingest, stats

app.include_router(stats.router, prefix="/stats", tags=["stats"])
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_stats.py -v
```

Expected: all `PASSED`

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/stats.py backend/app/routers/stats.py backend/app/routers/players.py backend/app/main.py
git commit -m "feat: player stats and leaderboard endpoints"
```

---

### Task 9: Partnership and head-to-head stats

**Files:**
- Modify: `backend/app/services/stats.py`
- Modify: `backend/app/routers/stats.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_stats.py  (add to existing file)
@pytest.fixture
def two_games(client):
    """Game 1: A+B beat X+Y 21-9. Game 2: A+X beat B+Y 21-15."""
    a = _create_player(client, "Alpha")
    b = _create_player(client, "Beta")
    x = _create_player(client, "Xray")
    y = _create_player(client, "Yankee")

    import tempfile, os, unittest.mock as mock
    csv = (
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        "08-04-2024,1,Alpha,Beta,21,Xray,Yankee,9\n"
        "08-04-2024,2,Alpha,Xray,21,Beta,Yankee,15\n"
    )
    tmp = tempfile.mkdtemp()
    path = os.path.join(tmp, "Week51.csv")
    with open(path, "w") as f:
        f.write(csv)
    with mock.patch("app.routers.ingest.DATA_DIR", tmp):
        client.post("/ingest/scores", json={"filenames": ["Week51.csv"]})

    return {"a": a, "b": b, "x": x, "y": y}


def test_all_partnerships(client, two_games):
    response = client.get("/stats/partnerships")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 2  # Alpha+Beta and Alpha+Xray


def test_partnerships_for_player(client, two_games):
    pid = two_games["a"]
    response = client.get(f"/stats/partnerships/{pid}")
    assert response.status_code == 200
    data = response.json()
    partner_ids = [p["partner_id"] for p in data]
    assert two_games["b"] in partner_ids
    assert two_games["x"] in partner_ids


def test_specific_partnership(client, two_games):
    a, b = two_games["a"], two_games["b"]
    response = client.get(f"/stats/partnerships/{a}/{b}")
    assert response.status_code == 200
    data = response.json()
    assert data["games_together"] == 1
    assert data["wins"] == 1


def test_head_to_head(client, two_games):
    a, b = two_games["a"], two_games["b"]
    response = client.get(f"/stats/head-to-head/{a}/{b}")
    assert response.status_code == 200
    data = response.json()
    # Game 2: Alpha+Xray vs Beta+Yankee — Alpha beat Beta
    assert data["player_a_wins"] + data["player_b_wins"] == 1


def test_matchup(client, two_games):
    a, b, x, y = two_games["a"], two_games["b"], two_games["x"], two_games["y"]
    response = client.get(f"/stats/matchup/{a},{b}/vs/{x},{y}")
    assert response.status_code == 200
    data = response.json()
    assert data["pair_a_wins"] == 1
    assert data["pair_b_wins"] == 0
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_stats.py -k "partnership or head_to_head or matchup" -v
```

Expected: all `FAILED`

- [ ] **Step 3: Add partnership and h2h functions to `backend/app/services/stats.py`**

```python
from sqlalchemy.orm import aliased


def get_all_partnerships(db: Session, player_id: int | None = None) -> list[dict]:
    gp1 = aliased(GamePlayer)
    gp2 = aliased(GamePlayer)

    won_case = case(
        (
            (gp1.team == "A") & (Game.team_a_score > Game.team_b_score),
            1,
        ),
        (
            (gp1.team == "B") & (Game.team_b_score > Game.team_a_score),
            1,
        ),
        else_=0,
    )

    query = (
        db.query(
            gp1.player_id.label("player_a_id"),
            gp2.player_id.label("player_b_id"),
            func.count().label("games_together"),
            func.sum(won_case).label("wins"),
        )
        .join(gp2, (gp1.game_id == gp2.game_id) & (gp1.team == gp2.team) & (gp1.player_id < gp2.player_id))
        .join(Game, gp1.game_id == Game.id)
        .group_by(gp1.player_id, gp2.player_id)
    )

    if player_id is not None:
        query = query.filter((gp1.player_id == player_id) | (gp2.player_id == player_id))

    rows = query.all()
    results = []
    for row in rows:
        games = row.games_together or 0
        wins = int(row.wins or 0)
        results.append({
            "player_a_id": row.player_a_id,
            "player_b_id": row.player_b_id,
            "games_together": games,
            "wins": wins,
            "losses": games - wins,
            "win_rate": round(wins / games, 4) if games else 0.0,
        })
    return results


def get_partnership_for_player(db: Session, player_id: int) -> list[dict]:
    rows = get_all_partnerships(db, player_id)
    return [
        {
            "partner_id": r["player_b_id"] if r["player_a_id"] == player_id else r["player_a_id"],
            **{k: v for k, v in r.items() if k not in ("player_a_id", "player_b_id")},
        }
        for r in rows
    ]


def get_specific_partnership(db: Session, player_a_id: int, player_b_id: int) -> dict:
    lo, hi = min(player_a_id, player_b_id), max(player_a_id, player_b_id)
    rows = get_all_partnerships(db)
    for r in rows:
        if r["player_a_id"] == lo and r["player_b_id"] == hi:
            return r
    return {"player_a_id": lo, "player_b_id": hi, "games_together": 0, "wins": 0, "losses": 0, "win_rate": 0.0}


def get_head_to_head(db: Session, player_a_id: int, player_b_id: int) -> dict:
    gp_a = aliased(GamePlayer)
    gp_b = aliased(GamePlayer)

    rows = (
        db.query(Game, gp_a.team.label("team_a"))
        .join(gp_a, (gp_a.game_id == Game.id) & (gp_a.player_id == player_a_id))
        .join(gp_b, (gp_b.game_id == Game.id) & (gp_b.player_id == player_b_id) & (gp_b.team != gp_a.team))
        .all()
    )

    a_wins = 0
    b_wins = 0
    for game, team_a in rows:
        if team_a == "A":
            if game.team_a_score > game.team_b_score:
                a_wins += 1
            else:
                b_wins += 1
        else:
            if game.team_b_score > game.team_a_score:
                a_wins += 1
            else:
                b_wins += 1

    return {
        "player_a_id": player_a_id,
        "player_b_id": player_b_id,
        "games_played": a_wins + b_wins,
        "player_a_wins": a_wins,
        "player_b_wins": b_wins,
    }


def get_matchup(db: Session, pair_a: tuple[int, int], pair_b: tuple[int, int]) -> dict:
    gp_a1 = aliased(GamePlayer)
    gp_a2 = aliased(GamePlayer)
    gp_b1 = aliased(GamePlayer)
    gp_b2 = aliased(GamePlayer)

    rows = (
        db.query(Game, gp_a1.team.label("pair_a_team"))
        .join(gp_a1, (gp_a1.game_id == Game.id) & (gp_a1.player_id == pair_a[0]))
        .join(gp_a2, (gp_a2.game_id == Game.id) & (gp_a2.player_id == pair_a[1]) & (gp_a2.team == gp_a1.team))
        .join(gp_b1, (gp_b1.game_id == Game.id) & (gp_b1.player_id == pair_b[0]) & (gp_b1.team != gp_a1.team))
        .join(gp_b2, (gp_b2.game_id == Game.id) & (gp_b2.player_id == pair_b[1]) & (gp_b2.team == gp_b1.team))
        .all()
    )

    a_wins = b_wins = 0
    for game, pair_a_team in rows:
        if pair_a_team == "A":
            if game.team_a_score > game.team_b_score:
                a_wins += 1
            else:
                b_wins += 1
        else:
            if game.team_b_score > game.team_a_score:
                a_wins += 1
            else:
                b_wins += 1

    return {
        "pair_a": list(pair_a),
        "pair_b": list(pair_b),
        "games_played": a_wins + b_wins,
        "pair_a_wins": a_wins,
        "pair_b_wins": b_wins,
    }
```

- [ ] **Step 4: Add routes to `backend/app/routers/stats.py`**

```python
@router.get("/partnerships")
def all_partnerships(db: Session = Depends(get_db)):
    return stats_service.get_all_partnerships(db)


@router.get("/partnerships/{player_id}")
def partnerships_for_player(player_id: int, db: Session = Depends(get_db)):
    return stats_service.get_partnership_for_player(db, player_id)


@router.get("/partnerships/{player_a_id}/{player_b_id}")
def specific_partnership(player_a_id: int, player_b_id: int, db: Session = Depends(get_db)):
    return stats_service.get_specific_partnership(db, player_a_id, player_b_id)


@router.get("/head-to-head/{player_a_id}/{player_b_id}")
def head_to_head(player_a_id: int, player_b_id: int, db: Session = Depends(get_db)):
    return stats_service.get_head_to_head(db, player_a_id, player_b_id)


@router.get("/matchup/{pair_a_ids}/vs/{pair_b_ids}")
def matchup(pair_a_ids: str, pair_b_ids: str, db: Session = Depends(get_db)):
    try:
        a1, a2 = [int(x) for x in pair_a_ids.split(",")]
        b1, b2 = [int(x) for x in pair_b_ids.split(",")]
    except ValueError:
        raise HTTPException(status_code=422, detail="Pair IDs must be comma-separated integers e.g. /1,2/vs/3,4")
    return stats_service.get_matchup(db, (a1, a2), (b1, b2))
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_stats.py -v
```

Expected: all `PASSED`

- [ ] **Step 6: Commit**

```bash
git add backend/app/services/stats.py backend/app/routers/stats.py
git commit -m "feat: partnership and head-to-head stats endpoints"
```

---

### Task 10: Games endpoints

**Files:**
- Create: `backend/app/services/games.py`
- Create: `backend/app/routers/games.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_games.py
import pytest
import tempfile, os, unittest.mock as mock


def _create_player(client, name):
    return client.post("/players", json={"canonical_name": name, "is_sub": False, "aliases": []}).json()["id"]


@pytest.fixture
def seeded_games(client):
    a = _create_player(client, "GA")
    b = _create_player(client, "GB")
    x = _create_player(client, "GX")
    y = _create_player(client, "GY")

    csv = (
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        "08-04-2024,1,GA,GB,21,GX,GY,9\n"
        "08-04-2024,2,GA,GX,21,GB,GY,15\n"
    )
    tmp = tempfile.mkdtemp()
    path = os.path.join(tmp, "Week52.csv")
    with open(path, "w") as f:
        f.write(csv)
    with mock.patch("app.routers.ingest.DATA_DIR", tmp):
        client.post("/ingest/scores", json={"filenames": ["Week52.csv"]})
    return {"a": a, "b": b, "x": x, "y": y}


def test_list_games(client, seeded_games):
    response = client.get("/games")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_filter_games_by_week(client, seeded_games):
    response = client.get("/games?week=52")
    assert response.status_code == 200
    assert len(response.json()) == 2


def test_filter_games_by_player(client, seeded_games):
    pid = seeded_games["a"]
    response = client.get(f"/games?player_id={pid}")
    assert response.status_code == 200
    assert len(response.json()) == 2  # GA played in both games


def test_filter_games_by_team(client, seeded_games):
    a, b = seeded_games["a"], seeded_games["b"]
    response = client.get(f"/games?team={a},{b}")
    assert response.status_code == 200
    assert len(response.json()) == 1  # GA+GB only partnered in game 1


def test_filter_games_by_vs(client, seeded_games):
    a, x = seeded_games["a"], seeded_games["x"]
    response = client.get(f"/games?vs={a},{x}")
    assert response.status_code == 200
    # GA and GX are partners in game 2 (same team), so they never face each other as opponents
    assert len(response.json()) == 0


def test_get_game_detail(client, seeded_games):
    games = client.get("/games").json()
    game_id = games[0]["id"]
    response = client.get(f"/games/{game_id}")
    assert response.status_code == 200
    data = response.json()
    assert "team_a" in data
    assert len(data["team_a"]) == 2
    assert len(data["team_b"]) == 2
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_games.py -v
```

Expected: all `FAILED`

- [ ] **Step 3: Create `backend/app/services/games.py`**

```python
from sqlalchemy.orm import Session
from sqlalchemy import and_
from ..models import Game, GamePlayer, Player


def get_games(
    db: Session,
    week: int | None = None,
    player_id: int | None = None,
    team_ids: tuple[int, int] | None = None,
    vs_ids: tuple[int, int] | None = None,
) -> list[dict]:
    query = db.query(Game)

    if week is not None:
        query = query.filter(Game.week_number == week)

    if player_id is not None:
        query = query.join(GamePlayer, GamePlayer.game_id == Game.id).filter(
            GamePlayer.player_id == player_id
        )

    if team_ids is not None:
        from sqlalchemy.orm import aliased
        gp1 = aliased(GamePlayer)
        gp2 = aliased(GamePlayer)
        query = (
            query
            .join(gp1, (gp1.game_id == Game.id) & (gp1.player_id == team_ids[0]))
            .join(gp2, (gp2.game_id == Game.id) & (gp2.player_id == team_ids[1]) & (gp2.team == gp1.team))
        )

    if vs_ids is not None:
        from sqlalchemy.orm import aliased
        gp1 = aliased(GamePlayer)
        gp2 = aliased(GamePlayer)
        query = (
            query
            .join(gp1, (gp1.game_id == Game.id) & (gp1.player_id == vs_ids[0]))
            .join(gp2, (gp2.game_id == Game.id) & (gp2.player_id == vs_ids[1]) & (gp2.team != gp1.team))
        )

    games = query.distinct().all()
    return [_game_summary(g) for g in games]


def get_game_detail(db: Session, game_id: int) -> dict:
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail=f"Game {game_id} not found")

    team_a = (
        db.query(Player)
        .join(GamePlayer, GamePlayer.player_id == Player.id)
        .filter(GamePlayer.game_id == game_id, GamePlayer.team == "A")
        .all()
    )
    team_b = (
        db.query(Player)
        .join(GamePlayer, GamePlayer.player_id == Player.id)
        .filter(GamePlayer.game_id == game_id, GamePlayer.team == "B")
        .all()
    )

    return {
        **_game_summary(game),
        "team_a": [{"id": p.id, "canonical_name": p.canonical_name} for p in team_a],
        "team_b": [{"id": p.id, "canonical_name": p.canonical_name} for p in team_b],
    }


def _game_summary(game: Game) -> dict:
    return {
        "id": game.id,
        "played_on": str(game.played_on),
        "week_number": game.week_number,
        "game_number": game.game_number,
        "team_a_score": game.team_a_score,
        "team_b_score": game.team_b_score,
    }
```

- [ ] **Step 4: Create `backend/app/routers/games.py`**

```python
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..database import get_db
from ..services import games as games_service

router = APIRouter()


@router.get("")
def list_games(
    week: Optional[int] = None,
    player_id: Optional[int] = None,
    team: Optional[str] = None,
    vs: Optional[str] = None,
    db: Session = Depends(get_db),
):
    team_ids = None
    vs_ids = None
    if team:
        try:
            a, b = [int(x) for x in team.split(",")]
            team_ids = (a, b)
        except ValueError:
            raise HTTPException(status_code=422, detail="team must be two comma-separated player IDs")
    if vs:
        try:
            a, b = [int(x) for x in vs.split(",")]
            vs_ids = (a, b)
        except ValueError:
            raise HTTPException(status_code=422, detail="vs must be two comma-separated player IDs")

    return games_service.get_games(db, week=week, player_id=player_id, team_ids=team_ids, vs_ids=vs_ids)


@router.get("/{game_id}")
def get_game(game_id: int, db: Session = Depends(get_db)):
    return games_service.get_game_detail(db, game_id)
```

- [ ] **Step 5: Register in `main.py`**

```python
from .routers import players, ingest, stats, games

app.include_router(games.router, prefix="/games", tags=["games"])
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_games.py -v
```

Expected: all `PASSED`

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/games.py backend/app/routers/games.py backend/app/main.py
git commit -m "feat: GET /games with week, player, team and vs filters"
```

---

## Roadmap Items 3 & 4: Visualization Data + Anomaly Detection

> **Note:** The graph visualization UI (roadmap item 3) is a React frontend task and requires a separate design and plan session. The `/stats/partnerships` endpoint from Task 9 already provides the data needed to render nodes and edges. This task covers the anomaly detection backend (roadmap item 4).

### Task 11: Anomaly detection endpoints

**Files:**
- Create: `backend/app/services/anomalies.py`
- Create: `backend/app/routers/anomalies.py`
- Modify: `backend/app/main.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_anomalies.py
import pytest
import tempfile, os, unittest.mock as mock


def _create_player(client, name):
    return client.post("/players", json={"canonical_name": name, "is_sub": False, "aliases": []}).json()["id"]


@pytest.fixture
def anomaly_seed(client):
    """
    4 players, 4 games. A+B always partner (overplayed). C+D never partner (underplayed).
    A vs C twice (overplayed h2h). B vs D never face each other (underplayed h2h).
    """
    a = _create_player(client, "AnoA")
    b = _create_player(client, "AnoB")
    c = _create_player(client, "AnoC")
    d = _create_player(client, "AnoD")

    csv = (
        "Date,GameNo,A,B,PtsAB,X,Y,PtsXY\n"
        "08-04-2024,1,AnoA,AnoB,21,AnoC,AnoD,9\n"
        "15-04-2024,1,AnoA,AnoB,21,AnoC,AnoD,9\n"
        "22-04-2024,1,AnoA,AnoB,21,AnoC,AnoD,9\n"
        "29-04-2024,1,AnoA,AnoB,21,AnoC,AnoD,9\n"
    )
    tmp = tempfile.mkdtemp()
    path = os.path.join(tmp, "Week53.csv")
    with open(path, "w") as f:
        f.write(csv)
    with mock.patch("app.routers.ingest.DATA_DIR", tmp):
        client.post("/ingest/scores", json={"filenames": ["Week53.csv"]})
    return {"a": a, "b": b, "c": c, "d": d}


def test_overplayed_partnerships(client, anomaly_seed):
    response = client.get("/anomalies/partnerships/overplayed?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    # A+B should be at the top (played together 4/4 games)
    top = data[0]
    ids = {top["player_a_id"], top["player_b_id"]}
    assert ids == {anomaly_seed["a"], anomaly_seed["b"]}


def test_underplayed_partnerships(client, anomaly_seed):
    response = client.get("/anomalies/partnerships/underplayed?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    # A+C, A+D, B+C, B+D never partnered — should appear
    top_ids = [{d["player_a_id"], d["player_b_id"]} for d in data]
    assert {anomaly_seed["a"], anomaly_seed["c"]} in top_ids


def test_overplayed_head_to_head(client, anomaly_seed):
    response = client.get("/anomalies/head-to-head/overplayed?limit=5")
    assert response.status_code == 200
    data = response.json()
    assert len(data) > 0
    # A vs C always face each other
    top = data[0]
    ids = {top["player_a_id"], top["player_b_id"]}
    assert ids == {anomaly_seed["a"], anomaly_seed["c"]} or ids == {anomaly_seed["b"], anomaly_seed["d"]}


def test_underplayed_head_to_head(client, anomaly_seed):
    response = client.get("/anomalies/head-to-head/underplayed?limit=5")
    assert response.status_code == 200
    data = response.json()
    # A+B and C+D never face each other (they're always on the same team)
    assert len(data) > 0
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && pytest tests/test_anomalies.py -v
```

Expected: all `FAILED`

- [ ] **Step 3: Create `backend/app/services/anomalies.py`**

```python
from sqlalchemy.orm import Session, aliased
from sqlalchemy import func
from ..models import Game, GamePlayer, Player


MIN_GAMES_THRESHOLD = 3  # players with fewer games are excluded from underplayed results


def _get_player_game_counts(db: Session) -> dict[int, int]:
    rows = (
        db.query(GamePlayer.player_id, func.count().label("games"))
        .group_by(GamePlayer.player_id)
        .all()
    )
    return {row.player_id: row.games for row in rows}


def _get_total_games(db: Session) -> int:
    return db.query(func.count(Game.id)).scalar() or 0


def _get_all_player_pairs(player_counts: dict[int, int]) -> list[tuple[int, int]]:
    ids = sorted(player_counts.keys())
    return [(ids[i], ids[j]) for i in range(len(ids)) for j in range(i + 1, len(ids))]


def _expected_frequency(games_a: int, games_b: int, total: int) -> float:
    """Rough expected co-occurrence assuming random pairing."""
    if total == 0:
        return 0.0
    return (games_a / total) * (games_b / total) * total


def get_partnership_anomalies(db: Session, overplayed: bool, limit: int = 10) -> list[dict]:
    gp1 = aliased(GamePlayer)
    gp2 = aliased(GamePlayer)

    actual_counts = {
        (min(r.a, r.b), max(r.a, r.b)): r.count
        for r in db.query(
            gp1.player_id.label("a"),
            gp2.player_id.label("b"),
            func.count().label("count"),
        )
        .join(gp2, (gp1.game_id == gp2.game_id) & (gp1.team == gp2.team) & (gp1.player_id < gp2.player_id))
        .group_by(gp1.player_id, gp2.player_id)
        .all()
    }

    player_counts = _get_player_game_counts(db)
    total = _get_total_games(db)
    all_pairs = _get_all_player_pairs(player_counts)

    results = []
    for a, b in all_pairs:
        if not overplayed:
            if player_counts.get(a, 0) < MIN_GAMES_THRESHOLD:
                continue
            if player_counts.get(b, 0) < MIN_GAMES_THRESHOLD:
                continue

        actual = actual_counts.get((a, b), 0)
        expected = _expected_frequency(player_counts.get(a, 0), player_counts.get(b, 0), total)
        deviation = actual - expected

        if overplayed and deviation <= 0:
            continue
        if not overplayed and deviation >= 0:
            continue

        results.append({
            "player_a_id": a,
            "player_b_id": b,
            "actual": actual,
            "expected": round(expected, 2),
            "deviation": round(deviation, 2),
        })

    results.sort(key=lambda r: r["deviation"], reverse=overplayed)
    return results[:limit]


def get_head_to_head_anomalies(db: Session, overplayed: bool, limit: int = 10) -> list[dict]:
    gp1 = aliased(GamePlayer)
    gp2 = aliased(GamePlayer)

    actual_counts = {
        (min(r.a, r.b), max(r.a, r.b)): r.count
        for r in db.query(
            gp1.player_id.label("a"),
            gp2.player_id.label("b"),
            func.count().label("count"),
        )
        .join(gp2, (gp1.game_id == gp2.game_id) & (gp1.team != gp2.team) & (gp1.player_id < gp2.player_id))
        .group_by(gp1.player_id, gp2.player_id)
        .all()
    }

    player_counts = _get_player_game_counts(db)
    total = _get_total_games(db)
    all_pairs = _get_all_player_pairs(player_counts)

    results = []
    for a, b in all_pairs:
        if not overplayed:
            if player_counts.get(a, 0) < MIN_GAMES_THRESHOLD:
                continue
            if player_counts.get(b, 0) < MIN_GAMES_THRESHOLD:
                continue

        actual = actual_counts.get((a, b), 0)
        expected = _expected_frequency(player_counts.get(a, 0), player_counts.get(b, 0), total)
        deviation = actual - expected

        if overplayed and deviation <= 0:
            continue
        if not overplayed and deviation >= 0:
            continue

        results.append({
            "player_a_id": a,
            "player_b_id": b,
            "actual": actual,
            "expected": round(expected, 2),
            "deviation": round(deviation, 2),
        })

    results.sort(key=lambda r: r["deviation"], reverse=overplayed)
    return results[:limit]
```

- [ ] **Step 4: Create `backend/app/routers/anomalies.py`**

```python
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..services import anomalies as anomaly_service

router = APIRouter()


@router.get("/partnerships/overplayed")
def partnerships_overplayed(limit: int = 10, db: Session = Depends(get_db)):
    return anomaly_service.get_partnership_anomalies(db, overplayed=True, limit=limit)


@router.get("/partnerships/underplayed")
def partnerships_underplayed(limit: int = 10, db: Session = Depends(get_db)):
    return anomaly_service.get_partnership_anomalies(db, overplayed=False, limit=limit)


@router.get("/head-to-head/overplayed")
def head_to_head_overplayed(limit: int = 10, db: Session = Depends(get_db)):
    return anomaly_service.get_head_to_head_anomalies(db, overplayed=True, limit=limit)


@router.get("/head-to-head/underplayed")
def head_to_head_underplayed(limit: int = 10, db: Session = Depends(get_db)):
    return anomaly_service.get_head_to_head_anomalies(db, overplayed=False, limit=limit)
```

- [ ] **Step 5: Register in `main.py`**

```python
from .routers import players, ingest, stats, anomalies, games

app.include_router(anomalies.router, prefix="/anomalies", tags=["anomalies"])
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd backend && pytest tests/test_anomalies.py -v
```

Expected: all `PASSED`

- [ ] **Step 7: Run full test suite**

```bash
cd backend && pytest -v
```

Expected: all tests `PASSED`

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/anomalies.py backend/app/routers/anomalies.py backend/app/main.py
git commit -m "feat: anomaly detection — overplayed/underplayed partnerships and head-to-heads"
```

---

## Out of Scope (Separate Plans)

- **Frontend** — React app, stats dashboard, graph visualisation (roadmap item 3 UI)
- **Upload flow** — POST endpoints for uploading CSVs and alias files via frontend (roadmap item 5)
- **Auth** — user management, multi-user access (roadmap item 6)
