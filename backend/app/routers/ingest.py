import os
import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..services.ingest import resolve_aliases, ingest_csv_file

router = APIRouter()


class IngestRequest(BaseModel):
    filenames: list[str] = []  # empty = ingest all WeekXX.csv in DATA_DIR


class IngestResponse(BaseModel):
    games_loaded: int
    errors: list[str]


@router.post("/scores", response_model=IngestResponse)
def ingest_scores(request: IngestRequest, db: Session = Depends(get_db)):
    data_dir = os.environ.get("DATA_DIR", "/app/data/scores")
    alias_map = resolve_aliases(db)

    if request.filenames:
        filenames = request.filenames
    else:
        filenames = sorted(
            f for f in os.listdir(data_dir)
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
        filepath = os.path.join(data_dir, filename)
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

    db.commit()
    return IngestResponse(games_loaded=total_loaded, errors=[])
