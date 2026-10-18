"use client";

import React, { useEffect, useState } from "react";
import { computeLayout, type Layout } from "~/lib/layout";

/**
 * A container that guarantees a safe viewing area of at least 1920x1080,
 * but expands to fill the entire browser window aspect ratio to prevent black bars.
 * It uses CSS transform: scale() to visually fit this canvas into the browser window.
 */
export function ScaledContainer({ children }: { children: React.ReactNode }) {
  const [dimensions, setDimensions] = useState({ scale: 1, width: 1920, height: 1080 });
  const [layout, setLayout] = useState<Layout>({ mode: "desktop", stageWidth: 1920, rotatePrompt: false });
  const [rotateDismissed, setRotateDismissed] = useState(false);

  useEffect(() => {
    function handleResize() {
      // The "Safe Zone" we must guarantee is entirely visible. A phone gets a narrow zone (480 px wide, any height)
      // instead of the 1920 x 1080 desktop stage, which would shrink every page to a fifth of its size.
      const next = computeLayout(window.innerWidth, window.innerHeight);
      setLayout(next);
      const compact = next.mode === "compact";
      const targetWidth = next.stageWidth;
      const targetHeight = compact ? 1 : 1080;

      // Available screen real estate
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      // Calculate scale to fit the safe zone into the window
      const scaleX = windowWidth / targetWidth;
      const scaleY = windowHeight / targetHeight;

      // Use the smaller scale so the 1920x1080 safe zone ALWAYS fits
      const newScale = Math.min(scaleX, scaleY);
      
      // Calculate the final virtual canvas size by reversing the scale
      // This expands the canvas to fill any letterboxing/pillarboxing dead space natively!
      setDimensions({
        scale: newScale,
        width: windowWidth / newScale,
        height: windowHeight / newScale,
      });
    }

    // Set initial scale
    handleResize();

    // Re-calculate on window resize
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div
      className="flex items-center justify-center w-screen h-screen bg-black overflow-clip"
    >
      <div
        data-layout={layout.mode}
        style={{
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
          flexShrink: 0,
          transform: `scale(${dimensions.scale})`,
          transformOrigin: "center center",
          position: "relative",
          // ensure the background holds within the virtual canvas
          backgroundColor: "#0d0221", 
          // clip, not hidden: a hidden box can still be scrolled by code (focus, scrollIntoView), which shifts the whole stage
          overflow: "clip"
        }}
      >
        {children}
      </div>
      {layout.rotatePrompt && !rotateDismissed ? (
        <div
          data-testid="rotate-prompt"
          role="dialog"
          aria-label="Rotate your phone"
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-4 bg-[#0d0221] px-8 text-center text-white"
        >
          <div className="text-4xl">📱</div>
          <p className="text-lg font-bold tracking-wider">ROTATE YOUR PHONE UPRIGHT TO PLAY</p>
          <button
            type="button"
            onClick={() => setRotateDismissed(true)}
            className="text-sm text-cyan-300 underline underline-offset-4"
          >
            Continue anyway
          </button>
        </div>
      ) : null}
    </div>
  );
}
