# Airlock vocabulary: the words it should understand

One list, in `voice/vocabulary.ts`, used three ways. It only ever helps Airlock **understand** a request. A send still needs the audit, the gate and a YES within the expiry, so no word on this list can move money by itself.

## 1. Transcription keyterms (what the speech engine should spell right)

`voice/transcribe.ts` sends these to ElevenLabs Scribe with every request (the `keyterms` API option, model `scribe_v2`), so rare words come out correctly: Airlock, Hey Airlock, vitalik, Sepolia, testnet, ETH, ENS, gwei, wei, Etherscan, Sourcify, selfdestruct, delegatecall, callcode, bytecode, reentrancy, honeypot, upgradeable, proxy, blacklist, tx origin, minimal proxy, unverified, mainnet, faucet, nonce. The API accepts about 48; keep the list short and plain text. The GUI cannot import a relative file, so a copy lives in `transcribe.ts`, and a test checks the two lists are identical.

## 2. Synonym mapping (what the strict parser receives)

The rule parser (`server/src/agent/parse.ts`) only understands `send <amount> [eth] to <name>`, `yes` and `no`. `canonicalizeCommand` in `voice/normalize.ts` runs at the end of `normalizeTranscript`, so every voice request is rewritten into those forms first:

| People say | Parser receives |
|---|---|
| pay, transfer, wire, move, give, ship, forward, shoot over, send over, tip (followed by an amount) | `send` |
| ether, ethereum, test eth, test ether, sepolia eth (after an amount) | `eth` |
| over to, into, towards (after the amount) | `to` |
| could you / can you / please / I want to / I'd like to / let's / go ahead and, at the start | removed |
| point zero one (no whole number) | `0.01` |
| yes, yep, yeah, yup, confirm, confirmed, approve, proceed, go ahead, affirmative, yes please (the whole message) | `yes` |
| no, nope, nah, cancel, cancel that, stop, abort, never mind, forget it, don't, hold on, wait, halt (the whole message) | `no` |

**Deliberately not YES:** ok, okay, sure, fine, alright, uh huh, do it, send it. They are too easy to say in passing, so a stray "okay" must never send funds. While a transfer is waiting, "ok" gets the reply "That isn't a YES, so nothing has been sent". Cancel words are broad on purpose, because a wrong match only cancels.

Rules that keep this safe (all tested in `voice/vocabulary.test.ts` and `server/test/vocabulary-parse.test.ts`): a send verb is only rewritten when an amount follows and only at the start of the message; a confirm or cancel word inside a longer request changes nothing (`send 0.01 to confirm.eth` stays as it is); an address spoken by voice is still blocked by the address guard.

## 3. The Gemini prompt

`transferVocabularyForPrompt()` is appended to Gemini's intent prompt in `server/src/agent/gemini.ts`: the send verbs, the coin words, the "to" words and the polite openers, so loosely worded requests match. Gemini still only prepares a request, the amount and destination must still appear literally in what the user typed, and YES and NO never reach the model, so those words are not in its prompt. `vocabularyForPrompt()` is the full version, kept for future use.

## Small talk is separate

Greetings, "how are you", "what does it do", "is it safe", thanks and goodbye are answered from `server/src/agent/smalltalk.json` with no model call. See `CLAUDE.md`.

## Known gap (for Akul)

The synonym mapping runs on the **voice** path. Typed GUI messages and iMessage texts still go to the strict parser unchanged, so "pay 0.01 ether to vitalik.eth" typed works only if Gemini is on. Applying `canonicalizeCommand` there too is item 9 in `docs/ISSUES_FOR_AKUL.md`; it needs care so a mixed-case address keeps its checksum casing.
