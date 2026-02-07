import asyncio
from typing import Set, Dict, Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from .db import get_settings, get_state

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

    try:
        conn: aiosqlite.Connection = ws.app.state.db

        # Send full state immediately on connect
        settings = await get_settings(conn)
        state = await get_state(conn)
        await ws.send_json({"type": "state", "payload": {"settings": settings, "state": state}})

        event_bus: EventBus = ws.app.state.bus

        # Now stream bus events to this socket
        async for ev in event_bus.subscribe():
            try:
                await ws.send_json({"type": ev.type, "payload": ev.payload})
            except WebSocketDisconnect:
                break
            except Exception:
                # Any send error -> close out
                break

    finally:
        await ws_manager.disconnect(ws)