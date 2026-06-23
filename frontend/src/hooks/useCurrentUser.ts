"use client";

import { useEffect, useState } from "react";
import { type CurrentUser, getMe } from "@/lib/auth";

export function useCurrentUser() {
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    getMe().then(setUser).catch(() => {});
  }, []);

  return user;
}
