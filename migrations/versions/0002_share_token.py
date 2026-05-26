"""add share_token to documents

Revision ID: 0002_share_token
Revises: 0001_initial
Create Date: 2026-05-26
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_share_token"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("documents", sa.Column("share_token", sa.String(64), nullable=True))
    op.create_unique_constraint("uq_documents_share_token", "documents", ["share_token"])
    op.create_index("ix_documents_share_token", "documents", ["share_token"])


def downgrade():
    op.drop_index("ix_documents_share_token", table_name="documents")
    op.drop_constraint("uq_documents_share_token", "documents", type_="unique")
    op.drop_column("documents", "share_token")
