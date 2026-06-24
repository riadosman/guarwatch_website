"use client";

import { useEffect, useState } from "react";
import { Check, Info, Plus, Trash2 } from "lucide-react";
import { Navbar } from "@/components/Navbar";

const SERVICES = ["users","roles","devices","camera_groups","terminal","events","live_view"];
const ACTIONS = ["read","create","update","delete"] as const;
type Action = typeof ACTIONS[number];

interface Permission { service: string; can_read: boolean; can_create: boolean; can_update: boolean; can_delete: boolean }
interface Role { id: number; name: string; description: string | null; permissions: Permission[] }

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";
const creds = { credentials: "include" as const };

const SERVICE_LABEL: Record<string, string> = {
  users: "Kullanici", roles: "Rol", devices: "Cihaz",
  camera_groups: "Kamera Grubu", terminal: "Terminal",
  events: "Ihlal Kaydi", live_view: "Canli Izleme",
};

const SERVICE_DESC: Record<string, string> = {
  users: "Sisteme giris yapabilen kullanici hesaplarini yonetir. Yeni hesap acma, silme ve role atama islemlerini kapsar.",
  roles: "Yetki gruplarini (rol) tanimlar. Her role hangi servislerde ne yapilabileceği bu sayfada belirlenir.",
  devices: "Bagli Jetson cihazlarini yonetir. Cihaz ekleme, silme ve online/offline durumunu goruntuler.",
  camera_groups: "Kameralari mantiksal gruplara ayirir. Ornegin 'A Binasi' veya 'Vardiya-2' gibi gruplar olusturulabilir.",
  terminal: "Jetson cihazlarina tarayici uzerinden uzaktan komut satiri erisimi saglar.",
  events: "Kameralardan gelen uyku/hareketsizlik ihlal kayitlarini gosterir ve disa aktarir.",
  live_view: "Kameralardan canli goruntu izleme yetkisini kontrol eder.",
};

export default function RolesPage() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selected, setSelected] = useState<Role | null>(null);
  const [matrix, setMatrix] = useState<Record<string, Record<Action, boolean>>>({});
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/roles`, creds).then(r => r.json()).then(setRoles).catch(() => {});
  }, []);

  function selectRole(role: Role) {
    setSelected(role);
    setSaved(false);
    const m: Record<string, Record<Action, boolean>> = {};
    for (const svc of SERVICES) {
      const p = role.permissions.find(x => x.service === svc);
      m[svc] = { read: p?.can_read ?? false, create: p?.can_create ?? false, update: p?.can_update ?? false, delete: p?.can_delete ?? false };
    }
    setMatrix(m);
  }

  function toggle(svc: string, action: Action) {
    setSaved(false);
    setMatrix(prev => ({ ...prev, [svc]: { ...prev[svc], [action]: !prev[svc][action] } }));
  }

  async function savePermissions() {
    if (!selected) return;
    const perms = SERVICES.map(svc => ({
      service: svc, can_read: matrix[svc].read, can_create: matrix[svc].create,
      can_update: matrix[svc].update, can_delete: matrix[svc].delete,
    }));
    const res = await fetch(`${API}/api/roles/${selected.id}/permissions`, {
      ...creds, method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(perms),
    });
    if (res.ok) {
      const updated = await res.json();
      setRoles(prev => prev.map(r => r.id === updated.id ? updated : r));
      setSelected(updated);
      setSaved(true);
    }
  }

  async function createRole() {
    if (!newName.trim()) return;
    const res = await fetch(`${API}/api/roles`, {
      ...creds, method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName, permissions: [] }),
    });
    if (res.ok) {
      const role = await res.json();
      setRoles(prev => [...prev, role]);
      setCreating(false);
      setNewName("");
    }
  }

  async function deleteRole(id: number) {
    if (!confirm("Bu rolu silmek istediginizden emin misiniz?")) return;
    await fetch(`${API}/api/roles/${id}`, { ...creds, method: "DELETE" });
    setRoles(prev => prev.filter(r => r.id !== id));
    if (selected?.id === id) setSelected(null);
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar variant="app" />
      <main className="mx-auto max-w-5xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">Rol Yonetimi</h1>
          <button
            onClick={() => setCreating(v => !v)}
            className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600"
          >
            <Plus className="h-4 w-4" /> Yeni Rol
          </button>
        </div>

        {creating && (
          <div className="flex gap-2 rounded-xl border bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Rol adi (orn: Operator)"
              onKeyDown={e => e.key === "Enter" && createRole()}
              className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            />
            <button onClick={createRole} className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600">Olustur</button>
            <button onClick={() => { setCreating(false); setNewName(""); }} className="rounded-lg border px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800">Iptal</button>
          </div>
        )}

        <div className="flex gap-4">
          {/* Rol listesi */}
          <div className="w-48 space-y-1 shrink-0">
            {roles.length === 0 && <p className="text-xs text-zinc-400 px-3">Henuz rol yok.</p>}
            {roles.map(r => (
              <div
                key={r.id}
                className={`flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer text-sm transition-colors ${
                  selected?.id === r.id
                    ? "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                    : "hover:bg-zinc-100 text-zinc-700 dark:hover:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                <span className="flex-1 truncate" onClick={() => selectRole(r)}>{r.name}</span>
                <button onClick={() => deleteRole(r.id)} className="ml-2 rounded p-0.5 hover:text-red-500 shrink-0">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Yetki matrisi */}
          {selected ? (
            <div className="flex-1 rounded-xl border bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  {selected.name} — Yetkiler
                </h2>
                <button
                  onClick={savePermissions}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    saved ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" : "bg-red-500 text-white hover:bg-red-600"
                  }`}
                >
                  {saved ? <><Check className="h-3.5 w-3.5" /> Kaydedildi</> : "Kaydet"}
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b dark:border-zinc-700">
                      <th className="pb-2 text-left text-xs font-medium text-zinc-500 pr-6">Servis</th>
                      {ACTIONS.map(a => (
                        <th key={a} className="pb-2 px-4 text-center text-xs font-medium text-zinc-500 capitalize">{a}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y dark:divide-zinc-800">
                    {SERVICES.map(svc => (
                      <tr key={svc}>
                        <td className="py-2.5 pr-6 text-sm text-zinc-700 dark:text-zinc-300">
                          <div className="relative inline-flex items-center gap-1.5 group/tip">
                            <span>{SERVICE_LABEL[svc] ?? svc}</span>
                            <span className="text-[10px] text-zinc-400">{svc}</span>
                            <Info className="h-3.5 w-3.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 cursor-help shrink-0" />
                            <div className="pointer-events-none absolute bottom-full left-0 mb-2 w-64 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 shadow-lg opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
                              {SERVICE_DESC[svc]}
                              <div className="absolute top-full left-4 -mt-px border-4 border-transparent border-t-zinc-200 dark:border-t-zinc-700" />
                            </div>
                          </div>
                        </td>
                        {ACTIONS.map(action => (
                          <td key={action} className="py-2.5 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={matrix[svc]?.[action] ?? false}
                              onChange={() => toggle(svc, action)}
                              className="h-4 w-4 rounded accent-red-500 cursor-pointer"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex-1 rounded-xl border bg-white p-8 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 flex items-center justify-center">
              <p className="text-sm text-zinc-400">Sol taraftan bir rol secin.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
