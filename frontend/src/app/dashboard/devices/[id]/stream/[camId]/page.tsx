import { LiveStream } from "@/components/LiveStream";

const RELAY_WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8765";

export default function StreamPage({
  params,
}: {
  params: { id: string; camId: string };
}) {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Canli Goruntu</h1>
      <LiveStream
        deviceId={params.id}
        camId={params.camId}
        relayUrl={RELAY_WS_URL}
      />
    </div>
  );
}
