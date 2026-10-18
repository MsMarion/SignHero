"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { User as UserIcon, LogIn, LogOut, Volume2, VolumeX, Sparkles, Volume1 } from "lucide-react";
import { motion } from "framer-motion";
import { useSoundFX } from "~/hooks/useSoundFX";
import { useMusic } from "~/hooks/useMusic";
import { usePathname } from "next/navigation";

export function TopHUD() {
  const { data: session } = useSession();
  const { isSfxMuted, toggleSfxMute, playHover, playClick, playWarp } = useSoundFX();
  const { isMusicMuted, toggleMusicMute } = useMusic();
  const pathname = usePathname();

  return (
    <motion.header
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 100, damping: 20 }}
      className="absolute top-6 left-8 right-8 z-50 flex items-start justify-between pointer-events-none"
    >
      {/* Left: SignHero Logo / Home Button */}
      <div className="pointer-events-auto">
        <Link
          href="/"
          onClick={() => {
            if (pathname !== "/") playWarp();
          }}
          onMouseEnter={() => playHover()}
          className="group flex items-center gap-3 px-6 py-2.5 backdrop-blur-xl bg-black/40 border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(146,0,255,0.25)] transition-all duration-300 hover:border-cyan-400/50 hover:shadow-[0_0_25px_rgba(45,226,230,0.4)] active:scale-95"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-fuchsia-600 to-cyan-400 flex items-center justify-center font-[display-font] font-black text-white text-xl shadow-lg group-hover:scale-110 transition-transform">
            S
          </div>
          <span className="font-[display-font] font-black text-2xl tracking-wider text-white group-hover:text-cyan-300 transition-colors">
            SignHero
          </span>
        </Link>
      </div>

      {/* Right: Audio Controls, Auth Card, and Player Stats Badge Column */}
      <div className="pointer-events-auto flex flex-col items-end gap-3.5">
        {/* Top Row: Audio Controls & Auth Card */}
        <div className="flex items-center gap-4">
          {/* Audio Toggles Card */}
          <div className="flex items-center gap-2 px-3 py-1.5 backdrop-blur-xl bg-black/40 border border-white/10 rounded-2xl shadow-[0_8px_32px_0_rgba(146,0,255,0.25)]">
            <button
              onClick={() => {
                playClick();
                toggleMusicMute();
              }}
              onMouseEnter={() => playHover()}
              className={`p-2.5 rounded-xl border transition-all duration-300 active:scale-95 ${
                isMusicMuted
                  ? "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30"
                  : "bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-cyan-400 hover:shadow-[0_0_15px_rgba(45,226,230,0.5)]"
              }`}
              title={isMusicMuted ? "Unmute Music" : "Mute Music"}
              aria-label="Toggle Music"
            >
              {isMusicMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>

            <button
              onClick={() => {
                toggleSfxMute();
                playClick();
              }}
              onMouseEnter={() => playHover()}
              className={`p-2.5 rounded-xl border transition-all duration-300 active:scale-95 ${
                isSfxMuted
                  ? "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30"
                  : "bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-fuchsia-400 hover:shadow-[0_0_15px_rgba(217,70,239,0.5)]"
              }`}
              title={isSfxMuted ? "Unmute Sound Effects" : "Mute Sound Effects"}
              aria-label="Toggle SFX"
            >
              {isSfxMuted ? <Volume1 size={18} /> : <Sparkles size={18} />}
            </button>
          </div>

          {/* User Auth Card */}
          <div className="flex items-center backdrop-blur-xl bg-black/40 border border-white/10 rounded-2xl p-1.5 shadow-[0_8px_32px_0_rgba(146,0,255,0.25)]">
            {session ? (
              <div className="flex items-center gap-3 pl-4 pr-1 py-1">
                <Link
                  href="/profile"
                  onClick={() => playClick()}
                  onMouseEnter={() => playHover()}
                  className="flex items-center gap-2 group"
                >
                  <span className="text-xs font-bold text-fuchsia-300 uppercase tracking-widest group-hover:text-cyan-400 transition-colors">
                    {session.user?.name || "PLAYER"}
                  </span>
                  <div className="w-7 h-7 rounded-xl bg-gradient-to-tr from-fuchsia-500 to-cyan-500 flex items-center justify-center shadow-md group-hover:scale-110 transition-transform">
                    <UserIcon size={14} className="text-white" />
                  </div>
                </Link>
                <button
                  onClick={() => {
                    playClick();
                    void signOut();
                  }}
                  onMouseEnter={() => playHover()}
                  className="p-2 bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 rounded-xl transition-all text-red-400 active:scale-95"
                  title="Sign Out"
                >
                  <LogOut size={16} />
                </button>
              </div>
            ) : (
              <Link href="/auth/signin">
                <motion.button
                  whileHover={{ scale: 1.05, boxShadow: "0 0 20px rgba(45,226,230,0.5)" }}
                  whileTap={{ scale: 0.95 }}
                  onMouseEnter={() => playHover()}
                  onClick={() => playClick()}
                  className="flex items-center gap-2 bg-gradient-to-r from-cyan-500/20 to-fuchsia-500/20 border border-cyan-400/40 px-6 py-2.5 rounded-xl text-cyan-100 font-bold tracking-widest text-xs hover:border-cyan-300 transition-all shadow-md"
                >
                  <LogIn size={16} />
                  LOGIN
                </motion.button>
              </Link>
            )}
          </div>
        </div>

      </div>
    </motion.header>
  );
}
