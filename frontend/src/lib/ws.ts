import type { PanelMessage } from "./types";

const WS_BASE = process.env.NEXT_PUBLIC_BACKEND_WS_URL ?? "ws://localhost:8000";

export interface PanelHandle {
  close(): void;
}

export interface OpenPanelOptions {
  onMessage: (msg: PanelMessage) => void;
  onStatusChange?: (status: "open" | "closed") => void;
  onReconnect?: () => void;
}

async function fetchWsTicket(): Promise<string | null> {
  try {
    const res = await fetch("/ws/ticket", { credentials: "include" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.ticket ?? null;
  } catch {
    return null;
  }
}

export function openPanelWs(opts: OpenPanelOptions): PanelHandle {
  const { onMessage, onStatusChange, onReconnect } = opts;
  let closed = false;
  let ws: WebSocket | null = null;
  let backoffMs = 1000;
  let hasOpenedOnce = false;

  const connect = async () => {
    if (closed) return;

    // Bilet al, query param olarak ekle (cookie port engelini aşar)
    const ticket = await fetchWsTicket();
    const url = ticket
      ? `${WS_BASE}/ws/panel?token=${ticket}`
      : `${WS_BASE}/ws/panel`;

    ws = new WebSocket(url);

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
