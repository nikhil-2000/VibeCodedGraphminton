# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Graph-minton** is a badminton league analytics application. It ingests weekly match data, normalizes player names via alias mapping, stores results in a PostgreSQL database, and visualizes player relationships and statistics through a React frontend.

## Tech Stack

- **Backend**: Python (FastAPI + SQLAlchemy + Alembic), runs on port 8000
- **Database**: PostgreSQL 16 (via Docker)
- **Frontend**: React 19 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui, runs on port 5173

## Commands

### Run (Docker)
```bash
docker compose up          # start DB + backend
cd frontend && npm run dev  # start frontend
```

### Backend tests
```bash
# Integration tests require a running test DB (docker compose up db)
cd backend && pytest tests/unit          # unit tests only
cd backend && pytest tests/integration   # integration tests (needs postgres)
```

### Frontend
```bash
cd frontend && npm run dev          # dev server
cd frontend && npm run type-check   # type check
cd frontend && npm test             # vitest
cd frontend && npm run generate-types  # regenerate API types from openapi.json
```

## Data Format

### Score CSV (no header row)
```
Date, GameNo, A, B, PtsAB, X, Y, PtsXY
```
Example: `08-04-2024,1,Bhavin,Chets,21,Chan,Jayesh,9`
→ Bhavin & Chets beat Chan & Jayesh 21–9 on April 8 2024.

### Player aliases
Stored in the DB. Each player has a canonical name + zero or more aliases. All alias variants are resolved to canonical names during ingest.

## Key Architecture Notes

- **Ingest flow**: Frontend (`/upload`) lets users upload CSVs or enter sessions manually. The UI parses CSVs client-side, resolves player aliases, and POSTs to `POST /ingest/games`. A legacy raw-CSV endpoint (`POST /ingest/scores`) is preserved but hidden.
- **Admin routes**: Ingest endpoints require `X-Admin-Token` header. Token set via `ADMIN_TOKEN` env var.
- **API types**: `frontend/src/types/api.gen.ts` is auto-generated from `openapi.json` — don't edit manually.
- **Seasons**: Data is scoped by season. Season context flows through `SeasonFilterContext`.
- **Player identity**: `CurrentUserContext` tracks which player the current user is (set via `IdentityModal`).

## Roadmap (remaining)

1. Anomaly detection improvements (player-focused view — in progress)
2. User preferences persistence + backend filtering
3. Mobile UX improvements
4. Auth and multi-user support
