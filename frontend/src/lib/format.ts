import type { ViolationType } from "./types";

export const VIOLATION_LABEL: Record<ViolationType, string> = {
  UYUYOR: "Uyuyor",
  GOZ_KAPALI: "Göz Kapalı",
  HAREKETSIZ: "Hareketsiz",
  TAKIP_KAYBEDILDI: "Takip Kaybedildi",
};

export const VIOLATION_TONE: Record<
  ViolationType,
  { dot: string; chip: string; ring: string }
> = {
  UYUYOR: {
    dot: "bg-red-500",
    chip: "bg-red-100 text-red-700 border-red-300",
    ring: "ring-red-400",
  },
  GOZ_KAPALI: {
    dot: "bg-orange-500",
    chip: "bg-orange-100 text-orange-700 border-orange-300",
    ring: "ring-orange-400",
  },
  HAREKETSIZ: {
    dot: "bg-amber-500",
    chip: "bg-amber-100 text-amber-700 border-amber-300",
    ring: "ring-amber-400",
  },
  TAKIP_KAYBEDILDI: {
    dot: "bg-zinc-500",
    chip: "bg-zinc-100 text-zinc-700 border-zinc-300",
    ring: "ring-zinc-400",
  },
};

export function formatRelative(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  const diffSec = Math.floor((now.getTime() - t) / 1000);
  if (Number.isNaN(t)) return iso;
  if (diffSec < 5) return "şimdi";
  if (diffSec < 60) return `${diffSec} sn önce`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} dk önce`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} sa önce`;
  return `${Math.floor(diffSec / 86400)} gün önce`;
}

export function formatAbsolute(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("tr-TR", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function isToday(iso: string, now: Date = new Date()): boolean {
  const d = new Date(iso);
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function isLastHour(iso: string, now: Date = new Date()): boolean {
  return now.getTime() - new Date(iso).getTime() < 60 * 60 * 1000;
}
