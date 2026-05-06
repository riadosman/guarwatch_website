import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CTA() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-red-500/10 via-orange-500/5 to-transparent p-10 text-center sm:p-16">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Bir güvenlik açığı beklemeyin. Şimdi izleyin.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-zinc-400">
            Tesisinizdeki güvenlik kulübeleri için demo paneli açın, simülatörle
            test ihlalleri tetikleyin ya da kendi Jetson'ınızı bağlayın — agent
            paketi için README hazır.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-red-500 hover:bg-red-600">
              <Link href="/dashboard">
                Panele git
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
