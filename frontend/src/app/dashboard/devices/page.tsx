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
import {
  type WebhookConfig,
  type WebhookConfigCreate,
  createWebhook,
  deleteWebhook,
  getWebhooks,
  patchWebhook,
} from "@/lib/webhooks";

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDevice, setNewDevice] = useState<DeviceCreateResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [webhooks, setWebhooks] = useState<WebhookConfig[]>([]);
  const [webhookFormOpen, setWebhookFormOpen] = useState(false);
  const [webhookForm, setWebhookForm] = useState<WebhookConfigCreate>({ name: "", url: "", event_types: [] });
  const [pairOpen, setPairOpen] = useState(false);
  const [pairCode, setPairCode] = useState("");
  const [pairName, setPairName] = useState("");
  const [pairError, setPairError] = useState("");
  const [pairLoading, setPairLoading] = useState(false);

  useEffect(() => {
    getDevices().then(setDevices).catch(() => {});
    getWebhooks().then(setWebhooks).catch(() => {});
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

  async function handleCreateWebhook(e: React.FormEvent) {
    e.preventDefault();
    const wh = await createWebhook(webhookForm);
    setWebhooks((prev) => [wh, ...prev]);
    setWebhookFormOpen(false);
    setWebhookForm({ name: "", url: "", event_types: [] });
  }

  async function handleToggleWebhook(id: string, enabled: boolean) {
    const updated = await patchWebhook(id, { enabled });
    setWebhooks((prev) => prev.map((w) => (w.id === id ? updated : w)));
  }

  async function handleDeleteWebhook(id: string) {
    if (!confirm("Bu webhook'u silmek istediğinizden emin misiniz?")) return;
    await deleteWebhook(id);
    setWebhooks((prev) => prev.filter((w) => w.id !== id));
  }

  async function handlePair(e: React.FormEvent) {
    e.preventDefault();
    setPairLoading(true);
    setPairError("");
    try {
      const resp = await fetch("/relay/pair", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: pairCode.replace(/-/g, "").toUpperCase(), name: pairName }),
      });
      if (resp.ok) {
        const result = await resp.json();
        // Cihaz listesini yenile
        const updated = await getDevices();
        setDevices(updated);
        setPairOpen(false);
        setPairCode("");
        setPairName("");
      } else {
        const err = await resp.json().catch(() => ({}));
        setPairError(err.detail ?? "Geçersiz veya süresi dolmuş kod.");
      }
    } catch {
      setPairError("Sunucuya bağlanılamadı.");
    } finally {
      setPairLoading(false);
    }
  }

  function copySnippet(device: DeviceCreateResult) {
    const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
    const snippet = `echo "DEVICE_ID=${device.id}" >> .env\necho "DEVICE_TOKEN=${device.token}" >> .env\necho "BACKEND_URL=${BACKEND_URL}" >> .env`;
    navigator.clipboard.writeText(snippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar variant="app" />
      <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">Cihazlar</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setPairOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Eşleştir
            </button>
            <button
              onClick={() => setAddOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-sm font-medium text-white hover:bg-red-600"
            >
              <Plus className="h-4 w-4" /> Cihaz Ekle
            </button>
          </div>
        </div>

        {addOpen && (
          <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3 dark:border-zinc-700 dark:bg-zinc-900">
            {newDevice ? (
              <div className="space-y-3">
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Cihaz oluşturuldu. Token yalnızca bir kez gösterilir:
                </p>
                <pre className="rounded bg-zinc-100 p-3 text-xs overflow-x-auto dark:bg-zinc-800 dark:text-zinc-300">
                  {`echo "DEVICE_ID=${newDevice.id}" >> .env\necho "DEVICE_TOKEN=${newDevice.token}" >> .env\necho "BACKEND_URL=${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}" >> .env`}
                </pre>
                <div className="flex gap-2">
                  <button
                    onClick={() => copySnippet(newDevice)}
                    className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
                    className="rounded border px-3 py-1.5 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
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
                  className="flex-1 rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
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
                  className="rounded-lg border px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  İptal
                </button>
              </form>
            )}
          </div>
        )}

        {pairOpen && (
          <div className="rounded-xl border bg-white p-5 shadow-sm space-y-3 dark:border-zinc-700 dark:bg-zinc-900">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Jetson konsolundaki eşleştirme kodunu girin
            </p>
            {pairError && <p className="text-sm text-red-500">{pairError}</p>}
            <form onSubmit={handlePair} className="space-y-2">
              <input
                value={pairCode}
                onChange={(e) => setPairCode(e.target.value)}
                placeholder="A1B2C3 veya A1-B2-C3"
                required
                maxLength={8}
                className="w-full rounded-lg border px-3 py-2 text-sm font-mono tracking-widest uppercase outline-none focus:ring-2 focus:ring-red-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <input
                value={pairName}
                onChange={(e) => setPairName(e.target.value)}
                placeholder="Cihaz adı (örn: Kule-1)"
                required
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={pairLoading}
                  className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600 disabled:opacity-50"
                >
                  {pairLoading ? "Eşleştiriliyor..." : "Eşleştir"}
                </button>
                <button
                  type="button"
                  onClick={() => { setPairOpen(false); setPairError(""); }}
                  className="rounded-lg border px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  İptal
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="space-y-3">
          {devices.length === 0 && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Henüz cihaz yok.</p>
          )}
          {devices.map((d) => (
            <div
              key={d.id}
              className="flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full ${
                  d.status === "online"
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                    : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
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
                      className="rounded border px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
                    />
                    <button
                      onClick={() => handleRename(d.id)}
                      className="rounded bg-red-500 px-2 py-1 text-xs text-white"
                    >
                      Kaydet
                    </button>
                    <button
                      onClick={() => setRenamingId(null)}
                      className="rounded border px-2 py-1 text-xs dark:border-zinc-600 dark:text-zinc-300"
                    >
                      İptal
                    </button>
                  </div>
                ) : (
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{d.name}</p>
                )}
                <p className="text-xs text-zinc-400 truncate dark:text-zinc-500">{d.id}</p>
                {d.last_seen_at && (
                  <p className="text-xs text-zinc-400">
                    Son görülme: {new Date(d.last_seen_at).toLocaleString("tr-TR")}
                  </p>
                )}
              </div>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  d.status === "online"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                }`}
              >
                {d.status === "online" ? "Çevrimiçi" : "Çevrimdışı"}
              </span>
              <button
                onClick={() => {
                  setRenamingId(d.id);
                  setRenameVal(d.name);
                }}
                className="rounded p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800"
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

        {/* Webhook Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-white">Webhook Uyarıları</h2>
            <button
              onClick={() => setWebhookFormOpen(true)}
              className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <Plus className="h-4 w-4" /> Webhook Ekle
            </button>
          </div>

          {webhookFormOpen && (
            <form
              onSubmit={handleCreateWebhook}
              className="rounded-xl border bg-white p-5 shadow-sm space-y-3 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <input
                  placeholder="İsim (örn: Slack)"
                  value={webhookForm.name}
                  onChange={(e) => setWebhookForm((f) => ({ ...f, name: e.target.value }))}
                  required
                  className="rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
                />
                <input
                  placeholder="URL"
                  type="url"
                  value={webhookForm.url}
                  onChange={(e) => setWebhookForm((f) => ({ ...f, url: e.target.value }))}
                  required
                  className="rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder-zinc-500"
                />
              </div>
              <div>
                <p className="text-xs text-zinc-500 mb-1.5 dark:text-zinc-400">Olay türleri (boş = tümü)</p>
                <div className="flex flex-wrap gap-2">
                  {(["UYUYOR", "GOZ_KAPALI", "HAREKETSIZ", "TAKIP_KAYBEDILDI"] as const).map((t) => (
                    <label key={t} className="flex items-center gap-1.5 text-xs">
                      <input
                        type="checkbox"
                        checked={(webhookForm.event_types ?? []).includes(t)}
                        onChange={(e) => {
                          setWebhookForm((f) => ({
                            ...f,
                            event_types: e.target.checked
                              ? [...(f.event_types ?? []), t]
                              : (f.event_types ?? []).filter((x) => x !== t),
                          }));
                        }}
                      />
                      {t}
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600">
                  Kaydet
                </button>
                <button
                  type="button"
                  onClick={() => setWebhookFormOpen(false)}
                  className="rounded-lg border px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  İptal
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3">
            {webhooks.length === 0 && (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">Henüz webhook yok.</p>
            )}
            {webhooks.map((w) => (
              <div key={w.id} className="flex items-center gap-3 rounded-xl border bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{w.name}</p>
                  <p className="text-xs text-zinc-400 truncate dark:text-zinc-500">{w.url}</p>
                  {w.event_types.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {w.event_types.map((t) => (
                        <span key={t} className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <label className="flex items-center gap-1.5 text-xs text-zinc-500 cursor-pointer dark:text-zinc-400">
                  <input
                    type="checkbox"
                    checked={w.enabled}
                    onChange={(e) => handleToggleWebhook(w.id, e.target.checked)}
                    className="rounded"
                  />
                  Aktif
                </label>
                <button
                  onClick={() => handleDeleteWebhook(w.id)}
                  className="rounded p-1.5 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4 text-red-400" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
