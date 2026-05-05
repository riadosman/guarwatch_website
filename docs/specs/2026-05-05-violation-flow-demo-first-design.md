# İhlal Akışı (Demo-First) — Tasarım Dokümanı

**Tarih:** 2026-05-05
**Hedef:** Jetson'da bir ihlal tetiklendiğinde uçtan uca akışın çalıştığını teyit etmek — agent → backend (WebSocket) → frontend dashboard (canlı toast + foto thumbnail + büyütülebilir görüntü).
**Bağlam:** Faz 0 skeleton bitti (`backend/`, `frontend/`, `agent/` ayakta, `/health` yeşil). Spec `docs/specs/2026-05-03-fleet-management-phases-design.md` Faz 1'i (auth + cihaz CRUD + URL-paste UX + cloudflared) önce şart koşuyordu; bu doküman onun yerine **demo-first (Yaklaşım A)** ara hedefini tanımlar. Faz 1/Faz 2'nin ileride üstüne kurulacağı stabil veri sözleşmesini bu adımda donduruyoruz.

---

## 1. Hedef ve Kapsam

| Konu | Değer |
|---|---|
| Birincil amaç | İhlal akışının mekanik teyidi (E2E demo) |
| Sürüm | v0 (demo-first), Faz 1/2'ye direkt taşınır |
| MVP ölçek | 1 Jetson (veya simulator) ↔ 1 backend ↔ 1 tarayıcı |
| Süre | 2–3 gün |
| Auth | **Yok** — dashboard public, login Faz 1'de eklenecek |
| Cihaz kayıt UX | **Yok** — agent env değişkeniyle sabit `DEVICE_ID` + `DEVICE_TOKEN` taşır |
| Cloudflared / public URL | **Yok** — agent backend'e dışarı doğru bağlanır |
| Stream / canlı kamera | Kapsam dışı |
| Marketing landing | Kapsam dışı (bir sonraki sprint) |

**Demo başarı kriteri:** Agent'a fake bir ihlal sinyali fırlatılır (örn. dosya tetikleyici) → 1 saniye içinde backend kaydı tutar, foto disk'e yazılır, açık tarayıcıda toast düşer + dashboard listesine yeni satır gelir + thumbnail tıklanınca tam boy görüntü açılır.

---

## 2. Mimari (yüksek seviye)

```
┌────────────────────┐         ┌────────────────────┐         ┌─────────────────┐
│ JETSON / DEV BOX   │         │ BACKEND            │         │ TARAYICI        │
│                    │         │                    │         │                 │
│ agent (FastAPI)    │         │ FastAPI            │         │ Next.js 14      │
│  ├ WS client       │  ──WS──▶│  /ws/ingest        │         │  /dashboard     │
│  │  (yeniden bağ.) │         │   (agent push)     │         │                 │
│  ├ event üretici   │         │                    │         │  ┌──────────┐   │
│  │  (file watcher  │         │  events tablosu    │ ──WS───▶│  │  toast   │   │
│  │   + multipart)  │         │  ./uploads/<id>/   │         │  │  + foto  │   │
│  └ kalan: SQLite   │         │   <eid>.jpg        │         │  │  + liste │   │
│    queue (Faz 2)   │         │                    │         │  └──────────┘   │
│                    │         │  /ws/panel         │         │                 │
│                    │         │   (browser sub)    │         │                 │
└────────────────────┘         │                    │         │  /uploads/...    │
                               │  /api/events       │         │   (statik)       │
                               │  /api/events/{id}/ │         │                 │
                               │   image (statik)   │         │                 │
                               └────────────────────┘         └─────────────────┘
```

**Anahtar kararlar:**

1. **WS yönü ters çevrildi (Jetson → backend).** Spec'teki Backend → Jetson modeli "URL paste" UX gerektirdiği için cloudflared/auth katmanı zorunluyordu; demo bu UX'e ihtiyaç duymaz. Jetson backend'e bağlanır → NAT/CGNAT/4G arkasında bile çalışır → cloudflared gereksiz hale gelir.
2. **Event şeması Faz 1/2 ile aynı.** `agent_event_id` (idempotency anahtarı), `device_id`, `type`, `occurred_at`, `metadata`, `screenshot` payload formatı spec'le birebir aynı kalıyor. Sadece **taşıyıcı** değişiyor (Jetson WS push vs. backend WS pull). Bu, A → B geçişinde DB tablosu, frontend componentleri, foto storage'ın hiç değişmemesini garanti eder.
3. **Postgres + Alembic baştan açık.** SQLite'a düşmüyoruz — Faz 1'in DB schema'sı bu adımda kuruluyor (sadece `events` + `devices` lite versiyonu). Migrasyon zahmeti sıfır oluyor.
4. **Foto upload multipart/form-data.** WS üzerinden bytes gömmek yerine: agent ihlal anında `POST /api/devices/{device_id}/events`'e multipart atar (JSON metadata + JPEG file). WS sadece "yeni event geldi" canlı bildirimi yayar. Bu, hem **Faz 2'deki idempotent replay** mekanizmasıyla aynı endpoint'i kullanır, hem de WS frame size limitlerini düşürür.
5. **Auth yok ama device_token var.** Agent multipart isteğinde `Authorization: Bearer <DEVICE_TOKEN>` header taşır; backend env'deki sabit listeye karşı doğrular. JWT user auth Faz 1'de eklenecek; device auth zaten yerinde olur, taşınması gerekmez.
6. **Frontend public dashboard.** Login yok; `/` rotası direkt dashboard. Faz 1'de `/login` + middleware ile bu rota arkaya alınır, içeriği değişmez.

---

## 3. Veri Modeli (sadece bu sprint'te kullanılan kısım)

```sql
-- Demo'da seed'lenir; UI'dan eklenmez
devices
├ id              UUID PK
├ name            TEXT          -- "Demo Jetson 1"
├ device_token    TEXT          -- Bearer token (env'le karşılaştırılır)
├ created_at      TIMESTAMP
└ last_seen_at    TIMESTAMP NULL  -- her event'te güncellenir

events
├ id              BIGSERIAL PK
├ device_id       UUID FK→devices ON DELETE CASCADE
├ agent_event_id  BIGINT
├ type            TEXT          -- 'GOZ_KAPALI' | 'HAREKETSIZ' | 'UYUYOR'
├ track_id        INT NULL
├ occurred_at     TIMESTAMP     -- agent saatinde olay anı
├ received_at     TIMESTAMP     -- backend alış anı
├ screenshot_path TEXT NULL     -- ./uploads/<device_id>/<event_id>.jpg
├ metadata        JSONB         -- perclos, pitch, signal_src
├ UNIQUE(device_id, agent_event_id)
└ INDEX (occurred_at DESC)
```

`users`, `sessions`, `audit_log` tabloları **bu spec'te yok** — Faz 1'de eklenir; bu sprint'in migrasyonları üstüne sıralı binecekler.

---

## 4. API Yüzeyi

### HTTP

| Method | Path | Auth | Amaç |
|---|---|---|---|
| GET | `/health` | yok | (mevcut) |
| POST | `/api/devices/{device_id}/events` | `Bearer <device_token>` | Agent'tan ihlal push'u (multipart: `payload` JSON + `screenshot` JPEG) |
| GET | `/api/events?limit=50` | yok (Faz 1'de cookie) | Son N event listesi (sayfa açılışında ilk yükleme) |
| GET | `/uploads/{device_id}/{event_id}.jpg` | yok | Statik foto serve (FastAPI StaticFiles mount) |

### WebSocket

| Path | Yön | Mesaj formatı |
|---|---|---|
| `/ws/ingest` | Agent → backend | _Bu sprint'te kullanılmıyor_ — agent multipart HTTP atar. WS şimdilik sadece presence/heartbeat içindir (online rozeti Faz 1'de devreye girince anlam kazanır). Demoda **sadece HTTP yolu** test edilir; WS ingest skeleton olarak yer alır, opsiyonel. |
| `/ws/panel` | Backend → tarayıcı | `{type: "event_created", payload: {id, device_id, type, occurred_at, metadata, screenshot_url, thumbnail_url}}` |

**Sadeleştirme notu:** İlk demo iterasyonunda `/ws/ingest`'i hiç açmıyoruz. Agent → backend ihlal akışı tamamen multipart HTTP üstünden gider. `/ws/panel` (tarayıcı broadcast) yine de kalır — toast/canlı liste için. Bu, Faz 2'ye geçişte sıfır şema değişikliği yaratır; çünkü Faz 2'de zaten `POST /api/devices/{id}/events` aynı kalır, sadece üstüne `Backend → Jetson WS` katmanı eklenir.

### Multipart şeması (agent → backend)

```
POST /api/devices/{device_id}/events
Authorization: Bearer <device_token>
Content-Type: multipart/form-data

  payload (application/json):
    {
      "agent_event_id": 42,
      "type": "GOZ_KAPALI",
      "track_id": 1,
      "occurred_at": "2026-05-05T13:55:36.820Z",
      "metadata": { "perclos": 87.5, "pitch": 22.1, "signal_src": "MP" }
    }

  screenshot (image/jpeg):
    <binary, max 2 MB>
```

Yanıt: `201 Created` + `{event_id, screenshot_url}`. `409 Conflict` eğer aynı `(device_id, agent_event_id)` daha önce alınmışsa (idempotency).

---

## 5. Bileşen Sınırları

### `backend/app/`

- `models/event.py`, `models/device.py` — SQLAlchemy ORM, başka iş mantığı yok.
- `schemas/event.py` — Pydantic request/response. `EventIn` (multipart payload), `EventOut` (browser/list).
- `routers/events.py` — `POST /api/devices/{id}/events`, `GET /api/events`. İnce; servisi çağırır.
- `services/event_store.py` — DB insert + foto disk yazımı + WS broadcast tetikleyici. Tek transaction.
- `services/panel_hub.py` — `/ws/panel` bağlı tarayıcılar listesi + broadcast yardımcısı.
- `routers/ws_panel.py` — `/ws/panel` endpoint, `panel_hub`'a abone olur.
- `core/security.py` — Sadece `verify_device_token(token, device_id)` (env listesine karşı eşitlik). Bcrypt/JWT Faz 1'de eklenecek.

### `agent/`

- `agent/server.py` — Mevcut; `/health` aynen kalır. Bu sprint'te buraya event üreten bir CLI komutu (`python -m agent.simulate_event --type GOZ_KAPALI`) eklenir, demo için.
- `agent/uploader.py` — `requests`/`httpx` ile backend'e multipart POST. Backoff: bu sprint'te basit (3 deneme + sabit 2s). SQLite queue Faz 2.
- `agent/config.py` — `BACKEND_URL`, `DEVICE_ID`, `DEVICE_TOKEN` env okur.

### `frontend/src/`

- `app/page.tsx` — Dashboard yapılır (login redirect yok). Liste + toast.
- `components/EventList.tsx` — Son N ihlal kartı: thumbnail + tür rozeti + zaman + cihaz.
- `components/EventLightbox.tsx` — Tıklanan event'in tam boy fotosu için `Dialog`.
- `lib/api.ts` — `fetch` wrapper, `getEvents()`.
- `lib/ws.ts` — `/ws/panel` client (otomatik reconnect).
- `hooks/useEventStream.ts` — Sayfa açılışında ilk N event'i HTTP ile çeker, sonra WS'ten gelen `event_created` mesajlarını listenin başına ekler.
- Toast: `sonner` (zaten kurulu). WS mesajı geldiğinde `toast.custom(...)` ile thumbnail + tür + "İncele" linki.

---

## 6. Veri Akışı (sıralı)

1. Agent ihlal tetikleyicisini görür (demo CLI'da `simulate_event`, gerçekte `app.log` / `kayitlar/` izleme — Faz 2).
2. Agent `POST /api/devices/{id}/events` (multipart: payload + screenshot).
3. Backend:
   a. `verify_device_token` — env listesine karşı.
   b. `agent_event_id` UNIQUE check; varsa `409`.
   c. `events` row'u insert.
   d. Foto'yu `./uploads/{device_id}/{event_id}.jpg` yolu ile diske yaz.
   e. `panel_hub.broadcast(event_created)` — bağlı tüm tarayıcılara push.
   f. `201 Created` döner.
4. Tarayıcı `/ws/panel` üzerinden `event_created` alır → toast (sonner) + liste başına satır ekler.
5. Kullanıcı thumbnail'a tıklar → lightbox `/uploads/...` URL'ini gösterir.

---

## 7. Hata Yönetimi (bu sprint için)

| Hata | Davranış |
|---|---|
| Agent backend'e ulaşamaz | 3 deneme + 2s backoff, log'a yaz, vazgeç (kalıcı queue Faz 2) |
| Backend disk yazım hatası | DB transaction rollback, agent'a `500` döner, agent retry eder |
| Tarayıcı WS koptu | `lib/ws.ts` exponential backoff (1→10s) ile yeniden bağlanır; bağlanınca `/api/events` ile son listeyi yeniden çeker |
| Aynı `agent_event_id` iki kez | `409 Conflict`, agent başarı sayar (idempotency garantisi) |
| Foto >2 MB | `413 Payload Too Large`, ihlal kaydedilmez |
| `device_token` yanlış | `401 Unauthorized` |

---

## 8. Test Stratejisi

- **Backend unit:** `event_store.create()` happy path + idempotency `409` + token doğrulama.
- **Backend integration:** Postgres testcontainer + multipart POST + `/api/events` GET. WS broadcast doğrulaması (test client iki bağlantı: ingest simülasyonu ↔ panel listener).
- **Agent unit:** `uploader.send_event()` retry + 409'u başarı sayma davranışı.
- **Frontend:** `EventList` render + `useEventStream` WS mesajı geldiğinde listeye ekleme. Vitest + React Testing Library, WS için fake client.
- **E2E manual demo:** `python -m agent.simulate_event --type UYUYOR` → tarayıcıda 1 sn içinde toast + thumbnail görünür.

CI bu sprint için sadece backend pytest + frontend vitest. Playwright Faz 1'de eklenecek.

---

## 9. Faz 1/2'ye Geçiş Notları (gelecek sprint için kontrol listesi)

A → B geçişinde **değişmeyecek** olanlar:
- `events` tablosu schema'sı
- `(device_id, agent_event_id)` UNIQUE constraint
- Multipart event endpoint'in URL'i ve şeması
- `./uploads/<device_id>/<event_id>.jpg` foto storage düzeni
- `/ws/panel` mesaj formatı (`event_created` + payload)
- Frontend toast/liste/lightbox komponentleri

A → B'de **eklenecek** olanlar:
- `users`, `sessions` tabloları + JWT login/refresh
- `devices` tablosuna `public_url`, `region`, `status`, `last_event_id` alanları
- `DeviceConnector` servisi (backend → Jetson outgoing WS havuzu)
- Cloudflared kurulumu + `install_agent.sh`
- Frontend `/login` + middleware + `AddDeviceModal`
- Agent: dinleyici moda geçer, `WS_BACKEND_URL` env silinir
- Multipart endpoint **aynı kalır**; agent push yerine backend pull olur (backend → Jetson WS üstünden agent'a "ihlalini ver" komutu, agent aynı endpoint'e POST'lar)

A'da agent'ın `BACKEND_URL`/`DEVICE_TOKEN` env'lerinin B'de hâlâ anlamlı olduğuna dikkat: B'de bunlar agent server'ın kendi auth'u olarak kullanılır.

---

## 10. Kapsam Dışı (bu spec'te yok)

- Login, kullanıcı yönetimi, JWT
- Cihaz ekleme UX'i, "URL paste" akışı
- Cloudflared tunnel, public URL'ler
- Multi-cihaz dashboard kart grid'i (tek cihaz, düz liste yeter)
- Cihaz online/offline rozeti (heartbeat Faz 1'de)
- Canlı kamera stream (HLS, MJPEG)
- Marketing/landing sayfası
- 90+ gün foto temizleme cron'u
- Multi-tenant, S3, WebRTC, mobil

---

## 11. Açık Sorular

1. Demo cihazı: gerçek Jetson'a mı koşacağız, yoksa dev box'ta `agent.simulate_event` CLI yeterli mi? **Varsayım:** simülasyon yeterli; gerçek Jetson entegrasyonu (`app.log` watcher) Faz 2'de.
2. Foto kaynağı: simülasyonda ne göstereceğiz? **Varsayım:** repo'ya küçük örnek JPEG'ler eklenir (`agent/fixtures/`).
3. Frontend tek dashboard sayfası mı? **Varsayım:** evet — liste + toast + lightbox tek sayfada.

---

## 12. Sonraki Adım

`superpowers:writing-plans` skill'i ile bu spec'in detaylı implementation plan'ı yazılır (görev görev, dosya dosya). Plan tamamlanınca uygulama `subagent-driven-development` veya `executing-plans` ile yürütülür.
