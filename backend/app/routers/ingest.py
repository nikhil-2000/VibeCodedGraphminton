import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..services.ingest import resolve_aliases, ingest_csv_file

router = APIRouter()


class IngestFile(BaseModel):
    filename: str   # e.g. "Week07.csv" — used to derive week number
    content: str    # raw CSV text


class IngestRequest(BaseModel):
    files: list[IngestFile]


class IngestResponse(BaseModel):
    games_loaded: int
    errors: list[str]


@router.post("/scores", response_model=IngestResponse)
def ingest_scores(request: IngestRequest, db: Session = Depends(get_db)):
    alias_map = resolve_aliases(db)

    all_errors: list[str] = []
    total_loaded = 0

    for file in request.files:
        match = re.search(r"(\d+)", file.filename)
        if not match:
            all_errors.append(f"{file.filename}: cannot determine week number from filename")
            continue
        week_number = int(match.group(1))

        lines = file.content.splitlines(keepends=True)
        loaded, errors = ingest_csv_file(db, lines, week_number, alias_map)
        if errors:
            all_errors.extend([f"{file.filename} — {e}" for e in errors])
        else:
            total_loaded += loaded

    if all_errors:
        raise HTTPException(status_code=422, detail=all_errors)

    db.commit()
    return IngestResponse(games_loaded=total_loaded, errors=[])
