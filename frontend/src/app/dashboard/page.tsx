"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { DevToolbar } from "@/components/DevToolbar";
import { EventLightbox } from "@/components/EventLightbox";
import { EventList } from "@/components/EventList";
import { Navbar } from "@/components/Navbar";
import { StatsBar } from "@/components/StatsBar";
import { TypeFilter } from "@/components/TypeFilter";
import { useEventStream } from "@/hooks/useEventStream";
import { absoluteUrl, deleteEvent } from "@/lib/api";
import { getDevices } from "@/lib/devices";
import { VIOLATION_LABEL, formatRelative } from "@/lib/format";
import type { ViolationEvent, ViolationType } from "@/lib/types";

const SOUND_KEY = "guardwatch.sound";

export default function DashboardPage() {
  const { events, status, latest, removeLocal } = useEventStream();
  const [selected, setSelected] = useState<ViolationEvent | null>(null);
  const [onlineCount, setOnlineCount] = useState(0);

  useEffect(() => {
    getDevices()
      .then((devs) => setOnlineCount(devs.filter((d) => d.status === "online").length))
      .catch(() => {});
    const interval = setInterval(() => {
      getDevices()
        .then((devs) => setOnlineCount(devs.filter((d) => d.status === "online").length))
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(interval);
  }, []);
  const [filter, setFilter] = useState<ViolationType | "ALL">("ALL");
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const lastBeepedIdRef = useRef<number | null>(null);

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(SOUND_KEY) : null;
    if (stored === "1") setSoundEnabled(true);
  }, []);

  const toggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SOUND_KEY, next ? "1" : "0");
      } catch {
        // localStorage unavailable
      }
      if (next && !audioCtxRef.current && typeof window !== "undefined") {
        const Ctx =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (Ctx) audioCtxRef.current = new Ctx();
      }
      return next;
    });
  }, []);

  const playBeep = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(660, now + 0.18);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.34);
    } catch {
      // audio errors silent
    }
  }, []);

  useEffect(() => {
    if (!latest) return;
    const url = absoluteUrl(latest.screenshot_url);
    toast(VIOLATION_LABEL[latest.type], {
      description: `Takip #${latest.track_id ?? "?"} · ${formatRelative(latest.occurred_at)}`,
      icon: url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt=""
          className="h-10 w-14 rounded object-cover ring-1 ring-zinc-200"
        />
      ) : null,
      action: { label: "İncele", onClick: () => setSelected(latest) },
    });

    if (soundEnabled && lastBeepedIdRef.current !== latest.id) {
      playBeep();
      lastBeepedIdRef.current = latest.id;
    }
  }, [latest, soundEnabled, playBeep]);

  const counts = useMemo(() => {
    const c: Record<ViolationType | "ALL", number> = {
      ALL: events.length,
      UYUYOR: 0,
      GOZ_KAPALI: 0,
      HAREKETSIZ: 0,
      TAKIP_KAYBEDILDI: 0,
    };
    for (const e of events) c[e.type]++;
    return c;
  }, [events]);

  const filtered = useMemo(
    () => (filter === "ALL" ? events : events.filter((e) => e.type === filter)),
    [events, filter],
  );

  const handleDelete = useCallback(
    async (event: ViolationEvent) => {
      removeLocal(event.id);
      if (selected?.id === event.id) setSelected(null);
      try {
        await deleteEvent(event.id);
        toast.success("İhlal silindi", {
          description: VIOLATION_LABEL[event.type] + " · #" + event.id,
        });
      } catch (err) {
        toast.error("Silme başarısız", {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [removeLocal, selected],
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 via-white to-zinc-50 text-zinc-900 dark:from-zinc-950 dark:via-zinc-900 dark:to-zinc-950 dark:text-zinc-100">
      <Navbar variant="app" />
      <main className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            {onlineCount > 0 ? (
              <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                </span>
                Canlı · {onlineCount} cihaz çevrimiçi · {counts.ALL} kayıt
              </div>
            ) : (
              <div className="mb-1 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-medium text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-400">
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-400" />
                Bağlı cihaz yok — Cihazlar sayfasından Jetson eşleştirin
              </div>
            )}
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-3xl">
              İhlal Akış Paneli
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Güvenlik kulübelerindeki Jetson cihazlarından gelen tüm nöbet
              ihlalleri — yeni event geldiğinde otomatik güncellenir.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 sm:self-auto">
            <span className="relative flex h-2 w-2">
              <span
                className={`absolute inset-0 rounded-full ${
                  status === "open" ? "bg-emerald-400" : "bg-amber-400"
                } ${status === "open" ? "animate-ping" : ""} opacity-60`}
              />
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${
                  status === "open" ? "bg-emerald-500" : "bg-amber-500"
                }`}
              />
            </span>
            WebSocket {status === "open" ? "bağlı" : "bağlanıyor"}
          </div>
        </header>

        <DevToolbar
          soundEnabled={soundEnabled}
          onToggleSound={toggleSound}
          totalEvents={events.length}
        />

        <StatsBar events={events} status={status} />

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {filtered.length} {filter === "ALL" ? "" : VIOLATION_LABEL[filter] + " "}
              ihlal
            </h2>
            <TypeFilter active={filter} counts={counts} onChange={setFilter} />
          </div>

          <EventList events={filtered} onSelect={setSelected} onDelete={handleDelete} />
        </section>

        <EventLightbox
          event={selected}
          onClose={() => setSelected(null)}
          onDelete={handleDelete}
        />
      </main>
    </div>
  );
}
