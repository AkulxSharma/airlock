# Devpost: the project story (paste into "About the project")

Paste everything below the line into the "About the project" box on the Devpost submission page.

---

## Inspiration

AI is about to do everything. It already writes our code, answers our email and books our calendar. The next step is obvious: AI agents that move money. Ask an agent to "send 0.01 ETH to this address" and it will, instantly, with no second thought.

That is the problem. People used to say blockchains can't be hacked. That is true, but only for the chain itself. The smart contracts running on it, and everything built around them (keys, wallets, exchanges, tooling), are very hackable. The recent Binance theft is a reminder: the damage came from what surrounds the chain, not from the chain breaking. An AI agent that sends funds to the wrong contract can't undo it, because blockchain transactions are final.

We wanted a gate between "the agent decided to send" and "the money left."

## What it does

Airlock is a safety check for AI agents that move money. You tell it, by voice, by typing on the website, or over iMessage, to send test ETH. Before anything moves, our own auditor reads the destination contract two ways: its bytecode (SELFDESTRUCT, DELEGATECALL, proxies and upgradeable proxies), and, when the source is verified, 16 pattern checks for rug-pull and bug signals such as owner-only sweeps, hidden backdoors that move other people's tokens, reentrancy, tx.origin authorization and honeypot switches. The findings become a risk signal, and a rule in plain code decides:

- **HIGH risk, an error, or a timeout:** refused.
- **LOW or MEDIUM risk:** Airlock asks you to confirm. Only a YES within 60 seconds, for that exact transfer, sends anything.

Gemini only turns speech into a structured request and writes a short explanation that code checks before it is shown. ElevenLabs handles the voice in and out. It never decides whether money moves. Code does. Airlock only ever reports a "risk signal, not a guarantee" and never calls an address safe.

Everything runs on the Sepolia testnet with a per-transfer cap. We deployed 22 vulnerable and safe demo contracts (17 of them Solidity written for this project and verified on Sourcify), so you can try both the refusal and the approval yourself: text "Hey Airlock" and send to `backdoor.demo`, which is refused, then to `akul.demo`, which asks you to confirm and sends. Every message you send over iMessage also appears live on the website.

## How we built it

- **Auditor:** our own analysis, no third-party scanner. Layer 1 reads the contract's bytecode and flags SELFDESTRUCT, DELEGATECALL, CALLCODE, minimal proxies and upgradeable proxies (by reading the EIP-1967 storage slots). Layer 2 reads verified source (Sourcify is used only to fetch the text) for 16 heuristic patterns. The findings are scored, and any HIGH finding forces a HIGH verdict.
- **Risk gate:** a small pure function plus a confirmation store, covered by unit tests for every refuse and confirm case. It also refuses any chain other than Sepolia, and any audit for a different address than the one requested.
- **Agent:** Gemini for intent and for explaining findings. The amount and destination must appear word for word in what the user said, YES and NO never go through the model, and the explanation can only cite findings that exist in the audit output.
- **Voice:** ElevenLabs Scribe for speech in and text-to-speech out, with hands-free "Hey Airlock" listening on the website. Airlock stops speaking if you talk over it. An address spoken aloud is refused, because speech can mishear it.
- **Interfaces:** the website (airlock.ink, on Vercel) with a console, a live audit view, a wallets page and a "How we work" page, plus an iMessage bridge on a Mac. Say "Hey Airlock" once to open a session, then just type; "End Airlock" closes it.
- **Chain:** Ethereum Sepolia, test funds only, with a per-transfer cap and a daily limit.

## Challenges we ran into

- **False alarms in bytecode.** A byte that equals the SELFDESTRUCT opcode can sit inside data. Our scanner skips PUSH data, and later we found it also has to skip the compiler's metadata block, which made clean contracts look dangerous by chance.
- **A weak verdict.** A single medium finding scored low enough to read as LOW. We changed the rule so any medium finding gives at least MEDIUM.
- **Flaky infrastructure.** A public Sepolia RPC simply hung. We made every audit failure or timeout an automatic refusal, so a broken network can never turn into an approval.
- **Contracts that cannot receive a plain send.** Many of our Solidity demo contracts rejected a plain ETH transfer, which looked like a network failure. We gave them all a receive function and told the user the real reason when a contract rejects a send.
- **iMessage limits.** A script cannot send a real iMessage voice message, so replies are text. Voice notes sent to Airlock still work.
- **Keeping the model out of the decision.** The hardest design choice was what the AI is not allowed to do.

## What we learned

In agentic finance the model should not be the last line of defence. Put the AI where it is good (understanding people) and put plain, testable code where mistakes are expensive.

## What's next

Simulating the transaction before sending, deeper source analysis (flash-loan and price-oracle manipulation need more than pattern matching), more chains, and richer explanations for non-technical users. Airlock gives a risk signal, not a guarantee: the source checks are heuristics, and we document what they miss.

## Disclosure

The idea comes from our earlier projects, Pyra and Warden. No code from either is reused: Airlock was built from an empty repository during the hackathon. The website's look is modelled on Otto, a friend's project, with its owners' approval. Libraries, public models and APIs (Gemini, ElevenLabs, Sourcify) are used as normal dependencies.
