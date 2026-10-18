"use client";

import React, { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";

export function MenuContainerWrapper({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isWhackActive, setIsWhackActive] = useState(false);

  const isMenuRoute = ["/whack", "/songselection", "/community", "/devmode"].includes(pathname ?? "");

  useEffect(() => {
    const handleWhack = (e: CustomEvent<boolean>) => {
      setIsWhackActive(e.detail);
    };
    window.addEventListener("whack-game-state" as any, handleWhack as EventListener);
    return () => {
      window.removeEventListener("whack-game-state" as any, handleWhack as EventListener);
    };
  }, []);

  useEffect(() => {
    if (pathname !== "/whack") {
      setIsWhackActive(false);
    }
  }, [pathname]);

  if (!isMenuRoute) {
    // Desktop: no wrapper at all (`contents`). Phone: leave room for the compact header so in-flow pages
    // (sign in, hero name, profile) do not start underneath it.
    return <div className="contents max-sm:flex max-sm:flex-col max-sm:w-full max-sm:h-full max-sm:pt-[76px]">{children}</div>;
  }

  let borderColor = "border-white/30";
  if (pathname === "/songselection") borderColor = "border-fuchsia-500/40 shadow-[0_0_40px_rgba(217,70,239,0.3)]";
  if (pathname === "/community") borderColor = "border-cyan-400/40 shadow-[0_0_40px_rgba(45,226,230,0.3)]";
  if (pathname === "/devmode") borderColor = "border-purple-500/40 shadow-[0_0_40px_rgba(168,85,247,0.3)]";
  if (pathname === "/whack") borderColor = "border-green-500/40 shadow-[0_0_40px_rgba(34,197,94,0.3)]";

  return (
    <div className="absolute inset-0 w-full h-full flex flex-col items-center pointer-events-none">
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 100, damping: 20 }}
        className={
          isWhackActive
            ? "absolute inset-0 w-full h-full z-50 rounded-none border-none mt-0 p-0 overflow-hidden pointer-events-auto bg-transparent"
            : `z-100 absolute top-[200px] w-3/4 h-[800px] max-sm:top-[84px] max-sm:bottom-3 max-sm:h-auto max-sm:w-[calc(100%-1.5rem)] max-sm:px-4 max-sm:pt-6 max-sm:pb-4 border px-12 pt-20 pb-12 rounded-b-3xl rounded-t-xl glass-panel flex flex-col overflow-y-auto custom-scrollbar transition-all duration-500 pointer-events-auto shadow-2xl ${borderColor}`
        }
        style={!isWhackActive ? { background: "linear-gradient(to bottom, rgba(58,0,102,0.8), rgba(146,0,117,0.8), rgba(58,0,102,0.8))" } : {}}
      >
        {children}
      </motion.div>
    </div>
  );
}
