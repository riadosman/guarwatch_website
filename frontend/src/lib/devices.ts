const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export interface Device {
  id: string;
  name: string;
  status: "online" | "offline";
  last_seen_at: string | null;
  created_at: string;
}

function creds(): RequestInit {
  return { credentials: "include" };
}

export async function getDevices(): Promise<Device[]> {
  const res = await fetch(`${API_URL}/api/devices`, creds());
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function renameDevice(id: string, name: string): Promise<Device> {
  const res = await fetch(`${API_URL}/api/devices/${id}`, {
    ...creds(),
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function deleteDevice(id: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/devices/${id}`, { ...creds(), method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`${res.status}`);
}
