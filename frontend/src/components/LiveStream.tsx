"use client";

import { useEffect, useRef, useState } from "react";
import { Radio, WifiOff } from "lucide-react";

interface Props {
  deviceId: string;
  camId: string;
  relayUrl: string;
}

export function LiveStream({ deviceId, camId, relayUrl }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"connecting" | "live" | "error">("connecting");

  useEffect(() => {
    const ws = new WebSocket(`${relayUrl}/stream/${deviceId}/${camId}`);

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
        // parse error — ignore malformed frame
      }
    };

    ws.onerror = () => setStatus("error");
    ws.onclose = () => { if (status !== "error") setStatus("error"); };

    return () => { ws.close(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, camId, relayUrl]);

  return (
    <div className="rounded-xl overflow-hidden border bg-black shadow-sm dark:border-zinc-700">
      <div className="relative aspect-video bg-zinc-950 flex items-center justify-center">
        {status === "connecting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-zinc-400">
            <Radio className="h-8 w-8 animate-pulse" />
            <p className="text-sm">Bağlanılıyor…</p>
          </div>
        )}
        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-red-400">
            <WifiOff className="h-8 w-8" />
            <p className="text-sm">Bağlantı kesildi</p>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="w-full h-full object-contain"
          style={{ display: status === "live" ? "block" : "none" }}
        />
      </div>
      <div className="flex items-center gap-2 px-4 py-2 border-t bg-zinc-900 border-zinc-800">
        <span className="relative flex h-2 w-2">
          {status === "live" && (
            <span className="absolute inset-0 animate-ping rounded-full bg-red-400 opacity-75" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              status === "live"
                ? "bg-red-500"
                : status === "connecting"
                ? "bg-amber-500"
                : "bg-zinc-600"
            }`}
          />
        </span>
        <span className="text-xs text-zinc-400 font-medium">
          {status === "live" ? "CANLI" : status === "connecting" ? "BAĞLANILIYOR" : "BAĞLANTI YOK"}
        </span>
      </div>
    </div>
  );
}
