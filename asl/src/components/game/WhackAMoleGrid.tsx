"use client";

import { SignSymbolPrimary } from "~/components/SignSymbolPrimary";
import { type AvailableLetter } from "~/lib/svgLoader";
import { useEffect, useState } from "react";

interface WhackAMoleGridProps {
    availableLetters: readonly AvailableLetter[];
    targetLetter: string | null;
    onInteract: (letter: string) => void;
    holdProgress?: number; // 0 to 1
    recentSuccess?: string | null;
    successCount?: number;
}

const SUCCESS_MESSAGES = ["GREAT!", "PERFECT!", "AMAZING!", "AWESOME!", "NICE!"];

export function WhackAMoleGrid({ availableLetters, targetLetter, onInteract, holdProgress = 0, recentSuccess, successCount = 0 }: WhackAMoleGridProps) {
    const [celebratingLetter, setCelebratingLetter] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string>("");

    useEffect(() => {
        if (recentSuccess) {
            setCelebratingLetter(recentSuccess);
            const isStreak = successCount > 0 && successCount % 5 === 0;
            setSuccessMessage(isStreak ? "🔥 ON FIRE! 🔥" : SUCCESS_MESSAGES[successCount % 5] ?? "GREAT!");

            const timer = setTimeout(() => {
                setCelebratingLetter(null);
                setSuccessMessage("");
            }, 600);
            return () => clearTimeout(timer);
        }
    }, [recentSuccess, successCount]);

    return (
        <div className="grid grid-cols-7 gap-5 p-6 max-w-7xl mx-auto">
            {availableLetters.map((letter) => {
                const isTarget = letter === targetLetter;
                const isCelebrating = letter === celebratingLetter;
                const isComplete = isTarget && holdProgress >= 1;

                return (
                    <div
                        key={letter}
                        data-testid={`tile-${letter}`}
                        data-target={isTarget ? "true" : undefined}
                        onClick={() => onInteract(letter)}
                        className={`
                            relative aspect-square flex flex-col items-center justify-center rounded-3xl transition-all duration-300 cursor-pointer overflow-hidden backdrop-blur-xl border border-white/10 group
                            ${isTarget && !isCelebrating ? "glass-panel-magenta border-2 border-fuchsia-400 shadow-[0_0_40px_rgba(217,70,239,0.5)] scale-110 z-20" : ""}
                            ${!isTarget && !isCelebrating ? "glass-panel opacity-70 grayscale hover:grayscale-0 hover:opacity-100 hover:scale-[1.03] hover:shadow-[0_0_30px_rgba(45,226,230,0.3)] hover:border-cyan-400/60" : ""}
                            ${isCelebrating ? "scale-125 z-40 glass-panel border-2 border-green-400 shadow-[0_0_50px_rgba(74,222,128,0.6)]" : ""}
                        `}
                        style={isCelebrating ? {
                            boxShadow: "0 0 60px 20px rgba(74, 222, 128, 0.6), 0 0 100px 40px rgba(34, 211, 238, 0.4)",
                        } : undefined}
                    >
                        {/* Sci-Fi Corner Accents on Target */}
                        {isTarget && !isCelebrating && (
                            <>
                                <div className="absolute top-2 left-2 w-3 h-3 border-t-2 border-l-2 border-fuchsia-300 rounded-tl" />
                                <div className="absolute top-2 right-2 w-3 h-3 border-t-2 border-r-2 border-fuchsia-300 rounded-tr" />
                                <div className="absolute bottom-2 left-2 w-3 h-3 border-b-2 border-l-2 border-fuchsia-300 rounded-bl" />
                                <div className="absolute bottom-2 right-2 w-3 h-3 border-b-2 border-r-2 border-fuchsia-300 rounded-br" />
                            </>
                        )}

                        {/* Hold Progress Bar Overlay */}
                        {isTarget && holdProgress > 0 && !isCelebrating && (
                            <div
                                className="absolute inset-x-0 bottom-0 z-0 transition-all duration-75 ease-linear rounded-3xl"
                                style={{
                                    height: `${holdProgress * 100}%`,
                                    background: isComplete
                                        ? "linear-gradient(to top, rgba(74, 222, 128, 0.7), rgba(34, 211, 238, 0.5))"
                                        : "rgba(217, 70, 239, 0.35)",
                                    boxShadow: isComplete ? "0 0 25px rgba(74, 222, 128, 0.6)" : "0 0 15px rgba(217, 70, 239, 0.4)",
                                }}
                            />
                        )}

                        {/* Confetti particles on celebration */}
                        {isCelebrating && (
                            <div className="absolute inset-0 z-40 pointer-events-none overflow-visible">
                                {['🎉', '⭐', '✨', '🌟', '💫', '🎊', '✓', '★'].map((emoji, i) => (
                                    <span
                                        key={i}
                                        className="absolute text-2xl"
                                        style={{
                                            left: '50%',
                                            top: '50%',
                                            animation: `confetti-burst 1s ease-out ${i * 0.05}s forwards`,
                                            opacity: 0,
                                            ['--confetti-angle' as string]: `${i * 45}deg`,
                                            ['--confetti-distance' as string]: `${80 + (i % 3) * 20}px`,
                                        }}
                                    >
                                        {emoji}
                                    </span>
                                ))}
                            </div>
                        )}

                        {/* Letter Identifier Header */}
                        <span className={`absolute top-3 left-4 font-mono text-sm font-black tracking-widest ${isTarget ? "text-fuchsia-300" : "text-gray-400"} z-10`}>
                            {letter}
                        </span>

                        {/* ASL Sign Symbol */}
                        <div className="flex items-center justify-center w-full h-full p-4 z-10">
                            <SignSymbolPrimary
                                letter={letter}
                                state={isCelebrating ? "success" : isTarget ? "success" : "idle"}
                                className={`w-28 h-32 transition-transform duration-200 group-hover:scale-110 ${isCelebrating ? "scale-125" : ""}`}
                            />
                        </div>
                    </div>
                )
            })}
        </div>
    );
}
