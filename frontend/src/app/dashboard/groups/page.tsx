"use client";

import { useState, useEffect } from "react";
import { Plus, Trash2, Layers } from "lucide-react";
import { Navbar } from "@/components/Navbar";

interface Group {
  id: number;
  name: string;
  device_id?: string | null;
  camera_uris?: string[];
}

interface Location {
  id: number;
  name: string;
  il_id?: number;
  ilce_id?: number;
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", il_id: 0, ilce_id: 0, mahalle_id: 0 });
  const [iller, setIller] = useState<Location[]>([]);
  const [ilceler, setIlceler] = useState<Location[]>([]);
  const [mahalleler, setMahalleler] = useState<Location[]>([]);

  useEffect(() => {
    fetch("/api/groups").then((r) => r.json()).then(setGroups).catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/locations/iller").then((r) => r.json()).then(setIller).catch(() => {});
  }, []);

  useEffect(() => {
    if (!form.il_id) {
      setIlceler([]);
      setMahalleler([]);
      setForm((f) => ({ ...f, ilce_id: 0, mahalle_id: 0 }));
      return;
    }
    fetch(`/api/locations/ilceler?il_id=${form.il_id}`)
      .then((r) => r.json())
      .then(setIlceler)
      .catch(() => {});
    setForm((f) => ({ ...f, ilce_id: 0, mahalle_id: 0 }));
    setMahalleler([]);
  }, [form.il_id]);

  useEffect(() => {
    if (!form.ilce_id) {
      setMahalleler([]);
      setForm((f) => ({ ...f, mahalle_id: 0 }));
      return;
    }
    fetch(`/api/locations/mahalleler?ilce_id=${form.ilce_id}`)
      .then((r) => r.json())
      .then(setMahalleler)
      .catch(() => {});
    setForm((f) => ({ ...f, mahalle_id: 0 }));
  }, [form.ilce_id]);

  const createGroup = async () => {
    if (!form.name || !form.il_id || !form.ilce_id || !form.mahalle_id) {
      alert("Grup adı ve il, ilçe, mahalle seçimi zorunludur.");
      return;
    }
    const resp = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        il_id: form.il_id,
        ilce_id: form.ilce_id,
        mahalle_id: form.mahalle_id,
      }),
    });
    if (resp.ok) {
      const group = await resp.json();
      setGroups((prev) => [...prev, group]);
      setCreating(false);
      setForm({ name: "", il_id: 0, ilce_id: 0, mahalle_id: 0 });
    }
  };

  const deleteGroup = async (id: number) => {
    if (!confirm("Bu grubu silmek istediğinizden emin misiniz?")) return;
    await fetch(`/api/groups/${id}`, { method: "DELETE" });
    setGroups((prev) => prev.filter((g) => g.id !== id));
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar variant="app" />
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">

        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">Kamera Grupları</h1>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600"
          >
            <Plus className="h-4 w-4" /> Grup Oluştur
          </button>
        </div>

        {creating && (
          <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3 dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Yeni grup</p>
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
              placeholder="Grup adı"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <select
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                value={form.il_id}
                onChange={(e) => setForm((f) => ({ ...f, il_id: Number(e.target.value) }))}
              >
                <option value={0}>— İl —</option>
                {iller.map((il) => (
                  <option key={il.id} value={il.id}>{il.name}</option>
                ))}
              </select>
              <select
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 disabled:opacity-40"
                value={form.ilce_id}
                onChange={(e) => setForm((f) => ({ ...f, ilce_id: Number(e.target.value) }))}
                disabled={!form.il_id}
              >
                <option value={0}>— İlçe —</option>
                {ilceler.map((ilce) => (
                  <option key={ilce.id} value={ilce.id}>{ilce.name}</option>
                ))}
              </select>
              <select
                className="rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 disabled:opacity-40"
                value={form.mahalle_id}
                onChange={(e) => setForm((f) => ({ ...f, mahalle_id: Number(e.target.value) }))}
                disabled={!form.ilce_id}
              >
                <option value={0}>— Mahalle —</option>
                {mahalleler.map((m) => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                onClick={createGroup}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600"
              >
                Oluştur
              </button>
              <button
                onClick={() => setCreating(false)}
                className="rounded-lg border px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                İptal
              </button>
            </div>
          </div>
        )}

        {groups.length === 0 && !creating ? (
          <div className="rounded-xl border bg-white p-8 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <Layers className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Henüz grup yok. Kameraları il / ilçe / mahalle bazında gruplamak için oluşturun.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {groups.map((g) => (
              <div
                key={g.id}
                className="flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <Layers className="h-4 w-4 text-zinc-400" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{g.name}</p>
                  {g.camera_uris && g.camera_uris.length > 0 && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">
                      {g.camera_uris.length} kamera
                    </p>
                  )}
                </div>
                <button
                  onClick={() => deleteGroup(g.id)}
                  className="rounded p-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0"
                >
                  <Trash2 className="h-4 w-4 text-red-400" />
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
