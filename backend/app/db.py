import asyncio
import re
import json
import aiosqlite
import asyncpg
from abc import ABC, abstractmethod
from typing import Any, Optional

SQLITE_SCHEMA = r"""
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

POSTGRES_SCHEMA = """
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
  id SERIAL PRIMARY KEY,
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
  ],
  "sounds": {"transition": None, "half": None, "thirty": None, "five": None, "end": None},
  "seating": {"min_players_per_table": 4},
  "currency": {"symbol": "$", "denomination": "cents"}
}

DEFAULT_STATE = {
  "current_level_index": 0,
  "remaining_ms": DEFAULT_SETTINGS["levels"][0]["minutes"] * 60_000,
  "finish_at_server_ms": 0,
  "running": 0,
  "updated_at_ms": 0
}


def _to_pg(sql: str, params: tuple) -> tuple[str, list]:
    """Translate SQLite-flavored SQL to PostgreSQL: ? -> $N, INSERT OR IGNORE -> ON CONFLICT DO NOTHING."""
    is_ignore = bool(re.search(r'\bINSERT\s+OR\s+IGNORE\b', sql, re.IGNORECASE))
    if is_ignore:
        sql = re.sub(r'\bINSERT\s+OR\s+IGNORE\s+INTO\b', 'INSERT INTO', sql, flags=re.IGNORECASE)
    n = 0
    def _replace(m: re.Match) -> str:
        nonlocal n
        n += 1
        return f'${n}'
    pg_sql = re.sub(r'\?', _replace, sql)
    if is_ignore:
        # ON CONFLICT must come before RETURNING if present
        m = re.search(r'\bRETURNING\b', pg_sql, re.IGNORECASE)
        if m:
            pg_sql = pg_sql[:m.start()].rstrip() + ' ON CONFLICT DO NOTHING ' + pg_sql[m.start():]
        else:
            pg_sql = pg_sql.rstrip().rstrip(';') + ' ON CONFLICT DO NOTHING'
    return pg_sql, list(params)


class Database(ABC):
    """Async database abstraction supporting SQLite and PostgreSQL."""

    @abstractmethod
    async def execute(self, sql: str, params: tuple = ()) -> None: ...

    @abstractmethod
    async def execute_returning_id(self, sql: str, params: tuple = ()) -> int: ...

    @abstractmethod
    async def fetchone(self, sql: str, params: tuple = ()) -> Optional[dict[str, Any]]: ...

    @abstractmethod
    async def fetchall(self, sql: str, params: tuple = ()) -> list[dict[str, Any]]: ...

    @abstractmethod
    async def commit(self) -> None: ...

    @abstractmethod
    async def close(self) -> None: ...


class SqliteDatabase(Database):
    def __init__(self, conn: aiosqlite.Connection) -> None:
        self._conn = conn

    @classmethod
    async def connect(cls, path: str) -> "SqliteDatabase":
        conn = await aiosqlite.connect(path)
        conn.row_factory = aiosqlite.Row
        await conn.executescript(SQLITE_SCHEMA)
        await conn.commit()
        db = cls(conn)
        await _ensure_defaults(db)
        return db

    async def execute(self, sql: str, params: tuple = ()) -> None:
        await self._conn.execute(sql, params)

    async def execute_returning_id(self, sql: str, params: tuple = ()) -> int:
        cur = await self._conn.execute(sql, params)
        return cur.lastrowid

    async def fetchone(self, sql: str, params: tuple = ()) -> Optional[dict[str, Any]]:
        cur = await self._conn.execute(sql, params)
        row = await cur.fetchone()
        return dict(row) if row else None

    async def fetchall(self, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
        cur = await self._conn.execute(sql, params)
        rows = await cur.fetchall()
        return [dict(r) for r in rows]

    async def commit(self) -> None:
        await self._conn.commit()

    async def close(self) -> None:
        await self._conn.close()


class PostgresDatabase(Database):
    """
    PostgreSQL backend using a connection pool.

    Writes serialize through a per-instance asyncio.Lock: the lock is acquired
    on the first execute() call and released when commit() (or close()) is
    called.  Reads (fetchone/fetchall) acquire a fresh pool connection each
    time and see READ COMMITTED data — they never block on the write lock.
    """

    def __init__(self, pool: asyncpg.Pool) -> None:
        self._pool = pool
        self._write_lock = asyncio.Lock()
        self._conn: Optional[Any] = None  # pool connection held for current write tx
        self._tx: Optional[Any] = None

    @classmethod
    async def connect(cls, dsn: str) -> "PostgresDatabase":
        pool = await asyncpg.create_pool(dsn, min_size=1, max_size=5)
        async with pool.acquire() as conn:
            async with conn.transaction():
                for stmt in POSTGRES_SCHEMA.split(';'):
                    stmt = stmt.strip()
                    if stmt:
                        await conn.execute(stmt)
        db = cls(pool)
        await _ensure_defaults(db)
        return db

    async def _begin(self) -> None:
        if self._tx is None:
            await self._write_lock.acquire()
            try:
                self._conn = await self._pool.acquire()
                self._tx = self._conn.transaction()
                await self._tx.start()
            except Exception:
                conn = self._conn
                self._conn = None
                if conn is not None:
                    try:
                        await self._pool.release(conn)
                    except Exception:
                        pass
                self._write_lock.release()
                raise

    async def _abort(self) -> None:
        """Roll back the current transaction and release all resources."""
        held_lock = self._conn is not None
        tx, conn = self._tx, self._conn
        self._tx = None
        self._conn = None
        if tx is not None:
            try:
                await tx.rollback()
            except Exception:
                pass
        if conn is not None:
            try:
                await self._pool.release(conn)
            except Exception:
                pass
        if held_lock:
            self._write_lock.release()

    async def execute(self, sql: str, params: tuple = ()) -> None:
        if sql.strip().upper().startswith('PRAGMA'):
            return
        await self._begin()
        try:
            pg_sql, pg_params = _to_pg(sql, params)
            await self._conn.execute(pg_sql, *pg_params)
        except Exception:
            await self._abort()
            raise

    async def execute_returning_id(self, sql: str, params: tuple = ()) -> int:
        await self._begin()
        try:
            pg_sql, pg_params = _to_pg(sql + ' RETURNING id', params)
            return await self._conn.fetchval(pg_sql, *pg_params)
        except Exception:
            await self._abort()
            raise

    async def fetchone(self, sql: str, params: tuple = ()) -> Optional[dict[str, Any]]:
        pg_sql, pg_params = _to_pg(sql, params)
        async with self._pool.acquire() as conn:
            row = await conn.fetchrow(pg_sql, *pg_params)
            return dict(row) if row else None

    async def fetchall(self, sql: str, params: tuple = ()) -> list[dict[str, Any]]:
        pg_sql, pg_params = _to_pg(sql, params)
        async with self._pool.acquire() as conn:
            rows = await conn.fetch(pg_sql, *pg_params)
            return [dict(r) for r in rows]

    async def commit(self) -> None:
        if self._tx is not None:
            await self._tx.commit()
            self._tx = None
            conn = self._conn
            self._conn = None
            await self._pool.release(conn)
            self._write_lock.release()

    async def close(self) -> None:
        await self._abort()
        await self._pool.close()


async def _ensure_defaults(db: Database) -> None:
    row = await db.fetchone("SELECT json FROM settings WHERE id=1")
    if not row:
        await db.execute(
            "INSERT INTO settings (id, json) VALUES (?, ?)",
            (1, json.dumps(DEFAULT_SETTINGS)),
        )
    row = await db.fetchone("SELECT 1 FROM tourney_state WHERE id=1")
    if not row:
        await db.execute(
            "INSERT INTO tourney_state (id, current_level_index, remaining_ms, finish_at_server_ms, running, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?)",
            (
                1,
                DEFAULT_STATE["current_level_index"],
                DEFAULT_STATE["remaining_ms"],
                DEFAULT_STATE["finish_at_server_ms"],
                DEFAULT_STATE["running"],
                DEFAULT_STATE["updated_at_ms"],
            ),
        )
    await db.commit()


async def open_database(settings: Any) -> Database:
    if settings.database_dsn:
        return await PostgresDatabase.connect(settings.database_dsn)
    return await SqliteDatabase.connect(settings.database_path)


async def get_settings(db: Database) -> dict[str, Any]:
    row = await db.fetchone("SELECT json FROM settings WHERE id=1")
    return json.loads(row["json"])

async def set_settings(db: Database, settings: dict[str, Any]) -> None:
    await db.execute("UPDATE settings SET json=? WHERE id=1", (json.dumps(settings),))
    await db.commit()

async def get_state(db: Database) -> dict[str, Any]:
    row = await db.fetchone(
        "SELECT current_level_index, remaining_ms, finish_at_server_ms, running, updated_at_ms FROM tourney_state WHERE id=1"
    )
    return row

async def set_state(
    db: Database,
    *,
    current_level_index: int,
    remaining_ms: int,
    finish_at_server_ms: int,
    running: int,
    updated_at_ms: int,
) -> None:
    await db.execute(
        "UPDATE tourney_state SET current_level_index=?, remaining_ms=?, finish_at_server_ms=?, running=?, updated_at_ms=? WHERE id=1",
        (current_level_index, remaining_ms, finish_at_server_ms, running, updated_at_ms),
    )
    await db.commit()

async def add_announcement(db: Database, *, created_at_ms: int, type: str, payload: dict[str, Any]) -> int:
    row_id = await db.execute_returning_id(
        "INSERT INTO announcements (created_at_ms, type, payload_json) VALUES (?, ?, ?)",
        (created_at_ms, type, json.dumps(payload)),
    )
    await db.commit()
    return row_id

async def list_announcements(db: Database, limit: int = 50) -> list[dict[str, Any]]:
    rows = await db.fetchall(
        "SELECT id, created_at_ms, type, payload_json FROM announcements ORDER BY id DESC LIMIT ?",
        (limit,),
    )
    return [
        {
            "id": r["id"],
            "created_at_ms": r["created_at_ms"],
            "type": r["type"],
            "payload": json.loads(r["payload_json"]),
        }
        for r in rows
    ]
