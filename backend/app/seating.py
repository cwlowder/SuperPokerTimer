import random, time
from typing import Any
import aiosqlite
from .db import add_announcement
from .events import EventBus, Event

def now_ms() -> int:
    return int(time.time() * 1000)

async def list_active_players(conn: aiosqlite.Connection) -> list[dict[str, Any]]:
    cur = await conn.execute("SELECT id, name FROM players WHERE eliminated=0 ORDER BY created_at_ms ASC")
    rows = await cur.fetchall()
    return [{"id": r["id"], "name": r["name"]} for r in rows]

async def list_tables(conn: aiosqlite.Connection) -> list[dict[str, Any]]:
    cur = await conn.execute("SELECT id, name, seats, enabled FROM tables ORDER BY created_at_ms ASC")
    rows = await cur.fetchall()
    return [{"id": r["id"], "name": r["name"], "seats": r["seats"], "enabled": bool(r["enabled"])} for r in rows]

async def get_assignments(conn: aiosqlite.Connection) -> list[dict[str, Any]]:
    cur = await conn.execute(
        '''
        SELECT sa.table_id, sa.seat_num, sa.player_id, t.name AS table_name
        FROM seat_assignments sa
        JOIN tables t ON t.id = sa.table_id
        ORDER BY t.created_at_ms ASC, sa.seat_num ASC
        '''
    )
    rows = await cur.fetchall()
    return [{"table_id": r["table_id"], "table_name": r["table_name"], "seat_num": r["seat_num"], "player_id": r["player_id"]} for r in rows]

async def clear_eliminated_assignments(conn: aiosqlite.Connection) -> int:
    # Assumes player table is "players" with column "eliminated" (0/1)
    # and assignments table is "seat_assignments" with "player_id".
    cur = await conn.execute("""
        UPDATE seat_assignments
        SET player_id = NULL
        WHERE player_id IN (
            SELECT id FROM players WHERE eliminated = 1
        )
    """)
    await conn.commit()
    return cur.rowcount or 0

async def _ensure_seats_for_table(conn: aiosqlite.Connection, table_id: str, seats: int) -> None:
    cur = await conn.execute("SELECT COUNT(*) AS c FROM seat_assignments WHERE table_id=?", (table_id,))
    row = await cur.fetchone()
    existing = int(row["c"])
    if existing < seats:
        for n in range(existing + 1, seats + 1):
            await conn.execute(
                "INSERT OR IGNORE INTO seat_assignments (table_id, seat_num, player_id) VALUES (?, ?, NULL)",
                (table_id, n)
            )
    if existing > seats:
        await conn.execute("DELETE FROM seat_assignments WHERE table_id=? AND seat_num>?", (table_id, seats))
    await conn.commit()

async def normalize_seats(conn: aiosqlite.Connection) -> None:
    cur = await conn.execute("SELECT id, seats FROM tables")
    rows = await cur.fetchall()
    for r in rows:
        await _ensure_seats_for_table(conn, r["id"], int(r["seats"]))

async def clear_all_assignments(conn: aiosqlite.Connection) -> None:
    await conn.execute("UPDATE seat_assignments SET player_id=NULL")
    await conn.commit()

async def randomize_seating(conn: aiosqlite.Connection, bus: EventBus) -> dict[str, Any]:
    await normalize_seats(conn)
    players = await list_active_players(conn)
    tables = [t for t in await list_tables(conn) if t["enabled"]]
    if not tables:
        return {"message": "No enabled tables.", "changes": []}

    capacity = sum(t["seats"] for t in tables)
    if len(players) > capacity:
        return {"message": f"Not enough seats for {len(players)} players (capacity {capacity}).", "changes": []}

    prev = await get_assignments(conn)
    prev_map = {a["player_id"]: (a["table_id"], a["seat_num"]) for a in prev if a["player_id"]}

    await clear_all_assignments(conn)
    random.shuffle(players)

    slots = []
    for t in tables:
        for seat_num in range(1, t["seats"] + 1):
            slots.append((t["id"], seat_num))

    for p, slot in zip(players, slots):
        await conn.execute(
            "UPDATE seat_assignments SET player_id=? WHERE table_id=? AND seat_num=?",
            (p["id"], slot[0], slot[1])
        )
    await conn.commit()

    changes = []
    for p, slot in zip(players, slots):
        old = prev_map.get(p["id"])
        # if old != slot:
        changes.append({
            "player_id": p["id"],
            "name": p["name"],
            "from_table": old[0] if old else None,
            "from_seat": old[1] if old else None,
            "to_table": slot[0],
            "to_seat": slot[1],
        })

    ts = now_ms()
    payload = {"message": "Randomized seating.", "changes": changes}
    await add_announcement(conn, created_at_ms=ts, type="rebalance", payload=payload)
    await bus.publish(Event("announcement", {"type": "rebalance", "payload": payload, "created_at_ms": ts}))
    return payload

async def rebalance(conn: aiosqlite.Connection, bus: EventBus) -> dict[str, Any]:
    await normalize_seats(conn)

    # 1) Remove eliminated players from seats
    removed = await clear_eliminated_assignments(conn)

    players = await list_active_players(conn)  # must exclude eliminated
    tables = [t for t in await list_tables(conn) if t["enabled"]]
    if not tables:
        return {"message": "No enabled tables.", "changes": []}

    n_players = len(players)
    if n_players == 0:
        # Also clear any remaining assignments (just in case)
        await clear_all_assignments(conn)
        await conn.commit()
        payload = {"message": "No active players.", "changes": []}
        ts = now_ms()
        await add_announcement(conn, created_at_ms=ts, type="rebalance", payload=payload)
        await bus.publish(Event("announcement", {"type": "rebalance", "payload": payload, "created_at_ms": ts}))
        return payload

    capacity = sum(t["seats"] for t in tables)
    if n_players > capacity:
        return {"message": f"Not enough seats for {n_players} players (capacity {capacity}).", "changes": []}

    # Current assignments (after kicking eliminated)
    prev = await get_assignments(conn)  # should include rows with player_id possibly NULL
    prev_map = {a["player_id"]: (a["table_id"], a["seat_num"]) for a in prev if a["player_id"]}

    # Index players for stable ordering
    players_by_id = {p["id"]: p for p in players}
    active_ids = [p["id"] for p in players]

    # Build current seating by table for active players
    seated_by_table: dict[str, list[str]] = {t["id"]: [] for t in tables}
    for pid, (tid, _seat) in prev_map.items():
        if pid in players_by_id and tid in seated_by_table:
            seated_by_table[tid].append(pid)

    # 2) Compute target counts per table (as even as possible)
    m = len(tables)
    base = n_players // m
    rem = n_players % m

    # Deterministic: first rem tables get +1
    tables_sorted = sorted(tables, key=lambda t: t["id"])
    target: dict[str, int] = {}
    for i, t in enumerate(tables_sorted):
        target[t["id"]] = base + (1 if i < rem else 0)

    # 3) Decide who stays vs who moves (keep up to target at same table)
    stay: dict[str, list[str]] = {t["id"]: [] for t in tables_sorted}
    movers: list[str] = []

    # Keep people already seated at that table first (stable order)
    for t in tables_sorted:
        tid = t["id"]
        want = target[tid]
        current = seated_by_table.get(tid, [])

        current_sorted = sorted(
            current,
            key=lambda pid: prev_map.get(pid, (tid, 10**9))[1]  # seat order
        )

        stay[tid] = current_sorted[:want]
        movers.extend(current_sorted[want:])

    # Add any unseated active players to movers
    currently_seated = set(prev_map.keys())
    for pid in active_ids:
        if pid not in currently_seated:
            movers.append(pid)

    # 4) Build exact slot list for each table (first N seats)
    # Prefer low seat numbers, deterministic
    table_slots: dict[str, list[tuple[str,int]]] = {}
    for t in tables_sorted:
        tid = t["id"]
        want = target[tid]
        slots = [(tid, seat_num) for seat_num in range(1, t["seats"] + 1)]
        table_slots[tid] = slots[:want]

    # 5) Produce final assignments: fill each table's slots with stay then movers
    final_assignments: dict[str, tuple[str,int]] = {}  # pid -> (table_id, seat_num)

    # Put stay players into first slots
    for t in tables_sorted:
        tid = t["id"]
        slots = table_slots[tid]
        keep_ids = stay[tid]
        for pid, slot in zip(keep_ids, slots):
            final_assignments[pid] = slot

    # Fill remaining slots with movers
    mover_idx = 0
    for t in tables_sorted:
        tid = t["id"]
        slots = table_slots[tid]
        used = len(stay[tid])
        for slot in slots[used:]:
            if mover_idx >= len(movers):
                break
            pid = movers[mover_idx]
            mover_idx += 1
            final_assignments[pid] = slot

    # 6) Apply: clear and reassign (simple + safe)
    await clear_all_assignments(conn)
    for pid, (tid, seat_num) in final_assignments.items():
        await conn.execute(
            "UPDATE seat_assignments SET player_id=? WHERE table_id=? AND seat_num=?",
            (pid, tid, seat_num),
        )
    await conn.commit()

    # 7) Build changes (only include moved/changed assignments OR include all — your call)
    changes = []
    for pid, (tid, seat_num) in final_assignments.items():
        old = prev_map.get(pid)
        if old != (tid, seat_num):
            changes.append({
                "player_id": pid,
                "name": players_by_id[pid]["name"],
                "from_table": old[0] if old else None,
                "from_seat": old[1] if old else None,
                "to_table": tid,
                "to_seat": seat_num,
            })

    ts = now_ms()
    msg = f"Rebalanced tables. Removed {removed} eliminated player(s)." if removed else "Rebalanced tables."
    payload = {"message": msg, "changes": changes}

    await add_announcement(conn, created_at_ms=ts, type="rebalance", payload=payload)
    await bus.publish(Event("announcement", {"type": "rebalance", "payload": payload, "created_at_ms": ts}))
    return payload

async def deseat_seating(conn: aiosqlite.Connection, bus: EventBus) -> dict[str, Any]:
    # Capture previous assignments (for announcements)
    prev = await get_assignments(conn)
    prev_map = {
        a["player_id"]: (a["table_id"], a["seat_num"])
        for a in prev
        if a["player_id"]
    }

    if not prev_map:
        payload = {"message": "No seated players.", "changes": []}
        ts = now_ms()
        await add_announcement(conn, created_at_ms=ts, type="deseat", payload=payload)
        await bus.publish(Event("announcement", {
            "type": "deseat",
            "payload": payload,
            "created_at_ms": ts,
        }))
        return payload

    # Clear all seat assignments
    await clear_all_assignments(conn)
    await conn.commit()

    # Build changes list (everyone goes to nowhere)
    changes = []
    for player_id, (table_id, seat_num) in prev_map.items():
        changes.append({
            "player_id": player_id,
            "from_table": table_id,
            "from_seat": seat_num,
            "to_table": None,
            "to_seat": None,
        })

    ts = now_ms()
    payload = {
        "message": "All players removed from seats.",
        "changes": changes,
    }

    await add_announcement(
        conn,
        created_at_ms=ts,
        type="deseat",
        payload=payload,
    )

    await bus.publish(Event(
        "announcement",
        {
            "type": "deseat",
            "payload": payload,
            "created_at_ms": ts,
        }
    ))

    return payload
