#!/usr/bin/env bash
# Run ON the Oracle VM as ubuntu (after SSH login)
# Usage: bash setup-oracle.sh
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/stockladder}"
REPO_URL="${REPO_URL:-}"

echo "==> Stockladder Oracle setup (Always Free)"

sudo apt-get update
sudo apt-get install -y curl git ufw

# Node.js 22 (ARM/x86)
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# Caddy (free HTTPS)
if ! command -v caddy >/dev/null 2>&1; then
  sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
  sudo apt-get update
  sudo apt-get install -y caddy
fi

# PM2 process manager
if ! command -v pm2 >/dev/null 2>&1; then
  sudo npm install -g pm2
fi

# Firewall — SSH + web only
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
echo "y" | sudo ufw enable || true

# Oracle Ubuntu images often block ports via iptables — open 80/443
if sudo iptables -L INPUT -n 2>/dev/null | grep -q "REJECT"; then
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
  sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
  sudo netfilter-persistent save 2>/dev/null || sudo sh -c 'iptables-save > /etc/iptables/rules.v4' 2>/dev/null || true
fi

if [[ -n "$REPO_URL" && ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
fi

if [[ -d "$APP_DIR" ]]; then
  cd "$APP_DIR"
  npm install
  npm run build:web
fi

# Caddy config
if [[ -f "$APP_DIR/deploy/Caddyfile" ]]; then
  sudo cp "$APP_DIR/deploy/Caddyfile" /etc/caddy/Caddyfile
  sudo systemctl enable caddy
  sudo systemctl restart caddy
fi

mkdir -p "$APP_DIR/data/shops"

echo ""
echo "Next steps:"
echo "  1. Create $APP_DIR/.env (see .env.example — set PUBLIC_URL=https://stockladder.xyz)"
echo "  2. cd $APP_DIR && pm2 start server/index.js --name stockladder"
echo "  3. pm2 save && pm2 startup   # follow the printed command"
echo "  4. curl -I https://stockladder.xyz/api/health?shop=YOUR-STORE.myshopify.com"
