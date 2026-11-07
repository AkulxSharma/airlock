# Airlock: start here (step by step)

For any person or Claude session joining this repo. Read in this order: `CLAUDE.md` (team decisions), `README.md`, `docs/PLAN.md` (pipeline and locked contract), `docs/BUILD_PLAN.md` (ranked tasks and reasons), then this file (exact steps).

State when this file was written (2026-11-07): the repo has only docs. No application code exists yet. Update the "Progress" section at the bottom as steps finish, so the next session knows where to resume.

## Working rules (apply to every step)

1. Single `main` branch. Commit small. After every change: commit, `git pull` (merge any remote changes, resolve conflicts), then `git push origin main`. Never force-push.
2. Do not build someone else's area without messaging them first. Ownership is in `CLAUDE.md`.
3. Never commit secrets. Keys live in `.env` (git-ignored). Add new variables to `.env.example` with fake values.
4. The language model never decides whether money moves. Replies say "risk signal, not a guarantee", never "safe".
5. Testnet only (Sepolia, chain id `11155111`), with the per-transfer cap.
6. Each step ends with a check. Do not start the next step until the check passes.

Run all server commands from `server/`.

## Step 0: Foundations (rank 0)

Goal: a server folder that installs, type-checks and runs tests.

1. Create `server/` and inside it run:
   ```bash
   npm init -y
   npm i hono @hono/node-server viem zod dotenv
   npm i -D typescript tsx vitest @types/node
   ```
2. Add `server/tsconfig.json` with `"strict": true`, `"module": "NodeNext"`, `"moduleResolution": "NodeNext"`, `"target": "ES2022"`.
3. In `server/package.json` set `"type": "module"` and scripts: `"dev": "tsx watch src/index.ts"`, `"test": "vitest run"`, `"typecheck": "tsc --noEmit"`.
4. Create the folders from `PLAN.md`: `server/src/api`, `server/src/agent`, `server/src/auditor`, `server/src/gate`, `server/src/wallet`, `server/src/imessage`, plus `server/test/fixtures`.
5. Create `server/src/types.ts` with the shared contract (zod schemas plus inferred types):
   - `Finding = { id: string; severity: "low" | "medium" | "high"; message: string }`
   - `AuditResult = { target: string; chainId: number; verdict: "LOW" | "MEDIUM" | "HIGH"; riskScore: number; findings: Finding[] }`
   - `MessageRequest = { sessionId: string; channel: "gui" | "imessage" | "voice"; text: string }`
   - `MessageResponse = { reply: string; stages: Stage[]; needsConfirm: boolean }`
   - `Stage = { name: "address" | "bytecode" | "source" | "gate"; status: "pending" | "done" | "error"; detail?: string }`
6. Create `.env.example` at the repo root:
   ```
   RPC_URL_SEPOLIA=https://ethereum-sepolia-rpc.publicnode.com
   RPC_URL_SEPOLIA_FALLBACK=https://1rpc.io/sepolia
   PRIVATE_KEY_TESTNET=0x0000000000000000000000000000000000000000000000000000000000000000
   MAX_TRANSFER_ETH=0.01
   CONFIRM_TTL_SECONDS=60
   AUDIT_TIMEOUT_MS=10000
   GEMINI_API_KEY=
   ELEVENLABS_API_KEY=
   PORT=8787
   ```
7. Add a placeholder test `server/test/types.test.ts` that parses a sample `AuditResult` with zod.

Check: `npm run typecheck` and `npm test` both pass. Commit, pull, push.

## Step 1: Auditor, bytecode only (rank 1)

Goal: `auditBytecode(hex, target, chainId) -> AuditResult`, a pure function with no network calls.

1. Create `server/src/auditor/opcodes.ts`: walk the bytecode byte by byte. When you see `PUSH1` to `PUSH32` (`0x60` to `0x7f`), skip the next 1 to 32 data bytes. Collect the set of real opcodes seen.
2. Create `server/src/auditor/checks.ts` with one small function per check from the table in `BUILD_PLAN.md` section 6 (`selfdestruct`, `delegatecall`, `callcode`, `minimal-proxy`, `tiny-code`, `no-code`). Each returns a `Finding` or nothing.
3. Create `server/src/auditor/score.ts`: sum weights (high 40, medium 20, low 5, capped at 100). Verdict rules: any high finding forces `HIGH`; otherwise score below 30 is `LOW`, 30 to 69 is `MEDIUM`, 70 or more is `HIGH`.
4. Create `server/src/auditor/index.ts` exporting `auditBytecode`.
5. Save sample bytecode in `server/test/fixtures/` (a hex string per file): an empty `0x`, a minimal proxy (`363d3d373d3d3d363d73` prefix, an address, `5af43d82803e903d91602b57fd5bf3` suffix), a contract containing `0xff` as real code, and the same `0xff` byte inside PUSH data.
6. Write tests: the minimal proxy gives `minimal-proxy`; real `0xff` gives `selfdestruct`; `0xff` inside PUSH data gives no `selfdestruct`; empty code gives `no-code`; a high finding forces `HIGH` even with a low score.

Check: tests pass. The output validates against the `AuditResult` zod schema. Commit, pull, push.

## Step 2: Risk gate (rank 2, can run in parallel with step 1)

Goal: the safety rule as plain code. File: `server/src/gate/`.

1. `decide.ts`: `decide(input: AuditResult | { error: string } | { timeout: true }) -> { action: "refuse" | "confirm"; reason: string }`. No I/O, no clock.
2. `confirm.ts`: an in-memory store keyed by `sessionId` holding one pending transfer `{ id, to, amountEth, expiresAt }`. Functions: `create(session, transfer, now)`, `consume(session, id, now)`. `consume` succeeds once, only before `expiresAt`, only for the same session and id. Pass `now` in as an argument so tests do not need fake timers.
3. Tests, one per row:

| Input | Expected |
|---|---|
| verdict HIGH | refuse |
| verdict MEDIUM | confirm |
| verdict LOW | confirm |
| `{ error }` | refuse |
| `{ timeout: true }` | refuse |
| malformed object (fails zod) | refuse |
| YES within TTL, same session and id | accepted, once |
| second YES for the same transfer | rejected |
| YES after TTL | rejected |
| YES from a different session | rejected |
| YES with a different transfer id | rejected |

Check: all rows pass. Commit, pull, push.

## Step 3: Address resolve (rank 3)

1. `server/src/api/resolve.ts`: `resolveTarget(input, client)`. If input matches `^0x[0-9a-fA-F]{40}$`, validate the checksum with viem `isAddress`. If it ends in `.eth`, call viem `getEnsAddress` on a mainnet public client (ENS lives on mainnet even when sends go to Sepolia).
2. Return `{ address }` or `{ error }`. A failed lookup is an error, which the gate treats as refuse.
3. Tests with a fake client object: valid address, bad checksum, unknown ENS name.

Check: tests pass. Commit, pull, push.

## Step 4: Chain client and live audit wrapper

1. `server/src/auditor/chain.ts`: build a viem public client for Sepolia from `RPC_URL_SEPOLIA`, with the fallback URL as a second transport.
2. `auditAddress(address)`: fetch `getCode` and the EIP-1967 implementation slot (`0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`) with `getStorageAt`, wrap in a timeout from `AUDIT_TIMEOUT_MS`, then call `auditBytecode`. Add the `upgradeable-proxy` finding when the slot is non-zero.
3. Any thrown error or timeout returns `{ error }` or `{ timeout: true }`, never a verdict.

Check: a manual script prints an `AuditResult` for a known Sepolia address. Unplug the network: it prints an error object, not a crash. Commit, pull, push.

## Step 5: Testnet send with cap (rank 4)

1. `server/src/wallet/send.ts`: `sendTestnet({ to, amountEth })`. Before signing, refuse if chain is not `11155111`, if `amountEth` is not a positive number, or if it is above `MAX_TRANSFER_ETH`. Sign with `PRIVATE_KEY_TESTNET` using a viem wallet client and return the transaction hash.
2. Make it callable only from the YES handler (step 6) after `consume` succeeds. Do not export it from any route.
3. Tests with a fake wallet client: cap exceeded, zero amount, wrong chain, success.

Check: tests pass. Fund the test wallet from a Sepolia faucet, send a tiny amount by hand through a script, see it on a block explorer. Commit, pull, push.

## Step 6: API with rule-based parser (rank 5)

1. `server/src/agent/parse.ts`: a rule-based parser. Match `send <amount> [eth] to <address-or-ens>` and `yes` / `no`. Anything else returns a plain "I can check and send testnet transfers, try: send 0.01 to 0x..." reply. Define an interface `Agent { handle(text, session): Intent }` so Gemini can replace it in step 8.
2. `server/src/api/message.ts`, handler for `POST /api/message`: validate the body with zod, run parse, then for a send intent run resolve, audit, gate. If the gate says `confirm`, store the pending transfer and reply with `needsConfirm: true`. If `refuse`, reply with the reason and `needsConfirm: false`. On `yes`, call `consume`, then `sendTestnet`. On `no`, clear the pending transfer.
3. `server/src/api/stream.ts`, handler for `GET /api/stream?sessionId=...`: SSE. Emit one event per stage as it completes (`address`, `bytecode`, `source`, `gate`). Keep a per-session event emitter that the message handler publishes to.
4. `server/src/index.ts`: load `.env`, register both routes, listen on `PORT`.
5. Reply text is built from a fixed template plus the findings array. It must never contain the words "safe", "secure" or "trusted" (add a test that scans all reply templates).

Check, from a terminal:
```bash
curl -s localhost:8787/api/message -H 'content-type: application/json' \
  -d '{"sessionId":"s1","channel":"gui","text":"send 0.01 to 0x..."}'
curl -N "localhost:8787/api/stream?sessionId=s1"
```
Verify every item in the "Definition of done" list in `BUILD_PLAN.md` section 7 except items 1 and 8's Gemini half. Commit, pull, push.

## Step 7: Demo targets (rank 8)

1. Choose or deploy on Sepolia: a draining contract (contains `SELFDESTRUCT` or an owner-only sweep), a clean plain address, and a proxy. A tiny Solidity contract compiled with Foundry (`forge create`) or Remix is enough.
2. Record the three addresses in `docs/DEMO.md` with the expected verdict for each, and add them as fixtures.

Check: the auditor returns HIGH for the draining contract, a proxy finding for the proxy, and LOW for the clean address. Commit, pull, push.

## Step 8: Gemini agent (rank 6, needs `GEMINI_API_KEY`)

1. `server/src/agent/gemini.ts`: use `@google/genai` with model `gemini-2.5-flash` and function declarations `resolve_target`, `audit_contract`, `explain_findings`, `prepare_transfer`. The model only chooses intent and arguments. It has no tool that sends funds; sending happens only in the YES handler.
2. Reply builder: pass the model only the `findings` array and the gate decision. System prompt: cite only finding ids that are present, say "risk signal, not a guarantee", never say safe.
3. Post-check in code: scan the reply for finding ids and for banned words. If it cites an id that is not in the input, or contains a banned word, replace the reply with the template reply from step 6.
4. If `GEMINI_API_KEY` is empty or the call fails, fall back to the rule-based parser.

Check: with the key set, "yo can u send a bit of eth to vitalik.eth" is parsed to the right intent. A test with a fake model that invents a finding id gets the template fallback. Commit, pull, push.

## Step 9: Source checks (rank 7)

Add heuristic source checks from `BUILD_PLAN.md` section 6, with the `unverified-source` finding when no source is found. Add a `source` stage to the stream. Check: a fixture contract using `tx.origin` triggers its finding. Commit, pull, push.

## Step 10: iMessage bridge (rank 9)

Needs a Mac that stays awake with Messages signed in. `server/src/imessage/bridge.ts`: poll the Messages database or use an existing bridge, send each incoming text to the same handler as `POST /api/message` with `channel: "imessage"`, and send the reply back. Allowlist the phone numbers that may use it. Check: a text from the allowlisted number gets a reply; an unlisted number is ignored. Commit, pull, push.

## Step 11: Demo GUI, then voice, then real GUI (ranks 10 to 12)

Starts only after steps 0 to 8 pass. Muhammad shares his GUI example at this point.

1. Demo GUI in `app/` (Next.js): one page with a text input, YES and NO buttons, a verdict card (LOW, MEDIUM or HIGH, score, findings), and a log fed by `EventSource('/api/stream')`. Plain styling. Import the shared types.
2. Voice in `voice/`: ElevenLabs speech-to-text from the mic into the same message call, text-to-speech for replies. Keep the API key on the server side.
3. Real GUI: rebuild the look from the example, keeping the data flow of the demo GUI.

Check: a full transfer by typing, then by voice, works against the real server. Commit, pull, push.

## Step 12: Wrap-up (rank 13)

End-to-end runs by voice, GUI text and iMessage. Write the demo script in `docs/DEMO.md`. Record. Devpost writeup with the disclosure from the README. Check the prize list in `TASKS.md`. **Make the 2-minute-maximum submission video (slide-style, like a ppt) before submitting; the outline is in `CLAUDE.md`.**

## Progress

Update this list when a step finishes. Format: step, who, date, commit.

- [x] Step 0: Foundations (Muhammad, 2026-11-07)
- [x] Step 1: Auditor, bytecode (Akul, 2026-11-07, b79b28d)
- [x] Step 2: Risk gate (Akul, 2026-11-07)
- [x] Step 3: Address resolve (Akul, 2026-11-07)
- [x] Step 4: Chain client and live audit (Akul, 2026-11-07)
- [x] Step 5: Testnet send with cap (Akul, 2026-11-07)
- [x] Step 6: API with rule-based parser (Akul, 2026-11-07)
- [x] Step 7: Demo targets (Akul, 2026-11-07, docs/DEMO.md)
- [x] Step 8: Gemini agent (Akul, 2026-11-07)
- [x] Step 9: Source checks (Akul, 2026-11-07; Sourcify is used only to fetch source text, the analysis is our own code)
- [ ] Step 10: iMessage bridge (Akul: code and tests done (wake word, anyone can text, voice notes, spoken replies), see docs/IMESSAGE.md; live text, voice-note and spoken-reply checks still pending, need Full Disk Access on the demo Mac and the ElevenLabs key)
- [x] Step 11a: Demo GUI + voice routes (Muhammad, 2026-11-07, `app/`, Otto-style layout, light by default, inverted dark mode)
- [ ] Step 11b: Real GUI polish, landing view, demo-target buttons with real addresses
- [ ] Step 12: Wrap-up (includes the 2-minute submission video)

## Open questions

- Confirm the proposed stack (TypeScript, Hono, viem, vitest) between Muhammad and Akul.
- Confirm that fetching verified source text from a public registry fits "no third-party scanner".
- Who gets the Gemini key.
- Hackathon date and prize tracks (Muhammad is finding out).
