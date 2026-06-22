"""add is_online, last_seen, camera_health to devices

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("devices", sa.Column("is_online", sa.Boolean, server_default="false", nullable=False))
    op.add_column("devices", sa.Column("last_seen", sa.DateTime, nullable=True))
    op.add_column("devices", sa.Column("camera_health", postgresql.JSON, nullable=True))


def downgrade():
    op.drop_column("devices", "camera_health")
    op.drop_column("devices", "last_seen")
    op.drop_column("devices", "is_online")
