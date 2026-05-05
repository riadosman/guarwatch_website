import { Activity, Compass, Eye, Hash, Radio } from "lucide-react";

interface Props {
  metadata: Record<string, unknown>;
  trackId: number | null;
  agentEventId: number;
}

interface Metric {
  label: string;
  value: string;
  unit?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warn" | "danger";
}

const SIGNAL_LABEL: Record<string, string> = {
  MP: "MediaPipe",
  POSE: "YOLO-Pose",
  "---": "Yok",
};

export function MetadataDisplay({ metadata, trackId, agentEventId }: Props) {
  const metrics: Metric[] = [];

  if (typeof metadata.perclos === "number") {
    metrics.push({
      label: "PERCLOS",
      value: metadata.perclos.toFixed(1),
      unit: "%",
      icon: Eye,
      tone: metadata.perclos > 80 ? "danger" : metadata.perclos > 50 ? "warn" : "default",
    });
  }

  if (typeof metadata.pitch === "number") {
    metrics.push({
      label: "Pitch",
      value: metadata.pitch.toFixed(1),
      unit: "°",
      icon: Compass,
      tone: Math.abs(metadata.pitch) > 20 ? "warn" : "default",
    });
  }

  if (typeof metadata.signal_src === "string") {
    metrics.push({
      label: "Sinyal kaynağı",
      value: SIGNAL_LABEL[metadata.signal_src] ?? metadata.signal_src,
      icon: Radio,
    });
  }

  metrics.push({
    label: "Takip ID",
    value: trackId === null ? "—" : `#${trackId}`,
    icon: Activity,
  });

  metrics.push({
    label: "Agent event",
    value: `#${agentEventId}`,
    icon: Hash,
  });

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {metrics.map(({ label, value, unit, icon: Icon, tone = "default" }) => {
        const toneRing = {
          default: "ring-white/10",
          warn: "ring-amber-500/30",
          danger: "ring-red-500/40",
        }[tone];
        const toneText = {
          default: "text-white",
          warn: "text-amber-200",
          danger: "text-red-200",
        }[tone];

        return (
          <div
            key={label}
            className={`rounded-lg bg-white/[0.03] p-3 ring-1 ${toneRing}`}
          >
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-zinc-500">
              <Icon className="h-3 w-3" />
              {label}
            </div>
            <div className={`mt-1.5 text-lg font-semibold ${toneText}`}>
              {value}
              {unit && <span className="ml-1 text-sm font-normal text-zinc-400">{unit}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
