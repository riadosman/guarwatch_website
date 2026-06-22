"use client";

import { useState, useEffect } from "react";

interface User {
  id: number;
  username: string;
  role_id: number | null;
  group_ids: number[];
}

interface Role {
  id: number;
  name: string;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", role_id: "" });

  useEffect(() => {
    fetch("/api/users").then((r) => r.json()).then(setUsers).catch(() => {});
    fetch("/api/roles").then((r) => r.json()).then(setRoles).catch(() => {});
  }, []);

  const createUser = async () => {
    const resp = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: form.username,
        password: form.password,
        role_id: form.role_id ? parseInt(form.role_id) : null,
      }),
    });
    if (resp.ok) {
      const user = await resp.json();
      setUsers((prev) => [...prev, user]);
      setCreating(false);
      setForm({ username: "", password: "", role_id: "" });
    }
  };

  const deleteUser = async (id: number) => {
    await fetch(`/api/users/${id}`, { method: "DELETE" });
    setUsers((prev) => prev.filter((u) => u.id !== id));
  };

  const roleName = (roleId: number | null) =>
    roles.find((r) => r.id === roleId)?.name ?? "Rol yok";

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Kullanıcı Yönetimi</h1>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium"
        >
          + Kullanıcı Ekle
        </button>
      </div>

      {creating && (
        <div className="mb-6 p-4 border border-gray-700 rounded-lg space-y-3">
          <input
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm"
            placeholder="Kullanıcı adı"
            value={form.username}
            onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
          />
          <input
            type="password"
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm"
            placeholder="Şifre"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
          />
          <select
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm"
            value={form.role_id}
            onChange={(e) => setForm((f) => ({ ...f, role_id: e.target.value }))}
          >
            <option value="">Rol seç...</option>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={createUser}
              className="px-4 py-2 bg-green-700 hover:bg-green-600 rounded text-sm"
            >
              Oluştur
            </button>
            <button
              onClick={() => setCreating(false)}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
            >
              İptal
            </button>
          </div>
        </div>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-400 border-b border-gray-700">
            <th className="pb-2">Kullanıcı</th>
            <th className="pb-2">Rol</th>
            <th className="pb-2">Grup</th>
            <th className="pb-2"></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className="border-b border-gray-800">
              <td className="py-3">{u.username}</td>
              <td className="py-3">
                <span className="px-2 py-0.5 bg-blue-900 text-blue-200 rounded text-xs">
                  {roleName(u.role_id)}
                </span>
              </td>
              <td className="py-3 text-gray-400">{u.group_ids.length} grup</td>
              <td className="py-3">
                <button
                  onClick={() => deleteUser(u.id)}
                  className="px-3 py-1 bg-red-900 hover:bg-red-800 rounded text-xs"
                >
                  Sil
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
