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
          ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
          : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-100"
      }`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />}
      {label}
      <span
        className={`rounded-md px-1.5 py-0.5 text-[10px] font-mono ${
          active ? "bg-white/20 text-zinc-100 dark:bg-zinc-900/20 dark:text-zinc-800" : "bg-zinc-100 text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
