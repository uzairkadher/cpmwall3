# Flag Clash Arena — Essential Admin Control Center (Cloudflare Pages Package)

Production-ready, zero-build Cloudflare Pages deployment package for **Flag Clash Arena** with an integrated, server-authenticated **Admin Control Center**.

## Package Contents (Flat-Root Ready for Cloudflare Pages)

- `index.html` — Audience-facing Flag Clash Arena game display (all 13 editions, Classic physics lock, non-invasive admin engine bridge, preview sandbox `?preview=1`, zero public admin controls).
- `admin.html`, `admin.css`, `admin.js` — Separate dark-themed Admin Control Center with 12 operational sections, confirmation dialogs, emergency stop, and isolated live preview.
- `functions/_lib/auth.js` — Web Crypto HMAC-SHA256 session signing, constant-time credential verification, brute-force rate limiting, CSRF verification, and server-side Israel exclusion.
- `functions/api/admin/login.js`, `logout.js`, `session.js`, `action.js`, `audit.js` — Server-side authenticated Cloudflare Pages Functions.
- `_headers` — Security headers, CSP, `no-store` for `/admin*` and `/api/*`, and `X-Frame-Options: DENY` for `/admin.html`.
- `wrangler.toml`, `favicon.svg`, `manifest.webmanifest`, `robots.txt` — Preserved Cloudflare Pages configuration and web assets.
- `original-backup/` — Untouched original backup of all 7 files from the initial package.
- `docs/` — Complete documentation:
  - `docs/ADMIN_PANEL_GUIDE.md` — Feature summary & operator instructions.
  - `docs/SECURITY_AND_ARCHITECTURE.md` — Source-code audit, architecture, Cloudflare Secrets setup, and known limitations.
  - `docs/CHANGELOG.md` — Detailed changelog.
  - `docs/TEST_REPORT.md` — Verified automated test report.

## Required Cloudflare Pages Environment Variables & Secrets

The Admin Control Center **fails closed** (`503 Service Unavailable`) until all three variables are configured in Cloudflare Pages. Never hardcode credentials in HTML, JS, or CSS, and never use `NEXT_PUBLIC_` variables.

1. Open **Cloudflare Dashboard** → **Workers & Pages** → select your **Flag Clash Arena** Pages project → **Settings** → **Variables and Secrets**.
2. Add the following for **Production** (and **Preview** if desired):
   - **`ADMIN_USERNAME`** (Type: *Text* / Plaintext) — Your administrator username (e.g., `arena_owner`).
   - **`ADMIN_PASSWORD`** (Type: *Secret* / Encrypted) — Strong administrator password (minimum 8 characters; 16+ recommended).
   - **`ADMIN_SESSION_SECRET`** (Type: *Secret* / Encrypted) — Strong random secret (at least 32 random hex/base64 characters) used to sign HMAC-SHA256 session cookies. Generate one via `openssl rand -hex 32`.
3. *(Optional)* Bind a Cloudflare KV namespace named **`ADMIN_KV`** under **Settings → Functions → KV namespace bindings** if you want brute-force rate-limit counters and session revocations shared globally across all Cloudflare edge isolates.
4. **Redeploy** the site after saving variables/secrets so Cloudflare Pages Functions pick up the new bindings.

## Deployment Options

### Option 1: Git Deployment (Recommended for Pages Functions)
1. Extract this flat-root ZIP into the root of your repository and push to `main`/`master`.
2. In Cloudflare Pages: **Framework preset**: `None`, **Build command**: *(blank)*, **Build output directory**: `.`.
3. Configure the three required Environment Variables & Secrets above and deploy.

### Option 2: Wrangler CLI
```bash
npx wrangler pages deploy . --project-name=flag-clash-arena
```

### Local Testing with Wrangler
Create a local `.dev.vars` file (never commit it to Git):
```ini
ADMIN_USERNAME=arena_owner
ADMIN_PASSWORD=YourStrongLocalPassword!
ADMIN_SESSION_SECRET=replace-with-at-least-32-random-characters
```
Then run:
```bash
npx wrangler pages dev .
```

## Accessing & Using the Admin Panel

1. Open the **Audience Display** at `/` (e.g., `https://your-site.pages.dev/`).
2. Open the **Admin Control Center** in a separate tab/window on the same browser at `/admin.html`.
3. Sign in using your configured `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
4. The top status pill will switch to **Audience Engine Live** as soon as both tabs are open on the same origin.
5. Use the left sidebar to operate Live Battles, Countries, Special Matches (Normal vs. Operator-Controlled Showcase), Audience Requests, Supporters, Tournaments, Settings, Visual/Audio, Live Preview, and Backups.
