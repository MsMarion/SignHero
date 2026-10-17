"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Song {
  id: string;
  songName: string;
  albumName: string | null;
  thumbnailName?: string | null;
  thumbnailUrl?: string | null;
  audioUrl?: string | null;
}

interface SongCarouselProps {
  songs: Song[];
}

function SongCarouselContent({ songs = [] }: SongCarouselProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const targetSongId = searchParams?.get("songId");

  const [index, setIndex] = useState(-7);
  const [isLoaded, setIsLoaded] = useState(false);
  const [flippedCard, setFlippedCard] = useState<string | null>(null);

  useEffect(() => {
    let target = 0;
    if (targetSongId && songs.length > 0) {
      const foundIdx = songs.findIndex(s => s.id === targetSongId);
      if (foundIdx !== -1) {
        target = foundIdx;
      }
    }

    const startShuffle = () => {
      let current = target - 7;

      const interval = setInterval(() => {
        if (current < target) {
          current++;
          setIndex(current);
          playCardFlipSound();
        } else {
          clearInterval(interval);
          if (targetSongId && songs.some(s => s.id === targetSongId)) {
            setFlippedCard(targetSongId);
          }
        }
      }, 80);

      setTimeout(() => {
        setIsLoaded(true);
      }, 100);
    };

    startShuffle();
  }, [targetSongId, songs]);

  const playCardFlipSound = () => {
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;

      const ctx = new AudioContext();
      const t = ctx.currentTime;

      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();

      osc.type = "sine";
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.1);

      oscGain.gain.setValueAtTime(0, t);
      oscGain.gain.linearRampToValueAtTime(0.5, t + 0.01);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.1);

      const duration = 0.1;
      const sampleRate = ctx.sampleRate;
      const bufferSize = sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
      const data = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 500;
      filter.Q.value = 1;

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0, t);
      noiseGain.gain.linearRampToValueAtTime(0.5, t + 0.01);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      noise.start(t);
    } catch (e) {
      console.error("Audio generation failed", e);
    }
  };

  // --- Audio Preview Logic ---
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Cleanup audio on unmount
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const handleMouseEnter = (song: Song) => {
    if (!song.audioUrl) return;

    // Stop extended playback if any
    if (audioRef.current) {
      audioRef.current.pause();
    } else {
      audioRef.current = new Audio();
    }

    try {
      audioRef.current.src = song.audioUrl;
      audioRef.current.volume = 0.5;
      audioRef.current.play().catch((err: unknown) => {
        // Moving the mouse to another song interrupts the previous preview; that rejects play() with AbortError and is not a real failure.
        if ((err as { name?: string } | null)?.name !== "AbortError") console.error("Preview play error:", err);
      });
      
      // Dispatch event to dim background music
      window.dispatchEvent(new Event("audio-preview-start"));
    } catch (e) {
      console.error("Error setting up audio preview", e);
    }
  };

  const handleMouseLeave = () => {
    if (audioRef.current) {
      // Fade out effect could be nice, but immediate stop is safer for UI responsiveness
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      
      // Dispatch event to restore background music
      window.dispatchEvent(new Event("audio-preview-end"));
    }
  };

  const navigate = (direction: number) => {
    if (songs.length === 0) return;
    playCardFlipSound();
    setFlippedCard(null); // Reset flip when navigating
    setIndex((prev) => prev + direction);
  };

  const handleCardClick = (songId: string, isCenter: boolean, offset: number) => {
    if (isCenter) {
      setFlippedCard(flippedCard === songId ? null : songId);
      playCardFlipSound();
    } else {
      navigate(offset);
    }

    
  };

  const handleModeSelect = (songId: string, mode: string) => {
    const pathname = typeof window !== "undefined" ? window.location.pathname : "";
    const fromParam = `?from=${encodeURIComponent(pathname)}&songId=${encodeURIComponent(songId)}`;
    if(mode == "aslrevolution") {
      router.push(`/game/${songId}${fromParam}`);
    } else if(mode == "signhero") {
      router.push(`/game/testing/${songId}${fromParam}`);
    } else if(mode == "training") {
      router.push(`/game/training/${songId}${fromParam}`);
    }
  };

  const getVisibleSongs = () => {
    if (!songs.length) return [];

    const visibleCount = 5;
    const range = Math.floor(visibleCount / 2);

    const items = [];
    for (let i = -range; i <= range; i++) {
      const virtualIndex = index + i;
      let arrayIndex = virtualIndex % songs.length;
      if (arrayIndex < 0) arrayIndex += songs.length;

      items.push({
        song: songs[arrayIndex],
        virtualIndex: virtualIndex,
        offset: i
      });
    }
    return items;
  };

  const visibleItems = getVisibleSongs();

  const getVariant = (offset: number) => {
    const absOffset = Math.abs(offset);

    const X_SPACING = 280;
    const Z_DEPTH = -300;
    const ROTATION = 35;

    const x = offset * X_SPACING;
    const z = Math.abs(offset) * Z_DEPTH;
    const rotateY = offset * -ROTATION;

    const scale = 1 - (absOffset * 0.15);
    const opacity = 1 - (absOffset * 0.3);
    const zIndex = 100 - absOffset;

    return {
      x,
      z,
      rotateY,
      scale,
      opacity,
      zIndex
    };
  };

  return (
    <div className={`relative w-full overflow-hidden flex flex-col items-center justify-center py-20 transition-opacity duration-1000 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
      <div
        className="relative flex items-center justify-center w-full max-w-7xl h-[600px]"
        style={{ perspective: "1000px" }}
      >
        {/* Navigation Buttons */}
        {songs.length > 0 && (
          <>
            <motion.button
              whileHover={{ scale: 1.1, x: -5 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate(-1)}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-[999] text-white/70 hover:text-cyan-400 transition-colors cursor-pointer bg-black/20 p-2 rounded-full backdrop-blur-sm"
            >
              <ChevronLeft size={64} />
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.1, x: 5 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => navigate(1)}
              className="absolute right-4 top-1/2 -translate-y-1/2 z-[999] text-white/70 hover:text-cyan-400 transition-colors cursor-pointer bg-black/20 p-2 rounded-full backdrop-blur-sm"
            >
              <ChevronRight size={64} />
            </motion.button>
          </>
        )}

        <div className="relative w-full h-full flex items-center justify-center" style={{ transformStyle: "preserve-3d" }}>
          <AnimatePresence initial={false}>
            {visibleItems.map(({ song, virtualIndex, offset }) => {
              const variant = getVariant(offset);
              const isCenter = offset === 0;
              const isFlipped = flippedCard === song.id;

              return (
                <motion.div
                  key={virtualIndex}
                  initial={false}
                  animate={{
                    x: variant.x,
                    z: variant.z,
                    rotateY: variant.rotateY + (isFlipped ? 180 : 0),
                    scale: variant.scale,
                    opacity: variant.opacity,
                    zIndex: variant.zIndex,
                  }}
                  exit={{ opacity: 0, scale: 0 }}
                  transition={{
                    type: "spring",
                    stiffness: 200,
                    damping: 24,
                    mass: 1
                  }}
                  className="absolute w-96 h-[520px] cursor-pointer"
                  style={{
                    transformStyle: "preserve-3d",
                  }}
                  onClick={() => handleCardClick(song.id, isCenter, offset)}
                  onMouseEnter={() => {
                    if (isCenter) handleMouseEnter(song);
                  }}
                  onMouseLeave={() => {
                    if (isCenter) handleMouseLeave();
                  }}
                >
                  {/* Card Container with 3D flip */}
                  <div className="relative w-full h-full" style={{ transformStyle: "preserve-3d" }}>
                    
                    {/* FRONT SIDE */}
                    <div
                      className={`
                        absolute inset-0 w-full h-full rounded-2xl overflow-hidden
                        bg-gradient-to-b from-purple-600 via-purple-700 to-purple-900
                        border-4 ${isCenter ? "border-cyan-400 shadow-[0_0_40px_rgba(45,226,230,0.5)]" : "border-purple-500"}
                        flex flex-col shadow-2xl
                        transition-all duration-300
                      `}
                      style={{
                        backfaceVisibility: "hidden",
                        transform: "rotateY(0deg)"
                      }}
                    >
                      {/* Thumbnail Section */}
                      <div className="h-[55%] w-full bg-[#0d0221] flex items-center justify-center overflow-hidden relative">
                        {song.thumbnailUrl ? (
                          <img
                            src={`${song.thumbnailUrl}`}
                            alt={song.songName}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="text-[#2de2e6] text-6xl animate-pulse">♪</div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-[#540d6e]/50 to-transparent"></div>
                      </div>

                      {/* Info Section */}
                      <div className="h-[30%] bg-[#2e2157]/90 p-4 border-t-2 border-[#920075]">
                        <h3 className="text-white font-bold text-lg truncate">
                          {song.songName}
                        </h3>
                        <p className="text-[#2de2e6] text-sm truncate mt-1">
                          {song.albumName || "Unknown Artist"}
                        </p>
                      </div>

                      {/* Select Section */}
                      <div className="h-[15%] bg-gradient-to-r from-[#2de2e6] to-[#920075] flex items-center justify-center border-t-2 border-[#2de2e6]">
                        {isCenter && (
                          <span className="text-white font-bold tracking-wide">
                            ► SELECT
                          </span>
                        )}
                      </div>
                    </div>

                    {/* BACK SIDE - Game Modes */}
                    <div
                      className={`
                        absolute inset-0 w-full h-full rounded-2xl overflow-hidden
                        bg-gradient-to-b from-[#540d6e] via-[#2e2157] to-[#0d0221]
                        border-4 ${isCenter ? "border-cyan-400 shadow-[0_0_40px_rgba(45,226,230,0.5)]" : "border-purple-500"}
                        flex flex-col shadow-2xl p-6
                      `}
                      style={{
                        backfaceVisibility: "hidden",
                        transform: "rotateY(180deg)"
                      }}
                    >
                      <h2 className="text-white text-2xl font-bold text-center mb-6 mt-4" style={{
                        textShadow: "0 0 20px rgba(45,226,230,0.5)"
                      }}>
                        SELECT MODE
                      </h2>

                      <div className="flex-1 flex flex-col gap-4 justify-center">
                        {/* [ARCHIVED]: Sign Hero Mode (Testing Mode)
                         * Archived to streamline gameplay around ASL Revolution.
                         * Future Roadmap: See documentation/RHYTHM_ENGINE_UNIFICATION.md
                        <motion.button
                          whileHover={{ scale: 1.05, x: 5 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleModeSelect(song.id, "signhero");
                          }}
                          className="hover:scale-105 cursor-pointer relative h-24 rounded-xl bg-gradient-to-r from-[#920075] to-[#540d6e] border-2 border-[#2de2e6] overflow-hidden group"
                          style={{
                            boxShadow: "0 0 20px rgba(45,226,230,0.3)"
                          }}
                        >
                          <div className="absolute inset-0 bg-[#2de2e6]/0 group-hover:bg-[#2de2e6]/10 transition-all"></div>
                          <div className="relative z-10 flex items-center justify-center h-full">
                            <span className="text-white text-xl font-bold">SIGN HERO</span>
                          </div>
                        </motion.button>
                        */}

                        {/* Just Dance Mode */}
                        <motion.button
                          whileHover={{ scale: 1.05, x: 5 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleModeSelect(song.id, "aslrevolution");
                          }}
                          className=" hover:scale-105 cursor-pointer relative h-24 rounded-xl bg-gradient-to-r from-[#920075] to-[#540d6e] border-2 border-[#2de2e6] overflow-hidden group"
                          style={{
                            boxShadow: "0 0 20px rgba(45,226,230,0.3)"
                          }}
                        >
                          <div className="absolute inset-0 bg-[#2de2e6]/0 group-hover:bg-[#2de2e6]/10 transition-all"></div>
                          <div className="relative z-10 flex items-center justify-center h-full">
                            <span className="text-white text-xl font-bold">ASL REVOLUTION</span>
                          </div>
                        </motion.button>

                        {/* Training Mode */}
                        <motion.button
                          whileHover={{ scale: 1.05, x: 5 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleModeSelect(song.id, "training");
                          }}
                          className=" hover:scale-105 cursor-pointer relative h-24 rounded-xl bg-gradient-to-r from-[#920075] to-[#540d6e] border-2 border-[#2de2e6] overflow-hidden group"
                          style={{
                            boxShadow: "0 0 20px rgba(45,226,230,0.3)"
                          }}
                        >
                          <div className="absolute inset-0 bg-[#2de2e6]/0 group-hover:bg-[#2de2e6]/10 transition-all"></div>
                          <div className="relative z-10 flex items-center justify-center h-full">
                            <span className="text-white text-xl font-bold">TRAINING</span>
                          </div>
                        </motion.button>
                      </div>

                      <div className="text-center text-[#2de2e6] text-sm mt-4">
                        Click card to flip back
                      </div>
                    </div>
                  </div>

                  {/* Reflection */}
                  {isCenter && !isFlipped && (
                    <div className="absolute top-full left-0 w-full h-[60px] bg-gradient-to-b from-[#2de2e6]/20 to-transparent opacity-50 scale-y-[-1] rounded-t-2xl blur-[2px]" />
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export function SongCarousel(props: SongCarouselProps) {
  return (
    <Suspense fallback={<div className="text-cyan-400 py-10 animate-pulse text-center">Loading song library...</div>}>
      <SongCarouselContent {...props} />
    </Suspense>
  );
}