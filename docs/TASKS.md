# Airlock: who does what

## Muhammad Abdullah: UI/UX and voice

- [ ] GUI app shell: chat panel, voice button, YES/NO confirm buttons.
- [ ] Verdict card: LOW / MEDIUM / HIGH, risk score, list of findings.
- [ ] Live audit stages streaming in from `/api/stream`.
- [ ] Event log view.
- [ ] ElevenLabs speech-to-text from the mic.
- [ ] ElevenLabs text-to-speech playback of replies.
- [ ] Work against a mock of `/api/message` until the real server is live.
- [ ] Demo polish: landing view, the demo targets (a draining contract, a clean address, a proxy), and the screen recording.

## Akul Sharma: auditor, gate, agent, iMessage

- [ ] Contract auditor: bytecode checks and source checks, risk score, findings in the agreed JSON shape.
- [ ] Risk gate in plain code: HIGH, error or timeout means refuse; LOW or MEDIUM asks for YES, which expires.
- [ ] Gemini agent: intent, function tools, and a reply that may cite only the findings.
- [ ] iMessage bridge (needs a Mac that stays awake with Messages signed in).
- [ ] Testnet send with a per-transfer cap.
- [ ] Devpost writeup, including the disclosure of what pre-existed.

## Together

- [ ] First 20 minutes: lock the API contract in `docs/PLAN.md` and agree on the stack.
- [ ] Wire the GUI to the real server and replace the mock.
- [ ] Pick the demo targets and write the demo script.
- [ ] End-to-end test of the full flow by voice, by GUI text, and by iMessage.
- [ ] Deploy or document how to run it, and make the repo public if Devpost needs it.
- [ ] Record the demo and submit on Devpost.
- [ ] Prize check against UB's list: General, AI/ML, UI/UX, Over Engineered, Spirit (space theme), Gemini, ElevenLabs, and the others we can honestly claim.

## Rules for both of us

- Application code is written at the event. Disclose anything that pre-existed.
- Commit small and often on your own branch. Merge to `main` when it works.
- Never commit API keys. Use `.env` and keep it out of git.
