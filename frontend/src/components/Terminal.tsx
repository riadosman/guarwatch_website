"use client";

import { useEffect, useRef } from "react";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";

interface TerminalProps {
  deviceId: string;
  relayUrl: string;
}

export default function Terminal({ deviceId, relayUrl }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "Menlo, Monaco, 'Courier New', monospace",
      theme: { background: "#1a1a2e" },
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);
    fitAddon.fit();
    termRef.current = term;

    const ws = new WebSocket(`${relayUrl}/terminal/${deviceId}`);
    wsRef.current = ws;

    ws.onopen = () => term.writeln("\r\n\x1b[32mBağlantı kuruldu\x1b[0m\r\n");
    ws.onclose = () => term.writeln("\r\n\x1b[31mBağlantı kesildi\x1b[0m");
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === "term_data") {
          term.write(atob(msg.data));
        }
      } catch {
        term.write(e.data);
      }
    };

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(btoa(data));
      }
    });

    const resizeObserver = new ResizeObserver(() => fitAddon.fit());
    resizeObserver.observe(containerRef.current);

    return () => {
      ws.close();
      term.dispose();
      resizeObserver.disconnect();
    };
  }, [deviceId, relayUrl]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[600px] rounded-lg overflow-hidden border border-gray-700"
    />
  );
}
