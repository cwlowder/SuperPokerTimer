import random, time
from typing import Any
import aiosqlite
from .db import add_announcement, get_settings
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

    settings = await get_settings(conn)
    min_ppt = get_min_players_per_table(settings)

    # Keep table order stable (DB returns created_at_ms ASC)
    tables_sorted = list(tables)
    # Use the minimum number of enabled tables needed to seat everyone.
    used_tables = select_tables_by_capacity(tables_sorted, len(players), min_players_per_table=min_ppt)

    target: dict[str, int] = {t["id"]: 0 for t in tables_sorted}
    target.update(compute_table_targets(used_tables, len(players)))

    # Randomize player order, then distribute across tables to match targets (balanced)
    random.shuffle(players)
    players_by_id = {p["id"]: p for p in players}

    table_to_player_ids: dict[str, list[str]] = {t["id"]: [] for t in tables_sorted}
    idx = 0
    for t in tables_sorted:
        tid = t["id"]
        want = target[tid]
        if want <= 0:
            continue
        for _ in range(want):
            if idx >= len(players):
                break
            table_to_player_ids[tid].append(players[idx]["id"])
            idx += 1

    # Seat assignment: fill seats in an "end fill" pattern (1, N, 2, N-1, ...)
    final_assignments = assign_seats_for_table_groups(
        tables_sorted,
        table_to_player_ids,
        prev_map,
        seat_order="end_fill",
        keep_same_seat=True,
    )

    changes = await apply_assignments_and_build_changes(
        conn,
        final_assignments,
        prev_map,
        players_by_id,
        include_all=True,  # randomize usually wants "full list"
    )

    ts = now_ms()
    payload = {"changes": changes}
    await add_announcement(conn, created_at_ms=ts, type="randomize", payload=payload)
    await bus.publish(Event("announcement", {"type": "randomize", "payload": payload, "created_at_ms": ts}))
    return payload

async def rebalance(conn: aiosqlite.Connection, bus: EventBus) -> dict[str, Any]:
    await normalize_seats(conn)

    removed = await clear_eliminated_assignments(conn)

    players = await list_active_players(conn)
    tables = [t for t in await list_tables(conn) if t["enabled"]]
    if not tables:
        return {"message": "No enabled tables.", "changes": []}

    n_players = len(players)
    if n_players == 0:
        await clear_all_assignments(conn)
        await conn.commit()
        payload = {"changes": []}
        ts = now_ms()
        await add_announcement(conn, created_at_ms=ts, type="rebalance", payload=payload)
        await bus.publish(Event("announcement", {"type": "rebalance", "payload": payload, "created_at_ms": ts}))
        return payload

    capacity = sum(t["seats"] for t in tables)
    if n_players > capacity:
        return {"message": f"Not enough seats for {n_players} players (capacity {capacity}).", "changes": []}

    prev = await get_assignments(conn)
    prev_map = {a["player_id"]: (a["table_id"], a["seat_num"]) for a in prev if a["player_id"]}

    # Keep table order stable (DB returns created_at_ms ASC)
    tables_sorted = list(tables)

    settings = await get_settings(conn)
    min_ppt = get_min_players_per_table(settings)

    players_by_id = {p["id"]: p for p in players}
    active_ids = [p["id"] for p in players]

    # Build current seating by table (active only)
    seated_by_table: dict[str, list[str]] = {t["id"]: [] for t in tables_sorted}
    seated_on_enabled: set[str] = set()
    for pid, (tid, _seat) in prev_map.items():
        if pid in players_by_id and tid in seated_by_table:
            seated_by_table[tid].append(pid)
            seated_on_enabled.add(pid)

    # Consolidate to the minimum number of tables needed, preferring tables that already have players.
    used_table_ids = select_tables_for_rebalance(
        tables_sorted,
        n_players,
        seated_by_table,
        min_players_per_table=min_ppt,
    )

    # Targets: only used tables get non-zero targets.
    target: dict[str, int] = {t["id"]: 0 for t in tables_sorted}
    used_tables = [t for t in tables_sorted if t["id"] in used_table_ids]
    target.update(compute_table_targets(used_tables, n_players))

    # Choose who stays vs moves (minimal moves): keep up to target at each table
    stay: dict[str, list[str]] = {t["id"]: [] for t in tables_sorted}
    movers: list[str] = []

    for t in tables_sorted:
        tid = t["id"]
        want = target[tid]
        current = seated_by_table.get(tid, [])

        # stable: lowest seat numbers stay
        current_sorted = sorted(current, key=lambda pid: prev_map.get(pid, (tid, 10**9))[1])

        stay[tid] = current_sorted[:want]
        movers.extend(current_sorted[want:])

    # Anyone not seated at an enabled table becomes a mover too.
    # This includes players that were seated at a now-disabled table.
    currently_seated = seated_on_enabled
    for pid in active_ids:
        if pid not in currently_seated:
            movers.append(pid)

    # Build final table groups: stay first, then fill remaining with movers
    table_to_player_ids: dict[str, list[str]] = {t["id"]: [] for t in tables_sorted}
    mover_idx = 0
    for t in tables_sorted:
        tid = t["id"]
        want = target[tid]

        group: list[str] = []
        group.extend(stay[tid])  # these keep seat numbers later

        remaining = want - len(group)
        for _ in range(max(0, remaining)):
            if mover_idx >= len(movers):
                break
            group.append(movers[mover_idx])
            mover_idx += 1

        table_to_player_ids[tid] = group

    # Seat assignment: stay players keep same seat (same table); movers take open seats
    final_assignments = assign_seats_for_table_groups(
        tables_sorted,
        table_to_player_ids,
        prev_map,
        seat_order="end_fill",
        keep_same_seat=True,
    )

    changes = await apply_assignments_and_build_changes(
        conn,
        final_assignments,
        prev_map,
        players_by_id,
        include_all=False,  # rebalance usually wants only changes
    )

    ts = now_ms()
    payload = {"changes": changes}
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
        payload = {"changes": []}
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

def compute_table_targets(tables_sorted: list[dict[str, Any]], n_players: int) -> dict[str, int]:
    """Balanced target counts per table.

    Deterministic: first `rem` tables (by input order) get +1.
    """
    n_players = int(n_players)
    if n_players <= 0 or not tables_sorted:
        return {}

    m = len(tables_sorted)
    base = n_players // m
    rem = n_players % m
    target: dict[str, int] = {}
    for i, t in enumerate(tables_sorted):
        target[t["id"]] = base + (1 if i < rem else 0)
    return target


def get_min_players_per_table(settings: dict[str, Any]) -> int:
    seating = settings.get("seating") if isinstance(settings, dict) else None
    if not isinstance(seating, dict):
        return 4
    v = seating.get("min_players_per_table", 4)
    try:
        v = int(v)
    except Exception:
        v = 4
    return max(1, v)


def select_tables_for_rebalance(
    tables_sorted: list[dict[str, Any]],
    n_players: int,
    seated_by_table: dict[str, list[str]],
    *,
    min_players_per_table: int,
) -> set[str]:
    """Pick tables to keep for rebalance.

    Goal: reduce the number of tables when average players/table would fall below the configured minimum,
    while minimizing forced moves by preferring tables that already have seated players.
    """
    n_players = int(n_players)
    if n_players <= 0:
        return set()

    index_by_id = {t["id"]: i for i, t in enumerate(tables_sorted)}
    min_ppt = max(1, int(min_players_per_table))
    kmax = max(1, n_players // min_ppt) if n_players >= min_ppt else 1

    nonempty = [t for t in tables_sorted if len(seated_by_table.get(t["id"], [])) > 0]

    # If no one is seated yet, just pick tables the same way randomize would.
    if not nonempty:
        used = select_tables_by_capacity(tables_sorted, n_players, min_players_per_table=min_ppt)
        return {t["id"] for t in used}

    # Only reduce table count when needed to meet the min-per-table target.
    if len(nonempty) <= kmax:
        used = list(nonempty)
        cap = sum(int(t["seats"]) for t in used)
        if cap >= n_players:
            return {t["id"] for t in used}

        # Need more capacity: add additional tables (in stable order) until everyone fits.
        used_ids = {t["id"] for t in used}
        for t in tables_sorted:
            if t["id"] in used_ids:
                continue
            used.append(t)
            used_ids.add(t["id"])
            cap += int(t["seats"])
            if cap >= n_players:
                break
        return used_ids

    counts = {tid: len(seated_by_table.get(tid, [])) for tid in index_by_id}
    ranked = sorted(
        tables_sorted,
        key=lambda t: (
            -counts.get(t["id"], 0),
            index_by_id[t["id"]],
        ),
    )

    used: list[dict[str, Any]] = []
    cap = 0
    for t in ranked:
        if len(used) < kmax or cap < n_players:
            used.append(t)
            cap += int(t["seats"])
        if len(used) >= kmax and cap >= n_players:
            break
    return {t["id"] for t in used}


def select_tables_by_capacity(
    tables_sorted: list[dict[str, Any]],
    n_players: int,
    *,
    min_players_per_table: int,
) -> list[dict[str, Any]]:
    """Pick tables for randomize.

    Prefer using as many tables as possible while keeping at least `min_players_per_table` players
    per used table, unless capacity forces using more.
    Selection is deterministic: it uses the first N enabled tables (in the existing UI order).
    """
    n_players = int(n_players)
    if n_players <= 0:
        return []

    min_ppt = max(1, int(min_players_per_table))
    kmax = max(1, n_players // min_ppt) if n_players >= min_ppt else 1
    k = max(1, min(len(tables_sorted), kmax))

    used = list(tables_sorted[:k])
    cap = sum(int(t["seats"]) for t in used)
    while cap < n_players and k < len(tables_sorted):
        k += 1
        used = list(tables_sorted[:k])
        cap = sum(int(t["seats"]) for t in used)

    return used


def assign_seats_for_table_groups(
    tables_sorted: list[dict[str, Any]],
    table_to_player_ids: dict[str, list[str]],
    prev_map: dict[str, tuple[str, int]],
    *,
    seat_order: str = "end_fill",
    keep_same_seat: bool = True,
) -> dict[str, tuple[str, int]]:
    """
    Turn (table -> ordered list of player_ids) into exact seat assignments.
    Guarantee: if a player's previous assignment is (same table) and seat exists, keep that seat.
    Remaining players take remaining seats (end_fill by default; can use sequential or random).
    """
    final_assignments: dict[str, tuple[str, int]] = {}

    for t in tables_sorted:
        tid = t["id"]
        pids = table_to_player_ids.get(tid, [])
        if not pids:
            continue

        available_seats = list(range(1, t["seats"] + 1))
        available_set = set(available_seats)

        # 1) Keepers: same table => same seat (optional)
        keepers: list[tuple[str, int]] = []
        others: list[str] = []
        for pid in pids:
            old = prev_map.get(pid)
            if keep_same_seat and old and old[0] == tid and old[1] in available_set:
                keepers.append((pid, old[1]))
            else:
                others.append(pid)

        # Lock keeper seats
        used = set()
        for pid, seat_num in keepers:
            # If two keepers collide (shouldn't happen), first wins; others fall through
            if seat_num in used:
                others.append(pid)
                continue
            final_assignments[pid] = (tid, seat_num)
            used.add(seat_num)

        remaining_seats = [s for s in available_seats if s not in used]
        remaining_seats = order_open_seats(t["seats"], remaining_seats, seat_order=seat_order)

        # Fill remaining
        for pid, seat_num in zip(others, remaining_seats):
            final_assignments[pid] = (tid, seat_num)

    return final_assignments


def order_open_seats(
    total_seats: int,
    open_seats: list[int],
    *,
    seat_order: str,
) -> list[int]:
    """Return a deterministic ordering of `open_seats`.

    seat_order:
      - "end_fill": 1, N, 2, N-1, ...
      - "sequential": 1..N
      - "random": shuffled
    """
    if not open_seats:
        return []

    seat_order = (seat_order or "end_fill").lower()

    if seat_order == "random":
        out = list(open_seats)
        random.shuffle(out)
        return out

    if seat_order == "sequential":
        return sorted(open_seats)

    # default: end_fill
    return end_fill_seat_order(total_seats, open_seats)


def end_fill_seat_order(total_seats: int, open_seats: list[int]) -> list[int]:
    """Seat fill order: 1, N, 2, N-1, 3, N-2, ...

    For an 8-seat table: 1,8,2,7,3,6,4,5.
    """
    n = int(total_seats)
    if n <= 0:
        return sorted(open_seats)

    wanted: list[int] = []
    lo, hi = 1, n
    while lo <= hi:
        wanted.append(lo)
        if hi != lo:
            wanted.append(hi)
        lo += 1
        hi -= 1

    open_set = set(int(s) for s in open_seats)
    return [s for s in wanted if s in open_set]


async def apply_assignments_and_build_changes(
    conn: aiosqlite.Connection,
    final_assignments: dict[str, tuple[str, int]],
    prev_map: dict[str, tuple[str, int]],
    players_by_id: dict[str, dict[str, Any]],
    *,
    include_all: bool,
) -> list[dict[str, Any]]:
    # Apply: clear and reassign
    await clear_all_assignments(conn)
    for pid, (tid, seat_num) in final_assignments.items():
        await conn.execute(
            "UPDATE seat_assignments SET player_id=? WHERE table_id=? AND seat_num=?",
            (pid, tid, seat_num),
        )
    await conn.commit()

    # Build changes
    changes: list[dict[str, Any]] = []
    for pid, (tid, seat_num) in final_assignments.items():
        old = prev_map.get(pid)
        if include_all or old != (tid, seat_num):
            changes.append({
                "player_id": pid,
                "name": players_by_id[pid]["name"],
                "from_table": old[0] if old else None,
                "from_seat": old[1] if old else None,
                "to_table": tid,
                "to_seat": seat_num,
            })
    return changes
