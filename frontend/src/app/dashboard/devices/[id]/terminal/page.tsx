import { Navbar } from "@/components/Navbar";
import Terminal from "@/components/Terminal";

interface Props {
  params: { id: string };
}

const RELAY_WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8765";

export default function TerminalPage({ params }: Props) {
  return (
    <div className="min-h-screen bg-zinc-950">
      <Navbar variant="app" />
      <main className="mx-auto max-w-6xl px-4 py-6 space-y-4">
        <div>
          <h1 className="text-lg font-semibold text-zinc-100">Terminal</h1>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">{params.id}</p>
        </div>
        <Terminal deviceId={params.id} relayUrl={RELAY_WS_URL} />
      </main>
    </div>
  );
}
