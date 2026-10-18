'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '~/trpc/react';

const SignSymbol = ({ letter, state = "idle" }) => {
  const colors = {
    idle: "#6b7280",
    correct: "#22c55e",
    wrong: "#ef4444"
  };
  
  return (
    <div 
      className="w-full h-full flex items-center justify-center text-4xl font-bold"
      style={{ color: colors[state] }}
    >
      {letter}
    </div>
  );
};

const RankBadge = ({ rank }) => {
  if (rank === 1) return <span className="text-yellow-400 font-bold">🥇</span>;
  if (rank === 2) return <span className="text-gray-300 font-bold">🥈</span>;
  if (rank === 3) return <span className="text-amber-600 font-bold">🥉</span>;
  return <span className="text-cyan-300 font-mono">{String(rank).padStart(2, '0')}</span>;
};

const getNameColor = (index) => {
  const colors = [
    'text-cyan-400', 'text-orange-400', 'text-yellow-400', 'text-pink-400',
    'text-purple-400', 'text-green-400', 'text-red-400', 'text-blue-400',
  ];
  return colors[index % colors.length];
};

const LeaderboardPage = () => {
  const searchParams = useSearchParams();
  const playerId = searchParams.get('playerId');

  const [smoothPos, setSmoothPos] = useState({ x: 0, y: 0 });
  const [currentTime, setCurrentTime] = useState('');
  const [view, setView] = useState('report'); // 'report' or 'leaderboard'
  const containerRef = useRef(null);
  const targetPos = useRef({ x: 0, y: 0 });
  const animationRef = useRef(undefined);

  const { data: playerData, isLoading: playerLoading } = api.player.getById.useQuery(
    { id: playerId! },
    { enabled: !!playerId }
  );
  const { data: leaderboardData, isError: leaderboardFailed, refetch: refetchLeaderboard } = api.leaderboard.getTop.useQuery({ limit: 10 });

  const stars = useMemo(() => {
    return [...Array(100)].map((_, i) => ({
      id: i,
      width: Math.random() * 3 + 1,
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 3,
      opacity: Math.random() * 0.8 + 0.2,
    }));
  }, []);

  const lerp = (start, end, factor) => start + (end - start) * factor;

  const animate = useCallback(() => {
    setSmoothPos(prev => ({
      x: lerp(prev.x, targetPos.current.x, 0.08),
      y: lerp(prev.y, targetPos.current.y, 0.08)
    }));
    animationRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    if (playerId) {
      setView('report');
    } else {
      setView('leaderboard');
    }
  }, [playerId]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const x = (e.clientX - rect.left - rect.width / 2) / rect.width;
        const y = (e.clientY - rect.top - rect.height / 2) / rect.height;
        targetPos.current = { x, y };
      }
    };

    const updateTime = () => {
      const now = new Date();
      const formatted = now.toLocaleString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).replace(',', '');
      setCurrentTime(formatted + ' EST');
    };

    window.addEventListener('mousemove', handleMouseMove);
    updateTime();
    const timeInterval = setInterval(updateTime, 1000);
    animationRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      clearInterval(timeInterval);
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [animate]);

  const totalAttempts = playerData ? (playerData.correctHits + playerData.mistakesMade) : 0;
  const accuracy = totalAttempts > 0 ? ((playerData.correctHits / totalAttempts) * 100).toFixed(1) : "0.0";

  return (
    <div ref={containerRef} className="h-full w-full relative overflow-hidden bg-transparent pointer-events-auto">
      {/* Main Content Container */}
      <div className="absolute inset-0 z-30 flex justify-center items-center p-4" style={{ transform: `translate(${smoothPos.x * -25}px, ${smoothPos.y * -25}px)` }}>
        <div className="relative max-w-4xl w-full">
          <div className="relative rounded-3xl p-2 bg-gradient-to-b from-purple-900 via-fuchsia-900 to-purple-950 shadow-2xl shadow-fuchsia-500/30">
            <div className="rounded-2xl p-1 bg-gradient-to-b from-cyan-500/30 via-fuchsia-500/20 to-purple-500/30">
              <div className="relative rounded-xl overflow-hidden bg-gradient-to-b from-[#1a0a2e] to-[#0d0221] glass-panel">
                
                {/* Scanlines */}
                <div className="absolute inset-0 z-50 pointer-events-none opacity-30" style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)' }} />

                {/* Screen glow */}
                <div className="absolute inset-0 bg-gradient-to-b from-fuchsia-500/10 via-transparent to-cyan-500/10 pointer-events-none" />

                {/* Content */}
                <div className="relative p-6 md:p-8 max-h-[80vh] overflow-y-auto">
                  {/* Home Button */}
                  <Link 
                    href={playerId ? "/whack" : "/"} 
                    className="absolute top-6 right-6 z-50 text-fuchsia-300 hover:text-cyan-400 transition-colors p-2 rounded-full hover:bg-white/5 border border-transparent hover:border-cyan-400/30 font-bold"
                    aria-label={playerId ? "Back to Whack-a-Sign" : "Back to Home"}
                  >
                    <span className="text-xl">🏠</span>
                  </Link>

                  {/* Header with Toggle Buttons */}
                  <div className="mb-6">
                    <h1 className="text-center text-2xl md:text-4xl font-bold text-fuchsia-400 mb-4 tracking-wider" style={{ textShadow: '0 0 10px #d946ef, 0 0 20px #d946ef, 0 0 40px #d946ef' }}>
                      {view === 'report' ? 'GAME REPORT' : 'LEADERBOARD'}
                    </h1>
                    
                    {/* Toggle Buttons */}
                    {playerId && (
                      <div className="flex gap-3 justify-center">
                        <button
                          onClick={() => setView('report')}
                          className={`px-6 py-2 rounded-lg font-mono font-bold tracking-wider transition-all ${
                            view === 'report'
                              ? 'bg-gradient-to-r from-cyan-400 to-fuchsia-500 text-[#0d0221] shadow-[0_0_20px_rgba(45,226,230,0.5)]'
                              : 'bg-[#1a0a2e]/60 border-2 border-fuchsia-500/30 text-fuchsia-300 hover:border-cyan-400/50 hover:text-cyan-400'
                          }`}
                        >
                          REPORT
                        </button>
                        <button
                          onClick={() => setView('leaderboard')}
                          className={`px-6 py-2 rounded-lg font-mono font-bold tracking-wider transition-all ${
                            view === 'leaderboard'
                              ? 'bg-gradient-to-r from-cyan-400 to-fuchsia-500 text-[#0d0221] shadow-[0_0_20px_rgba(45,226,230,0.5)]'
                              : 'bg-[#1a0a2e]/60 border-2 border-fuchsia-500/30 text-fuchsia-300 hover:border-cyan-400/50 hover:text-cyan-400'
                          }`}
                        >
                          LEADERBOARD
                        </button>
                      </div>
                    )}
                  </div>

                  {view === 'report' && playerData ? (
                    <>
                      <div className="text-center mb-8">
                        <span className="text-cyan-400 text-3xl font-bold font-mono" style={{ textShadow: '0 0 15px #2de2e6' }}>
                          {playerData.name}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        <div className="bg-fuchsia-500/10 border border-fuchsia-500/30 rounded-lg p-4 text-center">
                          <div className="text-xs text-fuchsia-300 font-mono mb-1">SCORE</div>
                          <div className="text-2xl font-bold text-cyan-400" style={{ textShadow: '0 0 10px #2de2e6' }}>{playerData.score.toLocaleString()}</div>
                        </div>
                        <div className="bg-fuchsia-500/10 border border-fuchsia-500/30 rounded-lg p-4 text-center">
                          <div className="text-xs text-fuchsia-300 font-mono mb-1">ACCURACY</div>
                          <div className="text-2xl font-bold text-green-400" style={{ textShadow: '0 0 10px #22c55e' }}>{accuracy}%</div>
                        </div>
                        <div className="bg-fuchsia-500/10 border border-fuchsia-500/30 rounded-lg p-4 text-center">
                          <div className="text-xs text-fuchsia-300 font-mono mb-1">AVG REACTION</div>
                          <div className="text-2xl font-bold text-yellow-400" style={{ textShadow: '0 0 10px #fbbf24' }}>{playerData.avgReactionTime}ms</div>
                        </div>
                        <div className="bg-fuchsia-500/10 border border-fuchsia-500/30 rounded-lg p-4 text-center">
                          <div className="text-xs text-fuchsia-300 font-mono mb-1">MISTAKES</div>
                          <div className="text-2xl font-bold text-red-400" style={{ textShadow: '0 0 10px #ef4444' }}>{playerData.mistakesMade}</div>
                        </div>
                      </div>

                      <div className="mb-6">
                        <h2 className="text-xl font-bold text-fuchsia-400 mb-4 text-center font-mono" style={{ textShadow: '0 0 10px #d946ef' }}>COMMON MISTAKES</h2>
                        <div className="space-y-3">
                          {(playerData.commonMistakes || []).map((mistake, index) => (
                            <div key={index} className="bg-black/40 border border-fuchsia-500/20 rounded-lg p-4 hover:bg-fuchsia-500/10 transition-colors" style={{ animation: `fadeSlideIn 0.5s ease-out ${index * 0.1}s both` }}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-6">
                                  <div className="flex flex-col items-center">
                                    <span className="text-xs text-gray-400 font-mono mb-2">SHOWED</span>
                                    <div className="w-16 h-16 bg-red-500/10 border-2 border-red-500/50 rounded-lg flex items-center justify-center">
                                      <SignSymbol letter={mistake.key1} state="wrong" />
                                    </div>
                                    <span className="text-sm font-mono text-red-400 mt-2">{mistake.key1}</span>
                                  </div>
                                  <div className="text-2xl text-gray-500">→</div>
                                  <div className="flex flex-col items-center">
                                    <span className="text-xs text-gray-400 font-mono mb-2">EXPECTED</span>
                                    <div className="w-16 h-16 bg-green-500/10 border-2 border-green-500/50 rounded-lg flex items-center justify-center">
                                      <SignSymbol letter={mistake.key2} state="correct" />
                                    </div>
                                    <span className="text-sm font-mono text-green-400 mt-2">{mistake.key2}</span>
                                  </div>
                                </div>
                                <div className="flex flex-col items-center">
                                  <span className="text-xs text-gray-400 font-mono mb-1">TIMES</span>
                                  <div className="text-3xl font-bold text-cyan-400 font-mono" style={{ textShadow: '0 0 10px #2de2e6' }}>{mistake.hits}×</div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        {(playerData.commonMistakes || []).length === 0 && (
                          <div className="text-center font-mono py-8">
                            {totalAttempts === 0 ? (
                              <span className="text-yellow-400 tracking-wider font-bold">NO ATTEMPTS RECORDED - TRY SIGNING NEXT TIME! 🖐️</span>
                            ) : (
                              <span className="text-green-400 tracking-wider font-bold">NO MISTAKES - FLAWLESS GAME! 🏆🎉</span>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="mt-6 pt-4 border-t border-fuchsia-500/30 text-center">
                        <span className="text-xs font-mono text-cyan-400 tracking-widest" style={{ textShadow: '0 0 10px #2de2e6' }}>{currentTime}</span>
                      </div>
                    </>
                  ) : view === 'leaderboard' ? (
                    <>
                      <div className="grid grid-cols-3 gap-4 mb-3 text-xs md:text-sm font-mono border-b border-fuchsia-500/30 pb-2">
                        <span className="text-fuchsia-300 tracking-wider" style={{ textShadow: '0 0 5px #d946ef' }}>RANK</span>
                        <span className="text-fuchsia-300 tracking-wider" style={{ textShadow: '0 0 5px #d946ef' }}>PLAYER</span>
                        <span className="text-fuchsia-300 tracking-wider text-right" style={{ textShadow: '0 0 5px #d946ef' }}>SCORE</span>
                      </div>

                      <div className="space-y-2">
                        {leaderboardData && leaderboardData.length > 0 ? (
                          leaderboardData.map((entry, index) => (
                            <div key={entry.id} className="grid grid-cols-3 gap-4 items-center text-xs md:text-sm font-mono py-1 hover:bg-fuchsia-500/10 transition-colors rounded" style={{ animation: `fadeSlideIn 0.5s ease-out ${index * 0.1}s both` }}>
                              <div className="flex items-center"><RankBadge rank={entry.rank} /></div>
                              <div className={`${getNameColor(index)} font-bold tracking-wide truncate`} style={{ textShadow: '0 0 8px currentColor' }}>
                                {entry.name}
                                {!entry.userId && <span className="ml-2 align-middle text-[9px] font-normal uppercase tracking-[2px] text-white/40" style={{ textShadow: 'none' }}>guest</span>}
                              </div>
                              <div className="text-right text-cyan-300" style={{ textShadow: '0 0 8px #2de2e6' }}>{entry.score.toLocaleString()}</div>
                            </div>
                          ))
                        ) : (
                          leaderboardFailed ? (
                          <div data-testid="leaderboard-error" className="text-center text-red-300/80 font-mono py-8">
                            COULD NOT LOAD SCORES{' '}
                            <button onClick={() => void refetchLeaderboard()} className="underline cursor-pointer">RETRY</button>
                          </div>
                        ) : (
                          <div className="text-center text-fuchsia-300/50 font-mono py-8">{leaderboardData === undefined ? 'LOADING...' : 'NO SCORES YET'}</div>
                        )
                        )}
                      </div>

                      <div className="mt-4 pt-3 border-t border-fuchsia-500/30 text-center">
                        <span className="text-xs md:text-sm font-mono text-cyan-400 tracking-widest" style={{ textShadow: '0 0 10px #2de2e6' }}>CURRENT TIME: {currentTime}</span>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-20 font-mono">
                      {playerLoading ? (
                        <div className="text-cyan-400 animate-pulse tracking-widest font-bold">ANALYZING REPORT DATA...</div>
                      ) : (
                        <div className="flex flex-col items-center gap-4">
                          <div className="text-red-400 font-bold tracking-widest">REPORT DATA NOT FOUND</div>
                          <button
                            onClick={() => setView('leaderboard')}
                            className="glass-button px-6 py-2 rounded-xl text-cyan-300 text-xs font-bold tracking-widest uppercase hover:text-white"
                          >
                            VIEW GLOBAL LEADERBOARD
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="absolute top-4 left-8 right-8 h-16 bg-gradient-to-b from-white/5 to-transparent rounded-xl pointer-events-none" />
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .overflow-y-auto::-webkit-scrollbar {
          width: 8px;
        }
        .overflow-y-auto::-webkit-scrollbar-track {
          background: rgba(0, 0, 0, 0.3);
          border-radius: 4px;
        }
        .overflow-y-auto::-webkit-scrollbar-thumb {
          background: rgba(217, 70, 239, 0.5);
          border-radius: 4px;
        }
        .overflow-y-auto::-webkit-scrollbar-thumb:hover {
          background: rgba(217, 70, 239, 0.8);
        }
      `}</style>
    </div>
  );
};

export default function LeaderboardPageWrapper() {
  return (
    <Suspense fallback={<div className="h-full w-full relative overflow-hidden bg-transparent"></div>}>
      <LeaderboardPage />
    </Suspense>
  );
}