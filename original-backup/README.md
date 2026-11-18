# Flag Clash Arena — Cloudflare Pages Package

Static, zero-build deployment package for **Flag Clash Arena** ready for Cloudflare Pages.

## Files Included

- `index.html` — Production entry point with full game code, mobile viewport/touch handling, Open Graph tags, and Google Fonts preconnect.
- `_headers` — Cloudflare Pages security headers, CSP, and cache-control rules.
- `wrangler.toml` — Cloudflare Pages configuration for Wrangler CLI or Git deployments (`pages_build_output_dir = "."`).
- `favicon.svg` — Vector app icon.
- `manifest.webmanifest` — Web App Manifest for fullscreen mobile launch.
- `robots.txt` — Search engine crawl rules.

## Option 1: Direct Upload (Fastest — No Git Needed)

1. Open the **Cloudflare Dashboard** and go to **Workers & Pages** → **Create** → **Pages** → **Upload assets**.
2. Enter a project name (for example, `flag-clash-arena`).
3. Upload this `.zip` file directly (all files are at the root of the archive, so `index.html` serves at `/`).
4. Click **Deploy site**.

## Option 2: Git Deployment (GitHub / Spck Editor)

1. Extract the contents of this ZIP into the root of your repository and push to your `master` (or `main`) branch.
2. In **Cloudflare Dashboard** → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**, select your repository.
3. Use these build settings:
   - **Framework preset**: `None`
   - **Build command**: *(leave blank)*
   - **Build output directory**: `.` (or leave blank / `/`)
4. Click **Save and Deploy**.

## Option 3: Wrangler CLI

```bash
npx wrangler pages deploy . --project-name=flag-clash-arena
```

## Edition Query Parameters

You can launch any specific edition directly via URL query string or hash:

- `/?edition=classic`
- `/?edition=rivalry`
- `/?edition=extreme`
- `/?edition=mystery`
- `/?edition=championship`
- `/?edition=60-second%20battle`
- `/?edition=storm`
- `/?edition=king`
- `/?edition=team`
- `/?edition=sudden`
- `/?edition=boss`
- `/?edition=chaos`
- `/?edition=power`
