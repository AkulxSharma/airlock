# Airlock

Say it. Airlock checks it. Then it moves.

Airlock is a voice and iMessage agent that checks a crypto transaction before it goes out. You tell it to send funds, it screens the destination address and contract, and a rule in plain code decides whether the transfer is refused or asked for confirmation. It is built for UB Hacking 2026 (deep-space theme): nothing passes the airlock until the check clears.

## Team

- Akul Sharma: contract auditor, risk gate, Gemini agent, iMessage bridge, testnet send, Devpost writeup.
- Muhammad Abdullah: GUI app (UI/UX), ElevenLabs voice, demo polish and recording.

## Stack

- Gemini API (Gemini 2.5 Flash) for intent recognition and function calling.
- ElevenLabs for voice: speech-to-text in, text-to-speech out.
- One GUI app with everything built in, plus iMessage as a second way to operate it.
- Our own contract analysis (bytecode and source checks). No third-party scanner API.

## Safety rules

- The language model never decides whether money moves. Code does.
- Airlock says "risk signal, not a guarantee". It never says an address is "safe".
- Testnet and test funds only, with a per-transfer cap.

## Docs

- [docs/PLAN.md](docs/PLAN.md): pipeline, API contract, proposed project structure.
- [docs/TASKS.md](docs/TASKS.md): who does what, and what we do together.

## Disclosure (what pre-existed this hackathon)

- The idea: it comes from Pyra (NexHacks 2026) and Warden (Night Hack, 2026-10-30), both by Akul. No code from either is reused here.
- The planning docs in `docs/` were written before kickoff. All application code is written at the event.
- Libraries, public models and APIs (Gemini, ElevenLabs, open-source packages) are used as normal dependencies.
- The GUI's look is inspired by Otto, a friend's project (Devpost: devpost.com/software/ntta, GitHub: abrj7/otto). We matched its visual design: the layout (collapsible left sidebar, centered main column, 400px voice panel on the right), the four fonts (Geist, Geist Mono, Playfair Display, Cormorant Garamond, all from Google Fonts), the dark and light colour palette, the corner radius, the entrance animation timing, and the four pulsing voice orbs. All GUI code in `app/` was written from scratch in this repository and no Otto source file was copied. The deep-space starfield background, the verdict card, the audit stage rows, the event log, the YES/NO confirm flow and the voice routes are our own additions. Otto has no license file, so we credit it here and copied none of its code.

## Status

Empty scaffold. Application code starts at kickoff.
