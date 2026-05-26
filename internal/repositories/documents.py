from uuid import UUID

from sqlalchemy import delete, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from internal.models.entities import Collaborator, Document, DocumentOperation, DocumentSnapshot


class DocumentRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, owner_id: UUID, title: str, content: str) -> Document:
        doc = Document(owner_id=owner_id, title=title, content=content, current_revision=0)
        self.session.add(doc)
        await self.session.flush()
        self.session.add(Collaborator(document_id=doc.id, user_id=owner_id, role="owner"))
        return doc

    async def accessible(self, document_id: UUID, user_id: UUID) -> Document | None:
        stmt = (
            select(Document)
            .join(Collaborator, Collaborator.document_id == Document.id)
            .where(Document.id == document_id, Collaborator.user_id == user_id)
        )
        return await self.session.scalar(stmt)

    async def lock_document(self, document_id: UUID) -> Document | None:
        return await self.session.scalar(select(Document).where(Document.id == document_id).with_for_update())

    async def list_for_user(self, user_id: UUID) -> list[Document]:
        stmt = (
            select(Document)
            .join(Collaborator, Collaborator.document_id == Document.id)
            .where(Collaborator.user_id == user_id)
            .order_by(Document.updated_at.desc())
        )
        return list((await self.session.scalars(stmt)).all())

    async def rename(self, document_id: UUID, title: str) -> None:
        await self.session.execute(update(Document).where(Document.id == document_id).values(title=title))

    async def delete(self, document_id: UUID, owner_id: UUID) -> bool:
        result = await self.session.execute(delete(Document).where(Document.id == document_id, Document.owner_id == owner_id))
        return result.rowcount > 0

    async def share(self, document_id: UUID, user_id: UUID, role: str) -> None:
        self.session.add(Collaborator(document_id=document_id, user_id=user_id, role=role))

    async def operations_after(self, document_id: UUID, revision: int) -> list[DocumentOperation]:
        stmt = (
            select(DocumentOperation)
            .where(DocumentOperation.document_id == document_id, DocumentOperation.revision > revision)
            .order_by(DocumentOperation.revision)
        )
        return list((await self.session.scalars(stmt)).all())

    async def append_operation(self, op: DocumentOperation) -> None:
        self.session.add(op)

    async def latest_snapshot(self, document_id: UUID) -> DocumentSnapshot | None:
        stmt = (
            select(DocumentSnapshot)
            .where(DocumentSnapshot.document_id == document_id)
            .order_by(DocumentSnapshot.revision.desc())
            .limit(1)
        )
        return await self.session.scalar(stmt)

    async def add_snapshot(self, document_id: UUID, revision: int, content: str) -> None:
        self.session.add(DocumentSnapshot(document_id=document_id, revision=revision, content=content))

