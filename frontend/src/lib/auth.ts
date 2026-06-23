const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export interface CurrentUser {
  username: string;
  role: string | null;
  role_id: number | null;
  permissions: Record<string, { read: boolean; create: boolean; update: boolean; delete: boolean }>;
  is_super_admin: boolean;
}

export async function getMe(): Promise<CurrentUser> {
  const res = await fetch(`${API}/auth/me`, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export function can(user: CurrentUser | null, service: string, action: "read" | "create" | "update" | "delete"): boolean {
  if (!user) return false;
  if (user.is_super_admin) return true;
  return user.permissions[service]?.[action] ?? false;
}
