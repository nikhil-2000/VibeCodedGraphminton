from contextlib import asynccontextmanager
from fastapi import FastAPI
from .database import engine, Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="Graph-minton API", lifespan=lifespan)

# Routers added in later tasks
