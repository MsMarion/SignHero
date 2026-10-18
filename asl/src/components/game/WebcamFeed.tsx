"use client";

interface WebcamFeedProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  isReady: boolean;
  error: string | null;
  isConnected: boolean;
  handDetected: boolean;
  /** Fill the width of the parent (phones) instead of the fixed 320 x 240 box. */
  fluid?: boolean;
}

/**
 * Webcam feed component with connection status and hand detection indicators.
 * Replaces WebcamPlaceholder with real camera stream.
 */
export function WebcamFeed({
  videoRef,
  canvasRef,
  isReady,
  error,
  isConnected,
  handDetected,
  fluid = false,
}: WebcamFeedProps) {
  // Determine connection status color
  const statusColor = error
    ? "#ef4444" // red (error)
    : !isReady
      ? "#6b7280" // gray (loading)
      : !isConnected
        ? "#eab308" // yellow (disconnected)
        : "#22c55e"; // green (connected)

  const statusText = error
    ? "Error"
    : !isReady
      ? "Loading..."
      : !isConnected
        ? "Reconnecting..."
        : "Connected";

  return (
    <div className={`relative group ${fluid ? "w-full" : ""}`}>
      {/* Premium Cyber Camera Frame */}
      <div className={`relative overflow-hidden rounded-2xl glass-panel border border-fuchsia-500/40 shadow-[0_0_30px_rgba(217,70,239,0.25)] ${fluid ? "w-full aspect-[16/10]" : "w-[320px] h-[240px]"} backdrop-blur-md`}>
        {/* Glowing Corner Brackets */}
        <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-cyan-400 rounded-tl z-20 pointer-events-none" />
        <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-cyan-400 rounded-tr z-20 pointer-events-none" />
        <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-cyan-400 rounded-bl z-20 pointer-events-none" />
        <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-cyan-400 rounded-br z-20 pointer-events-none" />

        {/* Live Recording Indicator */}
        {isReady && !error && isConnected && (
          <div className="absolute top-3 left-4 z-20 flex items-center gap-2 bg-black/60 px-2.5 py-1 rounded-full border border-red-500/30 backdrop-blur-sm">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_#ef4444]" />
            <span className="text-[10px] font-mono font-black text-red-400 tracking-wider">LIVE</span>
          </div>
        )}

        {/* Video element */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
          style={{
            display: isReady && !error ? "block" : "none",
            transform: "scaleX(-1)", // Mirror the video
          }}
        />

        {/* Hidden canvas for frame capture */}
        <canvas ref={canvasRef} className="hidden" />

        {/* Placeholder/error state */}
        {(!isReady || error) && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center bg-black/80 backdrop-blur-sm z-10">
            {error ? (
              <>
                <div className="mb-2 text-4xl animate-bounce">⚠️</div>
                <div className="text-xs font-mono font-bold text-red-400 max-w-[250px]">{error}</div>
              </>
            ) : (
              <>
                <div className="mb-3 text-4xl animate-spin">📹</div>
                <div className="text-xs font-mono text-cyan-400 tracking-widest uppercase animate-pulse">Initializing camera stream...</div>
              </>
            )}
          </div>
        )}

        {/* Hand detection prompt */}
        {isReady && !error && isConnected && !handDetected && (
          <div className="absolute bottom-3 inset-x-4 z-20 flex items-center justify-center">
            <div className="glass-panel px-4 py-1.5 rounded-full border border-yellow-400/40 shadow-[0_0_20px_rgba(250,204,21,0.3)] animate-pulse flex items-center gap-2">
              <span className="text-yellow-400 font-mono text-xs font-bold tracking-wider">👋 SHOW YOUR HAND</span>
            </div>
          </div>
        )}
      </div>

      {/* Connection status indicator */}
      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 bg-black/80 px-4 py-1 rounded-full border border-white/10 shadow-lg backdrop-blur-md">
        <div
          className={`h-2 w-2 rounded-full ${isConnected ? "animate-pulse" : ""}`}
          style={{ backgroundColor: statusColor, boxShadow: `0 0 10px ${statusColor}` }}
        />
        <span className="font-mono text-[10px] font-bold tracking-wider uppercase" style={{ color: statusColor }}>{statusText}</span>
      </div>
    </div>
  );
}
