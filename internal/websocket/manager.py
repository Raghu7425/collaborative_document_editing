import asyncio
import time
import uuid
from collections import defaultdict
from dataclasses import dataclass, field

import orjson
import structlog
from fastapi import WebSocket

from internal.metrics.collector import ACTIVE_DOCUMENTS, ACTIVE_SOCKETS
from internal.pubsub.redis_bus import RedisBus

log = structlog.get_logger()


@dataclass
class ClientConnection:
    websocket: WebSocket
    user_id: uuid.UUID
    document_id: uuid.UUID
    connection_id: str
    last_seen: float = field(default_factory=time.monotonic)


class CollaborationManager:
    def __init__(self, bus: RedisBus):
        self.bus = bus
        self.instance_id = str(uuid.uuid4())
        self.rooms: dict[uuid.UUID, dict[str, ClientConnection]] = defaultdict(dict)
        self.presence: dict[uuid.UUID, dict[str, dict]] = defaultdict(dict)
        self.cleanup_task: asyncio.Task | None = None

    async def start(self) -> None:
        await self.bus.subscribe("collab:broadcast", self._handle_remote_event)
        self.cleanup_task = asyncio.create_task(self._cleanup_loop())

    async def shutdown(self) -> None:
        if self.cleanup_task:
            self.cleanup_task.cancel()
        for room in list(self.rooms.values()):
            for conn in list(room.values()):
                await conn.websocket.close(code=1001)

    async def connect(self, websocket: WebSocket, document_id: uuid.UUID, user_id: uuid.UUID) -> ClientConnection:
        await websocket.accept()
        conn = ClientConnection(websocket, user_id, document_id, str(uuid.uuid4()))
        self.rooms[document_id][conn.connection_id] = conn
        self.presence[document_id][conn.connection_id] = {
            "user_id": str(user_id),
            "typing": False,
            "cursor": None,
        }
        ACTIVE_SOCKETS.inc()
        ACTIVE_DOCUMENTS.set(len(self.rooms))
        await self.broadcast_presence(document_id)
        log.info("socket.connected", document_id=str(document_id), user_id=str(user_id), connection_id=conn.connection_id)
        return conn

    async def disconnect(self, conn: ClientConnection) -> None:
        self.rooms[conn.document_id].pop(conn.connection_id, None)
        self.presence[conn.document_id].pop(conn.connection_id, None)
        if not self.rooms[conn.document_id]:
            self.rooms.pop(conn.document_id, None)
            self.presence.pop(conn.document_id, None)
        ACTIVE_SOCKETS.dec()
        ACTIVE_DOCUMENTS.set(len(self.rooms))
        await self.broadcast_presence(conn.document_id)
        log.info("socket.disconnected", connection_id=conn.connection_id)

    async def send(self, conn: ClientConnection, event: dict) -> None:
        await conn.websocket.send_bytes(orjson.dumps(event))

    async def broadcast_local(self, document_id: uuid.UUID, event: dict, exclude_connection_id: str | None = None) -> None:
        stale = []
        for connection_id, conn in list(self.rooms.get(document_id, {}).items()):
            if connection_id == exclude_connection_id:
                continue
            try:
                await self.send(conn, event)
            except Exception:
                stale.append(conn)
        for conn in stale:
            await self.disconnect(conn)

    async def broadcast_distributed(self, document_id: uuid.UUID, event: dict, exclude_connection_id: str | None = None) -> None:
        envelope = {
            "origin": self.instance_id,
            "document_id": str(document_id),
            "exclude_connection_id": exclude_connection_id,
            "event": event,
        }
        await self.broadcast_local(document_id, event, exclude_connection_id)
        await self.bus.publish("collab:broadcast", envelope)

    async def _handle_remote_event(self, envelope: dict) -> None:
        if envelope.get("origin") == self.instance_id:
            return
        await self.broadcast_local(uuid.UUID(envelope["document_id"]), envelope["event"], envelope.get("exclude_connection_id"))

    async def update_presence(self, conn: ClientConnection, patch: dict) -> None:
        conn.last_seen = time.monotonic()
        self.presence[conn.document_id][conn.connection_id].update(patch)
        await self.broadcast_distributed(
            conn.document_id,
            {"type": "presence", "users": list(self.presence[conn.document_id].values())},
        )

    async def broadcast_presence(self, document_id: uuid.UUID) -> None:
        await self.broadcast_distributed(document_id, {"type": "presence", "users": list(self.presence.get(document_id, {}).values())})

    async def _cleanup_loop(self) -> None:
        while True:
            await asyncio.sleep(20)
            now = time.monotonic()
            for room in list(self.rooms.values()):
                for conn in list(room.values()):
                    if now - conn.last_seen > 90:
                        await self.disconnect(conn)

