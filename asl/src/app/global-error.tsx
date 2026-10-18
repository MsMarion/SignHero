"use client";

import { useEffect } from "react";
import { reportClientError } from "~/lib/report-error";

/** Last resort when the root layout itself crashes: it must bring its own <html> and <body>. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError("render", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        data-testid="global-error"
        style={{ background: "#000", color: "#fff", fontFamily: "sans-serif", display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}
      >
        <h1 style={{ letterSpacing: 4, color: "#f0abfc" }}>SOMETHING WENT WRONG</h1>
        <p style={{ opacity: 0.6 }}>SignHero hit an unexpected problem. It has been reported.</p>
        <button onClick={reset} style={{ padding: "12px 32px", cursor: "pointer" }}>
          TRY AGAIN
        </button>
      </body>
    </html>
  );
}
