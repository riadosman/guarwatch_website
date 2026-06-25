"use client";

import Link from "next/link";
import { Eye, Moon, Settings, Sun, Users } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { can } from "@/lib/auth";

interface Props {
  variant?: "marketing" | "app";
}

export function Navbar({ variant = "marketing" }: Props) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const user = useCurrentUser();
  useEffect(() => setMounted(true), []);

  const isAdmin = can(user, "users", "read");

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:border-zinc-700 dark:bg-zinc-900/70 dark:supports-[backdrop-filter]:bg-zinc-900/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-red-100 ring-1 ring-red-300">
            <Eye className="h-4 w-4 text-red-600" />
          </span>
          <span className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            Guardwatch
            <span className="ml-1 font-normal text-zinc-500 dark:text-zinc-400">/ Güvenlik</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2">
          {variant === "marketing" ? (
            <>
              <Link
                href="#features"
                className="hidden text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 sm:block"
              >
                Özellikler
              </Link>
              <Link
                href="#how"
                className="hidden text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 sm:block"
              >
                Nasıl Çalışır
              </Link>
              {mounted && (
                <button
                  onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                  className="grid h-8 w-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  aria-label="Tema değiştir"
                >
                  {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
              )}
              <Button asChild size="sm" className="ml-2 bg-red-500 hover:bg-red-600">
                <Link href="/dashboard">Canlı Panel</Link>
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-1">
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/devices">Cihazlar</Link>
              </Button>
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/history">Geçmiş</Link>
              </Button>

              {isAdmin && (
                <>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/dashboard/groups" className="flex items-center gap-1.5">
                      Gruplar
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/dashboard/users" className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5" /> Kullanıcılar
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/dashboard/roles" className="flex items-center gap-1.5">
                      <Settings className="h-3.5 w-3.5" /> Roller
                    </Link>
                  </Button>
                </>
              )}

              {user && (
                <span className="hidden sm:flex items-center gap-1 px-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {user.username}
                  {user.role && (
                    <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] dark:bg-zinc-800">
                      {user.role}
                    </span>
                  )}
                </span>
              )}

              {mounted && (
                <button
                  onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                  className="grid h-8 w-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                  aria-label="Tema değiştir"
                >
                  {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await fetch("/auth/logout", { method: "POST", credentials: "include" });
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
