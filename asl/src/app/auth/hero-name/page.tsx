"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { api } from "~/trpc/react";

const MIN = 3;
const MAX = 16;

/** Turn a suggestion (for example a Google name) into something that could pass validation. */
function suggestionFrom(raw: string | null | undefined): string {
  const cleaned = (raw ?? "").replace(/[^A-Za-z0-9 _-]/g, "").trim().slice(0, MAX).trim();
  return cleaned.length >= MIN ? cleaned : "";
}

export default function HeroNamePage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  const [name, setName] = useState("");
  const [debounced, setDebounced] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [prefilled, setPrefilled] = useState(false);

  // Not signed in: go and sign in first.
  useEffect(() => {
    if (status === "unauthenticated") router.replace("/auth/signin");
  }, [status, router]);

  // Suggest a name once, from the account name if it is usable.
  useEffect(() => {
    if (status === "authenticated" && !prefilled) {
      setPrefilled(true);
      setName(suggestionFrom(session.user.name));
    }
  }, [status, session, prefilled]);

  // Debounce what we send to the availability check.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(name), 350);
    return () => clearTimeout(t);
  }, [name]);

  // If the account already has a name (for example the session was stale), refresh the session and leave.
  const mine = api.heroName.getMine.useQuery(undefined, { enabled: status === "authenticated" });
  useEffect(() => {
    if (mine.data?.name) {
      void update().then(() => router.replace("/songselection"));
    }
  }, [mine.data, update, router]);

  const trimmed = name.trim();
  const check = api.heroName.check.useQuery(
    { name: debounced },
    { enabled: status === "authenticated" && debounced.trim().length > 0, staleTime: 0 },
  );

  const claim = api.heroName.claim.useMutation({
    onSuccess: async () => {
      await update(); // reload the session so it carries the new hero name
      router.replace("/songselection");
      router.refresh();
    },
    onError: (err) => {
      setServerError(err.message);
      setConfirming(false);
    },
  });

  const settled = debounced === name && !check.isFetching;
  const tooShort = trimmed.length > 0 && trimmed.length < MIN;
  const ok = settled && check.data?.valid === true && check.data.available;

  let feedback: { text: string; tone: "good" | "bad" | "neutral" } = {
    text: `${MIN}-${MAX} characters: letters, numbers, spaces, - or _.`,
    tone: "neutral",
  };
  if (tooShort) feedback = { text: `Use at least ${MIN} characters.`, tone: "bad" };
  else if (trimmed.length > 0 && !settled) feedback = { text: "Checking...", tone: "neutral" };
  else if (settled && check.data) {
    feedback = ok
      ? { text: "Available.", tone: "good" }
      : { text: check.data.reason ?? "That name can't be used.", tone: "bad" };
  }

  if (status !== "authenticated") {
    return (
      <div className="flex items-center justify-center min-h-[600px]">
        <div className="w-10 h-10 border-4 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
      </div>
    );
  }

  const finalName = check.data?.valid ? check.data.name : trimmed;

  return (
    <div className="flex flex-col items-center justify-center min-h-[600px] w-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl relative overflow-hidden"
        style={{ background: "rgba(255, 255, 255, 0.03)", boxShadow: "0 0 40px rgba(168, 85, 247, 0.2)" }}
      >
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-50" />

        <div className="text-center mb-8">
          <h1 className="text-4xl font-black text-white tracking-tighter mb-2">CHOOSE YOUR HERO NAME</h1>
          <p className="text-purple-200/60 text-sm font-mono">
            This is how you appear on the leaderboard. You can only choose once.
          </p>
        </div>

        {!confirming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setServerError(null);
              if (ok) setConfirming(true);
            }}
            className="space-y-6"
          >
            <div className="space-y-2">
              <label htmlFor="hero-name" className="text-[10px] text-fuchsia-300 uppercase tracking-[3px] ml-1 font-bold">
                Hero Name
              </label>
              <input
                id="hero-name"
                type="text"
                autoFocus
                maxLength={MAX}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setServerError(null);
                }}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-5 py-4 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/50 transition-all placeholder:text-white/10"
                placeholder="e.g. SignMaster"
                autoComplete="off"
              />
              <p
                data-testid="hero-name-feedback"
                className={`text-xs ml-1 ${
                  feedback.tone === "good" ? "text-green-400" : feedback.tone === "bad" ? "text-red-400" : "text-white/40"
                }`}
              >
                {feedback.text}
              </p>
            </div>

            {serverError && (
              <div className="text-red-400 text-xs text-center bg-red-400/10 py-2 rounded-lg border border-red-400/20">
                {serverError}
              </div>
            )}

            <button type="submit" disabled={!ok} className="w-full relative group overflow-hidden disabled:opacity-40">
              <div className="relative bg-gradient-to-r from-fuchsia-500 to-purple-600 py-4 rounded-xl text-white font-bold tracking-widest text-center">
                CONTINUE
              </div>
            </button>
          </form>
        ) : (
          <div className="space-y-6" data-testid="hero-name-confirm">
            <div className="text-center space-y-3">
              <p className="text-white/70 text-sm">Your hero name will be</p>
              <p className="text-3xl font-black text-cyan-300 tracking-wide break-all">{finalName}</p>
              <p className="text-amber-300 text-xs bg-amber-300/10 border border-amber-300/20 rounded-lg py-2 px-3">
                This is permanent. It cannot be changed later.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={claim.isPending}
                className="py-4 rounded-xl border border-white/15 text-white/80 font-bold tracking-widest hover:bg-white/5 disabled:opacity-50"
              >
                BACK
              </button>
              <button
                type="button"
                onClick={() => claim.mutate({ name: finalName })}
                disabled={claim.isPending}
                className="py-4 rounded-xl bg-gradient-to-r from-fuchsia-500 to-purple-600 text-white font-bold tracking-widest disabled:opacity-60"
              >
                {claim.isPending ? "SAVING..." : "LOCK IT IN"}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
