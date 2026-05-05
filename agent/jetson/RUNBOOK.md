# Jetson Nano — Guardwatch Agent Test Runbook

**Hedef:** Jetson Nano üzerinde, PC'de docker compose ile çalışan Guardwatch
backend'ine bir test ihlali gönder. Tarayıcıda dashboard'da toast + foto
görünmeli.

**Bu dosya kime hitap eder:**
- Sen (insan): adım adım takip edebilirsin.
- Jetson'da çalışan bir Claude/AI ajan: bu runbook'u baştan sona oku, her
  bölümde belirtilen komutu çalıştır, çıktıyı yapıştır, sorun teşhisinde
  kararını ver.

---

## 0. Önkoşullar (PC tarafı — bu Jetson'a bağlanmadan ÖNCE doğrulanmalı)

Bu komutlar **Jetson'da DEĞİL, PC'de** çalıştırılır. Sen bunları daha önce
yaptıysan atlayabilirsin, ama Jetson'a bakan biri (insan ya da AI) muhtemelen
PC tarafının durumunu bilmez — o yüzden listeye dahil edildi.

```powershell
# 1. Backend ayakta mı (PC, normal PowerShell)
docker compose ps
# Beklenen: postgres + backend + frontend + agent hepsi "Up"

# 2. Backend kendi IP'sinden cevap veriyor mu
ipconfig | findstr "IPv4"
# 192.168.1.x ile başlayan IP'yi al (örnek: 192.168.1.136)

Invoke-WebRequest http://192.168.1.136:8000/health -UseBasicParsing -TimeoutSec 3 | % Content
# Beklenen: {"status":"ok"}

# 3. Firewall kuralı (yönetici PowerShell)
Get-NetFirewallRule -DisplayName "Guardwatch Backend 8000" -ErrorAction SilentlyContinue
# Boş ise:
New-NetFirewallRule -DisplayName "Guardwatch Backend 8000" -Direction Inbound -Protocol TCP -LocalPort 8000 -Action Allow -Profile Any

# 4. Backend her interface'de dinliyor mu
netstat -an | findstr ":8000"
# Beklenen: TCP    0.0.0.0:8000    0.0.0.0:0    LISTENING
```

PC tarafı 4 testin hepsini geçtikten sonra Jetson'a geç.

**PC LAN IP'si:** `192.168.1.136` (örnek — kendininkini güncelle ve aşağıda
her yerde bu IP'yi değiştir).

---

## 1. Jetson — ağ bağlantısı doğrulama (en kritik adım)

Jetson Wi-Fi'ye veya kabloya bağlı olmalı VE PC ile aynı LAN'da olmalı.

```bash
# 1.1 Jetson kendi IP'sini görsün
ip addr | grep "inet "
# Beklenen: 192.168.1.x ile başlayan bir adres (PC ile aynı subnet)

# 1.2 Aynı router'a bağlı mı?
ip route | grep default
# Beklenen: default via 192.168.1.1 dev wlan0  (veya eth0)

# 1.3 Router'a (gateway) ping
ping -c 3 192.168.1.1
# Beklenen: 0% packet loss

# 1.4 İnternete ping (DNS değil ham IP)
ping -c 3 8.8.8.8
# Beklenen: 0% packet loss

# 1.5 PC'ye ping
ping -c 5 192.168.1.136
# Beklenen: 0% packet loss
```

### Çıktı senaryolarına göre teşhis

| Senaryo | Belirti | Çözüm |
|---|---|---|
| **A — Tamamen sağlıklı** | Hepsi 0% loss | Bölüm 2'ye geç |
| **B — Gateway'e ping yok** | 1.3 ve 1.4 başarısız | Wi-Fi yeniden bağla: `sudo nmcli device disconnect wlan0 && sudo nmcli device connect wlan0`. Hâlâ olmuyorsa Jetson'u **kabloyla** modeme bağla. |
| **C — Gateway/internet OK ama PC'ye ping yok** | 1.3, 1.4 OK, 1.5 unreachable | **Router'da AP/Client Isolation açık.** Tarayıcıda `http://192.168.1.1` aç, modem paneline gir, Wi-Fi/Wireless ayarlarında "AP Isolation", "Client Isolation", "İstemci İzolasyonu" seçeneğini **kapat** ve modemi reboot et. |
| **D — Farklı subnet** | 1.1 `192.168.1.x` değil (örn `192.168.43.x`) | Jetson farklı bir Wi-Fi'ye bağlı (telefon hotspot vs). PC'nin bağlı olduğu Wi-Fi'ye bağla. |

**`ping 192.168.1.136` 0% loss verene kadar Bölüm 2'ye GEÇME.** Bu adım
geçmeden hiçbir test çalışmaz.

### Senaryo C için manuel router kontrolü

Modem markasına göre yer farkeder, ama tipik adlar:
- **TP-Link:** Wireless > Advanced > AP Isolation
- **Türk Telekom modem (Huawei):** Wi-Fi Settings > Wi-Fi Advanced > Wi-Fi Isolation
- **Vodafone Station:** Network Settings > Wireless > Client Isolation
- **Mikrotik:** Wireless > Security Profiles > "default-forwarding"

Hangi modem olursa olsun — "isolation" geçen ne varsa kapat, modemi reboot
et, sonra Adım 1.5'i tekrar çalıştır.

### Kestirme: Jetson'u kablolu bağla

Wi-Fi sorunu çözülemiyorsa, modemde boş bir LAN portuna ethernet kablosuyla
bağla. Wi-Fi'ye göre çok daha stabil, AP isolation kabloluyu genelde
kesmez.

```bash
# Bağladıktan sonra IP geldi mi
ip addr show eth0 | grep "inet "
ping -c 3 192.168.1.136
```

---

## 2. Repo'yu Jetson'a klonla

```bash
cd ~
git clone <REPO-URL> guardwatch_website
cd guardwatch_website/agent/jetson
ls -la
# Beklenen dosyalar:
# - README.md
# - RUNBOOK.md  (bu dosya)
# - requirements.txt
# - sample_violation.jpg
# - simulate_event.py
# - uploader.py
```

`<REPO-URL>` → senin GitHub repo URL'i.

---

## 3. Python ortamı

Jetson Nano JetPack 4.x default Python 3.6.9 ile gelir. Bu klasördeki kod
tam olarak 3.6 uyumludur (httpx yerine `requests`, async yok, dataclass yok).

```bash
# 3.1 Python sürümünü doğrula
python3 --version
# Beklenen: Python 3.6.x veya üstü

# 3.2 venv kur
cd ~/guardwatch_website/agent/jetson
python3 -m venv .venv
source .venv/bin/activate

# 3.3 Bağımlılık tek satır: requests
pip install --upgrade pip
pip install -r requirements.txt
# Beklenen: Successfully installed requests-2.x.x charset-normalizer-x.x.x ...

# 3.4 Doğrula
python3 -c "import requests; print(requests.__version__)"
# Beklenen: 2.27.x veya 2.28.x (3.6 desteklenen son sürüm civarı)
```

---

## 4. Env değişkenleri

```bash
# 4.1 PC'nin LAN IP'sini her yere yaz (BURAYI KENDİ IP'NLE DEĞİŞTİR)
export AGENT_BACKEND_URL=http://192.168.1.136:8000
export AGENT_DEVICE_ID=00000000-0000-0000-0000-000000000001
export AGENT_DEVICE_TOKEN=dev-token

# 4.2 Doğrula
echo $AGENT_BACKEND_URL
# Beklenen: http://192.168.1.136:8000

# 4.3 Kalıcı yap (opsiyonel)
cat >> ~/.bashrc <<'EOF'
export AGENT_BACKEND_URL=http://192.168.1.136:8000
export AGENT_DEVICE_ID=00000000-0000-0000-0000-000000000001
export AGENT_DEVICE_TOKEN=dev-token
EOF
```

---

## 5. Bağlantı + auth smoke testleri

```bash
# 5.1 Backend ulaşılabilir mi
curl -v $AGENT_BACKEND_URL/health
# Beklenen: HTTP/1.1 200 OK, body: {"status":"ok"}

# 5.2 GET /api/events çalışıyor mu (auth gerektirmiyor)
curl $AGENT_BACKEND_URL/api/events
# Beklenen: [] veya halihazırda var olan event'lerin JSON listesi

# 5.3 Yanlış token ile POST → 401 dönmeli
curl -X POST -H "Authorization: Bearer YANLIS" \
     -F "payload={\"agent_event_id\":1,\"type\":\"UYUYOR\",\"occurred_at\":\"2026-05-05T12:00:00Z\",\"metadata\":{}};type=application/json" \
     -F "screenshot=@sample_violation.jpg;type=image/jpeg" \
     $AGENT_BACKEND_URL/api/devices/$AGENT_DEVICE_ID/events
# Beklenen: {"detail":"invalid device token"} (401)
```

5.1 hata verirse → Bölüm 1'e dön, ağ sorunu var.
5.3 401 yerine başka kod döndürürse → backend tarafında bir şey yanlış,
PC'deki dashboard'un da çalışmadığını gör.

---

## 6. Asıl test — fixture ihlali gönder

PC'de tarayıcıyı `http://localhost:3000` adresinde aç, dashboard'u görür
hâlde tut.

```bash
# 6.1 İlk UYUYOR ihlali (yeni bir agent_event_id ile)
python3 simulate_event.py --type UYUYOR --agent-event-id 5001
# Beklenen Jetson çıktısı: created event id=<N>
# Beklenen PC tarayıcısı: sol altta toast + listede yeni kart (kırmızı UYUYOR rozeti)

# 6.2 Karta tıklayınca lightbox açılmalı (görsel teyit, insan gerek)

# 6.3 Farklı tür
python3 simulate_event.py --type GOZ_KAPALI --agent-event-id 5002
# Beklenen: yeni bir kart (turuncu GOZ_KAPALI rozeti)

python3 simulate_event.py --type HAREKETSIZ --agent-event-id 5003
# Beklenen: yeni bir kart (sarı HAREKETSIZ rozeti)

# 6.4 İdempotency — aynı agent_event_id ile tekrar dene
python3 simulate_event.py --type UYUYOR --agent-event-id 5001
# Beklenen Jetson: already recorded (409): agent_event_id=5001
# Beklenen PC: HİÇBİR yeni kart eklenmemeli, toast düşmemeli

# 6.5 Backend'in event sayısı doğru
curl $AGENT_BACKEND_URL/api/events | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d), 'events')"
# Beklenen: 3 events (5001, 5002, 5003)
```

---

## 7. Hata-çözüm tablosu

Aşağıdaki herhangi bir hata gözüktüğünde sol kolondaki belirtiyi bulup sağ
kolondaki adımı uygula.

| Hata / Belirti | Olası neden | Çözüm |
|---|---|---|
| `curl: (7) Failed to connect ... Connection refused` | Backend dinlemiyor | PC'de `docker compose ps` — backend `Up` mı? Değilse `docker compose up -d backend` |
| `curl: (7) Connection timed out` veya `No route to host` | Ağ kesiliyor (firewall veya AP isolation) | Bölüm 1.5 → AP isolation kapat, kablolu dene |
| `requests.exceptions.ConnectionError` | Aynı sebep | Aynı çözüm |
| `401 invalid device token` | `AGENT_DEVICE_TOKEN` env doğru değil | Bölüm 4'teki ENV'leri tekrar set et |
| `404 Not Found` POST'ta | `AGENT_DEVICE_ID` UUID'si seedlenen device ile eşleşmiyor | UUID `00000000-0000-0000-0000-000000000001` olmalı |
| `created event` döner ama dashboard'da toast YOK | Tarayıcının WS bağlantısı kopuk | Tarayıcıda F12 → Network → WS sekmesi → `/ws/panel` durumu kontrol; dashboard sayfasını yeniden yükle |
| `created event` döner ama kart'taki resim kırık | Tarayıcı backend'e ulaşamıyor (uploads/) | PC tarayıcısında `http://localhost:8000/uploads/<dev>/<id>.jpg` doğrudan açılıyor mu — açılmıyorsa backend sorunu |
| `Screenshot not found: ...` | `sample_violation.jpg` bu klasörde değil | `ls *.jpg` — yoksa `cp ../fixtures/sample_violation.jpg .` |
| Pip install hata: `ERROR: Could not find a version that satisfies` | Python 3.6 + güncel paket sürümleri uyumsuz | `pip install "requests>=2.27,<2.32"` (requests 2.32 sadece 3.8+) |
| `pip install` çok yavaş | Jetson Nano CPU yavaş + index latency | Sabırlı bekle, normal — `requests` kurulumu 1-2 dk sürebilir |

---

## 8. Acceptance criteria (test geçer/kalır)

Aşağıdaki 5 madde HEPSİ "yes" olmadan test geçmemiş sayılır:

- [ ] Bölüm 1'de `ping -c 5 192.168.1.136` 0% packet loss
- [ ] Bölüm 5.1'de `curl /health` → `{"status":"ok"}`
- [ ] Bölüm 6.1'de `python3 simulate_event.py --type UYUYOR ...` → `created event id=<N>`
- [ ] PC tarayıcısında toast + yeni kart görünüyor (görsel teyit)
- [ ] Bölüm 6.4'de duplikat çağrı `409 already recorded` veriyor

---

## 9. Bir sonraki adım (test başarılı olunca)

Demo akışı uçtan uca çalıştığı doğrulandığında, gerçek `guardwatch_ds.py` ile
entegrasyon yapılır. Bu adım **bu runbook'un kapsamı dışındadır** — şu an
sadece "ağ + auth + dashboard akışı çalışıyor mu" doğrulanır.

Faz 2 işi:
- `app.log` dosyasını tail eden bir daemon yaz (Jetson'da systemd unit)
- `IHLALI BASLADI` satırını parse et
- `kayitlar/<gun>/ihlal_<id>_<DURUM>.jpg` dosyasını oku
- `simulate_event.py`'deki `send_event()` çağrısını otomatik yap

Bu daemon, mevcut `guardwatch_ds.py`'a **hiç dokunmaz** — sadece çıktı
dosyalarını okur. Plan'da `docs/specs/2026-05-05-violation-flow-demo-first-design.md`
§9'da Faz 2 olarak listelenmiş.

---

## 10. AI ajanları için talimat

Eğer bu runbook'u okuyan bir Claude/AI ajan ise:

1. Her komutu çalıştır, çıktıyı **tam olarak** kullanıcıya yapıştır
2. Beklenen çıktı ile gerçek çıktıyı karşılaştır
3. Bölüm 7'deki tabloyu kullanarak hata teşhisi yap
4. Bölüm 1.5'teki ping çalışmadan Bölüm 5'e GEÇME
5. Bölüm 8'deki acceptance maddelerini sırayla işaretle
6. Tüm madde işaretlenmeden "test başarılı" raporu verme
7. Görsel teyit gerektiren adımlarda (toast, kart, lightbox) kullanıcıya
   "tarayıcıda X gördün mü?" diye sor — ekran kontrolü AI'da yok
8. Sorun çıktığında BLOCKED durumu raporla, çözüm öneri ver, kullanıcı
   onayı olmadan destructive komut çalıştırma (örn `iptables flush`,
   `apt remove`)
9. Tüm değişikliklerini Jetson üzerinde **kullanıcı klasörüne** yap, sudo
   gerektirmeyen yerlerde sudo kullanma

---

## Hızlı başvuru — copy-paste blok

Tüm gerekli adımlar tek seferde:

```bash
# Ağ doğrula
ip addr | grep "inet "
ping -c 3 192.168.1.1
ping -c 5 192.168.1.136

# Klonla, kur
cd ~ && git clone <REPO-URL> guardwatch_website
cd ~/guardwatch_website/agent/jetson
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Env (PC IP'sini güncelle)
export AGENT_BACKEND_URL=http://192.168.1.136:8000
export AGENT_DEVICE_ID=00000000-0000-0000-0000-000000000001
export AGENT_DEVICE_TOKEN=dev-token

# Smoke test
curl $AGENT_BACKEND_URL/health
python3 simulate_event.py --type UYUYOR --agent-event-id 5001
python3 simulate_event.py --type GOZ_KAPALI --agent-event-id 5002
python3 simulate_event.py --type UYUYOR --agent-event-id 5001  # 409 beklenir
curl $AGENT_BACKEND_URL/api/events
```
