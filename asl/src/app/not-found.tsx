import Link from "next/link";

export default function NotFound() {
  return (
    <div
      data-testid="not-found"
      className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-center text-white"
    >
      <h1 className="text-5xl font-black tracking-[8px] text-fuchsia-300">PAGE NOT FOUND</h1>
      <p className="max-w-xl font-mono text-sm text-white/60">That page does not exist, or it is not open yet.</p>
      <div className="flex gap-4">
        <Link
          href="/whack"
          className="rounded-xl border border-cyan-400/60 bg-cyan-500/20 px-8 py-3 font-bold tracking-widest text-cyan-100 hover:bg-cyan-500/30"
        >
          PLAY WHACK-A-SIGN
        </Link>
        <Link href="/" className="rounded-xl border border-white/30 px-8 py-3 font-bold tracking-widest text-white/80 hover:bg-white/10">
          HOME
        </Link>
      </div>
    </div>
  );
}
