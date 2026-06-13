"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: fd.get("username"), password: fd.get("password") }),
      });
      if (res.ok) {
        router.push("/dashboard");
      } else {
        setError("Kullanıcı adı veya şifre hatalı.");
      }
    } catch {
      setError("Sunucuya bağlanılamadı.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-8 shadow-sm space-y-4"
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-red-100 ring-1 ring-red-300">
            <Eye className="h-4 w-4 text-red-600" />
          </span>
          <span className="text-sm font-semibold text-zinc-900">GuardWatch</span>
        </div>
        <h1 className="text-lg font-semibold text-zinc-900">Yönetici Girişi</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-700">Kullanıcı Adı</label>
          <input
            name="username"
            autoComplete="username"
            required
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400"
          />
        </div>
        <div className="space-y-2">
          <label className="text-xs font-medium text-zinc-700">Şifre</label>
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
        >
          {loading ? "Giriş yapılıyor…" : "Giriş Yap"}
        </button>
      </form>
    </main>
  );
}
