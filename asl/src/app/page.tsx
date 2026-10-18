"use client";

import Link from "next/link";
import { useState } from "react";
import { SynthwaveBackground } from "~/components/game/SynthwaveBackground";
import { useSoundFX } from "~/hooks/useSoundFX";

export default function Home() {
  const [isHovering, setIsHovering] = useState(false);
  const { playHover, playClick } = useSoundFX();

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0d0221]">
      <SynthwaveBackground />

      {/* Main Content */}
      <div className="relative z-10 flex flex-col items-center justify-center h-full px-4">
        {/* Title Container with Glow */}
        <div className="relative mb-12 group cursor-default">
            <h1
            className="text-8xl md:text-9xl font-[display-font] font-black text-white text-center tracking-wider relative z-10"
            style={{
                textShadow: "0 0 10px #2de2e6, 0 0 20px #2de2e6, 0 0 40px #d946ef, 0 0 80px #d946ef",
            }}
            >
            SignHero
            </h1>
            <div className="absolute inset-0 blur-3xl opacity-50 bg-gradient-to-r from-cyan-400 to-fuchsia-600 -z-10 rounded-full scale-110" />
        </div>

        <p className="text-xl md:text-2xl text-cyan-100 mb-16 text-center max-w-2xl font-light tracking-wide glass-panel px-8 py-4 backdrop-blur-xl border border-cyan-400/30 shadow-[0_8px_32px_0_rgba(45,226,230,0.2)]">
          Master American Sign Language through interactive rhythm games
        </p>

        <Link href="/whack" passHref>
          <button
            onMouseEnter={() => {
              setIsHovering(true);
              playHover();
            }}
            onMouseLeave={() => setIsHovering(false)}
            onClick={() => playClick()}
            className="group relative px-16 py-6 text-3xl font-bold text-white transition-all duration-300 transform hover:scale-105 active:scale-95 cursor-pointer rounded-2xl overflow-hidden shadow-[0_0_30px_rgba(217,70,239,0.5)] hover:shadow-[0_0_50px_rgba(45,226,230,0.8)] border border-white/30"
          >
            {/* Button Background & Border */}
            <div className="absolute inset-0 bg-gradient-to-r from-fuchsia-600 via-purple-600 to-cyan-500 rounded-2xl transition-all duration-300 opacity-90 group-hover:opacity-100" />
            
            {/* Shine Effect */}
            <div className="absolute inset-0 rounded-2xl overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out" />
            </div>

            {/* Text */}
            <span className="relative z-10 font-bold tracking-widest drop-shadow-md text-white font-[subheading-font]">
                START GAME
            </span>
          </button>
        </Link>
      </div>

      <div className="absolute bottom-6 left-0 right-0 text-center text-cyan-300/40 font-mono text-sm tracking-widest pointer-events-none animate-pulse">
        PRESS START TO BEGIN
      </div>
    </div>
  );
}