"use client";

import { useState, useEffect } from "react";

interface Group {
  id: number;
  name: string;
  device_id: string;
  camera_uris: string[];
}

export default function GroupsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", device_id: "", camera_uris: "" });

  useEffect(() => {
    fetch("/api/groups").then((r) => r.json()).then(setGroups).catch(() => {});
  }, []);

  const createGroup = async () => {
    const uris = form.camera_uris.split("\n").map((u) => u.trim()).filter(Boolean);
    const resp = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, device_id: form.device_id, camera_uris: uris }),
    });
    if (resp.ok) {
      const group = await resp.json();
      setGroups((prev) => [...prev, group]);
      setCreating(false);
      setForm({ name: "", device_id: "", camera_uris: "" });
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
          <input
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm"
            placeholder="Cihaz ID"
            value={form.device_id}
            onChange={(e) => setForm((f) => ({ ...f, device_id: e.target.value }))}
          />
          <textarea
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-sm h-24"
            placeholder={"RTSP URI'leri (her satıra bir tane):\nrtsp://192.168.1.64:554/stream"}
            value={form.camera_uris}
            onChange={(e) => setForm((f) => ({ ...f, camera_uris: e.target.value }))}
          />
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
