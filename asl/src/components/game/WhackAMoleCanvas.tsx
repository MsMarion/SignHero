"use client";

import { useEffect, useRef, useState } from "react";
import { useWhackAMoleGame } from "~/hooks/useWhackAMoleGame";
import { usePlayerManager } from "~/hooks/usePlayerManager";
import { useAIInteraction } from "~/hooks/useAIInteraction";
import { useWebcam } from "~/hooks/useWebcam";
import { useSignDetection } from "~/hooks/useSignDetection";
import { useSession } from "next-auth/react";
import { WhackAMoleGrid } from "./WhackAMoleGrid";
import { WebcamFeed } from "./WebcamFeed";
import { api } from "~/trpc/react";
import { useSoundEffects } from "~/hooks/useSoundEffects";
import { FloatingSuccessText } from "./FloatingSuccessText";

interface WhackAMoleCanvasProps {
    onStateChange?: (state: string) => void;
}

export function WhackAMoleCanvas({ onStateChange }: WhackAMoleCanvasProps = {}) {
    const {
        gameState,
        targetLetter,
        score,
        countdown,
        metrics,
        timeLeft,
        availableLetters,
        startGame,
        resetGame,
        handleCorrectHit,
        handleMiss,
    } = useWhackAMoleGame();

    const {
        playerId,
        playerName,
        setPlayerName,
        showNameModal,
        setShowNameModal,
        createPlayerWithName,
        recordMistake,
        submitFinalStats,
        resetFinishFlag,
        isCreating,
    } = usePlayerManager();

    const upsertLeaderboardEntry = api.leaderboard.upsert.useMutation();
    
    // Track if we've already submitted for this game session
    const hasSubmittedLeaderboardRef = useRef(false);

    // Visual & Audio Effects
    const { playSuccessSound, playMissSound, playBackgroundMusic, stopBackgroundMusic, initAudio } = useSoundEffects();
    // Removed global flash/burst state per user request to keep focus on key
    const [successTextTrigger, setSuccessTextTrigger] = useState<{ text: string; timestamp: number } | null>(null);
    const [lastSuccess, setLastSuccess] = useState<string | null>(null);

    // Music control
    useEffect(() => {
        if (gameState === "playing" || gameState === "cooldown" || gameState === "starting") {
            playBackgroundMusic();
        } else {
            stopBackgroundMusic();
        }
        return () => stopBackgroundMusic();
    }, [gameState, playBackgroundMusic, stopBackgroundMusic]);

    const { videoRef, canvasRef, isReady, error, captureFrame } = useWebcam();
    // Keep detection (WebSocket + MediaPipe) alive for the whole game. It used to run only while
    // "playing", so every round's cooldown tore it down and rebuilt it, which caused the stutter.
    // Scoring still only counts in "playing" (see isPlaying below).
    const { predictions, isConnected, handDetected, latency } = useSignDetection(
        videoRef,
        isReady,
        gameState === "starting" || gameState === "playing" || gameState === "cooldown"
    );

    const { holdProgress, latestPrediction } = useAIInteraction({
        predictions,
        targetLetter,
        isPlaying: gameState === "playing" && !!playerId,
        isConnected,
        onCorrect: (letter) => {
            playSuccessSound();
            setLastSuccess(letter);
            // Removed global effects
            setSuccessTextTrigger({ text: "NICE!", timestamp: Date.now() });
            handleCorrectHit(letter);
        },
        onMistake: (showed, expected) => {
            // Negative feedback disabled per user request
            // We only care about positive hits
        },
    });

    const { data: session } = useSession();

    useEffect(() => {
        if (onStateChange) onStateChange(gameState);
    }, [gameState, onStateChange]);

    // Submit stats when finished (only once per game)
    useEffect(() => {
        if (gameState === "finished" && playerId && !hasSubmittedLeaderboardRef.current) {
            hasSubmittedLeaderboardRef.current = true;
            
            console.log("🎮 Game finished! Submitting stats...");
            
            // Submit to player stats
            submitFinalStats(score, metrics);
            
            // Upsert leaderboard entry (create or update existing)
            const heroName = session?.user?.name || playerName || "GUEST HERO";
            upsertLeaderboardEntry.mutate({
                name: heroName,
                score: score,
                playerId: playerId, // Pass playerId to ensure unique entries
            }, {
                onSuccess: () => {
                    console.log("✅ Leaderboard entry saved");
                },
                onError: (error) => {
                    console.error("❌ Failed to save leaderboard entry:", error);
                }
            });
        }

        // Reset submission flag when returning to idle
        if (gameState === "idle") {
            resetFinishFlag();
            hasSubmittedLeaderboardRef.current = false;
        }
    }, [gameState, playerId, score, metrics, submitFinalStats, resetFinishFlag, playerName, upsertLeaderboardEntry, session]);

    const handleGridClick = (clickedLetter: string) => {
        if (gameState !== "playing" || !targetLetter || !playerId) return;

        // Initialize audio on interaction
        initAudio();
        
        if (clickedLetter === targetLetter) {
            playSuccessSound();
            setLastSuccess(clickedLetter);
            setSuccessTextTrigger({ text: "NICE!", timestamp: Date.now() });
            handleCorrectHit(clickedLetter);
        }
    };

    const handleStartChallenge = async () => {
        const heroName = session?.user?.name || "GUEST HERO";
        const id = await createPlayerWithName(heroName);
        if (id) {
            startGame();
        } else {
            alert("Failed to initialize game session. Please try again.");
        }
    };

    return (
        <div className="absolute inset-0 w-full h-full overflow-hidden text-white font-sans bg-transparent">
            {/* Visual Effects */}
            <FloatingSuccessText trigger={successTextTrigger} />

            {gameState !== "idle" && (
                <>
                    {/* TOP CENTER: Whack Arcade Stats Marquee */}
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-8 glass-panel px-8 py-3.5 rounded-3xl border border-green-500/40 shadow-[0_0_40px_rgba(34,197,94,0.3)] backdrop-blur-xl pointer-events-auto">
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-white/50 tracking-widest uppercase">TIMER</span>
                            <span className={`text-4xl font-black font-mono tabular-nums tracking-wider ${timeLeft <= 10 ? "text-red-500 animate-pulse drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]" : "text-white"}`}>
                                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                            </span>
                        </div>
                        <div className="h-8 w-px bg-white/20" />
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-white/50 tracking-widest uppercase">SCORE</span>
                            <span className="text-4xl font-black bg-gradient-to-r from-green-400 via-cyan-400 to-fuchsia-400 bg-clip-text text-transparent">
                                {score.toLocaleString()}
                            </span>
                        </div>
                        <div className="h-8 w-px bg-white/20" />
                        <div className="flex flex-col gap-1 font-mono text-xs">
                            <span className="text-cyan-300 font-bold">AVG: {metrics.reactionTimes.length > 0 ? (metrics.reactionTimes.reduce((a, b) => a + b, 0) / metrics.reactionTimes.length).toFixed(0) : 0}ms</span>
                            <span className="text-green-400 font-bold">✓ {metrics.totalCorrect} <span className="text-white/30 mx-1">|</span> <span className="text-red-400">✗ {metrics.totalMisses}</span></span>
                        </div>
                    </div>

                    {/* TOP LEFT: Cyber Webcam Feed (positioned below SignHero logo) */}
                    <div className="absolute top-28 left-8 z-40 pointer-events-auto">
                        <WebcamFeed
                            videoRef={videoRef}
                            canvasRef={canvasRef}
                            isReady={isReady}
                            error={error}
                            isConnected={isConnected}
                            handDetected={handDetected}
                        />
                    </div>

                    {/* BOTTOM LEFT: Standardized AI Prediction Pill (Always visible) */}
                    <div className="absolute bottom-8 left-8 z-30 pointer-events-none min-w-[320px]">
                        <div className="glass-panel text-white px-6 py-4 rounded-2xl border border-cyan-400/40 shadow-[0_0_30px_rgba(45,226,230,0.3)] flex items-center gap-6 backdrop-blur-md">
                            <div className="flex flex-col items-center justify-center min-w-[90px]">
                                <span className="text-[10px] text-cyan-400 font-mono tracking-widest uppercase mb-1">DETECTED</span>
                                <span className="text-5xl font-black text-white drop-shadow-[0_0_20px_rgba(45,226,230,0.8)]">
                                    {latestPrediction && isConnected ? latestPrediction.letter : "—"}
                                </span>
                            </div>
                            <div className="h-12 w-px bg-white/20" />
                            <div className="flex flex-col gap-2 font-mono text-xs w-full">
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-white/60 font-mono">CONFIDENCE:</span>
                                    <span className={`font-bold font-mono ${latestPrediction && isConnected ? (latestPrediction.confidence > 0.8 ? "text-green-400 drop-shadow-[0_0_10px_rgba(74,222,128,0.8)]" : latestPrediction.confidence > 0.5 ? "text-yellow-400" : "text-red-400") : "text-gray-500"}`}>
                                        {latestPrediction && isConnected ? `${(latestPrediction.confidence * 100).toFixed(0)}%` : "0%"}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between gap-4">
                                    <span className="text-white/60 font-mono">LATENCY:</span>
                                    <span className="text-cyan-300 font-mono">{isConnected ? `${latency.toFixed(0)}ms` : "OFFLINE"}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CENTER ACTION AREA: Header & Grid (Deterministically positioned across horizon) */}
                    <div className="absolute top-52 left-1/2 -translate-x-1/2 z-10 w-full max-w-7xl flex flex-col items-center pointer-events-auto">
                        <h1 className="h-16 flex items-center justify-center text-4xl font-black mb-4 text-white drop-shadow-lg tracking-wider">
                            {gameState === "playing" ? (
                                <span>FIND <span className="text-fuchsia-400 text-6xl mx-3 drop-shadow-[0_0_25px_rgba(217,70,239,0.8)]">{targetLetter}</span> !</span>
                            ) : gameState === "cooldown" ? (
                                <span className="text-cyan-400 tracking-widest animate-pulse">NEXT ROUND...</span>
                            ) : gameState === "starting" ? (
                                <span className="text-cyan-400 tracking-widest animate-pulse">GET READY...</span>
                            ) : gameState === "finished" ? (
                                "TIME'S UP!"
                            ) : (
                                "TRAINING MODE"
                            )}
                        </h1>

                        <div className={`w-full overflow-visible flex items-center justify-center ${gameState === "finished" ? "opacity-20 pointer-events-none blur-sm" : ""}`}>
                            <WhackAMoleGrid
                                availableLetters={availableLetters}
                                targetLetter={targetLetter}
                                onInteract={handleGridClick}
                                holdProgress={holdProgress}
                                recentSuccess={lastSuccess}
                                successCount={metrics.totalCorrect}
                            />
                        </div>
                    </div>

                    {gameState === "starting" && countdown > 0 && (
                         <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
                             <div className="text-[12rem] font-bold text-white drop-shadow-[0_0_50px_rgba(34,211,238,0.8)] animate-pulse">
                                 {countdown}
                             </div>
                         </div>
                    )}
                </>
            )}

            {/* Cinematic Lobby / Start Screen */}
            {gameState === "idle" && (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-transparent pointer-events-auto">
                    <div className="absolute -top-32 -left-32 w-64 h-64 bg-fuchsia-600/20 blur-[100px] rounded-full animate-pulse pointer-events-none" />
                    <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-cyan-600/20 blur-[100px] rounded-full animate-pulse pointer-events-none" style={{ animationDelay: "1s" }} />

                    <h1 className="text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-purple-500 mb-4 tracking-tighter pointer-events-none"
                        style={{ textShadow: "0 0 40px rgba(168, 85, 247, 0.4)" }}>
                        WHACK-A-SIGN
                    </h1>
                    <p className="text-purple-200/80 font-mono mb-12 max-w-md text-center text-sm tracking-widest uppercase pointer-events-none">
                        Reflex Lab • AI Sign Speed Test
                    </p>

                    <button
                        onClick={handleStartChallenge}
                        className="relative glass-button px-16 py-6 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(45,226,230,0.4)] transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer border-2 border-cyan-400/60 group pointer-events-auto"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/30 via-fuchsia-500/30 to-purple-500/30 group-hover:opacity-100 opacity-60 transition-opacity pointer-events-none" />
                        <span className="relative z-10 text-white font-black tracking-[8px] text-2xl uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] pointer-events-none">
                            START CHALLENGE
                        </span>
                    </button>
                    
                    <p className="text-xs text-white/40 font-mono mt-6 tracking-widest pointer-events-none">
                        SHOW THE SIGN TO THE CAMERA OR CLICK TILES TO SCORE
                    </p>
                </div>
            )}
        </div>
    );
}