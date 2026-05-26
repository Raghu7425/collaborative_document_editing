from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import make_asgi_app

from internal.config.settings import Settings
from internal.handlers.auth import router as auth_router
from internal.handlers.documents import router as document_router
from internal.handlers.health import router as health_router
from internal.handlers.websocket import router as websocket_router
from internal.logging import configure_logging
from internal.pubsub.redis_bus import RedisBus
from internal.websocket.manager import CollaborationManager

settings = Settings()
configure_logging(settings.log_level)
bus = RedisBus(settings.redis_url)
manager = CollaborationManager(bus)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await bus.connect()
    await manager.start()
    yield
    await manager.shutdown()
    await bus.close()


app = FastAPI(
    title="Collaborative Document Backend",
    version="0.1.0",
    description="Distributed WebSocket + OT backend for real-time document collaboration.",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.state.settings = settings
app.state.manager = manager

app.include_router(health_router)
app.include_router(auth_router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(document_router, prefix="/api/v1/documents", tags=["documents"])
app.include_router(websocket_router, prefix="/ws", tags=["collaboration"])
app.mount("/metrics", make_asgi_app())

