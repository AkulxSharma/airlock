# Airlock: plan

## Pipeline

```
 🎤 GUI voice      ⌨ GUI text        💬 iMessage text
      │                 │                   │
      ▼                 │                   │
 ┌────────────┐         │                   │
 │ ElevenLabs │         │                   │
 │ Scribe STT │         │                   │
 └─────┬──────┘         │                   │
       └────────────────┴───────────────────┘
                        │
                        ▼
              ┌───────────────────┐
              │   Input Router    │  one text message + channel tag
              │ (session per user)│
              └─────────┬─────────┘
                        ▼
              ┌───────────────────┐
              │ Gemini 2.5 Flash  │
              │ intent + function │
              │      tools        │
              └─────────┬─────────┘
        ┌───────────┬───┴───────┬────────────┬───────────┐
        ▼           ▼           ▼            ▼           ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌─────────┐
   │ Resolve │ │Contract │ │ Tx      │ │ Balance/ │ │ Explain │
   │ ENS /   │ │ Auditor │ │Simulate │ │ Send     │ │ findings│
   │ address │ │bytecode │ │ (fork)  │ │ (testnet)│ │         │
   └────┬────┘ │+ source │ └────┬────┘ └────┬─────┘ └────┬────┘
        │      └────┬────┘      │           │            │
        └───────────┴───────────┴───────────┴────────────┘
                        │
                        ▼
              ┌───────────────────┐
              │    RISK GATE      │  plain code, not the LLM
              │ HIGH/error/timeout│  → refuse
              │ LOW/MEDIUM        │  → ask YES (expires)
              └─────────┬─────────┘
                        ▼
              ┌───────────────────┐
              │  Context Builder  │  findings JSON only
              └─────────┬─────────┘
                        ▼
              ┌───────────────────┐
              │  Gemini Response  │  may cite only findings present
              └─────────┬─────────┘
                        ▼
              ┌───────────────────┐
              │   Output Router   │
              └───┬───────────┬───┘
                  ▼           ▼
        GUI: text + ElevenLabs   iMessage: text reply
        TTS voice 🔊             (optional voice note)
                  │
                  ▼
        Live event log → GUI dashboard (stages stream in real time)
```

## Design rules

- The language model never decides whether money moves. Code does.
- Wording is "risk signal, not a guarantee". Never "safe".
- Testnet and test funds only, with a per-transfer cap.
- The reply builder may only cite findings present in the auditor JSON.
- The auditor is our own. No external scanner API.

## API contract (lock this first so the two of us can work in parallel)

Auditor output:

```json
{
  "target": "0x...",
  "chainId": 11155111,
  "verdict": "LOW | MEDIUM | HIGH",
  "riskScore": 0,
  "findings": [{ "id": "string", "severity": "low | medium | high", "message": "string" }]
}
```

Message endpoint: `POST /api/message` takes `{ sessionId, channel, text }` and returns `{ reply, stages[], needsConfirm }`. The GUI uses a mock of this until the real server is up.

Live stages: `GET /api/stream` sends audit stages (address, bytecode, source, gate) as they complete.

## Proposed project structure

This layout is a proposal. Change it at kickoff if the stack changes.

```
airlock/
├── app/                 GUI (Next.js): chat, voice button, verdict card, live log   [Abdullah]
├── server/
│   ├── api/             /api/message, /api/stream, session handling                [Akul]
│   ├── agent/           Gemini client, function tools, reply builder               [Akul]
│   ├── auditor/         bytecode + source checks, risk score                       [Akul]
│   ├── gate/            risk gate, confirm/expire logic                            [Akul]
│   ├── wallet/          testnet send, per-transfer cap                             [Akul]
│   └── imessage/        Messages bridge                                            [Akul]
├── voice/               ElevenLabs STT/TTS helpers                                 [Abdullah]
├── docs/                PLAN.md, TASKS.md
└── README.md
```

## Cut order if time runs short

1. Transaction simulation on a fork.
2. iMessage voice notes.
3. Dashboard extras.

Never cut: the risk gate, the auditor, or the GUI voice flow.
