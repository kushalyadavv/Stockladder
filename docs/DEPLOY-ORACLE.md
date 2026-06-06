# Deploy Stockladder on Oracle Cloud (Always Free) + DNS

Total cost: **$0/month** if you stay on Always Free shapes and don't add paid resources.

---

## Part A — Oracle account (one time, ~15 min)

### 1. Sign up

1. Go to [https://www.oracle.com/cloud/free/](https://www.oracle.com/cloud/free/)
2. Click **Start for free**
3. Complete registration (email, country, etc.)
4. Add a **credit/debit card** for identity verification — Oracle may place a small temporary hold; **you are not charged** if you only use Always Free resources
5. Choose a **Home Region** (cannot change later). Pick one close to you, e.g.:
   - US: `us-phoenix-1`, `us-ashburn-1`
   - EU: `eu-frankfurt-1`, `uk-london-1`
   - APAC: `ap-mumbai-1`, `ap-sydney-1`

### 2. Enable 2FA (recommended)

Console → profile icon → **My profile** → **Security** → enable two-factor authentication.

---

## Part B — Create the free VM (~10 min)

### 3. Generate SSH key on your Mac

```bash
ssh-keygen -t ed25519 -C "stockladder" -f ~/.ssh/stockladder_oracle
cat ~/.ssh/stockladder_oracle.pub
```

Copy the **entire** line starting with `ssh-ed25519`.

### 4. Create instance

1. Oracle Console → **☰** → **Compute** → **Instances** → **Create instance**
2. **Name:** `stockladder`
3. **Image:** Canonical **Ubuntu 24.04** (or 22.04)
4. **Shape:** Click **Change shape**
   - **Ampere** → **VM.Standard.A1.Flex** (ARM — best free tier)
   - Set **1 OCPU** and **6 GB RAM** (enough for Stockladder; saves free quota)
   - If you see **Out of host capacity**: try another **Availability domain**, wait and retry, or try a different home region in a new account (last resort)
5. **Networking**
   - Create new VCN / public subnet is fine (defaults)
   - ✅ **Assign a public IPv4 address**
6. **Add SSH keys** → Paste your public key
7. **Boot volume** → ✅ Specify custom size → **50 GB** (well under 200 GB free limit)
8. Click **Create**

Wait until state = **Running**. Copy the **Public IP address** (e.g. `123.45.67.89`).

### 5. Open firewall ports (Oracle Security List)

1. On the instance page → click the **Subnet** link
2. Click the **Security list** for that subnet
3. **Add ingress rules:**

| Source CIDR | Protocol | Dest port | Description |
|-------------|----------|-----------|-------------|
| `0.0.0.0/0` | TCP | 22 | SSH |
| `0.0.0.0/0` | TCP | 80 | HTTP (Let's Encrypt) |
| `0.0.0.0/0` | TCP | 443 | HTTPS |

### 6. Test SSH

```bash
ssh -i ~/.ssh/stockladder_oracle ubuntu@YOUR_PUBLIC_IP
```

If it connects, you're good.

---

## Part C — Point DNS at the server (~5 min + propagation)

Where you bought **stockladder.xyz** (Namecheap, Cloudflare, Google Domains, etc.):

### 7. DNS records

| Type | Host | Value | TTL |
|------|------|-------|-----|
| **A** | `@` | `YOUR_PUBLIC_IP` | 300 (or Auto) |
| **A** | `www` | `YOUR_PUBLIC_IP` | 300 |

**Cloudflare users:** set proxy to **DNS only** (grey cloud) until HTTPS works, then you can enable proxy.

Check propagation (5–30 min usually):

```bash
dig stockladder.xyz +short
```

Should return your Oracle public IP.

---

## Part D — Install Stockladder on the VM (~15 min)

### 8. Push code to GitHub first (private repo)

On your Mac:

```bash
cd "/Users/kushalyadav/Downloads/Shopify Resort"
git init
git add .
git commit -m "Stockladder initial deploy"
# Create private repo on GitHub, then:
git remote add origin https://github.com/YOUR_USER/stockladder.git
git push -u origin main
```

### 9. Run setup script on the server

SSH into the VM, then:

```bash
export REPO_URL="https://github.com/YOUR_USER/stockladder.git"
curl -fsSL "$REPO_URL/raw/main/deploy/setup-oracle.sh" -o setup-oracle.sh
# Or clone first and run locally:
git clone "$REPO_URL" ~/stockladder
bash ~/stockladder/deploy/setup-oracle.sh
```

### 10. Production `.env` on the server

```bash
nano ~/stockladder/.env
```

```env
SHOPIFY_CLIENT_ID=your_client_id
SHOPIFY_CLIENT_SECRET=your_client_secret
PUBLIC_URL=https://stockladder.xyz
PORT=3001
NODE_ENV=production
```

Do **not** set `ALLOW_DEV_PLAN_SWITCH=true` in production.

### 11. Start the app

```bash
cd ~/stockladder
pm2 start server/index.js --name stockladder
pm2 save
pm2 startup
# Run the command pm2 prints (starts app on reboot)
```

Caddy should already serve HTTPS. Test:

```bash
curl -I "https://stockladder.xyz/api/health?shop=YOUR-STORE.myshopify.com"
```

---

## Part E — Shopify (after HTTPS works)

1. [dev.shopify.com/dashboard](https://dev.shopify.com/dashboard) → App → **URLs**
   - App URL: `https://stockladder.xyz`
   - Redirect: `https://stockladder.xyz/auth/callback`
2. Update `shopify.app.toml` with the same URLs + real `client_id`
3. On server: `npm run webhooks:register`

---

## Staying at $0 — avoid these

| Action | Risk |
|--------|------|
| Creating paid shapes (without Always Free label) | Charges |
| Leaving $300 trial credits on paid services after trial | Charges |
| Extra block volumes / unused boot volumes | Can block free quota |
| Load balancers, NAT gateways (paid tier) | Charges |

Stick to: **1× VM.Standard.A1.Flex** (1 OCPU / 6 GB), **≤50 GB** boot volume, **Caddy** for SSL.

---

## Troubleshooting

**Out of host capacity** — Retry later, different availability domain, or 1 OCPU instead of 4.

**Site not loading after DNS** — Check Oracle security list (80/443), `sudo ufw status`, and Caddy: `sudo systemctl status caddy`.

**HTTPS certificate failed** — DNS must point to the server before Caddy can issue certs. Wait for `dig stockladder.xyz` to show the right IP.

**App 502** — `pm2 logs stockladder`, confirm `.env` exists and `pm2 status` shows online.
