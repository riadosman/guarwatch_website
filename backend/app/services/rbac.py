from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.deps import get_db
from app.models.user import User
from app.models.role import RolePermission

SERVICES = ["users", "roles", "devices", "camera_groups", "terminal", "events", "live_view"]


def get_current_web_user(db: Session = Depends(get_db)):
    """Placeholder — overridden by require_permission dependency chain."""
    raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not authenticated")


def require_permission(service: str, action: str):
    """Returns a FastAPI Depends callable that enforces RBAC.

    Usage: current_user: User = Depends(require_permission("devices", "read"))
    """
    assert service in SERVICES, f"Unknown service: {service}"
    assert action in ("read", "create", "update", "delete"), f"Unknown action: {action}"
    col = f"can_{action}"

    async def checker(
        db: Session = Depends(get_db),
        current_user: User = Depends(_get_current_user_from_cookie),
    ) -> User:
        if current_user.role_id is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Kullanıcıya rol atanmamış")
        perm = (
            db.query(RolePermission)
            .filter_by(role_id=current_user.role_id, service=service)
            .first()
        )
        if perm is None or not getattr(perm, col):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                f"Bu işlem için yetkiniz yok: {service}.{action}",
            )
        return current_user

    return checker


from app.core.auth import _verify_jwt


def _get_current_user_from_cookie(
    access_token: str | None = Cookie(default=None),
    db: Session = Depends(get_db),
) -> User:
    sub = _verify_jwt(access_token)
    if sub is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "not authenticated")
    user = db.query(User).filter(User.username == sub).first()
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "user not found")
    return user
