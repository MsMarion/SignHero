"use client";

import { useState, useRef, useEffect } from "react";
import { type SignPrediction } from "~/lib/gameScoring";

const HOLD_DURATION = 400;

interface AIInteractionProps {
  predictions: SignPrediction[];
  targetLetter: string | null;
  isPlaying: boolean;
  isConnected: boolean;
  onCorrect: (letter: string) => void;
  onMistake: (showed: string, expected: string) => void;
}

/**
 * Manages AI sign detection interactions.
 * Handles hold-to-confirm logic and mistake detection.
 */
export function useAIInteraction({
  predictions,
  targetLetter,
  isPlaying,
  isConnected,
  onCorrect,
  onMistake,
}: AIInteractionProps) {
  const [holdProgress, setHoldProgress] = useState(0);
  const holdStartRef = useRef<number | null>(null);
  const lastMistakeRef = useRef<string>("");

  const latestPrediction = predictions[predictions.length - 1] ?? null;

  // Callers pass inline arrow functions, which change identity on every render. Reading the
  // latest versions through refs keeps them out of the effect dependencies; otherwise the
  // effect re-ran every render, and its setHoldProgress call re-rendered, causing an
  // endless update loop ("Maximum update depth exceeded") while a sign was held.
  const onCorrectRef = useRef(onCorrect);
  const onMistakeRef = useRef(onMistake);
  onCorrectRef.current = onCorrect;
  onMistakeRef.current = onMistake;

  useEffect(() => {
    if (!isPlaying || !targetLetter || !isConnected) {
      holdStartRef.current = null;
      setHoldProgress(0);
      return;
    }

    const isCorrect = latestPrediction &&
      latestPrediction.letter.toLowerCase() === targetLetter.toLowerCase() &&
      latestPrediction.confidence >= 0.5;

    if (isCorrect) {
      // If it's a physical keyboard fallback press, instantly confirm without hold delay!
      if (latestPrediction.isKeyboard) {
        onCorrectRef.current(targetLetter);
        holdStartRef.current = null;
        setHoldProgress(0);
        return;
      }

      // Start or continue hold for webcam predictions
      if (!holdStartRef.current) {
        holdStartRef.current = Date.now();
      } else {
        const elapsed = Date.now() - holdStartRef.current;
        const progress = Math.min(elapsed / HOLD_DURATION, 1);
        setHoldProgress(progress);

        if (elapsed >= HOLD_DURATION) {
          onCorrectRef.current(targetLetter);
          holdStartRef.current = null;
          setHoldProgress(0);
        }
      }
    } else {
      // Wrong sign or low confidence
      if (latestPrediction && 
          latestPrediction.letter !== targetLetter && 
          latestPrediction.confidence >= 0.5) {
        
        const mistakeKey = `${latestPrediction.letter}->${targetLetter}`;
        
        // Debounce: only fire once per unique mistake
        if (mistakeKey !== lastMistakeRef.current) {
          lastMistakeRef.current = mistakeKey;
          onMistakeRef.current(latestPrediction.letter, targetLetter);
        }
      }

      holdStartRef.current = null;
      setHoldProgress(0);
    }
  }, [isPlaying, targetLetter, latestPrediction, isConnected]);

  // Reset on target change
  useEffect(() => {
    lastMistakeRef.current = "";
    holdStartRef.current = null;
    setHoldProgress(0);
  }, [targetLetter]);

  return {
    holdProgress,
    latestPrediction,
  };
}