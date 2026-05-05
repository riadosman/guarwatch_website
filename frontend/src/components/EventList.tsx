"use client";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { absoluteUrl } from "@/lib/api";
import type { ViolationEvent, ViolationType } from "@/lib/types";

const TYPE_COLOR: Record<ViolationType, string> = {
  UYUYOR: "bg-red-600 text-white",
  GOZ_KAPALI: "bg-orange-500 text-white",
  HAREKETSIZ: "bg-amber-500 text-black",
  TAKIP_KAYBEDILDI: "bg-zinc-500 text-white",
};

interface Props {
  events: ViolationEvent[];
  onSelect: (event: ViolationEvent) => void;
}

export function EventList({ events, onSelect }: Props) {
  if (events.length === 0) {
    return (
      <Card className="p-8 text-center text-muted-foreground">
        No violations yet — waiting for the first event.
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => {
        const url = absoluteUrl(event.screenshot_url);
        return (
          <button
            key={event.id}
            type="button"
            onClick={() => onSelect(event)}
            className="text-left transition hover:scale-[1.01] focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <Card className="overflow-hidden">
              {url ? (
                <img src={url} alt={event.type} className="aspect-video w-full object-cover" />
              ) : (
                <div className="flex aspect-video items-center justify-center bg-muted text-muted-foreground">
                  no image
                </div>
              )}
              <div className="space-y-1 p-3">
                <div className="flex items-center justify-between">
                  <Badge className={TYPE_COLOR[event.type]}>{event.type}</Badge>
                  <span className="text-xs text-muted-foreground">
                    Track {event.track_id ?? "?"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">{event.occurred_at}</p>
              </div>
            </Card>
          </button>
        );
      })}
    </div>
  );
}
