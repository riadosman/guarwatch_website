"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { absoluteUrl } from "@/lib/api";
import type { ViolationEvent } from "@/lib/types";

interface Props {
  event: ViolationEvent | null;
  onClose: () => void;
}

export function EventLightbox({ event, onClose }: Props) {
  const open = event !== null;
  const screenshot = absoluteUrl(event?.screenshot_url ?? null);

  return (
    <Dialog open={open} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="max-w-3xl">
        <DialogTitle>{event?.type ?? ""}</DialogTitle>
        <DialogDescription>
          {event ? `Track ${event.track_id ?? "?"} · ${event.occurred_at}` : ""}
        </DialogDescription>
        {screenshot && (
          <img
            src={screenshot}
            alt={event?.type ?? ""}
            className="max-h-[70vh] w-full rounded object-contain"
          />
        )}
        {event?.metadata && Object.keys(event.metadata).length > 0 && (
          <pre className="rounded bg-muted p-3 text-xs">
            {JSON.stringify(event.metadata, null, 2)}
          </pre>
        )}
      </DialogContent>
    </Dialog>
  );
}
