# Voice round-trip report (2026-11-07)

Daniel (ElevenLabs TTS) speaks each phrase, Scribe (ElevenLabs STT) transcribes it back. PASS = every critical term present and word error rate (WER) at most 25%. WARN = critical terms present but WER above 25%. FAIL = a critical term missing or a call errored.

## Summary

- Round-trip cases: 29, each run 3 time(s), so 87 live round trips. PASS 29, WARN 0, FAIL 0.
- Mean WER: 1.9%.
- STT edge cases: 3 of 3 behaved as expected.

| Category | Cases | PASS | WARN | FAIL | Mean WER |
|---|---|---|---|---|---|
| command | 8 | 8 | 0 | 0 | 0.0% |
| gate | 4 | 4 | 0 | 0 | 0.0% |
| hard | 7 | 7 | 0 | 0 | 5.5% |
| security | 10 | 10 | 0 | 0 | 1.8% |

## Round-trip results

| ID | Verdict | Passing runs | WER (worst run) | Said | Heard (worst run) | Missing terms | Note |
|---|---|---|---|---|---|---|---|
| cmd-01 | PASS | 3/3 | 0% | Send zero point zero one ETH to vitalik dot eth. | Send 0.01 ETH to vitalik.eth |  |  |
| cmd-02 | PASS | 3/3 | 0% | Send zero point zero one ETH to vitalik.eth. | Send 0.01 ETH to vitalik.eth |  |  |
| cmd-03 | PASS | 3/3 | 0% | Transfer zero point zero zero five test ETH to my savings wallet. | Transfer 0.005 test ETH to my savings wallet |  |  |
| cmd-04 | PASS | 3/3 | 0% | Check this address before I send anything. | Check this address before I send anything |  |  |
| cmd-05 | PASS | 3/3 | 0% | Yes, confirm the transfer. | Yes, confirm the transfer |  |  |
| cmd-06 | PASS | 3/3 | 0% | No, cancel the transfer. | No, cancel the transfer |  |  |
| cmd-07 | PASS | 3/3 | 0% | Yes. | Yes |  |  |
| cmd-08 | PASS | 3/3 | 0% | Is this contract risky? | Is this contract risky? |  |  |
| gate-01 | PASS | 3/3 | 0% | Risk signal, not a guarantee. | Risk signal, not a guarantee |  |  |
| gate-02 | PASS | 3/3 | 0% | Confirmation expires in sixty seconds. | Confirmation expires in 60 seconds |  |  |
| gate-03 | PASS | 3/3 | 0% | This transfer is above the cap of zero point zero one ETH and was refused. | This transfer is above the cap of 0.01 ETH and was refused |  |  |
| gate-04 | PASS | 3/3 | 0% | The audit timed out. Transfer refused. | The audit timed out. Transfer refused |  |  |
| hard-01 | PASS | 3/3 | 0% | Chain ID 1 1 1 5 5 1 1 1 is the Sepolia test network. | Chain ID 11155111 is the Sepolia test network |  |  |
| hard-02 | PASS | 3/3 | 0% | The EIP 1967 implementation slot holds a non zero value. | The EIP 1967 implementation slot holds a non-zero value |  |  |
| hard-03 | PASS | 3/3 | 18% | Send zero point zero one ETH to the address starting zero x 7 1 C 7, ending 9 7 6 F. | Send 0.01 ETH to the address starting 0x71c7 ending 976f |  |  |
| hard-04 | PASS | 3/3 | 0% | Contract address zero x d e a d b e e f. | Contract address zero x D E A D B E E F |  |  |
| hard-05 | PASS | 3/3 | 0% | Gas price is thirty gwei and the nonce is forty two. | Gas price is 30 gwei and the nonce is 42. |  |  |
| hard-06 | PASS | 3/3 | 0% | Transaction hash begins with zero x a b c one two three. | Transaction hash begins with 0xABC123 |  |  |
| hard-07 | PASS | 3/3 | 20% | Send 0.01 ETH to 0x71C7656EC7ab88b098defB751B7401B5f6d8976F. | Send 0.01 ETH to 0x71c7656e7ab88b098dfbb751b7401b5f6d8976f |  | guard blocked address-like text |
| sec-01 | PASS | 3/3 | 0% | This contract contains a selfdestruct opcode. | This contract contains a self-destruct opcode |  |  |
| sec-02 | PASS | 3/3 | 0% | The contract uses delegatecall to an unknown address. | The contract uses delegate call to an unknown address |  |  |
| sec-03 | PASS | 3/3 | 0% | Minimal proxy detected. The real logic lives at another address. | Minimal proxy detected. The real logic lives at another address |  |  |
| sec-04 | PASS | 3/3 | 8% | Upgradeable proxy with an admin slot. The logic can be swapped later. | Upgradable proxy with an admin slot. The logic can be swapped later |  |  |
| sec-05 | PASS | 3/3 | 0% | Reentrancy risk found in the withdraw function. | Reentrancy risk found in the withdraw function |  |  |
| sec-06 | PASS | 3/3 | 10% | Honeypot token. Sells are blocked for everyone except the owner. | Honeypot token. Cells are blocked for everyone except the owner |  |  |
| sec-07 | PASS | 3/3 | 0% | Phishing address flagged. Transfer refused. | Phishing address flagged. Transfer refused. |  |  |
| sec-08 | PASS | 3/3 | 0% | An unlimited token approval is a wallet drain risk. | An unlimited token approval is a wallet drain risk |  |  |
| sec-09 | PASS | 3/3 | 0% | Never share your private key or seed phrase with anyone. | Never share your private key or seed phrase with anyone |  |  |
| sec-10 | PASS | 3/3 | 0% | Verdict high. Risk score ninety two out of one hundred. | Verdict high risk score ninety-two out of one hundred |  |  |

## Speech-to-text edge cases

| ID | Case | Expected | Result | Got |
|---|---|---|---|---|
| stt-01 | 2 seconds of silence | empty or near-empty text (no invented words) | OK | "" |
| stt-02 | 2000 random bytes labelled mp3 | throws a clean HTTP error, no crash | OK | Error: transcribe: ElevenLabs returned HTTP 400 |
| stt-03 | empty audio | rejected before any network call | OK | Error: transcribe: audio is empty |
