"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

interface Props {
  deviceId: string;
  relayWsUrl?: string;
}

/**
 * Jetson mikrofonunu tarayıcıda canlı dinler.
 * Relay'in /audio/{deviceId} WebSocket endpoint'ine bağlanır.
 * PCM int16 @ 16kHz → Web Audio API ile çalar.
 */
export default function LiveAudio({ deviceId, relayWsUrl }: Props) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const nextStartRef = useRef<number>(0);
  const SAMPLE_RATE = 16000;

  function buildWsUrl(): string {
    const base =
      relayWsUrl ??
      (typeof window !== "undefined"
        ? `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/relay`
        : "ws://localhost:8765");
    return `${base}/audio/${deviceId}`;
  }

  function startListening() {
    if (wsRef.current) return;
    setError(null);

    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx({ sampleRate: SAMPLE_RATE });
    ctxRef.current = ctx;
    nextStartRef.current = ctx.currentTime + 0.05; // 50ms ön yükleme

    const ws = new WebSocket(buildWsUrl());
    ws.binaryType = "arraybuffer";
    wsRef.current = ws;

    ws.onopen = () => setListening(true);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        if (msg.type !== "audio_chunk" || !msg.data) return;

        // base64 → binary → Int16Array → Float32Array
        const binary = atob(msg.data);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const samples = new Int16Array(bytes.buffer);
        const float32 = new Float32Array(samples.length);
        for (let i = 0; i < samples.length; i++) float32[i] = samples[i] / 32768;

        const buffer = ctx.createBuffer(1, float32.length, SAMPLE_RATE);
        buffer.copyToChannel(float32, 0);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);

        const now = ctx.currentTime;
        const startAt = Math.max(nextStartRef.current, now);
        source.start(startAt);
        nextStartRef.current = startAt + buffer.duration;
      } catch {
        // bozuk frame, sessizce geç
      }
    };

    ws.onerror = () => setError("Bağlantı hatası");
    ws.onclose = () => {
      setListening(false);
      wsRef.current = null;
    };
  }

  function stopListening() {
    wsRef.current?.close();
    wsRef.current = null;
    ctxRef.current?.close();
    ctxRef.current = null;
    setListening(false);
  }

  useEffect(() => () => stopListening(), []);

  return (
    <div className="flex items-center gap-3">
      <Button
        variant={listening ? "destructive" : "outline"}
        size="sm"
        onClick={listening ? stopListening : startListening}
      >
        {listening ? "🔴 Dinlemeyi Durdur" : "🎙️ Canlı Dinle"}
      </Button>
      {listening && (
        <span className="text-xs text-green-500 animate-pulse">● Canlı</span>
      )}
      {error && <span className="text-xs text-red-500">{error}</span>}
    </div>
  );
}
