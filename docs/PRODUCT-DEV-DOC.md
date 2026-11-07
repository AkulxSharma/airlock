# Airlock: Product and Software Development Document (UB Hacking 2026)

Draft of 2026-11-07. This is the product-level document. It does not repeat the step-by-step commands in `docs/START_HERE.md` or the ranked task list in `docs/BUILD_PLAN.md`; it says what we are building, why, and which decisions are fixed. If this document disagrees with `CLAUDE.md` or the locked contract in `docs/PLAN.md`, those win.

## 1. Context

- Event: UB Hacking 2026, a 24-hour hackathon at the University at Buffalo, November 7 to 8. Theme: deep space.
- Team: Akul Sharma (backend) and Muhammad Abdullah (GUI, voice, demo polish).
- Product: Airlock is a voice and iMessage agent that checks a crypto transaction before it goes out. Nothing leaves until the check clears.
- Target prizes, in order of fit: Best AI/ML, Best General Hack, Best UI/UX, Spirit of the Hackathon (space theme through naming and visual design), Most Over Engineered, MLH Best Use of Gemini API, MLH Best Use of ElevenLabs. Optional if cheap: MLH Vultr (host the backend there) and the GoDaddy Registry domain prize. Not targeted: Solana (the chain is Ethereum Sepolia), Best Hardware, and the Radial Atoms track (it needs a physical-world link and bars prebuilt projects).
- Not verified: UB's overall rules, and whether other tracks bar pre-existing ideas. We treat the rule as "all code is written at the event" and disclose everything else.
- Origin and disclosure: the idea comes from Pyra (NexHacks 2026) and Warden (Night Hack, 2026-10-30), both Akul's. No code from either is reused. The planning documents in `docs/` pre-date kickoff. All application code is written at the event. Libraries, public models and APIs are normal dependencies. The GUI's look may take inspiration from Otto, a friend's project; any code taken from it will be listed in the README.

## 2. Product behavior

A user speaks or types in the GUI, or texts the iMessage line: "send 0.01 to vitalik.eth". Airlock resolves the name, screens the destination, and shows the audit stages live. A rule in plain code decides the outcome. HIGH risk, an auditor error, or a timeout means refuse. LOW or MEDIUM means Airlock asks the user to say or type YES within 60 seconds. After YES, it sends a Sepolia test-ETH transfer and replies with the transaction hash. In the GUI the reply is also spoken by ElevenLabs.

Wording rules: "risk signal, not a guarantee". Airlock never says an address is "safe", "secure" or "trusted". The language model never decides whether money moves.

Scope: Ethereum Sepolia testnet (chain id 11155111), test ETH only, per-transfer cap 0.01 ETH, one pending transfer per session. Out of scope: mainnet, real money, non-EVM chains, group chats.

## 3. Architecture

The pipeline diagram is in `docs/PLAN.md`. In short: three doors (GUI voice, GUI text, iMessage) feed one input router, which calls one handler behind `POST /api/message`. The handler resolves the target, audits it, and passes the result to the risk gate. Replies come back through the same handler, and live stages stream out of `GET /api/stream`.

Design principle (from `BUILD_PLAN.md`): build the room once and add the doors after. The whole flow works from a terminal with a rule-based parser and no LLM. Gemini is a swap-in behind the same `Agent` interface, and the parser remains the fallback.

## 4. Components and owners

| Component | What it does | Owner |
|---|---|---|
| Auditor | Bytecode checks (selfdestruct, delegatecall, callcode, minimal proxy, upgradeable proxy, tiny code, no code), later heuristic source checks. Our own code, no scanner API. | Akul |
| Risk gate | Pure `decide()` function plus a confirm store with expiry. HIGH, error, malformed or timeout refuses. | Akul |
| Address resolve | Plain address validation and ENS lookup. A failed lookup is an error, which the gate refuses. | Akul |
| Wallet and send | Gated testnet send. Chain allowlist, cap enforced a second time before signing. Callable only from the YES handler. | Akul |
| API | `POST /api/message`, `GET /api/stream` (server-sent events), sessions. | Akul |
| Gemini agent | Gemini 2.5 Flash function calling for intent. Reply builder sees only the findings and may cite only ids present; a code post-check swaps in a template reply if it does not. | Akul |
| iMessage bridge | Mac process that reads incoming texts and replies through Messages, with an allowlist and a stored last-message id so restarts do not replay old texts. | Akul |
| GUI | Demo GUI first (one plain page), polished deep-space GUI last, built from Muhammad's example. | Muhammad |
| Voice | ElevenLabs speech-to-text in, text-to-speech out, key kept server-side. | Muhammad |
| Demo and submission | Demo targets, script, recording, Devpost writeup with the disclosure. | Both |

## 5. Locked contract

- Auditor JSON: `{target, chainId, verdict: LOW|MEDIUM|HIGH, riskScore, findings[{id, severity, message}]}`.
- `POST /api/message`: `{sessionId, channel, text}` in, `{reply, stages[], needsConfirm}` out.
- `GET /api/stream`: audit stages as they complete (address, bytecode, source, gate).
- Shared types live in one file (`server/src/types.ts`), imported by the server and later the GUI.

## 6. Default numbers (taken from BUILD_PLAN.md, configurable in `.env`)

- Score weights: high 40, medium 20, low 5, capped at 100. Verdict: any high finding forces HIGH; otherwise below 30 is LOW, 30 to 69 MEDIUM, 70 or more HIGH.
- Audit timeout 10 seconds. Confirmation expiry 60 seconds, valid once, only for the same session and transfer id.
- Cap 0.01 test ETH. Allowed chain 11155111 only.

## 7. Decisions reconciled with BUILD_PLAN.md

An earlier draft of this document used different numbers and a Python backend. To avoid two plans, this version adopts Muhammad's proposals: TypeScript on Node with Hono, viem, zod and vitest; 60-second confirmation; the score weights above; and fetching verified source from a public registry such as Sourcify for the source checks. These are still proposals until the two of us confirm them in one message at the start of step 0.

## 8. Order of work

Follow `docs/START_HERE.md` (steps 0 to 12) and tick the progress list as steps finish. The ranking, with reasons, is in `docs/BUILD_PLAN.md`. Cut order if time runs short: transaction simulation first, then iMessage voice notes, then dashboard extras. Never cut the gate, the auditor or the GUI voice flow.

One timing risk to watch: the GUI starts after the backend, which leaves less time for UI polish. Mock endpoints early (or the demo GUI at rank 10) shorten that wait.

## 9. Needed from people

- Gemini key: now exists. It was added to Akul's local `.env`; this answers the open question in `START_HERE.md`.
- ElevenLabs key: Muhammad.
- Sepolia test ETH for the agent wallet and for deploying demo contracts: Akul, from a faucet.
- GUI example and design direction: Muhammad, when he starts the GUI.
- Demo targets deployed on Sepolia: a draining contract, a clean address, a proxy.
- A Mac signed into Messages and kept awake for the iMessage bridge.
- Kickoff time and the prize tracks and rules to add to `CLAUDE.md`: Muhammad.

## 10. Risks and honest limits

- Static analysis misses things. A clean result is a risk signal, not a guarantee, and the product says so everywhere.
- The model could phrase something unsupported. Mitigation: findings-only reply builder plus the code post-check.
- iMessage depends on one Mac staying awake and signed in. Mitigation: it is built late and the GUI is the primary demo path.
- Live demo risk (RPC, faucet, API quotas, wifi). Mitigation: fixture-based tests, a fallback RPC, cached demo results, and a recorded backup demo.
- Testnet wallet drain. Mitigation: small balance, cap enforced in the gate path and again in the wallet.
- Rules risk: if UB bars pre-existing ideas, we rely on the disclosure above, with everything rebuilt from an empty repo and no copied code.
- API keys appear in chat transcripts. Rotate the Gemini key after the hackathon.

## 11. Verification

The backend is done when the eight checks in `BUILD_PLAN.md` section 7 pass from a terminal. In addition: every reply template is scanned for banned words ("safe", "secure", "trusted"); a fake model that invents a finding id gets the template fallback; and before submitting, confirm `.env` is not in git, the README disclosure is accurate, the demo video is recorded and the Devpost entry is submitted before the deadline.

## 12. Open questions

- Confirm the stack (TypeScript, Hono, viem, vitest) between both of us.
- Confirm that fetching verified source text from a public registry fits "our own analysis, no third-party scanner".
- Kickoff time, the prize tracks and UB's overall rules, from Muhammad.
