# Guardwatch Fleet Management Panel — Tasarım Dokümanı

**Tarih:** 2026-05-03
**Hedef:** Çoklu Jetson Nano (kenar cihazları) + merkezi web admin panel + offline-first agent + canlı stream
**Bağlam:** Mevcut `guardwatch_ds.py` (DeepStream + YOLO + MediaPipe + PERCLOS) tek Jetson'da çalışıyor; üzerine fleet management katmanı eklenecek

---

## 1. Hedef ve Kısıtlar

| Konu | Değer |
|---|---|
| Proje türü | Gerçek müşteri / saha kullanımı |
| MVP ölçek | 1–5 Jetson cihazı (pilot) |
| Geliştirici sayısı | 1 (solo) |
| Takvim | 2–3 hafta — çalışan demo |
| Deploy hedefi | Henüz karar yok; v1 lokal Docker, v1.5 VPS'e taşınacak |
| Kritik gereksinim | **Jetson tespit motoru internet olmadan çalışmaya devam etmeli** (mevcut davranış korunacak) |

---

## 2. Mimari (yüksek seviye)

```
┌────────────────────┐         ┌────────────────────┐         ┌─────────────────┐
│ JETSON NANO        │         │ BACKEND (VPS)      │         │ WEB PANEL       │
│                    │         │                    │         │                 │
│ guardwatch_ds.py   │         │ FastAPI            │         │ Login           │
│  (mevcut, offline) │         │  /auth /devices    │         │ Dashboard       │
│        │           │         │  /events /ws/panel │ ──WS──▶ │ Toast + image   │
│        ▼           │         │                    │         │                 │
│ agent.py           │         │ DeviceConnector    │         │ <video> HLS  ──┐│
│  ├ HTTP+WS server  │ ◀──WS───┤ (her cihaz için    │         │                ││
│  ├ SQLite queue    │ ◀──HTTP─┤  persistent client)│         │                ││
│  │  (offline buf.) │         │                    │         │                ││
│  └ MediaMTX :8554  │         │  Postgres          │         │                ││
│                    │         │  ./uploads (disk)  │         │                ││
│ cloudflared        │ ──── jetson-X.fleet.x ────────────────────────────────────┘
│  (stable URL)      │
└────────────────────┘         └────────────────────┘         └─────────────────┘
```

**Anahtar mimari kararlar:**

1. **Bağlantı yönü: Backend → Jetson.** Panel'de "URL paste → bağlan" UX hedefi için backend, Jetson'a outgoing WebSocket açar. Reverse-WS modeli (Jetson backend'e bağlanır) yerine bu seçildi çünkü kullanıcı API key'i Jetson'a manuel kopyalamak istemiyor.

2. **Cloudflared zorunlu.** Her Jetson'da named tunnel ile stabil public URL (`jetson-<uuid>.fleet.example.com`). Bu URL hem WS hem stream için tek giriş noktası. CGNAT/4G arkasındaki Jetson'a panelden erişimi mümkün kılan tek pratik çözüm.

3. **Offline-first agent.** Internet kopunca agent'ın tek görevi yerel SQLite queue'ya yazmak. `guardwatch_ds.py` agent'a bağımlı değil, ayrı systemd unit; biri çökse diğeri çalışır.

4. **Mevcut tespit motoruna dokunulmaz.** Agent integration file-based: `app.log` tail + `kayitlar/` watch. Bu sayede mevcut kod hiç değişmeden fleet katmanı eklenir.

5. **Stream backend'den geçmez.** Panel direkt `https://jetson-X.fleet.x/stream.m3u8` üzerinden alır. Backend sadece URL'yi proxy'ler değil, sahibi olarak bilgi tutar. Bu pilot ölçekte bile bandwidth maliyetini patlatmaz.

6. **DB stratejisi:** Postgres baştan itibaren (Docker Compose dev + prod). Alembic migration Faz 0'da kurulu. Dev/prod parity ile geç entegrasyon riskini ortadan kaldırıyor; 1 vCPU VPS'te 1-5 cihaz pilot için zaten yeter. (Agent tarafında SQLite kullanılır — bu offline queue içindir, backend'in DB'siyle karıştırılmamalı.)

---

## 3. Fazlar (Yaklaşım A: Dikey ince dilim)

Her faz sonu = demo edilebilir bir şey. Solo dev için sekansiyel.

### Faz 0 — Skeleton (2 gün)
**Çıktı:** `docker compose up` → 3 servis ayakta, `localhost:3000` Next.js açılıyor, `localhost:8000/health` 200, agent stub `print("connected")` ediyor.
**Teslim:**
- Monorepo iskeleti (`backend/`, `frontend/`, `agent/`)
- Docker Compose dev (postgres + backend + frontend)
- `.env.example`, README
- pre-commit hooks (ruff, eslint, prettier)
- pytest + httpx skeleton; `npm test` boş ama çalışıyor

### Faz 1 — Auth + Cihaz CRUD + Heartbeat (4 gün)
**Çıktı:** Login → dashboard → cihaz ekle (URL paste) → 30 sn'de yeşil kart, fişten çek → 30 sn'de kırmızı.
**Teslim:**
- **Backend:**
  - `POST /auth/login`, `GET /auth/me`, `POST /auth/refresh`, `POST /auth/logout`
  - `POST /devices`, `GET /devices`, `GET /devices/:id`, `DELETE /devices/:id`
  - WS `/ws/panel` (panel push channel)
  - `DeviceConnector`: her cihaz için outgoing WS havuzu, exponential backoff (1→60s)
  - DB: `users`, `devices`, `sessions` tabloları + Alembic migration
- **Frontend:**
  - `/login` sayfası (form validation, lockout UI)
  - `/dashboard` cihaz kart grid + KPI üst bar
  - "Yeni Cihaz Ekle" modal (3 alan: ad/bölge/URL)
  - Online/offline rozeti gerçek zamanlı (WS)
- **Agent:**
  - Cloudflared kurulumu (`install_agent.sh`)
  - Minimal HTTP+WS server (FastAPI veya aiohttp)
  - `GET /api/info` (token doğrulama)
  - WS `/ws` (heartbeat 10s)
- **Acceptance:**
  - Sıfır Jetson'a `install_agent.sh` çalıştır → public URL al → panele yapıştır → 5 sn içinde kart yeşil
  - Jetson'u fişten çek → 30 sn içinde panel kart kırmızı

### Faz 2 — İhlal Akışı (4 gün) — **EN KRİTİK FAZ**
**Çıktı:** Jetson'da uyku tespit → 3 sn içinde panelde toast + screenshot.
**Teslim:**
- **Agent:**
  - `app.log` tail (watchdog) + `kayitlar/` dizin izleme
  - SQLite queue: `events(id, type, occurred_at, screenshot_path, synced)`
  - Backend ulaşılabilirken push, ulaşılmazsa sessizce queue'da bırak
  - WAL modu (concurrent read/write)
- **Backend:**
  - `POST /devices/:id/events` (multipart: JSON + screenshot)
  - `GET /devices/:id/events?since=<agent_event_id>` (replay)
  - `events` tablosu + `(device_id, agent_event_id)` UNIQUE (idempotency)
  - Disk storage: `./uploads/<device_id>/<event_id>.jpg`
  - WS broadcast → `/ws/panel`: `{type: "event_created", payload: {...}}`
- **Frontend:**
  - Toast (sonner) — sol alt, küçük thumbnail + tür + "İncele"
  - Dashboard sağ panel: son 10 ihlal canlı liste
  - Screenshot lightbox (full-screen modal)
- **Acceptance:**
  - Internet kesik → 5 ihlal birik → internet gelince hepsi panelde sırayla görünüyor (idempotent, sıralı)
  - Aynı `agent_event_id` iki kez gelirse 1 row (test)

### Faz 3 — Olay Geçmişi (2 gün)
**Çıktı:** Tarihe/cihaza/türe filtrelenebilir global olay listesi.
**Teslim:**
- **Backend:** `GET /events?device=&type=&from=&to=&page=&limit=`
- **Frontend:**
  - `/events` sayfası: filtre çubuğu, tablo, pagination
  - "Bugün/Son 1 saat/Bu hafta" hızlı butonları
  - Cihaz detay sayfasına link
- **Acceptance:** 100+ olay arasında 2 tıkla istenen güne ulaşılıyor

### Faz 4 — Canlı Stream (2 gün)
**Çıktı:** Cihaz detayında "Canlı İzle" → 2 sn'de Jetson kamerası.
**Teslim:**
- **Jetson:**
  - MediaMTX kurulum scripti (HLS server :8888)
  - `guardwatch_ds.py` GStreamer pipeline'a tee branch (nvdsosd sonrası → MJPEG/HLS)
  - cloudflared ingress: `/stream/*` → MediaMTX
- **Backend:**
  - Stream URL'sini cihaz tablosundan dön (auth'lu)
- **Frontend:**
  - Cihaz detay sekme 2: `<video>` HLS player (hls.js)
  - "Aç/Kapat" butonu (sürekli açık değil → bandwidth tasarrufu)
- **Acceptance:** 4G'deki Jetson'a evden HTTPS ile <3 sn gecikmeli canlı bakılıyor

### Faz 5 — Deploy & Operasyon (2 gün)
**Çıktı:** Üretime alınmış sistem.
**Teslim:**
- VPS (1 vCPU yeter) + Docker Compose prod
- Caddy + Let's Encrypt (otomatik HTTPS)
- Backup/restore scripti (postgres pg_dump cron)
- systemd unit'ları: `guardwatch.service`, `guardwatch-agent.service`, `cloudflared.service`
- `install_agent.sh` public dağıtım (curl | bash)
- 90+ gün screenshot temizleme cron
- Smoke test: sıfırdan VPS + sıfırdan Jetson → 30 sn'de bağlı
- **Acceptance:** Boş bir VPS'te tek `docker compose up -d` ile sistem ayakta; sıfır Jetson'da tek `curl ... | bash` ile cihaz hazır

**Toplam: 16 gün ≈ 3 hafta.** Sıkışırsa Faz 4 (stream) sonraya itilebilir — Faz 0-3 + 5 zaten satılabilir bir MVP.

---

## 4. Veri Modeli

```sql
-- Kullanıcı yönetimi
users
├ id              UUID PK
├ email           TEXT UNIQUE
├ password_hash   TEXT (bcrypt cost=12)
├ role            TEXT  ('admin' | 'viewer')
├ created_at      TIMESTAMP
└ last_login_at   TIMESTAMP NULL

-- Cihazlar
devices
├ id              UUID PK
├ name            TEXT          -- "Araç-07"
├ region          TEXT          -- "İstanbul / Anadolu"
├ public_url      TEXT UNIQUE   -- https://jetson-abc.fleet.example.com
├ device_token    TEXT          -- backend → agent auth (32 byte)
├ status          TEXT          -- 'online' | 'offline' | 'unknown'
├ last_seen_at    TIMESTAMP NULL
├ last_event_id   BIGINT NULL   -- replay için, agent SQLite tarafı id
├ created_at      TIMESTAMP
├ created_by      UUID FK→users
└ deleted_at      TIMESTAMP NULL  -- soft delete

-- Olaylar
events
├ id              BIGSERIAL PK
├ device_id       UUID FK→devices ON DELETE CASCADE
├ agent_event_id  BIGINT        -- idempotency: UNIQUE(device_id, agent_event_id)
├ type            TEXT          -- 'GOZ_KAPALI' | 'HAREKETSIZ' | 'UYUYOR' | 'TAKIP_KAYBEDILDI'
├ track_id        INT NULL
├ occurred_at     TIMESTAMP     -- Jetson saatinde olay anı
├ received_at     TIMESTAMP     -- backend alış anı (gecikme analizi)
├ screenshot_path TEXT NULL     -- ./uploads/<device_id>/<event_id>.jpg
├ metadata        JSONB         -- perclos, pitch, signal_src
└ INDEX (device_id, occurred_at DESC), INDEX (occurred_at DESC)

-- JWT revoke için
sessions
├ id              UUID PK
├ user_id         UUID FK→users
├ token_hash      TEXT          -- JWT jti hash
├ expires_at      TIMESTAMP
└ created_at      TIMESTAMP

-- Audit log (Faz 5'e ek, MVP'de zorunlu değil)
audit_log
├ id, user_id, action, target_type, target_id, ip, ts
```

**Schema kararları:**

- **`device_token` neden var:** URL'yi tahmin eden biri cihaz olarak kaydedebilir; backend Jetson'a token'la auth olur, Jetson'da `install_agent.sh` üretir. Token URL'nin query param'ında (`?token=xyz`) olarak panele yapıştırılır — kullanıcı ayrı alan görmez.
- **`agent_event_id` neden var:** Offline dönemde Jetson 50 olay biriktirir; backend `?since=last_event_id` der, idempotent replay garantisi `(device_id, agent_event_id)` UNIQUE constraint ile.
- **Screenshot disk'te neden:** 1-5 cihaz × 20 ihlal/gün × 600 KB ≈ 12 MB/gün; 1 yıl ~4 GB. VPS disk yeter. S3/MinIO v2'de.
- **`occurred_at` vs `received_at`:** Jetson saati yanlış olabilir veya internet gecikmesi olur. UI'da `occurred_at`'a göre sıralanır; ikisi gecikme analizi için tutulur.

---

## 5. Panel Sayfaları

### `/login`
- Email + şifre + "Beni hatırla"
- 5 deneme/IP/5dk lockout
- Başarılı → JWT httpOnly cookie → `/dashboard` redirect

### `/dashboard`
- Üst KPI: Toplam cihaz / Online / Bugünkü ihlal / Son 1 saat
- Cihaz kart grid (responsive 1-4 sütun): ad, bölge, online/offline rozet, bugünkü ihlal sayısı, son ihlal thumbnail
- Sağ sticky panel: canlı bildirim akışı (son 10 ihlal)
- "Yeni Cihaz Ekle" CTA → modal

### Modal: "Yeni Cihaz Ekle" (30 sn UX)
- 3 alan: **Ad** (3-50 char), **Bölge** (dropdown veya serbest), **Bağlantı URL'si** (token query param dahil)
- "Bağlan" butonu → backend → Jetson `GET /api/info` (token doğrula) → 5 sn içinde sonuç
- Hata kodları: `URL_INVALID`, `UNREACHABLE`, `TOKEN_INVALID`, `ALREADY_EXISTS`

### `/devices/:id`
- **Sekme 1: Olay Geçmişi** (varsayılan) — filtre + tablo + pagination
- **Sekme 2: Canlı İzle** (Faz 4) — `<video>` HLS player + "Aç/Kapat"
- **Sekme 3: Bilgi** — public_url (kopyala), token (gizli), heartbeat grafiği

### `/events`
- Tüm cihazlardan global olay listesi
- Filtreler: cihaz multi-select, tarih, tür
- Hızlı butonlar (Bugün/Son 1 saat/Bu hafta)
- Satıra tıkla → screenshot lightbox

### `/settings` (admin only, Faz 5)
- Kullanıcı yönetimi, profil/şifre

### Bildirim sistemi (her sayfada)
- Toast (sonner, sol alt) — `/ws/panel` → `event_created` mesajı
- Dashboard sağ panele de düşer
- Browser Notification API (opsiyonel, izin verilirse)

---

## 6. Güvenlik

**Auth & oturum:**
- JWT HS256, 15 dk access + 7 gün refresh
- httpOnly + Secure + SameSite=Strict cookie
- bcrypt cost=12, min 10 karakter şifre
- slowapi rate limit (5/IP/5dk)
- Çıkış/şifre değişiminde `sessions.token_hash` revoke

**Cihaz ↔ Backend:**
- HTTPS zorunlu (HTTP → 301)
- `Authorization: Bearer <device_token>` header
- Jetson token doğrulamadan istek kabul etmez
- Token sadece `install_agent.sh` üretir, kayıp → cihaz silinir + yeniden eklenir

**Frontend:**
- CSRF: SameSite=Strict + double-submit cookie
- XSS: React default + `dangerouslySetInnerHTML` lint yasağı
- CSP: `default-src 'self'; img-src 'self' data: https:; media-src https://*.fleet.example.com`

**Backend hardening:**
- CORS: sadece panel domain'i
- Pydantic strict input validation
- SQLAlchemy ORM only (raw SQL yok)
- Screenshot upload: max 2 MB, magic byte kontrolü (image/jpeg|png)
- Path traversal: `screenshot_path` UUID-only

**Cloudflared:**
- Tunnel credential per-Jetson, paylaşılmaz
- Ingress whitelist: `/ws`, `/events`, `/stream/*`, `/api/info`

---

## 7. Hata Yönetimi & Dayanıklılık

| Hata | Davranış |
|---|---|
| Backend → Jetson WS drop | Exponential backoff 1→60s, 3 ardışık fail = `offline`, panele toast atma |
| Yeniden bağlanma | `?since=last_event_id` ile silent replay |
| Jetson agent çökmesi | systemd `Restart=always RestartSec=3`; `guardwatch_ds.py` ayrı unit |
| Backend çökmesi | DeviceConnector graceful shutdown; başlayınca DB'den cihaz listesi okur, WS'ler yeniden kurulur |
| Disk dolması | Faz 5 cron: 90+ gün screenshot sil; `/health` endpoint disk usage |
| Yetersiz internet | Heartbeat mobile'de 60s; chunked upload + retry; agent SQLite max 10000 satır FIFO |

---

## 8. Test Stratejisi

- **Faz 0:** pytest + httpx skeleton, frontend test boş ama çalışıyor, pre-commit hook
- **Faz 1:** Backend unit (JWT, devices CRUD, WS heartbeat) + integration (testcontainers postgres) + agent integration (backend mock'a karşı handshake)
- **Faz 2 (en kritik):** Agent SQLite queue replay, backend idempotency unit, E2E Playwright (login → ihlal sim → toast doğrula)
- **Faz 3-5:** Filtreleme/pagination unit, stream auth integration, deploy smoke test
- **CI:** GitHub Actions — push'ta lint+unit+integration; PR'da E2E; main deploy manuel

---

## 9. Kapsam Dışı (v2+ için not)

Bu spec'e dahil **değil**, sonraya bırakıldı:

- Multi-tenant (çoklu müşteri/kuruluş hiyerarşisi)
- S3/MinIO storage (1-5 cihaz pilot için disk yeter)
- WebRTC (HLS yeter, gecikme kabul edilebilir)
- Mobil uygulama (web responsive yeter)
- Token rotation (1-5 cihaz pilot için over-engineering)
- Cert pinning
- Audit log dolu kullanım (Faz 5'te schema atılır, kullanım v2)
- Multi-camera per Jetson
- Raporlama / sürücü performans skorları
- SLA / on-call alerting (PagerDuty vb.)

---

## 10. Açık Sorular (implementation planning için)

1. **Domain:** `fleet.example.com` placeholder — kullanıcı domain'i hazırlayacak mı, yoksa cloudflared free subdomain mi? (Cloudflare Tunnel free tier özel domain ister.)
2. **VPS sağlayıcısı:** Faz 5'te karar verilecek; tasarım sağlayıcı-bağımsız Docker Compose.
3. **MediaMTX vs aiortc:** Faz 4'te POC ile karar; spec MediaMTX/HLS varsayar.
4. **Frontend kütüphaneleri kesinleşmemiş:** Next.js 14 App Router + Tailwind + shadcn/ui + sonner (toast) + hls.js (Faz 4) varsayılır; implementation plan'da kesinleşir.

---

## 11. Sonraki Adım

Bu spec onaylandıktan sonra `superpowers:writing-plans` skill'i ile **Faz 0 ve Faz 1 için detaylı implementation plan** yazılacak. Sonraki fazlar tamamlandıkça yeni plan döngüleri açılır.
