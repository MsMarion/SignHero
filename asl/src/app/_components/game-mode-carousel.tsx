"use client";

import { useState, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";

type GameMode = {
  id: string;
  title: string;
  href: string;
};

const MODES: GameMode[] = [
  { id: "community", title: "COMMUNITY", href: "/community" },
  { id: "official", title: "OFFICIAL SONGS", href: "/songselection" },
  { id: "whack", title: "WHACK-A-SIGN", href: "/whack" },
  // Song import tools are off in production (see server/devmode-guard.ts).
  ...(process.env.NODE_ENV !== "production" ? [{ id: "dev", title: "DEV MODE", href: "/devmode" }] : []),
];

export function GameModeCarousel() {
  const router = useRouter();
  const pathname = usePathname();
  
  // Find current index based on pathname
  const currentIndex = MODES.findIndex(m => m.href === pathname);
  const [index, setIndex] = useState(currentIndex === -1 ? 1 : currentIndex);

  useEffect(() => {
    const newIdx = MODES.findIndex(m => m.href === pathname);
    if (newIdx !== -1) setIndex(newIdx);
  }, [pathname]);

  const rotate = (direction: number) => {
    const nextIndex = (index + direction + MODES.length) % MODES.length;
    setIndex(nextIndex);
    router.push(MODES[nextIndex]!.href);
  };

  const getVisibleModes = () => {
    const prevIdx = (index - 1 + MODES.length) % MODES.length;
    const nextIdx = (index + 1) % MODES.length;
    return {
      prev: MODES[prevIdx]!,
      current: MODES[index]!,
      next: MODES[nextIdx]!,
    };
  };

  const { prev, current, next } = getVisibleModes();

  return (
    <div className="relative w-full flex justify-center pt-8 pb-12 z-50 select-none">
      <div className="flex items-center gap-4 md:gap-8">
        {/* Previous Mode Tab */}
        <motion.div 
          onClick={() => rotate(-1)}
          className="hidden md:flex items-center justify-center px-8 py-4 bg-purple-900/40 border border-white/10 rounded-t-[40px] opacity-40 hover:opacity-60 cursor-pointer transition-all h-16 mt-8"
        >
          <span className="text-white font-black tracking-widest text-[10px] uppercase whitespace-nowrap">
            {prev.title}
          </span>
        </motion.div>

        {/* Center Active Mode Area */}
        <div className="relative flex items-center gap-4">
          {/* Left Arrow */}
          <button 
            onClick={() => rotate(-1)}
            className="w-12 h-12 rounded-xl bg-gradient-to-br from-fuchsia-600 to-purple-800 flex items-center justify-center border border-white/20 shadow-lg hover:scale-110 active:scale-95 transition-all text-white"
          >
            <ChevronLeft size={24} />
          </button>

          {/* Arched Center Tab */}
          <div className="relative w-64 md:w-80 flex flex-col items-center">
            {/* Arched Top Background */}
            <div className="absolute -top-10 inset-0 bg-[#2d0b4d] border-t-2 border-l-2 border-r-2 border-fuchsia-500/50 rounded-t-[100px] shadow-[0_-10px_40px_rgba(168,85,247,0.3)]" />
            
            {/* Grid Pattern in Arch */}
            <div className="absolute -top-10 inset-0 opacity-20 pointer-events-none rounded-t-[100px] overflow-hidden">
                <div className="w-full h-full" style={{ 
                    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px)',
                    backgroundSize: '15px 15px'
                }} />
            </div>

            {/* Title Container */}
            <div className="relative z-10 w-full h-24 bg-[#1a0a2e] border-l-2 border-r-2 border-fuchsia-500/50 flex flex-col items-center justify-center">
                <AnimatePresence mode="wait">
                    <motion.h2
                        key={current.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="text-white font-black tracking-[4px] text-xl md:text-2xl text-center uppercase"
                        style={{ textShadow: "0 0 20px rgba(45,226,230,0.5)" }}
                    >
                        {current.title}
                    </motion.h2>
                </AnimatePresence>
            </div>
            
            {/* Bottom Glow Bar */}
            <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_10px_#2de2e6]" />
          </div>

          {/* Right Arrow */}
          <button 
            onClick={() => rotate(1)}
            className="w-12 h-12 rounded-xl bg-gradient-to-br from-fuchsia-600 to-purple-800 flex items-center justify-center border border-white/20 shadow-lg hover:scale-110 active:scale-95 transition-all text-white"
          >
            <ChevronRight size={24} />
          </button>
        </div>

        {/* Next Mode Tab */}
        <motion.div 
          onClick={() => rotate(1)}
          className="hidden md:flex items-center justify-center px-8 py-4 bg-purple-900/40 border border-white/10 rounded-t-[40px] opacity-40 hover:opacity-60 cursor-pointer transition-all h-16 mt-8"
        >
          <span className="text-white font-black tracking-widest text-[10px] uppercase whitespace-nowrap">
            {next.title}
          </span>
        </motion.div>
      </div>
    </div>
  );
}
