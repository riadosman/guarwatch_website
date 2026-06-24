"use client";

import { useState } from "react";
import {
  AlarmClock,
  Bell,
  BellOff,
  Eye,
  EyeOff,
  Moon,
  Sparkles,
  Trash2,
  Wand2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { clearAllEvents, simulateEvent } from "@/lib/api";
import { VIOLATION_LABEL } from "@/lib/format";
import type { ViolationType } from "@/lib/types";

interface Props {
  soundEnabled: boolean;
  onToggleSound: () => void;
  totalEvents: number;
}

const DEMO_BUTTONS: { type: ViolationType; icon: React.ComponentType<{ className?: string }>; tone: string }[] = [
  { type: "UYUYOR", icon: Moon, tone: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100" },
  { type: "GOZ_KAPALI", icon: EyeOff, tone: "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100" },
  { type: "HAREKETSIZ", icon: AlarmClock, tone: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100" },
  { type: "TAKIP_KAYBEDILDI", icon: Eye, tone: "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100" },
];

export function DevToolbar({ soundEnabled, onToggleSound, totalEvents }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState<ViolationType | null>(null);
  const [clearing, setClearing] = useState(false);

  async function fire(type: ViolationType) {
    if (busy) return;
    setBusy(type);
    try {
      await simulateEvent(type);
    } catch (err) {
      toast.error("Simülasyon başarısız", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusy(null);
    }
  }

  async function clearAll() {
    setClearing(true);
    try {
      await clearAllEvents();
      toast.success("Tüm ihlaller silindi");
      setConfirmOpen(false);
    } catch (err) {
      toast.error("Silme başarısız", {
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex items-center gap-2 text-xs font-medium text-amber-900 dark:text-amber-300">
        <Sparkles className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">Geliştirici Araçları</span>
        <span className="sm:hidden">Dev</span>
      </div>

      <div className="h-4 w-px bg-amber-200 dark:bg-amber-800" />

      <button
        type="button"
        onClick={onToggleSound}
        className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition ${
          soundEnabled
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
        }`}
        title={soundEnabled ? "Sesi kapat" : "Sesi aç"}
      >
        {soundEnabled ? <Bell className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />}
        Ses
      </button>

      <div className="h-4 w-px bg-amber-200 dark:bg-amber-800" />

      <div className="flex items-center gap-1.5">
        <span className="hidden text-[11px] font-medium uppercase tracking-wider text-amber-900 dark:text-amber-300 sm:inline">
          <Wand2 className="-mt-0.5 mr-1 inline h-3 w-3" />
          Demo:
        </span>
        {DEMO_BUTTONS.map(({ type, icon: Icon, tone }) => (
          <button
            key={type}
            type="button"
            onClick={() => fire(type)}
            disabled={busy === type}
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition disabled:opacity-50 ${tone}`}
            title={`Test ${VIOLATION_LABEL[type]} ihlali tetikle`}
          >
            {busy === type ? (
              <Zap className="h-3 w-3 animate-pulse" />
            ) : (
              <Icon className="h-3 w-3" />
            )}
            {VIOLATION_LABEL[type]}
          </button>
        ))}
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs text-red-700 hover:bg-red-50 hover:text-red-800"
          disabled={totalEvents === 0}
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 className="h-3.5 w-3.5" />
          Tümünü Sil
          {totalEvents > 0 && (
            <span className="ml-1 rounded bg-red-100 px-1 font-mono text-[10px]">
              {totalEvents}
            </span>
          )}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogTitle className="flex items-center gap-2 text-zinc-900">
            <Trash2 className="h-5 w-5 text-red-600" />
            Tüm ihlalleri silmek istediğine emin misin?
          </DialogTitle>
          <DialogDescription className="text-zinc-600">
            Bu işlem geri alınamaz. <strong className="text-zinc-900">{totalEvents}</strong> event
            ve ekran görüntüleri kalıcı olarak silinecek.
          </DialogDescription>
          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setConfirmOpen(false)}
              disabled={clearing}
            >
              İptal
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-red-600 text-white hover:bg-red-700"
              onClick={clearAll}
              disabled={clearing}
            >
              {clearing ? "Siliniyor..." : `${totalEvents} ihlali sil`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
