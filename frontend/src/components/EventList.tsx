"use client";

import { ImageOff } from "lucide-react";

import { absoluteUrl } from "@/lib/api";
import { VIOLATION_LABEL, VIOLATION_TONE, formatAbsolute, formatRelative } from "@/lib/format";
import type { ViolationEvent } from "@/lib/types";

interface Props {
  events: ViolationEvent[];
  onSelect: (event: ViolationEvent) => void;
}

export function EventList({ events, onSelect }: Props) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-16 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white/5">
          <ImageOff className="h-5 w-5 text-zinc-500" />
        </div>
        <p className="mt-4 text-sm font-medium text-zinc-300">
          No violations yet — waiting for the first event.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Jetson agent bağlandığında ihlal tespitleri burada görünecek.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => {
        const url = absoluteUrl(event.screenshot_url);
        const tone = VIOLATION_TONE[event.type];
        return (
          <button
            key={event.id}
            type="button"
            onClick={() => onSelect(event)}
            className={`group overflow-hidden rounded-xl border border-white/5 bg-white/[0.02] text-left transition hover:border-white/15 hover:bg-white/[0.04] focus:outline-none focus:ring-2 ${tone.ring}`}
          >
            <div className="relative aspect-video w-full overflow-hidden bg-zinc-900">
              {url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={VIOLATION_LABEL[event.type]}
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/70 to-transparent" />
                </>
              ) : (
                <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                  görüntü yok
                </div>
              )}
              <div className="absolute left-3 top-3">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide ${tone.chip}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                  {VIOLATION_LABEL[event.type]}
                </span>
              </div>
            </div>
            <div className="space-y-1 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500" title={formatAbsolute(event.occurred_at)}>
                  {formatRelative(event.occurred_at)}
                </span>
                <span className="text-xs font-mono text-zinc-500">
                  Takip #{event.track_id ?? "?"}
                </span>
              </div>
              <p className="text-xs text-zinc-600">
                {formatAbsolute(event.occurred_at)}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
