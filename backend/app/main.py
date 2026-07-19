from contextlib import asynccontextmanager
from fastapi import FastAPI
from .database import engine, Base
from . import models  # type: ignore # noqa: F401 — registers models with Base
from .routers import players, ingest, stats, games, anomalies, seasons


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Graph-minton API", lifespan=lifespan)
app.include_router(seasons.router)
app.include_router(players.router, prefix="/players", tags=["players"])
app.include_router(ingest.router, prefix="/ingest", tags=["ingest"])
app.include_router(stats.router, prefix="/stats", tags=["stats"])
app.include_router(games.router, prefix="/games", tags=["games"])
app.include_router(anomalies.router, prefix="/anomalies", tags=["anomalies"])
