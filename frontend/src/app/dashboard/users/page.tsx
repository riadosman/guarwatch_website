"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, UserCircle } from "lucide-react";
import { Navbar } from "@/components/Navbar";

interface Role { id: number; name: string }
interface User { id: number; username: string; role_id: number | null; group_ids: number[] }

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const creds = { credentials: "include" as const };

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [groups, setGroups] = useState<{id: number; name: string}[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", role_id: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/users`, creds).then(r => r.json()).then(setUsers).catch(() => {});
    fetch(`${API}/api/roles`, creds).then(r => r.json()).then(setRoles).catch(() => {});
    fetch(`${API}/api/groups`, creds).then(r => r.json()).then(setGroups).catch(() => {});
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/api/users`, {
        ...creds,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          password: form.password,
          role_id: form.role_id ? parseInt(form.role_id) : null,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.detail ?? `Hata: ${res.status}`);
        return;
      }
      const user = await res.json();
      setUsers(prev => [...prev, user]);
      setCreating(false);
      setForm({ username: "", password: "", role_id: "" });
    } finally {
      setLoading(false);
    }
  }

  const assignGroups = async (userId: number, groupId: number) => {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    const current: number[] = user.group_ids ?? [];
    const updated = current.includes(groupId)
      ? current.filter((g: number) => g !== groupId)
      : [...current, groupId];
    await fetch(`${API}/api/users/${userId}`, {
      ...creds,
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_ids: updated }),
    });
    setUsers(prev => prev.map(u =>
      u.id === userId ? { ...u, group_ids: updated } : u
    ));
  };

  async function handleDelete(id: number) {
    if (!confirm("Bu kullanıcıyı silmek istediğinizden emin misiniz?")) return;
    await fetch(`${API}/api/users/${id}`, { ...creds, method: "DELETE" });
    setUsers(prev => prev.filter(u => u.id !== id));
  }

  const roleName = (id: number | null) => roles.find(r => r.id === id)?.name ?? "Rol yok";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar variant="app" />
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">Kullanici Yonetimi</h1>
          <button
            onClick={() => setCreating(v => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600"
          >
            <Plus className="h-4 w-4" /> Kullanici Ekle
          </button>
        </div>

        {creating && (
          <form onSubmit={handleCreate} className="rounded-xl border bg-white p-5 shadow-sm space-y-3 dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Yeni kullanici</p>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="grid grid-cols-2 gap-3">
              <input
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                placeholder="Kullanici adi"
                required
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <input
                type="password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                placeholder="Sifre"
                required
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <select
              value={form.role_id}
              onChange={e => setForm(f => ({ ...f, role_id: e.target.value }))}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              <option value="">Rol sec (opsiyonel)</option>
              {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <div className="flex gap-2">
              <button type="submit" disabled={loading} className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600 disabled:opacity-50">
                {loading ? "Kaydediliyor..." : "Olustur"}
              </button>
              <button type="button" onClick={() => { setCreating(false); setError(""); }} className="rounded-lg border px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">
                Iptal
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {users.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Henuz kullanici yok.</p>
          )}
          {users.map(u => (
            <div key={u.id} className="flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                <UserCircle className="h-5 w-5 text-zinc-400" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{u.username}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {groups.map((g) => (
                    <label key={g.id} className="flex items-center gap-1 text-xs cursor-pointer text-zinc-500 dark:text-zinc-400">
                      <input
                        type="checkbox"
                        checked={(u.group_ids ?? []).includes(g.id)}
                        onChange={() => assignGroups(u.id, g.id)}
                      />
                      {g.name}
                    </label>
                  ))}
                  {groups.length === 0 && (
                    <span className="text-xs text-zinc-400">{u.group_ids.length} grup</span>
                  )}
                </div>
              </div>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                {roleName(u.role_id)}
              </span>
              <button onClick={() => handleDelete(u.id)} className="rounded p-1.5 hover:bg-red-50">
                <Trash2 className="h-4 w-4 text-red-400" />
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
