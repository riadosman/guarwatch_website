# Cloudflare Tunnel Kurulum

1. cloudflared kur:
   curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o cloudflared.deb
   dpkg -i cloudflared.deb

2. Tunnel oluştur:
   cloudflared tunnel login
   cloudflared tunnel create guardwatch-relay

3. Config yaz (~/.cloudflared/config.yml):
   tunnel: <TUNNEL_ID>
   credentials-file: /root/.cloudflared/<TUNNEL_ID>.json
   ingress:
     - hostname: relay.guardwatch.io
       service: http://localhost:8765
     - service: http_status:404

4. DNS kaydı ekle:
   cloudflared tunnel route dns guardwatch-relay relay.guardwatch.io

5. Servis olarak çalıştır:
   cloudflared service install
   systemctl start cloudflared
