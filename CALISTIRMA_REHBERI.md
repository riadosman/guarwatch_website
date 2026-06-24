# GuardWatch Enterprise — Çalıştırma Rehberi

## Proje Yapısı (İki Repo)

```
Goruntu_isleme/
├── guardwatch_website/          ← Bulut sistemi (bu repo)
│   ├── backend/                 ← FastAPI API + RBAC
│   ├── frontend/                ← Next.js 14 dashboard
│   ├── relay/            ← WebSock       et hub (Jetson↔Dashboard)
│   └── docker-compose.yml       ← Tek komutla her şeyi başlatır
│
└── new_guardwatch/              ← Jetson agent kodu
    ├── agent/                   ← Python 3.8 agent modülleri
    ├── installer/               ← SD kart build + systemd servisleri
    └── guardwatch.py            ← Mevcut kamera pipeline
```

---

## Ön Koşullar

| Gereksinim | Minimum Versiyon | Kontrol |
|---|---|---|
| Docker Desktop | 24+ (Linux containers) | `docker --version` |
| Python | 3.8+ (agent için) | `python --version` |
| Node.js | 18+ (frontend dev için) | `node --version` |

---

## BÖLÜM 1: Bulut Sistemini Başlat

**Çalışma dizini:** `guardwatch_website/`

### Adım 1: Ortam Değişkenleri

`guardwatch_website/` klasöründe bir `.env` dosyası oluştur:

```bash
# guardwatch_website/.env
JWT_SECRET=guclu-bir-sifre-buraya-yaz
RELAY_API_KEY=relay-anahtar-123
```

`guardwatch_website/relay/` klasöründe `.env` oluştur:

```bash
# Relay için relay/.env.example'dan kopyala:
cp relay/.env.example relay/.env
```

`relay/.env` içini düzenle:
```
RELAY_PORT=8765
BACKEND_URL=http://backend:8000
BACKEND_API_KEY=relay-anahtar-123
AGENT_SECRET=jetson-baglanti-sifresi-buraya
```

> `AGENT_SECRET`: Jetson agent'larının relay'e bağlanırken kullandığı gizli anahtar.
> `BACKEND_API_KEY` ile `RELAY_API_KEY` aynı değer olmalı (relay → backend iletişimi için).

### Adım 2: Sistemi Başlat

```bash
cd guardwatch_website
docker compose up --build -d
```

İlk başlatmada:
- PostgreSQL başlar ve sağlık kontrolü geçer
- Backend migration'ları otomatik çalışır (`alembic upgrade head`)
- Migration 0005: `roles`, `role_permissions`, `users`, `camera_groups` tabloları oluşur; **SuperAdmin rolü** ve **`admin` kullanıcısı** (şifre: `changeme`) seed edilir
- Frontend, backend ve relay başlar

### Adım 3: Servislerin Durumunu Kontrol Et

```bash
docker compose ps
```

Beklenen çıktı:
```
NAME         STATUS          PORTS
backend      Up (healthy)    0.0.0.0:8000->8000/tcp
frontend     Up              0.0.0.0:3000->3000/tcp
postgres     Up (healthy)    0.0.0.0:5432->5432/tcp
relay        Up              0.0.0.0:8765->8765/tcp
```

### Adım 4: Dashboard'a Giriş Yap

Tarayıcıda aç: **http://localhost:3000**

| Alan | Değer |
|---|---|
| Kullanıcı adı | `admin` |
| Şifre | `changeme` |

> İlk girişten sonra şifreyi değiştirmek için Dashboard → Kullanıcı Yönetimi.

### Mevcut Sayfalar

| URL | Açıklama |
|---|---|
| `/dashboard` | Ana panel |
| `/dashboard/devices` | Jetson cihazları (online/offline, terminal butonu) |
| `/dashboard/devices/[id]/terminal` | Web terminal (xterm.js) |
| `/dashboard/users` | Kullanıcı yönetimi (CRUD) |
| `/dashboard/roles` | Rol yönetimi (7 servis × 4 yetki matrisi) |
| `/dashboard/groups` | Kamera grubu yönetimi |
| `/dashboard/history` | Olay/ihlal geçmişi |

---

## BÖLÜM 2: Jetson Agent'ı Çalıştır

**Çalışma dizini:** `new_guardwatch/`

### Geliştirme / Test Ortamında

```bash
cd new_guardwatch

# Bağımlılıkları kur
pip install websockets aiohttp

# Konfigürasyon dosyası oluştur
cat > /tmp/guardwatch_agent.conf << EOF
relay_url: ws://localhost:8765/agent
device_name: Test-Jetson-1
camera_subnet: 192.168.1.0/24
wifi_ssid:
wifi_password:
EOF

# Agent'ı başlat
python -m agent.main --conf /tmp/guardwatch_agent.conf
```

Konsolda şu çıktıyı gör:
```
=== GuardWatch Agent v2.0 ===
EŞLEŞTİRME KODU: A1B2C3
Dashboard'a giriş yapıp bu kodu "Cihaz Ekle" bölümüne girin.
```

### Yeni Jetson Eşleştirme

1. Agent konsolundaki 6 haneli kodu kopyala (`A1B2C3`)
2. Dashboard → Cihazlar → **"+ Cihaz Ekle"**
3. Kodu gir → Cihaz adı ver → Ekle
4. Cihaz listede görünür, terminal butonu aktif olur

---

## BÖLÜM 3: Gerçek Jetson'a Kurulum

### Seçenek A — SD Kart İmajı (Önerilen)

**Gereksinim:** Linux build makinesi, ~20 GB boş disk, JetPack 4.6 base image

```bash
# Linux makinesinde (Ubuntu 20.04+)
cd new_guardwatch/installer
sudo ./build_image.sh /path/to/jetpack-4.6-base.img
# Çıktı: guardwatch-v2.img.gz (~5-7 GB)
```

**Flash ve Konfigürasyon:**

1. Balena Etcher ile `guardwatch-v2.img.gz` dosyasını SD karta flash et
2. SD kartın `/boot` bölümünde `guardwatch.conf.template` → `guardwatch.conf` yap
3. `guardwatch.conf` düzenle:

```ini
RELAY_URL=wss://relay.guardwatch.io/agent
DEVICE_NAME=Fabrika-A
CAMERA_SUBNET=192.168.1.0/24
WIFI_SSID=
WIFI_PASSWORD=
```

4. SD kartı Jetson'a tak, güç ver
5. İlk açılış ~10 dakika sürer (TensorRT derleme dahil)
6. Ekranda eşleştirme kodu belirir → Dashboard'dan eşleştir

### Seçenek B — Mevcut JetPack Jetson'da Hızlı Kurulum

```bash
# Jetson'da SSH ile bağlan, sonra:
sudo bash -c "$(curl -sSL https://raw.githubusercontent.com/YOUR_USERNAME/new_guardwatch/main/installer/install_deps.sh)"
```

Veya repo'yu elle kopyalayıp:

```bash
sudo bash new_guardwatch/installer/firstboot.sh
```

---

## BÖLÜM 4: Cloudflare Tunnel (Üretim Ortamı)

Jetson'ların gerçek internetten relay'e bağlanması için:

1. `relay/CLOUDFLARE_SETUP.md` dosyasını oku
2. Bulut sunucusunda `cloudflared` tunnel kur
3. `relay.guardwatch.io` → `localhost:8765` yönlendir
4. Jetson'lardaki `guardwatch.conf` dosyasında:
   ```
   RELAY_URL=wss://relay.guardwatch.io/agent
   ```

---

## BÖLÜM 5: Log ve Hata Ayıklama

### Docker Servisleri

```bash
# Tüm loglar (canlı)
docker compose logs -f

# Belirli servis
docker compose logs -f relay
docker compose logs -f backend
docker compose logs -f frontend

# Backend'de manuel alembic çalıştır
docker compose exec backend alembic upgrade head

# Backend'de Python shell
docker compose exec backend python
```

### Jetson Agent

```bash
# Systemd log (Jetson'da)
sudo journalctl -u guardwatch-agent -f
sudo journalctl -u guardwatch-firstboot -f

# First boot'u tekrar çalıştır
sudo rm /etc/guardwatch/.firstboot_done
sudo systemctl start guardwatch-firstboot
```

### Relay Bağlantı Testi

```bash
# Relay sağlık kontrolü
curl http://localhost:8765/health

# Bağlı cihazlar
curl http://localhost:8765/devices
```

---

## BÖLÜM 6: Rol Yönetimi

Migration 0005 iki şey seed eder:
- **SuperAdmin** rolü: 7 servisin tamamında okuma/oluşturma/güncelleme/silme yetkisi
- **admin** kullanıcısı: SuperAdmin rolüyle (şifre: `changeme`)

Yeni rol oluşturmak için: Dashboard → **Rol Yönetimi** → "+ Yeni Rol"

Servisler ve yetkiler:

| Servis | Açıklama |
|---|---|
| `users` | Kullanıcı hesapları |
| `roles` | Rol tanımları ve yetkileri |
| `devices` | Jetson cihazları |
| `camera_groups` | Kamera grupları |
| `terminal` | Web terminal erişimi |
| `events` | Alarm/olay geçmişi |
| `live_view` | Canlı kamera izleme |

---

## BÖLÜM 7: Sistemi Durdur

```bash
cd guardwatch_website

# Servisleri durdur (veri korunur)
docker compose down

# Servisleri durdur ve veritabanını sil (sıfırdan başlamak için)
docker compose down -v
```

---

## Hızlı Başvuru

```
http://localhost:3000       → Dashboard (Next.js)
http://localhost:8000/docs  → Backend API dökümantasyonu (Swagger)
http://localhost:8765       → Relay Server
ws://localhost:8765/agent   → Jetson bağlantı noktası
ws://localhost:8765/terminal/{device_id}  → Web terminal
```
