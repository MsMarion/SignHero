"use client";

import { useEffect, useState } from "react";
import { computeLayout, type Layout } from "~/lib/layout";

const SERVER_LAYOUT: Layout = { mode: "desktop", stageWidth: 1920, rotatePrompt: false };

/** The layout for the current window; follows resizes and rotation. Desktop on the server and until the first client render. */
export function useLayout(): Layout {
  const [layout, setLayout] = useState<Layout>(SERVER_LAYOUT);
  useEffect(() => {
    const update = () => setLayout(computeLayout(window.innerWidth, window.innerHeight));
    update();
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  return layout;
}

/** True for the compact (phone and upright-tablet) layout. */
export function useIsPhone(): boolean {
  return useLayout().mode === "compact";
}
