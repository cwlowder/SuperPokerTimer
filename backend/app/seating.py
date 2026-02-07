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
        if old != slot:
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
    players = await list_active_players(conn)
    tables = [t for t in await list_tables(conn) if t["enabled"]]
    if not tables:
        return {"message": "No enabled tables.", "changes": []}

    capacity = sum(t["seats"] for t in tables)
    if len(players) > capacity:
        return {"message": f"Not enough seats for {len(players)} players (capacity {capacity}).", "changes": []}

    k = len(tables)
    base = len(players) // k
    extra = len(players) % k
    desired = {t["id"]: base + (1 if i < extra else 0) for i, t in enumerate(tables)}

    assignments = await get_assignments(conn)
    name_by_id = {p["id"]: p["name"] for p in players}
    enabled_ids = set(desired.keys())

    cur_by_table: dict[str, list[tuple[int, str]]] = {t["id"]: [] for t in tables}
    unassigned: list[str] = []

    for a in assignments:
        pid = a["player_id"]
        if not pid or pid not in name_by_id:
            continue
        if a["table_id"] not in enabled_ids:
            unassigned.append(pid)
            continue
        cur_by_table[a["table_id"]].append((a["seat_num"], pid))

    move_list: list[tuple[str|None, int|None, str]] = []
    for tid, seated in cur_by_table.items():
        if len(seated) > desired[tid]:
            seated_sorted = sorted(seated, key=lambda x: x[0], reverse=True)
            to_move_n = len(seated_sorted) - desired[tid]
            for seat_num, pid in seated_sorted[:to_move_n]:
                move_list.append((tid, seat_num, pid))
    for pid in unassigned:
        move_list.append((None, None, pid))

    async def open_seats_for(tid: str) -> list[int]:
        cur = await conn.execute("SELECT seat_num FROM seat_assignments WHERE table_id=? AND player_id IS NULL ORDER BY seat_num ASC", (tid,))
        rows = await cur.fetchall()
        return [int(r["seat_num"]) for r in rows]

    changes = []

    for from_tid, from_seat, pid in move_list:
        deficit = [tid for tid in desired.keys() if len(cur_by_table[tid]) < desired[tid]]
        if not deficit:
            break
        to_tid = deficit[0]
        open_seats = await open_seats_for(to_tid)
        if not open_seats:
            continue
        to_seat = open_seats[0]

        if from_tid and from_seat:
            await conn.execute("UPDATE seat_assignments SET player_id=NULL WHERE table_id=? AND seat_num=? AND player_id=?", (from_tid, from_seat, pid))
            cur_by_table[from_tid] = [(s, p) for (s, p) in cur_by_table[from_tid] if p != pid]

        await conn.execute("UPDATE seat_assignments SET player_id=? WHERE table_id=? AND seat_num=?", (pid, to_tid, to_seat))
        cur_by_table[to_tid].append((to_seat, pid))

        changes.append({
            "player_id": pid,
            "name": name_by_id.get(pid, pid),
            "from_table": from_tid,
            "from_seat": from_seat,
            "to_table": to_tid,
            "to_seat": to_seat,
        })

    await conn.commit()

    ts = now_ms()
    payload = {"message": "Rebalanced tables.", "changes": changes}
    await add_announcement(conn, created_at_ms=ts, type="rebalance", payload=payload)
    await bus.publish(Event("announcement", {"type": "rebalance", "payload": payload, "created_at_ms": ts}))
    return payload
