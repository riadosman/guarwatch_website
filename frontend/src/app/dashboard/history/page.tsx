// frontend/src/app/dashboard/history/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";

import { Navbar } from "@/components/Navbar";
import { EventLightbox } from "@/components/EventLightbox";
import { EventTable } from "@/components/EventTable";
import { type Device, getDevices } from "@/lib/devices";
import {
  type HistoryFilters,
  type PaginatedEvents,
  buildExportUrl,
  getEventHistory,
} from "@/lib/history";
import { VIOLATION_LABEL } from "@/lib/format";
import type { ViolationEvent, ViolationType } from "@/lib/types";

const TYPES: ViolationType[] = ["UYUYOR", "GOZ_KAPALI", "HAREKETSIZ", "TAKIP_KAYBEDILDI"];

export default function HistoryPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [data, setData] = useState<PaginatedEvents>({ items: [], total: 0, page: 1, pages: 1 });
  const [filters, setFilters] = useState<HistoryFilters>({ page: 1, page_size: 50 });
  const [selected, setSelected] = useState<ViolationEvent | null>(null);

  useEffect(() => {
    getDevices().then(setDevices).catch(() => {});
  }, []);

  useEffect(() => {
    getEventHistory(filters).then(setData).catch(() => {});
  }, [filters]);

  function updateFilter(patch: Partial<HistoryFilters>) {
    setFilters((f) => ({ ...f, ...patch, page: 1 }));
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Navbar variant="app" />
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-900">İhlal Geçmişi</h1>
            <p className="text-sm text-zinc-400">{data.total} kayıt</p>
          </div>
          <a
            href={buildExportUrl(filters)}
            download="events.csv"
            className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-zinc-50"
          >
            <Download className="h-4 w-4" /> CSV İndir
          </a>
        </div>

        <div className="flex flex-wrap gap-3 rounded-xl border bg-white p-4 shadow-sm">
          <select
            onChange={(e) => updateFilter({ device_id: e.target.value || undefined })}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">Tüm Cihazlar</option>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <select
            onChange={(e) =>
              updateFilter({ type: (e.target.value as ViolationType) || undefined })
            }
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">Tüm Türler</option>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {VIOLATION_LABEL[t]}
              </option>
            ))}
          </select>
          <input
            type="date"
            onChange={(e) => updateFilter({ from_date: e.target.value || undefined })}
            className="rounded-lg border px-3 py-2 text-sm"
          />
          <input
            type="date"
            onChange={(e) => updateFilter({ to_date: e.target.value || undefined })}
            className="rounded-lg border px-3 py-2 text-sm"
          />
        </div>

        <EventTable events={data.items} onSelect={setSelected} />

        {data.pages > 1 && (
          <div className="flex items-center justify-center gap-4">
            <button
              disabled={filters.page === 1}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) - 1 }))}
              className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40 hover:bg-zinc-50"
            >
              ← Önceki
            </button>
            <span className="text-sm text-zinc-500">
              Sayfa {data.page} / {data.pages}
            </span>
            <button
              disabled={filters.page === data.pages}
              onClick={() => setFilters((f) => ({ ...f, page: (f.page ?? 1) + 1 }))}
              className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40 hover:bg-zinc-50"
            >
              Sonraki →
            </button>
          </div>
        )}
      </main>

      {selected && (
        <EventLightbox
          event={selected}
          onClose={() => setSelected(null)}
          onDelete={() => setSelected(null)}
        />
      )}
    </div>
  );
}
