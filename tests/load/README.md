# Detection capacity test

`ws_load.py` simulates N players on the detection WebSocket (one frame in flight, up to 25 frames per second each, random but valid
hand landmarks so every frame costs the full path). Run `python tests/load/ws_load.py --help` for options; it needs `pip install websockets`.

```
python tests/load/ws_load.py --url ws://192.168.2.107:4001 --stages 1,5,10,25,50 --seconds 15
```

Read the **frames per second per player** and **p50/p95 latency** columns. A player needs roughly 10 frames per second for the 400 ms
sign hold to feel right, and replies slower than about 150 ms start to feel laggy. Real players with no hand in view cost the server
almost nothing, so this is a worst case.

## Results (2026-10-18)

Before the thread change (default torch/OpenCV threading):

| Server | Players | Total fps | Per player | p50 / p95 latency |
|---|---|---|---|---|
| Desktop RTX 5090 (local) | 10 | 171 | 17 | 47 / 78 ms |
| | 25 | 262 | 10.5 | 78 / 109 ms |
| | 50 | 305 | 6 | 140 / 171 ms |
| CT129 GTX 1070 (production, over the LAN) | 5 | 124 | 25 | 32 / 47 ms |
| | 10 | 157 | 16 | 62 / 78 ms |
| | 25 | 174 | 7 | 140 / 172 ms |
| | 50 | 178 | 3.6 | 328 / 360 ms |

What it means: throughput tops out at roughly 175 frames per second on CT129 regardless of how many players there are, so about
**10 players at once play smoothly**, 25 is playable but choppy, and 50 (the connection cap) is slow, though nothing fails: no refusals, drops or errors,
and the cap refuses the 51st socket cleanly.

The server was burning more than ten cores on the desktop (every library using one thread per core on 32 logical cores) for a modest result.
Pinning torch, OpenCV and BLAS to one thread each (`api_server_http.py`) gave, on the desktop: 25 players 262 to 349 fps (p50 78 to 62 ms) and 50 players 305 to 355 fps
(p50 140 to 110 ms). The CT129 numbers after the same change are recorded in `docs/notes/gtx1070-triton-setup.md`.

The remaining ceiling is the single asyncio loop doing frame preparation and the two model passes one batch at a time. If more than about 10
simultaneous players are expected, the next step is moving frame preparation off the loop (a thread or process pool); that is deliberately not done
without a measured need.
