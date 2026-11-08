#!/usr/bin/env bash
# Sets up Airlock (server + GUI + HTTPS) on a fresh Ubuntu 24.04 Vultr VM.
# Run as root on the VM:   bash setup.sh <hostname>
# <hostname> is the name people will open, for example airlock.example.com, or
# <your-ip-with-dashes>.sslip.io (for IP 203.0.113.5 that is 203-0-113-5.sslip.io; no purchase needed).
# This script never asks for or writes a key. You paste the keys into /opt/airlock/.env yourself afterwards.
set -euo pipefail

HOST="${1:-}"
if [[ -z "$HOST" ]]; then echo "usage: bash setup.sh <hostname>"; exit 1; fi
if [[ $EUID -ne 0 ]]; then echo "run as root"; exit 1; fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ufw debian-keyring debian-archive-keyring apt-transport-https gpg

# Node 22
if ! command -v node >/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt 22 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi

# Caddy (automatic HTTPS)
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

# Firewall: SSH and web only. The Airlock server listens on 127.0.0.1 and is reachable only through Caddy.
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# App user and code
id airlock >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin airlock
if [[ -d /opt/airlock/.git ]]; then
  git -C /opt/airlock pull --ff-only
else
  git clone https://github.com/AkulxSharma/airlock.git /opt/airlock
fi
chown -R airlock:airlock /opt/airlock

# Settings file. Created once, never overwritten. Keys stay empty until you fill them in.
if [[ ! -f /opt/airlock/.env ]]; then
  cp /opt/airlock/.env.example /opt/airlock/.env
  sed -i "s|^ALLOWED_ORIGINS=.*|ALLOWED_ORIGINS=https://${HOST}|" /opt/airlock/.env
  sed -i "s|^PRIVATE_KEY_TESTNET=.*|PRIVATE_KEY_TESTNET=|" /opt/airlock/.env
  chown airlock:airlock /opt/airlock/.env
  chmod 600 /opt/airlock/.env
fi

# Install and build as the app user. The GUI learns the server's address at build time.
sudo -u airlock bash -c "cd /opt/airlock && npm run setup"
sudo -u airlock bash -c "cd /opt/airlock/app && NEXT_PUBLIC_API_URL=https://${HOST} npm run build"

# Services
cp /opt/airlock/deploy/vultr/airlock-server.service /etc/systemd/system/
cp /opt/airlock/deploy/vultr/airlock-app.service /etc/systemd/system/
sed "s/{{HOST}}/${HOST}/g" /opt/airlock/deploy/vultr/Caddyfile.template > /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --now airlock-server airlock-app
systemctl reload caddy || systemctl restart caddy

echo
echo "Airlock is installed. Next:"
echo "  1. nano /opt/airlock/.env   (paste GEMINI_API_KEY, ELEVENLABS_API_KEY, PRIVATE_KEY_TESTNET, IMESSAGE_CONFIRM_ALLOWLIST)"
echo "  2. systemctl restart airlock-server"
echo "  3. open https://${HOST}"
