# Voice round-trip report (2026-11-07)

Daniel (ElevenLabs TTS) speaks each phrase, Scribe (ElevenLabs STT) transcribes it back. PASS = every critical term present and word error rate (WER) at most 25%. WARN = critical terms present but WER above 25%. FAIL = a critical term missing or a call errored.

## Summary

- Round-trip cases: 28. PASS 21, WARN 5, FAIL 2.
- Mean WER: 12.8%.
- STT edge cases: 3 of 3 behaved as expected.

| Category | Cases | PASS | WARN | FAIL | Mean WER |
|---|---|---|---|---|---|
| command | 8 | 7 | 1 | 0 | 8.8% |
| gate | 4 | 4 | 0 | 0 | 5.0% |
| hard | 6 | 1 | 3 | 2 | 32.2% |
| security | 10 | 9 | 1 | 0 | 7.7% |

## Round-trip results

| ID | Verdict | WER | Said | Heard | Missing terms |
|---|---|---|---|---|---|
| cmd-01 | WARN | 70% | Send zero point zero one ETH to vitalik dot eth. | Send 0.01 ETH to vitalik.eth |  |
| cmd-02 | PASS | 0% | Send 0.01 ETH to vitalik.eth. | Send 0.01 ETH to vitalik.eth |  |
| cmd-03 | PASS | 0% | Transfer 0.005 test ETH to my savings wallet. | Transfer 0.005 test ETH to my savings wallet |  |
| cmd-04 | PASS | 0% | Check this address before I send anything. | Check this address before I send anything |  |
| cmd-05 | PASS | 0% | Yes, confirm the transfer. | Yes, confirm the transfer. |  |
| cmd-06 | PASS | 0% | No, cancel the transfer. | No, cancel the transfer |  |
| cmd-07 | PASS | 0% | Yes. | Yes. |  |
| cmd-08 | PASS | 0% | Is this contract risky? | Is this contract risky? |  |
| gate-01 | PASS | 0% | Risk signal, not a guarantee. | Risk signal, not a guarantee |  |
| gate-02 | PASS | 20% | Confirmation expires in sixty seconds. | Confirmation expires in 60 seconds |  |
| gate-03 | PASS | 0% | This transfer is above the cap of 0.01 ETH and was refused. | This transfer is above the cap of 0.01 ETH and was refused |  |
| gate-04 | PASS | 0% | The audit timed out. Transfer refused. | The audit timed out. Transfer refused |  |
| hard-01 | FAIL | 13% | Chain ID 11155111 is the Sepolia test network. | Chain ID 1155111 is the Sepolia test network | /11155111\|11,155,111/ |
| hard-02 | PASS | 0% | The EIP 1967 implementation slot holds a non zero value. | The EIP 1967 implementation slot holds a non-zero value |  |
| hard-03 | FAIL | 20% | Send 0.01 ETH to 0x71C7656EC7ab88b098defB751B7401B5f6d8976F. | Send 0.01 ETH to 071C7656EC7B88B098FB751B7401B5F6D8976F | /0x71c7656ec7ab88b098defb751b7401b5f6d8976f/ |
| hard-04 | WARN | 75% | Contract address zero x d e a d b e e f. | Contract address zero XDEADBEEF |  |
| hard-05 | WARN | 27% | Gas price is thirty gwei and the nonce is forty two. | Gas price is 30 Gwei and the nonce is 42 |  |
| hard-06 | WARN | 58% | Transaction hash begins with zero x a b c one two three. | Transaction hash begins with zero XABC123. |  |
| sec-01 | WARN | 33% | This contract contains a selfdestruct opcode. | This contract contains a self-destruct opcode |  |
| sec-02 | PASS | 25% | The contract uses delegatecall to an unknown address. | The contract uses delegate call to an unknown address. |  |
| sec-03 | PASS | 0% | Minimal proxy detected. The real logic lives at another address. | Minimal proxy detected. The real logic lives at another address |  |
| sec-04 | PASS | 8% | Upgradeable proxy with an admin slot. The logic can be swapped later. | Upgradable proxy with an admin slot. The logic can be swapped later |  |
| sec-05 | PASS | 0% | Reentrancy risk found in the withdraw function. | Reentrancy risk found in the withdraw function |  |
| sec-06 | PASS | 10% | Honeypot token. Sells are blocked for everyone except the owner. | Honeypot token. Cells are blocked for everyone except the owner |  |
| sec-07 | PASS | 0% | Phishing address flagged. Transfer refused. | Phishing address flagged, transfer refused |  |
| sec-08 | PASS | 0% | An unlimited token approval is a wallet drain risk. | An unlimited token approval is a wallet drain risk |  |
| sec-09 | PASS | 0% | Never share your private key or seed phrase with anyone. | Never share your private key or seed phrase with anyone |  |
| sec-10 | PASS | 0% | Verdict high. Risk score ninety two out of one hundred. | Verdict high risk score ninety-two out of one hundred |  |

## Speech-to-text edge cases

| ID | Case | Expected | Result | Got |
|---|---|---|---|---|
| stt-01 | 2 seconds of silence | empty or near-empty text (no invented words) | OK | "" |
| stt-02 | 2000 random bytes labelled mp3 | throws a clean HTTP error, no crash | OK | Error: transcribe: ElevenLabs returned HTTP 400 |
| stt-03 | empty audio | rejected before any network call | OK | Error: transcribe: audio is empty |
