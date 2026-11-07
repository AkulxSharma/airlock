# Airlock: iMessage bridge

Text Airlock like you would use the GUI: "send 0.001 to drainer.demo", then "yes" or "no". The bridge is a small program that runs on a Mac signed into Messages. It reads new texts from the Messages database, sends each one to the local Airlock server (`POST /api/message` with `channel: "imessage"`, one session per sender), and sends the server's reply back through the Messages app. All decisions stay in the server: the risk gate, the 60-second confirmation and the 0.01 ETH cap behave exactly as they do in the GUI.

Code: `server/src/imessage/`. Run it with `npm run imessage` in `server/`.

## One-time setup (macOS)

1. **Full Disk Access.** The Messages database is protected. In System Settings > Privacy & Security > Full Disk Access, turn on the app that will run the bridge (Terminal, iTerm, or your editor). Quit and reopen that app afterwards. Without this, the bridge prints the same instruction and exits.
2. **Automation.** The first time it sends a reply, macOS asks whether that app may control Messages. Allow it.
3. **Messages signed in.** The Mac must be signed into iMessage, and must stay awake and plugged in while people text it. People text the phone number or Apple ID that the Mac is signed in with.
4. **Allowlist.** Set `IMESSAGE_ALLOWLIST` in `airlock/.env` to a comma-separated list of phone numbers and emails that may use the line, for example `+17165550100,me@example.com`. Numbers match by digits, so formatting and a +1 prefix do not matter. An empty list allows nobody, and the bridge refuses to start. `*` allows anyone who texts the line to request a testnet transfer (capped at 0.01 ETH); use it only for a demo where judges need to try it.

## Running it

1. Start the server: `npm run dev` in `server/`.
2. In a second terminal, from `server/`: `npm run imessage`. Add `-- --dry-run` to read and answer without sending anything; it prints what it would reply.
3. From an allowlisted phone, text the Mac's number.

## What it will not do

- It ignores anyone not on the allowlist, group chats, reactions (tapbacks) and messages with no text. It never replays old conversations: the first run starts after the newest message, and the last handled message is saved in `server/.data/imessage-cursor.json`, so a restart does not answer anything twice.
- It limits each sender to 8 messages a minute (`IMESSAGE_MAX_PER_MINUTE`) and ignores a text that is just one of its own replies coming back, so two bots can not loop.
- Its logs show only a masked sender (the last 4 digits) and the reply length, never message text.
- If the Airlock server is down, the sender gets "Airlock is not available right now. Nothing was sent." instead of silence.
- It opens the Messages database read-only and passes message text to AppleScript as an argument, never inside the script, so a text can not inject commands.

## Status

Code and tests are done (38 tests, including a throwaway database that mimics the Messages schema and the attributedBody format newer macOS versions use). Not yet verified live: reading a real incoming text and sending a real reply, which needs Full Disk Access and Automation to be granted on the demo Mac. Do that check before the demo.

## Limits to know

- One Mac, one line. If the Mac sleeps, signs out or loses its network, the line goes quiet.
- The Gemini free tier allows only a few requests a minute, so the plain-language note may be missing from some replies; the fixed lines (verdict, findings, full address, amount, YES or NO prompt) always appear.
- Replies are plain text. The Etherscan link appears in the text; iMessage shows it as a link.
