# Airlock: team decisions (read this first)

> **Backend review (2026-11-07): all 8 issues from `docs/ISSUES_FOR_AKUL.md` are handled** (items 1 to 4 fixed in code with tests, 5 to 8 decided or documented in the README). The list stays in `docs/ISSUES_FOR_AKUL.md` with what changed.
>
> **Items 9 to 13 in `docs/ISSUES_FOR_AKUL.md` are fixed too** (synonyms on every channel, the explainer no longer sees contract text, permission wording is rejected, a confirm allowlist and a daily cap exist, and a spoken YES from the hands-free mic never confirms). That file lists the commit for each.

> **After you pull, run `npm run setup`** (installs `server/`, `voice/` and `app/`), or `npm install` in each folder whose `package.json` changed.

This file records decisions agreed between Muhammad and Akul on 2026-11-07. Claude sessions working in this repo should treat it as context. Update it when a decision changes.

## Where to start

- `docs/BUILD_PLAN.md`: ranked task list with the reasons for the order (backend first, GUI after).
- `docs/START_HERE.md`: exact step-by-step build instructions and a progress checklist. Resume from the first unchecked step, and tick steps off as they finish.

## Who builds what

- **Akul** owns the whole backend: contract auditor, risk gate, Gemini agent, iMessage bridge, testnet send, and the API (`POST /api/message`, `GET /api/stream`). This includes the mock versions of those two endpoints, so the GUI has something to talk to before the real server is done. See `docs/TASKS.md` for the full split.
- **Muhammad** owns the GUI (Next.js in `app/`: chat, voice button, verdict card, live log), the ElevenLabs STT/TTS work in `voice/`, and demo polish and recording.
- The demo GUI exists in `app/` (Next.js 16, Tailwind 4; Otto-style layout, light by default; dark mode is the same colours inverted, with no decoration; routes `/api/speak` and `/api/transcribe` call `voice/`). It belongs to Muhammad: do not edit `app/` without asking. Run it with `npm run dev` in `app/` and open `http://localhost:3000`. If something else already owns port 3000 (on Muhammad's Mac a Docker/Colima container does, bound to 127.0.0.1:3000, so the browser shows the wrong app), run `npm run dev -- -p 3100` instead and add `http://localhost:3100,http://127.0.0.1:3100` to `ALLOWED_ORIGINS` in the local `.env`, because the server's CORS only allows listed origins. The real GUI polish comes after the backend is done.
- Do not build another person's area without asking first. It causes merge conflicts.

## Keys

- **ElevenLabs:** Muhammad holds the key and will set it up.
- **Gemini:** nobody has a key yet. Akul needs to get one, since the Gemini agent is Akul's. Keys go in `.env` only and are never committed.

## Branches

- Use a single `main` branch. Both of us commit and merge into it. No long-lived feature branches.
- Commit small and often.
- **Push rule (applies to every Claude session and both people):** after every finished change, run `git commit`, then `git pull` (merge any remote changes and resolve conflicts), then `git push origin main`. Always pull and merge before pushing, never push without pulling first, and never force-push. If the pull is not a fast-forward, merge (or rebase only your own new commits onto `origin/main`) and check the result before pushing.
- **Auto-push:** Claude sessions in this repo push automatically after every change, without waiting to be asked and without asking for confirmation. Pushing to `main` of this repo is pre-approved by both owners. Do not leave finished work uncommitted or unpushed at the end of a turn.
- Push after every change, not in a batch at the end, so the other person's Claude always sees the latest state and does not build the same thing twice.
- Before starting a step, pull and read the progress list in `docs/START_HERE.md`. If the step is ticked or marked in progress, do not start it.

## Voice safety rules (found in live tests, see `voice/reports/`)

- **Never take a destination address from voice.** In live tests, speech-to-text turned a spoken address into a different but valid-looking address (1 of 3 runs). Better transcription cannot fix that.
- **Enforcement (Akul, API step):** when `channel` is `voice`, run the transcript through `guardVoiceInput()` from `voice/guard.ts` before parsing. If it returns `ok: false`, refuse to use the text, reply with its `reason`, and ask for a pasted address or an ENS name. ENS names such as `vitalik.eth` are fine by voice.
- **Normalize first:** run voice text through `normalizeTranscript()` from `voice/normalize.ts` before the command parser, so "zero point zero one ETH to vitalik dot eth" and "0.01 ETH to vitalik.eth" parse the same.
- **Speak replies with `toSpeakable()`** from `voice/speakable.ts`: it says only the start and end of an address, spells long numbers, and reads amounts digit by digit (0.005 can be heard as 0.05, which is 10 times off). The full address and exact amount always stay in the on-screen text.
- **Vocabulary and synonyms:** `voice/vocabulary.ts` lists every word Airlock should understand (see `docs/VOCABULARY.md`). On the voice path, "pay", "transfer", "go ahead", "never mind" and similar are mapped onto the commands the parser knows. "ok", "sure" and "do it" are deliberately NOT treated as YES. Scribe also gets keyterms (Airlock, Sepolia, ETH, ...) so those words are spelled right.
- **Always show the parsed amount and full destination on screen before YES**, whatever channel the command came from. The cap of 0.01 ETH is the second safety net for a misheard amount.

## Reminder: the submission video (do not forget)

When we upload the project to Devpost and submit, we must also make a **video of at most 2 minutes** that shows what we made, in the style of a short slide presentation (a "ppt"): a few clean slides with narration and screen recording. Check the exact length and format rules on the hackathon's Devpost page. Suggested outline, about 15 to 20 seconds per part:

1. The problem: sending crypto by voice or text is risky, and an AI model should never be the one deciding whether money moves.
2. What Airlock is: say it, Airlock checks it, then it moves. A rule in plain code refuses or asks for a YES.
3. Live demo: a refused HIGH-risk contract, a confirmed LOW-risk transfer, and a voice command with "Hey Airlock" (the audit stages turning green one by one).
4. How it works: the pipeline (voice or iMessage in, Gemini for intent, our own auditor, the gate, ElevenLabs voice out) and the safety rules (testnet only, per-transfer cap, "risk signal, not a guarantee").
5. Prize angles and what is next.

Record a backup take in case the live demo fails. The draft script, timing and recording plan are in `docs/VIDEO_SCRIPT.md`. Whoever finishes the backend and GUI first starts the slides.

## Small talk is cached (no tokens)

Greetings and simple questions ("hi", "how are you", "what does it do", "is it safe", "thanks", "bye") get a polite canned reply from `server/src/agent/smalltalk.json`, matched by `server/src/agent/smalltalk.ts`. It runs in `server/src/api/message.ts` **before** the agent (Gemini) is asked anything, so it costs no tokens, and every reply invites the person to try a transfer. Real commands (send, yes, no, anything with an amount or an address) are never touched. "help" and a bare "Hey Airlock" still return the standard help text. While a transfer is waiting, "ok" is answered with "That isn't a YES, so nothing has been sent", and other small talk gets a reminder to say YES or NO. To add small talk, edit the JSON (the file explains its own format); the tests in `server/test/smalltalk.test.ts` check that no reply says safe, secure or trusted.

## Hackathon details

- Date and prize tracks are not settled in this repo yet. Muhammad will find out and add them here. Until then, do not assume any.

## Locked contract (unchanged, from `docs/PLAN.md`)

- Auditor JSON: `{target, chainId, verdict, riskScore, findings[]}`.
- Endpoints: `POST /api/message` and `GET /api/stream`.
- The LLM never decides whether money moves. Code does. Wording is "risk signal, not a guarantee", never "safe". Testnet only, with a per-transfer cap.
