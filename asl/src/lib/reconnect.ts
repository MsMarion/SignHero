/** How long to wait with no reply to a frame before treating the connection as dead and reconnecting. */
export const STALL_MS = 4000;

const BASE_MS = 500;
const CAP_MS = 5000;
const JITTER = 0.25;

/**
 * Delay before reconnect attempt number `attempt` (1 is the first retry): 0.5 s, 1 s, 2 s, 4 s, then 5 s
 * from there on, plus up to 25% random jitter so many browsers do not retry in lock step after a restart.
 * `random` is injectable so the timing can be tested.
 */
export function reconnectDelayMs(attempt: number, random: () => number = Math.random): number {
  const step = Math.max(1, Math.floor(attempt));
  const base = Math.min(BASE_MS * 2 ** (step - 1), CAP_MS);
  return Math.round(base * (1 + JITTER * random()));
}
