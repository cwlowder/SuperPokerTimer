import asyncio
import logging
from dataclasses import dataclass
from typing import Any, AsyncIterator

log = logging.getLogger(__name__)

@dataclass
class Event:
    type: str
    payload: dict[str, Any]

class EventBus:
    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[Event]] = set()
        self._lock = asyncio.Lock()

    async def publish(self, event: Event) -> None:
        async with self._lock:
            dead = []
            for q in self._subscribers:
                try:
                    q.put_nowait(event)
                except asyncio.QueueFull:
                    # A wedged subscriber silently misses events; that used to be
                    # invisible and looks identical to "the server never sent it".
                    log.warning("dropped %r event: subscriber queue full", event.type)
                except Exception:
                    log.exception("dropping subscriber after failed %r publish", event.type)
                    dead.append(q)
            for q in dead:
                self._subscribers.discard(q)

    async def subscribe(self) -> AsyncIterator[Event]:
        q: asyncio.Queue[Event] = asyncio.Queue(maxsize=200)
        async with self._lock:
            self._subscribers.add(q)
        try:
            while True:
                ev = await q.get()
                yield ev
        finally:
            async with self._lock:
                self._subscribers.discard(q)
