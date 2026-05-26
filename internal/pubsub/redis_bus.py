import asyncio
from collections.abc import Awaitable, Callable

import orjson
import redis.asyncio as redis
import structlog

log = structlog.get_logger()


class RedisBus:
    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self.client: redis.Redis | None = None
        self.pubsub = None
        self.tasks: list[asyncio.Task] = []

    async def connect(self) -> None:
        self.client = redis.from_url(self.redis_url, decode_responses=False)
        await self.client.ping()
        self.pubsub = self.client.pubsub()
        log.info("redis.connected")

    async def close(self) -> None:
        for task in self.tasks:
            task.cancel()
        if self.pubsub:
            await self.pubsub.close()
        if self.client:
            await self.client.aclose()

    async def publish(self, channel: str, payload: dict) -> None:
        await self.client.publish(channel, orjson.dumps(payload))

    async def subscribe(self, channel: str, handler: Callable[[dict], Awaitable[None]]) -> None:
        await self.pubsub.subscribe(channel)

        async def reader():
            async for message in self.pubsub.listen():
                if message.get("type") != "message":
                    continue
                try:
                    await handler(orjson.loads(message["data"]))
                except Exception:
                    log.exception("redis.message_handler_failed", channel=channel)

        self.tasks.append(asyncio.create_task(reader()))

