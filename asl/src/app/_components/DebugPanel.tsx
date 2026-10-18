"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { debugGet, readDebugPreference, writeDebugPreference, type DebugFacts } from "~/lib/debug";

/**
 * Diagnostics overlay for support and testing: build, signed-in user, detection connection, frame counters,
 * latency, reported errors. Off by default. Turn on with ?debug=1 (remembered; ?debug=0 clears it) or
 * Ctrl+Shift+D. It only reads what the page already knows and sends nothing.
 */
export function DebugPanel() {
  const { data: session, status } = useSession();
  const [on, setOn] = useState(false);
  const [facts, setFacts] = useState<DebugFacts>({});

  useEffect(() => {
    setOn(readDebugPreference(window.location.search));
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "d") {
        setOn((prev) => {
          writeDebugPreference(!prev);
          return !prev;
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!on) return;
    const tick = () => setFacts({ ...debugGet() });
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [on]);

  if (!on) return null;

  const rows: [string, string][] = [
    ["build", process.env.NEXT_PUBLIC_BUILD_SHA ?? "unknown"],
    ["path", typeof window === "undefined" ? "" : window.location.pathname],
    ["session", status === "authenticated" ? `${session?.user?.name ?? "?"} (${session?.user?.heroName ?? "no hero name"})` : status],
    ["detection", String(facts.ws ?? "not started")],
    ["ticket", facts.ticket === undefined ? "-" : facts.ticket ? "yes" : "none"],
    ["sockets opened", String(facts.opens ?? 0)],
    ["reconnect attempt", String(facts.attempt ?? 0)],
    ["frames sent / replies", `${facts.sends ?? 0} / ${facts.msgs ?? 0}`],
    ["latency ms", facts.latencyMs === undefined ? "-" : String(Math.round(Number(facts.latencyMs)))],
    ["hand", String(facts.hand ?? "-")],
    ["errors reported", String(facts.clientErrors ?? 0)],
    ["viewport", typeof window === "undefined" ? "" : `${window.innerWidth}x${window.innerHeight}`],
  ];

  return (
    <div
      data-testid="debug-panel"
      className="fixed bottom-2 right-2 z-[9999] rounded-lg border border-cyan-400/50 bg-black/85 px-3 py-2 font-mono text-[11px] leading-4 text-cyan-100 shadow-lg"
    >
      <div className="mb-1 flex items-center justify-between gap-6 text-cyan-300">
        <span>DEBUG</span>
        <button
          onClick={() => {
            writeDebugPreference(false);
            setOn(false);
          }}
          className="cursor-pointer text-cyan-300/70 hover:text-cyan-100"
          aria-label="Close debug panel"
        >
          ✕
        </button>
      </div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4">
          <span className="text-cyan-300/70">{k}</span>
          <span data-debug={k}>{v}</span>
        </div>
      ))}
    </div>
  );
}
