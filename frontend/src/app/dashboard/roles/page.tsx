"use client";

import { useState, useEffect } from "react";

const SERVICES = [
  "users", "roles", "devices", "camera_groups", "terminal", "events", "live_view",
];
const ACTIONS = ["read", "create", "update", "delete"] as const;
type Action = typeof ACTIONS[number];

interface Permission {
  service: string;
  can_read: boolean;
  can_create: boolean;
  can_update: boolean;
  can_delete: boolean;
}

interface Role {
  id: number;
  name: string;
  description: string | null;
  permissions: Permission[];
}

function permKey(action: Action): keyof Permission {
  return `can_${action}` as keyof Permission;
}

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selected, setSelected] = useState<Role | null>(null);
  const [matrix, setMatrix] = useState<Record<string, Record<Action, boolean>>>({});
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    fetch("/api/roles").then((r) => r.json()).then(setRoles).catch(() => {});
  }, []);

  const selectRole = (role: Role) => {
    setSelected(role);
    const m: Record<string, Record<Action, boolean>> = {};
    for (const svc of SERVICES) {
      const perm = role.permissions.find((p) => p.service === svc);
      m[svc] = {
        read: perm?.can_read ?? false,
        create: perm?.can_create ?? false,
        update: perm?.can_update ?? false,
        delete: perm?.can_delete ?? false,
      };
    }
    setMatrix(m);
  };

  const toggle = (svc: string, action: Action) => {
    setMatrix((prev) => ({
      ...prev,
      [svc]: { ...prev[svc], [action]: !prev[svc][action] },
    }));
  };

  const savePermissions = async () => {
    if (!selected) return;
    const permissions = SERVICES.map((svc) => ({
      service: svc,
      can_read: matrix[svc].read,
      can_create: matrix[svc].create,
      can_update: matrix[svc].update,
      can_delete: matrix[svc].delete,
    }));
    const resp = await fetch(`/api/roles/${selected.id}/permissions`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(permissions),
    });
    if (resp.ok) {
      const updated = await resp.json();
      setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setSelected(updated);
    }
  };

  const createRole = async () => {
    const resp = await fetch("/api/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, permissions: [] }),
    });
    if (resp.ok) {
      const role = await resp.json();
      setRoles((prev) => [...prev, role]);
      setCreating(false);
      setNewName("");
    }
  };

  const deleteRole = async (id: number) => {
    await fetch(`/api/roles/${id}`, { method: "DELETE" });
    setRoles((prev) => prev.filter((r) => r.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Rol Yönetimi</h1>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium"
        >
          + Yeni Rol
        </button>
      </div>

      {creating && (
        <div className="mb-6 p-4 border border-gray-700 rounded-lg flex gap-2">
          <input
            className="flex-1 bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm"
            placeholder="Rol adı (örn: Operatör)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button
            onClick={createRole}
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
      )}

      <div className="flex gap-6">
        {/* Rol listesi */}
        <div className="w-48 space-y-1">
          {roles.map((r) => (
            <div
              key={r.id}
              className={`flex items-center justify-between px-3 py-2 rounded cursor-pointer text-sm ${
                selected?.id === r.id
                  ? "bg-blue-800 text-white"
                  : "bg-gray-800 hover:bg-gray-700"
              }`}
            >
              <span onClick={() => selectRole(r)}>{r.name}</span>
              <button
                onClick={() => deleteRole(r.id)}
                className="text-red-400 hover:text-red-300 text-xs ml-2"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        {/* Yetki matrisi */}
        {selected && (
          <div className="flex-1">
            <h2 className="text-lg font-semibold mb-3">{selected.name} — Yetkiler</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-left border-b border-gray-700">
                  <th className="pb-2 pr-4">Servis</th>
                  {ACTIONS.map((a) => (
                    <th key={a} className="pb-2 px-3 text-center capitalize">{a}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SERVICES.map((svc) => (
                  <tr key={svc} className="border-b border-gray-800">
                    <td className="py-2 pr-4 text-gray-300">{svc}</td>
                    {ACTIONS.map((action) => (
                      <td key={action} className="py-2 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={matrix[svc]?.[action] ?? false}
                          onChange={() => toggle(svc, action)}
                          className="w-4 h-4 accent-blue-500"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              onClick={savePermissions}
              className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium"
            >
              Kaydet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
