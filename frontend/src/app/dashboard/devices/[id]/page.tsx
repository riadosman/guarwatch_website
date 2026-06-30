"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Trash2, Video, Wifi, WifiOff } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import LiveAudio from "@/components/LiveAudio";

interface Camera {
  id: string;
  name: string;
  rtsp_url: string;
  group_id: number | null;
  is_online: boolean;
}

interface Group {
  id: number;
  name: string;
}

export default function DevicePage({ params }: { params: { id: string } }) {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);

  useEffect(() => {
    fetch(`/api/devices/${params.id}/cameras`)
      .then((r) => r.json())
      .then(setCameras)
      .catch(() => {});
    fetch("/api/groups")
      .then((r) => r.json())
      .then(setGroups)
      .catch(() => {});
  }, [params.id]);

  const assignGroup = async (camId: string, groupId: number | null) => {
    await fetch(`/api/cameras/${camId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_id: groupId }),
    });
    setCameras((prev) =>
      prev.map((c) => (c.id === camId ? { ...c, group_id: groupId } : c))
    );
  };

  const deleteCamera = async (camId: string) => {
    if (!confirm("Kamerayı silmek istediğinizden emin misiniz?")) return;
    await fetch(`/api/cameras/${camId}`, { method: "DELETE" });
    setCameras((prev) => prev.filter((c) => c.id !== camId));
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar variant="app" />
      <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">

        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/devices"
            className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <ArrowLeft className="h-4 w-4" /> Cihazlar
          </Link>
        </div>

        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-white">Kamera Yönetimi</h1>
          <span className="text-xs text-zinc-400 font-mono">{params.id}</span>
        </div>

        {/* Ses Dinleme */}
        <div className="rounded-xl border bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">🎙️ Canlı Mikrofon</p>
          <LiveAudio deviceId={params.id} />
        </div>

        {cameras.length === 0 ? (
          <div className="rounded-xl border bg-white p-8 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
            <Video className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Henüz kamera bulunamadı. Jetson'u başlatın ve kameralar otomatik keşfedilecek.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {cameras.map((cam) => (
              <div
                key={cam.id}
                className="rounded-xl border bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        cam.is_online
                          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400"
                          : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                      }`}
                    >
                      {cam.is_online ? (
                        <Wifi className="h-4 w-4" />
                      ) : (
                        <WifiOff className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{cam.name}</p>
                      <p className="text-xs text-zinc-400 truncate dark:text-zinc-500">{cam.rtsp_url}</p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                      cam.is_online
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400"
                        : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                    }`}
                  >
                    {cam.is_online ? "Çevrimiçi" : "Çevrimdışı"}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <select
                    value={cam.group_id ?? ""}
                    onChange={(e) =>
                      assignGroup(cam.id, e.target.value ? Number(e.target.value) : null)
                    }
                    className="rounded-lg border px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-red-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                  >
                    <option value="">— Grup Yok —</option>
                    {groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>

                  <Link
                    href={`/dashboard/devices/${params.id}/stream/${cam.id}`}
                    className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
                  >
                    <Video className="h-3.5 w-3.5" /> Canlı İzle
                  </Link>

                  <button
                    onClick={() => deleteCamera(cam.id)}
                    className="rounded-lg border px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:border-zinc-700 dark:hover:bg-red-950/30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
