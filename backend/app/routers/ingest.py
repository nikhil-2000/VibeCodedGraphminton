from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..services.ingest import resolve_aliases, ingest_csv_file

router = APIRouter()


class IngestRequest(BaseModel):
    files: list[str]  # list of raw CSV content strings


class IngestResponse(BaseModel):
    games_loaded: int
    errors: list[str]


@router.post("/scores", response_model=IngestResponse)
def ingest_scores(request: IngestRequest, db: Session = Depends(get_db)):
    alias_map = resolve_aliases(db)

    all_errors: list[str] = []
    total_loaded = 0

    for i, content in enumerate(request.files, start=1):
        lines = content.splitlines(keepends=True)
        loaded, errors = ingest_csv_file(db, lines, alias_map)
        if errors:
            all_errors.extend([f"File {i} — {e}" for e in errors])
        else:
            total_loaded += loaded

    if all_errors:
        raise HTTPException(status_code=422, detail=all_errors)

    db.commit()
    return IngestResponse(games_loaded=total_loaded, errors=[])
