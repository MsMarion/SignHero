"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

/**
 * Signed-in players must choose a hero name (once, permanently) before they can play. This sends
 * anyone without one to the choose-a-name page. The server enforces it as well: scores are refused
 * for accounts without a hero name (see resolveScoreIdentity).
 */
export function HeroNameGate() {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated") return;
    if (session.user.heroName) return;
    if (pathname.startsWith("/auth/")) return;
    router.replace("/auth/hero-name");
  }, [status, session, pathname, router]);

  return null;
}
