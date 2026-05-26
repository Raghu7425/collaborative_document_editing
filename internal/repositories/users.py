from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from internal.models.entities import User


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def by_email(self, email: str) -> User | None:
        return await self.session.scalar(select(User).where(User.email == email))

    async def by_id(self, user_id: UUID) -> User | None:
        return await self.session.scalar(select(User).where(User.id == user_id))

    async def create(self, email: str, password_hash: str) -> User:
        user = User(email=email.lower(), password_hash=password_hash)
        self.session.add(user)
        await self.session.flush()
        return user

