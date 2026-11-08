# How Airlock works

Say it. Airlock checks it. Then it moves. A rule in plain code decides whether it moves, never the model. The same explanation is on the website, under "How we work".

## The pipeline

1. **You** ask by voice, over iMessage or by typing: "send 0.001 to vault.demo".
2. **Gemini** turns the request into a structured transfer. The amount and the destination must appear word for word in what you said, or the request is dropped. YES and NO never go through the model.
3. **The auditor** reads the destination contract. It is our own code: no third-party scanner.
4. **The code gate** decides. HIGH risk, an error or a timeout is refused. LOW or MEDIUM asks for a YES within 60 seconds, for that exact transfer.
5. **Sepolia** receives the test ETH, and the reply carries a link to the transaction.

## How the auditor checks a contract

**Layer 1, bytecode (the backbone).** It walks the contract's bytecode and collects the real instructions. It skips data bytes that follow PUSH instructions and the compiler's metadata block at the end, because both look like random opcodes and would flag a clean contract by chance. It reports: SELFDESTRUCT (can erase the contract and send out its funds), DELEGATECALL and CALLCODE (run other code with the contract's own storage and funds), a minimal proxy (EIP-1167, the real logic lives elsewhere), an upgradeable proxy (EIP-1967 storage slots set, the logic can be swapped), very short code, and no code.

**Layer 2, source.** When the contract's source is verified on Sourcify (used only to fetch the text), our own code reads it for 16 patterns: an owner-only sweep of the whole balance, an owner-only function that moves tokens out of other people's wallets, owner-only mint, changeable fees, blacklist, pause and trading switches, tx.origin used for authorization, reentrancy (ether sent before records are updated), an unprotected initializer, ignored call results, unchecked arithmetic, exact-balance checks, weak randomness, payments in one loop, and signature replay. Each finding says "Heuristic": it is a pattern match, not a proof. With no verified source, the result carries a MEDIUM "unverified source" finding.

## From findings to a verdict

Each finding has a severity. A high finding is worth 40 points, a medium 20 and a low 5, capped at 100. Any high finding forces HIGH. Any medium finding gives at least MEDIUM. Otherwise a score of 70 or more is HIGH, 30 or more is MEDIUM and anything lower is LOW. There is no "safe" value, on purpose.

## What it does not do

The source checks are heuristics, so a sweep hidden behind a helper function or an unusually named fee setter can slip past them. Flash-loan and price-oracle manipulation need economic analysis, not pattern matching, so Airlock does not detect them. Everything it says is a risk signal, not a guarantee.

## Demo contracts

22 demo contracts on Sepolia, 17 of them Solidity written for this project and verified on Sourcify, so both the refusal and the approval can be tried live (see `docs/DEMO.md`).

## Submission paragraph

Airlock is a safety check for AI agents that move money. You tell it, by voice, by typing or over iMessage, to send test ETH. Before anything moves, our own auditor reads the destination contract two ways: its bytecode (SELFDESTRUCT, DELEGATECALL, proxies and upgradeable proxies), and, when the source is verified, 16 pattern checks for rug-pull and bug signals such as owner-only sweeps, hidden backdoors that move other people's tokens, reentrancy, tx.origin authorization and honeypot switches. The findings become a risk signal, and a rule in plain code decides: HIGH risk, an error or a timeout is refused, while LOW or MEDIUM asks for a YES within 60 seconds. Gemini only turns speech into a structured request and writes a short explanation that code checks before it is shown. ElevenLabs handles the voice in and out. Everything runs on Sepolia with a per-transfer cap, and we deployed 22 vulnerable and safe demo contracts, verified on Sourcify, so you can try both the refusal and the approval yourself. It is a risk signal, not a guarantee: the source checks are heuristics, and we document what they miss.
