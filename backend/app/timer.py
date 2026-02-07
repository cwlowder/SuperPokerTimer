import asyncio, time
from typing import Optional
from .events import EventBus, Event
from .db import get_settings, get_state, set_state, add_announcement

def now_ms() -> int:
    return int(time.time() * 1000)

class TimerService:
    def __init__(self, *, conn, bus: EventBus) -> None:
        self.conn = conn
        self.bus = bus
        self.current_level_index = 0
        self.remaining_ms = 0
        self.running = False
        self._last_tick_ms = 0
        self._task: Optional[asyncio.Task] = None
        self._persist_every_ms = 100
        self._last_persist_ms = 0
        self._half_fired = False
        self._thirty_fired = False
        self._start_fired = False

    async def load(self) -> None:
        state = await get_state(self.conn)
        self.current_level_index = state["current_level_index"]
        self.remaining_ms = state["remaining_ms"]
        self.running = bool(state["running"])
        self._last_tick_ms = now_ms()
        self._reset_milestones()
        await self._emit_full_state()

    def _reset_milestones(self) -> None:
        self._half_fired = False
        self._thirty_fired = False
        self._start_fired = False

    async def start(self) -> None:
        if self._task and not self._task.done():
            return
        self._task = asyncio.create_task(self._loop())

    async def _emit_full_state(self) -> None:
        settings = await get_settings(self.conn)
        await self.bus.publish(Event("state", {
            "state": {
                "current_level_index": self.current_level_index,
                "remaining_ms": int(self.remaining_ms),
                "running": bool(self.running),
            },
            "settings": settings,
        }))

    async def _persist(self) -> None:
        await set_state(
            self.conn,
            current_level_index=self.current_level_index,
            remaining_ms=int(self.remaining_ms),
            running=1 if self.running else 0,
            updated_at_ms=now_ms(),
        )

    async def _announce(self, type: str, payload: dict) -> None:
        ts = now_ms()
        await add_announcement(self.conn, created_at_ms=ts, type=type, payload=payload)
        await self.bus.publish(Event("announcement", {"type": type, "payload": payload, "created_at_ms": ts}))

    async def _maybe_fire_milestones(self, settings: dict) -> None:
        levels = settings.get("levels", [])
        if not levels or self.current_level_index >= len(levels):
            return
        level = levels[self.current_level_index]
        total_ms = int(level["minutes"]) * 60_000
        sounds = (settings.get("sounds") or {})

        if not self._start_fired:
            self._start_fired = True
            await self.bus.publish(Event("sound", {"cue": "start", "file": sounds.get("start")}))

        if not self._half_fired and self.remaining_ms <= total_ms // 2:
            self._half_fired = True
            await self.bus.publish(Event("sound", {"cue": "half", "file": sounds.get("half")}))

        if not self._thirty_fired and self.remaining_ms <= 30_000:
            self._thirty_fired = True
            await self.bus.publish(Event("sound", {"cue": "thirty", "file": sounds.get("thirty")}))

    async def _advance_level(self, settings: dict) -> None:
        levels = settings.get("levels", [])
        if not levels:
            return
        sounds = (settings.get("sounds") or {})
        await self.bus.publish(Event("sound", {"cue": "end", "file": sounds.get("end")}))
        await self._announce("level_end", {"level_index": self.current_level_index})

        if self.current_level_index < len(levels) - 1:
            self.current_level_index += 1
            nxt = levels[self.current_level_index]
            self.remaining_ms = int(nxt["minutes"]) * 60_000
            self._reset_milestones()
            await self._announce("level_start", {"level_index": self.current_level_index})
        else:
            self.remaining_ms = 0
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
                dt = now - self._last_tick_ms
                if dt > 0:
                    self.remaining_ms = max(0, self.remaining_ms - dt)
                    self._last_tick_ms = now

                await self._maybe_fire_milestones(settings)

                if self.remaining_ms <= 0:
                    await self._advance_level(settings)

            if now - self._last_persist_ms >= self._persist_every_ms:
                self._last_persist_ms = now
                await self._persist()
                await self.bus.publish(Event("tick", {
                    "current_level_index": self.current_level_index,
                    "remaining_ms": int(self.remaining_ms),
                    "running": bool(self.running),
                }))

    async def pause(self) -> None:
        self.running = False
        self._last_tick_ms = now_ms()
        await self._persist()
        await self._emit_full_state()

    async def resume(self) -> None:
        self.running = True
        self._last_tick_ms = now_ms()
        await self._persist()
        await self._emit_full_state()

    async def add_time(self, delta_ms: int) -> None:
        self.remaining_ms = max(0, int(self.remaining_ms) + int(delta_ms))
        await self._persist()
        await self._emit_full_state()

    async def reset_level(self) -> None:
        settings = await get_settings(self.conn)
        levels = settings.get("levels", [])
        if not levels or self.current_level_index >= len(levels):
            return
        self.remaining_ms = int(levels[self.current_level_index]["minutes"]) * 60_000
        self._reset_milestones()
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
        await self._persist()
        await self._emit_full_state()
