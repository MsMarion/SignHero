"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportClientError } from "~/lib/report-error";

/** Shown when a page crashes while rendering. The error is reported to the server log. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError("render", error);
  }, [error]);

  return (
    <div
      data-testid="error-boundary"
      role="alert"
      className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-center text-white"
    >
      <h1 className="text-4xl font-black tracking-[6px] text-fuchsia-300">SOMETHING WENT WRONG</h1>
      <p className="max-w-xl font-mono text-sm text-white/60">
        This page hit an unexpected problem. It has been reported. You can try again or head back.
      </p>
      <div className="flex gap-4">
        <button
          onClick={reset}
          className="cursor-pointer rounded-xl border border-cyan-400/60 bg-cyan-500/20 px-8 py-3 font-bold tracking-widest text-cyan-100 hover:bg-cyan-500/30"
        >
          TRY AGAIN
        </button>
        <Link
          href="/"
          className="rounded-xl border border-white/30 px-8 py-3 font-bold tracking-widest text-white/80 hover:bg-white/10"
        >
          HOME
        </Link>
      </div>
      {error.digest ? <p className="font-mono text-xs text-white/30">ref {error.digest}</p> : null}
    </div>
  );
}
