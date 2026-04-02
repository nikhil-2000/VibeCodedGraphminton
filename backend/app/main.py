from fastapi import FastAPI
from .database import engine, Base

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Graph-minton API")

# Routers added in later tasks
