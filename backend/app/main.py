from contextlib import asynccontextmanager
from fastapi import FastAPI
from .database import engine, Base
from . import models  # noqa: F401 — registers models with Base
from .routers import players


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Graph-minton API", lifespan=lifespan)
app.include_router(players.router, prefix="/players", tags=["players"])
