import hashlib
import time
from uuid import UUID

import orjson
import structlog
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect
from starlette.websockets import WebSocketState

from internal.collaboration.ot import TextOperation
from internal.database import SessionLocal
from internal.metrics.collector import OPERATIONS_TOTAL, RECONNECTS_TOTAL, SOCKET_LATENCY
from internal.middleware.auth import decode_token
from internal.middleware.rate_limit import InMemoryRateLimiter
from internal.services.documents import DocumentService

router = APIRouter()
log = structlog.get_logger()
socket_limiter = InMemoryRateLimiter(25, 1)


@router.websocket("/documents/{document_id}")
async def document_socket(websocket: WebSocket, document_id: UUID, token: str = Query(...), last_revision: int = Query(0)):
    manager = websocket.app.state.manager
    try:
        user_id = decode_token(token)
    except Exception:
        await websocket.close(code=1008)
        return

    async with SessionLocal() as session:
        await DocumentService(session).get(document_id, user_id)
        missed = await DocumentService(session).operations_after(document_id, user_id, last_revision)

    conn = await manager.connect(websocket, document_id, user_id)
    if missed:
        RECONNECTS_TOTAL.inc()
        await manager.send(
            conn,
            {
                "type": "recovery",
                "operations": [
                    {"revision": op.revision, "operation_type": op.operation_type, "payload": op.operation_payload}
                    for op in missed
                ],
            },
        )

    try:
        while websocket.client_state == WebSocketState.CONNECTED:
            raw = await websocket.receive_bytes()
            started = time.monotonic()
            if not socket_limiter.allow(conn.connection_id):
                await manager.send(conn, {"type": "error", "code": "rate_limited"})
                continue
            conn.last_seen = time.monotonic()
            payload = orjson.loads(raw)
            event_type = payload.get("type")

            if event_type == "ping":
                await manager.send(conn, {"type": "pong", "server_time": time.time()})
            elif event_type == "presence":
                await manager.update_presence(conn, payload.get("presence", {}))
            elif event_type == "operation":
                op = TextOperation(
                    type=payload["operation"]["type"],
                    position=payload["operation"]["position"],
                    text=payload["operation"].get("text", ""),
                    length=payload["operation"].get("length", 0),
                    base_revision=payload["operation"]["base_revision"],
                    client_operation_id=payload["operation"]["client_operation_id"],
                )
                async with SessionLocal() as session:
                    committed, content = await DocumentService(session, websocket.app.state.settings).commit_operation(document_id, user_id, op)
                OPERATIONS_TOTAL.inc()
                await manager.broadcast_distributed(
                    document_id,
                    {
                        "type": "operation_committed",
                        "revision": committed.revision,
                        "user_id": str(user_id),
                        "operation_type": committed.operation_type,
                        "operation": committed.operation_payload,
                    },
                    exclude_connection_id=None,
                )
                await manager.send(
                    conn,
                    {"type": "ack", "revision": committed.revision, "content_hash": hashlib.sha256(content.encode()).hexdigest()},
                )
            else:
                await manager.send(conn, {"type": "error", "code": "unknown_event"})
            SOCKET_LATENCY.observe(time.monotonic() - started)
    except WebSocketDisconnect:
        pass
    except Exception:
        log.exception("socket.failed", document_id=str(document_id), user_id=str(user_id))
    finally:
        await manager.disconnect(conn)
