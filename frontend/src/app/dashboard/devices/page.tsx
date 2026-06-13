// frontend/src/app/dashboard/devices/page.tsx
"use client";

import { useEffect, useState } from "react";
import { Check, Copy, PenLine, Plus, Trash2, Wifi, WifiOff } from "lucide-react";

import { Navbar } from "@/components/Navbar";
import {
  type Device,
  type DeviceCreateResult,
  createDevice,
  deleteDevice,
  getDevices,
  renameDevice,
} from "@/lib/devices";

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDevice, setNewDevice] = useState<DeviceCreateResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");

  useEffect(() => {
    getDevices().then(setDevices).catch(() => {});
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const result = await createDevice(newName);
    setNewDevice(result);
    setDevices((prev) => [result, ...prev]);
    setNewName("");
  }

  async function handleDelete(id: string) {
    if (!confirm("Bu cihazı silmek istediğinizden emin misiniz?")) return;
    await deleteDevice(id);
    setDevices((prev) => prev.filter((d) => d.id !== id));
  }

  async function handleRename(id: string) {
    const updated = await renameDevice(id, renameVal);
    setDevices((prev) => prev.map((d) => (d.id === id ? updated : d)));
    setRenamingId(null);
  }

  function copySnippet(device: DeviceCreateResult) {
    const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const snippet = `echo "DEVICE_ID=${device.id}" >> .env\necho "DEVICE_TOKEN=${device.token}" >> .env\necho "BACKEND_URL=${BACKEND_URL}" >> .env`;
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-zinc-50">
      <Navbar variant="app" />
      <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900">Cihazlar</h1>
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600"
          >
            <Plus className="h-4 w-4" /> Cihaz Ekle
          </button>
        </div>

        {addOpen && (
          <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
            {newDevice ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-zinc-700">
                  Cihaz oluşturuldu. Token yalnızca bir kez gösterilir:
                </p>
                <pre className="rounded bg-zinc-100 p-3 text-xs overflow-x-auto">
                  {`echo "DEVICE_ID=${newDevice.id}" >> .env\necho "DEVICE_TOKEN=${newDevice.token}" >> .env\necho "BACKEND_URL=${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}" >> .env`}
                </pre>
                <div className="flex gap-2">
                  <button
                    onClick={() => copySnippet(newDevice)}
                    className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs hover:bg-zinc-50"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-green-600" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}{" "}
                    Kopyala
                  </button>
                  <button
                    onClick={() => {
                      setAddOpen(false);
                      setNewDevice(null);
                    }}
                    className="rounded border px-3 py-1.5 text-xs hover:bg-zinc-50"
                  >
                    Kapat
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleCreate} className="flex gap-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Cihaz adı (örn: Kule-1)"
                  required
                  className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600"
                >
                  Oluştur
                </button>
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="rounded-lg border px-4 py-2 text-sm hover:bg-zinc-50"
                >
                  İptal
                </button>
              </form>
            )}
          </div>
        )}

        <div className="space-y-3">
          {devices.length === 0 && (
            <p className="text-sm text-zinc-500">Henüz cihaz yok.</p>
          )}
          {devices.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  d.status === "online"
                    ? "bg-emerald-50 text-emerald-600"
                    : "bg-zinc-100 text-zinc-400"
                }`}
              >
                {d.status === "online" ? (
                  <Wifi className="h-4 w-4" />
                ) : (
                  <WifiOff className="h-4 w-4" />
                )}
              </span>
              <div className="flex-1 min-w-0">
                {renamingId === d.id ? (
                  <div className="flex gap-2">
                    <input
                      value={renameVal}
                      onChange={(e) => setRenameVal(e.target.value)}
                      className="rounded border px-2 py-1 text-sm"
                    />
                    <button
                      onClick={() => handleRename(d.id)}
                      className="rounded bg-red-500 px-2 py-1 text-xs text-white"
                    >
                      Kaydet
                    </button>
                    <button
                      onClick={() => setRenamingId(null)}
                      className="rounded border px-2 py-1 text-xs"
                    >
                      İptal
                    </button>
                  </div>
                ) : (
                  <p className="text-sm font-medium text-zinc-900">{d.name}</p>
                )}
                <p className="text-xs text-zinc-400 truncate">{d.id}</p>
                {d.last_seen_at && (
                  <p className="text-xs text-zinc-400">
                    Son görülme: {new Date(d.last_seen_at).toLocaleString("tr-TR")}
                  </p>
                )}
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  d.status === "online"
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-zinc-100 text-zinc-500"
                }`}
              >
                {d.status === "online" ? "Çevrimiçi" : "Çevrimdışı"}
              </span>
              <button
                onClick={() => {
                  setRenamingId(d.id);
                  setRenameVal(d.name);
                }}
                className="rounded p-1.5 hover:bg-zinc-100"
              >
                <PenLine className="h-4 w-4 text-zinc-400" />
              </button>
              <button
                onClick={() => handleDelete(d.id)}
                className="rounded p-1.5 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4 text-red-400" />
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
