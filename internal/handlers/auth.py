from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from internal.database import get_session
from internal.middleware.auth import current_user_id
from internal.models.schemas import LoginRequest, RegisterRequest, TokenResponse, UserMeResponse
from internal.repositories.users import UserRepository
from internal.services.auth import AuthService

router = APIRouter()


@router.post("/register", response_model=TokenResponse)
async def register(payload: RegisterRequest, session: AsyncSession = Depends(get_session)):
    token = await AuthService(session).register(payload.email, payload.password)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, session: AsyncSession = Depends(get_session)):
    token = await AuthService(session).login(payload.email, payload.password)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserMeResponse)
async def me(user_id: UUID = Depends(current_user_id), session: AsyncSession = Depends(get_session)):
    user = await UserRepository(session).by_id(user_id)
    return UserMeResponse(id=user.id, email=user.email)
