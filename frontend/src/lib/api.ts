import type { ViolationEvent } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function absoluteUrl(path: string | null): string | null {
  if (!path) return null;
  return path.startsWith("http") ? path : `${API_URL}${path}`;
}

export async function getEvents(limit = 50): Promise<ViolationEvent[]> {
  const res = await fetch(`${API_URL}/api/events?limit=${limit}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`getEvents failed: ${res.status}`);
  return res.json();
}
