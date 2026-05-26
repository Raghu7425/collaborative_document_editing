import asyncio

from internal.database import SessionLocal
from internal.services.auth import AuthService
from internal.services.documents import DocumentService
from internal.repositories.users import UserRepository


async def main():
    async with SessionLocal() as session:
        auth = AuthService(session)
        await auth.register("alice@example.com", "password123")
        await auth.register("bob@example.com", "password123")
    async with SessionLocal() as session:
        alice = await UserRepository(session).by_email("alice@example.com")
        doc = await DocumentService(session).create(alice.id, "Design Notes", "Collaborative editing starts here.")
        print({"document_id": str(doc.id), "alice": "alice@example.com", "bob": "bob@example.com"})


if __name__ == "__main__":
    asyncio.run(main())

