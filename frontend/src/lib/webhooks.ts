// frontend/src/lib/webhooks.ts
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  event_types: string[];
  secret: string | null;
  created_at: string;
}

export interface WebhookConfigCreate {
  name: string;
  url: string;
  enabled?: boolean;
  event_types?: string[];
  secret?: string | null;
}

export interface WebhookConfigPatch {
  name?: string;
  url?: string;
  enabled?: boolean;
  event_types?: string[];
  secret?: string | null;
}

function creds(): RequestInit {
  return { credentials: "include" };
}

export async function getWebhooks(): Promise<WebhookConfig[]> {
  const res = await fetch(`${API_URL}/api/webhooks`, creds());
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function createWebhook(body: WebhookConfigCreate): Promise<WebhookConfig> {
  const res = await fetch(`${API_URL}/api/webhooks`, {
    ...creds(),
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function patchWebhook(id: string, body: WebhookConfigPatch): Promise<WebhookConfig> {
  const res = await fetch(`${API_URL}/api/webhooks/${id}`, {
    ...creds(),
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function deleteWebhook(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/webhooks/${id}`, { ...creds(), method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`${res.status}`);
}
