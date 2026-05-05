export type ViolationType =
  | "GOZ_KAPALI"
  | "HAREKETSIZ"
  | "UYUYOR"
  | "TAKIP_KAYBEDILDI";

export interface ViolationEvent {
  id: number;
  device_id: string;
  agent_event_id: number;
  type: ViolationType;
  track_id: number | null;
  occurred_at: string;
  received_at: string;
  screenshot_url: string | null;
  metadata: Record<string, unknown>;
}

export interface PanelMessage {
  type: "event_created";
  payload: ViolationEvent;
}
