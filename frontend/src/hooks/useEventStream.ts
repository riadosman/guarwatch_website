"use client";

import { useCallback, useEffect, useState } from "react";

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
        if (msg.type === "event_created") {
          setEvents((prev) => {
            if (prev.some((e) => e.id === msg.payload.id)) return prev;
            return [msg.payload, ...prev];
          });
          setLatest(msg.payload);
        } else if (msg.type === "event_deleted") {
          const removedId = msg.payload.id;
          setEvents((prev) => prev.filter((e) => e.id !== removedId));
          setLatest((cur) => (cur && cur.id === removedId ? null : cur));
        } else if (msg.type === "events_cleared") {
          setEvents([]);
          setLatest(null);
        }
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

  const removeLocal = useCallback((id: number) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    setLatest((cur) => (cur && cur.id === id ? null : cur));
  }, []);

  const clearLocal = useCallback(() => {
    setEvents([]);
    setLatest(null);
  }, []);

  return { events, status, latest, removeLocal, clearLocal };
}
