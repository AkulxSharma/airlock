# Deploying Airlock on Vultr

This puts the Airlock server and the website on one Vultr cloud server with HTTPS, which also qualifies for the MLH "Best Use of Vultr" prize (deploy your project on Vultr cloud compute). Everything runs on Sepolia test ETH only.

## What runs where

- **On the Vultr server:** the Airlock server (audits, risk gate, testnet send, live feed), the website, and Caddy, which gets the HTTPS certificate and sends each request to the right place. The Airlock server listens only on the server's own loopback address, so the only way in is through Caddy on ports 80 and 443.
- **On your Mac:** the iMessage bridge. It needs the Messages app and Full Disk Access, so it cannot move. It sends each text to the Vultr server over HTTPS, and the website then shows those texts live.

## What you need to do yourself

1. Create a Vultr account and claim the free credits from the MLH link in the hackathon materials.
2. In Vultr, deploy a **Cloud Compute** server with **Ubuntu 24.04**. Choose a plan with at least 2 GB of memory, because building the website needs it. Note its IP address.
3. Decide the address people will open. Either use a domain you own and point an A record at the IP, or use a free name built from the IP with dashes, for example `203-0-113-5.sslip.io` for the IP 203.0.113.5. No purchase is needed for the second option.
4. Make a **new** testnet wallet for this server and fund it with a small amount of Sepolia ETH (0.1 is plenty). Do not reuse a wallet that holds anything of value.

## Install (about 5 minutes)

On the server, as root:

```
git clone https://github.com/AkulxSharma/airlock.git /opt/airlock
bash /opt/airlock/deploy/vultr/setup.sh 203-0-113-5.sslip.io
```

Use your own hostname in place of the example. The script installs Node 22 and Caddy, opens only SSH, HTTP and HTTPS in the firewall, builds the website, and starts both services. It never asks for a key and never writes one.

Then fill in your keys yourself:

```
nano /opt/airlock/.env
```

Set at least these lines, then save:

- `PRIVATE_KEY_TESTNET` the new wallet's key (without it, sending is turned off and audits still work)
- `GEMINI_API_KEY` and `ELEVENLABS_API_KEY`
- `AIRLOCK_BRIDGE_TOKEN` a long random string (for example the output of `openssl rand -hex 24`)
- `DAILY_CAP_ETH` keep the default of 0.05 or lower

Restart the server with `systemctl restart airlock-server`, then open `https://<your hostname>`. The Wallets page should list the agent wallet and the demo contracts.

## Point the iMessage bridge at it

On your Mac, add these two lines to `airlock/.env` (the same file the bridge already reads), using the same token you put on the server, then restart the bridge with `npm run imessage` in `server/`:

```
AIRLOCK_SERVER_URL=https://<your hostname>
AIRLOCK_BRIDGE_TOKEN=<the same string>
```

Texts to your Mac now go to the Vultr server, and each one appears on the website as it happens. The token matters: without it, anyone on the internet could post pretending to be an iMessage sender, forge a confirmation or fill the live feed with fake messages. With the token set, the server refuses any `imessage:` session that does not carry it.

## Things to know before making it public

- **Anyone who opens the website can run audits and, after a YES, send test ETH from this wallet.** The limits are 0.01 ETH per transfer and `DAILY_CAP_ETH` per day, and the wallet only holds what you put in it. `IMESSAGE_CONFIRM_ALLOWLIST` limits who can confirm over iMessage only; it does not limit the website.
- Gemini and ElevenLabs calls from the website spend your keys' quota. Watch it, or turn the keys off after the judging.
- Sepolia ETH is free, so top the wallet up from a faucet rather than putting more in at once.
- To update later: `git -C /opt/airlock pull`, then rebuild with `sudo -u airlock bash -c "cd /opt/airlock/app && NEXT_PUBLIC_API_URL=https://<your hostname> npm run build"` and `systemctl restart airlock-server airlock-app`.
- To take it down: `systemctl disable --now airlock-server airlock-app`, or delete the Vultr server, which also stops the billing.
- Logs: `journalctl -u airlock-server -f` and `journalctl -u airlock-app -f`.

## For the Devpost submission

Add Vultr to the "Built with" tags only after the server is really running there, and put the live URL in the project links.
