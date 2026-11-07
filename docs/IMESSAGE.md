# Airlock: iMessage bridge

Text Airlock, or send it a voice note. Start with its name: "Airlock send 0.001 to weth.demo" or "Hey Airlock, send 0.001 to weth.demo". It audits the address and asks you to confirm; reply "yes" or "no". The bridge is a small program that runs on a Mac signed into Messages. It reads new messages from the Messages database, sends each one to the local Airlock server (`POST /api/message`, one session per sender), and sends the reply back through the Messages app. All decisions stay in the server: the risk gate, the 60-second confirmation and the 0.01 ETH cap behave exactly as they do in the GUI.

Code: `server/src/imessage/`. Run it with `npm run imessage` in `server/`.

## Who can use it, and the wake word

- **Anyone can text the line** (`IMESSAGE_ALLOWLIST=*` in `airlock/.env`). The bridge only answers a message that says "Airlock" or "Hey Airlock" (any case; "air lock" and similar spellings count). Whatever is said before the name is ignored; the command is what follows it. The word is stripped before the command reaches the server. If a message is only the name, the sender gets the help text.
- **Why the name matters:** this is a real Mac with a real inbox, so the bridge sees friends' and family's messages too. Anything without the name is dropped without a reply and without being logged. A message that only mentions an `airlock.eth` domain does not count as saying the name.
- **YES and NO without the name:** after Airlock asks for a confirmation, the same sender can reply with a bare "yes" or "no" for 60 seconds. Only the exact words count ("sure, go ahead" does not), only from that sender, and each confirmation can be answered once. The server still enforces its own 60-second window and the cap.
- **A shorter list:** set `IMESSAGE_ALLOWLIST` to specific numbers or emails (comma-separated, for example `+17165550100,me@example.com`) to restrict the line. Numbers match by digits, so formatting and a +1 prefix do not matter. An empty list allows nobody, and the bridge refuses to start.

## Voice notes

A voice note ("Audio Message.caf" in the Messages attachments) works the same way as typed text, with the voice rules from the GUI.

1. The bridge converts the note to a small WAV (macOS `afconvert`, with `ffmpeg` as a fallback) and sends it to **ElevenLabs speech-to-text** (the `voice/transcribe.ts` helper). It needs `ELEVENLABS_API_KEY` in `airlock/.env` on the demo Mac. Without a key, voice notes are ignored and typed texts still work.
2. The transcript is checked for the wake word like typed text. A voice note that does not say "Airlock" gets no reply.
3. It is sent to the server as a **voice** message, so the voice safety rules apply: an address spoken aloud is refused (speech can mishear it), with a message asking the sender to type the address or use a name like `weth.demo` or `vitalik.eth`. Spoken numbers like "zero point zero one" and "dot demo" are understood. A spoken "yes" or "no" answers an open confirmation.

**Spoken replies.** If you sent a voice note, Airlock answers in text first and then sends a spoken copy as an audio message, using ElevenLabs text-to-speech (the same voice as the GUI). A typed message gets text only. The spoken version is a short summary (the verdict, one finding, the amount and the question), not the whole findings list. It never says a full address: only the start and end, spelled out, and amounts are said digit by digit so 0.005 can not be heard as 0.05. The exact address and amount are always in the text reply. **Testing the audio on its own:** `npm run imessage -- --test-audio +1XXXXXXXXXX` (in `server/`) speaks a short test sentence with ElevenLabs and sends it to that phone number or email, then exits. Use the phone you are testing with. **How the file is attached:** the Messages app has several ways to attach a file and which one works depends on the macOS version, and a send that does nothing raises no error. So the bridge tries four methods in turn, checks the Messages database after each to see whether an audio message was really created and sent, stops at the first that works, and remembers it for next time. The log says which method failed and which delivered. **Format.** `IMESSAGE_VOICE_FORMAT` in `airlock/.env`: `mp3` (the default) sends the file as ElevenLabs returned it; `caf` converts it to Opus in a CAF file named "Audio Message.caf", the format a phone's own voice notes use. If converting fails, the mp3 is sent instead. **Tried on the test Mac, both arrive as a plain audio attachment** (an "Audio Recording" card for the mp3), not the waveform voice-message bubble. That bubble needs an internal flag that only the Messages app itself (or its private interface, which needs macOS protections turned off) can set, and a script cannot set it. So the default is mp3, which plays on any phone. A spoken reply here means "a playable audio file", not a native voice note; the native voice experience is the GUI.

**If the audio never arrives:** a log line `spoken reply failed: Messages could not send it (error 22)` means the Messages app read the file and then iMessage refused to send it. On the test Mac this happened for every attachment, and older attachment sends from the same Mac had failed too (errors 4 and 35), while text went through. So it is a limit of that Mac's network or iMessage account, not of the bridge. Check by sending any file by hand from the Messages app; if that also shows Not Delivered, try another network (a phone hotspot) before the demo. To avoid spending speech credits and leaving failed bubbles, the bridge pauses spoken replies for 10 minutes after two failures in a row; text replies are never affected. The spoken copy is best effort: if it fails, the text reply has already been sent. At most 6 spoken replies a minute (`IMESSAGE_MAX_VOICE_PER_MINUTE`, shared with transcription). Set `IMESSAGE_VOICE_REPLIES=off` to send text only. The audio file is saved briefly in `~/Pictures/airlock-imessage/` (a folder the Messages app can read; it could not read it from `~/Library/Caches`) and deleted after about two minutes. The bridge then checks the Messages database and logs `spoken reply delivered`, or `spoken reply failed: Messages could not send it (error N)`, or says delivery could not be confirmed.

**Privacy, because the wake word is only known after transcribing:** every voice note from an allowed sender is uploaded to ElevenLabs for transcription before Airlock knows whether it was meant for Airlock. With `IMESSAGE_ALLOWLIST=*` that includes voice notes friends and family send to this Mac. To limit it:
- Only notes of 20 seconds or less and 2 MB or less are ever uploaded; longer ones are skipped.
- At most 6 notes a minute across the whole line are transcribed (`IMESSAGE_MAX_VOICE_PER_MINUTE`), which also protects the ElevenLabs quota.
- The converted files are deleted right away, and neither the transcript nor the file path is logged.
- Set `IMESSAGE_VOICE=off` to turn voice notes off entirely, or use a shorter allowlist. For the demo, a dedicated Apple ID on the Mac avoids the issue completely.

## One-time setup (macOS)

1. **Full Disk Access.** The Messages database is protected. In System Settings > Privacy & Security > Full Disk Access, turn on the app that will run the bridge (Terminal, iTerm, or your editor). Quit and reopen that app afterwards. Without this, the bridge prints the same instruction and exits. Voice notes live in the same protected folder.
2. **Automation.** The first time it sends a reply, macOS asks whether that app may control Messages. Allow it.
3. **Messages signed in.** The Mac must be signed into iMessage, and must stay awake and plugged in while people text it. People text the phone number or Apple ID that the Mac is signed in with.
4. **Keys in `airlock/.env`.** `IMESSAGE_ALLOWLIST=*` (or a list), and `ELEVENLABS_API_KEY` for voice notes.

## Running it

1. Start the server: `npm run dev` in `server/`.
2. In a second terminal, from `server/`: `npm run imessage`. Add `-- --dry-run` to read and answer without sending anything; it prints what it would reply.
3. From another phone, text the Mac's number: "Hey Airlock, send 0.001 to weth.demo". Then try a voice note saying the same, and a voice note with no name in it (no reply expected).

**Texting yourself does not work.** If the phone and the Mac share an Apple ID, a text to your own number is stored as sent by you, and the bridge ignores messages you sent. Text from a different phone or a different Apple ID.

## What it will not do

- It ignores group chats, reactions (tapbacks), its own replies echoed back, and anything without the wake word. It never replays old conversations: the first run starts after the newest message, and the last handled message is saved in `server/.data/imessage-cursor.json`, so a restart does not answer anything twice.
- It limits each sender to 8 messages a minute (`IMESSAGE_MAX_PER_MINUTE`) and the whole line to 20 a minute (`IMESSAGE_MAX_GLOBAL_PER_MINUTE`), so a crowd or two bots can not flood it or loop.
- Its logs show only a masked sender (the last 4 digits) and the reply length, never message text or transcripts.
- If the Airlock server is down, the sender gets "Airlock is not available right now. Nothing was sent." instead of silence.
- It opens the Messages database read-only, only opens audio files inside the Messages attachments folder, and passes message text to AppleScript as an argument, never inside the script, so a text can not inject commands.

## Status

Code and tests are done (the throwaway-database tests mimic the Messages schema, including the attributedBody format and audio attachments; the voice conversion test really decodes an Opus CAF file made on this Mac). Not yet verified live: reading a real incoming text or voice note and sending a real reply, and a real ElevenLabs transcription of a voice note, and sending the spoken reply. Those need Full Disk Access and Automation on the demo Mac, and the ElevenLabs key. Do that check before the demo.

## Limits to know

- One Mac, one line. If the Mac sleeps, signs out or loses its network, the line goes quiet.
- Replies are text, plus a spoken copy for people who sent a voice note. The audio attachment is the least tested part: sending a file through the Messages app can be blocked by macOS permissions, and it has not been tried on a real phone yet. The text reply never depends on it.
- The Gemini free tier allows only a few requests a minute, so the plain-language note may be missing from some replies; the fixed lines (verdict, findings, full address, amount, YES or NO prompt) always appear.
