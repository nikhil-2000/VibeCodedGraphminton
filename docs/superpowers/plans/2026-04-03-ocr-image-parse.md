# OCR Image Parse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `POST /ingest/parse-image` endpoint that accepts a scoresheet photo, uses pytesseract OCR to extract game rows, fuzzy-matches player names against known aliases, and returns structured game data that the frontend can use to pre-fill a `SessionCard`.

**Architecture:** The backend owns all OCR and resolution logic. A new `services/ocr.py` module chains image preprocessing (Pillow), text extraction (pytesseract), regex row parsing, and fuzzy alias resolution (rapidfuzz). The endpoint returns `OcrParseResponse` with resolved player IDs and confidence scores. The frontend adds an image upload button to `UploadPage` and pre-fills a new `SessionCard` from the response.

**Tech Stack:** FastAPI + SQLAlchemy (backend), pytesseract + Pillow + rapidfuzz (OCR), React 19 + TypeScript (frontend).

---

## File Structure

**Backend — modify:**
- `backend/requirements.txt` — add pytesseract, Pillow, rapidfuzz
- `backend/app/schemas.py` — add `OcrPlayerRef`, `OcrGameRow`, `OcrParseResponse`
- `backend/app/routers/ingest.py` — add `POST /parse-image` endpoint

**Backend — create:**
- `backend/app/services/ocr.py` — preprocess, extract, parse, resolve, orchestrate
- `backend/tests/integration/test_ocr.py` — tests for parse_rows + full parse_image with mocked OCR

**Frontend — modify:**
- `frontend/src/api/ingest.ts` — add `parseImage(file: File)`
- `frontend/src/pages/UploadPage.tsx` — add image upload button + pre-fill logic

---

## Tasks

### Task 1: Backend OCR service, schemas, endpoint, and tests

**Files:**
- Modify: `backend/requirements.txt`
- Modify: `backend/app/schemas.py`
- Create: `backend/app/services/ocr.py`
- Modify: `backend/app/routers/ingest.py`
- Create: `backend/tests/integration/test_ocr.py`

- [ ] **Step 1: Add dependencies to requirements.txt**

Open `backend/requirements.txt` and add these three lines:

```
pytesseract==0.3.13
Pillow==11.1.0
rapidfuzz==3.12.2
```

- [ ] **Step 2: Add schemas to `backend/app/schemas.py`**

Append to the bottom of `backend/app/schemas.py`:

```python
# --- OCR ---

class OcrPlayerRef(BaseModel):
    raw: str            # OCR'd text before resolution
    player_id: int | None  # resolved canonical player ID, None if unresolved
    confidence: float   # 0.0–1.0 rapidfuzz score (1.0 when exact alias match)


class OcrGameRow(BaseModel):
    game_number: int
    team_a: tuple[OcrPlayerRef, OcrPlayerRef]
    score_a: int
    team_b: tuple[OcrPlayerRef, OcrPlayerRef]
    score_b: int


class OcrParseResponse(BaseModel):
    played_on: str | None  # ISO date (YYYY-MM-DD) if found in image, else None
    games: list[OcrGameRow]
    raw_text: str          # full OCR output, useful for debugging
```

- [ ] **Step 3: Write the failing tests**

Create `backend/tests/integration/test_ocr.py`:

```python
import pytest
from unittest.mock import patch
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session
from app.main import app
from app.models import Player, PlayerAlias
from app.services.ocr import parse_rows, parse_image
from .conftest import get_test_db  # adjust if conftest uses a different name

client = TestClient(app)


@pytest.fixture()
def players_with_aliases(db: Session):
    alice = Player(canonical_name="Alice", is_sub=False)
    bob = Player(canonical_name="Bob", is_sub=False)
    chan = Player(canonical_name="Chan", is_sub=False)
    jay = Player(canonical_name="Jay", is_sub=False)
    db.add_all([alice, bob, chan, jay])
    db.flush()
    db.add(PlayerAlias(player_id=alice.id, alias="Alice"))
    db.add(PlayerAlias(player_id=bob.id, alias="Bob"))
    db.add(PlayerAlias(player_id=chan.id, alias="Chan"))
    db.add(PlayerAlias(player_id=jay.id, alias="Jayesh"))
    db.commit()
    db.refresh(alice)
    db.refresh(bob)
    db.refresh(chan)
    db.refresh(jay)
    return {"alice": alice, "bob": bob, "chan": chan, "jay": jay}


def test_parse_rows_comma_delimited():
    text = "08-04-2024\n1,Alice,Bob,21,Chan,Jayesh,9\n2,Bob,Chan,15,Alice,Jayesh,18\n"
    rows = parse_rows(text)
    assert len(rows) == 2
    assert rows[0] == {
        "game_number": 1,
        "names": ["Alice", "Bob", "Chan", "Jayesh"],
        "score_a": 21,
        "score_b": 9,
    }
    assert rows[1]["game_number"] == 2


def test_parse_rows_whitespace_delimited():
    text = "1 Alice Bob 21 Chan Jayesh 9\n"
    rows = parse_rows(text)
    assert len(rows) == 1
    assert rows[0]["names"] == ["Alice", "Bob", "Chan", "Jayesh"]


def test_parse_rows_skips_non_game_lines():
    text = "Date: 08/04/2024\nSome header\n1,Alice,Bob,21,Chan,Jayesh,9\nTotal: 3 games\n"
    rows = parse_rows(text)
    assert len(rows) == 1


def test_parse_rows_extracts_date():
    text = "08-04-2024\n1,Alice,Bob,21,Chan,Jayesh,9\n"
    rows = parse_rows(text)
    assert rows  # date extraction tested in parse_image, not parse_rows


def test_parse_image_resolves_players(players_with_aliases, db: Session):
    ocr_text = "08-04-2024\n1,Alice,Bob,21,Chan,Jayesh,9\n"
    fake_image_bytes = b"\x89PNG\r\n"  # minimal fake bytes; pytesseract is mocked

    with patch("app.services.ocr.pytesseract.image_to_string", return_value=ocr_text):
        with patch("app.services.ocr.preprocess_image", return_value=None):
            result = parse_image(db, fake_image_bytes)

    assert result.played_on == "2024-04-08"
    assert len(result.games) == 1
    game = result.games[0]
    assert game.game_number == 1
    assert game.score_a == 21
    assert game.score_b == 9
    assert game.team_a[0].player_id == players_with_aliases["alice"].id
    assert game.team_a[1].player_id == players_with_aliases["bob"].id
    assert game.team_b[0].player_id == players_with_aliases["chan"].id
    assert game.team_b[1].player_id == players_with_aliases["jay"].id


def test_parse_image_unresolved_name(players_with_aliases, db: Session):
    ocr_text = "1,Alice,Bob,21,Chan,ZXQ99,9\n"
    with patch("app.services.ocr.pytesseract.image_to_string", return_value=ocr_text):
        with patch("app.services.ocr.preprocess_image", return_value=None):
            result = parse_image(db, b"fake")
    assert result.games[0].team_b[1].player_id is None
    assert result.games[0].team_b[1].raw == "ZXQ99"


def test_parse_image_endpoint(players_with_aliases):
    ocr_text = "1,Alice,Bob,21,Chan,Jayesh,9\n"
    fake_png = b"\x89PNG\r\n\x1a\n"  # minimal PNG header
    with patch("app.services.ocr.pytesseract.image_to_string", return_value=ocr_text):
        with patch("app.services.ocr.preprocess_image", return_value=None):
            resp = client.post(
                "/ingest/parse-image",
                files={"file": ("sheet.png", fake_png, "image/png")},
            )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["games"]) == 1
```

- [ ] **Step 4: Run failing tests**

```bash
cd backend && python -m pytest tests/integration/test_ocr.py -v
```

Expected: errors like `ModuleNotFoundError: No module named 'app.services.ocr'` and `ImportError`.

- [ ] **Step 5: Create `backend/app/services/ocr.py`**

```python
from __future__ import annotations

import io
import re
from datetime import datetime

import pytesseract
from PIL import Image, ImageFilter
from rapidfuzz import process as fuzz_process
from sqlalchemy.orm import Session

from ..models import PlayerAlias
from ..schemas import OcrGameRow, OcrParseResponse, OcrPlayerRef

# Matches: game_number, name_a, name_b, score_a, name_x, name_y, score_b
# Handles both comma-delimited and whitespace-delimited rows.
_COMMA_ROW_RE = re.compile(
    r"^\s*(\d+)\s*,\s*"
    r"([A-Za-z][A-Za-z .'-]*?)\s*,\s*"
    r"([A-Za-z][A-Za-z .'-]*?)\s*,\s*"
    r"(\d+)\s*,\s*"
    r"([A-Za-z][A-Za-z .'-]*?)\s*,\s*"
    r"([A-Za-z][A-Za-z .'-]*?)\s*,\s*"
    r"(\d+)\s*$"
)
_SPACE_ROW_RE = re.compile(
    r"^\s*(\d+)\s+"
    r"([A-Za-z][A-Za-z'-]*)\s+"
    r"([A-Za-z][A-Za-z'-]*)\s+"
    r"(\d+)\s+"
    r"([A-Za-z][A-Za-z'-]*)\s+"
    r"([A-Za-z][A-Za-z'-]*)\s+"
    r"(\d+)\s*$"
)
_DATE_RE = re.compile(r"\b(\d{1,2})[-/](\d{1,2})[-/](\d{4})\b")

FUZZY_THRESHOLD = 70


def preprocess_image(image_bytes: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(image_bytes)).convert("L")
    img = img.resize((img.width * 2, img.height * 2), Image.LANCZOS)
    img = img.filter(ImageFilter.SHARPEN)
    img = img.point(lambda x: 0 if x < 140 else 255, "1")
    return img


def parse_rows(text: str) -> list[dict]:
    """Parse OCR text into raw game row dicts. Pure function; no DB access."""
    rows = []
    for line in text.splitlines():
        m = _COMMA_ROW_RE.match(line) or _SPACE_ROW_RE.match(line)
        if not m:
            continue
        gn, na, nb, sa, nx, ny, sb = m.groups()
        rows.append({
            "game_number": int(gn),
            "names": [na.strip(), nb.strip(), nx.strip(), ny.strip()],
            "score_a": int(sa),
            "score_b": int(sb),
        })
    return rows


def _extract_date(text: str) -> str | None:
    m = _DATE_RE.search(text)
    if not m:
        return None
    day, month, year = int(m.group(1)), int(m.group(2)), int(m.group(3))
    try:
        return datetime(year, month, day).date().isoformat()
    except ValueError:
        return None


def _resolve_names(
    db: Session, raw_names: list[str]
) -> dict[str, tuple[int | None, float]]:
    """Map each raw name to (player_id, confidence). Returns None id when unresolved."""
    all_aliases = db.query(PlayerAlias.alias, PlayerAlias.player_id).all()
    alias_to_player: dict[str, int] = {a.alias: a.player_id for a in all_aliases}
    alias_list = list(alias_to_player.keys())

    result: dict[str, tuple[int | None, float]] = {}
    for name in set(raw_names):
        # Exact match first
        if name in alias_to_player:
            result[name] = (alias_to_player[name], 1.0)
            continue
        # Fuzzy match
        match = fuzz_process.extractOne(name, alias_list, score_cutoff=FUZZY_THRESHOLD)
        if match:
            matched_alias, score, _ = match
            result[name] = (alias_to_player[matched_alias], score / 100.0)
        else:
            result[name] = (None, 0.0)
    return result


def _make_player_ref(name: str, resolution: dict[str, tuple[int | None, float]]) -> OcrPlayerRef:
    player_id, confidence = resolution[name]
    return OcrPlayerRef(raw=name, player_id=player_id, confidence=confidence)


def parse_image(db: Session, image_bytes: bytes) -> OcrParseResponse:
    img = preprocess_image(image_bytes)
    raw_text = pytesseract.image_to_string(img, config="--psm 6 --oem 3")
    rows = parse_rows(raw_text)
    played_on = _extract_date(raw_text)

    all_names = [name for row in rows for name in row["names"]]
    resolution = _resolve_names(db, all_names)

    games = []
    for row in rows:
        na, nb, nx, ny = row["names"]
        games.append(
            OcrGameRow(
                game_number=row["game_number"],
                team_a=(_make_player_ref(na, resolution), _make_player_ref(nb, resolution)),
                score_a=row["score_a"],
                team_b=(_make_player_ref(nx, resolution), _make_player_ref(ny, resolution)),
                score_b=row["score_b"],
            )
        )

    return OcrParseResponse(played_on=played_on, games=games, raw_text=raw_text)
```

- [ ] **Step 6: Add endpoint to `backend/app/routers/ingest.py`**

Add at the top with existing imports:

```python
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
```

Replace the existing `from fastapi import APIRouter, Depends, HTTPException` line, then append at the bottom of the file:

```python
from ..services.ocr import parse_image as ocr_parse_image
from ..schemas import OcrParseResponse


@router.post("/parse-image", response_model=OcrParseResponse)
async def parse_scoresheet_image(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=422, detail="File must be an image")
    image_bytes = await file.read()
    return ocr_parse_image(db, image_bytes)
```

- [ ] **Step 7: Run tests**

```bash
cd backend && python -m pytest tests/integration/test_ocr.py -v
```

Expected: all 6 tests pass. If pytesseract system binary is not installed, add a note that `tesseract` must be installed (`brew install tesseract` on macOS).

- [ ] **Step 8: Run full backend test suite**

```bash
cd backend && python -m pytest -v
```

Expected: all tests pass.

- [ ] **Step 9: Commit**

```bash
git add backend/requirements.txt backend/app/schemas.py backend/app/services/ocr.py backend/app/routers/ingest.py backend/tests/integration/test_ocr.py
git commit -m "feat: OCR scoresheet parsing via POST /ingest/parse-image"
```

---

### Task 2: Frontend `parseImage` API + UploadPage integration

**Files:**
- Modify: `frontend/src/api/ingest.ts`
- Modify: `frontend/src/pages/UploadPage.tsx`

- [ ] **Step 1: Add TypeScript types and `parseImage` to `frontend/src/api/ingest.ts`**

Replace the entire contents of `frontend/src/api/ingest.ts`:

```typescript
import { apiFetch } from './client'
import type { IngestResult } from '../types'

export const postScores = (files: string[]) =>
  apiFetch<IngestResult>('/ingest/scores', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files }),
  })

export interface OcrPlayerRef {
  raw: string
  player_id: number | null
  confidence: number
}

export interface OcrGameRow {
  game_number: number
  team_a: [OcrPlayerRef, OcrPlayerRef]
  score_a: number
  team_b: [OcrPlayerRef, OcrPlayerRef]
  score_b: number
}

export interface OcrParseResponse {
  played_on: string | null
  games: OcrGameRow[]
  raw_text: string
}

export const parseImage = (file: File): Promise<OcrParseResponse> => {
  const form = new FormData()
  form.append('file', file)
  return apiFetch<OcrParseResponse>('/ingest/parse-image', {
    method: 'POST',
    body: form,
  })
}

export interface IngestGamesRequest {
  played_on: string
  games: {
    team_a: [number, number]
    score_a: number
    team_b: [number, number]
    score_b: number
  }[]
}

export interface IngestGamesResponse {
  games_loaded: number
  errors: string[]
}

export const ingestGames = (payload: IngestGamesRequest) =>
  apiFetch<IngestGamesResponse>('/ingest/games', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

export interface ValidateGamesRequest {
  played_on: string
  games: IngestGamesRequest['games']
}

export interface ValidateGamesResponse {
  valid: boolean
  errors: { row: number; message: string }[]
}

export const validateGames = (payload: ValidateGamesRequest) =>
  apiFetch<ValidateGamesResponse>('/ingest/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
```

- [ ] **Step 2: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Add image upload button to `UploadPage.tsx`**

Read `frontend/src/pages/UploadPage.tsx` first, then add the image upload feature. The button should appear above the "Load CSV file" button and trigger a hidden file input. On file selection, call `parseImage`, then create a new `SessionCard` pre-filled with the parsed game rows.

Find the section where `SessionCard`s are rendered and add this pattern. The `OcrGameRow.team_a[0].player_id` (if not null) maps to the `playerId` field in the `SessionCard`'s game row structure. If `player_id` is null, leave the field blank for manual resolution.

Add a hidden file input ref and handler in the UploadPage component:

```typescript
import { parseImage, type OcrParseResponse } from '../api/ingest'

// Inside the component, alongside existing state:
const imageInputRef = useRef<HTMLInputElement>(null)
const [imageLoading, setImageLoading] = useState(false)
const [imageError, setImageError] = useState<string | null>(null)

const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return
  setImageLoading(true)
  setImageError(null)
  try {
    const result = await parseImage(file)
    const newCard = ocrResponseToSessionCard(result)
    setSessions((prev) => [...prev, newCard])
  } catch {
    setImageError('Failed to parse image. Try a clearer photo.')
  } finally {
    setImageLoading(false)
    // Reset input so the same file can be re-uploaded
    if (imageInputRef.current) imageInputRef.current.value = ''
  }
}
```

Add this helper function above the component (or as a util if needed):

```typescript
import type { OcrParseResponse, OcrGameRow } from '../api/ingest'
// SessionRow is whatever type SessionCard expects for a game row
// (adjust field names to match SessionCard's props)

function ocrResponseToSessionCard(result: OcrParseResponse) {
  return {
    id: crypto.randomUUID(),
    playedOn: result.played_on ?? '',
    rows: result.games.map((g: OcrGameRow) => ({
      teamA: [g.team_a[0].player_id ?? null, g.team_a[1].player_id ?? null] as [number | null, number | null],
      scoreA: g.score_a,
      teamB: [g.team_b[0].player_id ?? null, g.team_b[1].player_id ?? null] as [number | null, number | null],
      scoreB: g.score_b,
    })),
  }
}
```

Add the hidden input and visible button in the JSX (above the "Load CSV" button):

```tsx
<input
  ref={imageInputRef}
  type="file"
  accept="image/*"
  className="hidden"
  onChange={handleImageUpload}
/>
<Button
  variant="outline"
  size="sm"
  onClick={() => imageInputRef.current?.click()}
  disabled={imageLoading}
>
  {imageLoading ? 'Parsing…' : 'Parse from photo'}
</Button>
{imageError && <p className="text-sm text-destructive">{imageError}</p>}
```

- [ ] **Step 4: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors. Fix any type mismatches between `ocrResponseToSessionCard` output and `SessionCard` props — adjust field names to match what `SessionCard` actually expects.

- [ ] **Step 5: Run frontend tests**

```bash
cd frontend && npm test -- --run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/api/ingest.ts frontend/src/pages/UploadPage.tsx
git commit -m "feat: image upload button on UploadPage pre-fills SessionCard via OCR"
```
