# Airlock: team decisions (read this first)

This file records decisions agreed between Muhammad and Akul on 2026-11-07. Claude sessions working in this repo should treat it as context. Update it when a decision changes.

## Where to start

- `docs/BUILD_PLAN.md`: ranked task list with the reasons for the order (backend first, GUI after).
- `docs/START_HERE.md`: exact step-by-step build instructions and a progress checklist. Resume from the first unchecked step, and tick steps off as they finish.

## Who builds what

- **Akul** owns the whole backend: contract auditor, risk gate, Gemini agent, iMessage bridge, testnet send, and the API (`POST /api/message`, `GET /api/stream`). This includes the mock versions of those two endpoints, so the GUI has something to talk to before the real server is done. See `docs/TASKS.md` for the full split.
- **Muhammad** owns the GUI (Next.js in `app/`: chat, voice button, verdict card, live log), the ElevenLabs STT/TTS work in `voice/`, and demo polish and recording.
- The demo GUI exists in `app/` (Next.js 16, Tailwind 4; Otto-style layout with a deep-space background; routes `/api/speak` and `/api/transcribe` call `voice/`). It belongs to Muhammad: do not edit `app/` without asking. Run it with `npm run dev` in `app/` and open exactly `http://localhost:3000` (the server's CORS allows only that origin). The real GUI polish comes after the backend is done.
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
- **Always show the parsed amount and full destination on screen before YES**, whatever channel the command came from. The cap of 0.01 ETH is the second safety net for a misheard amount.

## Hackathon details

- Date and prize tracks are not settled in this repo yet. Muhammad will find out and add them here. Until then, do not assume any.

## Locked contract (unchanged, from `docs/PLAN.md`)

- Auditor JSON: `{target, chainId, verdict, riskScore, findings[]}`.
- Endpoints: `POST /api/message` and `GET /api/stream`.
- The LLM never decides whether money moves. Code does. Wording is "risk signal, not a guarantee", never "safe". Testnet only, with a per-transfer cap.
