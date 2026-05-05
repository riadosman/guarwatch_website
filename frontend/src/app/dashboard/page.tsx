"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { EventLightbox } from "@/components/EventLightbox";
import { EventList } from "@/components/EventList";
import { Navbar } from "@/components/Navbar";
import { StatsBar } from "@/components/StatsBar";
import { TypeFilter } from "@/components/TypeFilter";
import { useEventStream } from "@/hooks/useEventStream";
import { absoluteUrl } from "@/lib/api";
import { VIOLATION_LABEL, formatRelative } from "@/lib/format";
import type { ViolationEvent, ViolationType } from "@/lib/types";

export default function DashboardPage() {
  const { events, status, latest } = useEventStream();
  const [selected, setSelected] = useState<ViolationEvent | null>(null);
  const [filter, setFilter] = useState<ViolationType | "ALL">("ALL");

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
          className="h-10 w-14 rounded object-cover ring-1 ring-white/10"
        />
      ) : null,
      action: { label: "İncele", onClick: () => setSelected(latest) },
    });
  }, [latest]);

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

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <Navbar variant="app" />
      <main className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 sm:py-10">
        <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Canlı İhlal Akışı
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              Filodaki Jetson cihazlarından gelen tüm tespitler — yeni event
              geldiğinde otomatik güncellenir.
            </p>
          </div>
          <div className="flex items-center gap-2 self-start text-xs text-zinc-500 sm:self-auto">
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

        <StatsBar events={events} status={status} />

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-medium text-zinc-300">
              {filtered.length} {filter === "ALL" ? "" : VIOLATION_LABEL[filter] + " "}
              ihlal
            </h2>
            <TypeFilter active={filter} counts={counts} onChange={setFilter} />
          </div>

          <EventList events={filtered} onSelect={setSelected} />
        </section>

        <EventLightbox event={selected} onClose={() => setSelected(null)} />
      </main>
    </div>
  );
}
