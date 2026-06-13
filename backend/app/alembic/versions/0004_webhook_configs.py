"""create webhook_configs table

Revision ID: 0004
Revises: 0003
Create Date: 2026-06-13
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: Union[str, None] = "0003"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "webhook_configs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("url", sa.Text, nullable=False),
        sa.Column("enabled", sa.Boolean, nullable=False, server_default="true"),
        sa.Column(
            "event_types",
            postgresql.ARRAY(sa.String),
            nullable=False,
            server_default="{}",
        ),
        sa.Column("secret", sa.String(128), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("webhook_configs")
