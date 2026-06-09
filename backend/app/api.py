import os, json, uuid
from typing import Any, Optional
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

from .db import Database, get_settings, set_settings, get_state, list_announcements
from .events import EventBus
from .timer import TimerService
from .seating import randomize_seating, rebalance, deseat_seating, normalize_seats
from .utils import now_ms

router = APIRouter()

def sse_format(event: str, data: dict[str, Any]) -> str:
    payload = json.dumps(data, separators=(",", ":"))
    return f"event: {event}\ndata: {payload}\n\n"

@router.get("/health")
async def health():
    return {"ok": True}

@router.get("/state")
async def read_state(request: Request):
    db: Database = request.app.state.db
    settings = await get_settings(db)
    state = await get_state(db)
    return {"settings": settings, "state": state}

@router.put("/settings")
async def update_settings(request: Request, payload: dict[str, Any]):
    db: Database = request.app.state.db
    timer: TimerService = request.app.state.timer
    if "levels" not in payload or not isinstance(payload["levels"], list) or len(payload["levels"]) == 0:
        raise HTTPException(400, "settings.levels must be a non-empty list")
    await set_settings(db, payload)
    await normalize_seats(db)
    # Apply changes immediately: if current level duration changed, clamp remaining to new total
    settings = payload
    levels = settings.get("levels", [])
    try:
        idx = int(timer.current_level_index)
        if 0 <= idx < len(levels):
            total_ms = int(levels[idx].get("minutes", 0)) * 60_000
            if total_ms > 0:
                timer.remaining_ms = min(int(timer.remaining_ms), total_ms)
    except Exception:
        pass
    await timer._persist()
    await timer._emit_full_state()
    return {"ok": True}

@router.post("/timer/pause")
async def timer_pause(request: Request):
    timer: TimerService = request.app.state.timer
    await timer.pause()
    return {"ok": True}

@router.post("/timer/resume")
async def timer_resume(request: Request):
    timer: TimerService = request.app.state.timer
    await timer.resume()
    return {"ok": True}

@router.post("/timer/add_time")
async def timer_add_time(request: Request, delta_ms: int):
    timer: TimerService = request.app.state.timer
    await timer.add_time(delta_ms)
    return {"ok": True}

@router.post("/timer/reset_level")
async def timer_reset_level(request: Request):
    timer: TimerService = request.app.state.timer
    await timer.reset_level()
    return {"ok": True}

@router.post("/timer/go_to_level")
async def timer_go_to_level(request: Request, level_index: int):
    timer: TimerService = request.app.state.timer
    await timer.go_to_level(level_index)
    return {"ok": True}

@router.get("/sounds")
async def list_sounds(request: Request):
    sounds_dir = request.app.state.sounds_dir
    exts = {".mp3", ".wav", ".ogg", ".m4a"}
    out = []
    if os.path.isdir(sounds_dir):
        for fn in sorted(os.listdir(sounds_dir)):
            p = os.path.join(sounds_dir, fn)
            if os.path.isfile(p) and os.path.splitext(fn.lower())[1] in exts:
                out.append(fn)
    return {"files": out}

@router.get("/players")
async def list_players(request: Request, q: Optional[str] = None, eliminated: Optional[bool] = None):
    db: Database = request.app.state.db
    sql = "SELECT id, name, eliminated FROM players"
    clauses = []
    params: list[Any] = []
    if q:
        clauses.append("LOWER(name) LIKE ?")
        params.append(f"%{q.lower()}%")
    if eliminated is not None:
        clauses.append("eliminated=?")
        params.append(1 if eliminated else 0)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY eliminated ASC, created_at_ms DESC"
    rows = await db.fetchall(sql, tuple(params))
    return [{"id": r["id"], "name": r["name"], "eliminated": bool(r["eliminated"])} for r in rows]

@router.post("/players")
async def create_player(request: Request, payload: dict):
    db: Database = request.app.state.db
    name = (payload.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name is required")
    pid = str(uuid.uuid4())
    await db.execute("INSERT INTO players (id, name, eliminated, created_at_ms) VALUES (?, ?, 0, ?)", (pid, name, now_ms()))
    await db.commit()
    return {"id": pid}

@router.patch("/players/{player_id}")
async def update_player(request: Request, player_id: str, payload: dict):
    db: Database = request.app.state.db
    fields = []
    params: list[Any] = []
    if "name" in payload and payload["name"] is not None:
        fields.append("name=?")
        params.append(str(payload["name"]).strip())
    if "eliminated" in payload and payload["eliminated"] is not None:
        fields.append("eliminated=?")
        params.append(1 if payload["eliminated"] else 0)
    if not fields:
        return {"ok": True}
    params.append(player_id)
    await db.execute(f"UPDATE players SET {', '.join(fields)} WHERE id=?", tuple(params))
    await db.commit()
    return {"ok": True}

@router.delete("/players/{player_id}")
async def delete_player(request: Request, player_id: str):
    db: Database = request.app.state.db
    await db.execute("DELETE FROM players WHERE id=?", (player_id,))
    await db.execute("UPDATE seat_assignments SET player_id=NULL WHERE player_id=?", (player_id,))
    await db.commit()
    return {"ok": True}

@router.get("/tables")
async def list_tables_api(request: Request):
    db: Database = request.app.state.db
    rows = await db.fetchall("SELECT id, name, seats, enabled FROM tables ORDER BY created_at_ms ASC")
    return [{"id": r["id"], "name": r["name"], "seats": r["seats"], "enabled": bool(r["enabled"])} for r in rows]

@router.post("/tables")
async def create_table(request: Request, payload: dict):
    db: Database = request.app.state.db
    name = (payload.get("name") or "").strip()
    seats = int(payload.get("seats") or 9)
    if not name:
        raise HTTPException(400, "name is required")
    if seats < 2 or seats > 12:
        raise HTTPException(400, "seats must be 2..12")
    tid = str(uuid.uuid4())
    await db.execute("INSERT INTO tables (id, name, seats, enabled, created_at_ms) VALUES (?, ?, ?, 1, ?)", (tid, name, seats, now_ms()))
    for seat_num in range(1, seats + 1):
        await db.execute("INSERT OR IGNORE INTO seat_assignments (table_id, seat_num, player_id) VALUES (?, ?, NULL)", (tid, seat_num))
    await db.commit()
    return {"id": tid}

@router.patch("/tables/{table_id}")
async def update_table(request: Request, table_id: str, payload: dict):
    db: Database = request.app.state.db
    fields = []
    params: list[Any] = []
    if "name" in payload and payload["name"] is not None:
        fields.append("name=?")
        params.append(str(payload["name"]).strip())
    if "seats" in payload and payload["seats"] is not None:
        s = int(payload["seats"])
        if s < 2 or s > 12:
            raise HTTPException(400, "seats must be 2..12")
        fields.append("seats=?")
        params.append(s)
    if "enabled" in payload and payload["enabled"] is not None:
        fields.append("enabled=?")
        params.append(1 if payload["enabled"] else 0)
    if not fields:
        return {"ok": True}
    params.append(table_id)
    await db.execute(f"UPDATE tables SET {', '.join(fields)} WHERE id=?", tuple(params))
    await db.commit()
    await normalize_seats(db)
    return {"ok": True}

@router.delete("/tables/{table_id}")
async def delete_table(request: Request, table_id: str):
    db: Database = request.app.state.db
    await db.execute("DELETE FROM tables WHERE id=?", (table_id,))
    await db.execute("DELETE FROM seat_assignments WHERE table_id=?", (table_id,))
    await db.commit()
    return {"ok": True}

@router.get("/seats")
async def list_seats(request: Request):
    db: Database = request.app.state.db
    rows = await db.fetchall(
        '''
        SELECT sa.table_id, sa.seat_num, sa.player_id, t.name AS table_name
        FROM seat_assignments sa
        JOIN tables t ON t.id = sa.table_id
        ORDER BY t.created_at_ms ASC, sa.seat_num ASC
        '''
    )
    return [{"table_id": r["table_id"], "table_name": r["table_name"], "seat_num": r["seat_num"], "player_id": r["player_id"]} for r in rows]

@router.post("/seating/randomize")
async def seating_randomize(request: Request):
    db: Database = request.app.state.db
    bus: EventBus = request.app.state.bus
    return await randomize_seating(db, bus)

@router.post("/seating/rebalance")
async def seating_rebalance(request: Request):
    db: Database = request.app.state.db
    bus: EventBus = request.app.state.bus
    return await rebalance(db, bus)

@router.post("/seating/deseat")
async def deseat(request: Request):
    db: Database = request.app.state.db
    bus: EventBus = request.app.state.bus
    return await deseat_seating(db, bus)

@router.post("/seating/move")
async def move_seat(request: Request, payload: dict[str, Any]):
    """
    payload:
      {
        "player_id": "uuid",
        "to_table_id": "uuid",
        "to_seat_num": 3,
        "mode": "swap" | "move"   # optional; default swap
      }
    """
    db: Database = request.app.state.db

    player_id = payload.get("player_id")
    to_table_id = payload.get("to_table_id")
    to_seat_num = int(payload.get("to_seat_num"))
    mode = payload.get("mode") or "swap"

    if not player_id or not to_table_id:
        raise HTTPException(400, "player_id and to_table_id required")

    # destination seat exists?
    dest_row = await db.fetchone(
        "SELECT player_id FROM seat_assignments WHERE table_id=? AND seat_num=?",
        (to_table_id, to_seat_num),
    )
    if dest_row is None:
        raise HTTPException(404, "Seat not found")
    dest_player_id = dest_row["player_id"]

    # find source seat
    src = await db.fetchone(
        "SELECT table_id, seat_num FROM seat_assignments WHERE player_id=?",
        (player_id,),
    )
    src_table_id = src["table_id"] if src else None
    src_seat_num = src["seat_num"] if src else None

    if src_table_id == to_table_id and src_seat_num == to_seat_num:
        return {"ok": True, "mode": "noop"}

    if mode == "move":
        await db.execute(
            "UPDATE seat_assignments SET player_id=NULL WHERE table_id=? AND seat_num=?",
            (to_table_id, to_seat_num),
        )
        await db.execute(
            "UPDATE seat_assignments SET player_id=? WHERE table_id=? AND seat_num=?",
            (player_id, to_table_id, to_seat_num),
        )
        if src_table_id is not None:
            await db.execute(
                "UPDATE seat_assignments SET player_id=NULL WHERE table_id=? AND seat_num=?",
                (src_table_id, src_seat_num),
            )
    else:
        # swap (default): swap with whoever is in dest (including empty)
        if src_table_id is not None:
            await db.execute(
                "UPDATE seat_assignments SET player_id=? WHERE table_id=? AND seat_num=?",
                (dest_player_id, src_table_id, src_seat_num),
            )
        await db.execute(
            "UPDATE seat_assignments SET player_id=? WHERE table_id=? AND seat_num=?",
            (player_id, to_table_id, to_seat_num),
        )

    await db.commit()
    return {
        "ok": True,
        "mode": mode,
        "from": {"table_id": src_table_id, "seat_num": src_seat_num},
        "to": {"table_id": to_table_id, "seat_num": to_seat_num},
        "swapped_player_id": dest_player_id,
    }


@router.post("/seating/unseat")
async def unseat_player(request: Request, payload: dict[str, Any]):
    """Remove a single player from their current seat."""
    db: Database = request.app.state.db

    player_id = payload.get("player_id")
    if not player_id:
        raise HTTPException(400, "player_id required")

    row = await db.fetchone(
        "SELECT table_id, seat_num FROM seat_assignments WHERE player_id=?",
        (player_id,),
    )
    if row is None:
        return {"ok": True, "mode": "noop", "from": {"table_id": None, "seat_num": None}}

    await db.execute(
        "UPDATE seat_assignments SET player_id=NULL WHERE table_id=? AND seat_num=?",
        (row["table_id"], row["seat_num"]),
    )
    await db.commit()
    return {"ok": True, "mode": "unseat", "from": {"table_id": row["table_id"], "seat_num": row["seat_num"]}}

@router.get("/announcements")
async def announcements(request: Request, limit: int = 50):
    db: Database = request.app.state.db
    return {"items": await list_announcements(db, limit=limit)}
