import asyncio, logging, math, time
from typing import Any, Optional
from .events import EventBus, Event
from .db import get_settings, get_state, set_state, add_announcement

log = logging.getLogger(__name__)

# Fallback used when a level's "minutes" is missing or unparseable. Settings are
# user-supplied JSON, and a malformed level must never be able to stall the timer.
DEFAULT_LEVEL_MINUTES = 1.0

_TICK_S = 0.25
_MAX_ERROR_BACKOFF_S = 30.0

def now_ms() -> int:
    return int(time.time() * 1000)

def level_duration_ms(level: Any) -> int:
    """Duration of a level in ms. Tolerates malformed settings; never raises."""
    minutes = None
    if isinstance(level, dict):
        try:
            minutes = float(level.get("minutes"))
        except (TypeError, ValueError):
            minutes = None
    if minutes is None or not math.isfinite(minutes) or minutes < 0:
        log.warning("level has invalid minutes=%r; falling back to %s", level, DEFAULT_LEVEL_MINUTES)
        minutes = DEFAULT_LEVEL_MINUTES
    return int(minutes * 60_000)

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

        # Loop health, surfaced by /api/health
        self.last_error: Optional[str] = None
        self.last_error_at_ms: int = 0
        self.error_count = 0

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
        log.info("timer loaded: level=%d running=%s remaining=%.1fs",
                 self.current_level_index, self.running, self._current_remaining_ms() / 1000)
        await self._emit_full_state()

    def _reset_milestones(self) -> None:
        self._half_fired = False
        self._thirty_fired = False
        self._five_fired = False

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

        log.info(
            "state broadcast: level=%d running=%s remaining=%.1fs",
            self.current_level_index, self.running, self._current_remaining_ms() / 1000,
        )
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
        log.info("announcement: %s %s", type, payload)
        await add_announcement(self.conn, created_at_ms=ts, type=type, payload=payload)
        await self.bus.publish(Event("announcement", {"type": type, "payload": payload, "created_at_ms": ts}))

    async def _play_sound(self, cue: str, sounds: dict) -> None:
        file = (sounds or {}).get(cue)
        if not file:
            # Not an error, but a silent cue is a common "why did I hear nothing?"
            log.info("sound cue=%s skipped: no file configured", cue)
        else:
            log.info("sound cue=%s file=%s level=%d", cue, file, self.current_level_index)
        await self.bus.publish(Event("sound", {"cue": cue, "file": file, "play_id": now_ms()}))

    async def _fire_milestones(self, settings: dict) -> None:
        levels = settings.get("levels", [])
        if not levels or self.current_level_index >= len(levels):
            return
        level = levels[self.current_level_index]
        total_ms = level_duration_ms(level)
        sounds = (settings.get("sounds") or {})

        # compute remaining from finish time (no drift)
        self.remaining_ms = self._current_remaining_ms()

        if not self._half_fired and self.remaining_ms <= total_ms // 2:
            self._half_fired = True
            await self._play_sound("half", sounds)

        if not self._thirty_fired and self.remaining_ms <= 30_000:
            self._thirty_fired = True
            await self._play_sound("thirty", sounds)

        if not self._five_fired and self.remaining_ms <= 5_000:
            self._five_fired = True
            await self._play_sound("five", sounds)

    async def _advance_level(self, settings: dict) -> None:
        levels = settings.get("levels", [])
        if not levels:
            return
        sounds = (settings.get("sounds") or {})

        await self._announce("level_change", {"old_idx": self.current_level_index, "new_idx": self.current_level_index + 1})

        if self.current_level_index < len(levels) - 1:
            await self._play_sound("transition", sounds)
            self.current_level_index += 1
            nxt = levels[self.current_level_index]
            self.remaining_ms = level_duration_ms(nxt)
            self._reset_milestones()
            log.info(
                "level advanced: %d -> %d (%s, %.1f min)",
                self.current_level_index - 1, self.current_level_index,
                nxt.get("type") if isinstance(nxt, dict) else "?",
                self.remaining_ms / 60_000,
            )

            if self.running:
                self.finish_at_server_ms = now_ms() + int(self.remaining_ms)
        else:
            log.info("schedule complete at level %d", self.current_level_index)
            await self._play_sound("end", sounds)
            self.remaining_ms = 0
            self.finish_at_server_ms = 0
            self.running = False
            await self._announce("schedule_complete", {})

        await self._emit_full_state()
        await self._persist()

    async def _tick(self) -> None:
        now = now_ms()

        if self.running:
            settings = await get_settings(self.conn)
            # derive remaining from finish time
            self.remaining_ms = max(0, self.finish_at_server_ms - now)

            if self.remaining_ms <= 0:
                await self._advance_level(settings)
            else:
                # Only fire milestones if we would not advance level
                await self._fire_milestones(settings)

        if now - self._last_persist_ms >= self._persist_every_ms:
            self._last_persist_ms = now
            await self._persist()
            # NOTE: no more "tick" events; clients render from finish_at_server_ms

    async def _loop(self) -> None:
        """
        Drives the whole tournament, so it must outlive any single failure.

        An unguarded exception here used to kill the task permanently and
        silently: the task is pinned by self._task for the process lifetime, so
        asyncio never reports it, and clients keep counting down locally from
        finish_at_server_ms. The visible result was a timer that ran a round
        normally and then sat at 00:00 forever.
        """
        consecutive_errors = 0
        while True:
            try:
                await asyncio.sleep(_TICK_S)
                await self._tick()
                consecutive_errors = 0
            except asyncio.CancelledError:
                raise
            except Exception as e:
                consecutive_errors += 1
                self.last_error = f"{type(e).__name__}: {e}"
                self.last_error_at_ms = now_ms()
                self.error_count += 1
                log.exception("timer tick failed (%d consecutive failures)", consecutive_errors)
                # Back off so a persistent failure doesn't spin at 1/_TICK_S Hz.
                await asyncio.sleep(min(_TICK_S * 2 ** consecutive_errors, _MAX_ERROR_BACKOFF_S))

    async def pause(self) -> None:
        if not self.running:
            log.info("pause ignored: already paused")
            return
        # freeze remaining and clear finish time
        self.remaining_ms = self._current_remaining_ms()
        self.finish_at_server_ms = 0
        self.running = False
        log.info("paused at level %d with %.1fs remaining",
                 self.current_level_index, self.remaining_ms / 1000)
        await self._persist()
        await self._emit_full_state()

    async def resume(self) -> None:
        if self.running:
            log.info("resume ignored: already running")
            return
        # compute a new finish time from remaining
        self.running = True
        self.finish_at_server_ms = now_ms() + int(self.remaining_ms)
        log.info("resumed at level %d with %.1fs remaining",
                 self.current_level_index, self.remaining_ms / 1000)
        await self._persist()
        await self._emit_full_state()

    async def add_time(self, delta_ms: int) -> None:
        delta_ms = int(delta_ms)
        log.info("add_time %+.1fs at level %d (was %.1fs remaining)",
                 delta_ms / 1000, self.current_level_index, self._current_remaining_ms() / 1000)

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
            log.warning("reset_level ignored: level index %d out of range (%d levels)",
                        self.current_level_index, len(levels))
            return

        await self._announce("level_reset", None)

        self.remaining_ms = level_duration_ms(levels[self.current_level_index])
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
        log.info("go_to_level %d -> %d", self.current_level_index, level_index)
        await self._announce("level_change", {"old_idx": self.current_level_index, "new_idx": level_index})

        self.current_level_index = level_index
        self.remaining_ms = level_duration_ms(levels[level_index])
        self._reset_milestones()

        if self.running:
            self.finish_at_server_ms = now_ms() + int(self.remaining_ms)

        await self._persist()
        await self._emit_full_state()
