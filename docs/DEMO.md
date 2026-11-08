# Airlock: demo targets and demo script

Everything here is on the Sepolia test network. The contracts are test fixtures with no real value. The bytecode is hand-assembled in `server/src/demo/bytecode.ts` (no Solidity compiler), deployed once by `server/scripts/deploy-demo-targets.ts`, and recorded in `server/src/demo/demo-targets.json`.

## Demo names

Type or paste these names instead of addresses. They end in `.demo` so they can never be confused with a real ENS name. They also work by voice ("drainer dot demo"), which matters because an address must never be taken from voice.

| Name | What it is | Expected result | Why |
|---|---|---|---|
| `drainer.demo` | Any call runs SELFDESTRUCT to the caller | HIGH, refused | SELFDESTRUCT found (also no verified source) |
| `proxy.demo` | EIP-1967-style proxy that delegates every call to the Sepolia WETH contract | MEDIUM, asks to confirm | DELEGATECALL, implementation slot set, no verified source |
| `clone.demo` | EIP-1167 minimal proxy pointing at the Sepolia WETH contract | MEDIUM, asks to confirm | Minimal proxy, real logic lives elsewhere, no verified source |
| `clean.demo` | Accepts ETH and does nothing else | MEDIUM, asks to confirm | Its bytecode is clean, but it has no verified source (`unverified-source`) |
| `weth.demo` | The public Sepolia WETH9 contract, verified on Sourcify | LOW, asks to confirm | Bytecode and source checks flag nothing |
| `rugvault.demo` | Solidity vault; the owner can send the whole pool to themselves | HIGH, refused | owner-sweep, found in the verified source |
| `reentrancy.demo` | Solidity bank that sends ether before zeroing the balance | MEDIUM, asks to confirm | reentrancy-risk |
| `honeypot.demo` | Solidity token with blacklist, sell-fee and trading switches | MEDIUM, asks to confirm | blacklist-switch, adjustable-fee, trading-switch |
| `selfkill.demo` | Solidity contract anyone can SELFDESTRUCT | HIGH, refused | selfdestruct |
| `vault.demo` | Solidity vault, you can only withdraw your own deposit; source verified | LOW, asks to confirm | nothing flagged |
| `origin.demo` | wallet that checks tx.origin | MEDIUM, confirm | tx-origin |
| `unchecked.demo` | ignores whether a payment succeeded | MEDIUM, confirm | unchecked-call |
| `init.demo` | initialize() open to anyone, who becomes owner | HIGH, refused | unprotected-init |
| `delegate.demo` | delegatecall to a caller-chosen address | MEDIUM, confirm | delegatecall |
| `lottery.demo` | block.timestamp used as randomness | MEDIUM, confirm | weak-randomness |
| `strictbalance.demo` | exact balance check, forced-ether risk | LOW, confirm | strict-balance |
| `dos.demo` | pays all backers in one loop | MEDIUM, confirm | dos-loop-payment |
| `replay.demo` | signed withdrawal with no replay protection | MEDIUM, confirm | signature-replay |
| `backdoor.demo` | owner can move anyone's tokens | HIGH, refused | owner-seize |
| `approval.demo` | owner pulls approved tokens from wallets | HIGH, refused | owner-seize |
| `math.demo` | balance math in an unchecked block | MEDIUM, confirm | unchecked-math |
| `oracle.demo` | price from its own live reserves (flash-loan manipulable) | LOW, confirm | NOT detected: a known gap |

The seventeen Solidity demos are in `server/contracts/` (plus the interface they share; one per vulnerability class), compiled by `server/scripts/compile-demo-contracts.ts`, deployed by `deploy-solidity-demos.ts` and verified on Sourcify by `verify-solidity-demos.ts` (all seventeen exact matches). `server/scripts/audit-demo-names.ts` audits every name against the live chain and Sourcify and prints any mismatch; on 2026-11-07 all twenty-two matched. Restart the server after pulling so it loads the new names.

Addresses (checksummed):

- `drainer.demo`: 0x49005681BD5c710A134313ef1205dBA4cf2eA6EE
- `clean.demo`: 0xa45FCc3c5c097348B9582C1B3d57dFF0f861E81f
- `proxy.demo`: 0xcd6811b6257c22378c95c0a8567F369dF94aaCCB
- `clone.demo`: 0x0D2e7F8a229C1BcFa3D980d6FA95143B57DC70C4
- `weth.demo`: 0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9

A LOW or MEDIUM result is a risk signal, not a guarantee. Airlock never says an address is safe.

`clean.demo` is MEDIUM on purpose: since the source check was added, any contract with no verified source gets an `unverified-source` finding. The LOW example is `weth.demo`, which is verified on Sourcify. A plain wallet address (no contract code) is also LOW.

## What was verified live (2026-11-07)

- With the source check on, every demo name still audits as expected against the real Sepolia chain and the real Sourcify registry (see the table).

- The auditor's verdict for each name matched the expected column above, on the real Sepolia chain.
- The hand-written proxy works: a `balanceOf` call through it returned a normal 32-byte answer instead of reverting.
- The clone's code on chain is exactly the EIP-1167 bytes, and a call through it returned a normal answer. (WETH keeps its name and decimals in storage, so a delegatecall through a clone reads the clone's own empty storage. A blank name and zero decimals are the correct result there.)
- The full server flow was run against all five names: HIGH was refused and a later YES sent nothing; MEDIUM and LOW asked for confirmation; an unknown demo name was refused.
- A real `.eth` lookup works: `vitalik.eth` resolves through Ethereum mainnet, and a name that does not exist returns an error, which the gate refuses.

## Demo script

Keep the whole run under three minutes. Each scene has the exact thing to say or type and what the audience should see.

1. **Opening.** One sentence: AI agents are starting to move money, and Airlock is the gate between "the agent decided to send" and "the money left."
2. **A refused transfer (HIGH).** Type or say "send 0.001 to drainer dot demo". The stages tick through address, bytecode, source and gate. The card turns HIGH, shows the SELFDESTRUCT finding, and Airlock refuses. Then answer "yes" anyway: Airlock says nothing is waiting, so nothing was sent. Point out that the AI did not decide this. Code did.
3. **A proxy case (MEDIUM).** "send 0.001 to proxy dot demo". The card shows MEDIUM with two findings: DELEGATECALL and an upgradeable implementation. Airlock shows the full address and amount and asks for confirmation. Say "no" to cancel. Point out that the logic behind a proxy can be swapped after you check it.
4. **A confirmed transfer (LOW).** "send 0.0001 to weth dot demo", then "yes" within 60 seconds. The transfer goes out and Airlock replies with an Etherscan link. Open the link.
5. **Voice.** Say "send zero point zero zero one ETH to vitalik dot eth" and show that the transcript, the full address and the amount are on screen before confirming. Then read an address aloud and show that Airlock refuses to take an address by voice.
6. **Close.** Chains are hard to break; the contracts and tooling around them are not. Airlock checks first.

## Before recording

- Server running, agent wallet funded (check the balance on Sepolia), and the GUI pointed at the server.
- Do the HIGH, MEDIUM and LOW runs once beforehand to warm up the connection, and record a backup take.
- Each confirmation expires after 60 seconds. Say "yes" or "no" inside that window.
