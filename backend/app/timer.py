import asyncio, time
from typing import Optional
from .events import EventBus, Event
from .db import get_settings, get_state, set_state, add_announcement

def now_ms() -> int:
    return int(time.time() * 1000)

class TimerService:
    """
    Server-truth timer model:
      - When running: we store finish_at_server_ms (absolute server time)
      - When paused: we store remaining_ms (and broadcast remaining_s)
      - Clients render:
          running  => finish_at_server_ms - (serverNowMs)
          paused   => remaining_s
    """

    def __init__(self, *, conn, bus: EventBus) -> None:
        self.conn = conn
        self.bus = bus

        self.current_level_index = 0

        # paused value (truth when not running)
        self.remaining_ms = 0

        # running value (truth when running)
        self.finish_at_server_ms: int = 0

        self.running = False
        self._task: Optional[asyncio.Task] = None

        # Persist / broadcast throttles
        self._persist_every_ms = 1000
        self._last_persist_ms = 0

        self._reset_milestones()

    async def load(self) -> None:
        state = await get_state(self.conn)

        self.current_level_index = int(state["current_level_index"])
        self.running = bool(state["running"])

        # Back-compat: state may have remaining_ms only. Prefer finish_at if present.
        self.remaining_ms = int(state.get("remaining_ms") or 0)
        self.finish_at_server_ms = int(state.get("finish_at_server_ms") or 0)

        now = now_ms()

        if self.running:
            # If finish_at not stored, derive from remaining_ms + updated_at_ms (best effort)
            if self.finish_at_server_ms <= 0:
                updated_at = int(state.get("updated_at_ms") or now)
                elapsed = max(0, now - updated_at)
                rem = max(0, self.remaining_ms - elapsed)
                self.finish_at_server_ms = now + rem

            # Keep remaining_ms in sync for milestone logic (derived)
            self.remaining_ms = max(0, self.finish_at_server_ms - now)
        else:
            # paused => remaining_ms is authoritative, finish_at not used
            self.finish_at_server_ms = 0

        self._reset_milestones()
        await self._emit_full_state()

    def _reset_milestones(self) -> None:
        self._half_fired = False
        self._thirty_fired = False
        self._five_fired = False
        self._start_fired = False

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self._loop())

    def _current_remaining_ms(self) -> int:
        if not self.running:
            return int(self.remaining_ms)
        return max(0, int(self.finish_at_server_ms) - now_ms())

    async def _emit_full_state(self) -> None:
        settings = await get_settings(self.conn)

        if self.running:
            payload_state = {
                "current_level_index": self.current_level_index,
                "running": True,
                "server_time_ms": now_ms(),
                "finish_at_server_ms": int(self.finish_at_server_ms),
            }
        else:
            payload_state = {
                "current_level_index": self.current_level_index,
                "running": False,
                "server_time_ms": now_ms(),
                "remaining_s": int(max(0, self.remaining_ms) // 1000),
            }

        await self.bus.publish(Event("state", {
            "state": payload_state,
            "settings": settings,
        }))

    async def _persist(self) -> None:
        # Persist both remaining_ms and finish_at_server_ms so we can recover accurately.
        # remaining_ms is the paused truth; while running it's just a snapshot.
        rem = self._current_remaining_ms()
        await set_state(
            self.conn,
            current_level_index=self.current_level_index,
            remaining_ms=int(rem),
            finish_at_server_ms=int(self.finish_at_server_ms) if self.running else 0,
            running=1 if self.running else 0,
            updated_at_ms=now_ms(),
        )

    async def _announce(self, type: str, payload: dict) -> None:
        ts = now_ms()
        await add_announcement(self.conn, created_at_ms=ts, type=type, payload=payload)
        await self.bus.publish(Event("announcement", {"type": type, "payload": payload, "created_at_ms": ts}))

    async def _fire_milestones(self, settings: dict) -> None:
        levels = settings.get("levels", [])
        if not levels or self.current_level_index >= len(levels):
            return
        level = levels[self.current_level_index]
        total_ms = int(level["minutes"]) * 60_000
        sounds = (settings.get("sounds") or {})

        # compute remaining from finish time (no drift)
        self.remaining_ms = self._current_remaining_ms()

        if not self._start_fired:
            self._start_fired = True
            await self.bus.publish(Event("sound", {"cue": "start", "file": sounds.get("start"), "play_id": now_ms()}))

        if not self._half_fired and self.remaining_ms <= total_ms // 2:
            self._half_fired = True
            await self.bus.publish(Event("sound", {"cue": "half", "file": sounds.get("half"), "play_id": now_ms()}))

        if not self._thirty_fired and self.remaining_ms <= 30_000:
            self._thirty_fired = True
            await self.bus.publish(Event("sound", {"cue": "thirty", "file": sounds.get("thirty"), "play_id": now_ms()}))

        if not self._five_fired and self.remaining_ms <= 5_000:
            self._five_fired = True
            await self.bus.publish(Event("sound", {"cue": "five", "file": sounds.get("five"), "play_id": now_ms()}))

    async def _advance_level(self, settings: dict) -> None:
        levels = settings.get("levels", [])
        if not levels:
            return
        sounds = (settings.get("sounds") or {})

        await self.bus.publish(Event("sound", {"cue": "end", "file": sounds.get("end"), "play_id": now_ms()}))
        await self._announce("level_end", {"level_index": self.current_level_index})

        if self.current_level_index < len(levels) - 1:
            self.current_level_index += 1
            nxt = levels[self.current_level_index]
            self.remaining_ms = int(nxt["minutes"]) * 60_000
            self._reset_milestones()
            await self._announce("level_start", {"level_index": self.current_level_index})

            if self.running:
                self.finish_at_server_ms = now_ms() + int(self.remaining_ms)
        else:
            self.remaining_ms = 0
            self.finish_at_server_ms = 0
            self.running = False
            await self._announce("schedule_complete", {})

        await self._emit_full_state()
        await self._persist()

    async def _loop(self) -> None:
        while True:
            await asyncio.sleep(0.25)
            settings = await get_settings(self.conn)
            now = now_ms()

            if self.running:
                # derive remaining from finish time
                self.remaining_ms = max(0, self.finish_at_server_ms - now)

                await self._fire_milestones(settings)

                if self.remaining_ms <= 0:
                    await self._advance_level(settings)

            if now - self._last_persist_ms >= self._persist_every_ms:
                self._last_persist_ms = now
                await self._persist()
                # NOTE: no more "tick" events; clients render from finish_at_server_ms

    async def pause(self) -> None:
        if not self.running:
            return
        # freeze remaining and clear finish time
        self.remaining_ms = self._current_remaining_ms()
        self.finish_at_server_ms = 0
        self.running = False
        await self._persist()
        await self._emit_full_state()

    async def resume(self) -> None:
        if self.running:
            return
        # compute a new finish time from remaining
        self.running = True
        self.finish_at_server_ms = now_ms() + int(self.remaining_ms)
        await self._persist()
        await self._emit_full_state()

    async def add_time(self, delta_ms: int) -> None:
        delta_ms = int(delta_ms)

        if self.running:
            # shift finish time directly (authoritative)
            self.finish_at_server_ms = max(now_ms(), int(self.finish_at_server_ms) + delta_ms)
        else:
            self.remaining_ms = max(0, int(self.remaining_ms) + delta_ms)

        await self._persist()
        await self._emit_full_state()

    async def reset_level(self) -> None:
        settings = await get_settings(self.conn)
        levels = settings.get("levels", [])
        if not levels or self.current_level_index >= len(levels):
            return

        self.remaining_ms = int(levels[self.current_level_index]["minutes"]) * 60_000
        self._reset_milestones()

        if self.running:
            self.finish_at_server_ms = now_ms() + int(self.remaining_ms)

        await self._persist()
        await self._emit_full_state()

    async def go_to_level(self, level_index: int) -> None:
        settings = await get_settings(self.conn)
        levels = settings.get("levels", [])
        if not levels:
            return

        level_index = max(0, min(int(level_index), len(levels) - 1))
        self.current_level_index = level_index
        self.remaining_ms = int(levels[level_index]["minutes"]) * 60_000
        self._reset_milestones()

        if self.running:
            self.finish_at_server_ms = now_ms() + int(self.remaining_ms)

        await self._persist()
        await self._emit_full_state()
