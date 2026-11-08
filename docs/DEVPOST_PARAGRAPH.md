# Devpost submission text

The full story, with this paragraph merged in, is `docs/DEVPOST_STORY.md`; paste that into the "About the project" box. This shorter paragraph can go anywhere a short summary is asked for. If only one box is available, paste the paragraph into the "About the project" box on the Devpost submission page (a short heading such as "What it does" above it works well).

## Paragraph

Airlock is a safety check for AI agents that move money. You tell it, by voice, by typing or over iMessage, to send test ETH. Before anything moves, our own auditor reads the destination contract two ways: its bytecode (SELFDESTRUCT, DELEGATECALL, proxies and upgradeable proxies), and, when the source is verified, 16 pattern checks for rug-pull and bug signals such as owner-only sweeps, hidden backdoors that move other people's tokens, reentrancy, tx.origin authorization and honeypot switches. The findings become a risk signal, and a rule in plain code decides: HIGH risk, an error or a timeout is refused, while LOW or MEDIUM asks for a YES within 60 seconds. Gemini only turns speech into a structured request and writes a short explanation that code checks before it is shown. ElevenLabs handles the voice in and out. Everything runs on Sepolia with a per-transfer cap, and we deployed 22 vulnerable and safe demo contracts, verified on Sourcify, so you can try both the refusal and the approval yourself. It is a risk signal, not a guarantee: the source checks are heuristics, and we document what they miss.

## Elevator pitch (the 200-character field)

AI agents are starting to move money. Airlock is the safety layer: it audits each address, and a code gate, not the model, refuses risky transfers and asks you to confirm the rest.
