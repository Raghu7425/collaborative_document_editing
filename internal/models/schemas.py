import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(RegisterRequest):
    pass


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserMeResponse(BaseModel):
    id: uuid.UUID
    email: str


class DocumentCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    content: str = ""


class DocumentRename(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ShareRequest(BaseModel):
    user_id: uuid.UUID
    role: Literal["viewer", "editor"] = "editor"


class ShareLinkResponse(BaseModel):
    url: str
    token: str


class InviteAcceptResponse(BaseModel):
    document_id: uuid.UUID
    title: str


class DocumentResponse(BaseModel):
    id: uuid.UUID
    owner_id: uuid.UUID
    title: str
    content: str
    current_revision: int
    share_token: str | None
    created_at: datetime
    updated_at: datetime


class Operation(BaseModel):
    type: Literal["insert", "delete"]
    position: int
    text: str = ""
    length: int = 0
    base_revision: int
    client_operation_id: str
