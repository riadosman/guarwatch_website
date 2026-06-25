import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { LiveStream } from "@/components/LiveStream";

const RELAY_WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8765";

export default function StreamPage({
  params,
}: {
  params: { id: string; camId: string };
}) {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar variant="app" />
      <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">

        <Link
          href={`/dashboard/devices/${params.id}`}
          className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          <ArrowLeft className="h-4 w-4" /> Kameralar
        </Link>

        <div>
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">Canlı Görüntü</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Kamera: <span className="font-mono text-xs">{params.camId}</span>
          </p>
        </div>

        <LiveStream
          deviceId={params.id}
          camId={params.camId}
          relayUrl={RELAY_WS_URL}
        />
      </main>
    </div>
  );
}
