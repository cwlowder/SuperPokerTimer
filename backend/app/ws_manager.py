import asyncio
from typing import Set, Dict, Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from .db import get_settings, get_state
from .utils import now_ms

router = APIRouter()

class WSManager:
    def __init__(self) -> None:
        self._clients: Set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self._clients.add(ws)

    async def disconnect(self, ws: WebSocket) -> None:
        async with self._lock:
            self._clients.discard(ws)

    async def broadcast(self, msg: Dict[str, Any]) -> None:
        async with self._lock:
            clients = list(self._clients)

        dead: list[WebSocket] = []
        for ws in clients:
            try:
                await ws.send_json(msg)
            except Exception:
                dead.append(ws)

        if dead:
            async with self._lock:
                for ws in dead:
                    self._clients.discard(ws)

ws_manager = WSManager()

@router.websocket("")
async def websocket_endpoint(ws: WebSocket):
    await ws_manager.connect(ws)

    conn: aiosqlite.Connection = ws.app.state.db
    event_bus: EventBus = ws.app.state.bus

    async def send_initial_state():
        settings = await get_settings(conn)
        state = await get_state(conn)  # should include server_time_ms + finish_at_server_ms OR remaining_ms
        await ws.send_json({"type": "state", "payload": {"settings": settings, "state": state}})

    async def recv_loop():
        """
        Client -> server messages (time sync ping).
        """
        while True:
            msg = await ws.receive_json()
            if not isinstance(msg, dict):
                continue
            if msg.get("type") == "ping":
                payload = msg.get("payload") or {}
                client_send_ms = payload.get("client_send_ms")
                # respond with server time; include the original client timestamp
                await ws.send_json({
                    "type": "pong",
                    "payload": {
                        "client_send_ms": client_send_ms,
                        "server_time_ms": now_ms(),
                    },
                })
            # (Optional later: client can request resync, etc.)

    async def send_loop():
        """
        Server -> client events from bus.
        """
        async for ev in event_bus.subscribe():
            await ws.send_json({"type": ev.type, "payload": ev.payload})

    try:
        # 1) initial snapshot
        await send_initial_state()

        # 2) run send+recv concurrently; whichever ends first cancels the other
        send_task = asyncio.create_task(send_loop())
        recv_task = asyncio.create_task(recv_loop())
        done, pending = await asyncio.wait(
            {send_task, recv_task},
            return_when=asyncio.FIRST_EXCEPTION,
        )
        for t in pending:
            t.cancel()
        for t in done:
            # surface WS disconnects as normal exit
            exc = t.exception()
            if isinstance(exc, WebSocketDisconnect):
                return
            if exc:
                raise exc

    except WebSocketDisconnect:
        pass
    finally:
        await ws_manager.disconnect(ws)