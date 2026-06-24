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
