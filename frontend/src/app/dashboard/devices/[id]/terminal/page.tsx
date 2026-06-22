import Terminal from "@/components/Terminal";

interface Props {
  params: { id: string };
}

const RELAY_WS_URL =
  process.env.NEXT_PUBLIC_RELAY_WS_URL ?? "wss://relay.guardwatch.io";

export default function TerminalPage({ params }: Props) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-2">Terminal</h1>
      <p className="text-gray-400 mb-4 text-sm">
        Cihaz ID:{" "}
        <code className="bg-gray-800 px-1 rounded">{params.id}</code>
      </p>
      <Terminal deviceId={params.id} relayUrl={RELAY_WS_URL} />
    </div>
  );
}
