#!/usr/bin/env node
// Sign Hero smoke test: does Whack-A-Sign work end to end?
//
// Zero dependencies (Node 22+: global fetch and WebSocket). Run against any environment:
//   node tests/smoke/whack-smoke.mjs                                   # local stack (localhost:4000 / :4001)
//   SMOKE_BASE_URL=https://asl.dawnbalaschak.com SMOKE_API_URL=https://aslapi.dawnbalaschak.com \
//     node tests/smoke/whack-smoke.mjs                                 # production
//
// Environment variables:
//   SMOKE_BASE_URL     frontend origin               (default http://localhost:4000)
//   SMOKE_API_URL      detection backend origin      (default http://localhost:4001)
//   SMOKE_WRITE=1      also create a throw-away "SMOKE TEST" player through tRPC (off by default: it writes to the DB)
//   SMOKE_BROWSER=0|1  0 = skip the browser check; 1 = fail instead of skip if Chrome is missing (default: run if found)
//   SMOKE_ALLOW_CPU=1  do not fail when the backend runs on CPU
//   SMOKE_LATENCY_MS   median WebSocket round-trip budget in ms (default 400, generous for the public route)
//   CHROME_PATH        Chrome/Chromium binary (auto-detected on Windows, macOS and Linux)
//
// Exit code 0 = all checks passed (skips allowed), 1 = at least one failure.
//
// The browser check uses Chrome's fake camera, so it proves the page, MediaPipe, the WebSocket and the game
// loop work, but not that a real hand is recognised as the right letter. That stays a manual check.

import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BASE = (process.env.SMOKE_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const API = (process.env.SMOKE_API_URL ?? 'http://localhost:4001').replace(/\/$/, '');
const WS_URL = API.replace(/^http/, 'ws') + '/ws/predict';
const WRITE = process.env.SMOKE_WRITE === '1';
const BROWSER = process.env.SMOKE_BROWSER;
const ALLOW_CPU = process.env.SMOKE_ALLOW_CPU === '1';
const LATENCY_BUDGET_MS = Number(process.env.SMOKE_LATENCY_MS ?? 400);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];

async function check(name, fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    results.push({ name, status: 'PASS', detail: detail ?? '', ms: Date.now() - start });
  } catch (err) {
    if (err instanceof Skip) results.push({ name, status: 'SKIP', detail: err.message, ms: Date.now() - start });
    else results.push({ name, status: 'FAIL', detail: String(err?.message ?? err), ms: Date.now() - start });
  }
  const r = results[results.length - 1];
  console.log(`${r.status.padEnd(4)} ${name}${r.detail ? ' - ' + r.detail : ''} (${r.ms} ms)`);
}
class Skip extends Error {}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function landmarks() {
  return Array.from({ length: 21 }, () => ({ x: 0.2 + Math.random() * 0.6, y: 0.2 + Math.random() * 0.6, z: 0 }));
}

// Opens the detection WebSocket and returns helpers; resolves after the server's "ready" message.
async function openSocket() {
  const ws = new WebSocket(WS_URL);
  const queue = [];
  let waiter = null;
  ws.addEventListener('message', (e) => {
    const msg = JSON.parse(e.data);
    if (waiter) { const w = waiter; waiter = null; w(msg); } else queue.push(msg);
  });
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error(`cannot connect to ${WS_URL}`)), { once: true });
  });
  const next = (timeoutMs) => new Promise((resolve, reject) => {
    if (queue.length) return resolve(queue.shift());
    const t = setTimeout(() => { waiter = null; reject(new Error(`no reply within ${timeoutMs} ms`)); }, timeoutMs);
    waiter = (m) => { clearTimeout(t); resolve(m); };
  });
  const ready = await next(10000);
  assert(ready.type === 'ready', `expected a ready message, got ${JSON.stringify(ready).slice(0, 80)}`);
  const frame = async (timeoutMs = 3000) => {
    const t0 = performance.now();
    ws.send(JSON.stringify({ clientTimestamp: performance.now() / 1000, handDetected: true, landmarks: landmarks() }));
    const reply = await next(timeoutMs);
    assert(reply.letter !== undefined, `reply has no letter: ${JSON.stringify(reply).slice(0, 80)}`);
    return performance.now() - t0;
  };
  return { ws, frame, close: () => ws.close() };
}

// ---------------------------------------------------------------- Chrome / CDP helpers

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

async function withChrome(fn) {
  const chromePath = findChrome();
  if (!chromePath) {
    if (BROWSER === '1') throw new Error('Chrome not found (set CHROME_PATH)');
    throw new Skip('Chrome not found (set CHROME_PATH to enable)');
  }
  const port = 9300 + Math.floor(Math.random() * 500);
  const profile = mkdtempSync(join(tmpdir(), 'signhero-smoke-'));
  const chrome = spawn(chromePath, [
    '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-first-run', '--no-sandbox', 'about:blank',
  ], { stdio: 'ignore' });
  try {
    let target;
    for (let i = 0; i < 40 && !target; i++) {
      try {
        const tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
        target = tabs.find((t) => t.type === 'page');
      } catch { /* not up yet */ }
      if (!target) await sleep(500);
    }
    assert(target, 'Chrome did not start');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => ws.addEventListener('open', r, { once: true }));
    let id = 0;
    const pending = new Map();
    const events = [];
    ws.addEventListener('message', (m) => {
      const d = JSON.parse(m.data);
      if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } else events.push(d);
    });
    const send = (method, params = {}) => new Promise((resolve) => {
      const i = ++id; pending.set(i, resolve); ws.send(JSON.stringify({ id: i, method, params }));
    });
    const evaluate = async (expression) =>
      (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
    return await fn({ send, evaluate, events });
  } finally {
    chrome.kill();
    await sleep(500);
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

async function waitFor(predicate, timeoutMs, label) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const v = await predicate();
    if (v) return v;
    await sleep(500);
  }
  throw new Error(`timed out waiting for ${label}`);
}

// ---------------------------------------------------------------- checks

console.log(`Sign Hero smoke test\n  frontend: ${BASE}\n  backend:  ${API}\n`);

await check('frontend serves /whack', async () => {
  const r = await fetch(`${BASE}/whack`);
  assert(r.status === 200, `HTTP ${r.status}`);
});

await check('backend is up and uses the GPU', async () => {
  const r = await fetch(`${API}/concurrency_status`);
  assert(r.status === 200, `HTTP ${r.status}`);
  const j = await r.json();
  assert(ALLOW_CPU || j.device === 'cuda', `device is "${j.device}", expected cuda (set SMOKE_ALLOW_CPU=1 to allow)`);
  return `device ${j.device}`;
});

await check('websocket round trip is fast enough', async () => {
  const s = await openSocket();
  try {
    await s.frame(10000); // warm-up: the first frame after idle reloads the model
    const times = [];
    for (let i = 0; i < 20; i++) { times.push(await s.frame()); await sleep(40); }
    times.sort((a, b) => a - b);
    const p50 = times[10];
    assert(p50 <= LATENCY_BUDGET_MS, `median ${p50.toFixed(0)} ms exceeds ${LATENCY_BUDGET_MS} ms`);
    return `median ${p50.toFixed(0)} ms, p95 ${times[18].toFixed(0)} ms`;
  } finally { s.close(); }
});

await check('backend answers every frame, even back to back', async () => {
  // Regression: the server used to drop fast frames silently, and the page then waited forever.
  const s = await openSocket();
  try {
    await s.frame(10000);
    for (let i = 0; i < 15; i++) await s.frame(2000); // no pacing; each must be answered
    return '15/15 answered';
  } finally { s.close(); }
});

await check('player.create works (SMOKE_WRITE=1)', async () => {
  if (!WRITE) throw new Skip('skipped: writes a record; set SMOKE_WRITE=1');
  const r = await fetch(`${BASE}/api/trpc/player.create?batch=1`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ 0: { json: { name: 'SMOKE TEST', score: 0, avgReactionTime: 0, mistakesMade: 0, correctHits: 0 } } }),
  });
  const j = await r.json();
  const id = j?.[0]?.result?.data?.json?.id;
  assert(id, `no player id in response: ${JSON.stringify(j).slice(0, 120)}`);
  return `created ${id}`;
});

await check('browser game: camera goes live, frames flow, rounds do not reconnect', async () => {
  if (BROWSER === '0') throw new Skip('skipped: SMOKE_BROWSER=0');
  return withChrome(async ({ send, evaluate, events }) => {
    await send('Runtime.enable'); await send('Page.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: `
      window.__s = { opens: 0, sends: 0, msgs: 0 };
      const OW = window.WebSocket;
      window.WebSocket = function (u, p) {
        const w = new OW(u, p);
        if (String(u).includes('/ws/predict')) {
          __s.opens++;
          const s = w.send.bind(w); w.send = (d) => { __s.sends++; s(d); };
          w.addEventListener('message', (e) => { try { if (JSON.parse(e.data).letter !== undefined) __s.msgs++; } catch {} });
        }
        return w;
      };
      window.WebSocket.prototype = OW.prototype;
      Object.assign(window.WebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 });` });
    await send('Page.navigate', { url: `${BASE}/whack` });

    await waitFor(() => evaluate(`!![...document.querySelectorAll('button')].find(b => /start challenge/i.test(b.textContent))`), 45000, 'the Start button');
    // The button is server-rendered before React hydrates, so an early click is lost: click until the game starts.
    await waitFor(async () => {
      await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(b => /start challenge/i.test(b.textContent)); if (b) b.click(); })()`);
      await sleep(1000);
      return evaluate(`document.body.innerText.includes('TIMER')`);
    }, 45000, 'the game to start after clicking Start');
    try {
      await waitFor(() => evaluate(`document.body.innerText.includes('LIVE')`), 45000, 'the camera feed to go LIVE');
    } catch (err) {
      const text = String(await evaluate(`document.body.innerText.replace(/\\s+/g, ' ').slice(0, 220)`));
      const errs = events.filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
        .map((e) => e.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 120)).slice(0, 3);
      throw new Error(`${err.message}. Page shows: "${text}". Console errors: ${JSON.stringify(errs)}`);
    }

    // Play several rounds with the keyboard fallback, which forces cooldown -> playing transitions.
    let hits = 0;
    for (let round = 0; round < 4; round++) {
      const letter = await waitFor(() => evaluate(`(document.body.innerText.match(/FIND\\s+([A-Z])/) || [])[1] || ''`), 15000, 'a target letter');
      await evaluate(`window.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(letter.toLowerCase())} }))`);
      hits++;
      await sleep(1800); // 1 s cooldown + next target
    }
    const s = await evaluate('window.__s');
    const consoleErrors = events
      .filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
      .map((e) => e.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 160));
    const exceptions = events.filter((e) => e.method === 'Runtime.exceptionThrown').length;

    assert(s.opens === 1, `opened ${s.opens} detection sockets over ${hits} rounds (expected 1; it reconnects every round)`);
    assert(s.sends >= 10, `only ${s.sends} frames sent to the backend`);
    assert(s.msgs >= 10, `only ${s.msgs} replies received (sent ${s.sends})`);
    assert(consoleErrors.length === 0, `console errors: ${consoleErrors.slice(0, 3).join(' | ')}`);
    assert(exceptions === 0, `${exceptions} uncaught page exceptions`);
    return `${hits} rounds, 1 socket, ${s.sends} frames sent, ${s.msgs} replies, 0 console errors`;
  });
});

const failed = results.filter((r) => r.status === 'FAIL');
const passed = results.filter((r) => r.status === 'PASS').length;
const skipped = results.filter((r) => r.status === 'SKIP').length;
console.log(`\n${passed} passed, ${failed.length} failed, ${skipped} skipped`);
process.exit(failed.length ? 1 : 0);
