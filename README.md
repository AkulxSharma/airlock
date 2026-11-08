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
- The GUI's look is modelled on Otto, a friend's project (Devpost: devpost.com/software/ntta, GitHub: abrj7/otto). We read its public repository and rewrote our own components closely following Otto's Sidebar, DashboardLayout, VoiceOrbs and globals.css: the layout (collapsible left sidebar, centered main column, 400px voice panel on the right), the four fonts (Geist, Geist Mono, Playfair Display, Cormorant Garamond, all from Google Fonts), the colour palette, the corner radius, the entrance animation timing and the pulsing voice orbs. No Otto file was copied as is, but the structure and styling values follow it, so we credit it here. Our own additions: the verdict card, the audit stage rows, the event log, the YES/NO confirm flow and the voice routes.

## Status

Backend in progress (auditor, risk gate, address resolve, chain client, testnet send and the API are in `server/`). A demo GUI with voice is in `app/`, and the voice helpers are in `voice/`. See `docs/START_HERE.md` for the progress checklist.

## Scope and known limits

- **Local only.** The server listens on `127.0.0.1` and refuses requests from any website that is not on its short list of local GUI addresses. That, plus the 60-second single-use confirmation, is what keeps a stranger from answering YES for you. The browser chooses its own session id and there is no per-session rate limit or cap on open streams, so **do not host this server publicly as it is**. If it ever is (for example on Vultr for a prize), first issue session ids on the server, cap streams per session and add a per-session request limit.
- **Bytecode checks are the backbone.** The source checks are regex heuristics on Solidity (names, `onlyOwner` plus the whole balance, `tx.origin`, fee, pause and blacklist switches). Every message says "Heuristic". A sweep that reaches the balance through a helper function, a fee setter with an unusual name, flash-loan and oracle manipulation (needs economic analysis, not pattern matching), or non-Solidity source can slip past them. (Assembly sweeps, owner modifiers not named `only...` and `tx.origin` copied into a variable were closed on 2026-11-07; `server/test/corpus/` holds 12 vulnerable and 9 ordinary contracts the checks are measured against.) The tests list these known misses on purpose (`server/test/source.test.ts`). A clean result is a risk signal, not a guarantee.
- **ENS names are looked up on Ethereum mainnet, but audited and sent on Sepolia.** `vitalik.eth` resolves to a mainnet address, which on Sepolia is usually a plain wallet. Replies for a `.eth` name say so. The `.demo` names (`drainer.demo`, `proxy.demo`, and so on) point at real Sepolia contracts and are the right ones for the demo.
- **Testnet only.** Sepolia, test ETH, a 0.01 ETH cap per transfer. The gate refuses an audit for any other chain or for a different address than the one requested, and the wallet checks the chain again before signing.
- **After you pull,** run `npm run setup` once (it installs `server/`, `voice/` and `app/`), or run `npm install` in each folder whose `package.json` changed. A new package otherwise crashes the server on start with `ERR_MODULE_NOT_FOUND`.
