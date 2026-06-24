import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CTA() {
  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-br from-red-50 via-orange-50 to-white p-10 text-center sm:p-16">
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
            Bir güvenlik açığı beklemeyin. Şimdi izleyin.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-zinc-600">
            Tesisinizdeki güvenlik kulübeleri için demo paneli açın, simülatörle
            test ihlalleri tetikleyin ya da kendi Jetson'ınızı bağlayın — agent
            paketi için README hazır.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg" className="bg-red-500 hover:bg-red-600 text-white">
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
