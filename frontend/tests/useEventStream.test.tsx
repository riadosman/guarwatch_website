import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEventStream } from "@/hooks/useEventStream";
import type { ViolationEvent } from "@/lib/types";

const sample: ViolationEvent = {
  id: 1,
  device_id: "d1",
  agent_event_id: 1,
  type: "UYUYOR",
  track_id: 1,
  occurred_at: "2026-05-05T12:00:00+00:00",
  received_at: "2026-05-05T12:00:01+00:00",
  screenshot_url: "/uploads/d1/1.jpg",
  metadata: { perclos: 88 },
};

const wsHandlers = vi.hoisted(() => ({
  onMessage: null as ((m: { type: "event_created"; payload: ViolationEvent }) => void) | null,
  close: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getEvents: vi.fn(async () => [sample]),
  absoluteUrl: (p: string | null) => p,
}));

vi.mock("@/lib/ws", () => ({
  openPanelWs: (opts: {
    onMessage: (m: { type: "event_created"; payload: ViolationEvent }) => void;
  }) => {
    wsHandlers.onMessage = opts.onMessage;
    return { close: wsHandlers.close };
  },
}));

describe("useEventStream", () => {
  beforeEach(() => {
    wsHandlers.onMessage = null;
    wsHandlers.close.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads initial events on mount", async () => {
    const { result } = renderHook(() => useEventStream());
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    expect(result.current.events[0].id).toBe(1);
  });

  it("prepends new events from ws to the list", async () => {
    const { result } = renderHook(() => useEventStream());
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    act(() => {
      wsHandlers.onMessage!({
        type: "event_created",
        payload: { ...sample, id: 2, agent_event_id: 2 },
      });
    });
    expect(result.current.events[0].id).toBe(2);
    expect(result.current.events).toHaveLength(2);
  });

  it("dedupes by id when ws delivers an already-loaded event", async () => {
    const { result } = renderHook(() => useEventStream());
    await waitFor(() => expect(result.current.events).toHaveLength(1));
    act(() => {
      wsHandlers.onMessage!({ type: "event_created", payload: sample });
    });
    expect(result.current.events).toHaveLength(1);
  });
});
