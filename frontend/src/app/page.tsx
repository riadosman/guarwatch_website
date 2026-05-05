"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { EventLightbox } from "@/components/EventLightbox";
import { EventList } from "@/components/EventList";
import { useEventStream } from "@/hooks/useEventStream";
import { absoluteUrl } from "@/lib/api";
import type { ViolationEvent } from "@/lib/types";

export default function DashboardPage() {
  const { events, status, latest } = useEventStream();
  const [selected, setSelected] = useState<ViolationEvent | null>(null);

  useEffect(() => {
    if (!latest) return;
    const url = absoluteUrl(latest.screenshot_url);
    toast(latest.type, {
      description: `Track ${latest.track_id ?? "?"} · ${latest.occurred_at}`,
      icon: url ? <img src={url} alt="" className="h-10 w-10 rounded object-cover" /> : null,
      action: { label: "Inspect", onClick: () => setSelected(latest) },
    });
  }, [latest]);

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Guardwatch — Live Violations</h1>
          <p className="text-sm text-muted-foreground">
            {events.length} event{events.length === 1 ? "" : "s"} · ws {status}
          </p>
        </div>
      </header>
      <EventList events={events} onSelect={setSelected} />
      <EventLightbox event={selected} onClose={() => setSelected(null)} />
    </main>
  );
}
