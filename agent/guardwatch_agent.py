#!/usr/bin/env python3
"""
GuardWatch Jetson Agent
=======================
Boot'ta otomatik çalışır (systemd servisi olarak).

Yaptıkları:
  1. İlk açılışta sunucuya bootstrap isteği gönderir → device_id + token alır
  2. Relay'e WebSocket bağlantısı kurar
  3. Her 10s'de heartbeat gönderir → dashboard'da yeşil gösterir
  4. CV pipeline'dan gelen ihlalleri relay'e iletir
  5. Bağlantı kesilirse otomatik yeniden bağlanır

Ortam değişkenleri (agent.conf):
  BACKEND_URL       = https://guardwatch.orneksite.com  (sunucunun URL'i)
  RELAY_WS_URL      = wss://guardwatch.orneksite.com/relay  (relay WebSocket)
  BOOTSTRAP_SECRET  = guardwatch-bootstrap-2026
  DEVICE_NAME       = Kule-1  (isteğe bağlı, hostname kullanılır yoksa)
"""

import asyncio
import json
import logging
import os
import socket
import sys
import time
import uuid
from pathlib import Path

try:
    import httpx
    import websockets
except ImportError:
    os.system(f"{sys.executable} -m pip install httpx websockets")
    import httpx
    import websockets

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("/var/log/guardwatch-agent.log", mode="a"),
    ],
)
log = logging.getLogger("guardwatch-agent")

# ── Konfigürasyon ──────────────────────────────────────────────────────────────

DEVICE_FILE     = Path("/etc/guardwatch/device.json")
CONF_FILE       = Path("/etc/guardwatch/agent.conf")

BACKEND_URL     = os.getenv("BACKEND_URL",      "http://192.168.1.179:8000")
RELAY_WS_URL    = os.getenv("RELAY_WS_URL",     "ws://192.168.1.179:8765")
BOOTSTRAP_SECRET = os.getenv("BOOTSTRAP_SECRET", "guardwatch-bootstrap-dev-secret")
DEVICE_NAME     = os.getenv("DEVICE_NAME",       socket.gethostname())

HEARTBEAT_INTERVAL = 10   # saniye
RECONNECT_BASE     = 5    # saniye
RECONNECT_MAX      = 60   # saniye


# ── Conf dosyasını yükle (systemd EnvironmentFile) ────────────────────────────

def _load_conf():
    if CONF_FILE.exists():
        for line in CONF_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

_load_conf()

# Conf sonrası değerleri yeniden al
BACKEND_URL      = os.getenv("BACKEND_URL",      BACKEND_URL)
RELAY_WS_URL     = os.getenv("RELAY_WS_URL",     RELAY_WS_URL)
BOOTSTRAP_SECRET = os.getenv("BOOTSTRAP_SECRET", BOOTSTRAP_SECRET)
DEVICE_NAME      = os.getenv("DEVICE_NAME",      DEVICE_NAME)


# ── Device kimliği ─────────────────────────────────────────────────────────────

def load_device() -> dict | None:
    """Kayıtlı device bilgisini döner, yoksa None."""
    if DEVICE_FILE.exists():
        try:
            data = json.loads(DEVICE_FILE.read_text())
            if data.get("device_id") and data.get("token"):
                return data
        except Exception:
            pass
    return None


def save_device(data: dict) -> None:
    DEVICE_FILE.parent.mkdir(parents=True, exist_ok=True)
    DEVICE_FILE.write_text(json.dumps(data, indent=2))
    log.info(f"Device bilgisi kaydedildi: {DEVICE_FILE}")


async def bootstrap() -> dict:
    """Sunucuya bootstrap isteği gönderir, device_id + token alır."""
    url = f"{BACKEND_URL}/api/devices/bootstrap"
    log.info(f"Bootstrap isteği gönderiliyor: {url}")

    async with httpx.AsyncClient(timeout=30.0) as client:
        for attempt in range(1, 6):
            try:
                resp = await client.post(
                    url,
                    json={"name": DEVICE_NAME},
                    headers={"Authorization": f"Bearer {BOOTSTRAP_SECRET}"},
                )
                if resp.status_code == 201:
                    data = resp.json()
                    log.info(f"Bootstrap başarılı! device_id={data['device_id']}")
                    return data
                else:
                    log.error(f"Bootstrap başarısız: HTTP {resp.status_code} — {resp.text}")
            except Exception as e:
                log.warning(f"Bootstrap denemesi {attempt}/5 başarısız: {e}")

            await asyncio.sleep(10 * attempt)

    raise RuntimeError("Bootstrap 5 denemede başarısız oldu. Sunucu erişilebilir mi?")


# ── Violation kuyruğu (CV pipeline buraya koyar) ──────────────────────────────

violation_queue: asyncio.Queue = asyncio.Queue()


def send_violation(violation_type: str, screenshot_b64: str | None = None, meta: dict | None = None):
    """CV pipeline bu fonksiyonu çağırarak ihlal gönderir."""
    violation_queue.put_nowait({
        "ch": 1,
        "type": "violation",
        "data": {
            "violation_type": violation_type,
            "screenshot_b64": screenshot_b64,
            "meta": meta or {},
            "timestamp": time.time(),
        }
    })


# ── Ses (Mikrofon) Akışı ──────────────────────────────────────────────────────

AUDIO_SAMPLE_RATE  = 16000   # Hz
AUDIO_CHUNK_MS     = 100     # ms başına chunk (1600 sample)
AUDIO_CHUNK_FRAMES = AUDIO_SAMPLE_RATE * AUDIO_CHUNK_MS // 1000

_audio_active = False


async def audio_stream_loop(ws, device_id: str):
    """Relay audio_start komutu gelince mikrofonu açar, audio_stop gelince kapatır."""
    global _audio_active

    try:
        import base64
        import numpy as np
        import sounddevice as sd
    except ImportError:
        log.warning("Ses desteği için: pip install sounddevice numpy")
        return

    log.info("Ses akışı döngüsü başladı (komut bekleniyor...)")

    audio_queue: asyncio.Queue = asyncio.Queue(maxsize=50)
    loop = asyncio.get_event_loop()

    def sd_callback(indata, frames, time_info, status):
        if not _audio_active:
            return
        pcm = (indata[:, 0] * 32767).astype(np.int16).tobytes()
        b64 = base64.b64encode(pcm).decode()
        try:
            audio_queue.put_nowait(b64)
        except asyncio.QueueFull:
            pass  # tarayıcı yavaşsa frame'leri düşür

    stream = sd.InputStream(
        samplerate=AUDIO_SAMPLE_RATE,
        channels=1,
        dtype="float32",
        blocksize=AUDIO_CHUNK_FRAMES,
        callback=sd_callback,
    )

    try:
        with stream:
            while True:
                chunk_b64 = await audio_queue.get()
                if not _audio_active:
                    # Boşalt ve bekle
                    while not audio_queue.empty():
                        audio_queue.get_nowait()
                    await asyncio.sleep(0.1)
                    continue
                await ws.send(json.dumps({
                    "ch": 4,
                    "type": "audio_chunk",
                    "data": chunk_b64,
                    "sr": AUDIO_SAMPLE_RATE,
                }))
    except Exception as e:
        log.error(f"Ses akışı hatası: {e}")


# ── Ana relay bağlantısı ───────────────────────────────────────────────────────

async def run_agent():
    device = load_device()

    # İlk açılış: bootstrap
    if device is None:
        log.info("Kayıtlı device bulunamadı. Bootstrap yapılıyor...")
        device = await bootstrap()
        save_device(device)

    device_id = device["device_id"]
    log.info(f"Device ID: {device_id} | Cihaz: {DEVICE_NAME}")
    log.info(f"Relay'e bağlanılıyor: {RELAY_WS_URL}/agent")

    backoff = RECONNECT_BASE

    while True:
        try:
            async with websockets.connect(
                f"{RELAY_WS_URL}/agent",
                ping_interval=20,
                ping_timeout=15,
                open_timeout=10,
            ) as ws:
                backoff = RECONNECT_BASE  # başarılı bağlantı, sıfırla
                log.info("Relay bağlantısı kuruldu ✓")

                # Hello gönder
                await ws.send(json.dumps({
                    "ch": 0,
                    "type": "hello",
                    "device_id": device_id,
                    "secret": "",
                }))

                async def heartbeat_loop():
                    while True:
                        await asyncio.sleep(HEARTBEAT_INTERVAL)
                        await ws.send(json.dumps({"ch": 0, "type": "heartbeat"}))
                        log.debug("Heartbeat ✓")

                async def violation_sender():
                    while True:
                        msg = await violation_queue.get()
                        await ws.send(json.dumps(msg))
                        log.info(f"İhlal gönderildi: {msg['data'].get('violation_type')}")

                async def message_receiver():
                    global _audio_active
                    async for raw in ws:
                        msg = json.loads(raw)
                        mtype = msg.get("type", "")
                        ch    = msg.get("ch", 0)

                        if mtype == "code":
                            log.info(f"Pairing kodu (bootstrap modunda kullanılmaz): {msg.get('code')}")

                        elif mtype == "paired":
                            log.info("Cihaz eşleştirildi (relay onayı)")

                        elif mtype == "audio_start":
                            log.info("Ses akışı başlatılıyor 🎙️")
                            _audio_active = True

                        elif mtype == "audio_stop":
                            log.info("Ses akışı durduruldu")
                            _audio_active = False

                        elif mtype == "term_input" and ch >= 2:
                            cmd = msg.get("data", "")
                            try:
                                import subprocess
                                result = subprocess.run(
                                    cmd, shell=True, capture_output=True, text=True, timeout=10
                                )
                                output = (result.stdout + result.stderr)[:4096]
                            except Exception as e:
                                output = f"HATA: {e}"
                            await ws.send(json.dumps({
                                "ch": ch, "type": "term_out", "data": output
                            }))

                        else:
                            log.debug(f"Mesaj: ch={ch} type={mtype}")

                await asyncio.gather(
                    heartbeat_loop(),
                    violation_sender(),
                    message_receiver(),
                    audio_stream_loop(ws, device_id),
                )

        except (ConnectionRefusedError, OSError) as e:
            log.warning(f"Bağlantı reddedildi: {e}")
        except websockets.exceptions.ConnectionClosed as e:
            log.warning(f"Bağlantı kapandı: {e}")
        except Exception as e:
            log.error(f"Beklenmedik hata: {e}", exc_info=True)

        log.info(f"{backoff}s sonra yeniden bağlanılacak...")
        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, RECONNECT_MAX)


if __name__ == "__main__":
    try:
        asyncio.run(run_agent())
    except KeyboardInterrupt:
        log.info("Agent durduruldu.")
