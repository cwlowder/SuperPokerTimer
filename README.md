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

## Quick start (Docker)

Dev (hot reload for API + UI):

```bash
docker compose up --build
```

Open:

- Admin UI: http://localhost:5173
- Display mode: http://localhost:5173/display
- Backend API: http://localhost:8000/docs

Prod-like (optimized build, no code hot reload):

```bash
docker compose -f docker-compose.prod.yml up --build
```

Open:

- App: http://localhost:8080
- Backend API docs: http://localhost:8080/docs

On your phone, replace `localhost` with the IP of the machine running Docker (for example `http://192.168.1.50:5173` for dev, or `http://192.168.1.50:8080` for prod).

## Persistence

- SQLite DB: docker volume `pokertourney_data`
- Sounds: put files into `./sounds` (mounted into backend)

## Adding sounds

Put audio files into `./sounds` (mp3/wav/ogg/m4a). They appear in the Sounds dropdowns.
The backend serves them at `/sounds/<filename>`.

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

## Configuration

Backend environment variables:

- `DATABASE_PATH` (default `./app.db`)
- `SOUNDS_DIR` (default `./sounds`)
- `CORS_ALLOW_ORIGINS` (default `*`)

Frontend environment variables:

- `VITE_BACKEND_URL` (default `http://backend:8000`)
- `VITE_ALLOWED_HOSTS` (default `all`)

Settings JSON:

- `settings.seating.min_players_per_table` (default `4`)

## Notes

- This is intended for a trusted LAN. There is no authentication.
