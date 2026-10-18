/**
 * Tiny debug store for the in-page diagnostics panel (?debug=1, or Ctrl+Shift+D). Code anywhere on the
 * page can record facts with debugSet/debugInc; the panel reads them twice a second. Recording is always
 * on because it is just an object write; nothing is sent anywhere.
 */
export type DebugFacts = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    __signheroDebug?: DebugFacts;
  }
}

const KEY = "signhero_debug";

export function debugSet(patch: DebugFacts): void {
  if (typeof window === "undefined") return;
  window.__signheroDebug = { ...window.__signheroDebug, ...patch };
}

export function debugInc(name: string, by = 1): void {
  if (typeof window === "undefined") return;
  const current = window.__signheroDebug?.[name];
  debugSet({ [name]: (typeof current === "number" ? current : 0) + by });
}

export function debugGet(): DebugFacts {
  return typeof window === "undefined" ? {} : (window.__signheroDebug ?? {});
}

/** ?debug=1 turns the panel on (and remembers it), ?debug=0 turns it off. */
export function readDebugPreference(search: string): boolean {
  try {
    const param = new URLSearchParams(search).get("debug");
    if (param === "1") window.localStorage.setItem(KEY, "1");
    if (param === "0") window.localStorage.removeItem(KEY);
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return new URLSearchParams(search).get("debug") === "1";
  }
}

export function writeDebugPreference(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(KEY, "1");
    else window.localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the panel still works for this page view */
  }
}
