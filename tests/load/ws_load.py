"""Capacity test for the detection WebSocket: N simulated players at once, each sending hand landmarks the way the
game does (one frame in flight, waits for the reply, at most --fps frames per second).

    pip install websockets
    python tests/load/ws_load.py --url ws://localhost:4001 --stages 1,5,10,25,50 --seconds 20

Per stage it prints frames answered, throughput, latency p50/p95/p99/max (send -> reply, measured by the client),
refused connections and server errors, and the server's own /concurrency_status before and after.

Tickets: if the detection server requires them, pass --secret (the DETECTION_TOKEN_SECRET value, local tests only)
or --ticket-url https://asl.dawnbalaschak.com/api/detection-token to fetch real ones like the page does.

Addresses: the server allows 10 sockets per client address. Against a server reached directly (local, LAN) each
simulated player sends its own X-Forwarded-For so they count separately. Through Cloudflare the real address is
used instead, so a single machine tops out at 10 players there; raise MAX_WS_PER_ADDRESS on the server to go further.

Landmarks are random but valid, so every frame goes through the full path (mask rendering, both model passes), which
is the worst case: a real player without a hand in view costs the server almost nothing.
"""
import argparse
import asyncio
import hashlib
import hmac
import json
import random
import secrets
import statistics
import time
import urllib.request

import websockets


def make_ticket(secret: str) -> str:
    payload = f"{int(time.time()) + 60}.{secrets.token_hex(8)}"
    return payload + "." + hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()


def fetch_ticket(url: str):
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.load(r).get("token")


def landmarks():
    cx, cy = random.uniform(0.35, 0.65), random.uniform(0.35, 0.65)
    return [{"x": cx + random.uniform(-0.2, 0.2), "y": cy + random.uniform(-0.25, 0.25), "z": random.uniform(-0.05, 0.05)} for _ in range(21)]


def percentile(values, p):
    if not values:
        return float("nan")
    s = sorted(values)
    return s[min(len(s) - 1, int(round(p / 100 * (len(s) - 1))))]


def server_status(http_base: str):
    try:
        with urllib.request.urlopen(f"{http_base}/concurrency_status", timeout=5) as r:
            return json.load(r)
    except Exception as e:  # noqa: BLE001
        return {"error": str(e)}


async def player(idx, args, stop_at, out):
    url = args.url.rstrip("/") + "/ws/predict"
    ticket = None
    if args.secret:
        ticket = make_ticket(args.secret)
    elif args.ticket_url:
        ticket = await asyncio.get_running_loop().run_in_executor(None, fetch_ticket, args.ticket_url)
    if ticket:
        url += "?token=" + ticket
    headers = {"X-Forwarded-For": f"10.77.{idx // 250}.{idx % 250 + 1}"} if not args.no_xff else None
    try:
        async with websockets.connect(url, additional_headers=headers, max_size=1 << 16, open_timeout=10) as ws:
            first = json.loads(await asyncio.wait_for(ws.recv(), 10))
            if first.get("type") != "ready":
                out["errors"] += 1
                return
            interval = 1.0 / args.fps
            await asyncio.sleep(random.uniform(0, interval))  # de-synchronise the players
            while time.monotonic() < stop_at:
                started = time.monotonic()
                await ws.send(json.dumps({"clientTimestamp": time.time(), "handDetected": True, "landmarks": landmarks()}))
                try:
                    reply = json.loads(await asyncio.wait_for(ws.recv(), args.timeout))
                except asyncio.TimeoutError:
                    out["timeouts"] += 1
                    continue
                if "letter" not in reply:
                    out["errors"] += 1
                    continue
                out["latencies"].append((time.monotonic() - started) * 1000)
                await asyncio.sleep(max(0.0, interval - (time.monotonic() - started)))
    except websockets.exceptions.InvalidStatus:
        out["refused"] += 1
    except websockets.exceptions.ConnectionClosed as e:
        if e.rcvd and e.rcvd.code in (1008, 1013):
            out["refused"] += 1
        else:
            out["dropped"] += 1
    except Exception:  # noqa: BLE001
        out["errors"] += 1


async def run_stage(n, args):
    out = {"latencies": [], "refused": 0, "dropped": 0, "errors": 0, "timeouts": 0}
    http_base = args.url.replace("ws://", "http://").replace("wss://", "https://").rstrip("/")
    before = server_status(http_base)
    stop_at = time.monotonic() + args.seconds
    t0 = time.monotonic()
    await asyncio.gather(*(player(i, args, stop_at, out) for i in range(n)))
    elapsed = time.monotonic() - t0
    after = server_status(http_base)
    lat = out["latencies"]
    row = {
        "players": n,
        "frames": len(lat),
        "fps_total": round(len(lat) / elapsed, 1),
        "fps_per_player": round(len(lat) / elapsed / max(1, n - out["refused"]), 1),
        "p50": round(percentile(lat, 50), 1),
        "p95": round(percentile(lat, 95), 1),
        "p99": round(percentile(lat, 99), 1),
        "max": round(max(lat), 1) if lat else float("nan"),
        "mean": round(statistics.fmean(lat), 1) if lat else float("nan"),
        "refused": out["refused"], "dropped": out["dropped"], "timeouts": out["timeouts"], "errors": out["errors"],
    }
    print(
        f"{n:>3} players | {row['frames']:>6} frames | {row['fps_total']:>6} fps total, {row['fps_per_player']:>5} per player | "
        f"latency ms p50 {row['p50']:>6} p95 {row['p95']:>6} p99 {row['p99']:>6} max {row['max']:>7} | "
        f"refused {row['refused']} dropped {row['dropped']} timeouts {row['timeouts']} errors {row['errors']}"
    )
    bs = (after.get("batch_stats") or {})
    print(f"      server: queue_depth {after.get('queue_depth')}, avg batch {bs.get('avg_batch_size')}, "
          f"batches {bs.get('total_batches', 0) - (before.get('batch_stats') or {}).get('total_batches', 0)}")
    return row


async def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default="ws://localhost:4001", help="server base, ws:// or wss:// (no path)")
    ap.add_argument("--stages", default="1,5,10,25,50", help="comma separated player counts, run in order")
    ap.add_argument("--seconds", type=float, default=20, help="how long each stage runs")
    ap.add_argument("--fps", type=float, default=25, help="per-player send rate cap (the game manages roughly 15-30)")
    ap.add_argument("--timeout", type=float, default=5, help="seconds to wait for one reply before counting a timeout")
    ap.add_argument("--secret", help="DETECTION_TOKEN_SECRET, to mint tickets locally")
    ap.add_argument("--ticket-url", help="site endpoint that issues tickets")
    ap.add_argument("--no-xff", action="store_true", help="do not send X-Forwarded-For per player")
    ap.add_argument("--pause", type=float, default=3, help="seconds between stages")
    ap.add_argument("--json", help="also write the per-stage results to this file")
    args = ap.parse_args()

    print(f"target {args.url}, {args.seconds:.0f}s per stage, up to {args.fps:g} fps per player")
    rows = []
    for n in [int(x) for x in args.stages.split(",") if x.strip()]:
        rows.append(await run_stage(n, args))
        await asyncio.sleep(args.pause)
    if args.json:
        with open(args.json, "w") as f:
            json.dump(rows, f, indent=2)


asyncio.run(main())
