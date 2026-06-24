"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

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
    if (!confirm("Kamerayi silmek istediginizden emin misiniz?")) return;
    await fetch(`/api/cameras/${camId}`, { method: "DELETE" });
    setCameras((prev) => prev.filter((c) => c.id !== camId));
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Cihaz Kameralari</h1>
      <div className="space-y-3">
        {cameras.map((cam) => (
          <div key={cam.id} className="border rounded p-3 flex items-center justify-between">
            <div>
              <span className={`inline-block w-2 h-2 rounded-full mr-2 ${cam.is_online ? "bg-green-500" : "bg-gray-400"}`} />
              <span className="font-medium">{cam.name}</span>
              <span className="text-sm text-gray-500 ml-2">{cam.rtsp_url}</span>
            </div>
            <div className="flex gap-2 items-center">
              <select
                value={cam.group_id ?? ""}
                onChange={(e) => assignGroup(cam.id, e.target.value ? Number(e.target.value) : null)}
                className="border rounded px-2 py-1 text-sm"
              >
                <option value="">-- Grup Yok --</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <Link
                href={`/dashboard/devices/${params.id}/stream/${cam.id}`}
                className="bg-blue-600 text-white px-3 py-1 rounded text-sm"
              >
                Canli Izle
              </Link>
              <button
                onClick={() => deleteCamera(cam.id)}
                className="bg-red-500 text-white px-3 py-1 rounded text-sm"
              >
                Sil
              </button>
            </div>
          </div>
        ))}
        {cameras.length === 0 && (
          <p className="text-gray-500">Henuz kamera bulunamadi. Jetson'u baslatin.</p>
        )}
      </div>
    </div>
  );
}
