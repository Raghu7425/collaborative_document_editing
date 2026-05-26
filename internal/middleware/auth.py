from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext

from internal.config.settings import Settings

settings = Settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
bearer = HTTPBearer()


def _to_bcrypt_bytes(password: str) -> bytes:
    # bcrypt hard-limits at 72 bytes; encode then slice so neither passlib
    # nor the bcrypt C-extension ever sees a longer value
    return password.encode("utf-8")[:72]


def hash_password(password: str) -> str:
    return pwd_context.hash(_to_bcrypt_bytes(password))


def verify_password(password: str, hashed: str) -> bool:
    return pwd_context.verify(_to_bcrypt_bytes(password), hashed)


def create_access_token(user_id: UUID) -> str:
    expires = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_expire_minutes)
    return jwt.encode(
        {"sub": str(user_id), "exp": expires},
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )


def decode_token(token: str) -> UUID:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return UUID(payload["sub"])
    except (JWTError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid token") from exc


async def current_user_id(credentials: HTTPAuthorizationCredentials = Depends(bearer)) -> UUID:
    return decode_token(credentials.credentials)

