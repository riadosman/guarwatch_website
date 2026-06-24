# GuardWatch — Kamera/Grup/SuperAdmin Genisletme Tasarimi

**Tarih:** 2026-06-24
**Durum:** Onaylandi

---

## Ozet

Mevcut GuardWatch sistemine asagidaki ozellikler ekleniyor:

1. SuperAdmin rolu — kamera/grup/kullanici yonetimi
2. Bagimsiz Camera modeli — Jetson'a bagli, otomatik kesif
3. Grup konum siniflamasi — il / ilce / mahalle (statik JSON)
4. Jetson sifir dokunusla kayit — bootstrap secret ile otomatik
5. Canli goruntuleme — Jetson'dan WebSocket stream
6. Frontend guncelleme — yeni sayfalar ve SuperAdmin UI

---

## 1. Veri Modeli

### Yeni Tablolar

#### `il`
```
id        SERIAL PRIMARY KEY
name      TEXT NOT NULL
```
81 satir, statik JSON'dan migration ile yuklenir.

#### `ilce`
```
id        SERIAL PRIMARY KEY
name      TEXT NOT NULL
il_id     INT FK -> il
```

#### `mahalle`
```
id        SERIAL PRIMARY KEY
name      TEXT NOT NULL
ilce_id   INT FK -> ilce
```

#### `camera`
```
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
name          TEXT NOT NULL
rtsp_url      TEXT NOT NULL
device_id     UUID FK -> device (NOT NULL)
group_id      INT FK -> camera_group (nullable)
is_online     BOOL DEFAULT false
last_seen_at  TIMESTAMP
created_at    TIMESTAMP DEFAULT now()
```

- Bir kamera her zaman bir Jetson'a (device) baglidir
- Bir kamera en fazla bir gruba atanabilir
- Grup silinirse group_id NULL olur, kamera silinmez

### Degisen Tablolar

#### `camera_group` — eklenenler
```
+ il_id       INT FK -> il (NOT NULL)
+ ilce_id     INT FK -> ilce (NOT NULL)
+ mahalle_id  INT FK -> mahalle (NOT NULL)
```
- Mevcut `camera_uris` TEXT[] alani kaldirilir
- Artik kameralar camera tablosundan group_id ile cekilir
- Yeni grup olusturmada il+ilce+mahalle zorunlu

#### `device` — eklenenler
```
+ location                TEXT (opsiyonel serbest metin, ornek: "Uskudar Merkez")
+ registered_via_bootstrap BOOL DEFAULT false
```

#### `role` — eklenenler
```
+ is_superadmin  BOOL DEFAULT false
```
- Sistemde yalnizca bir superadmin rolu olabilir
- Migration sirasinda otomatik olusturulur
- Silinemez

### Kullanici -> Kamera Erisimi

- `user.group_ids` array korunur
- Kullanici hangi gruba atanmissa o gruptaki kameralari gorur
- SuperAdmin (is_superadmin=true) tum kameralara erisir
- Her permission kontrolunde is_superadmin=true ise bypass yapilir

---

## 2. SuperAdmin Yetki Sistemi

### Kural
`role.is_superadmin = true` ise tum servis ve kaynaklara erisim sagllanir, RolePermission tablosu kontrol edilmez.

### SuperAdmin Eylemleri

| Eylem                        | SuperAdmin | Normal Kullanici |
|------------------------------|-----------|-----------------|
| Kamera ekle / sil            | Evet      | Hayir           |
| Grup olustur / sil           | Evet      | Hayir           |
| Gruba il/ilce/mahalle ata    | Evet      | Hayir           |
| Kamerayi gruba ata           | Evet      | Hayir           |
| Kullaniciya grup ata         | Evet      | Hayir           |
| Canli goruntu izle           | Evet      | Evet (atananlar)|
| Jetson terminali             | Evet      | Role gore       |
| Olaylari goruntule           | Evet      | Evet (atananlar)|

### Bootstrap Secret Akisi

1. `.env` dosyasina `BOOTSTRAP_SECRET=<32-byte-random>` eklenir
2. Docker image olusturulurken bu deger SD karta yazilir
3. Jetson agent acilista su kontrolu yapar:
   - `/etc/guardwatch/device.json` var mi?
   - Varsa: icindeki token ile relay'e baglan
   - Yoksa: `POST /api/devices/bootstrap` cagir (Authorization: Bearer BOOTSTRAP_SECRET)
4. Backend yeni UUID + token uretir, device kaydeder, dondutur
5. Agent token'i `/etc/guardwatch/device.json`'a yazar
6. Sonraki acilislarda 3. adimda "var" dalina gider

---

## 3. Jetson Kamera Kesfi

### Otomatik Tarama

- Agent acilista ve her 5 dakikada bir subnet tarasi yapar (mevcut `cam_discovery.py`)
- Bulunan kameralar `POST /api/devices/{device_id}/cameras` ile bildirilir
- Backend:
  - Yeni kamera: `camera` tablosuna ekle (`is_online=true`)
  - Mevcut kamera: `is_online=true`, `last_seen_at` guncelle
- 3 tarama boyunca gorulmeyen kamera: `is_online=false`

### Yeni Endpoint

```
POST /api/devices/{device_id}/cameras
Body: [{ "name": str, "rtsp_url": str }, ...]
Auth: Device token (X-Device-Token header)
```

---

## 4. Canli Stream Mimarisi

```
Jetson (RTSP kamera)
  -> OpenCV/FFmpeg JPEG encode
  -> WebSocket mesaji { ch: 3+, type: "frame", cam_id: uuid, data: base64 }
  -> Relay (mevcut WebSocket altyapisi)
  -> Browser (wss://relay/stream/{device_id}/{cam_id})
  -> <canvas> render
```

### Kanal Tahsisi
- ch 0: kontrol (mevcut)
- ch 1: olaylar (mevcut)
- ch 2: terminal (mevcut)
- ch 3+: her kamera icin bir kanal (dinamik atama)

### Yeni Relay Endpoint
```
WebSocket: /stream/{device_id}/{cam_id}
```
- Browser bu adrese baglanir
- Relay, Jetson'a { ch: N, type: "stream_start", cam_id: uuid } gonderir
- Jetson frame gondermeye baslar
- Browser kapaninca Relay Jetson'a { type: "stream_stop" } gonderir

### Frame Formati
```json
{ "ch": 3, "type": "frame", "cam_id": "uuid", "data": "<base64-jpeg>" }
```
- Cozunurluk: 640x480, kalite: 70% JPEG
- Hedef FPS: 10-15 (bant genisligi / gecikme dengesi)

---

## 5. Konum Verisi

- Kaynak: GitHub acik JSON (turkey-neighbourhoods veya benzeri)
- Yukleme: Alembic migration ile tek seferlik `il`, `ilce`, `mahalle` tablolarina INSERT
- Kullanim: Frontend cascade dropdown (il -> ilce -> mahalle)
- Yeni API endpointleri:
  - `GET /api/locations/iller`
  - `GET /api/locations/ilceler?il_id=X`
  - `GET /api/locations/mahalleler?ilce_id=X`

---

## 6. Yeni/Degisen API Endpointleri

| Method | Path | Aciklama |
|--------|------|----------|
| POST | /api/devices/bootstrap | Jetson ilk kayit (bootstrap secret) |
| GET | /api/devices/{id}/cameras | Jetson'un kameralari |
| POST | /api/devices/{id}/cameras | Kamera kesfi bildirimi (device token) |
| PATCH | /api/cameras/{id} | Kamera adi / grup atama (superadmin) |
| DELETE | /api/cameras/{id} | Kamera sil (superadmin) |
| GET | /api/locations/iller | Il listesi |
| GET | /api/locations/ilceler | Ilce listesi (il_id filtre) |
| GET | /api/locations/mahalleler | Mahalle listesi (ilce_id filtre) |
| WS | /stream/{device_id}/{cam_id} | Canli stream (relay) |

---

## 7. Frontend Degisiklikleri

| Sayfa | Degisiklik |
|-------|-----------|
| `/dashboard/devices` | Jetson listesi, kamera sayisi, online badge |
| `/dashboard/devices/[id]` | Kamera listesi, stream butonu, terminal |
| `/dashboard/devices/[id]/stream/[camId]` | Yeni — canvas canli goruntu |
| `/dashboard/groups` | Grup olusturma: il/ilce/mahalle zorunlu dropdown |
| `/dashboard/groups/[id]` | Yeni — grup detay: kameralar, atanan kullanicilar |
| `/dashboard/users/[id]` | Grup atama UI |

### SuperAdmin UI Kurali
- `user.role.is_superadmin = true` ise kamera/grup yonetim menusu gorunur
- Normal kullanici yalnizca atandigi gruplarin kameralarini ve stream'ini gorur

---

## 8. Uygulama Sirasi

1. DB migration: il/ilce/mahalle tablolari + konum verisi yukle
2. DB migration: camera tablosu, camera_group guncelleme, role.is_superadmin
3. Backend: bootstrap endpoint + device token auth
4. Backend: kamera kesif endpoint + kamera CRUD
5. Backend: lokasyon endpointleri
6. Agent (new_guardwatch): bootstrap akisi + kamera kesif bildirimi + stream encode
7. Relay: /stream WebSocket endpoint
8. Frontend: grup formu guncelleme (il/ilce/mahalle)
9. Frontend: kamera yonetim sayfasi (superadmin)
10. Frontend: canli stream sayfasi (canvas)
11. Frontend: kullanici/grup atama UI
