"use client";

import { useEffect, useState } from "react";

/** Same cut-off as Tailwind's `max-sm:` variant (under 640 px wide), so layout code and CSS classes agree. */
export const PHONE_MAX_WIDTH = 639;

export function isPhoneWidth(width: number): boolean {
  return width <= PHONE_MAX_WIDTH;
}

/** True on a phone-width window. False on the server and until the first client render. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${PHONE_MAX_WIDTH}px)`);
    const update = () => setPhone(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return phone;
}
