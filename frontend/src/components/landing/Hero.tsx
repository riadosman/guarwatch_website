import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-white/5">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(239,68,68,0.12),transparent_60%)]" />
      <div className="absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-red-500/30 to-transparent" />
      <div className="mx-auto max-w-6xl px-4 py-24 sm:px-6 sm:py-32 lg:py-40">
        <div className="flex flex-col items-center text-center">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-300">
            <ShieldCheck className="h-3.5 w-3.5" />
            Saha pilotunda · gerçek müşteriyle
          </span>
          <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl">
            Sürücü uykuya dalmadan{" "}
            <span className="bg-gradient-to-r from-red-400 to-orange-400 bg-clip-text text-transparent">
              filonuz haberdar olur.
            </span>
          </h1>
          <p className="mt-6 max-w-2xl text-balance text-lg text-zinc-400">
            Guardwatch, NVIDIA Jetson üzerinde uçta çalışan görüntü işleme ile
            her sürücüyü saniye saniye izler. Göz kapanması, hareketsizlik ve
            uyku tespit edildiğinde anında merkezi panele kanıtlı bildirim düşer.
          </p>
          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-red-500 hover:bg-red-600">
              <Link href="/dashboard">
                Canlı paneli aç
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="ghost" className="text-zinc-300 hover:text-white">
              <Link href="#how">Nasıl çalışır?</Link>
            </Button>
          </div>
          <div className="mt-14 grid w-full max-w-3xl grid-cols-3 gap-4 border-t border-white/5 pt-8 text-left sm:gap-8">
            <Stat label="Tepki süresi" value="< 3 sn" sub="ihlalden panele" />
            <Stat label="Kanıt formatı" value="1080p JPEG" sub="otomatik kayıt" />
            <Stat label="İnternet kopması" value="Sorun değil" sub="offline kuyruk" />
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-zinc-500">{label}</p>
      <p className="mt-1 text-xl font-semibold text-white sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>
    </div>
  );
}
