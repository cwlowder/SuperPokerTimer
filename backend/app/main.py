import logging
import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from .settings import settings as app_settings
from .logging_config import setup_logging
from .db import open_database
from .events import EventBus
from .timer import TimerService
from .api import router
from .ws_manager import router as ws_router

setup_logging(app_settings.log_level)
log = logging.getLogger(__name__)


class _SPAStaticFiles(StaticFiles):
    """Serve index.html for any path that doesn't match a real file (SPA client-side routing)."""
    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as e:
            if e.status_code == 404:
                return FileResponse(os.path.join(self.directory, "index.html"))
            raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("starting up (log level %s)", app_settings.log_level)
    db = await open_database(app_settings)
    app.state.db = db

    bus = EventBus()
    app.state.bus = bus

    timer = TimerService(conn=db, bus=bus)
    app.state.timer = timer
    await timer.load()
    await timer.start()

    app.state.sounds_dir = app_settings.sounds_dir
    log.info("startup complete")
    yield
    log.info("shutting down")
    await db.close()

app = FastAPI(title="Super Poker Timer", version="0.1.0", lifespan=lifespan)

allow = app_settings.cors_allow_origins
origins = ["*"] if allow.strip() == "*" else [o.strip() for o in allow.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
async def log_unhandled_exception(request: Request, exc: Exception):
    """Catch-all so no request failure goes unrecorded."""
    log.exception("unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


@app.exception_handler(StarletteHTTPException)
async def log_http_exception(request: Request, exc: StarletteHTTPException):
    # 4xx are client mistakes, not incidents: record them without a traceback.
    if exc.status_code >= 500:
        log.error("%s %s -> %s: %s", request.method, request.url.path, exc.status_code, exc.detail)
    elif exc.status_code != 404:
        log.warning("%s %s -> %s: %s", request.method, request.url.path, exc.status_code, exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


os.makedirs(app_settings.sounds_dir, exist_ok=True)
app.mount("/sounds", StaticFiles(directory=app_settings.sounds_dir), name="sounds")
app.include_router(router, prefix="/api")
app.include_router(ws_router, prefix="/ws")

if app_settings.static_dir and os.path.isdir(app_settings.static_dir):
    app.mount("/", _SPAStaticFiles(directory=app_settings.static_dir, html=True), name="frontend")
