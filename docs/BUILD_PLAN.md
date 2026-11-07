# Airlock: build plan (ranked, with reasons)

Status: proposal written 2026-11-07 for Muhammad and Akul to confirm. It extends `docs/PLAN.md` (pipeline and locked API contract) and `docs/TASKS.md` (who does what). It does not replace them. If this file and `PLAN.md` disagree on the API contract, `PLAN.md` wins.

Companion file: `docs/START_HERE.md` has the exact step-by-step commands. Read this file for the why, that one for the how.

## 1. The rule that orders everything

Backend first. The GUI starts only after the backend works end to end from a terminal. A demo GUI comes right after (a plain single page, enough to use and record), and the polished GUI is last.

Why this order is the most efficient:

- The product is the safety decision, not the screen. The risk gate and the auditor are the parts judges can test and the parts that must never be wrong. Everything else only shows or voices their output.
- The GUI, voice and iMessage are only different doors into the same `POST /api/message`. Build the room once, add the doors after.
- Every backend piece can be tested with plain scripts and unit tests, so bugs are found cheaply, before any UI hides them.
- We currently have no Gemini key. Ordering the work so the first working version needs no LLM removes that blocker.

## 2. Ranking: what to build, in order

Rank is decided by two questions: does something else depend on it, and does the demo fail without it. "Owner" is the default from `docs/TASKS.md`; pairing is fine, but tell the other person first so we do not both build the same file.

| Rank | Task | Depends on | Owner (default) | Why it is here |
|---|---|---|---|---|
| 0 | Foundations: stack, `server/` skeleton, shared types, `.env.example`, test runner | nothing | Akul | Every later task imports the shared types. Cheap, and it removes arguments later. |
| 1 | Auditor: bytecode checks, risk score, findings | 0 | Akul | The core of the product. The gate, the API and the reply all consume its JSON. |
| 2 | Risk gate: pure decision function, confirm store with expiry | 0 (types only) | Akul | Can be built in parallel with rank 1 against fixture JSON. It is the safety guarantee, so it gets the most tests. |
| 3 | Address resolve (ENS and plain address checks) | 0 | Akul | Small. The auditor needs a real `0x` address before it can run. |
| 4 | Testnet send with per-transfer cap | 2 | Akul | Last step of a transfer. Must be reachable only through the gate, never directly. |
| 5 | API: `POST /api/message`, `GET /api/stream`, sessions, rule-based command parser (no LLM) | 1, 2, 3, 4 | Akul | First moment the whole flow works end to end, with no Gemini key needed. |
| 6 | Gemini agent: intent and function calling, reply builder that may cite only findings | 5, Gemini key | Akul | Replaces the rule-based parser with natural language. The parser stays as the fallback. |
| 7 | Source checks in the auditor (verified source, heuristic) | 1 | Akul | Raises audit quality. Not needed for the first end-to-end run, so it comes after the API works. |
| 8 | Demo targets on testnet: a draining contract, a clean address, a proxy | 1 | together | Without real targets there is nothing to demo. Needed before recording. |
| 9 | iMessage bridge | 5 | Akul | A second door. Needs a Mac that stays awake. Can run in parallel with 10 and 11. |
| 10 | Demo GUI: one plain page, input, verdict card, live log | 5 | Muhammad | Quick, throwaway-quality, but lets us see and record the flow. |
| 11 | Voice: ElevenLabs speech-to-text in, text-to-speech out | 10, ElevenLabs key | Muhammad | A layer on the GUI. Prize track relevance. |
| 12 | Real GUI (polish, deep-space look, Muhammad's example design) | 10 | Muhammad | Only after the backend is done. |
| 13 | End-to-end tests (voice, GUI text, iMessage), demo script, recording, Devpost | all | together | Final stretch. |
| cut | Fork simulation of the transaction | 5 | Akul | First thing to drop if time runs short (see `PLAN.md`). |

Never cut: the risk gate, the auditor, the GUI voice flow.

## 3. Why each design choice is the efficient one

### Build the pipeline without the LLM first (rank 5 before rank 6)
The gate and auditor are deterministic code. The agent only turns words into a tool call and turns findings into a sentence. If the first version uses a simple parser (`send 0.01 to vitalik.eth`), then:
- we have a working demo even if the Gemini key, quota or network fails during the event;
- the safety path is tested without any model in the loop, which proves the claim "the LLM never decides whether money moves";
- Gemini is a swap-in later, behind the same function signature.

### The gate is a pure function plus a small store
`decide(auditorResult) -> {action: "refuse" | "confirm", reason}` has no I/O and no clock, so it is trivial to test for every input. The confirm store holds one pending transfer per session with an expiry time and is the only thing the YES handler can read. Splitting these two means the important rule (HIGH, error or timeout means refuse) fits in about 15 lines that anyone can review in one minute.

### One shared type file is the contract
`server/types.ts` holds the auditor JSON shape and the API shapes from `PLAN.md`. Both the server and (later) the GUI import it. A change there is a deliberate, visible change, which is what "locked contract" needs in practice.

### Server-Sent Events for `/api/stream`
`GET /api/stream` is one-way server to browser, which is exactly what SSE does. It needs no extra library, works through the browser's built-in `EventSource`, and is easy to read with `curl`. WebSockets would add code for no benefit.

### Fixtures before real chain calls
The auditor takes bytecode as a plain hex string. Tests feed it saved bytecode samples (proxy, selfdestruct, clean). Live RPC calls are only a thin wrapper around it. This keeps tests fast, offline and repeatable during the event, and the hackathon wifi cannot break them.

### Testnet only, enforced in code
The chain id is checked against an allowlist (Sepolia `11155111`) in the wallet module and in the gate. The cap is read from `.env`. This is a second, independent lock behind the rules in the README.

## 4. Proposed technical decisions (confirm or change at kickoff)

These are proposals because `PLAN.md` says the stack can change. The first person to start rank 0 should confirm them with the other in one message.

- Language: TypeScript on Node 22 or newer. The GUI is Next.js (TypeScript), so types are shared and there is only one language to learn.
- Server framework: Hono with `@hono/node-server`. It is small, has SSE helpers and needs no setup.
- Chain access: `viem` (ENS, `getCode`, `getStorageAt`, wallet client).
- Validation: `zod` for request bodies and for the auditor JSON.
- Tests: `vitest`.
- LLM client: `@google/genai` for Gemini 2.5 Flash (added at rank 6).
- Layout: `server/` has its own `package.json`; `app/` (GUI, later) has its own. No monorepo tooling.
- Secrets: `.env` only, never committed. `.env.example` lists every variable with a fake value.

## 5. Default rules and numbers (proposals, all configurable through `.env`)

- Verdict from score: riskScore 0 to 100. Below 30 is LOW, 30 to 69 is MEDIUM, 70 or more is HIGH. Any single finding with severity `high` forces HIGH regardless of score.
- Gate: HIGH refuses. Auditor error, invalid JSON or timeout refuses. LOW or MEDIUM asks for YES.
- Audit timeout: 10 seconds.
- Confirmation expiry: 60 seconds. A YES counts only for the same session, the same pending transfer id, and only once.
- Transfer cap: 0.01 test ETH per transfer. Anything above is refused by the wallet module before it signs.
- Allowed chains: `11155111` (Sepolia) only.
- Wording: replies say "risk signal, not a guarantee". Never "safe", "secure" or "trusted".

## 6. First auditor checks (rank 1) and source checks (rank 7)

Bytecode checks, each one a finding with a stable `id`, a severity and a plain message:

| id | What it looks for | Severity |
|---|---|---|
| `no-code` | Address has no contract code (a normal wallet). Informational, not a risk by itself. | low |
| `selfdestruct` | SELFDESTRUCT opcode (`0xff`) reachable in the code. | high |
| `delegatecall` | DELEGATECALL opcode (`0xf4`) present. | medium |
| `callcode` | CALLCODE opcode (`0xf2`) present (legacy, rarely legitimate). | medium |
| `minimal-proxy` | EIP-1167 clone prefix. The real logic lives somewhere else, so this code alone proves nothing. | medium |
| `upgradeable-proxy` | A value in the EIP-1967 implementation or admin storage slot. Logic can be swapped later. | medium |
| `tiny-code` | Very short non-proxy runtime code. Often a stub. | low |

Opcode scanning must skip PUSH data bytes, otherwise data that happens to equal `0xff` gives false alarms. This is the most common bug in this kind of scanner, so it gets its own test.

Source checks (heuristic, run only when verified source is available from a public source registry such as Sourcify; fetching source is data lookup, not a third-party scanner): `tx.origin` used for authorization, an owner-only function that moves all funds, blacklist or pause switches, adjustable fee setters, hidden mint. Every one is labeled as a heuristic in its message. If no source exists, add the finding `unverified-source` (medium) and say so.

Open decision for Akul: confirm that using Sourcify (or similar) only to fetch source text still satisfies "our own code, no third-party scanner".

## 7. Definition of done for the backend

The backend is done when all of these are true, checked from a terminal with no GUI:

1. `npm test` in `server/` passes, including the gate tests for every row of the table in `START_HERE.md` step 4.
2. A POST to `/api/message` with "send 0.01 to <draining contract>" returns a refusal and `needsConfirm: false`.
3. The same request for the clean address returns `needsConfirm: true`, and a following "YES" within 60 seconds sends on testnet and returns a transaction hash.
4. A YES after 60 seconds, a second YES, and a YES from another session are all rejected.
5. A transfer above the cap is refused before signing.
6. `GET /api/stream` shows the stages (address, bytecode, source, gate) arriving one by one.
7. Killing the RPC mid-audit produces a refusal, not a crash and not an approval.
8. With the Gemini key set, free-form text works. With the key unset, the rule-based parser still works.

## 8. After the backend

- Demo GUI (rank 10): one plain page. Text box, send button, YES and NO buttons, a verdict card (LOW, MEDIUM, HIGH, score, findings list), and a log panel fed by `/api/stream`. No styling effort. It is for use and for recording a rough take, and it will be improved later.
- Voice (rank 11): hold-to-talk button sends audio to ElevenLabs speech-to-text, puts the text into the same message flow, and plays the reply through text-to-speech.
- Real GUI (rank 12): Muhammad's design example, deep-space look, built on the demo GUI's working data flow.
- Wrap-up (rank 13): end-to-end runs by voice, GUI text and iMessage, demo script, recording, Devpost writeup with the disclosure from the README.

## 9. Risks and what we do about them

| Risk | Mitigation |
|---|---|
| No Gemini key | Rule-based parser first (rank 5). Gemini is a swap-in. |
| Two people write the same module | `CLAUDE.md` says who owns what. Message first before touching the other person's folder. |
| Conflicting pushes to `main` | Pull and merge before every push, push after every change, never force-push. |
| Hackathon wifi or RPC failure | Fixture-based tests, a fallback RPC URL in `.env`, and a gate that refuses on error. |
| LLM invents a finding in the reply | Reply builder receives only the findings array and is told to cite only those ids. A test checks every cited id exists in the input. |
| Scope creep | Cut order in `PLAN.md`. Fork simulation goes first. |
