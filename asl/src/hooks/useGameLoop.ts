"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type Beatmap, type BeatmapNote } from "~/lib/beatmap";
import {
  evaluateNote,
  findBestPrediction,
  EARLY_WINDOW,
  LATE_GRACE,
  TRACKING_WINDOW,
} from "~/lib/gameScoring";
import { useWebcam } from "./useWebcam";
import { useSignDetection } from "./useSignDetection";
import { type GameState, type DebugLogEntry, type HitQuality } from "~/types/game";


const INITIAL_LIVES = 5;
const FEEDBACK_DURATION_MS = 800;

/**
 * Main game loop hook that integrates webcam, sign detection, and game logic.
 * Replaces useMockGameLoop with real CV integration.
 */
/**
 * Main game loop hook that integrates webcam, sign detection, and game logic.
 * Supports both Audio-driven and Timer-driven (fallback) game loops.
 */
export function useGameLoop(beatmap: Beatmap): {
  state: GameState;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  webcamReady: boolean;
  webcamError: string | null;
  startGame: () => void;
  toggleAutoplay: () => void;
  resetLoop: () => void;
} {
  // Webcam setup
  const { videoRef, canvasRef, isReady: webcamReady, error: webcamError, captureFrame } = useWebcam();

  // Sign detection via WebSocket
  const {
    predictions,
    predictionsSyncRef,
    isConnected,
    handDetected,
    latency,
    injectPrediction,
  } = useSignDetection(videoRef, webcamReady, true);

  // Audio Reference
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Game state
  const [state, setState] = useState<GameState>({
    currentTime: 0,
    score: 0,
    streak: 0,
    lives: INITIAL_LIVES,
    currentNote: null,
    noteState: "idle",
    feedbackText: null,
    feedbackLetter: null,
    notes: beatmap.notes,
    handDetected: false,
    isConnected: false,
    activeNoteIndex: 0,
    lastHitQuality: null,
    streakMilestone: null,
    comboMultiplier: 1,
    latestPrediction: null,
    latency: 0,
    debugLog: [],
    countdownNumber: null,
    autoplayEnabled: false,
    gameStatus: "lobby", // starts in lobby
  });

  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const animFrameRef = useRef<number>(0);
  const startTimeRef = useRef<number>(0); // Fallback timer start (perf.now)
  const pausedTimeRef = useRef<number>(0);
  const wasPausedRef = useRef<boolean>(false);
  const feedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processedPredictionsRef = useRef<Set<number>>(new Set());
  const injectedIndexRef = useRef<Set<number>>(new Set());

  // Initialize Audio & Intercept Media Controls
  useEffect(() => {
    if (beatmap.audioUrl) {
      const audio = new Audio(beatmap.audioUrl);
      audio.volume = 0.6; // Default volume
      audioRef.current = audio;

      // Intercept and disable MediaSession controls so OS / browser media toolbar cannot pause or scrub the audio!
      if (typeof navigator !== "undefined" && "mediaSession" in navigator) {
        try {
          navigator.mediaSession.setActionHandler("play", () => { /* disabled */ });
          navigator.mediaSession.setActionHandler("pause", () => { /* disabled */ });
          navigator.mediaSession.setActionHandler("seekto", () => { /* disabled */ });
          navigator.mediaSession.setActionHandler("seekbackward", () => { /* disabled */ });
          navigator.mediaSession.setActionHandler("seekforward", () => { /* disabled */ });
        } catch (e) {
          console.warn("MediaSession action handler setting failed:", e);
        }
      }

      const handleExternalPause = () => {
        // If the game is playing and audio is paused externally (e.g. keyboard keys), force resume!
        if (stateRef.current.gameStatus === "playing" && audioRef.current?.paused) {
          audioRef.current.play().catch(e => console.warn("Enforce play failed:", e));
        }
      };
      
      const handleExternalSeek = () => {
        // If the game is playing and audio is scrubbed externally, enforce internal game clock!
        if (stateRef.current.gameStatus === "playing" && audioRef.current) {
          const expectedTime = Math.max((performance.now() - startTimeRef.current) / 1000, 0);
          if (Math.abs(audioRef.current.currentTime - expectedTime) > 0.5) {
            audioRef.current.currentTime = expectedTime;
          }
        }
      };

      audio.addEventListener("pause", handleExternalPause);
      audio.addEventListener("seeking", handleExternalSeek);

      return () => {
        audio.removeEventListener("pause", handleExternalPause);
        audio.removeEventListener("seeking", handleExternalSeek);
        audio.pause();
        // Release the media resource without `audio.src = ""`, which makes Firefox log
        // "Invalid URI. Load of media resource failed".
        audio.removeAttribute("src");
        audio.load();
        audioRef.current = null;
      };
    } else {
      audioRef.current = null;
    }
  }, [beatmap.audioUrl]);

  const startGame = useCallback(() => {
    predictionsSyncRef.current = [];
    if (audioRef.current) {
      // Force immediate unlock and buffer inside click event handler!
      audioRef.current.play().then(() => {
        audioRef.current?.pause();
        if (audioRef.current) audioRef.current.currentTime = 0;
      }).catch(e => console.warn("Initial audio unlock warn:", e));
    }

    setState((prev) => ({ ...prev, gameStatus: "countdown", countdownNumber: 3 }));
    let count = 3;
    const interval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setState((prev) => ({ ...prev, countdownNumber: count }));
      } else {
        clearInterval(interval);
        startTimeRef.current = performance.now();
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(e => console.warn("Audio play failed at countdown end:", e));
        }
        setState((prev) => ({ ...prev, gameStatus: "playing", countdownNumber: null }));
      }
    }, 1000);
  }, []);

  const toggleAutoplay = useCallback(() => {
    setState((prev) => ({ ...prev, autoplayEnabled: !prev.autoplayEnabled }));
  }, []);

  const resetLoop = useCallback(() => {
    predictionsSyncRef.current = [];
    startTimeRef.current = performance.now();
    pausedTimeRef.current = 0;
    wasPausedRef.current = false;
    processedPredictionsRef.current.clear();
    injectedIndexRef.current.clear();

    // Unlock Audio for Replay
    if (audioRef.current) {
      audioRef.current.play().then(() => {
        audioRef.current?.pause();
        if (audioRef.current) audioRef.current.currentTime = 0;
      }).catch(e => console.warn("Replay audio unlock warn:", e));
    }

    setState((prev) => ({
      ...prev,
      currentTime: 0,
      score: 0,
      streak: 0,
      lives: INITIAL_LIVES,
      currentNote: null,
      noteState: "idle",
      feedbackText: null,
      activeNoteIndex: 0,
      lastHitQuality: null,
      streakMilestone: null,
      comboMultiplier: 1,
      latestPrediction: null,
      latency: 0,
      countdownNumber: 3,
      gameStatus: "countdown",
    }));

    let count = 3;
    const interval = setInterval(() => {
      count -= 1;
      if (count > 0) {
        setState((prev) => ({ ...prev, countdownNumber: count }));
      } else {
        clearInterval(interval);
        startTimeRef.current = performance.now();
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(e => console.warn("Audio replay play failed at countdown end:", e));
        }
        setState((prev) => ({ ...prev, gameStatus: "playing", countdownNumber: null }));
      }
    }, 1000);
  }, []);

  // Update connection/hand status from sign detection
  useEffect(() => {
    setState((prev) => ({
      ...prev,
      handDetected,
      isConnected,
      latency,
    }));
  }, [handDetected, isConnected, latency]);

  const injectPredictionRef = useRef(injectPrediction);
  useEffect(() => {
    injectPredictionRef.current = injectPrediction;
  }, [injectPrediction]);

  // Main game loop
  useEffect(() => {
    const tick = (now: number) => {
      if (
        stateRef.current.gameStatus === "lobby" || 
        stateRef.current.gameStatus === "countdown" || 
        stateRef.current.gameStatus === "finished"
      ) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      // Pause game clock during disconnection
      if (!isConnected) {
        if (!wasPausedRef.current) {
          pausedTimeRef.current = now;
          wasPausedRef.current = true;
          // Pause Audio
          audioRef.current?.pause();
        }
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      // Resume from pause
      if (wasPausedRef.current) {
        const pauseDuration = now - pausedTimeRef.current;
        startTimeRef.current += pauseDuration; // Shift fallback start time
        wasPausedRef.current = false;
        
        // Resume Audio
        if (audioRef.current && stateRef.current.gameStatus === "playing") {
            audioRef.current.play().catch(e => console.error("Audio resume failed:", e));
        }
      }

      // Determine Current Game Time
      let elapsed: number;
      let effectiveStartTimeSec: number;

      if (audioRef.current && !audioRef.current.paused && audioRef.current.currentTime > 0) {
        // Source of Truth: Audio Time
        elapsed = audioRef.current.currentTime;
        effectiveStartTimeSec = (now / 1000) - elapsed;
      } else {
        // Fallback or Initial Play Buffer Source of Truth: Performance Timer
        elapsed = Math.max((now - startTimeRef.current) / 1000, 0);
        effectiveStartTimeSec = startTimeRef.current / 1000;
      }

      // Clear out old keyboard predictions so they don't linger
      predictionsSyncRef.current.forEach(p => {
        if (p.isKeyboard) {
          const INPUT_OFFSET = 0.05; // Matches gameScoring.ts
          const relativeTime = (p.clientTimestamp - effectiveStartTimeSec) - INPUT_OFFSET;
          if (relativeTime < elapsed - 0.15) { // 150ms grace period
            processedPredictionsRef.current.add(p.clientTimestamp);
          }
        }
      });

      // AUTOPLAY BOT LOGIC
      if (stateRef.current.autoplayEnabled && stateRef.current.gameStatus === "playing") {
        const activeNote = beatmap.notes[stateRef.current.activeNoteIndex];
        if (activeNote) {
          const timeUntil = activeNote.time - elapsed;
          // Trigger perfectly right as note reaches target line
          if (timeUntil <= 0.05 && timeUntil >= -0.1) {
            if (!injectedIndexRef.current.has(stateRef.current.activeNoteIndex)) {
              injectedIndexRef.current.add(stateRef.current.activeNoteIndex);
              const predSec = (now / 1000);
              injectPredictionRef.current({
                letter: activeNote.letter.toLowerCase(),
                confidence: 1.0,
                clientTimestamp: predSec,
                handDetected: true,
                isKeyboard: true,
              });
            }
          }
        }
      }

      // Game Finished
      const isAudioFinished = audioRef.current?.ended ?? false;
      if (elapsed > beatmap.totalDuration || isAudioFinished) {
        setState(prev => ({ ...prev, gameStatus: "finished" }));
        if (audioRef.current) audioRef.current.pause();
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      const activeIndex = stateRef.current.activeNoteIndex;

      // Check if all notes processed
      if (activeIndex >= beatmap.notes.length) {
        setState(prev => ({ ...prev, currentTime: elapsed }));
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      const activeNote = beatmap.notes[activeIndex]!;
      const earlyStart = activeNote.time - TRACKING_WINDOW;
      const deadline = activeNote.time + LATE_GRACE;

      // 1. Search for a VALID HIT synchronously in raw memory
      const bestMatch = findBestPrediction(
        predictionsSyncRef.current,
        activeNote,
        earlyStart,
        deadline,
        effectiveStartTimeSec, 
        processedPredictionsRef.current
      );

      // 2. Also get the absolute latest unconsumed prediction for fallback feedback
      const latestUnconsumed = predictionsSyncRef.current
        .filter(p => !processedPredictionsRef.current.has(p.clientTimestamp))
        .at(-1) || null;

      // Evaluate note synchronously
      const judgement = evaluateNote(activeNote, bestMatch ?? latestUnconsumed, elapsed, stateRef.current.streak);

      const latestPred = predictionsSyncRef.current.length > 0
        ? predictionsSyncRef.current[predictionsSyncRef.current.length - 1] ?? null
        : null;

      if (judgement.type === "hit") {
        const consumedTimestamp = (bestMatch ?? latestUnconsumed)?.clientTimestamp;
        if (consumedTimestamp) {
          processedPredictionsRef.current.add(consumedTimestamp);
        }

        const newStreak = stateRef.current.streak + 1;
        const newScore = stateRef.current.score + judgement.points;
        const newMultiplier = Math.min(Math.floor(newStreak / 3) + 1, 4);
        const feedbackText = `${judgement.quality}! (${judgement.sawLetter})`;

        let streakMilestone: number | null = null;
        if (newStreak === 5 || newStreak === 10 || newStreak === 25) {
          streakMilestone = newStreak;
          setTimeout(() => setState((s) => ({ ...s, streakMilestone: null })), 1000);
        }

        if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
        feedbackTimeoutRef.current = setTimeout(() => {
          setState((s) => ({
            ...s,
            noteState: "idle",
            feedbackText: null,
            feedbackLetter: null,
          }));
        }, FEEDBACK_DURATION_MS);

        const hitLogEntry: DebugLogEntry = {
          timestamp: Date.now(),
          type: "HIT",
          letter: activeNote.letter,
          delta: activeNote.time - elapsed,
          quality: judgement.quality,
          confidence: latestUnconsumed?.confidence,
        };

        const nextIndex = activeIndex + 1;
        const nextNote = beatmap.notes[nextIndex];
        const trackingStartNext = nextNote ? nextNote.time - TRACKING_WINDOW : Infinity;
        const nextNoteVisible = nextNote && elapsed >= trackingStartNext;

        setState((prev) => ({
          ...prev,
          currentTime: elapsed,
          currentNote: nextNoteVisible ? nextNote : null,
          noteState: "idle",
          feedbackText,
          feedbackLetter: activeNote.letter,
          score: newScore,
          streak: newStreak,
          activeNoteIndex: nextIndex,
          lastHitQuality: judgement.quality,
          streakMilestone,
          comboMultiplier: newMultiplier,
          latestPrediction: latestPred,
          debugLog: [...prev.debugLog.slice(-20), hitLogEntry],
        }));
      } else if (judgement.type === "miss") {
        const newLives = Math.max(stateRef.current.lives - 1, 0);
        let missedFeedback = "MISS!";
        if (judgement.reason === "WRONG SIGN") missedFeedback = `MISS (Wrong: ${judgement.sawLetter})`;
        else if (judgement.reason === "LOW CONFIDENCE") missedFeedback = `MISS (Low Confidence)`;
        else if (judgement.reason === "TOO LATE") missedFeedback = `MISS (Too Late)`;

        if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
        feedbackTimeoutRef.current = setTimeout(() => {
          setState((s) => ({
            ...s,
            noteState: "idle",
            feedbackText: null,
            feedbackLetter: null,
          }));
        }, FEEDBACK_DURATION_MS);

        const missLogEntry: DebugLogEntry = {
          timestamp: Date.now(),
          type: "MISS",
          letter: activeNote.letter,
          delta: activeNote.time - elapsed,
          confidence: latestUnconsumed?.confidence,
        };

        const nextIndex = activeIndex + 1;
        const nextNote = beatmap.notes[nextIndex];
        const trackingStartNext = nextNote ? nextNote.time - TRACKING_WINDOW : Infinity;
        const nextNoteVisible = nextNote && elapsed >= trackingStartNext;

        setState((prev) => ({
          ...prev,
          currentTime: elapsed,
          currentNote: nextNoteVisible ? nextNote : null,
          noteState: "idle",
          feedbackText: missedFeedback,
          feedbackLetter: activeNote.letter,
          lives: newLives,
          streak: 0,
          activeNoteIndex: nextIndex,
          lastHitQuality: null,
          comboMultiplier: 1,
          latestPrediction: latestPred,
          debugLog: [...prev.debugLog.slice(-20), missLogEntry],
        }));
      } else {
        const trackingStart = activeNote.time - TRACKING_WINDOW;
        setState((prev) => ({
          ...prev,
          currentTime: elapsed,
          currentNote: elapsed >= trackingStart ? activeNote : null,
          latestPrediction: latestPred,
        }));
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      if (feedbackTimeoutRef.current) {
        clearTimeout(feedbackTimeoutRef.current);
      }
      if (audioRef.current) {
          audioRef.current.pause();
      }
    };
  }, [beatmap, isConnected]);

  return {
    state,
    videoRef,
    canvasRef,
    webcamReady,
    webcamError,
    startGame,
    toggleAutoplay,
    resetLoop,
  };
}
