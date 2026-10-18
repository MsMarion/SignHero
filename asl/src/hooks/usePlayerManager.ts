"use client";

import { useState, useRef, useCallback } from "react";
import { api } from "~/trpc/react";
import { useRouter } from "next/navigation";

interface GameMetrics {
  reactionTimes: number[];
  totalCorrect: number;
  totalMisses: number;
}

/**
 * Manages player creation, mistake tracking, and final stats submission.
 * Separated from game logic for cleaner architecture.
 */
export function usePlayerManager() {
  const router = useRouter();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [showNameModal, setShowNameModal] = useState(false);
  const hasFinishedRef = useRef(false);

  // tRPC mutations
  const createPlayer = api.player.create.useMutation();
  const updateFinalStats = api.player.updateFinalStats.useMutation();

  const createPlayerWithName = useCallback(async (name: string): Promise<string | null> => {
    if (!name.trim()) return null;

    try {
      const result = await createPlayer.mutateAsync({ name: name.trim() });

      console.log("✅ Player created:", result.id);
      setPlayerId(result.id);
      return result.id;
    } catch (error) {
      console.error("❌ Failed to create player:", error);
      return null;
    }
  }, [createPlayer]);

  const submitFinalStats = useCallback((
    score: number,
    metrics: GameMetrics
  ) => {
    if (!playerId || hasFinishedRef.current) return;
    
    hasFinishedRef.current = true;

    const avgReaction = metrics.reactionTimes.length > 0
      ? Math.round(metrics.reactionTimes.reduce((a, b) => a + b, 0) / metrics.reactionTimes.length)
      : 0;

    console.log("📊 Submitting final stats...");

    updateFinalStats.mutate({
      playerId,
      score,
      avgReactionTime: avgReaction,
      mistakesMade: metrics.totalMisses,
      correctHits: metrics.totalCorrect,
    }, {
      onSuccess: () => {
        console.log("✅ Stats saved, redirecting...");
        // Small delay to ensure DB write completes
        setTimeout(() => {
          router.push(`/leaderboard?playerId=${playerId}`);
        }, 100);
      },
      onError: (error) => {
        console.error("❌ Failed to update stats:", error);
        // Still redirect even if update fails
        router.push(`/leaderboard?playerId=${playerId}`);
      }
    });
  }, [playerId, router, updateFinalStats]);

  const resetFinishFlag = useCallback(() => {
    hasFinishedRef.current = false;
  }, []);

  return {
    playerId,
    playerName,
    setPlayerName,
    showNameModal,
    setShowNameModal,
    createPlayerWithName,
    submitFinalStats,
    resetFinishFlag,
    isCreating: createPlayer.isPending,
  };
}