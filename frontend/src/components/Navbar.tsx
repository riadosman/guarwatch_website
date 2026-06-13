"use client";

import Link from "next/link";
import { Eye } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  variant?: "marketing" | "app";
}

export function Navbar({ variant = "marketing" }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-red-100 ring-1 ring-red-300">
            <Eye className="h-4 w-4 text-red-600" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-zinc-900">
            Guardwatch
            <span className="ml-1 text-zinc-500 font-normal">/ Güvenlik</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-3">
          {variant === "marketing" ? (
            <>
              <Link
                href="#features"
                className="hidden text-xs text-zinc-600 hover:text-zinc-900 sm:block"
              >
                Özellikler
              </Link>
              <Link
                href="#how"
                className="hidden text-xs text-zinc-600 hover:text-zinc-900 sm:block"
              >
                Nasıl Çalışır
              </Link>
              <Button asChild size="sm" className="ml-2 bg-red-500 hover:bg-red-600">
                <Link href="/dashboard">Canlı Panel</Link>
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/devices">Cihazlar</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/history">Geçmiş</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/">← Anasayfa</Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await fetch(
                    `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/auth/logout`,
                    { method: "POST", credentials: "include" }
                  );
                  window.location.href = "/login";
                }}
              >
                Çıkış
              </Button>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
}
