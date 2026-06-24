param(
    [string]$DeviceName = "Jetson-Test",
    [switch]$Build
)

function log  { param($m) Write-Host "[GW] $m" -ForegroundColor Cyan }
function ok   { param($m) Write-Host "[OK] $m" -ForegroundColor Green }
function warn { param($m) Write-Host "[!]  $m" -ForegroundColor Yellow }
function die  { param($m) Write-Host "[ERR] $m" -ForegroundColor Red; exit 1 }
function sep  { Write-Host "========================================" -ForegroundColor White }

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    die "Docker kurulu degil."
}

$composeFiles = @("-f", "docker-compose.yml", "-f", "docker-compose.quicktunnel.yml")

Write-Host ""
sep
Write-Host "  GuardWatch - Jetson Test Modu" -ForegroundColor White
sep
Write-Host ""

log "Stack baslatiliyor..."

$upArgs = @("compose") + $composeFiles + @("up", "-d")
if ($Build) { $upArgs += "--build" }

& docker @upArgs
if ($LASTEXITCODE -ne 0) { die "docker compose up basarisiz" }
ok "Servisler baslatildi"

log "Cloudflare Tunnel URL bekleniyor (max 60s)..."
$relayHttps = $null

for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 2
    $logArgs = @("compose") + $composeFiles + @("logs", "cloudflared")
    $logs = (& docker @logArgs 2>&1) | Out-String
    $match = [regex]::Match($logs, 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($match.Success) {
        $relayHttps = $match.Value
        break
    }
    Write-Host "  ...bekleniyor ($([int](($i+1)*2))s / 60s)" -ForegroundColor DarkGray
}

if (-not $relayHttps) {
    warn "Tunnel URL alinamadi. Log kontrol:"
    Write-Host ""
    Write-Host "  docker compose -f docker-compose.yml -f docker-compose.quicktunnel.yml logs cloudflared" -ForegroundColor Gray
    die "Tunnel baslatılamadi"
}

$relayWss = $relayHttps -replace "^https://", "wss://"
$bootstrapCmd = "sudo bash bootstrap.sh --relay $relayWss/agent --name `"$DeviceName`""

Write-Host ""
sep
Write-Host "  HAZIR" -ForegroundColor Green
sep
Write-Host ""
Write-Host "  Relay WebSocket : $relayWss" -ForegroundColor Cyan
Write-Host "  Frontend        : http://localhost:3000" -ForegroundColor Cyan
Write-Host "  Backend API     : http://localhost:8000" -ForegroundColor Cyan
Write-Host ""
sep
Write-Host "  JETSONDA CALISTIR:" -ForegroundColor Yellow
sep
Write-Host ""
Write-Host "  $bootstrapCmd" -ForegroundColor White
Write-Host ""
sep
Write-Host ""

try {
    $bootstrapCmd | Set-Clipboard
    ok "Komut panoya kopyalandi"
} catch {}

Write-Host ""
warn "Not: *.trycloudflare.com URL her yeniden baslatmada degisir."
warn "Kalici URL icin Cloudflare Zero Trust -> Named Tunnel kullan."
Write-Host ""
Write-Host "Log izlemek icin:" -ForegroundColor Cyan
Write-Host "  docker compose -f docker-compose.yml -f docker-compose.quicktunnel.yml logs -f"
Write-Host ""
