"use client";

import { Calendar, Server, Trash2 } from "lucide-react";

import { MetadataDisplay } from "@/components/MetadataDisplay";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { absoluteUrl } from "@/lib/api";
import { VIOLATION_LABEL, VIOLATION_TONE, formatAbsolute, formatRelative } from "@/lib/format";
import type { ViolationEvent } from "@/lib/types";

interface Props {
  event: ViolationEvent | null;
  onClose: () => void;
  onDelete?: (event: ViolationEvent) => void;
}

export function EventLightbox({ event, onClose, onDelete }: Props) {
  const open = event !== null;
  const screenshot = absoluteUrl(event?.screenshot_url ?? null);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="w-[min(96vw,72rem)] max-w-none border-zinc-200 bg-white p-0 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 sm:rounded-xl">
        {event && (
          <div className="grid max-h-[92vh] grid-rows-[1fr_auto] lg:max-h-[88vh] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:grid-rows-1">
            <div className="relative flex min-h-0 items-center justify-center bg-zinc-100 dark:bg-zinc-800">
              {screenshot ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={screenshot}
                  alt={VIOLATION_LABEL[event.type]}
                  className="h-full w-full object-contain"
                />
              ) : (
                <div className="flex aspect-video w-full items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
                  görüntü yok
                </div>
              )}
              <div className="absolute left-4 top-4">
                <span
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold backdrop-blur ${
                    VIOLATION_TONE[event.type].chip
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${VIOLATION_TONE[event.type].dot}`} />
                  {VIOLATION_LABEL[event.type]}
                </span>
              </div>
            </div>

            <div className="flex min-h-0 flex-col gap-5 overflow-y-auto border-t border-zinc-200 p-6 dark:border-zinc-700 lg:border-l lg:border-t-0">
              <div>
                <DialogTitle className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                  İhlal Detayı
                </DialogTitle>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Backend event #{event.id}
                </p>
              </div>

              <dl className="space-y-3 text-sm">
                <Row icon={Calendar} label="Olay zamanı">
                  <span className="text-zinc-900 dark:text-zinc-100">{formatAbsolute(event.occurred_at)}</span>
                  <span className="ml-2 text-zinc-500 dark:text-zinc-400">
                    ({formatRelative(event.occurred_at)})
                  </span>
                </Row>
                <Row icon={Calendar} label="Backend kayıt">
                  <span className="text-zinc-700 dark:text-zinc-300">{formatAbsolute(event.received_at)}</span>
                </Row>
                <Row icon={Server} label="Cihaz">
                  <span className="font-mono text-xs text-zinc-700 dark:text-zinc-300">{event.device_id}</span>
                </Row>
              </dl>

              <div>
                <p className="mb-2 text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Sinyal verileri
                </p>
                <MetadataDisplay
                  metadata={event.metadata}
                  trackId={event.track_id}
                  agentEventId={event.agent_event_id}
                />
              </div>

              {onDelete && (
                <div className="mt-auto flex items-center justify-between border-t border-zinc-200 pt-4 dark:border-zinc-700">
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Bu kayıt geri alınamaz.
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-red-700 hover:bg-red-50 hover:text-red-800 dark:text-red-400 dark:hover:bg-red-950 dark:hover:text-red-300"
                    onClick={() => onDelete(event)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Bu ihlali sil
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        <Icon className="h-3 w-3" />
        {label}
      </dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
