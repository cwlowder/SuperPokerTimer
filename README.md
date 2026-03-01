# Poker Tourney Timer

A LAN-friendly web app for running a freezeout-style poker tournament. It includes a server-authoritative level timer, basic player tracking, and table seating tools.

## Features

- Level timer with a configurable schedule (regular + break levels) and blinds/ante per level
- Real-time updates to all clients (admin and display) over WebSocket
- Admin UI (start/pause, jump levels, add time, manage players/tables/seats)
- Display mode for a TV/projector at `/display` (read-only, still plays configured sounds)
- Optional sound cues: level transition, halfway, 30 seconds, 5 seconds, end
- Seating tools: manual seat moves, randomize seating, rebalance tables, deseat everyone
- Announcements for seating operations and timer events (shown in admin and display mode)

## Quick start — Development (Docker)

Hot-reload for both API and UI:

```bash
docker compose up --build
```

Open:

- Admin UI: http://localhost:5173
- Display mode: http://localhost:5173/display
- Backend API docs: http://localhost:8000/docs

On your phone, replace `localhost` with the host machine's IP (e.g. `http://192.168.1.50:5173`).

## Production deployment

A single Docker image bundles the FastAPI backend and compiled React frontend.
Pre-built multi-arch images (amd64 + arm64) are published to GHCR on every release.

### Quick start

```bash
# 1. Clone the repo (or just grab docker-compose.prod.yml + .env.example)
git clone https://github.com/cwlowder/SuperPokerTimer.git
cd SuperPokerTimer

# 2. Create your config
cp .env.example .env
# Edit .env as needed (port, etc.)

# 3. Start
docker compose -f docker-compose.prod.yml up -d
```

Open: http://localhost:8000

### Configuration

All production settings are controlled via `.env` (see `.env.example` for defaults):

| Variable | Default | Description |
|---|---|---|
| `IMAGE_TAG` | `latest` | Image version tag (e.g. `v1.0.0`) |
| `PORT` | `8000` | Host port the app binds to |
| `CORS_ALLOW_ORIGINS` | *(empty)* | Comma-separated origins, or leave empty for same-origin |

### Running behind a reverse proxy

If your host has a reverse proxy (Traefik, Caddy, nginx, TrueNAS, etc.), point it at `http://<host>:<PORT>`. The app serves everything (UI, API, WebSocket) on a single port. No special path-based routing is required.

### Building from source

If you prefer to build locally instead of pulling from GHCR:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

## Persistence

- **Database**: SQLite, stored in the `pokertourney_data` Docker volume.
- **Sounds**: stored in the `pokertourney_sounds` volume. Put audio files (mp3/wav/ogg/m4a) there; they appear in the admin UI sound dropdowns.

## Adding sounds

Put audio files into `./sounds/` (for dev) or into the `pokertourney_sounds` volume (for prod).
The backend serves them at `/sounds/<filename>` and they appear in the Sounds dropdowns.

## Announcements

Seating operations (randomize, rebalance, deseat) and timer events (level changes/resets, schedule complete) create announcements.
Display mode shows announcements prominently.

## Seating settings

Minimum players per table (default 4): randomize/rebalance will reduce the number of tables when possible to keep at least this many players per used table.

## Local development (no Docker)

Backend (FastAPI):

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Frontend (Vite + React):

```bash
cd frontend
npm install
VITE_BACKEND_URL=http://localhost:8000 npm run dev -- --host 0.0.0.0 --port 5173
```

## Running tests

Backend unit tests (pytest):

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r requirements-test.txt
pytest
```

CI runs the same suite via GitHub Actions: `.github/workflows/tests.yaml`.
Production Docker images are built/published via GitHub Actions: `.github/workflows/publish-images.yaml` (default branch publishes `latest`; tags like `v1.2.3` or `v1.2.3-rc.1` publish tagged images).

## Environment variables reference

Backend:

| Variable | Default | Description |
|---|---|---|
| `DATABASE_PATH` | `./app.db` | Path to SQLite database file |
| `SOUNDS_DIR` | `./sounds` | Directory containing sound files |
| `STATIC_DIR` | `./static` | Directory containing compiled frontend (set automatically in Docker) |
| `CORS_ALLOW_ORIGINS` | `*` | Allowed CORS origins (comma-separated or `*`) |

Frontend (dev only):

| Variable | Default | Description |
|---|---|---|
| `VITE_BACKEND_URL` | `http://backend:8000` | Backend URL for Vite dev proxy |
| `VITE_ALLOWED_HOSTS` | `all` | Vite dev server allowed hosts |

Settings JSON:

- `settings.seating.min_players_per_table` (default `4`)

## Notes

- This is intended for a trusted LAN. There is no authentication.
