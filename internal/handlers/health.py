from fastapi import APIRouter
from sqlalchemy import text

from internal.database import SessionLocal

router = APIRouter()


@router.get("/health")
async def health():
    return {"status": "ok"}


@router.get("/ready")
async def ready():
    async with SessionLocal() as session:
        await session.execute(text("select 1"))
    return {"status": "ready"}

