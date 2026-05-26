import uuid
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from internal.collaboration.ot import TextOperation, apply_operation, rebase
from internal.config.settings import Settings
from internal.models.entities import DocumentOperation
from internal.repositories.documents import DocumentRepository


class DocumentService:
    def __init__(self, session: AsyncSession, settings: Settings | None = None):
        self.session = session
        self.repo = DocumentRepository(session)
        self.settings = settings or Settings()

    async def create(self, user_id: UUID, title: str, content: str):
        doc = await self.repo.create(user_id, title, content)
        await self.repo.add_snapshot(doc.id, 0, content)
        await self.session.commit()
        return doc

    async def get(self, document_id: UUID, user_id: UUID):
        doc = await self.repo.accessible(document_id, user_id)
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")
        return doc

    async def list(self, user_id: UUID):
        return await self.repo.list_for_user(user_id)

    async def rename(self, document_id: UUID, user_id: UUID, title: str):
        await self.get(document_id, user_id)
        await self.repo.rename(document_id, title)
        await self.session.commit()

    async def delete(self, document_id: UUID, user_id: UUID):
        deleted = await self.repo.delete(document_id, user_id)
        await self.session.commit()
        if not deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")

    async def share(self, document_id: UUID, owner_id: UUID, user_id: UUID, role: str):
        doc = await self.get(document_id, owner_id)
        if doc.owner_id != owner_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="only owner can share")
        await self.repo.share(document_id, user_id, role)
        await self.session.commit()

    async def generate_share_link(self, document_id: UUID, user_id: UUID) -> str:
        doc = await self.get(document_id, user_id)
        if doc.owner_id != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="only owner can generate share link")
        if doc.share_token:
            return doc.share_token
        token = uuid.uuid4().hex
        await self.repo.set_share_token(document_id, token)
        await self.session.commit()
        return token

    async def accept_invite(self, token: str, user_id: UUID):
        doc = await self.repo.by_share_token(token)
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="invite not found or expired")
        existing = await self.repo.accessible(doc.id, user_id)
        if not existing:
            await self.repo.share(doc.id, user_id, "editor")
            await self.session.commit()
        return doc

    async def commit_operation(self, document_id: UUID, user_id: UUID, incoming: TextOperation) -> tuple[DocumentOperation, str]:
        await self.get(document_id, user_id)
        doc = await self.repo.lock_document(document_id)
        if not doc:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="document not found")

        missed = await self.repo.operations_after(document_id, incoming.base_revision)
        committed = [
            TextOperation(
                type=o.operation_type,
                position=o.operation_payload["position"],
                text=o.operation_payload.get("text", ""),
                length=o.operation_payload.get("length", 0),
                base_revision=o.revision - 1,
                client_operation_id=o.operation_payload.get("client_operation_id", ""),
            )
            for o in missed
        ]
        rebased = rebase(incoming, committed)
        doc.content = apply_operation(doc.content, rebased)
        doc.current_revision += 1
        operation = DocumentOperation(
            document_id=document_id,
            user_id=user_id,
            operation_type=rebased.type,
            operation_payload={
                "position": rebased.position,
                "text": rebased.text,
                "length": rebased.length,
                "base_revision": incoming.base_revision,
                "client_operation_id": incoming.client_operation_id,
                "transformed": incoming.position != rebased.position or incoming.length != rebased.length,
            },
            revision=doc.current_revision,
        )
        await self.repo.append_operation(operation)
        if doc.current_revision % self.settings.snapshot_every_n_operations == 0:
            await self.repo.add_snapshot(document_id, doc.current_revision, doc.content)
        await self.session.commit()
        return operation, doc.content

    async def operations_after(self, document_id: UUID, user_id: UUID, revision: int):
        await self.get(document_id, user_id)
        return await self.repo.operations_after(document_id, revision)

    async def rollback_to_revision(self, document_id: UUID, user_id: UUID, revision: int):
        doc = await self.get(document_id, user_id)
        if doc.owner_id != user_id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="only owner can rollback")
        snapshot = await self.repo.latest_snapshot(document_id)
        if snapshot and snapshot.revision <= revision:
            content = snapshot.content
            start = snapshot.revision
        else:
            content = ""
            start = 0
        ops = await self.repo.operations_after(document_id, start)
        for op in [o for o in ops if o.revision <= revision]:
            content = apply_operation(content, TextOperation(op.operation_type, op.operation_payload["position"], op.operation_payload.get("text", ""), op.operation_payload.get("length", 0)))
        locked = await self.repo.lock_document(document_id)
        locked.content = content
        locked.current_revision = revision
        await self.repo.add_snapshot(document_id, revision, content)
        await self.session.commit()
        return locked
