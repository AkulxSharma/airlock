# Open issues for Akul and Akul's Claude

Found on 2026-11-07 by Muhammad's Claude while reading all of the backend logic (`server/src/`). Everything in the backend works and its tests pass; these are weak spots, ranked, each with where it is, why it matters, how to fix it, and when it is done. You own the backend, so these are yours. Tick a box and add the commit hash when one is fixed. Pull and merge before every push.

Reading order for the rule that matters most: `server/src/gate/decide.ts` and `server/src/gate/confirm.ts` are solid. Nothing below lets money move without a YES.

## 1. Gemini's "literal text" check is a substring match (fix first)

- [ ] Fixed

**Where:** `server/src/agent/gemini.ts`, in `createGeminiAgent`, the lines that do `lower.includes(amountEth.toLowerCase())` and `lower.includes(target.toLowerCase())`.

**Problem:** the amount and destination the model returns only have to appear somewhere inside what the user typed. So an amount of `0.01` passes when the user typed `0.015` or `10.01`, and a target of `vitalik.eth` passes when the user typed `vitalik.eth.evil.example`. The user still sees the amount and the full address on the confirm card before YES, so this is not a loss of funds, but the comment in that file promises the values are "literal".

**Fix:** match whole tokens. Require that the amount is not preceded or followed by a digit or a dot (for example a regex with lookarounds around the escaped value), and that the target is not followed by another name character. Compare 0x addresses exactly (case-insensitive).

**Done when:** new tests in `server/test/gemini.test.ts` show that `0.01` is rejected inside `0.015` and `10.01`, `vitalik.eth` is rejected inside `vitalik.eth.evil.example`, and exact matches still pass.

## 2. The gate does not check the chain or the target

- [ ] Fixed

**Where:** `server/src/gate/decide.ts`.

**Problem:** `decide()` accepts any well-formed audit result, including one with a `chainId` other than Sepolia (11155111), or one whose `target` is a different address than the one the user asked about. The wallet does check the chain again before signing, so funds are safe today, but `docs/PLAN.md` says the gate and the wallet both enforce the chain, and the gate is the single rule meant to hold on its own.

**Fix:** refuse when `chainId !== 11155111`. Let the caller pass the expected address (the resolved one) and refuse when the result's `target` differs (compare lower-cased).

**Done when:** `server/test/` has gate tests for a wrong chain and a mismatched target, both returning `refuse`, and the existing rows still pass.

## 3. YES is handled in an order that hides the real reason

- [ ] Fixed

**Where:** `server/src/api/message.ts`, the `intent.kind === "yes"` branch.

**Problem:** it checks `deps.wallet` before it consumes the pending transfer. With no wallet configured, a YES answers "Sending is not set up on this server" even after the request has expired, and the pending transfer is left in the store. Seen while testing with a 4-second expiry.

**Fix:** peek and consume first, so an expired or missing request gets its own message, then check for the wallet. Decide whether a YES with no wallet should clear the pending transfer or keep it.

**Done when:** a test covers YES after expiry with no wallet (expects the expired message) and YES inside the window with no wallet (expects the "not set up" message).

## 4. Add a real "skipped" stage status

- [ ] Fixed

**Where:** `server/src/types.ts` (`StageSchema`) and the `emit` calls in `server/src/api/message.ts`.

**Problem:** the stage status is only `pending`, `done` or `error`, so a step that was skipped (for example source checks on a plain wallet) is sent as `done` with the detail `skipped (no contract code)`. The GUI had to read the detail text to avoid showing a green check for a step that never ran.

**Fix:** add `"skipped"` to the status enum and emit it for the skipped source stage. Tell Muhammad before merging so the GUI switches from reading detail text to the new status (`app/lib/stageTone.ts`).

**Done when:** the schema, the handler and its tests use `skipped`, and the GUI change is agreed.

## 5. Sessions and rate limits matter the moment this is not local-only

- [ ] Decided (fix, or write down that it stays local-only)

**Where:** `server/src/api/app.ts`, `server/src/gate/confirm.ts`.

**Problem:** the browser chooses its own `sessionId`, anyone who knows it can answer YES for that session, and `/api/message` and `/api/stream` have no rate limit and no cap on open streams. This is fine while the server listens on `127.0.0.1` with an Origin check. It stops being fine if you host it publicly (the Vultr prize idea in `docs/PRODUCT-DEV-DOC.md`).

**Fix if hosted:** issue the session id on the server (signed or random, stored with the user's channel), cap streams per session, and add a per-session request limit. If it stays local, add one line to the README saying so.

## 6. Source analysis is regex heuristics

- [ ] Documented

**Where:** `server/src/auditor/source.ts`.

**Problem:** the checks look at function names and patterns (`onlyOwner` plus the contract's whole balance, `tx.origin`, fee, pause and blacklist names). They are labelled "Heuristic", which is honest, but a renamed function, an assembly sweep or code split across files can slip past them.

**Fix:** no rewrite needed. Add a few tests that document known misses, and say in the Devpost writeup that source checks are heuristic and bytecode checks are the backbone.

## 7. ENS names resolve on mainnet but are audited and sent on Sepolia

- [ ] Documented

**Where:** `server/src/api/resolve.ts` and `server/src/index.ts` (ENS client uses mainnet, the audit and the wallet use Sepolia).

**Problem:** `vitalik.eth` resolves to a mainnet address, and the audit then reads that address on Sepolia, where it is usually a plain wallet with no code. A name that points to a contract on mainnet shows as "no contract code, looks like a normal wallet" on Sepolia. Test funds only, so no real harm, but it can mislead a viewer of the demo.

**Fix:** say it in the README, and use the `.demo` names for the draining-contract and proxy demos so the demo audits real Sepolia contracts.

## 8. Small process item: new packages break the other machine

- [ ] Fixed

**Problem:** when you added `@google/genai`, Muhammad's server crashed on startup with `ERR_MODULE_NOT_FOUND` until he ran `npm install` in `server/`.

**Fix:** either add a root script that installs `server/`, `voice/` and `app/` in one command (for example `npm run setup`), or add one line to `CLAUDE.md` saying "after you pull, run `npm install` in each folder whose `package.json` changed".

## Already fixed, for reference

- `.env.example` pointed at `rpc.sepolia.org`, which is dead; it now uses publicnode with a 1rpc fallback.
- The Next.js GUI had public voice routes; they are now local-only (`app/lib/sameOrigin.ts`).
- You added `audit` and `pending` to the `/api/message` response. The GUI now reads them first (`app/lib/parseReply.ts`, `parseResponse`) and only falls back to parsing the reply text when they are missing, so keep those two fields stable and message Muhammad before changing their shape. The countdown uses `pending.expiresAt`.
