from uuid import UUID

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from internal.database import get_session
from internal.middleware.auth import current_user_id
from internal.middleware.rate_limit import api_rate_limit
from internal.models.schemas import DocumentCreate, DocumentRename, DocumentResponse, ShareRequest
from internal.services.documents import DocumentService

router = APIRouter(dependencies=[Depends(api_rate_limit)])


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
async def create_document(payload: DocumentCreate, user_id: UUID = Depends(current_user_id), session: AsyncSession = Depends(get_session)):
    return await DocumentService(session).create(user_id, payload.title, payload.content)


@router.get("", response_model=list[DocumentResponse])
async def list_documents(user_id: UUID = Depends(current_user_id), session: AsyncSession = Depends(get_session)):
    return await DocumentService(session).list(user_id)


@router.get("/{document_id}", response_model=DocumentResponse)
async def get_document(document_id: UUID, user_id: UUID = Depends(current_user_id), session: AsyncSession = Depends(get_session)):
    return await DocumentService(session).get(document_id, user_id)


@router.patch("/{document_id}/rename", status_code=status.HTTP_204_NO_CONTENT)
async def rename_document(document_id: UUID, payload: DocumentRename, user_id: UUID = Depends(current_user_id), session: AsyncSession = Depends(get_session)):
    await DocumentService(session).rename(document_id, user_id, payload.title)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(document_id: UUID, user_id: UUID = Depends(current_user_id), session: AsyncSession = Depends(get_session)):
    await DocumentService(session).delete(document_id, user_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{document_id}/share", status_code=status.HTTP_204_NO_CONTENT)
async def share_document(document_id: UUID, payload: ShareRequest, user_id: UUID = Depends(current_user_id), session: AsyncSession = Depends(get_session)):
    await DocumentService(session).share(document_id, user_id, payload.user_id, payload.role)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{document_id}/operations")
async def operations_after(document_id: UUID, after_revision: int = 0, user_id: UUID = Depends(current_user_id), session: AsyncSession = Depends(get_session)):
    ops = await DocumentService(session).operations_after(document_id, user_id, after_revision)
    return [{"revision": op.revision, "type": op.operation_type, "payload": op.operation_payload} for op in ops]


@router.post("/{document_id}/rollback/{revision}", response_model=DocumentResponse)
async def rollback(document_id: UUID, revision: int, user_id: UUID = Depends(current_user_id), session: AsyncSession = Depends(get_session)):
    return await DocumentService(session).rollback_to_revision(document_id, user_id, revision)

