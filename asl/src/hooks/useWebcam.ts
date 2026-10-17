"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseWebcamReturn {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isReady: boolean;
  error: string | null;
  captureFrame: () => Promise<Blob | null>;
}

const CAPTURE_WIDTH = 320;
const CAPTURE_HEIGHT = 240;
const JPEG_QUALITY = 0.7;

/**
 * Hook for accessing webcam and capturing frames.
 * Manages camera permissions, video stream, and frame extraction.
 */
export function useWebcam(): UseWebcamReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [hasStream, setHasStream] = useState(false);

  // The <video> element can mount after the camera stream resolves (e.g. WebcamFeed only
  // renders once a game leaves "idle"), so attach the stream whenever the element appears.
  useEffect(() => {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!hasStream || !video || !stream) return;
    if (video.srcObject !== stream) {
      video.srcObject = stream;
    }
    const markReady = () => setIsReady(true);
    if (video.readyState >= 1) {
      markReady();
      return;
    }
    video.addEventListener("loadedmetadata", markReady);
    return () => video.removeEventListener("loadedmetadata", markReady);
  });

  useEffect(() => {
    let mounted = true;

    async function initCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: CAPTURE_WIDTH },
            height: { ideal: CAPTURE_HEIGHT },
            facingMode: "user",
          },
          audio: false,
        });

        if (!mounted) {
          // Component unmounted during async operation
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        setHasStream(true);
        setError(null);
      } catch (err) {
        if (!mounted) return;

        console.error("Failed to access webcam:", err);

        let errorMessage = "Failed to access webcam";
        if (err instanceof Error) {
          if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
            errorMessage = "Camera permission denied. Please allow camera access.";
          } else if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
            errorMessage = "No camera found. Please connect a camera.";
          } else if (err.name === "NotReadableError" || err.name === "TrackStartError") {
            errorMessage = "Camera is already in use by another application.";
          } else {
            errorMessage = `Camera error: ${err.message}`;
          }
        }

        setError(errorMessage);
        setIsReady(false);
      }
    }

    void initCamera();

    return () => {
      mounted = false;
      // Cleanup media stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      setIsReady(false);
    };
  }, []);

  /**
   * Capture a single frame from the video element as a JPEG blob.
   * Returns null if the video is not ready or canvas is unavailable.
   */
  const captureFrame = useCallback(async (): Promise<Blob | null> => {
    if (!isReady || !videoRef.current || !canvasRef.current) {
      return null;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    if (!ctx) {
      return null;
    }

    // Set canvas dimensions
    canvas.width = CAPTURE_WIDTH;
    canvas.height = CAPTURE_HEIGHT;

    // Draw current video frame to canvas
    ctx.drawImage(video, 0, 0, CAPTURE_WIDTH, CAPTURE_HEIGHT);

    // Convert to JPEG blob
    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          resolve(blob);
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    });
  }, [isReady]);

  return {
    videoRef,
    canvasRef,
    isReady,
    error,
    captureFrame,
  };
}
