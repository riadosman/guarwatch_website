"""add roles, role_permissions, users, camera_groups

Revision ID: 0005
Revises: 0004
Create Date: 2026-06-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

SERVICES = ["users", "roles", "devices", "camera_groups", "terminal", "events", "live_view"]


def upgrade():
    # Roles table
    op.create_table(
        "roles",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(64), unique=True, nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    # Role permissions table
    op.create_table(
        "role_permissions",
        sa.Column("role_id", sa.Integer, sa.ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("service", sa.String(64), primary_key=True),
        sa.Column("can_read", sa.Boolean, server_default="false", nullable=False),
        sa.Column("can_create", sa.Boolean, server_default="false", nullable=False),
        sa.Column("can_update", sa.Boolean, server_default="false", nullable=False),
        sa.Column("can_delete", sa.Boolean, server_default="false", nullable=False),
    )
    # Users table
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("username", sa.String(64), unique=True, nullable=False),
        sa.Column("password_hash", sa.String(64), nullable=False),
        sa.Column("role_id", sa.Integer, sa.ForeignKey("roles.id"), nullable=True),
        sa.Column("group_ids", postgresql.ARRAY(sa.Integer), server_default="{}"),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    # Camera groups table
    op.create_table(
        "camera_groups",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("device_id", sa.String(64), nullable=False),
        sa.Column("camera_uris", postgresql.ARRAY(sa.String), server_default="{}"),
        sa.Column("created_at", sa.DateTime, nullable=False),
    )
    # Seed: SuperAdmin role (all permissions)
    op.execute("""
        INSERT INTO roles (name, description, created_at)
        VALUES ('SuperAdmin', 'Tüm yetkilere sahip sistem yöneticisi', NOW())
    """)
    for svc in SERVICES:
        op.execute(f"""
            INSERT INTO role_permissions (role_id, service, can_read, can_create, can_update, can_delete)
            VALUES (1, '{svc}', true, true, true, true)
        """)
    # Seed: Default admin user (username: admin, password: changeme → SHA256)
    import hashlib
    pw_hash = hashlib.sha256(b"changeme").hexdigest()
    op.execute(f"""
        INSERT INTO users (username, password_hash, role_id, group_ids, created_at)
        VALUES ('admin', '{pw_hash}', 1, '{{}}', NOW())
    """)


def downgrade():
    op.drop_table("camera_groups")
    op.drop_table("users")
    op.drop_table("role_permissions")
    op.drop_table("roles")
