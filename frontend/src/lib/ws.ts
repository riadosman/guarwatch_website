import type { PanelMessage } from "./types";

// Panel WebSocket → backend (/ws/panel). NEXT_PUBLIC_API_URL is http://localhost:3000
// which Next.js proxies to the backend via the /ws/* rewrite in next.config.mjs.
const rawApi = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const WS_BASE = rawApi.replace(/^http/, "ws");

export interface PanelHandle {
  close(): void;
}

export interface OpenPanelOptions {
  onMessage: (msg: PanelMessage) => void;
  onStatusChange?: (status: "open" | "closed") => void;
  onReconnect?: () => void;
}

export function openPanelWs(opts: OpenPanelOptions): PanelHandle {
  const { onMessage, onStatusChange, onReconnect } = opts;
  let closed = false;
  let ws: WebSocket | null = null;
  let backoffMs = 1000;
  let hasOpenedOnce = false;

  const connect = () => {
    if (closed) return;
    ws = new WebSocket(`${WS_BASE}/ws/panel`);
    ws.onopen = () => {
      backoffMs = 1000;
      onStatusChange?.("open");
      if (hasOpenedOnce) {
        onReconnect?.();
      } else {
        hasOpenedOnce = true;
      }
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as PanelMessage;
        if (
          data?.type === "event_created" ||
          data?.type === "event_deleted" ||
          data?.type === "events_cleared"
        ) {
          onMessage(data);
        }
      } catch {
        // ignore malformed
      }
    };
    ws.onclose = () => {
      onStatusChange?.("closed");
      if (closed) return;
      setTimeout(connect, backoffMs);
      backoffMs = Math.min(backoffMs * 2, 10000);
    };
    ws.onerror = () => {
      ws?.close();
    };
  };

  connect();

  return {
    close() {
      closed = true;
      ws?.close();
    },
  };
}
