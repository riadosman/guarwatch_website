# Camera / Group / SuperAdmin Genisletme - Uygulama Plani

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** GuardWatch'a SuperAdmin kamera yonetimi, il/ilce/mahalle siniflamasi, Jetson sifir dokunuslu bootstrap, otomatik kamera kesfi ve canli RTSP stream eklemek.

**Architecture:** Mevcut FastAPI/PostgreSQL/Next.js stack uzerine ekleme yapilir. Yeni Camera modeli Jetson'a (Device) baglidir; CameraGroup il/ilce/mahalle zorunlu hale gelir; SuperAdmin rolu RBAC'i bypass eder; Jetson agent BOOTSTRAP_SECRET ile kendini kaydeder ve RTSP kameralari JPEG frame olarak relay WebSocket uzerinden tarayiciya gonderir.

**Tech Stack:** FastAPI, SQLAlchemy (Column + Mapped mix), Alembic, PostgreSQL (ARRAY/JSONB/UUID), Next.js 14 App Router, OpenCV-Python, websockets, Pydantic v2.

## Global Constraints

- Alembic migration dosyalari: `backend/app/alembic/versions/000N_slug.py` (siradaki: 0007)
- SQLAlchemy: mevcut modeller `Column()` syntax kullanir, yeni modeller de ayni sekilde yazilir
- Tum backend testleri: `backend/` dizininde `pytest` ile calisir
- Frontend: `"use client"` directive + `fetch()` + `useState/useEffect` pattern (bakti: groups/page.tsx)
- Agent kodu: `new_guardwatch/agent/` dizini (guardwatch_website/agent/ degil)
- Relay WebSocket mesaj formati: `{"ch": int, "type": str, ...}`
- Stream frame formati: `{"ch": 3, "type": "frame", "cam_id": str, "data": str}` (base64 JPEG)

---

## Dosya Haritasi

### Olusturulacak
- `backend/app/models/location.py` — Il, Ilce, Mahalle SQLAlchemy modelleri
- `backend/app/models/camera.py` — Camera SQLAlchemy modeli
- `backend/app/alembic/versions/0007_location_tables.py` — il/ilce/mahalle migration + seed
- `backend/app/alembic/versions/0008_camera_superadmin.py` — camera, role.is_superadmin, camera_group location
- `backend/app/routers/locations.py` — GET /api/locations/iller|ilceler|mahalleler
- `backend/app/routers/cameras.py` — Camera CRUD + discovery endpoint
- `backend/tests/test_locations.py`
- `backend/tests/test_cameras.py`
- `backend/tests/test_bootstrap.py`
- `relay/stream_hub.py` — StreamHub sinifi (TerminalHub analogu)
- `new_guardwatch/agent/stream.py` — RTSP → JPEG WebSocket encoder
- `frontend/src/app/dashboard/devices/[id]/stream/[camId]/page.tsx`
- `frontend/src/components/LiveStream.tsx`
- `frontend/src/app/dashboard/groups/[id]/page.tsx`

### Degistirilecek
- `backend/app/models/role.py` — is_superadmin alani ekle
- `backend/app/models/camera_group.py` — il_id, ilce_id, mahalle_id ekle; camera_uris kaldir
- `backend/app/models/__init__.py` — yeni modelleri export et
- `backend/app/config.py` — bootstrap_secret ekle
- `backend/app/services/rbac.py` — is_superadmin bypass ekle
- `backend/app/routers/devices.py` — bootstrap endpoint + camera listesi
- `backend/app/routers/groups.py` — location alanlari ekle
- `backend/app/main.py` — yeni routerlari include et
- `relay/main.py` — StreamHub entegrasyonu + /stream WebSocket endpoint
- `new_guardwatch/agent/main.py` — bootstrap akisi + kamera bildirimi + stream kanal
- `new_guardwatch/agent/config.py` — BOOTSTRAP_SECRET, BACKEND_URL ekle
- `new_guardwatch/installer/bootstrap.sh` — yeni env degiskenleri
- `frontend/src/app/dashboard/groups/page.tsx` — location dropdown ekle
- `frontend/src/app/dashboard/devices/[id]/page.tsx` — kamera listesi + stream butonu
- `frontend/src/app/dashboard/users/[id]/page.tsx` — grup atama UI (veya users/page.tsx)

---

## Task 1: Location Tablolari ve Seed Verisi

**Files:**
- Create: `backend/app/models/location.py`
- Create: `backend/app/alembic/versions/0007_location_tables.py`
- Modify: `backend/app/models/__init__.py`

**Interfaces:**
- Produces: `Il(id, name)`, `Ilce(id, name, il_id)`, `Mahalle(id, name, ilce_id)` SQLAlchemy modelleri

- [ ] **Step 1: Location modellerini yaz**

`backend/app/models/location.py` olustur:

```python
from sqlalchemy import Column, Integer, String, ForeignKey
from app.models.base import Base


class Il(Base):
    __tablename__ = "iller"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(64), nullable=False)


class Ilce(Base):
    __tablename__ = "ilceler"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(64), nullable=False)
    il_id = Column(Integer, ForeignKey("iller.id", ondelete="CASCADE"), nullable=False)


class Mahalle(Base):
    __tablename__ = "mahalleler"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(128), nullable=False)
    ilce_id = Column(Integer, ForeignKey("ilceler.id", ondelete="CASCADE"), nullable=False)
```

- [ ] **Step 2: __init__.py'yi guncelle**

`backend/app/models/__init__.py` dosyasina ekle:

```python
from app.models.base import Base
from app.models.device import Device
from app.models.event import Event
from app.models.webhook import WebhookConfig
from app.models.location import Il, Ilce, Mahalle

__all__ = ["Base", "Device", "Event", "WebhookConfig", "Il", "Ilce", "Mahalle"]
```

- [ ] **Step 3: Migration yaz (il/ilce/mahalle + seed)**

`backend/app/alembic/versions/0007_location_tables.py` olustur:

```python
"""add il ilce mahalle location tables

Revision ID: 0007
Revises: 0006
Create Date: 2026-06-24
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

# Turkiye il verisi (81 il)
ILLER = [
    "Adana", "Adiyaman", "Afyonkarahisar", "Agri", "Amasya", "Ankara", "Antalya",
    "Artvin", "Aydin", "Balikesir", "Bilecik", "Bingol", "Bitlis", "Bolu",
    "Burdur", "Bursa", "Canakkale", "Cankiri", "Corum", "Denizli", "Diyarbakir",
    "Edirne", "Elazig", "Erzincan", "Erzurum", "Eskisehir", "Gaziantep", "Giresun",
    "Gumushane", "Hakkari", "Hatay", "Isparta", "Mersin", "Istanbul", "Izmir",
    "Kars", "Kastamonu", "Kayseri", "Kirklareli", "Kirsehir", "Kocaeli", "Konya",
    "Kutahya", "Malatya", "Manisa", "Kahramanmaras", "Mardin", "Mugla", "Mus",
    "Nevsehir", "Nigde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt",
    "Sinop", "Sivas", "Tekirdag", "Tokat", "Trabzon", "Tunceli", "Sanliurfa",
    "Usak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman",
    "Kirikkale", "Batman", "Sirnak", "Bartin", "Ardahan", "Igdir", "Yalova",
    "Karabuk", "Kilis", "Osmaniye", "Duzce",
]

# Her il icin temel ilceler (sadece il merkezi - geri kalani prod'da yuklenebilir)
# Format: {il_adi: [ilce_adi, ...]}
ILCELER_SAMPLE = {
    "Istanbul": ["Adalar", "Arnavutkoy", "Atasehir", "Avcilar", "Bagcilar", "Bahcelievler",
                 "Bakirkoy", "Basaksehir", "Bayrampasa", "Besiktas", "Beykoz", "Beylikduzu",
                 "Beyoglu", "Buyukcekmece", "Catalca", "Cekmekoy", "Esenler", "Esenyurt",
                 "Eyupsultan", "Fatih", "Gaziosmanpasa", "Gungoren", "Kadikoy", "Kagithane",
                 "Kartal", "Kucukcekmece", "Maltepe", "Pendik", "Sancaktepe", "Sariyer",
                 "Sile", "Silivri", "Sultanbeyli", "Sultangazi", "Sishane", "Tuzla",
                 "Umraniye", "Uskudar", "Zeytinburnu"],
    "Ankara": ["Akyurt", "Altindag", "Ayas", "Bala", "Beypazari", "Camlidere", "Cankaya",
               "Cubuk", "Elmadagi", "Etimesgut", "Evren", "Golbasi", "Gudul", "Haymana",
               "Kahramankazan", "Kizilcahamam", "Mamak", "Nallihan", "Polatli", "Pursaklar",
               "Sincan", "Sereflikochisar", "Yenimahalle"],
    "Izmir": ["Aliaga", "Balcova", "Bayindir", "Bayrakli", "Bergama", "Beydagi", "Bornova",
              "Buca", "Cesme", "Cigli", "Dikili", "Foca", "Guzelbahce", "Karabaglar",
              "Karaburun", "Karsis", "Kemalpasa", "Kinik", "Kiraz", "Kucukdal", "Menderes",
              "Menemen", "Narlidere", "Odemis", "Selcuk", "Seferihisar", "Torbali", "Tire",
              "Urla"],
}


def upgrade():
    op.create_table(
        "iller",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(64), nullable=False),
    )
    op.create_table(
        "ilceler",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(64), nullable=False),
        sa.Column("il_id", sa.Integer, sa.ForeignKey("iller.id", ondelete="CASCADE"), nullable=False),
    )
    op.create_table(
        "mahalleler",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("ilce_id", sa.Integer, sa.ForeignKey("ilceler.id", ondelete="CASCADE"), nullable=False),
    )

    # Seed iller
    for il_name in ILLER:
        op.execute(f"INSERT INTO iller (name) VALUES ('{il_name}')")

    # Seed ilceler (oncelikli sehirler)
    for il_name, ilceler in ILCELER_SAMPLE.items():
        il_id_row = op.get_bind().execute(
            sa.text(f"SELECT id FROM iller WHERE name = '{il_name}'")
        ).fetchone()
        if il_id_row:
            il_id = il_id_row[0]
            for ilce_name in ilceler:
                op.execute(f"INSERT INTO ilceler (name, il_id) VALUES ('{ilce_name}', {il_id})")
            # Her ilce icin merkez mahalle seed'i
            ilce_ids = op.get_bind().execute(
                sa.text(f"SELECT id, name FROM ilceler WHERE il_id = {il_id}")
            ).fetchall()
            for ilce_id, ilce_name in ilce_ids:
                op.execute(
                    f"INSERT INTO mahalleler (name, ilce_id) VALUES ('{ilce_name} Merkez', {ilce_id})"
                )

    # Diger iller icin varsayilan ilce (il adi + Merkez)
    for il_name in ILLER:
        if il_name not in ILCELER_SAMPLE:
            il_id_row = op.get_bind().execute(
                sa.text(f"SELECT id FROM iller WHERE name = '{il_name}'")
            ).fetchone()
            if il_id_row:
                il_id = il_id_row[0]
                op.execute(f"INSERT INTO ilceler (name, il_id) VALUES ('{il_name} Merkez', {il_id})")
                ilce_row = op.get_bind().execute(
                    sa.text(f"SELECT id FROM ilceler WHERE il_id = {il_id} LIMIT 1")
                ).fetchone()
                if ilce_row:
                    op.execute(
                        f"INSERT INTO mahalleler (name, ilce_id) VALUES ('{il_name} Merkez Mahallesi', {ilce_row[0]})"
                    )


def downgrade():
    op.drop_table("mahalleler")
    op.drop_table("ilceler")
    op.drop_table("iller")
```

- [ ] **Step 4: Migration calistir ve dogrula**

```bash
cd backend
alembic upgrade 0007
```

Beklenen: 3 tablo olusturuldu, iller tablosunda 81 satir.

```bash
docker compose exec postgres psql -U fleet -d fleet -c "SELECT COUNT(*) FROM iller; SELECT COUNT(*) FROM ilceler;"
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/location.py backend/app/models/__init__.py backend/app/alembic/versions/0007_location_tables.py
git commit -m "feat(db): il/ilce/mahalle location tablolari ve seed verisi"
```

---

## Task 2: Camera ve SuperAdmin DB Migration

**Files:**
- Create: `backend/app/models/camera.py`
- Create: `backend/app/alembic/versions/0008_camera_superadmin.py`
- Modify: `backend/app/models/role.py`
- Modify: `backend/app/models/camera_group.py`
- Modify: `backend/app/models/__init__.py`

**Interfaces:**
- Produces: `Camera(id, name, rtsp_url, device_id, group_id, is_online, last_seen_at)` modeli
- Produces: `Role.is_superadmin` boolean alani
- Produces: `CameraGroup.il_id`, `CameraGroup.ilce_id`, `CameraGroup.mahalle_id` alanlari

- [ ] **Step 1: Camera modelini yaz**

`backend/app/models/camera.py` olustur:

```python
import uuid
from datetime import datetime
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from app.models.base import Base


class Camera(Base):
    __tablename__ = "cameras"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(128), nullable=False)
    rtsp_url = Column(String(512), nullable=False)
    device_id = Column(UUID(as_uuid=True), ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    group_id = Column(Integer, ForeignKey("camera_groups.id", ondelete="SET NULL"), nullable=True)
    is_online = Column(Boolean, server_default="false", nullable=False)
    last_seen_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
```

`Integer` import eksik — dosyanin basina ekle:

```python
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
```

- [ ] **Step 2: Role modeline is_superadmin ekle**

`backend/app/models/role.py` icindeki `Role` classina alan ekle:

```python
is_superadmin = Column(Boolean, server_default="false", nullable=False)
```

- [ ] **Step 3: CameraGroup modeline location alanlari ekle**

`backend/app/models/camera_group.py` dosyasina ekle (camera_uris satirinin altina):

```python
il_id = Column(Integer, ForeignKey("iller.id"), nullable=True)
ilce_id = Column(Integer, ForeignKey("ilceler.id"), nullable=True)
mahalle_id = Column(Integer, ForeignKey("mahalleler.id"), nullable=True)
```

Not: `nullable=True` cunku mevcut gruplar location olmadan var. Yeni gruplarda zorunluluk backend validasyonunda yapilir.

- [ ] **Step 4: __init__.py'yi guncelle**

```python
from app.models.base import Base
from app.models.device import Device
from app.models.event import Event
from app.models.webhook import WebhookConfig
from app.models.location import Il, Ilce, Mahalle
from app.models.camera import Camera

__all__ = ["Base", "Device", "Event", "WebhookConfig", "Il", "Ilce", "Mahalle", "Camera"]
```

- [ ] **Step 5: Migration yaz**

`backend/app/alembic/versions/0008_camera_superadmin.py` olustur:

```python
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
    # Camera tablosu
    op.create_table(
        "cameras",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
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
    op.execute("UPDATE roles SET is_superadmin = true WHERE id = 1")

    # CameraGroup tablosuna location alanlari
    op.add_column("camera_groups", sa.Column("il_id", sa.Integer, sa.ForeignKey("iller.id"), nullable=True))
    op.add_column("camera_groups", sa.Column("ilce_id", sa.Integer, sa.ForeignKey("ilceler.id"), nullable=True))
    op.add_column("camera_groups", sa.Column("mahalle_id", sa.Integer, sa.ForeignKey("mahalleler.id"), nullable=True))

    # Device tablosuna bootstrap flag ve location alanı
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
```

- [ ] **Step 6: Migration calistir**

```bash
cd backend
alembic upgrade 0008
```

Beklenen: cameras tablosu olusturuldu, roles.is_superadmin kolonu eklendi.

- [ ] **Step 7: Commit**

```bash
git add backend/app/models/camera.py backend/app/models/role.py backend/app/models/camera_group.py backend/app/models/__init__.py backend/app/alembic/versions/0008_camera_superadmin.py
git commit -m "feat(db): camera tablosu, is_superadmin, camera_group location alanlari"
```

---

## Task 3: SuperAdmin RBAC Bypass + Config

**Files:**
- Modify: `backend/app/services/rbac.py`
- Modify: `backend/app/config.py`

**Interfaces:**
- Produces: `require_permission(service, action)` — is_superadmin=true ise 403 atmaz
- Produces: `settings.bootstrap_secret: str`

- [ ] **Step 1: rbac.py'yi oku**

`backend/app/services/rbac.py` dosyasini oku ve `require_permission` fonksiyonunu bul.

- [ ] **Step 2: is_superadmin bypass ekle**

`require_permission` icindeki permission kontrol blogunu bul ve su sekilde guncelle — User'in role.is_superadmin=true ise direkt gec:

```python
def require_permission(service: str, action: str):
    def dependency(
        user: Annotated[User, Depends(_get_current_user_from_cookie)],
        db: DbSession,
    ) -> User:
        # SuperAdmin her seye erisebilir
        if user.role and getattr(user.role, "is_superadmin", False):
            return user
        # Normal RBAC kontrolu
        if user.role is None:
            raise HTTPException(status_code=403, detail="Rol atanmamis")
        perm = (
            db.query(RolePermission)
            .filter(
                RolePermission.role_id == user.role_id,
                RolePermission.service == service,
            )
            .first()
        )
        if perm is None:
            raise HTTPException(status_code=403, detail="Yetki yok")
        action_field = f"can_{action}"
        if not getattr(perm, action_field, False):
            raise HTTPException(status_code=403, detail=f"{service}.{action} yetkisi yok")
        return user
    return Depends(dependency)
```

- [ ] **Step 3: bootstrap_secret'i config'e ekle**

`backend/app/config.py` — `Settings` class icine ekle:

```python
bootstrap_secret: str = Field(
    default="",
    description="Jetson'larin ilk kayit icin kullandigi paylasilan gizli anahtar.",
)
```

- [ ] **Step 4: .env'e ekle**

`guardwatch_website/.env` dosyasina ekle:

```
BOOTSTRAP_SECRET=change-this-to-a-strong-random-secret-32-bytes
```

`docker-compose.yml` backend servisi `environment` bloguna ekle:

```yaml
BOOTSTRAP_SECRET: ${BOOTSTRAP_SECRET:-}
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/rbac.py backend/app/config.py .env docker-compose.yml
git commit -m "feat(auth): superadmin RBAC bypass ve bootstrap_secret config"
```

---

## Task 4: Location API Endpointleri

**Files:**
- Create: `backend/app/routers/locations.py`
- Create: `backend/tests/test_locations.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- Produces: `GET /api/locations/iller` → `[{id, name}]`
- Produces: `GET /api/locations/ilceler?il_id=X` → `[{id, name, il_id}]`
- Produces: `GET /api/locations/mahalleler?ilce_id=X` → `[{id, name, ilce_id}]`

- [ ] **Step 1: Test yaz (once)**

`backend/tests/test_locations.py` olustur:

```python
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.main import create_app

client = TestClient(create_app())


def make_row(id, name, **kwargs):
    m = MagicMock()
    m.id = id
    m.name = name
    for k, v in kwargs.items():
        setattr(m, k, v)
    return m


def test_iller_returns_list():
    mock_iller = [make_row(1, "Istanbul"), make_row(2, "Ankara")]
    with patch("app.routers.locations.get_db") as mock_get_db:
        mock_db = MagicMock()
        mock_db.query.return_value.order_by.return_value.all.return_value = mock_iller
        mock_get_db.return_value = iter([mock_db])
        resp = client.get("/api/locations/iller")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["name"] == "Istanbul"


def test_ilceler_filters_by_il_id():
    mock_ilceler = [make_row(1, "Kadikoy", il_id=1)]
    with patch("app.routers.locations.get_db") as mock_get_db:
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = mock_ilceler
        mock_get_db.return_value = iter([mock_db])
        resp = client.get("/api/locations/ilceler?il_id=1")
    assert resp.status_code == 200


def test_mahalleler_filters_by_ilce_id():
    mock_mahalleler = [make_row(1, "Moda Mahallesi", ilce_id=1)]
    with patch("app.routers.locations.get_db") as mock_get_db:
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.order_by.return_value.all.return_value = mock_mahalleler
        mock_get_db.return_value = iter([mock_db])
        resp = client.get("/api/locations/mahalleler?ilce_id=1")
    assert resp.status_code == 200
```

- [ ] **Step 2: Testi calistir — fail beklenir**

```bash
cd backend
pytest tests/test_locations.py -v
```

Beklenen: FAIL (router yok)

- [ ] **Step 3: Router yaz**

`backend/app/routers/locations.py` olustur:

```python
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Annotated
from app.core.deps import get_db, DbSession
from app.core.auth import require_auth
from app.models.location import Il, Ilce, Mahalle

router = APIRouter(prefix="/api/locations", tags=["locations"])


class IlOut(BaseModel):
    id: int
    name: str
    model_config = {"from_attributes": True}


class IlceOut(BaseModel):
    id: int
    name: str
    il_id: int
    model_config = {"from_attributes": True}


class MahalleOut(BaseModel):
    id: int
    name: str
    ilce_id: int
    model_config = {"from_attributes": True}


@router.get("/iller", response_model=list[IlOut])
def get_iller(db: DbSession, _: Annotated[str, Depends(require_auth)]):
    return db.query(Il).order_by(Il.name).all()


@router.get("/ilceler", response_model=list[IlceOut])
def get_ilceler(il_id: int, db: DbSession, _: Annotated[str, Depends(require_auth)]):
    return db.query(Ilce).filter(Ilce.il_id == il_id).order_by(Ilce.name).all()


@router.get("/mahalleler", response_model=list[MahalleOut])
def get_mahalleler(ilce_id: int, db: DbSession, _: Annotated[str, Depends(require_auth)]):
    return db.query(Mahalle).filter(Mahalle.ilce_id == ilce_id).order_by(Mahalle.name).all()
```

- [ ] **Step 4: main.py'ye router'i ekle**

`backend/app/main.py` — import ve include_router ekle:

```python
from app.routers.locations import router as locations_router
# ...
app.include_router(locations_router)
```

- [ ] **Step 5: Testleri calistir — pass beklenir**

```bash
cd backend
pytest tests/test_locations.py -v
```

- [ ] **Step 6: Commit**

```bash
git add backend/app/routers/locations.py backend/tests/test_locations.py backend/app/main.py
git commit -m "feat(api): il/ilce/mahalle location endpointleri"
```

---

## Task 5: Bootstrap Endpoint + Device Token Auth

**Files:**
- Modify: `backend/app/routers/devices.py`
- Create: `backend/tests/test_bootstrap.py`

**Interfaces:**
- Produces: `POST /api/devices/bootstrap` — `Authorization: Bearer BOOTSTRAP_SECRET` → `{device_id, token, name}`
- Consumes: `settings.bootstrap_secret`

- [ ] **Step 1: Failing test yaz**

`backend/tests/test_bootstrap.py` olustur:

```python
import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.main import create_app

client = TestClient(create_app())


def test_bootstrap_creates_device():
    with patch("app.routers.devices.settings") as mock_settings, \
         patch("app.routers.devices.get_db") as mock_get_db:
        mock_settings.bootstrap_secret = "test-secret"
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None
        mock_get_db.return_value = iter([mock_db])

        resp = client.post(
            "/api/devices/bootstrap",
            json={"name": "Jetson-Test"},
            headers={"Authorization": "Bearer test-secret"},
        )
    assert resp.status_code == 201
    data = resp.json()
    assert "device_id" in data
    assert "token" in data


def test_bootstrap_rejects_wrong_secret():
    with patch("app.routers.devices.settings") as mock_settings:
        mock_settings.bootstrap_secret = "correct-secret"
        resp = client.post(
            "/api/devices/bootstrap",
            json={"name": "Jetson-Test"},
            headers={"Authorization": "Bearer wrong-secret"},
        )
    assert resp.status_code == 401


def test_bootstrap_rejects_empty_secret():
    with patch("app.routers.devices.settings") as mock_settings:
        mock_settings.bootstrap_secret = ""
        resp = client.post(
            "/api/devices/bootstrap",
            json={"name": "Jetson-Test"},
            headers={"Authorization": "Bearer anything"},
        )
    assert resp.status_code == 403
```

- [ ] **Step 2: Test calistir — fail beklenir**

```bash
cd backend
pytest tests/test_bootstrap.py -v
```

- [ ] **Step 3: Bootstrap endpoint'i devices.py'ye ekle**

`backend/app/routers/devices.py` dosyasinin import bloguna ekle:

```python
import secrets as _secrets
import hashlib
from app.config import settings
from app.core.security import hash_token
```

Endpoint ekle (router taniminin hemen altina):

```python
class BootstrapIn(BaseModel):
    name: str


class BootstrapOut(BaseModel):
    device_id: str
    token: str
    name: str


@router.post("/devices/bootstrap", response_model=BootstrapOut, status_code=201)
def bootstrap_device(
    body: BootstrapIn,
    db: DbSession,
    authorization: Annotated[str | None, Header()] = None,
):
    if not settings.bootstrap_secret:
        raise HTTPException(status_code=403, detail="Bootstrap kaydi devre disi")
    presented = (authorization or "").removeprefix("Bearer ").strip()
    if not hmac.compare_digest(presented.encode(), settings.bootstrap_secret.encode()):
        raise HTTPException(status_code=401, detail="Gecersiz bootstrap secret")

    token = _secrets.token_hex(32)
    device = Device(
        name=body.name,
        device_token="",
        token_hash=hash_token(token),
        registered_via_bootstrap=True,
    )
    db.add(device)
    db.commit()
    db.refresh(device)
    return BootstrapOut(device_id=str(device.id), token=token, name=device.name)
```

`hmac` import'u eksikse en uste ekle: `import hmac`

- [ ] **Step 4: Testleri calistir — pass beklenir**

```bash
pytest tests/test_bootstrap.py -v
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/routers/devices.py backend/tests/test_bootstrap.py
git commit -m "feat(api): jetson bootstrap endpoint (POST /api/devices/bootstrap)"
```

---

## Task 6: Camera Discovery + CRUD Endpointleri

**Files:**
- Create: `backend/app/routers/cameras.py`
- Create: `backend/tests/test_cameras.py`
- Modify: `backend/app/main.py`
- Modify: `backend/app/routers/groups.py`

**Interfaces:**
- Produces: `POST /api/devices/{device_id}/cameras` — device token auth, kamera kesif bildirimi
- Produces: `GET /api/devices/{device_id}/cameras` — o Jetson'un kamera listesi
- Produces: `PATCH /api/cameras/{cam_id}` — superadmin, name/group_id guncelle
- Produces: `DELETE /api/cameras/{cam_id}` — superadmin
- Modifies: `POST /api/groups` — il_id, ilce_id, mahalle_id zorunlu hale gelir

- [ ] **Step 1: Failing test yaz**

`backend/tests/test_cameras.py` olustur:

```python
import pytest
import uuid
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from app.main import create_app

client = TestClient(create_app())

DEVICE_ID = str(uuid.uuid4())


def make_camera(cam_id=None, name="Kamera 1", rtsp_url="rtsp://192.168.1.100:554/stream",
                device_id=None, group_id=None, is_online=True):
    m = MagicMock()
    m.id = cam_id or uuid.uuid4()
    m.name = name
    m.rtsp_url = rtsp_url
    m.device_id = uuid.UUID(device_id) if device_id else uuid.uuid4()
    m.group_id = group_id
    m.is_online = is_online
    m.last_seen_at = None
    m.created_at = None
    return m


def test_device_cameras_discovery_creates_new():
    with patch("app.routers.cameras.get_db") as mock_get_db, \
         patch("app.routers.cameras.require_device_auth") as mock_auth:
        mock_auth.return_value = DEVICE_ID
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.first.return_value = None
        mock_get_db.return_value = iter([mock_db])

        resp = client.post(
            f"/api/devices/{DEVICE_ID}/cameras",
            json=[{"name": "Kamera 1", "rtsp_url": "rtsp://192.168.1.100:554/stream"}],
            headers={"Authorization": f"Bearer token"},
        )
    assert resp.status_code == 200


def test_get_device_cameras():
    cam = make_camera(device_id=DEVICE_ID)
    with patch("app.routers.cameras.get_db") as mock_get_db, \
         patch("app.routers.cameras.require_auth"):
        mock_db = MagicMock()
        mock_db.query.return_value.filter.return_value.all.return_value = [cam]
        mock_get_db.return_value = iter([mock_db])
        resp = client.get(f"/api/devices/{DEVICE_ID}/cameras")
    assert resp.status_code == 200
    assert len(resp.json()) == 1
```

- [ ] **Step 2: Test calistir — fail beklenir**

```bash
cd backend
pytest tests/test_cameras.py -v
```

- [ ] **Step 3: cameras.py router yaz**

`backend/app/routers/cameras.py` olustur:

```python
import uuid
from datetime import datetime
from typing import Annotated
from fastapi import APIRouter, Depends, Header, HTTPException, Path
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_db, DbSession, require_device_auth
from app.core.auth import require_auth
from app.models.camera import Camera
from app.models.device import Device

router = APIRouter(prefix="/api", tags=["cameras"])


class CameraDiscoveryItem(BaseModel):
    name: str
    rtsp_url: str


class CameraOut(BaseModel):
    id: uuid.UUID
    name: str
    rtsp_url: str
    device_id: uuid.UUID
    group_id: int | None
    is_online: bool
    last_seen_at: datetime | None
    model_config = {"from_attributes": True}


class CameraPatchIn(BaseModel):
    name: str | None = None
    group_id: int | None = None


@router.post("/devices/{device_id}/cameras", status_code=200)
def report_cameras(
    device_id: Annotated[str, Path()],
    body: list[CameraDiscoveryItem],
    db: DbSession,
    _dev: Annotated[str, Depends(require_device_auth)],
):
    """Jetson tarafindan cagrilir — bulunan kameralari bildirir."""
    dev_uuid = uuid.UUID(device_id)
    now = datetime.utcnow()

    # Mevcut kameralarin URL'lerini al
    existing = {
        c.rtsp_url: c
        for c in db.query(Camera).filter(Camera.device_id == dev_uuid).all()
    }
    reported_urls = {item.rtsp_url for item in body}

    # Yeni kameralari ekle, mevcut olanlari guncelle
    for item in body:
        if item.rtsp_url in existing:
            cam = existing[item.rtsp_url]
            cam.is_online = True
            cam.last_seen_at = now
        else:
            cam = Camera(
                name=item.name,
                rtsp_url=item.rtsp_url,
                device_id=dev_uuid,
                is_online=True,
                last_seen_at=now,
            )
            db.add(cam)

    # Bu raporda bulunmayan eski kameralari offline yap
    for url, cam in existing.items():
        if url not in reported_urls:
            cam.is_online = False

    db.commit()
    return {"updated": len(body)}


@router.get("/devices/{device_id}/cameras", response_model=list[CameraOut])
def get_device_cameras(
    device_id: Annotated[str, Path()],
    db: DbSession,
    _: Annotated[str, Depends(require_auth)],
):
    dev_uuid = uuid.UUID(device_id)
    return db.query(Camera).filter(Camera.device_id == dev_uuid).all()


@router.patch("/cameras/{cam_id}", response_model=CameraOut)
def patch_camera(
    cam_id: uuid.UUID,
    body: CameraPatchIn,
    db: DbSession,
    _: Annotated[str, Depends(require_auth)],
):
    cam = db.query(Camera).filter(Camera.id == cam_id).first()
    if cam is None:
        raise HTTPException(status_code=404, detail="Kamera bulunamadi")
    if body.name is not None:
        cam.name = body.name
    if body.group_id is not None:
        cam.group_id = body.group_id
    db.commit()
    db.refresh(cam)
    return cam


@router.delete("/cameras/{cam_id}", status_code=204)
def delete_camera(
    cam_id: uuid.UUID,
    db: DbSession,
    _: Annotated[str, Depends(require_auth)],
):
    cam = db.query(Camera).filter(Camera.id == cam_id).first()
    if cam is None:
        raise HTTPException(status_code=404, detail="Kamera bulunamadi")
    db.delete(cam)
    db.commit()
```

- [ ] **Step 4: main.py'ye ekle**

```python
from app.routers.cameras import router as cameras_router
# ...
app.include_router(cameras_router)
```

- [ ] **Step 5: groups.py'de location zorunlu yap**

`backend/app/routers/groups.py` dosyasindaki group olusturma Pydantic modelini bul ve guncelle:

```python
class GroupCreateIn(BaseModel):
    name: str
    il_id: int
    ilce_id: int
    mahalle_id: int
```

Create endpoint'inde bu alanlari CameraGroup objesine ekle:

```python
group = CameraGroup(
    name=body.name,
    device_id="",  # artik kamera bazinda device_id var
    il_id=body.il_id,
    ilce_id=body.ilce_id,
    mahalle_id=body.mahalle_id,
    camera_uris=[],
)
```

- [ ] **Step 6: Testleri calistir — pass beklenir**

```bash
pytest tests/test_cameras.py -v
```

- [ ] **Step 7: Commit**

```bash
git add backend/app/routers/cameras.py backend/tests/test_cameras.py backend/app/main.py backend/app/routers/groups.py
git commit -m "feat(api): kamera kesif bildirimi ve CRUD endpointleri"
```

---

## Task 7: Relay Stream WebSocket

**Files:**
- Create: `relay/stream_hub.py`
- Modify: `relay/main.py`

**Interfaces:**
- Produces: `WebSocket /stream/{device_id}/{cam_id}` — browser canli stream baglar
- Produces: `StreamHub.register_browser(device_id, cam_id, ws)` / `forward_to_browser(device_id, cam_id, data)`
- Consumes: relay/main.py'deki `manager.send()` (mevcut)

- [ ] **Step 1: StreamHub sinifini yaz**

`relay/stream_hub.py` olustur:

```python
import asyncio
from fastapi import WebSocket


class StreamHub:
    """Her (device_id, cam_id) cifti icin tarayici WebSocket baglantilarini yonetir."""

    def __init__(self):
        # key: (device_id, cam_id) -> WebSocket
        self._browsers: dict[tuple[str, str], WebSocket] = {}

    def register_browser(self, device_id: str, cam_id: str, ws: WebSocket):
        self._browsers[(device_id, cam_id)] = ws

    def unregister_browser(self, device_id: str, cam_id: str):
        self._browsers.pop((device_id, cam_id), None)

    def has_viewer(self, device_id: str, cam_id: str) -> bool:
        return (device_id, cam_id) in self._browsers

    async def forward_to_browser(self, device_id: str, cam_id: str, data: str):
        ws = self._browsers.get((device_id, cam_id))
        if ws:
            try:
                await ws.send_text(data)
            except Exception:
                self.unregister_browser(device_id, cam_id)
```

- [ ] **Step 2: relay/main.py'yi guncelle**

Dosyanin basina import ekle:

```python
from .stream_hub import StreamHub
```

`pairing = PairingService()` satirinin altina ekle:

```python
stream_hub = StreamHub()
```

`agent_endpoint` WebSocket handler icinde `ch >= 2` blogunu guncelle — frame mesajlarini StreamHub'a ilet:

```python
elif ch == 3 and device_id:
    cam_id = msg.get("cam_id", "")
    if cam_id:
        await stream_hub.forward_to_browser(device_id, cam_id, raw)
    else:
        await terminal_hub.forward_to_browser(device_id, ch, raw)

elif ch >= 2 and device_id:
    await terminal_hub.forward_to_browser(device_id, ch, raw)
```

Not: Mevcut `ch >= 2` blogunu yukaridaki iki blok ile degistir.

Dosyanin sonuna yeni WebSocket endpoint ekle:

```python
@app.websocket("/stream/{device_id}/{cam_id}")
async def stream_endpoint(ws: WebSocket, device_id: str, cam_id: str):
    """Tarayici canli stream icin buna baglanir."""
    await ws.accept()
    if not manager.is_online(device_id):
        await ws.close(code=4004, reason="Cihaz cevrimdisi")
        return

    stream_hub.register_browser(device_id, cam_id, ws)
    # Jetson'a stream baslatma komutu gonder
    await manager.send(device_id, {
        "ch": 3,
        "type": "stream_start",
        "cam_id": cam_id,
    })
    try:
        async for _ in ws.iter_text():
            pass  # tarayicidan mesaj beklenmez
    except Exception:
        pass
    finally:
        stream_hub.unregister_browser(device_id, cam_id)
        # Jetson'a durdurma komutu gonder
        try:
            await manager.send(device_id, {
                "ch": 3,
                "type": "stream_stop",
                "cam_id": cam_id,
            })
        except Exception:
            pass
```

- [ ] **Step 3: ConnectionManager.is_online() metodunu ekle**

`relay/connection_mgr.py` dosyasina ekle:

```python
def is_online(self, device_id: str) -> bool:
    return device_id in self._connections
```

(Mevcut `online_devices()` metodunu kontrol et, varsa pattern'e uy.)

- [ ] **Step 4: Docker ile test et**

```bash
docker compose up -d relay
# relay loglarini izle
docker compose logs relay -f
```

Beklenen: uvicorn basarili sekilde baslar.

- [ ] **Step 5: Commit**

```bash
git add relay/stream_hub.py relay/main.py relay/connection_mgr.py
git commit -m "feat(relay): canli stream WebSocket endpointi (/stream/{device_id}/{cam_id})"
```

---

## Task 8: Agent Bootstrap + Kamera Kesif Bildirimi

**Files:**
- Modify: `new_guardwatch/agent/config.py`
- Modify: `new_guardwatch/agent/main.py`
- Modify: `new_guardwatch/installer/bootstrap.sh`

**Interfaces:**
- Consumes: `BOOTSTRAP_SECRET`, `BACKEND_URL` env degiskenleri
- Produces: `POST /api/devices/bootstrap` → token'i `/etc/guardwatch/device.json`'a yazar
- Produces: Her 5 dakikada `POST /api/devices/{device_id}/cameras` cagrisı

- [ ] **Step 1: config.py'ye yeni alanlar ekle**

`new_guardwatch/agent/config.py` dosyasindaki `AgentConfig` classina ekle:

```python
bootstrap_secret: str = ""
backend_url: str = "http://localhost:8000"
```

`_parse_conf` fonksiyonu bu alanlari okuyorsa (BOOTSTRAP_SECRET, BACKEND_URL), onceden dolu olan key mapinde ekle. Eger dosya basit `key=value` parse ediyorsa:

```python
# _parse_conf icindeki mapping'e ekle:
"BOOTSTRAP_SECRET": "bootstrap_secret",
"BACKEND_URL": "backend_url",
```

- [ ] **Step 2: main.py'ye bootstrap akisini ekle**

`new_guardwatch/agent/main.py` — `main()` fonksiyonunun basina `_bootstrap_if_needed()` cagrisini ekle:

```python
import json
import httpx

TOKEN_PATH = "/etc/guardwatch/device.json"
DEVICE_ID_PATH = "/etc/guardwatch/device_id"


async def _bootstrap_if_needed(cfg: AgentConfig) -> tuple[str, str | None]:
    """
    device.json varsa (device_id, token) doner.
    Yoksa ve bootstrap_secret varsa backend'e kayit yapar, kaydeder.
    """
    if os.path.exists(TOKEN_PATH):
        data = json.loads(open(TOKEN_PATH).read())
        return data["device_id"], data.get("token")

    device_id = get_or_create_device_id()

    if not cfg.bootstrap_secret:
        logger.info("Bootstrap secret yok — pairing kodu ile devam")
        return device_id, None

    logger.info("Bootstrap kaydi baslatiliyor -> %s", cfg.backend_url)
    import socket
    hostname = socket.gethostname()
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(
                f"{cfg.backend_url}/api/devices/bootstrap",
                json={"name": hostname},
                headers={"Authorization": f"Bearer {cfg.bootstrap_secret}"},
                timeout=10.0,
            )
            resp.raise_for_status()
            data = resp.json()
            os.makedirs(os.path.dirname(TOKEN_PATH), exist_ok=True)
            with open(TOKEN_PATH, "w") as f:
                json.dump(data, f)
            # device_id dosyasini da guncelle
            with open(DEVICE_ID_PATH, "w") as f:
                f.write(data["device_id"])
            logger.info("Bootstrap tamamlandi — device_id: %s", data["device_id"])
            return data["device_id"], data["token"]
        except Exception as exc:
            logger.error("Bootstrap basarisiz: %s — pairing ile devam", exc)
            return device_id, None
```

`main()` fonksiyonunun basina cagri ekle:

```python
async def main(conf_path: str) -> None:
    cfg: AgentConfig = load_conf(conf_path)
    device_id, token = await _bootstrap_if_needed(cfg)
    # mevcut: token = load_token(TOKEN_PATH) satirini kaldir
```

- [ ] **Step 3: Kamera kesif bildirimini main.py'ye ekle**

`config_watcher_loop` icinde kamera kesfi yapildiktan sonra backend'e bildir:

```python
async def _report_cameras_to_backend(cfg: AgentConfig, device_id: str, cameras: list[str], token: str | None):
    if not token or not cfg.backend_url:
        return
    payload = [
        {"name": f"Kamera {i+1}", "rtsp_url": url}
        for i, url in enumerate(cameras)
    ]
    async with httpx.AsyncClient() as client:
        try:
            await client.post(
                f"{cfg.backend_url}/api/devices/{device_id}/cameras",
                json=payload,
                headers={"Authorization": f"Bearer {token}"},
                timeout=5.0,
            )
        except Exception as exc:
            logger.warning("Kamera bildirimi basarisiz: %s", exc)
```

`start_cameras` fonksiyonu kamera listesini dondurecek sekilde guncelle ve `_report_cameras_to_backend` cagir.

- [ ] **Step 4: bootstrap.sh'e yeni degiskenler ekle**

`new_guardwatch/installer/bootstrap.sh` — parametre parse bloguna ekle:

```bash
--backend)     BACKEND_URL="$2";      shift 2 ;;
--bsecret)     BOOTSTRAP_SECRET="$2"; shift 2 ;;
```

Config yazma blogunda (cat > EOF) ekle:

```bash
BACKEND_URL=${BACKEND_URL:-http://localhost:8000}
BOOTSTRAP_SECRET=${BOOTSTRAP_SECRET:-}
```

Systemd service'e environment degiskeni ekle:

```
Environment=BOOTSTRAP_SECRET=${BOOTSTRAP_SECRET}
Environment=BACKEND_URL=${BACKEND_URL}
```

- [ ] **Step 5: Commit**

```bash
git add new_guardwatch/agent/config.py new_guardwatch/agent/main.py new_guardwatch/installer/bootstrap.sh
git commit -m "feat(agent): bootstrap akisi ve kamera kesif bildirimi"
```

---

## Task 9: Agent Canli Stream Encoding

**Files:**
- Create: `new_guardwatch/agent/stream.py`
- Modify: `new_guardwatch/agent/main.py`

**Interfaces:**
- Consumes: relay'den `{"ch": 3, "type": "stream_start", "cam_id": str}` mesaji
- Produces: relay'e `{"ch": 3, "type": "frame", "cam_id": str, "data": "<base64>"}` mesajlari
- Produces: `CameraStreamer.start(cam_id, rtsp_url, send_fn)` / `.stop(cam_id)`

- [ ] **Step 1: stream.py olustur**

`new_guardwatch/agent/stream.py` olustur:

```python
import asyncio
import base64
import logging
import threading
from typing import Callable, Coroutine

logger = logging.getLogger("guardwatch.stream")

try:
    import cv2
    _CV2_AVAILABLE = True
except ImportError:
    _CV2_AVAILABLE = False
    logger.warning("opencv-python yuklu degil — stream devre disi")


class CameraStreamer:
    """Her aktif kamera icin bir thread'de RTSP okur, JPEG frame gonderir."""

    def __init__(self):
        self._streams: dict[str, threading.Thread] = {}
        self._stop_flags: dict[str, threading.Event] = {}

    def start(
        self,
        cam_id: str,
        rtsp_url: str,
        loop: asyncio.AbstractEventLoop,
        send_fn: Callable[[dict], Coroutine],
    ):
        if cam_id in self._streams:
            return
        if not _CV2_AVAILABLE:
            logger.warning("OpenCV yok, stream baslatilmiyor: %s", cam_id)
            return

        stop_flag = threading.Event()
        self._stop_flags[cam_id] = stop_flag

        def _run():
            cap = cv2.VideoCapture(rtsp_url)
            if not cap.isOpened():
                logger.error("RTSP acilamadi: %s", rtsp_url)
                return
            logger.info("Stream baslatildi: %s", rtsp_url)
            while not stop_flag.is_set():
                ret, frame = cap.read()
                if not ret:
                    logger.warning("Frame alinamadi: %s", rtsp_url)
                    stop_flag.wait(timeout=1.0)
                    continue
                # 640x480 resize + JPEG encode
                frame = cv2.resize(frame, (640, 480))
                _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 70])
                b64 = base64.b64encode(buf.tobytes()).decode("ascii")
                msg = {"ch": 3, "type": "frame", "cam_id": cam_id, "data": b64}
                asyncio.run_coroutine_threadsafe(send_fn(msg), loop)
                stop_flag.wait(timeout=0.067)  # ~15 FPS
            cap.release()
            logger.info("Stream durduruldu: %s", rtsp_url)

        t = threading.Thread(target=_run, daemon=True)
        self._streams[cam_id] = t
        t.start()

    def stop(self, cam_id: str):
        flag = self._stop_flags.pop(cam_id, None)
        if flag:
            flag.set()
        self._streams.pop(cam_id, None)

    def stop_all(self):
        for cam_id in list(self._stop_flags.keys()):
            self.stop(cam_id)
```

- [ ] **Step 2: main.py'ye stream handling ekle**

`new_guardwatch/agent/main.py` — `on_message` fonksiyonuna ekle:

```python
from .stream import CameraStreamer

# main() icinde streamer olustur:
streamer = CameraStreamer()

# on_message icine ekle (mevcut mtype kontrollerin yanina):
elif mtype == "stream_start":
    cam_id = msg.get("cam_id", "")
    # active_cameras icinde bu cam_id'ye karsilik gelen RTSP URL'i bul
    # active_cameras artik {rtsp_url: cam_id} olmali ya da ayri bir map tutulmali
    rtsp_url = _cam_id_to_rtsp.get(cam_id)
    if rtsp_url:
        loop = asyncio.get_event_loop()
        streamer.start(cam_id, rtsp_url, loop, tunnel.send)

elif mtype == "stream_stop":
    cam_id = msg.get("cam_id", "")
    streamer.stop(cam_id)
```

`_cam_id_to_rtsp: dict[str, str]` sozlugunu `discover_all` sonucunda `Camera` listesinden populate et. Camera UUID'leri backend'den geldiginden, discovery bildiriminin cevabini parse etmek gerekir:

```python
# _report_cameras_to_backend donus degeri:
async def _report_cameras_to_backend(...) -> dict[str, str]:
    """cam_id -> rtsp_url mapping doner."""
    resp = await client.post(...)
    # backend {cameras: [{id, rtsp_url}]} donerse parse et
    # Simdilik rtsp_url -> cam_id ters mapping sakla
```

Not: Backend `POST /api/devices/{id}/cameras` endpoint'i kamera listesini donus degerine eklemeli (Task 6'daki response'u guncelle: `{"updated": N, "cameras": [{id, rtsp_url}]}`).

- [ ] **Step 3: requirements guncelle**

`new_guardwatch/agent/requirements.txt` veya `pyproject.toml` dosyasina ekle:

```
opencv-python-headless>=4.8.0
httpx>=0.27.0
```

- [ ] **Step 4: Commit**

```bash
git add new_guardwatch/agent/stream.py new_guardwatch/agent/main.py
git commit -m "feat(agent): RTSP -> JPEG canli stream encoding (opencv)"
```

---

## Task 10: Frontend — Grup Formu Location Dropdown

**Files:**
- Modify: `frontend/src/app/dashboard/groups/page.tsx`

**Interfaces:**
- Consumes: `GET /api/locations/iller`, `/api/locations/ilceler?il_id=X`, `/api/locations/mahalleler?ilce_id=X`
- Produces: Grup olusturma formunda cascade il → ilce → mahalle dropdown

- [ ] **Step 1: Mevcut groups/page.tsx'i oku**

`frontend/src/app/dashboard/groups/page.tsx` dosyasini oku — mevcut form yapısını anla.

- [ ] **Step 2: Location state ve fetch ekle**

Dosyanin `useState` bloguna ekle:

```typescript
const [iller, setIller] = useState<{id: number; name: string}[]>([]);
const [ilceler, setIlceler] = useState<{id: number; name: string; il_id: number}[]>([]);
const [mahalleler, setMahalleler] = useState<{id: number; name: string; ilce_id: number}[]>([]);
const [form, setForm] = useState({
  name: "",
  il_id: 0,
  ilce_id: 0,
  mahalle_id: 0,
});
```

`useEffect` bloguna il listesi yuklemesini ekle:

```typescript
useEffect(() => {
  fetch("/api/locations/iller")
    .then((r) => r.json())
    .then(setIller)
    .catch(() => {});
}, []);
```

Il secildiginde ilceleri yukle:

```typescript
useEffect(() => {
  if (!form.il_id) return;
  fetch(`/api/locations/ilceler?il_id=${form.il_id}`)
    .then((r) => r.json())
    .then(setIlceler)
    .catch(() => {});
  setForm((f) => ({ ...f, ilce_id: 0, mahalle_id: 0 }));
  setIlceler([]);
  setMahalleler([]);
}, [form.il_id]);
```

Ilce secildiginde mahalleleri yukle:

```typescript
useEffect(() => {
  if (!form.ilce_id) return;
  fetch(`/api/locations/mahalleler?ilce_id=${form.ilce_id}`)
    .then((r) => r.json())
    .then(setMahalleler)
    .catch(() => {});
  setForm((f) => ({ ...f, mahalle_id: 0 }));
}, [form.ilce_id]);
```

- [ ] **Step 3: Form JSX'ine dropdown'lari ekle**

Mevcut form icine (name inputundan sonra) ekle:

```tsx
<select
  className="border rounded px-2 py-1 w-full"
  value={form.il_id}
  onChange={(e) => setForm((f) => ({ ...f, il_id: Number(e.target.value) }))}
  required
>
  <option value={0}>-- Il Secin --</option>
  {iller.map((il) => (
    <option key={il.id} value={il.id}>{il.name}</option>
  ))}
</select>

<select
  className="border rounded px-2 py-1 w-full"
  value={form.ilce_id}
  onChange={(e) => setForm((f) => ({ ...f, ilce_id: Number(e.target.value) }))}
  required
  disabled={!form.il_id}
>
  <option value={0}>-- Ilce Secin --</option>
  {ilceler.map((ilce) => (
    <option key={ilce.id} value={ilce.id}>{ilce.name}</option>
  ))}
</select>

<select
  className="border rounded px-2 py-1 w-full"
  value={form.mahalle_id}
  onChange={(e) => setForm((f) => ({ ...f, mahalle_id: Number(e.target.value) }))}
  required
  disabled={!form.ilce_id}
>
  <option value={0}>-- Mahalle Secin --</option>
  {mahalleler.map((m) => (
    <option key={m.id} value={m.id}>{m.name}</option>
  ))}
</select>
```

- [ ] **Step 4: createGroup fonksiyonunu guncelle**

```typescript
const createGroup = async () => {
  if (!form.il_id || !form.ilce_id || !form.mahalle_id) {
    alert("Il, ilce ve mahalle secimi zorunludur.");
    return;
  }
  await fetch("/api/groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: form.name,
      il_id: form.il_id,
      ilce_id: form.ilce_id,
      mahalle_id: form.mahalle_id,
    }),
  });
  // refresh...
};
```

- [ ] **Step 5: Tarayicida test et**

`http://localhost:3000/dashboard/groups` — yeni grup olusturma formunda:
- Il dropdown'u 81 il gostermeli
- Il secilince ilce dropdown'u dolmali
- Ilce secilince mahalle dropdown'u dolmali
- Eksik secimde submit engellenmeli

- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/dashboard/groups/page.tsx
git commit -m "feat(ui): grup formuna il/ilce/mahalle cascade dropdown"
```

---

## Task 11: Frontend — Kamera Yonetim Sayfasi (SuperAdmin)

**Files:**
- Modify: `frontend/src/app/dashboard/devices/[id]/page.tsx` (yoksa olustur)
- Create: `frontend/src/app/dashboard/groups/[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/devices/{id}/cameras`, `PATCH /api/cameras/{id}`, `DELETE /api/cameras/{id}`
- Consumes: `GET /api/groups` (grup listesi, kameralara grup atamak icin)

- [ ] **Step 1: Device detay sayfasini olustur/guncelle**

`frontend/src/app/dashboard/devices/[id]/page.tsx` dosyasi yoksa olustur (varsa guncelle):

```tsx
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Camera {
  id: string;
  name: string;
  rtsp_url: string;
  group_id: number | null;
  is_online: boolean;
}

interface Group {
  id: number;
  name: string;
}

export default function DevicePage({ params }: { params: { id: string } }) {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  useEffect(() => {
    fetch(`/api/devices/${params.id}/cameras`)
      .then((r) => r.json())
      .then(setCameras)
      .catch(() => {});
    fetch("/api/groups")
      .then((r) => r.json())
      .then(setGroups)
      .catch(() => {});
  }, [params.id]);

  const assignGroup = async (camId: string, groupId: number | null) => {
    await fetch(`/api/cameras/${camId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: groupId }),
    });
    setCameras((prev) =>
      prev.map((c) => (c.id === camId ? { ...c, group_id: groupId } : c))
    );
  };

  const deleteCamera = async (camId: string) => {
    if (!confirm("Kamerayi silmek istediginizden emin misiniz?")) return;
    await fetch(`/api/cameras/${camId}`, { method: "DELETE" });
    setCameras((prev) => prev.filter((c) => c.id !== camId));
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Cihaz Kameralari</h1>
      <div className="space-y-3">
        {cameras.map((cam) => (
          <div key={cam.id} className="border rounded p-3 flex items-center justify-between">
            <div>
              <span className={`inline-block w-2 h-2 rounded-full mr-2 ${cam.is_online ? "bg-green-500" : "bg-gray-400"}`} />
              <span className="font-medium">{cam.name}</span>
              <span className="text-sm text-gray-500 ml-2">{cam.rtsp_url}</span>
            </div>
            <div className="flex gap-2 items-center">
              <select
                value={cam.group_id ?? ""}
                onChange={(e) => assignGroup(cam.id, e.target.value ? Number(e.target.value) : null)}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="">-- Grup Yok --</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <Link
                href={`/dashboard/devices/${params.id}/stream/${cam.id}`}
                className="bg-blue-600 text-white px-3 py-1 rounded text-sm"
              >
                Canli Izle
              </Link>
              <button
                onClick={() => deleteCamera(cam.id)}
                className="bg-red-500 text-white px-3 py-1 rounded text-sm"
              >
                Sil
              </button>
            </div>
          </div>
        ))}
        {cameras.length === 0 && (
          <p className="text-gray-500">Henuz kamera bulunamadi. Jetson'u baslatin.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Tarayicida test et**

`http://localhost:3000/dashboard/devices/{DEVICE_UUID}` — kamera listesi, grup atama dropdown ve silme butonu gorunmeli.

- [ ] **Step 3: Commit**

```bash
git add "frontend/src/app/dashboard/devices/[id]/page.tsx"
git commit -m "feat(ui): device detay sayfasi — kamera listesi ve grup atama"
```

---

## Task 12: Frontend — Canli Stream Canvas Sayfasi

**Files:**
- Create: `frontend/src/components/LiveStream.tsx`
- Create: `frontend/src/app/dashboard/devices/[id]/stream/[camId]/page.tsx`

**Interfaces:**
- Consumes: relay WebSocket `wss://RELAY/stream/{device_id}/{cam_id}`
- Consumes: `NEXT_PUBLIC_WS_URL` env degiskeni (ws://localhost:8765)
- Produces: `<LiveStream deviceId relayUrl camId />` component — canvas'ta JPEG render

- [ ] **Step 1: LiveStream component yaz**

`frontend/src/components/LiveStream.tsx` olustur:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  deviceId: string;
  camId: string;
  relayUrl: string;
}

export function LiveStream({ deviceId, camId, relayUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "error">("connecting");

  useEffect(() => {
    const wsUrl = `${relayUrl}/stream/${deviceId}/${camId}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => setStatus("connecting");

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "frame" && msg.data) {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          const img = new Image();
          img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            ctx.drawImage(img, 0, 0);
            setStatus("live");
          };
          img.src = `data:image/jpeg;base64,${msg.data}`;
        }
      } catch {
        // ignore parse errors
      }
    };

    ws.onerror = () => setStatus("error");
    ws.onclose = () => setStatus("error");

    return () => {
      ws.close();
    };
  }, [deviceId, camId, relayUrl]);

  return (
    <div className="relative bg-black rounded overflow-hidden">
      {status === "connecting" && (
        <div className="absolute inset-0 flex items-center justify-center text-white text-sm">
          Baglaniliyor...
        </div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center text-red-400 text-sm">
          Baglanti kesildi
        </div>
      )}
      <canvas ref={canvasRef} className="w-full h-auto" />
    </div>
  );
}
```

- [ ] **Step 2: Stream sayfasini olustur**

`frontend/src/app/dashboard/devices/[id]/stream/[camId]/page.tsx` olustur:

```tsx
import { LiveStream } from "@/components/LiveStream";

const RELAY_WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8765";

export default function StreamPage({
  params,
}: {
  params: { id: string; camId: string };
}) {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Canli Goruntu</h1>
      <LiveStream
        deviceId={params.id}
        camId={params.camId}
        relayUrl={RELAY_WS_URL}
      />
    </div>
  );
}
```

- [ ] **Step 3: Tarayicida test et**

Relay, Jetson agent ve gercek RTSP kamera ile:
1. `http://localhost:3000/dashboard/devices/{device_id}/stream/{cam_id}` ac
2. "Baglaniliyor..." gorulmeli
3. Jetson RTSP kamera bulduktaysa frame'ler gelmeli ve canvas'ta gozukmeli

Jetson olmadan: relay log'unda "stream_start" mesaji gozukmeli.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/LiveStream.tsx "frontend/src/app/dashboard/devices/[id]/stream/[camId]/page.tsx"
git commit -m "feat(ui): canli stream canvas sayfasi (JPEG over WebSocket)"
```

---

## Task 13: Frontend — Kullanici/Grup Atama UI

**Files:**
- Modify: `frontend/src/app/dashboard/users/page.tsx` veya yeni `[id]/page.tsx`

**Interfaces:**
- Consumes: `GET /api/users`, `GET /api/groups`, `PUT /api/users/{id}` (group_ids guncelleme)
- Produces: Kullanici listesinde her kullanici icin grup atama

- [ ] **Step 1: Backend users endpoint'inin group_ids guncellemeyi destekledigini dogrula**

`backend/app/routers/users.py` dosyasinda PUT/PATCH endpoint'ini kontrol et. Yoksa ekle:

```python
class UserUpdateIn(BaseModel):
    group_ids: list[int] | None = None
    role_id: int | None = None

@router.patch("/users/{user_id}")
def update_user(
    user_id: int,
    body: UserUpdateIn,
    db: DbSession,
    _: Annotated[str, Depends(require_auth)],
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "Kullanici bulunamadi")
    if body.group_ids is not None:
        user.group_ids = body.group_ids
    if body.role_id is not None:
        user.role_id = body.role_id
    db.commit()
    db.refresh(user)
    return user
```

- [ ] **Step 2: Frontend kullanici listesine grup atama ekle**

`frontend/src/app/dashboard/users/page.tsx` dosyasinda her kullanici icin grup atama dropdown'u ekle:

```tsx
// Gruplar yukle
const [groups, setGroups] = useState<{id: number; name: string}[]>([]);
useEffect(() => {
  fetch("/api/groups").then(r => r.json()).then(setGroups).catch(() => {});
}, []);

// Grup atama fonksiyonu
const assignGroups = async (userId: number, groupId: number) => {
  const user = users.find(u => u.id === userId);
  if (!user) return;
  const current: number[] = user.group_ids ?? [];
  const updated = current.includes(groupId)
    ? current.filter((g: number) => g !== groupId)
    : [...current, groupId];
  await fetch(`/api/users/${userId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ group_ids: updated }),
  });
  setUsers(prev => prev.map(u =>
    u.id === userId ? { ...u, group_ids: updated } : u
  ));
};
```

Her kullanici satirinda grup secim checkbox listesi goster:

```tsx
<div className="flex flex-wrap gap-1 mt-1">
  {groups.map((g) => (
    <label key={g.id} className="flex items-center gap-1 text-sm cursor-pointer">
      <input
        type="checkbox"
        checked={(user.group_ids ?? []).includes(g.id)}
        onChange={() => assignGroups(user.id, g.id)}
      />
      {g.name}
    </label>
  ))}
</div>
```

- [ ] **Step 3: Tarayicida test et**

`http://localhost:3000/dashboard/users` — her kullanici icin grup checkbox listesi gozukmeli. Checkbox tiklayinca API cagrilmali.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/dashboard/users/page.tsx backend/app/routers/users.py
git commit -m "feat(ui): kullanicilara grup atama checkbox UI"
```

---

## Tamamlanma Kriterleri

- [ ] `alembic upgrade head` hatasiz calisiyor
- [ ] `pytest backend/tests/` gec
- [ ] Jetson'da `bootstrap.sh --backend http://PC_IP:8000 --bsecret SECRET` calisiyor, device.json olusturuluyor
- [ ] Jetson agent kameralari bildiriyor, `/dashboard/devices/{id}` sayfasinda gorunuyor
- [ ] Grup olusturma formunda il/ilce/mahalle secimi zorunlu calisyor
- [ ] SuperAdmin kameralara grup atayabiliyor
- [ ] Canli stream sayfasinda JPEG frame'ler canvas'ta gorunuyor
- [ ] Normal kullanici yalnizca kendi gruplarinin kameralarini gorüyor
