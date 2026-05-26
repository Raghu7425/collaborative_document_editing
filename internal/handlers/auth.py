from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from internal.database import get_session
from internal.models.schemas import LoginRequest, RegisterRequest, TokenResponse
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

