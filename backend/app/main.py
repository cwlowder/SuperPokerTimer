import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
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

# ---------------------------------------------------------------------------
# SPA static file serving (production only)
#
# When the compiled frontend exists at STATIC_DIR (copied into the Docker
# image by the root Dockerfile), mount it and add a catch-all that returns
# index.html for any path not handled by the API/WS/sounds routes.  This
# lets React Router handle client-side routing.
#
# In development the static dir doesn't exist, so this block is skipped
# and the Vite dev server handles the frontend instead.
# ---------------------------------------------------------------------------
_static_dir = Path(app_settings.static_dir)

if _static_dir.is_dir() and (_static_dir / "index.html").is_file():
    # Vite puts hashed assets under /assets/
    app.mount(
        "/assets",
        StaticFiles(directory=str(_static_dir / "assets")),
        name="frontend_assets",
    )

    # Cache the index.html contents once at startup
    _index_html = (_static_dir / "index.html").read_text()

    @app.get("/{path:path}", response_class=HTMLResponse, include_in_schema=False)
    async def _spa_catch_all(request: Request, path: str):
        """Serve a static file if it exists, otherwise return index.html."""
        file = _static_dir / path
        if path and file.is_file() and ".." not in path:
            return FileResponse(file)
        return HTMLResponse(_index_html)
