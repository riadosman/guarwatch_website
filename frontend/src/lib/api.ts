// frontend/src/lib/api.ts
import type { ViolationEvent, ViolationType } from "./types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function absoluteUrl(path: string | null): string | null {
  if (!path) return null;
  return path.startsWith("http") ? path : `${API_URL}${path}`;
}

function handle401(res: Response) {
  if (res.status === 401 && typeof window !== "undefined") {
    window.location.href = "/login";
    throw new Error("401");
  }
}

export async function getEvents(limit = 50): Promise<ViolationEvent[]> {
  const res = await fetch(`${API_URL}/api/events?limit=${limit}`, {
    cache: "no-store",
    credentials: "include",
  });
  handle401(res);
  if (!res.ok) throw new Error(`getEvents failed: ${res.status}`);
  return res.json();
}

export async function deleteEvent(id: number): Promise<void> {
  const res = await fetch(`${API_URL}/api/events/${id}`, {
    method: "DELETE",
    credentials: "include",
  });
  handle401(res);
  if (!res.ok && res.status !== 404) throw new Error(`deleteEvent failed: ${res.status}`);
}

export async function clearAllEvents(): Promise<void> {
  const res = await fetch(`${API_URL}/api/events`, { method: "DELETE", credentials: "include" });
  handle401(res);
  if (!res.ok) throw new Error(`clearAllEvents failed: ${res.status}`);
}

export async function simulateEvent(type: ViolationType): Promise<ViolationEvent> {
  const res = await fetch(`${API_URL}/api/dev/simulate-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type }),
    credentials: "include",
  });
  handle401(res);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`simulateEvent failed: ${res.status} ${text}`);
  }
  return res.json();
}
