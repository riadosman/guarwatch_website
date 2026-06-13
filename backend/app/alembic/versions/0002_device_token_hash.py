"""add token_hash to devices

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-13
"""
from typing import Sequence, Union
import hashlib
import os
import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: Union[str, None] = "0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def upgrade() -> None:
    op.add_column("devices", sa.Column("token_hash", sa.String(64), nullable=False, server_default=""))
    # backfill existing devices from DEVICE_TOKENS env var (format: "uuid:token,uuid:token")
    conn = op.get_bind()
    device_tokens = os.environ.get("DEVICE_TOKENS", "")
    for pair in device_tokens.split(","):
        pair = pair.strip()
        if ":" not in pair:
            continue
        device_id, token = pair.split(":", 1)
        conn.execute(
            sa.text("UPDATE devices SET token_hash = :h WHERE id = :id"),
            {"h": _hash(token.strip()), "id": device_id.strip()},
        )


def downgrade() -> None:
    op.drop_column("devices", "token_hash")
