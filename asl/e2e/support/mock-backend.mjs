// Stand-in for the GPU detection server, for the browser tests. It speaks the same protocol as
// api_server_http.py (ready message, one reply per frame, /concurrency_status, /healthz, ticket check)
// and can be steered by the tests over HTTP so every connection state is reproducible:
//
//   POST /__control  {"down":bool, "mute":bool, "forceLetter":"A"|null, "requireTicket":bool}
//   POST /__drop     closes every open socket (the browser should reconnect)
//   GET  /__state    counters: connections, framesReceived, rejected, lastTokenOk, ...
//   POST /__reset    back to defaults and zeroed counters
//
// "forceLetter" makes every reply a confident detection of that letter, which is how the tests
// exercise the "hold the sign for 400 ms" path without a real hand.
import { createServer } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";

const PORT = Number(process.env.MOCK_PORT ?? 4011);
const SECRET = process.env.DETECTION_TOKEN_SECRET ?? "";

const fresh = () => ({
  control: { down: false, mute: false, forceLetter: null, requireTicket: false },
  counters: { connections: 0, framesReceived: 0, rejected: 0, ticketsSeen: 0, ticketsValid: 0, openSockets: 0 },
});
let state = fresh();

function ticketValid(ticket) {
  if (!SECRET || !ticket) return false;
  const parts = ticket.split(".");
  if (parts.length !== 3) return false;
  const [expires, nonce, sig] = parts;
  if (!/^\d{1,12}$/.test(expires) || !/^[0-9a-f]{16}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  if (Number(expires) * 1000 < Date.now()) return false;
  const expected = createHmac("sha256", SECRET).update(`${expires}.${nonce}`).digest();
  const given = Buffer.from(sig, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*" });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });

const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  if (req.method === "OPTIONS") {
    res.writeHead(204, { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" });
    return res.end();
  }
  if (url.pathname === "/__control" && req.method === "POST") {
    state.control = { ...state.control, ...(await readBody(req)) };
    if (state.control.down) for (const c of wss.clients) c.terminate();
    return json(res, 200, state.control);
  }
  if (url.pathname === "/__drop" && req.method === "POST") {
    for (const c of wss.clients) c.terminate();
    return json(res, 200, { dropped: true });
  }
  if (url.pathname === "/__reset" && req.method === "POST") {
    for (const c of wss.clients) c.terminate();
    state = fresh();
    return json(res, 200, state);
  }
  if (url.pathname === "/__state") return json(res, 200, { ...state.control, ...state.counters });

  if (state.control.down) return json(res, 503, { status: "down" });
  if (url.pathname === "/concurrency_status") {
    return json(res, 200, { device: "cuda", queue_depth: 0, max_batch_size: 32, batch_stats: {}, mode: "mock" });
  }
  if (url.pathname === "/healthz") return json(res, 200, { status: "ok", device: "cuda", model_in_vram: true });
  if (url.pathname === "/") return json(res, 200, { message: "mock detection server" });
  return json(res, 404, { error: "not found" });
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  if (url.pathname !== "/ws/predict" || state.control.down) {
    state.counters.rejected += 1;
    socket.write("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n");
    return socket.destroy();
  }
  const token = url.searchParams.get("token");
  if (token) state.counters.ticketsSeen += 1;
  const ok = ticketValid(token);
  if (ok) state.counters.ticketsValid += 1;
  if (state.control.requireTicket && !ok) {
    state.counters.rejected += 1;
    socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return socket.destroy();
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

wss.on("connection", (ws) => {
  state.counters.connections += 1;
  state.counters.openSockets += 1;
  ws.on("close", () => (state.counters.openSockets -= 1));
  ws.send(JSON.stringify({ type: "ready", message: "mock detection server" }));
  ws.on("message", (raw) => {
    state.counters.framesReceived += 1;
    if (state.control.mute) return;
    let frame = {};
    try {
      frame = JSON.parse(String(raw));
    } catch {
      return;
    }
    const letter = state.control.forceLetter;
    ws.send(
      JSON.stringify({
        letter: letter ?? "None",
        confidence: letter ? 0.95 : 0,
        timestamp: Date.now() / 1000,
        clientTimestamp: frame.clientTimestamp ?? 0,
        handDetected: Boolean(letter),
      }),
    );
  });
});

server.listen(PORT, "127.0.0.1", () => console.log(`mock detection server on ${PORT}`));
