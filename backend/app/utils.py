import time
from typing import Any


def now_ms() -> int:
    return int(time.time() * 1000)


def format_state(raw: dict[str, Any]) -> dict[str, Any]:
    """
    Convert raw DB state (or in-memory timer fields) into the canonical
    client-facing shape.

    All code paths that send state to the client (REST, WS initial snapshot,
    timer broadcast) MUST use this function so every consumer sees the same
    field names, types, and semantics.

    Canonical shape:
        {
            "current_level_index": int,
            "running": bool,
            "server_time_ms": int,
            "remaining_ms": int,
            "finish_at_server_ms": int,   # >0 only when running
        }
    """
    now = now_ms()
    running = bool(raw.get("running"))
    remaining_ms = int(raw.get("remaining_ms") or 0)
    finish_at = int(raw.get("finish_at_server_ms") or 0)

    if running:
        # If finish_at not stored (legacy), derive from remaining + updated_at
        if finish_at <= 0:
            updated_at = int(raw.get("updated_at_ms") or now)
            elapsed = max(0, now - updated_at)
            remaining_ms = max(0, remaining_ms - elapsed)
            finish_at = now + remaining_ms
        else:
            remaining_ms = max(0, finish_at - now)
    else:
        finish_at = 0

    return {
        "current_level_index": int(raw.get("current_level_index") or 0),
        "running": running,
        "server_time_ms": now,
        "remaining_ms": remaining_ms,
        "finish_at_server_ms": finish_at,
    }