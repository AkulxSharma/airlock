# Airlock: GUI requirements

Owner: Muhammad. Compiled 2026-11-07 from `docs/TASKS.md`, `docs/PLAN.md`, `docs/PRODUCT-DEV-DOC.md`, the voice safety rules in `CLAUDE.md`, and the real API code in `server/src/api/`. If this file disagrees with `PLAN.md` on the API contract, `PLAN.md` wins.

Two stages: a plain **demo GUI** first (use it, record a rough take, find problems), then the **real GUI** (deep-space look from Muhammad's example). The demo GUI must work end to end before any polish.

## 1. What the real API gives the GUI today

Akul's server (port 8787 by default, health check at `GET /health`):

- `POST /api/message`, `Content-Type: application/json` is required (anything else gets HTTP 415). Body: `{ sessionId, channel: "gui" | "voice" | "imessage", text }`. Response: `{ reply, stages[], needsConfirm }`.
- `GET /api/stream?sessionId=...` is Server-Sent Events. It sends a `ready` event, then one `stage` event per audit stage. A stage is `{ name: "address" | "bytecode" | "source" | "gate", status: "pending" | "done" | "error", detail? }`.
- The `reply` is plain text. A confirm reply contains "Risk signal: LOW|MEDIUM (score N)", one line per finding, "To send: AMOUNT test ETH to ADDRESS", and the expiry in seconds. A sent reply ends with a Sepolia Etherscan link.
- Voice safety is already enforced server-side: with `channel: "voice"`, text that contains an address-like hex string is refused with a message asking for a pasted address or an ENS name.

## 2. Demo GUI: must-have list

Build these in order. Each one has a check.

1. **Session.** Create a random `sessionId` once, keep it in `localStorage`, and use the same id for `/api/message` and `/api/stream`. Check: reload the page and the id is the same.
2. **Chat panel.** Message history (you and Airlock), a text input, a send button, Enter to send. Typed messages use `channel: "gui"`. Check: "send 0.01 to vitalik.eth" shows a reply.
3. **Live stages.** Open `EventSource('/api/stream?sessionId=...')` before sending. Show four rows (address, bytecode, source, gate), each with pending, done or error and its detail text. Reset the rows at the start of each request. Check: rows change one by one while a request runs.
4. **Verdict card.** Shows LOW, MEDIUM or HIGH with a color badge, the risk score, and the findings list (id, severity, message). Also shows the full destination address and the amount. Until the API returns structured audit data (see section 6), parse the reply text. A refusal shows in red with the reason. The words "safe", "secure" and "trusted" never appear anywhere in the GUI, and the line "risk signal, not a guarantee" is always visible on the card.
5. **YES / NO buttons.** Visible only while `needsConfirm` is true. YES sends the text `yes`, NO sends `no`. Disable both after one is pressed, and show a countdown from the expiry in the reply (the server is the source of truth, so a late YES shows the server's "expired" reply). Check: YES after the expiry shows the expired message and sends nothing.
6. **Event log.** A timestamped list of every stage event and every message sent or received, newest at the bottom, scrollable.
7. **Result.** A sent transfer shows the Etherscan link as a clickable link and a clear "sent" state.
8. **Error states.** Server unreachable (check `/health` on load and show a banner), HTTP 400 or 415, network failure, and an SSE disconnect with automatic reconnect. Check: stop the server and the banner appears.
9. **Config.** The API address comes from `NEXT_PUBLIC_API_URL`, default `http://localhost:8787`. Check that the server allows requests from the GUI's origin (CORS), otherwise the browser blocks every call.

## 3. Voice (part of the demo GUI, uses the finished `voice/` helpers)

1. **Mic button, hold to talk.** Record with `MediaRecorder` (audio/webm), stop on release.
2. **Transcribe route.** A Next.js server route `/api/transcribe` takes the recording, calls `transcribe()` from `voice/transcribe.ts`, and returns the text. The ElevenLabs key stays on the server and never reaches the browser.
3. **Send as voice.** The transcript is sent with `channel: "voice"`, and the transcript is shown in the chat so the user can see what was heard. If the server refuses it (address by voice), show its reason.
4. **Speak replies.** A `/api/speak` server route calls `speak()` after the text goes through `toSpeakable()` from `voice/speakable.ts`. Daniel is the voice. Speak the verdict and the decision, not the whole findings list, and keep it under 1000 characters. Show a "speaking" state, and give a mute toggle.
5. **Rules that must hold:**
   - Voice never carries a destination address. The screen shows the full address and amount before YES, whatever channel the request came from.
   - Amounts are spoken digit by digit (done by `toSpeakable()`).
   - Check: say "send zero point zero one ETH to vitalik dot eth", see the transcript, see the verdict card, hear the reply, then click YES.

## 3a. Hands-free wake phrase ("Hey Airlock" or "Airlock")

- **Server and hold-to-talk:** a transcript that starts with "Hey Airlock", "Airlock", "Hi/Ok/Okay Airlock" (and spellings such as "air lock" or "Airlok") has that phrase removed before parsing, so "Hey Airlock, send 0.01 to vitalik.eth" means "send 0.01 to vitalik.eth". The code is `voice/wake.ts`, used by `normalizeTranscript()`. The address guard still runs on whatever follows.
- **Hands-free toggle (GUI, off by default):** the toggle in the voice panel starts the browser's built-in speech recognition (Chrome, Edge, Safari). It ignores everything until it hears the wake phrase, then sends the command that follows through the normal voice path. If you say only "Hey Airlock", it waits up to 8 seconds for the command. It pauses while Airlock is speaking or recording. The browser may send audio to its own speech service, so the toggle says so.
- **Unchanged safety:** commands from hands-free mode still pass the address guard and still need YES within the expiry. Every command needs the wake phrase, including "Hey Airlock, yes".

## 4. Real GUI (after the demo GUI works)

- Light theme by default, with dark mode as the same colours inverted (no decoration), modelled on Otto (a friend's project: Devpost `https://devpost.com/software/ntta`, GitHub `abrj7/otto`, built for NexHacks). Otto's frontend is Next.js 16, React 19, TypeScript, Tailwind CSS 4 and Lucide icons, with an editorial-style briefing screen, a collapsible sidebar, dark and light themes, and a mic button for voice. We use it as a **visual reference** and write our own code.
- A landing view, then the main screen. Verdict card, stage rows and event log restyled, with motion that fits the theme (the airlock idea: nothing passes until the check clears).
- Quick-start buttons for the three demo targets: a draining contract, a clean address, a proxy (addresses come from `docs/DEMO.md` when Akul deploys them).
- Responsive, readable on a projector, and keyboard friendly.
- Targets the UI/UX, Spirit of the Hackathon (space theme), ElevenLabs and Gemini prize tracks from `PRODUCT-DEV-DOC.md`.

## 5. Demo and submission (together with Akul)

- Demo script in `docs/DEMO.md`: one refused transfer (HIGH), one confirmed transfer (LOW), one proxy case, one voice run.
- Screen recording, with a backup recording in case the live demo fails.
- Devpost screenshots of the verdict card and live stages.

## 6. Things to ask Akul (backend is his)

1. **Structured audit data in the reply.** Add an optional `audit` object to the `/api/message` response (`{ target, chainId, verdict, riskScore, findings[] }`, the locked auditor shape), so the verdict card does not have to parse text. Optional, because the GUI can parse the text in the meantime.
2. **Pending transfer details.** Include `pending: { to, amountEth, expiresAt }` in the response when `needsConfirm` is true, so the GUI can show the countdown exactly.
3. **CORS.** Allow the GUI's origin (`http://localhost:3000` in development).

## 7. Open items

- GUI example and screenshots from Muhammad.
- Kickoff time and prize rules (Muhammad is finding out).
- Demo target addresses (Akul, `docs/DEMO.md`).
