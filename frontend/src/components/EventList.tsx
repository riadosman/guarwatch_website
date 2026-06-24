"use client";

import { ImageOff, Trash2 } from "lucide-react";

import { absoluteUrl } from "@/lib/api";
import { VIOLATION_LABEL, VIOLATION_TONE, formatAbsolute, formatRelative } from "@/lib/format";
import type { ViolationEvent } from "@/lib/types";

interface Props {
  events: ViolationEvent[];
  onSelect: (event: ViolationEvent) => void;
  onDelete?: (event: ViolationEvent) => void;
}

export function EventList({ events, onSelect, onDelete }: Props) {
  if (events.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-16 text-center dark:border-zinc-700 dark:bg-zinc-800">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-zinc-100 dark:bg-zinc-700">
          <ImageOff className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
        </div>
        <p className="mt-4 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          No violations yet — waiting for the first event.
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
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
          <div
            key={event.id}
            className={`group relative overflow-hidden rounded-xl border border-zinc-200 bg-white text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:shadow-lg focus-within:ring-2 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-zinc-600 ${tone.ring}`}
          >
            <button
              type="button"
              onClick={() => onSelect(event)}
              className="block w-full text-left focus:outline-none"
            >
              <div className="relative aspect-video w-full overflow-hidden bg-zinc-100 dark:bg-zinc-700">
                {url ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={VIOLATION_LABEL[event.type]}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.04]"
                    />
                    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                  </>
                ) : (
                  <div className="flex h-full items-center justify-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                    <ImageOff className="h-4 w-4" />
                    görüntü yok
                  </div>
                )}
                <div className="absolute left-3 top-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold tracking-wide shadow-sm backdrop-blur ${tone.chip}`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
                    {VIOLATION_LABEL[event.type]}
                  </span>
                </div>
                {event.metadata?.simulated === true && (
                  <div className="absolute right-3 top-3">
                    <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50/90 px-2 py-0.5 text-[10px] font-medium text-amber-800 shadow-sm backdrop-blur">
                      DEMO
                    </span>
                  </div>
                )}
              </div>
              <div className="space-y-1 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300" title={formatAbsolute(event.occurred_at)}>
                    {formatRelative(event.occurred_at)}
                  </span>
                  <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] font-mono text-zinc-600 dark:bg-zinc-700 dark:text-zinc-400">
                    #{event.track_id ?? "?"}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  {formatAbsolute(event.occurred_at)}
                </p>
              </div>
            </button>

            {onDelete && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(event);
                }}
                className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full border border-red-200 bg-white/90 text-red-600 opacity-0 shadow-sm backdrop-blur transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-700 focus:opacity-100 dark:border-red-800 dark:bg-zinc-800/90 dark:hover:bg-red-950"
                title="İhlali sil"
                aria-label="İhlali sil"
                style={
                  event.metadata?.simulated === true
                    ? { top: "2.4rem" }
                    : undefined
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
