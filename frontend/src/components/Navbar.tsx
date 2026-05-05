"use client";

import Link from "next/link";
import { Eye } from "lucide-react";

import { Button } from "@/components/ui/button";

interface Props {
  variant?: "marketing" | "app";
}

export function Navbar({ variant = "marketing" }: Props) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/5 bg-zinc-950/70 backdrop-blur supports-[backdrop-filter]:bg-zinc-950/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-red-500/15 ring-1 ring-red-500/30">
            <Eye className="h-4 w-4 text-red-400" />
          </span>
          <span className="text-sm font-semibold tracking-tight">
            Guardwatch
            <span className="ml-1 text-zinc-500 font-normal">/ Fleet</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-3">
          {variant === "marketing" ? (
            <>
              <Link
                href="#features"
                className="hidden text-xs text-zinc-400 hover:text-zinc-200 sm:block"
              >
                Özellikler
              </Link>
              <Link
                href="#how"
                className="hidden text-xs text-zinc-400 hover:text-zinc-200 sm:block"
              >
                Nasıl Çalışır
              </Link>
              <Button asChild size="sm" className="ml-2 bg-red-500 hover:bg-red-600">
                <Link href="/dashboard">Canlı Panel</Link>
              </Button>
            </>
          ) : (
            <Button asChild variant="ghost" size="sm">
              <Link href="/">← Anasayfa</Link>
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
