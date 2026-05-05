"use client";

import { useEffect, useState } from "react";

import { getEvents } from "@/lib/api";
import type { ViolationEvent } from "@/lib/types";
import { openPanelWs } from "@/lib/ws";

export type WsStatus = "open" | "closed";

export function useEventStream() {
  const [events, setEvents] = useState<ViolationEvent[]>([]);
  const [status, setStatus] = useState<WsStatus>("closed");
  const [latest, setLatest] = useState<ViolationEvent | null>(null);

  useEffect(() => {
    let cancelled = false;
    getEvents()
      .then((initial) => {
        if (!cancelled) setEvents(initial);
      })
      .catch(() => {
        // backend down; leave list empty
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handle = openPanelWs({
      onMessage: (msg) => {
        setEvents((prev) => {
          if (prev.some((e) => e.id === msg.payload.id)) return prev;
          return [msg.payload, ...prev];
        });
        setLatest(msg.payload);
      },
      onStatusChange: setStatus,
      onReconnect: () => {
        getEvents()
          .then(setEvents)
          .catch(() => {});
      },
    });
    return () => handle.close();
  }, []);

  return { events, status, latest };
}
