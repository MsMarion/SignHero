"use client";

import { useEffect, useState, Suspense, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSoundEffects } from "~/hooks/useSoundEffects";
import { api } from "~/trpc/react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";

interface SongFinishedOverlayProps {
    show: boolean;
    score?: number;
    songId?: string;
    songTitle?: string;
    onRestart?: () => void;
    onRedirect?: () => void;
}

function OverlayContent({ show, score = 0, songId, songTitle, onRestart, onRedirect }: SongFinishedOverlayProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { playGameFinishedSound } = useSoundEffects();
    const { data: session } = useSession();
    
    const username = session?.user?.name ? session.user.name.toUpperCase() : null;

    const [initials, setInitials] = useState("");
    const [submissionState, setSubmissionState] = useState<"idle" | "submitting" | "success" | "error">("idle");
    const [errorMessage, setErrorMessage] = useState("");
    const autoSubmitRef = useRef(false);

    // Query high scores specifically for this track
    const { data: leaderboard, refetch, isLoading } = api.leaderboard.getBySongId.useQuery(
        { songId: songId ?? "demo", limit: 5 },
        { enabled: show && !!songId }
    );

    const submitScoreMutation = api.leaderboard.create.useMutation({
        onSuccess: () => {
            setSubmissionState("success");
            refetch();
        },
        onError: (err) => {
            setSubmissionState("error");
            setErrorMessage(err.message || "Failed to submit score");
        }
    });

    const submitRef = useRef(submitScoreMutation.mutate);
    useEffect(() => {
        submitRef.current = submitScoreMutation.mutate;
    }, [submitScoreMutation.mutate]);

    useEffect(() => {
        if (show) {
            playGameFinishedSound();
            setErrorMessage("");
            if (username && songId && !autoSubmitRef.current) {
                autoSubmitRef.current = true;
                setInitials(username);
                setSubmissionState("submitting");
                submitRef.current({
                    name: username,
                    score: score,
                    songId: songId,
                });
            } else if (!username) {
                setSubmissionState("idle");
                setInitials("");
            }
        } else {
            autoSubmitRef.current = false;
        }
    }, [show, username, score, songId, playGameFinishedSound]);

    const handleSubmit = () => {
        if (!songId || !initials || initials.trim().length === 0) return;
        setSubmissionState("submitting");
        submitRef.current({
            name: initials.trim().toUpperCase(),
            score: score,
            songId: songId,
        });
    };

    const handleExit = () => {
        if (onRedirect) {
            onRedirect();
            return;
        }
        const fromUrl = searchParams?.get("from");
        const urlSongId = searchParams?.get("songId");
        if (fromUrl) {
            const targetUrl = urlSongId ? `${fromUrl}?songId=${encodeURIComponent(urlSongId)}` : fromUrl;
            router.push(targetUrl);
        } else {
            router.push("/songselection");
        }
    };

    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-indigo-950/60 via-purple-900/50 to-amber-950/60 backdrop-blur-xl transition-opacity duration-700 p-4 overflow-hidden">
            {/* Joyful Ambient Sunburst Backdrop */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-yellow-500/25 via-fuchsia-500/15 to-transparent pointer-events-none animate-pulse duration-1000" />
            
            {/* Sparkle Confetti Elements Floating in Backdrop */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-10 left-[15%] text-yellow-300/60 text-4xl animate-bounce duration-1000">✨</div>
                <div className="absolute top-20 right-[20%] text-fuchsia-300/60 text-5xl animate-pulse">🌟</div>
                <div className="absolute bottom-20 left-[25%] text-cyan-300/60 text-3xl animate-pulse">⭐</div>
                <div className="absolute bottom-15 right-[15%] text-amber-300/60 text-4xl animate-bounce">✨</div>
                <div className="absolute top-1/3 left-[5%] text-purple-300/50 text-6xl animate-pulse">🎉</div>
                <div className="absolute top-2/3 right-[8%] text-pink-300/50 text-5xl animate-bounce">🎈</div>
            </div>

            <motion.div 
                initial={{ opacity: 0, scale: 0.8, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={{ duration: 0.5, type: "spring", bounce: 0.3 }}
                className="glass-panel max-w-2xl w-full p-8 rounded-3xl border-2 border-yellow-400/60 shadow-[0_0_100px_rgba(251,191,36,0.35)] bg-black/60 flex flex-col items-center relative overflow-hidden z-10"
            >
                {/* Neon Header Glow */}
                <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-96 h-48 bg-yellow-500/30 rounded-full blur-3xl pointer-events-none" />

                {/* Title */}
                <h1 className="text-6xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-300 via-orange-500 to-red-500 drop-shadow-[0_0_35px_rgba(234,179,8,0.6)] text-center tracking-wider mb-2">
                    STAGE CLEARED!
                </h1>

                {/* Track Subtitle */}
                {songTitle && (
                    <div className="text-xl md:text-2xl font-bold text-cyan-300 tracking-widest uppercase mb-8 flex items-center gap-2 font-mono">
                        <span>🎵</span> {songTitle}
                    </div>
                )}

                {/* Score Counter Card */}
                <div className="glass-panel w-full py-6 px-8 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 flex flex-col items-center mb-8 shadow-inner">
                    <span className="text-sm font-mono text-yellow-200/80 uppercase tracking-widest mb-1">FINAL ACCUMULATED SCORE</span>
                    <span className="text-5xl md:text-6xl font-black text-yellow-300 tracking-tighter drop-shadow-[0_0_20px_rgba(234,179,8,0.5)] font-mono">
                        {score.toLocaleString()}
                    </span>
                </div>

                {/* Registration & Standings Section */}
                <div className={`grid ${username ? 'grid-cols-1 max-w-xl mx-auto' : 'grid-cols-1 md:grid-cols-2'} gap-6 w-full mb-8 font-mono`}>
                    {/* Column 1: Submission Box (Guests Only) */}
                    {!username && (
                        <div className="glass-panel p-6 rounded-2xl border border-cyan-500/30 flex flex-col justify-center items-center text-center font-mono">
                            <h3 className="text-lg font-bold text-cyan-300 tracking-wider mb-4 uppercase flex items-center gap-2">
                                <span>👑</span> Register Guest Score
                            </h3>
                            
                            {submissionState === "idle" || submissionState === "error" ? (
                                <div className="flex flex-col gap-3 w-full font-mono">
                                    <input 
                                        type="text"
                                        maxLength={10}
                                        value={initials}
                                        onChange={e => setInitials(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ''))}
                                        placeholder="ENTER INITIALS"
                                        className="w-full bg-black/60 border-2 border-cyan-500/50 rounded-xl px-4 py-3 text-center text-2xl font-black text-white tracking-widest placeholder:text-cyan-600/50 focus:outline-none focus:border-yellow-400 focus:shadow-[0_0_20px_rgba(234,179,8,0.4)] transition-all uppercase font-mono"
                                    />
                                    <button 
                                        onClick={handleSubmit}
                                        disabled={!initials || initials.trim().length === 0}
                                        className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-yellow-500 to-orange-600 font-black text-black hover:text-white uppercase tracking-wider shadow-[0_0_25px_rgba(234,179,8,0.4)] hover:shadow-[0_0_35px_rgba(234,179,8,0.7)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:pointer-events-none cursor-pointer font-mono font-bold"
                                    >
                                        SUBMIT TO LEADERBOARD
                                    </button>
                                    {submissionState === "error" && (
                                        <span className="text-xs text-red-400 font-mono mt-1">{errorMessage}</span>
                                    )}
                                </div>
                            ) : submissionState === "submitting" ? (
                                <div className="flex items-center justify-center gap-3 py-6 font-mono text-yellow-300 animate-pulse font-mono">
                                    <span className="text-2xl animate-spin font-mono">⏳</span> Submitting...
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-6 text-center font-mono">
                                    <span className="text-3xl mb-2 font-mono">🎉</span>
                                    <span className="text-green-400 font-bold tracking-wider text-xs uppercase font-mono">SCORE SUCCESSFULLY RECORDED!</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Column 2 / Full Width: Track Top 5 */}
                    <div className="glass-panel p-6 rounded-2xl border border-fuchsia-500/30 flex flex-col items-center">
                        <h3 className="text-lg font-bold text-fuchsia-300 tracking-wider mb-3 uppercase flex items-center gap-2 font-mono">
                            <span>🏆</span> Track Top 5 Standings
                        </h3>

                        <div className="w-full flex-1 flex flex-col justify-center font-mono">
                            {isLoading ? (
                                <div className="text-center py-6 text-sm text-fuchsia-300/80 font-mono animate-pulse font-mono">
                                    Loading standings...
                                </div>
                            ) : !leaderboard || leaderboard.length === 0 ? (
                                <div className="text-center py-6 text-sm text-gray-400 font-mono font-mono">
                                    No records yet. Be the first! 🖐️
                                </div>
                            ) : (
                                <div className="flex flex-col gap-2 w-full font-mono text-sm font-mono">
                                    {leaderboard.map((entry, idx) => (
                                        <div 
                                            key={entry.id}
                                            className={`flex items-center justify-between py-1.5 px-3 rounded-lg bg-black/40 border transition-all font-mono ${
                                                entry.name === (initials || username) ? 'border-yellow-400 bg-yellow-500/20 text-yellow-300 font-bold scale-[1.02]' : 'border-white/5 text-gray-300'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 font-mono">
                                                <span className="w-6 text-center font-mono">
                                                    {idx === 0 ? "👑" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                                                </span>
                                                <span className="font-bold text-white tracking-wider font-mono">{entry.name}</span>
                                            </div>
                                            <span className="font-bold text-cyan-300 tracking-wider font-mono">{entry.score.toLocaleString()}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Navigation Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-4 w-full">
                    {onRestart && (
                        <button
                            onClick={onRestart}
                            className="flex-1 py-4 px-6 rounded-2xl glass-button border border-cyan-500/50 font-bold text-cyan-300 hover:text-white uppercase tracking-wider flex items-center justify-center gap-2 hover:shadow-[0_0_30px_rgba(6,182,212,0.4)] transition-all cursor-pointer font-mono"
                        >
                            PLAY AGAIN
                        </button>
                    )}
                    <button
                        onClick={handleExit}
                        className="flex-1 py-4 px-6 rounded-2xl glass-button border border-fuchsia-500/50 font-bold text-fuchsia-300 hover:text-white uppercase tracking-wider flex items-center justify-center gap-2 hover:shadow-[0_0_30px_rgba(217,70,239,0.4)] transition-all cursor-pointer font-mono"
                    >
                        SONG SELECTION
                    </button>
                </div>
            </motion.div>
        </div>
    );
}

export function SongFinishedOverlay(props: SongFinishedOverlayProps) {
    return (
        <Suspense fallback={null}>
            <OverlayContent {...props} />
        </Suspense>
    );
}
