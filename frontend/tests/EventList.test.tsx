import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EventList } from "@/components/EventList";
import type { ViolationEvent } from "@/lib/types";

const items: ViolationEvent[] = [
  {
    id: 1,
    device_id: "d1",
    agent_event_id: 1,
    type: "UYUYOR",
    track_id: 7,
    occurred_at: "2026-05-05T12:00:00+00:00",
    received_at: "2026-05-05T12:00:01+00:00",
    screenshot_url: "/uploads/d1/1.jpg",
    metadata: {},
  },
  {
    id: 2,
    device_id: "d1",
    agent_event_id: 2,
    type: "GOZ_KAPALI",
    track_id: 7,
    occurred_at: "2026-05-05T12:01:00+00:00",
    received_at: "2026-05-05T12:01:01+00:00",
    screenshot_url: null,
    metadata: {},
  },
];

describe("EventList", () => {
  it("renders one card per event with type and track", () => {
    render(<EventList events={items} onSelect={vi.fn()} />);
    expect(screen.getByText("UYUYOR")).toBeInTheDocument();
    expect(screen.getByText("GOZ_KAPALI")).toBeInTheDocument();
    expect(screen.getAllByText(/Track 7/i)).toHaveLength(2);
  });

  it("calls onSelect with event when card clicked", () => {
    const onSelect = vi.fn();
    render(<EventList events={items} onSelect={onSelect} />);
    fireEvent.click(screen.getByText("UYUYOR").closest("button")!);
    expect(onSelect).toHaveBeenCalledWith(items[0]);
  });

  it("renders empty state when list is empty", () => {
    render(<EventList events={[]} onSelect={vi.fn()} />);
    expect(screen.getByText(/no violations yet/i)).toBeInTheDocument();
  });
});
