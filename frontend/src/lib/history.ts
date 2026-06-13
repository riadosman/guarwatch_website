// frontend/src/lib/history.ts
import type { ViolationEvent, ViolationType } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface HistoryFilters {
  device_id?: string;
  type?: ViolationType | "";
  from_date?: string;   // YYYY-MM-DD
  to_date?: string;     // YYYY-MM-DD
  page?: number;
  page_size?: number;
}

export interface PaginatedEvents {
  items: ViolationEvent[];
  total: number;
  page: number;
  pages: number;
}

export async function getEventHistory(filters: HistoryFilters = {}): Promise<PaginatedEvents> {
  const params = new URLSearchParams();
  if (filters.device_id) params.set("device_id", filters.device_id);
  if (filters.type) params.set("type", filters.type);
  if (filters.from_date) params.set("from_date", filters.from_date);
  if (filters.to_date) params.set("to_date", filters.to_date);
  params.set("page", String(filters.page ?? 1));
  params.set("page_size", String(filters.page_size ?? 50));
  const res = await fetch(`${API_URL}/api/events?${params}`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export function buildExportUrl(filters: HistoryFilters): string {
  const params = new URLSearchParams();
  if (filters.device_id) params.set("device_id", filters.device_id);
  if (filters.type) params.set("type", filters.type);
  if (filters.from_date) params.set("from_date", filters.from_date);
  if (filters.to_date) params.set("to_date", filters.to_date);
  return `${API_URL}/api/events/export?${params}`;
}
