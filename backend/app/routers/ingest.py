from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import require_admin
from ..services.ingest import resolve_aliases, ingest_csv_file, validate_games, ingest_games
from ..schemas import IngestGamesRequest, IngestGamesResponse

router = APIRouter()


class IngestRequest(BaseModel):
    files: list[str]  # list of raw CSV content strings


class IngestResponse(BaseModel):
    games_loaded: int
    errors: list[str]


@router.post("/scores", response_model=IngestResponse, dependencies=[Depends(require_admin)])
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


@router.post("/games", response_model=IngestGamesResponse, dependencies=[Depends(require_admin)])
def ingest_games_endpoint(request: IngestGamesRequest, db: Session = Depends(get_db)):
    loaded, errors = ingest_games(db, request.played_on, request.games)
    if errors:
        raise HTTPException(status_code=422, detail=errors)
    db.commit()
    return IngestGamesResponse(games_loaded=loaded)


class GameRowError(BaseModel):
    row: int
    errors: list[str]


class ValidateGamesResponse(BaseModel):
    errors: list[GameRowError]


@router.post("/validate", response_model=ValidateGamesResponse)
def validate_games_endpoint(request: IngestGamesRequest, db: Session = Depends(get_db)):
    errors = validate_games(db, request.played_on, request.games)
    return ValidateGamesResponse(errors=errors)
