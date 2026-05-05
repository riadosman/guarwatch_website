"use client";

import { Activity, AlertTriangle, Clock3, Wifi, WifiOff } from "lucide-react";

import { isLastHour, isToday } from "@/lib/format";
import type { ViolationEvent } from "@/lib/types";

interface Props {
  events: ViolationEvent[];
  status: "open" | "closed";
}

export function StatsBar({ events, status }: Props) {
  const today = events.filter((e) => isToday(e.occurred_at));
  const lastHour = events.filter((e) => isLastHour(e.occurred_at));
  const sleepCount = today.filter((e) => e.type === "UYUYOR").length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card
        label="Bağlantı"
        value={status === "open" ? "Canlı" : "Bağlanıyor"}
        icon={status === "open" ? Wifi : WifiOff}
        tone={status === "open" ? "ok" : "warn"}
      />
      <Card
        label="Bugün"
        value={today.length.toString()}
        sub={`${events.length} toplam`}
        icon={Activity}
        tone="default"
      />
      <Card
        label="Son 1 saat"
        value={lastHour.length.toString()}
        sub="ihlal"
        icon={Clock3}
        tone="default"
      />
      <Card
        label="Uyku tespiti"
        value={sleepCount.toString()}
        sub="bugün"
        icon={AlertTriangle}
        tone={sleepCount > 0 ? "danger" : "default"}
      />
    </div>
  );
}

function Card({
  label,
  value,
  sub,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "default" | "ok" | "warn" | "danger";
}) {
  const toneClass = {
    default: "border-white/5 bg-white/[0.02]",
    ok: "border-emerald-500/20 bg-emerald-500/[0.06]",
    warn: "border-amber-500/20 bg-amber-500/[0.06]",
    danger: "border-red-500/25 bg-red-500/[0.06]",
  }[tone];

  const iconTone = {
    default: "text-zinc-400",
    ok: "text-emerald-400",
    warn: "text-amber-400",
    danger: "text-red-400",
  }[tone];

  return (
    <div className={`rounded-xl border ${toneClass} p-4 sm:p-5`}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</p>
        <Icon className={`h-4 w-4 ${iconTone}`} />
      </div>
      <p className="mt-2 text-2xl font-semibold text-white sm:text-3xl">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
    </div>
  );
}
