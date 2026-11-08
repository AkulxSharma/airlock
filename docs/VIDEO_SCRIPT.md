# Airlock: 2-minute submission video (script and recording plan)

Owner: Muhammad. This is a draft to cut down, not a final cut. The hackathon requires a video of **at most 2 minutes** that shows what we made, in the style of a short slide presentation. Check the exact length and format rules on the Devpost page before recording. Aim for 1:55 so there is a margin.

Fill in the two placeholders before recording: `{RISKY}` (a contract that gets HIGH and is refused) and `{CLEAN}` (a name that gets LOW or MEDIUM and asks for a YES). The names Akul deployed are listed in `docs/DEMO.md`. `vitalik.eth` works as the clean example because it is a plain wallet and resolves through real ENS.

## Timeline and narration

About 265 words of narration. At a normal speaking pace (130 to 150 words a minute) that is 1:50 to 2:05, so trim lines marked (cut first) if the timing is over.

| Time | Slide or screen | On screen | Narration |
|---|---|---|---|
| 0:00 to 0:12 | Slide 1: the problem | Big text: "Voice and AI agents can now move money. Who checks first?" | "AI agents and voice assistants are starting to move money. One wrong word, or one malicious contract, and the funds are gone. Who checks before it goes out?" |
| 0:12 to 0:25 | Slide 2: what Airlock is | "Say it. Airlock checks it. Then it moves." and the Airlock name | "That's Airlock. Tell it by voice or text who to send test ETH to. It audits the destination first, and a rule in plain code decides: refuse it, or ask for your yes." |
| 0:25 to 1:00 | Screen recording: a LOW case, by voice | The GUI. Say "Hey Airlock, send zero point zero one ETH to {CLEAN}". The four audit stages turn green one by one, the LOW card appears, press YES, the Etherscan link appears. | "Watch. Hey Airlock, send zero point zero one ETH to vitalik dot eth. ElevenLabs turns my voice into text. Airlock looks up the name, reads the contract code, checks the source, and runs the gate, one step at a time. Low risk, so it shows me the full address and amount and asks for a yes. I confirm, and it sends, with a transaction link on the test network." |
| 1:00 to 1:25 | Screen recording: a refused case | Type or say "send 0.01 to {RISKY}". The card turns red HIGH with the SELFDESTRUCT finding. Say or press YES anyway: nothing is sent. | "Now a malicious contract. Airlock finds SELFDESTRUCT in the code, the risk is HIGH, and it refuses. Even if I say yes, nothing moves. The language model never decides whether money moves. Code does." |
| 1:25 to 1:45 | Slide 3: how it works | A left-to-right diagram: voice, text or iMessage in, Gemini for intent, our own auditor (bytecode and source), the risk gate, confirm, testnet send, ElevenLabs voice reply | "Under the hood: ElevenLabs for voice in and out, Gemini only to understand loose wording, and our own auditor, with no third-party scanner. Then a plain-code gate, a confirmation that expires, and a spoken reply. It works over iMessage too." (cut the last sentence first) |
| 1:45 to 1:55 | Slide 4: safety rules | Three lines: "A risk signal, not a guarantee." "Testnet only, with a per-transfer cap." "Voice can never supply an address." | "We never call an address safe, only a risk signal. It is testnet only with a per-transfer cap, and voice can never supply an address." (cut first, if short on time) |
| 1:55 to 2:00 | Slide 5: close | "Airlock. Check it before it moves." The repo link and both names | "Airlock: check it before it moves. Built at UB Hacking 2026." |

Slides are mostly pictures and a few words each. Keep the deep-space feel: dark background for the slides, with the product screenshots in the light theme.

## What to record, in order

1. **Slides.** Make 5 slides in Keynote or Google Slides, and export each as an image or a short clip. Slide 3's diagram can be a simple row of boxes.
2. **The two demo clips** (the LOW case by voice, the refused case). Record with macOS screen recording (Cmd+Shift+5, "Record Selected Portion", microphone on for the voice command). Record each clip on its own, so a bad take costs one clip.
3. **Voiceover.** Record the narration separately and slowly, then place it over the slides and clips. Do not narrate and speak commands in the same take; the commands are recorded live in clip 1, and the narration goes around them.
4. **Edit.** iMovie, CapCut or Final Cut: slides and clips in order, voiceover on top, captions if you can. Check the total length, and cut to land at or under 1:55.
5. **Export** at 1080p as an mp4, upload to YouTube as unlisted (or whatever Devpost accepts), and paste the link into the Devpost entry.
6. **Backup.** Keep a second take of each demo clip. If the live demo fails on the day, the recording is the demo.

## Before recording (pre-flight)

- API server running (`npm run dev` in `server/`) and the GUI running (`npm run dev -- -p 3100` in `app/`), then open `http://localhost:3100`. The "Server online" dot must be green.
- **A real send needs a wallet key.** On Muhammad's machine `PRIVATE_KEY_TESTNET` is the all-zero placeholder, so YES answers "Sending is not set up". To record the full send with the Etherscan link, either record clip 1 on Akul's machine, or put a **throwaway** Sepolia wallet's key (with a little test ETH from a faucet, never a real wallet) in `.env`.
- Microphone: set the Mac input to the MacBook microphone (System Settings, Sound, Input), not the EarPods mic, and allow microphone access for the browser.
- Do the LOW and HIGH runs once beforehand to warm up the connection. A confirmation expires after 60 seconds, so say or press YES inside that window.
- Turn on Do Not Disturb, hide the bookmarks bar, close other tabs, and zoom the page to about 110 percent so text reads on a small video.
- Pick light or dark mode once and keep it for every clip.

## Open decisions

- **The two targets** (`{RISKY}` and `{CLEAN}`). Choose them before recording.
- **Whether to show the spoken reply.** The browser plays Daniel's voice through the speakers; a screen recording does not capture it unless the recording includes system audio. The simplest option is to leave it out of the video and mention the voice reply in the narration.
- **Where the full send is recorded** (see the wallet key point above).
- **Captions.** Many viewers watch with the sound off, so burn in captions if the editor makes it easy.
