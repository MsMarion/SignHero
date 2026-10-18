# End-to-end test matrix

Every page and every interaction in the production build, the expected result, and the browser test that proves it.
The tests live in `asl/e2e/tests/*.spec.ts`; each test title starts with its ID. `pnpm e2e:matrix` (also run by CI) fails if a row here has
no test, or a test has no row.

How the suite works: `pnpm e2e:build` builds the site exactly as production does and points it at a **mock detection server**
(`asl/e2e/support/mock-backend.mjs`) and a throwaway database (`signhero_e2e`, wiped and seeded at the start of each run);
`pnpm e2e` drives real Chrome with a fake camera. The mock can be told to drop the connection, go down, require tickets, or report a
chosen letter, which is how every connection and camera state is reproduced. It needs a MongoDB replica set (the Docker one on port 4002
locally, a service container in CI). The full suite takes about 12 minutes because three tests play a real 30-second game; CI runs it as two parallel halves. Use Node 22 (or 20) to run it: Playwright 1.52 hangs while loading its configuration on the Node 24.21 that the other CI jobs use (it happens to work on Node 24.11 on a developer machine), so the CI job pins Node 22.

Legend: **page** = what the player sees; **API** = server behaviour the page depends on.

## Global chrome (every page)

| ID | Where | Interaction | Expected |
|---|---|---|---|
| G-01 | header | click the logo | goes to the home page |
| G-02 | header | click the music button, reload | setting flips and is remembered |
| G-03 | header | click the sound-effects button, reload | setting flips and is remembered |
| G-04 | header (guest) | click LOGIN | opens the sign-in page |
| G-05 | header (signed in) | click the player's name | opens the profile; LOGIN is gone |
| G-06 | header (signed in) | click sign out | header shows LOGIN again |
| G-07 | all pages | look at the header | no made-up level/XP badge |
| G-08 | navbar | next / previous | cycles Whack-A-Sign, official songs, community, both directions |
| G-09 | navbar | start a game | the navbar slides away |
| G-10 | any unknown address | open it | friendly 404 page with a way back to the game |
| G-11 | any page, signed in with no hero name | open it | sent to choose a hero name |
| G-12 | `/`, `/whack`, `/leaderboard`, `/auth/signin` | read the tab title | "SignHero" / "Whack-A-Sign \| SignHero" / ... |
| G-13 | navbar | look for a development tab | not offered in production |
| H-01 | home | open | name, tagline and the start button |
| H-02 | home | click START GAME | opens Whack-A-Sign (works with no songs) |

## Whack-A-Sign (`/whack`)

| ID | Where | Interaction | Expected |
|---|---|---|---|
| W-01 | lobby | open | explanation, hint text and START CHALLENGE |
| W-02 | lobby | start | 3-2-1 countdown, then 0:30 timer counting down and a target letter (A-Y, no J or Z) |
| W-03 | lobby | double-click start | exactly one game session is created |
| W-04 | game | press the target letter | +500 to 1000 points, one hit, "NEXT ROUND...", then a new target |
| W-05 | game | press a different letter | nothing happens |
| W-06 | game | click the target tile | scores |
| W-07 | game | click another tile | nothing happens |
| W-08 | game | hold the right sign to the camera (detection reports it) | scores after the 400 ms hold |
| W-21 | game | hold a wrong sign | does not score |
| W-09 | game | camera and detection server working | LIVE badge, "Connected", latency in ms, no console errors |
| W-10 | game | detection server goes down, then returns | OFFLINE and "Reconnecting...", keyboard does not score; after it returns play resumes |
| W-11 | game | connection dropped | reconnects by itself, game carries on |
| W-12 | game | camera permission refused | clear message; keyboard play still works |
| W-13 | game | no camera | clear message |
| W-14 | game | camera in use elsewhere | clear message |
| W-15 | lobby | game session cannot be created | player is told, button is available again |
| W-16 | whole game, guest | play 30 s | result saved by the server (finalized, hits and score correct, owner fields hidden), report shown as GUEST HERO, no console errors |
| W-17 | whole game, signed in | play 30 s | plays under the hero name, appears on the leaderboard as a member (no guest tag) |
| W-18 | whole game | saving the result fails | still reaches the leaderboard; report is empty |
| W-19 | game | tickets required by the detection server | page fetches a ticket, server accepts it, play works |
| W-20 | game | tickets required but the page has none | server refuses, page shows OFFLINE and keeps retrying |

## Leaderboard (`/leaderboard`)

| ID | Where | Interaction | Expected |
|---|---|---|---|
| L-01 | leaderboard | open with no game | top scores, best first, medals for 1-3, guest tag only for non-members, no REPORT button |
| L-02 | report | open with a game id | score, accuracy, reaction time, mistakes |
| L-03 | report | REPORT / LEADERBOARD buttons | switch the view |
| L-04 | report | game with no attempts | "NO ATTEMPTS RECORDED" |
| L-05 | report | hits and no mistakes | "FLAWLESS GAME" |
| L-06 | report | common mistakes | shown / expected / times listed |
| L-07 | report | unknown or malformed game id | "REPORT DATA NOT FOUND" and a button to the leaderboard |
| L-08 | leaderboard | home button | to the game when you came from one, otherwise home |
| L-09 | leaderboard | scores loading, then failing | LOADING..., then "could not load" with a working RETRY |

## Sign in, hero name, profile

| ID | Where | Interaction | Expected |
|---|---|---|---|
| A-01 | sign-in | open | email, password, ENTER GAME; no Google button when Google is not configured |
| A-02 | sign-in | toggle sign in / create account | headings and button change; old errors cleared |
| A-03 | sign-in | register a new account | signed in and sent to choose a hero name |
| A-04 | sign-in | register an existing e-mail | "Account with this email already exists" |
| A-05 | sign-in | password under 6 characters | refused |
| A-06 | sign-in | wrong password / unknown e-mail | same message for both |
| A-07 | sign-in | correct password, no hero name yet | sent to choose one |
| A-08 | sign-in | correct password, has a hero name | goes to the song list |
| A-09 | sign-in | many sign-up attempts from one address | "Too many requests" |
| N-01 | hero name | open while signed out | sent to sign in |
| N-02 | hero name | type | rules shown; too short / bad characters / reserved / profanity are explained; CONTINUE only when available; 16-character limit |
| N-03 | hero name | a taken name in any capitalisation | "already taken" |
| N-04 | hero name | CONTINUE, then BACK | confirmation says it is permanent; BACK returns to editing |
| N-05 | hero name | LOCK IT IN | saved; the player is no longer redirected to the name page |
| N-06 | hero name | someone takes the name before locking in | error shown, player can choose again |
| P-01 | profile | open while signed out | sent to sign in |
| P-02 | profile | open | e-mail and the hero name shown as locked |
| P-03 | profile | save the API key | success message; key is masked on return |
| P-04 | profile | save fails | the player is told |

## Songs (none exist in production yet)

| ID | Where | Interaction | Expected |
|---|---|---|---|
| S-01 | official songs | open | "No curated songs" empty state |
| S-02 | community | open | "No community songs" empty state |
| S-03 | song game | open an unknown song | "FAILED TO LOAD SONG" / "Song not found" |
| S-04 | training | open an unknown song | error page |
| S-05 | testing | open an unknown song | error page |
| S-06 | song game | open a malformed id | the same "not found", not an internal error |

## Closed in production

| ID | Where | Interaction | Expected |
|---|---|---|---|
| D-01 | `/devmode` | open | 404 |
| D-02 | `/api/youtube`, `transcribe`, `upload`, `songs` | any request | 404 |
| D-03 | `/preview`, `/effects-demo`, `/scripted-demo` | open | 404 |
| D-04 | `/game/training` | open | goes to `/whack` |
| D-05 | song creation API | call without signing in | 401 |
| D-06 | old score and mistake APIs | call | gone (404) |
| M-01 | `/api/media/...` | traversal, other folders, hidden files | 404 |
| M-02 | `/api/media/...` | POST | 405 |

## Health, error reports, debugging, tickets

| ID | Where | Interaction | Expected |
|---|---|---|---|
| O-01 | `/api/health` | GET | database ok, running commit, uptime, no-store |
| O-02 | `/api/health?deep=1` | GET | also the detection server (device) |
| O-03 | `/api/health?deep=1` | detection server down | 503 naming the failed check; the plain check stays 200 |
| O-04 | `/api/health` | many requests | rate limited |
| O-05 | `/api/client-error` | report / foreign origin / junk / empty / oversized | 204 / 403 / 400 / 400 / 413 |
| O-06 | any page | uncaught error | reported to the server, once |
| O-07 | any page | unhandled promise rejection | reported |
| O-08 | any page | open normally | no debug panel |
| O-09 | any page | `?debug=1` | panel with build, session, detection state, ticket, sockets, frames; remembered; `?debug=0` clears |
| O-10 | any page | Ctrl+Shift+D, close button | toggles / closes the panel |
| O-11 | any page | an error is reported | the panel counts it |
| T-01 | `/api/detection-token` | GET | signed ticket valid for about 60 s that the detection server accepts |
| T-02 | `/api/detection-token` | many requests | rate limited |
| T-03 | game | ticket endpoint failing, server not requiring tickets | game still plays |

## Not automated, and why

| ID | What | Why | How it is checked instead |
|---|---|---|---|
| X-01 | Google sign-in | needs a real Google account and consent screen | manual after any change to sign-in; the account-creation code is covered by `pnpm test:account` |
| X-02 | A real hand being recognised as the right letter | needs a person and the GPU model | manual with a webcam; the detection path is covered by W-08 with a controlled detection |
| X-03 | Song cards, audio preview, song games, score submission for songs | no songs exist yet (media ingestion is separate work) | pages' empty/error states are S-01..S-06 |
| X-04 | Media streaming from storage (Range requests) | needs MinIO | covered by `asl/tests/unit/media.test.ts` and manual check |
| X-05 | Phone and tablet layouts | the site is a fixed 1920x1080 stage scaled to the window | visual check |
