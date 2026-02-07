import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .settings import settings as app_settings
from .db import connect
from .events import EventBus
from .timer import TimerService
from .api import router
from .ws_manager import router as ws_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    db = await connect(app_settings.database_path)
    app.state.db = db

    bus = EventBus()
    app.state.bus = bus

    timer = TimerService(conn=db, bus=bus)
    app.state.timer = timer
    await timer.load()
    await timer.start()

    app.state.sounds_dir = app_settings.sounds_dir
    yield
    await db.close()

app = FastAPI(title="Poker Tourney Timer", version="0.1.0", lifespan=lifespan)

allow = app_settings.cors_allow_origins
origins = ["*"] if allow.strip() == "*" else [o.strip() for o in allow.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs(app_settings.sounds_dir, exist_ok=True)
app.mount("/sounds", StaticFiles(directory=app_settings.sounds_dir), name="sounds")
app.include_router(router, prefix="/api")
app.include_router(ws_router, prefix="/ws")
