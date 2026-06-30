#!/bin/bash
# ============================================================
# GuardWatch Agent Kurulum Scripti
# ============================================================
# SD kart hazırlanırken BİR KEZ çalıştırılır.
# Her Jetson'un SD kartına farklı DEVICE_NAME verilebilir.
#
# Kullanım:
#   sudo bash install_agent.sh \
#     --backend  https://guardwatch.orneksite.com \
#     --relay    wss://guardwatch.orneksite.com/relay \
#     --secret   guardwatch-bootstrap-2026 \
#     --name     Kule-1
#
# Sonuç: Jetson'a elektrik verildiğinde otomatik olarak
# sunucuya kayıt olur ve dashboard'da görünür.
# ============================================================

set -e

BACKEND_URL=""
RELAY_WS_URL=""
BOOTSTRAP_SECRET=""
DEVICE_NAME="$(hostname)"
INSTALL_DIR="/opt/guardwatch"
CONF_DIR="/etc/guardwatch"
AGENT_USER="guardwatch"

# ── Argümanları parse et ──────────────────────────────────────

while [[ $# -gt 0 ]]; do
    case $1 in
        --backend)  BACKEND_URL="$2";      shift 2 ;;
        --relay)    RELAY_WS_URL="$2";     shift 2 ;;
        --secret)   BOOTSTRAP_SECRET="$2"; shift 2 ;;
        --name)     DEVICE_NAME="$2";      shift 2 ;;
        *) echo "Bilinmeyen parametre: $1"; exit 1 ;;
    esac
done

# ── Doğrulama ─────────────────────────────────────────────────

if [[ -z "$BACKEND_URL" || -z "$RELAY_WS_URL" || -z "$BOOTSTRAP_SECRET" ]]; then
    echo "HATA: --backend, --relay ve --secret zorunludur."
    echo "Kullanım: sudo bash install_agent.sh --backend URL --relay WS_URL --secret SECRET --name AD"
    exit 1
fi

if [[ "$EUID" -ne 0 ]]; then
    echo "HATA: Bu script root yetkisiyle çalıştırılmalıdır (sudo)."
    exit 1
fi

echo "=============================================="
echo "  GuardWatch Agent Kuruluyor"
echo "  Backend : $BACKEND_URL"
echo "  Relay   : $RELAY_WS_URL"
echo "  Cihaz   : $DEVICE_NAME"
echo "=============================================="

# ── Python bağımlılıkları ──────────────────────────────────────

echo "[1/5] Python bağımlılıkları kuruluyor..."
apt-get update -qq
apt-get install -y -qq python3 python3-pip python3-venv portaudio19-dev
python3 -m pip install --quiet httpx websockets sounddevice numpy

# ── Dizinler ──────────────────────────────────────────────────

echo "[2/5] Dizinler oluşturuluyor..."
mkdir -p "$INSTALL_DIR" "$CONF_DIR"

# ── Agent scripti kopyala ──────────────────────────────────────

echo "[3/5] Agent scripti kopyalanıyor..."
cp "$(dirname "$0")/guardwatch_agent.py" "$INSTALL_DIR/guardwatch_agent.py"
chmod +x "$INSTALL_DIR/guardwatch_agent.py"

# ── Konfigürasyon ──────────────────────────────────────────────

echo "[4/5] Konfigürasyon yazılıyor..."
cat > "$CONF_DIR/agent.conf" <<EOF
# GuardWatch Agent Konfigürasyonu
# Bu dosya systemd tarafından EnvironmentFile olarak okunur.
BACKEND_URL=$BACKEND_URL
RELAY_WS_URL=$RELAY_WS_URL
BOOTSTRAP_SECRET=$BOOTSTRAP_SECRET
DEVICE_NAME=$DEVICE_NAME
EOF
chmod 600 "$CONF_DIR/agent.conf"
echo "  Konfigürasyon: $CONF_DIR/agent.conf"

# ── Systemd service ────────────────────────────────────────────

echo "[5/5] Systemd servisi oluşturuluyor..."
cat > /etc/systemd/system/guardwatch-agent.service <<EOF
[Unit]
Description=GuardWatch Jetson Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
EnvironmentFile=$CONF_DIR/agent.conf
ExecStart=/usr/bin/python3 $INSTALL_DIR/guardwatch_agent.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=guardwatch-agent

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable guardwatch-agent
systemctl start  guardwatch-agent

# ── Sonuç ──────────────────────────────────────────────────────

echo ""
echo "=============================================="
echo "  ✅ Kurulum tamamlandı!"
echo ""
echo "  Durumu kontrol et:"
echo "    sudo systemctl status guardwatch-agent"
echo ""
echo "  Logları izle:"
echo "    sudo journalctl -u guardwatch-agent -f"
echo "=============================================="
