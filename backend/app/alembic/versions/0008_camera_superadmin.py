"""add camera table, role.is_superadmin, camera_group location fields, device bootstrap flag

Revision ID: 0008
Revises: 0007
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    # Camera tablosu (no server_default on UUID — Python generates via default=uuid.uuid4)
    op.create_table(
        "cameras",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("rtsp_url", sa.String(512), nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("devices.id", ondelete="CASCADE"), nullable=False),
        sa.Column("group_id", sa.Integer, sa.ForeignKey("camera_groups.id", ondelete="SET NULL"), nullable=True),
        sa.Column("is_online", sa.Boolean, server_default="false", nullable=False),
        sa.Column("last_seen_at", sa.DateTime, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False, server_default=sa.text("NOW()")),
    )

    # Role tablosuna is_superadmin alani
    op.add_column("roles", sa.Column("is_superadmin", sa.Boolean, server_default="false", nullable=False))
    # Mevcut SuperAdmin rolunu (id=1) superadmin olarak isaretile
    op.execute(sa.text("UPDATE roles SET is_superadmin = true WHERE id = 1"))

    # CameraGroup tablosuna location alanlari
    op.add_column("camera_groups", sa.Column("il_id", sa.Integer, sa.ForeignKey("iller.id"), nullable=True))
    op.add_column("camera_groups", sa.Column("ilce_id", sa.Integer, sa.ForeignKey("ilceler.id"), nullable=True))
    op.add_column("camera_groups", sa.Column("mahalle_id", sa.Integer, sa.ForeignKey("mahalleler.id"), nullable=True))

    # Device tablosuna bootstrap flag ve location alani
    op.add_column("devices", sa.Column("registered_via_bootstrap", sa.Boolean, server_default="false", nullable=False))
    op.add_column("devices", sa.Column("location", sa.Text, nullable=True))


def downgrade():
    op.drop_column("devices", "location")
    op.drop_column("devices", "registered_via_bootstrap")
    op.drop_column("camera_groups", "mahalle_id")
    op.drop_column("camera_groups", "ilce_id")
    op.drop_column("camera_groups", "il_id")
    op.drop_column("roles", "is_superadmin")
    op.drop_table("cameras")
