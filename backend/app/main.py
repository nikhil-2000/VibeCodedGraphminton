import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from . import models  # type: ignore # noqa: F401 — registers models with Base
from .routers import players, ingest, stats, games, anomalies, seasons


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Graph-minton API", lifespan=lifespan)

allowed_origins = os.environ.get("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(seasons.router)
app.include_router(players.router, prefix="/players", tags=["players"])
app.include_router(ingest.router, prefix="/ingest", tags=["ingest"])
app.include_router(stats.router, prefix="/stats", tags=["stats"])
app.include_router(games.router, prefix="/games", tags=["games"])
app.include_router(anomalies.router, prefix="/anomalies", tags=["anomalies"])
