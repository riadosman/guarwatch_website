"use client";

import { useState, useEffect } from "react";

interface Group {
  id: number;
  name: string;
  device_id?: string;
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
  const [form, setForm] = useState({
    name: "",
    il_id: 0,
    ilce_id: 0,
    mahalle_id: 0,
  });
  const [iller, setIller] = useState<Location[]>([]);
  const [ilceler, setIlceler] = useState<Location[]>([]);
  const [mahalleler, setMahalleler] = useState<Location[]>([]);

  // Load groups on mount
  useEffect(() => {
    fetch("/api/groups").then((r) => r.json()).then(setGroups).catch(() => {});
  }, []);

  // Load iller on mount
  useEffect(() => {
    fetch("/api/locations/iller")
      .then((r) => r.json())
      .then(setIller)
      .catch(() => {});
  }, []);

  // Load ilceler when il_id changes
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

  // Load mahalleler when ilce_id changes
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
    await fetch(`/api/groups/${id}`, { method: "DELETE" });
    setGroups((prev) => prev.filter((g) => g.id !== id));
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Kamera Grupları</h1>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded text-sm font-medium"
        >
          + Grup Oluştur
        </button>
      </div>

      {creating && (
        <div className="mb-6 p-4 border border-gray-700 rounded-lg space-y-3">
          <input
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm"
            placeholder="Grup adı"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <select
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm"
            value={form.il_id}
            onChange={(e) => setForm((f) => ({ ...f, il_id: Number(e.target.value) }))}
            required
          >
            <option value={0}>-- İl Seçin --</option>
            {iller.map((il) => (
              <option key={il.id} value={il.id}>
                {il.name}
              </option>
            ))}
          </select>
          <select
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm disabled:opacity-50"
            value={form.ilce_id}
            onChange={(e) => setForm((f) => ({ ...f, ilce_id: Number(e.target.value) }))}
            required
            disabled={!form.il_id}
          >
            <option value={0}>-- İlçe Seçin --</option>
            {ilceler.map((ilce) => (
              <option key={ilce.id} value={ilce.id}>
                {ilce.name}
              </option>
            ))}
          </select>
          <select
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm disabled:opacity-50"
            value={form.mahalle_id}
            onChange={(e) => setForm((f) => ({ ...f, mahalle_id: Number(e.target.value) }))}
            required
            disabled={!form.ilce_id}
          >
            <option value={0}>-- Mahalle Seçin --</option>
            {mahalleler.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <button
              onClick={createGroup}
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

      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.id} className="p-4 border border-gray-700 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="font-medium">{g.name}</span>
              <button
                onClick={() => deleteGroup(g.id)}
                className="px-3 py-1 bg-red-900 hover:bg-red-800 rounded text-xs"
              >
                Sil
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-1">Cihaz: {g.device_id}</p>
            <div className="flex flex-wrap gap-1">
              {g.camera_uris.map((uri) => (
                <span key={uri} className="px-2 py-0.5 bg-gray-800 rounded text-xs text-gray-300">
                  {uri}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
