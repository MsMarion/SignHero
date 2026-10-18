"use client";

import { useEffect, useRef, useState } from "react";
import { useWhackAMoleGame } from "~/hooks/useWhackAMoleGame";
import { usePlayerManager } from "~/hooks/usePlayerManager";
import { useAIInteraction } from "~/hooks/useAIInteraction";
import { useWebcam } from "~/hooks/useWebcam";
import { useSignDetection } from "~/hooks/useSignDetection";
import { useSession } from "next-auth/react";
import { useIsPhone } from "~/hooks/useIsPhone";
import { SignSymbolPrimary } from "~/components/SignSymbolPrimary";
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
        submitFinalStats,
        resetFinishFlag,
        isCreating,
    } = usePlayerManager();

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

    const isPhone = useIsPhone();
    const { videoRef, canvasRef, isReady, error, captureFrame } = useWebcam();
    // Keep detection (WebSocket + MediaPipe) alive for the whole game. It used to run only while
    // "playing", so every round's cooldown tore it down and rebuilt it, which caused the stutter.
    // Scoring still only counts in "playing" (see isPlaying below).
    // `prepare`: load hand tracking while the player is still in the lobby, so a game never starts with it warming up.
    const { predictions, isConnected, handDetected, latency, trackingReady, trackingFailed } = useSignDetection(
        videoRef,
        isReady,
        gameState === "starting" || gameState === "playing" || gameState === "cooldown",
        true
    );

    // START waits for the camera and hand tracking, unless something failed or it is taking far too long.
    const [waitedTooLong, setWaitedTooLong] = useState(false);
    useEffect(() => {
        const timer = setTimeout(() => setWaitedTooLong(true), 20_000);
        return () => clearTimeout(timer);
    }, []);
    const cameraFailed = Boolean(error) || trackingFailed;
    const waitingForCamera = !(isReady && trackingReady) && !cameraFailed && !waitedTooLong;

    // Tapping the sign on a phone makes the game a practice game (not ranked).
    const usedTapRef = useRef(false);
    const [practiceUsed, setPracticeUsed] = useState(false);

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
            submitFinalStats(score, metrics, { practice: usedTapRef.current });
            
        }

        // Reset submission flag when returning to idle
        if (gameState === "idle") {
            resetFinishFlag();
            hasSubmittedLeaderboardRef.current = false;
            usedTapRef.current = false;
            setPracticeUsed(false);
        }
    }, [gameState, playerId, score, metrics, submitFinalStats, resetFinishFlag]);

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

    const handleSignTap = () => {
        if (gameState !== "playing" || !targetLetter) return;
        usedTapRef.current = true;
        setPracticeUsed(true);
        handleGridClick(targetLetter);
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

            {/* PHONE: camera on top, the sign to show in the middle, no letter grid. Tapping the sign is a practice-only fallback. */}
            {gameState !== "idle" && isPhone && (
                <div className="absolute inset-0 z-10 flex flex-col gap-3 px-4 pt-[68px] pb-4 pointer-events-auto">
                    <div className="flex gap-2">
                        <div className="flex-1 glass-panel rounded-xl border border-green-500/40 px-3 py-2">
                            <div className="text-[10px] font-mono text-white/50 tracking-widest uppercase">TIMER</div>
                            <div data-testid="whack-timer" className={`text-3xl font-black font-mono tabular-nums ${timeLeft <= 10 ? "text-red-500 animate-pulse" : "text-white"}`}>
                                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                            </div>
                        </div>
                        <div className="flex-1 glass-panel rounded-xl border border-green-500/40 px-3 py-2">
                            <div className="text-[10px] font-mono text-white/50 tracking-widest uppercase">SCORE</div>
                            <div data-testid="whack-score" className="text-3xl font-black bg-gradient-to-r from-green-400 via-cyan-400 to-fuchsia-400 bg-clip-text text-transparent">{score.toLocaleString()}</div>
                        </div>
                        <div className="glass-panel rounded-xl border border-green-500/40 px-3 py-2">
                            <div className="text-[10px] font-mono text-white/50 tracking-widest uppercase">HITS</div>
                            <div data-testid="whack-hits" className="text-3xl font-black text-green-400">✓ {metrics.totalCorrect}</div>
                        </div>
                    </div>

                    <h1 data-testid="whack-heading" data-state={gameState} data-target={targetLetter ?? undefined} className="h-12 flex items-center justify-center text-3xl font-black text-white tracking-wider">
                        {gameState === "playing" ? (
                            <span>SHOW <span className="text-fuchsia-400 text-5xl mx-2">{targetLetter}</span></span>
                        ) : gameState === "cooldown" ? (
                            <span className="text-cyan-400 tracking-widest animate-pulse">NEXT ROUND...</span>
                        ) : gameState === "starting" ? (
                            <span className="text-cyan-400 tracking-widest animate-pulse">GET READY...</span>
                        ) : (
                            "TIME'S UP!"
                        )}
                    </h1>

                    <button
                        type="button"
                        data-testid="phone-target-sign"
                        onClick={handleSignTap}
                        aria-label={`The sign for ${targetLetter ?? "the next letter"}. Tap it only if your camera is not working (practice game).`}
                        className="relative flex-1 min-h-[120px] glass-panel rounded-3xl border border-fuchsia-500/40 flex items-center justify-center p-3 overflow-hidden"
                    >
                        {targetLetter && gameState === "playing" ? <SignSymbolPrimary letter={targetLetter} className="h-full w-auto max-h-full" /> : null}
                        {holdProgress > 0 && gameState === "playing" ? (
                            <div className="absolute inset-x-0 bottom-0 h-2 bg-white/10">
                                <div className="h-full bg-cyan-400" style={{ width: `${holdProgress * 100}%` }} />
                            </div>
                        ) : null}
                    </button>

                    <WebcamFeed
                        videoRef={videoRef}
                        canvasRef={canvasRef}
                        isReady={isReady}
                        error={error}
                        isConnected={isConnected}
                        handDetected={handDetected}
                        fluid
                    />

                    <div className="glass-panel rounded-xl border border-cyan-400/40 px-3 py-2 flex items-center justify-between gap-3 font-mono text-xs">
                        <span className="text-white/60">SEEING</span>
                        <span className="text-2xl font-black text-white">{latestPrediction && isConnected ? latestPrediction.letter : "—"}</span>
                        <span className="text-white/60">{latestPrediction && isConnected ? `${(latestPrediction.confidence * 100).toFixed(0)}%` : "0%"}</span>
                        <span data-testid="whack-latency" className="text-cyan-300">{isConnected ? `${latency.toFixed(0)}ms` : "OFFLINE"}</span>
                    </div>
                    {practiceUsed && (
                        <div data-testid="phone-practice-chip" className="text-center text-[11px] font-mono tracking-widest text-yellow-300">PRACTICE GAME: TAPPING IS NOT RANKED</div>
                    )}

                    {gameState === "starting" && countdown > 0 && (
                        <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none">
                            <div className="text-[9rem] font-bold text-white drop-shadow-[0_0_50px_rgba(34,211,238,0.8)] animate-pulse">{countdown}</div>
                        </div>
                    )}
                </div>
            )}

            {gameState !== "idle" && !isPhone && (
                <>
                    {/* TOP CENTER: Whack Arcade Stats Marquee */}
                    <div className="absolute top-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-8 glass-panel px-8 py-3.5 rounded-3xl border border-green-500/40 shadow-[0_0_40px_rgba(34,197,94,0.3)] backdrop-blur-xl pointer-events-auto">
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-white/50 tracking-widest uppercase">TIMER</span>
                            <span data-testid="whack-timer" className={`text-4xl font-black font-mono tabular-nums tracking-wider ${timeLeft <= 10 ? "text-red-500 animate-pulse drop-shadow-[0_0_15px_rgba(239,68,68,0.8)]" : "text-white"}`}>
                                {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                            </span>
                        </div>
                        <div className="h-8 w-px bg-white/20" />
                        <div className="flex items-center gap-3">
                            <span className="text-xs font-mono text-white/50 tracking-widest uppercase">SCORE</span>
                            <span data-testid="whack-score" className="text-4xl font-black bg-gradient-to-r from-green-400 via-cyan-400 to-fuchsia-400 bg-clip-text text-transparent">
                                {score.toLocaleString()}
                            </span>
                        </div>
                        <div className="h-8 w-px bg-white/20" />
                        <div className="flex flex-col gap-1 font-mono text-xs">
                            <span className="text-cyan-300 font-bold">AVG: {metrics.reactionTimes.length > 0 ? (metrics.reactionTimes.reduce((a, b) => a + b, 0) / metrics.reactionTimes.length).toFixed(0) : 0}ms</span>
                            <span data-testid="whack-hits" className="text-green-400 font-bold">✓ {metrics.totalCorrect} <span className="text-white/30 mx-1">|</span> <span className="text-red-400">✗ {metrics.totalMisses}</span></span>
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
                                    <span data-testid="whack-latency" className="text-cyan-300 font-mono">{isConnected ? `${latency.toFixed(0)}ms` : "OFFLINE"}</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CENTER ACTION AREA: Header & Grid (Deterministically positioned across horizon) */}
                    <div className="absolute top-52 left-1/2 -translate-x-1/2 z-10 w-full max-w-7xl flex flex-col items-center pointer-events-auto">
                        <h1 data-testid="whack-heading" data-state={gameState} data-target={targetLetter ?? undefined} className="h-16 flex items-center justify-center text-4xl font-black mb-4 text-white drop-shadow-lg tracking-wider">
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

                    <h1 className="text-7xl max-sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-purple-500 mb-4 tracking-tighter pointer-events-none"
                        style={{ textShadow: "0 0 40px rgba(168, 85, 247, 0.4)" }}>
                        WHACK-A-SIGN
                    </h1>
                    <p className="text-purple-200/80 font-mono mb-12 max-sm:mb-6 max-w-md text-center text-sm max-sm:text-xs tracking-widest uppercase pointer-events-none">
                        Reflex Lab • AI Sign Speed Test
                    </p>

                    <button
                        data-testid="whack-start"
                        onClick={handleStartChallenge}
                        disabled={isCreating || waitingForCamera}
                        className="relative glass-button px-16 py-6 max-sm:px-8 max-sm:py-5 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(45,226,230,0.4)] transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-60 disabled:cursor-wait border-2 border-cyan-400/60 group pointer-events-auto"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/30 via-fuchsia-500/30 to-purple-500/30 group-hover:opacity-100 opacity-60 transition-opacity pointer-events-none" />
                        <span className="relative z-10 text-white font-black tracking-[8px] max-sm:tracking-[4px] text-2xl max-sm:text-xl uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.8)] pointer-events-none">
                            {isCreating ? "STARTING..." : waitingForCamera ? "STARTING CAMERA..." : "START CHALLENGE"}
                        </span>
                    </button>
                    
                    {cameraFailed && isPhone && (
                        <p data-testid="whack-camera-note" className="text-xs text-yellow-300 font-mono mt-4 max-w-xs text-center tracking-wider pointer-events-none">
                            CAMERA NOT AVAILABLE. YOU CAN STILL PLAY BY TAPPING: IT COUNTS AS PRACTICE AND IS NOT RANKED.
                        </p>
                    )}
                    <p className="text-xs text-white/40 font-mono mt-6 tracking-widest pointer-events-none">
                        {isPhone ? "PROP YOUR PHONE UP SO YOUR HAND FITS IN THE CAMERA" : "SHOW THE SIGN TO THE CAMERA OR CLICK TILES TO SCORE"}
                    </p>
                </div>
            )}
        </div>
    );
}