"use client";

import Link from "next/link";
import { useState, useMemo, useEffect } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useSoundFX } from "~/hooks/useSoundFX";

type Route = {
  readonly title: string;
  readonly href: `/${string}`;
};

const routes: readonly Route[] = [
  { title: "WHACK-A-SIGN", href: "/whack" },
  { title: "OFFICIAL SONGS", href: "/songselection" },
  { title: "COMMUNITY", href: "/community" },
  // Song import tools are off in production (see server/devmode-guard.ts).
  ...(process.env.NODE_ENV !== "production" ? [{ title: "DEV MODE", href: "/devmode" } as const] : []),
] as const;

const getRoute = (index: number): Route => {
  const wrappedIndex = ((index % routes.length) + routes.length) % routes.length;
  const route = routes[wrappedIndex];
  if (!route) return routes[0]; 
  return route;
};

const Navbar: React.FC = () => {
  const pathname = usePathname();
  const { playBloop } = useSoundFX();

  const isMenuRoute = ["/whack", "/songselection", "/community", "/devmode"].includes(pathname ?? "");

  const initialIndex = routes.findIndex(r => r.href === pathname);
  const [activeIndex, setActiveIndex] = useState<number>(initialIndex !== -1 ? initialIndex : 1);
  const [isHidden, setIsHidden] = useState<boolean>(false);

  useEffect(() => {
    const idx = routes.findIndex(r => r.href === pathname);
    if (idx !== -1) {
      setActiveIndex(idx);
    }
  }, [pathname]);

  useEffect(() => {
    const handleWhack = (e: CustomEvent<boolean>) => {
      setIsHidden(e.detail);
    };
    window.addEventListener("whack-game-state" as any, handleWhack as EventListener);
    return () => {
      window.removeEventListener("whack-game-state" as any, handleWhack as EventListener);
    };
  }, []);

  useEffect(() => {
    if (pathname !== "/whack") {
      setIsHidden(false);
    }
  }, [pathname]);

  const isCurrentRoute = useMemo(() => {
    const currentRoute = getRoute(activeIndex);
    return pathname === currentRoute.href;
  }, [pathname, activeIndex]);

  const { currentRoute, prevRoute, nextRoute } = useMemo(() => ({
    currentRoute: getRoute(activeIndex),
    prevRoute: getRoute(activeIndex - 1),
    nextRoute: getRoute(activeIndex + 1),
  }), [activeIndex]);

  const handlePrevious = (): void => {
    playBloop();
    setActiveIndex((i) => {
      const newIndex = ((i - 1) % routes.length + routes.length) % routes.length;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("navbarActiveIndex", String(newIndex));
      }
      return newIndex;
    });
  };

  const handleNext = (): void => {
    playBloop();
    setActiveIndex((i) => {
      const newIndex = ((i + 1) % routes.length + routes.length) % routes.length;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("navbarActiveIndex", String(newIndex));
      }
      return newIndex;
    });
  };

  if (!isMenuRoute) return null;

  return (
    <motion.div
      data-testid="navbar"
      data-hidden={isHidden ? "true" : "false"}
      initial={{ y: -50, opacity: 0 }}
      animate={{ y: isHidden ? -250 : 0, opacity: isHidden ? 0 : 1 }}
      transition={{ type: "spring", stiffness: 120, damping: 20 }}
      className="absolute top-[80px] h-[120px] left-0 right-0 z-40 pointer-events-none flex items-end justify-center max-sm:hidden"
    >
      {/* 1. Previous Route Side Tab (Z=10) */}
      <div
        className="transition-all duration-200 border-l border-t border-white/40 pointer-events-auto flex items-center justify-center overflow-hidden z-10 relative"
        style={{
          width: "180px",
          height: "60px",
          backgroundColor: "var(--magenta)",
          borderRadius: "60px 60px 0 0",
          color: "var(--cyan)",
          boxShadow: "0 0 30px rgba(45,226,230,0.3), 0 0 60px rgba(146,0,117,0.2)",
        }}
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={prevRoute.title}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 10 }}
            transition={{ duration: 0.15 }}
            className="font-[subheading-font] pt-2 tracking-wide text-sm text-center text-white/90 whitespace-nowrap px-4"
          >
            {prevRoute.title}
          </motion.span>
        </AnimatePresence>
      </div>

      {/* 2. Main Continuous Center Console Arch (Arrows + Title unified in ONE shape, Z=30) */}
      <motion.div
        whileHover={{ scale: 1.01 }}
        className="relative z-30 pointer-events-auto -mx-6"
      >
        <div
          className="border-l border-t border-r border-white/40 overflow-hidden flex items-end justify-between px-8 relative"
          style={{
            width: "520px",
            height: "120px",
            backgroundColor: "var(--purple)",
            borderRadius: "260px 260px 0 0",
            boxShadow: isCurrentRoute
              ? "0 0 50px rgba(45,226,230,0.7), 0 0 100px rgba(146,0,117,0.5)"
              : "0 0 30px rgba(45,226,230,0.3), 0 0 60px rgba(146,0,117,0.2)",
            transition: "box-shadow 0.3s ease-in-out",
          }}
        >
          {/* Background Grid Pattern */}
          <div
            className="absolute bottom-0 left-1/2 -translate-x-1/2 pointer-events-none"
            style={{
              width: "320px",
              height: "95px",
              backgroundColor: "transparent",
              borderRadius: "160px 160px 0 0",
              border: "1px solid white",
              backgroundImage: `
                linear-gradient(0deg, white 1px, transparent 1px),
                linear-gradient(90deg, white 1px, transparent 1px)
              `,
              backgroundSize: "15px 15px",
              opacity: 0.25,
            }}
          />

          {/* Previous Arrow Button < */}
          <Link href={prevRoute.href} onClick={handlePrevious} className="z-20 mb-4 pointer-events-auto">
            <button
              type="button"
              className="w-12 h-12 rounded-full bg-[var(--magenta)] border border-white/40 flex items-center justify-center shadow-[0_0_20px_rgba(45,226,230,0.5)] transition-all duration-300 hover:scale-110 hover:bg-[#c00099] active:scale-95 cursor-pointer hover:ring-2 hover:ring-[var(--cyan)]"
              aria-label="Previous route"
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </Link>

          {/* Animated Center Title */}
          <div className="z-10 mb-5 flex-1 flex justify-center">
            <AnimatePresence mode="wait">
              <motion.span
                key={currentRoute.title}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="font-[subheading-font] tracking-wider text-3xl text-center text-white drop-shadow-[0_2px_10px_rgba(255,255,255,0.5)] whitespace-nowrap px-2 pt-3"
              >
                {currentRoute.title}
              </motion.span>
            </AnimatePresence>
          </div>

          {/* Next Arrow Button > */}
          <Link href={nextRoute.href} onClick={handleNext} className="z-20 mb-4 pointer-events-auto">
            <button
              type="button"
              className="w-12 h-12 rounded-full bg-[var(--magenta)] border border-white/40 flex items-center justify-center shadow-[0_0_20px_rgba(45,226,230,0.5)] transition-all duration-300 hover:scale-110 hover:bg-[#c00099] active:scale-95 cursor-pointer hover:ring-2 hover:ring-[var(--cyan)]"
              aria-label="Next route"
            >
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </Link>
        </div>
      </motion.div>

      {/* 3. Next Route Side Tab (Z=10) */}
      <div
        className="transition-all duration-200 border-t border-r border-white/40 pointer-events-auto flex items-center justify-center overflow-hidden z-10 relative"
        style={{
          width: "180px",
          height: "60px",
          backgroundColor: "var(--magenta)",
          borderRadius: "60px 60px 0 0",
          color: "var(--cyan)",
          boxShadow: "0 0 30px rgba(45,226,230,0.3), 0 0 60px rgba(146,0,117,0.2)",
        }}
      >
        <AnimatePresence mode="wait">
          <motion.span
            key={nextRoute.title}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
            className="font-[subheading-font] pt-2 tracking-wide text-sm text-center text-white/90 whitespace-nowrap px-4"
          >
            {nextRoute.title}
          </motion.span>
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export { Navbar };