import type { PanelMessage } from "./types";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000";

export interface PanelHandle {
  close(): void;
}

export function openPanelWs(
  onMessage: (msg: PanelMessage) => void,
  onStatusChange?: (status: "open" | "closed") => void,
): PanelHandle {
  let closed = false;
  let ws: WebSocket | null = null;
  let backoffMs = 1000;

  const connect = () => {
    if (closed) return;
    ws = new WebSocket(`${WS_URL}/ws/panel`);
    ws.onopen = () => {
      backoffMs = 1000;
      onStatusChange?.("open");
    };
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as PanelMessage;
        if (data?.type === "event_created") onMessage(data);
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
