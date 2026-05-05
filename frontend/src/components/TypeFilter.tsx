"use client";

import type { ViolationType } from "@/lib/types";
import { VIOLATION_LABEL, VIOLATION_TONE } from "@/lib/format";

const TYPES: ViolationType[] = ["UYUYOR", "GOZ_KAPALI", "HAREKETSIZ", "TAKIP_KAYBEDILDI"];

interface Props {
  active: ViolationType | "ALL";
  counts: Record<ViolationType | "ALL", number>;
  onChange: (next: ViolationType | "ALL") => void;
}

export function TypeFilter({ active, counts, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip
        label="Tümü"
        count={counts.ALL}
        active={active === "ALL"}
        onClick={() => onChange("ALL")}
      />
      {TYPES.map((t) => {
        const tone = VIOLATION_TONE[t];
        return (
          <Chip
            key={t}
            label={VIOLATION_LABEL[t]}
            count={counts[t]}
            active={active === t}
            dot={tone.dot}
            onClick={() => onChange(t)}
          />
        );
      })}
    </div>
  );
}

function Chip({
  label,
  count,
  active,
  dot,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  dot?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "border-white/20 bg-white/10 text-white"
          : "border-white/5 bg-white/[0.02] text-zinc-400 hover:border-white/10 hover:text-zinc-200"
      }`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {label}
      <span
        className={`rounded-md px-1.5 py-0.5 text-[10px] font-mono ${
          active ? "bg-black/40 text-zinc-300" : "bg-white/5 text-zinc-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
