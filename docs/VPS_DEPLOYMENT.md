# VPS Deployment — Tugobo Lead Engine

**Target:** Hostinger KVM-2, Ubuntu, `lead.tugobo.com`
**Scope:** exact commands to take a fresh Ubuntu VPS to a running production
instance. For durable data (`LEAD_ENGINE_DATA_DIR`, backup, restore, the
single-process constraint), see `docs/HOSTINGER_DATA_STORAGE.md` — not
repeated here.

---

## 1. Layout

```
/opt/tugobo-lead-engine        app code (git checkout), owner tugobo:tugobo, 750
/var/lib/tugobo-lead-engine    durable data (LEAD_ENGINE_DATA_DIR), 700
/var/backups/tugobo-lead-engine  filesystem-level backup target, 700
/var/log/tugobo-lead-engine    PM2 stdout/stderr, 750
```

## 2. Runtime user

Dedicated non-root `tugobo`. No sudo, no password login required. Owns all
four directories above and runs PM2.

## 3. Packages

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git ca-certificates build-essential nginx ufw \
  certbot python3-certbot-nginx
```

Node ≥20.9.0 (Next 16.2.4's hard floor — see `package.json` `engines`).
Install via NodeSource or nvm, not the stock `apt` package. Enable Corepack
to pin pnpm exactly:

```bash
corepack enable
corepack prepare pnpm@10.32.1 --activate
node -v
pnpm -v
```

## 4. Clone the release tag

Repo is public — plain HTTPS clone, no deploy key needed.

```bash
sudo -u tugobo git clone https://github.com/Tubaggo/Tugobo-Lead-Engine.git /opt/tugobo-lead-engine
cd /opt/tugobo-lead-engine
sudo -u tugobo git fetch --tags
sudo -u tugobo git checkout <release-tag>   # detached HEAD, deliberate
git describe --tags --exact-match
```

## 5. Install and configure

```bash
sudo -u tugobo pnpm install --frozen-lockfile
```

Create `/opt/tugobo-lead-engine/.env.local` (mode 600, owner `tugobo`) with
the required names from `.env.example`. Then, as `tugobo`:

```bash
pnpm auth:setup
```

Run interactively, on-box. Never paste the password elsewhere.

## 6. Durable data

Follow `docs/HOSTINGER_DATA_STORAGE.md` §2–3 to create and verify
`/var/lib/tugobo-lead-engine`, then §5 onward for migrating or verifying
`operational-state.json` before first boot.

## 7. Build

```bash
cd /opt/tugobo-lead-engine
sudo -u tugobo pnpm build
```

Must exit 0 before starting PM2.

## 8. PM2

Config lives in the repo: `ecosystem.config.cjs`. Exactly one instance, fork
mode — see the file's own comment for why.

```bash
sudo -u tugobo pm2 start ecosystem.config.cjs
sudo -u tugobo pm2 status
sudo -u tugobo pm2 save
pm2 startup   # run the systemd command it prints, as tugobo
```

Verify Next is bound to loopback only, not all interfaces:

```bash
ss -ltnp | grep 3000   # expect 127.0.0.1:3000, not 0.0.0.0:3000
curl -sS http://127.0.0.1:3000/api/health
```

## 9. Nginx (HTTP first)

Create `/etc/nginx/sites-available/lead.tugobo.com`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name lead.tugobo.com;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        proxy_buffering off;
        proxy_read_timeout 60s;
        proxy_connect_timeout 60s;
    }
}
```

`X-Forwarded-Proto` is load-bearing, not cosmetic: `auth.ts` uses
`__Secure-`-prefixed session cookies once the request is seen as HTTPS, and
relies on this header for that detection.

```bash
sudo ln -s /etc/nginx/sites-available/lead.tugobo.com /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx   # only if nginx -t passed
```

## 10. DNS

```
Type: A
Name: lead
Value: <VPS IPv4>
TTL: 300 (raise once stable)
```

```bash
dig +short lead.tugobo.com
```

Wait for it to resolve consistently before Certbot.

## 11. Firewall

Enable **after** Nginx/DNS are confirmed working, so SSH isn't cut mid-setup:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status verbose
```

Port 3000 must never appear in this list. If Hostinger's panel firewall is
active, mirror the same allowlist (22, 80, 443) there too.

## 12. SSL

Only after DNS and plain HTTP both work:

```bash
sudo certbot --nginx -d lead.tugobo.com
sudo certbot renew --dry-run
```

Certbot rewrites the Nginx config in place, adding the 443 block and an
HTTP→HTTPS redirect. Ubuntu's `certbot` package installs its own renewal
timer — no manual cron needed.

## 13. Backup (filesystem layer)

`pnpm state:backup` (see `docs/HOSTINGER_DATA_STORAGE.md` §5) covers
`operational-state.json` only. A second, independent daily copy of the whole
`/var/lib/tugobo-lead-engine/` tree into `/var/backups/tugobo-lead-engine/`
(date-stamped, 14–30 day retention, `tugobo`-owned, mode 700) is required to
also protect `hermes-runtime.json`. This is same-VPS defense only — copying
it off-box periodically is a future operational requirement, not covered by
this sprint.

## 14. Acceptance

```bash
curl -i https://lead.tugobo.com/api/health   # 200, storage ready
pm2 list                                     # exactly 1 process, fork mode
curl -m 3 http://<vps-ip>:3000               # must fail from outside
```

Full checklist in the v3.9.0 discovery report (auth, persistence-after-restart,
external-action safety).

## 15. Rollback

Code: `git checkout <previous-tag> && pnpm install --frozen-lockfile && pnpm build && pm2 restart tugobo-lead-engine`.
Data: restore from backup per `docs/HOSTINGER_DATA_STORAGE.md` §7 — never
rolled back automatically alongside code.
