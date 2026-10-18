"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { type SignPrediction } from "~/lib/gameScoring";
import { reconnectDelayMs, STALL_MS } from "~/lib/reconnect";
import { debugInc, debugSet } from "~/lib/debug";

export interface UseSignDetectionReturn {
  predictions: SignPrediction[];
  predictionsSyncRef: React.MutableRefObject<SignPrediction[]>;
  isConnected: boolean;
  handDetected: boolean;
  latency: number;
  injectPrediction: (p: SignPrediction) => void;
  /** Hand tracking is loaded and can start reading frames (or has been replaced by simulated frames in a test build). */
  trackingReady: boolean;
  /** Hand tracking could not be loaded at all; the player can still be let in (tap play) rather than blocked. */
  trackingFailed: boolean;
}

const MAX_PREDICTIONS = 30; // Ring buffer size

/**
 * Hook for WebSocket-based sign detection with Client-Side MediaPipe.
 * Manages local landmark extraction and streaming to Python micro-batcher.
 */
export function useSignDetection(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  isWebcamReady: boolean,
  enabled = true,
  /** Load hand tracking before `enabled` (e.g. in the lobby), so the game does not start with it still warming up. */
  prepare = false,
): UseSignDetectionReturn {
  const [predictions, setPredictions] = useState<SignPrediction[]>([]);
  const predictionsSyncRef = useRef<SignPrediction[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [handDetected, setHandDetected] = useState(false);
  const [latency, setLatency] = useState(0);
  const [trackingReady, setTrackingReady] = useState(false);
  const [trackingFailed, setTrackingFailed] = useState(false);
  const initStartedRef = useRef(false);

  const wsRef = useRef<WebSocket | null>(null);
  const handsRef = useRef<any | null>(null);
  const animFrameRef = useRef<number>(0);
  const isSendingRef = useRef<boolean>(false);
  const lastSendAtRef = useRef<number>(0); // when the frame now in flight was sent (stall watchdog)

  const addPrediction = useCallback((pred: SignPrediction) => {
    predictionsSyncRef.current.push(pred);
    if (predictionsSyncRef.current.length > MAX_PREDICTIONS) {
      predictionsSyncRef.current.shift();
    }
    setPredictions([...predictionsSyncRef.current]);
    setHandDetected(true);
  }, []);

  // WebSocket connection to the detection backend, kept alive for as long as detection is enabled:
  // if it drops (a deploy restart, a network blip, a half-open connection) it reconnects with a growing delay.
  useEffect(() => {
    if (!enabled) return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:4001/ws/predict";
    let disposed = false; // set by the cleanup: no handler may act or reconnect after it
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const scheduleReconnect = () => {
      if (disposed || retryTimer) return;
      attempt += 1;
      const delay = reconnectDelayMs(attempt);
      console.log(`WebSocket reconnecting in ${delay} ms (attempt ${attempt})`);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        void connect();
      }, delay);
    };

    // Give up on a socket we no longer trust (the server went quiet) and start over.
    const dropAndReconnect = (ws: WebSocket) => {
      ws.onclose = null;
      ws.onerror = null;
      ws.onmessage = null;
      try {
        ws.close();
      } catch {
        /* already closing */
      }
      if (wsRef.current === ws) wsRef.current = null;
      isSendingRef.current = false;
      setIsConnected(false);
      scheduleReconnect();
    };

    // A short-lived signed ticket from our own server; the detection server refuses sockets without one.
    // If it cannot be fetched we still try to connect (the server decides whether a ticket is required).
    const fetchTicket = async (): Promise<string | null> => {
      try {
        const res = await fetch("/api/detection-token", { cache: "no-store" });
        if (!res.ok) return null;
        const body = (await res.json()) as { token?: unknown };
        return typeof body.token === "string" ? body.token : null;
      } catch {
        return null;
      }
    };

    const connect = async () => {
      if (disposed) return;
      const ticket = await fetchTicket();
      if (disposed) return;
      console.log(attempt === 0 ? `Connecting WebSocket to: ${wsUrl}` : `Reconnecting WebSocket to: ${wsUrl}`);

      const url = ticket ? `${wsUrl}${wsUrl.includes("?") ? "&" : "?"}token=${encodeURIComponent(ticket)}` : wsUrl;
      debugSet({ ws: "connecting", attempt, ticket: Boolean(ticket) });
      debugInc("opens");
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed || wsRef.current !== ws) return;
        console.log("WebSocket connected successfully");
        attempt = 0;
        // Nothing is in flight on a fresh connection. Without this reset, a frame that was waiting
        // for a reply when the old socket died would keep the "one in flight" flag set forever and
        // no frame would ever be sent again.
        isSendingRef.current = false;
        lastSendAtRef.current = 0;
        setIsConnected(true);
        debugSet({ ws: "connected", attempt: 0 });
      };

      ws.onclose = () => {
        if (disposed || wsRef.current !== ws) return;
        console.log("WebSocket disconnected");
        debugSet({ ws: "disconnected" });
        wsRef.current = null;
        isSendingRef.current = false;
        setIsConnected(false);
        scheduleReconnect();
      };

      // A failed attempt or a drop is followed by onclose, which drives the reconnect. Warn rather
      // than error: during an outage every failed attempt would otherwise show up as an app error.
      ws.onerror = () => {
        console.warn("WebSocket error (will retry if the connection was lost)");
      };

      ws.onmessage = (event: MessageEvent) => {
        try {
          isSendingRef.current = false; // Acknowledge receipt (One-in-Flight)
          const data = JSON.parse(event.data as string);

          if (data.type === "ready" || data.type === "error") {
            return;
          }

          if (data.letter !== undefined) {
            const prediction: SignPrediction = {
              letter: data.letter,
              confidence: data.confidence,
              clientTimestamp: data.clientTimestamp,
              handDetected: data.handDetected,
            };

            const now = performance.now() / 1000;
            setLatency((now - prediction.clientTimestamp) * 1000);
            debugInc("msgs");
            debugSet({ latencyMs: (now - prediction.clientTimestamp) * 1000, hand: Boolean(prediction.handDetected) });
            addPrediction(prediction);
          }
        } catch (e) {
          console.error("Error parsing WS message:", e);
        }
      };
    };

    // Stall watchdog: a connection can look open while the server never answers (half-open after a
    // network change). If a frame has gone unanswered for STALL_MS, drop it and reconnect.
    const watchdog = setInterval(() => {
      const ws = wsRef.current;
      if (
        ws &&
        ws.readyState === WebSocket.OPEN &&
        isSendingRef.current &&
        lastSendAtRef.current > 0 &&
        Date.now() - lastSendAtRef.current > STALL_MS
      ) {
        console.warn(`No reply from the detection server for ${STALL_MS} ms; reconnecting`);
        dropAndReconnect(ws);
      }
    }, 1000);

    void connect();

    return () => {
      disposed = true;
      clearInterval(watchdog);
      if (retryTimer) clearTimeout(retryTimer);
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
      }
      setIsConnected(false);
    };
  }, [enabled, addPrediction]);

  // Load MediaPipe Hands in the browser. This happens once, as soon as the camera is ready and the page wants tracking
  // (the lobby asks for it early with `prepare`), so a phone does not spend the first seconds of a game compiling it.
  useEffect(() => {
    if (typeof window === "undefined" || !(enabled || prepare) || !isWebcamReady || !videoRef.current) return;
    if (initStartedRef.current) return;
    initStartedRef.current = true;

    async function initMediaPipe() {
      // Test builds only (NEXT_PUBLIC_SIMULATED_FRAMES=1, set by e2e/build.mjs on CI): hand tracking is WebGL in
      // software on a two-core CI runner, which starves the page for a minute. Frames are simulated below instead.
      if (process.env.NEXT_PUBLIC_SIMULATED_FRAMES === "1") {
        setTrackingReady(true);
        return;
      }
      try {
        const { Hands } = await import("@mediapipe/hands");
        const hands = new Hands({
          // Served by this site (scripts/copy-mediapipe.mjs), not a third-party CDN.
          locateFile: (file: string) => `/mediapipe/hands/${file}`,
        });

        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        hands.onResults((results: any) => {
          if (!handsRef.current) return;

          const hasHand = Boolean(results.multiHandLandmarks && results.multiHandLandmarks.length > 0);

          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && !isSendingRef.current) {
            isSendingRef.current = true;
            lastSendAtRef.current = Date.now();
            debugInc("sends");
            const clientTimestamp = performance.now() / 1000;
            const payload = {
              clientTimestamp,
              handDetected: hasHand,
              landmarks: hasHand ? results.multiHandLandmarks[0] : [],
            };
            wsRef.current.send(JSON.stringify(payload));
          }
        });

        const started = performance.now();
        await hands.initialize(); // downloads and compiles the wasm and the model
        debugSet({ trackingMs: Math.round(performance.now() - started) });
        handsRef.current = hands;
        setTrackingReady(true);
      } catch (err) {
        console.error("Failed to load MediaPipe Hands:", err);
        setTrackingFailed(true);
      }
    }

    void initMediaPipe();
  }, [enabled, prepare, isWebcamReady, videoRef]);

  // Read camera frames only while the game wants detection.
  useEffect(() => {
    if (!enabled || !trackingReady) return;

    // Simulated frames (see above): "no hand" frames over the same protocol, so everything after the camera is exercised.
    if (process.env.NEXT_PUBLIC_SIMULATED_FRAMES === "1") {
      const timer = setInterval(() => {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN && !isSendingRef.current) {
          isSendingRef.current = true;
          lastSendAtRef.current = Date.now();
          debugInc("sends");
          wsRef.current.send(JSON.stringify({ clientTimestamp: performance.now() / 1000, handDetected: false, landmarks: [] }));
        }
      }, 50);
      return () => clearInterval(timer);
    }

    const video = videoRef.current;
    if (!video) return;
    let running = true;
    let lastSendTime = 0;

    const detectFrame = async (now: number) => {
      if (!running || !handsRef.current) return;

      if (now - lastSendTime >= 33) { // ~30 fps throttling
        lastSendTime = now;
        if (video.readyState >= 2 && !isSendingRef.current) {
          try {
            await handsRef.current.send({ image: video });
          } catch (err) {
            // Ignore transient frame send errors during page navigation
          }
        }
      }
      animFrameRef.current = requestAnimationFrame(detectFrame);
    };

    animFrameRef.current = requestAnimationFrame(detectFrame);
    return () => {
      running = false;
      cancelAnimationFrame(animFrameRef.current);
    };
  }, [enabled, trackingReady, videoRef]);

  // Release hand tracking when the page using it goes away.
  useEffect(() => {
    return () => {
      const hands = handsRef.current;
      handsRef.current = null;
      initStartedRef.current = false;
      if (hands && typeof hands.close === "function") {
        try { hands.close(); } catch (e) {}
      }
    };
  }, []);

  // Global Keyboard Fallback Listener
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return; // Ignore keyboard auto-repeat!
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key.length === 1 && /[a-zA-Z]/.test(e.key)) {
        const keyLetter = e.key.toLowerCase();
        const keyPrediction: SignPrediction = {
          letter: keyLetter,
          confidence: 1.0,
          clientTimestamp: performance.now() / 1000,
          handDetected: true,
          isKeyboard: true,
        };
        addPrediction(keyPrediction);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [enabled, addPrediction]);

  const injectPrediction = useCallback((pred: SignPrediction) => {
    addPrediction(pred);
  }, [addPrediction]);

  return {
    predictions,
    predictionsSyncRef,
    isConnected,
    handDetected,
    latency,
    injectPrediction,
    trackingReady,
    trackingFailed,
  };
}

