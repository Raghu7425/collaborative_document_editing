from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from internal.middleware.auth import create_access_token, hash_password, verify_password
from internal.repositories.users import UserRepository


class AuthService:
    def __init__(self, session: AsyncSession):
        self.users = UserRepository(session)
        self.session = session

    async def register(self, email: str, password: str) -> str:
        if await self.users.by_email(email.lower()):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="email already registered")
        user = await self.users.create(email.lower(), hash_password(password))
        await self.session.commit()
        return create_access_token(user.id)

    async def login(self, email: str, password: str) -> str:
        user = await self.users.by_email(email.lower())
        if not user or not verify_password(password, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid credentials")
        return create_access_token(user.id)

