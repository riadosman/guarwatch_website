"""add compound event history index

Revision ID: 0003
Revises: 0002
Create Date: 2026-06-13
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: Union[str, None] = "0002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_events_device_occurred",
        "events",
        ["device_id", sa.text("occurred_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("ix_events_device_occurred", table_name="events")
