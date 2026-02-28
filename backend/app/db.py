import json
import aiosqlite
from typing import Any

SCHEMA = r"""
PRAGMA journal_mode=WAL;

CREATE TABLE IF NOT EXISTS settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tourney_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  current_level_index INTEGER NOT NULL,
  remaining_ms INTEGER NOT NULL,
  finish_at_server_ms INTEGER NOT NULL DEFAULT 0,
  running INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  eliminated INTEGER NOT NULL DEFAULT 0,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tables (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  seats INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS seat_assignments (
  table_id TEXT NOT NULL,
  seat_num INTEGER NOT NULL,
  player_id TEXT NULL,
  PRIMARY KEY (table_id, seat_num),
  FOREIGN KEY (table_id) REFERENCES tables(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at_ms INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL
);
"""

DEFAULT_SETTINGS = {
  "levels": [
    {"type": "regular", "minutes": 20, "small_blind_cents": 10, "big_blind_cents": 20, "ante_cents": 0},
    {"type": "regular", "minutes": 20, "small_blind_cents": 20, "big_blind_cents": 40, "ante_cents": 0},
    {"type": "regular", "minutes": 20, "small_blind_cents": 50, "big_blind_cents": 100, "ante_cents": 0},
    {"type": "break",   "minutes": 10,  "small_blind_cents": 0,   "big_blind_cents": 0,   "ante_cents": 0},
    {"type": "regular", "minutes": 20, "small_blind_cents": 100, "big_blind_cents": 200, "ante_cents": 0},
    {"type": "regular", "minutes": 20, "small_blind_cents": 150, "big_blind_cents": 300, "ante_cents": 0},
    {"type": "regular", "minutes": 20, "small_blind_cents": 250, "big_blind_cents": 500, "ante_cents": 0},
    {"type": "regular", "minutes": 20, "small_blind_cents": 400, "big_blind_cents": 800, "ante_cents": 0},
    {"type": "break",   "minutes": 10,  "small_blind_cents": 0,   "big_blind_cents": 0,   "ante_cents": 0},
    {"type": "regular", "minutes": 20, "small_blind_cents": 700, "big_blind_cents": 1400, "ante_cents": 0},
    {"type": "regular", "minutes": 20, "small_blind_cents": 1250, "big_blind_cents": 2500, "ante_cents": 0},
    {"type": "regular", "minutes": 20, "small_blind_cents": 2000, "big_blind_cents": 4000, "ante_cents": 0},
    {"type": "regular", "minutes": 20, "small_blind_cents": 3500, "big_blind_cents": 7000, "ante_cents": 0},
    {"type": "regular", "minutes": 20, "small_blind_cents": 7000, "big_blind_cents": 14000, "ante_cents": 0},

    # {"type": "regular", "minutes": 30, "small_blind_cents": 50, "big_blind_cents": 100, "ante_cents": 0},
    # {"type": "regular", "minutes": 30, "small_blind_cents": 100, "big_blind_cents": 200, "ante_cents": 0},
    # {"type": "break",   "minutes": 5,  "small_blind_cents": 0,   "big_blind_cents": 0,   "ante_cents": 0},
    # {"type": "regular", "minutes": 30, "small_blind_cents": 250, "big_blind_cents": 500, "ante_cents": 0},
    # {"type": "regular", "minutes": 15, "small_blind_cents": 300, "big_blind_cents": 600, "ante_cents": 0}
  ],
  "sounds": {"transition": None, "half": None, "thirty": None, "five": None, "end": None},
  "seating": {"min_players_per_table": 4}
}

DEFAULT_STATE = {
  "current_level_index": 0,
  "remaining_ms": DEFAULT_SETTINGS["levels"][0]["minutes"] * 60_000,
  "finish_at_server_ms": 0,
  "running": 0,
  "updated_at_ms": 0
}

async def connect(db_path: str) -> aiosqlite.Connection:
    conn = await aiosqlite.connect(db_path)
    conn.row_factory = aiosqlite.Row
    await conn.executescript(SCHEMA)
    await conn.commit()
    await _ensure_defaults(conn)
    return conn

async def _ensure_defaults(conn: aiosqlite.Connection) -> None:
    cur = await conn.execute("SELECT json FROM settings WHERE id=1")
    row = await cur.fetchone()
    if not row:
        await conn.execute("INSERT INTO settings (id, json) VALUES (1, ?)", (json.dumps(DEFAULT_SETTINGS),))

    cur = await conn.execute("SELECT 1 FROM tourney_state WHERE id=1")
    row = await cur.fetchone()
    if not row:
        await conn.execute(
            "INSERT INTO tourney_state (id, current_level_index, remaining_ms, finish_at_server_ms, running, updated_at_ms) VALUES (1, ?, ?, ?, ?, ?)",
            (
                DEFAULT_STATE["current_level_index"],
                DEFAULT_STATE["remaining_ms"],
                DEFAULT_STATE["finish_at_server_ms"],
                DEFAULT_STATE["running"],
                DEFAULT_STATE["updated_at_ms"],
            )
        )
    await conn.commit()

async def get_settings(conn: aiosqlite.Connection) -> dict[str, Any]:
    cur = await conn.execute("SELECT json FROM settings WHERE id=1")
    row = await cur.fetchone()
    return json.loads(row["json"])

async def set_settings(conn: aiosqlite.Connection, settings: dict[str, Any]) -> None:
    await conn.execute("UPDATE settings SET json=? WHERE id=1", (json.dumps(settings),))
    await conn.commit()

async def get_state(conn: aiosqlite.Connection) -> dict[str, Any]:
    cur = await conn.execute("SELECT current_level_index, remaining_ms, finish_at_server_ms, running, updated_at_ms FROM tourney_state WHERE id=1")
    row = await cur.fetchone()
    return dict(row)

async def set_state(
    conn: aiosqlite.Connection,
    *,
    current_level_index: int,
    remaining_ms: int,
    finish_at_server_ms: int,
    running: int,
    updated_at_ms: int
) -> None:
    await conn.execute(
        "UPDATE tourney_state SET current_level_index=?, remaining_ms=?, finish_at_server_ms=?, running=?, updated_at_ms=? WHERE id=1",
        (current_level_index, remaining_ms, finish_at_server_ms, running, updated_at_ms)
    )
    await conn.commit()

async def add_announcement(conn: aiosqlite.Connection, *, created_at_ms: int, type: str, payload: dict[str, Any]) -> int:
    cur = await conn.execute(
        "INSERT INTO announcements (created_at_ms, type, payload_json) VALUES (?, ?, ?)",
        (created_at_ms, type, json.dumps(payload))
    )
    await conn.commit()
    return cur.lastrowid

async def list_announcements(conn: aiosqlite.Connection, limit: int = 50) -> list[dict[str, Any]]:
    cur = await conn.execute(
        "SELECT id, created_at_ms, type, payload_json FROM announcements ORDER BY id DESC LIMIT ?",
        (limit,)
    )
    rows = await cur.fetchall()
    out: list[dict[str, Any]] = []
    for r in rows:
        out.append({
            "id": r["id"],
            "created_at_ms": r["created_at_ms"],
            "type": r["type"],
            "payload": json.loads(r["payload_json"]),
        })
    return out
