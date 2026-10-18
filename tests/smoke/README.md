# Smoke test

`whack-smoke.mjs` checks that Whack-A-Sign works end to end. It has no dependencies (Node 22+).

```bash
# local stack (frontend :4000, backend :4001)
node tests/smoke/whack-smoke.mjs

# production, read-only
SMOKE_BASE_URL=https://asl.dawnbalaschak.com SMOKE_API_URL=https://aslapi.dawnbalaschak.com \
  node tests/smoke/whack-smoke.mjs
```

Exit code 0 means every check passed (skips allowed); 1 means at least one failed.

| Check | What it catches |
|---|---|
| frontend serves `/whack` | frontend down or crashing |
| backend is up and uses the GPU | backend down, or silently running on CPU |
| websocket round trip is fast enough | slow or stalled inference path (median budget `SMOKE_LATENCY_MS`, default 400 ms) |
| backend answers every frame, even back to back | the old bug where fast frames got no reply and the page froze (shows up on low-latency links, i.e. locally) |
| `player.create` works | database or replica-set problems (only with `SMOKE_WRITE=1`, because it writes a `SMOKE TEST` player) |
| browser game | headless Chrome with a fake camera: camera goes LIVE, frames flow to the backend and replies come back, four keyboard-driven rounds happen over **one** socket (not one per round), and there are no console errors or uncaught exceptions |

## Running on a slow machine (CI)
The browser check is built to tolerate slow browsers: on a shared GitHub runner Chrome renders in software and MediaPipe's load can stretch
the game's 3 second countdown to 20 seconds or more, and only a handful of frames flow. It therefore waits (up to 60 s for the first
target letter, up to 40 s for a few frames), needs at least 3 frames with replies keeping up rather than a rate, keeps its counters in
`sessionStorage` (they survive the game redirecting to the leaderboard), clicks Start with a real mouse event through Chrome's input API
(a script's `el.click()` is not a user gesture, so the autoplay policy could block the game's audio and log an uncaught `play()`
rejection that no real player sees), and on failure prints what the page showed, its counters and its console errors.

Limits: the fake camera has no hand in it, so this does not prove a real hand is recognised as the right letter.
Keep playing a round by hand before a release.

Other variables: `SMOKE_BROWSER=0` skips the browser check (`1` makes a missing Chrome a failure instead of a skip),
`SMOKE_ALLOW_CPU=1` accepts a CPU backend, `CHROME_PATH` points at a Chrome or Chromium binary.
