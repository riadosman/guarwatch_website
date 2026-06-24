// frontend/src/components/EventTable.tsx
"use client";

import type { ViolationEvent } from "@/lib/types";
import { VIOLATION_LABEL, VIOLATION_TONE } from "@/lib/format";

interface Props {
  events: ViolationEvent[];
  onSelect: (event: ViolationEvent) => void;
}

export function EventTable({ events, onSelect }: Props) {
  if (events.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-400 dark:text-zinc-500">
        Mevcut filtrelerle ihlal bulunamadı.
      </p>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <table className="w-full text-sm">
        <thead className="border-b bg-zinc-50 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
          <tr>
            <th className="px-4 py-3 text-left">Cihaz</th>
            <th className="px-4 py-3 text-left">Tür</th>
            <th className="px-4 py-3 text-left">Takip #</th>
            <th className="px-4 py-3 text-left">Oluştu</th>
            <th className="px-4 py-3 text-left">PERCLOS</th>
            <th className="px-4 py-3 text-left">Pitch</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {events.map((e) => (
            <tr
              key={e.id}
              onClick={() => onSelect(e)}
              className="cursor-pointer transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <td className="px-4 py-3 font-mono text-xs text-zinc-500 dark:text-zinc-400">
                {String(e.device_id).slice(0, 8)}…
              </td>
              <td className="px-4 py-3">
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${VIOLATION_TONE[e.type].chip}`}
                >
                  {VIOLATION_LABEL[e.type]}
                </span>
              </td>
              <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">{e.track_id ?? "—"}</td>
              <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                {new Date(e.occurred_at).toLocaleString("tr-TR")}
              </td>
              <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                {e.metadata?.perclos != null ? `${e.metadata.perclos}%` : "—"}
              </td>
              <td className="px-4 py-3 text-zinc-600 dark:text-zinc-400">
                {e.metadata?.pitch != null ? `${e.metadata.pitch}°` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
