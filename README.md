# Super Poker Timer

A LAN-friendly web app for running **freezeout** poker tournaments:
- Blind/level timer (regular + break levels)
- Shared admin control from any device
- "Big picture" TV display mode
- Customizable sounds for level milestones (start / half / 30s / end)
- Player list (add/search/eliminate)
- Tables + seats, random seating, and rebalancing with announcements

## Quick start (Docker)

```bash
docker compose up --build
```

Open:
- Admin UI: http://localhost:5173
- Big picture mode: http://localhost:5173/display
- Backend API: http://localhost:8000/docs

> On your phone, replace `localhost` with the IP of the machine running Docker (e.g. `http://192.168.1.50:5173`).

## Persistence

- SQLite DB: docker volume `pokertourney_data`
- Sounds: put files into `./sounds` (mounted into backend)

## Adding sounds

Put audio files into `./sounds` (mp3/wav/ogg/m4a). They appear in **Sounds** dropdowns.
The backend serves them at `/sounds/<filename>`.

## Big picture announcements

Randomize/Rebalance operations create a `rebalance` announcement listing seat moves.
Big picture mode shows announcements prominently.
