# Flag Clash Arena — Source-Code Audit, Architecture & Security Notes

## 1. Brief Source-Code Audit (Pre-Integration Baseline)
- **Original Structure**: Single-file HTML5 Canvas application (`index.html`, 2,899 lines / 188 KB) with zero external build tools, deployed on Cloudflare Pages (`wrangler.toml`, `_headers`, `manifest.webmanifest`, `favicon.svg`, `robots.txt`).
- **Core Systems**:
  - 76 flag definitions in `DATA` and 55 approved nations in `APP_NAMES`/`APP`; `BAN` set and `validCountry()` already excluded Israel.
  - 13 editions (`EDS`) with 7 specialized mode controllers (`STORM`, `KING`, `TEAM`, `SUDDEN`, `BOSS`, `CHAOS`, `POWER`), `EV` surprise event controller, and `tourney`/`champ`/`achievementRecords`/`life`/`S` persistence across 21 `fca_*` `localStorage` keys.
  - Web Audio API (`AC`, `MG`) routed both music and SFX through a single master gain node (`MG`), and announcer speech ran via `speechSynthesis`.
  - Original `isW(f)` protected `F[0]` in non-fair editions for rotation; updated so Normal Competitive matches let physics determine the winner while Operator-Controlled Showcase matches explicitly protect only the operator-selected showcase winner and isolate results.

## 2. Architecture Overview
- **Strict Separation**:
  - `/` (`index.html`) is purely the audience-facing game display with zero administrative UI controls.
  - `/admin.html` (`admin.css`, `admin.js`) is a separate operations dashboard that renders only a login gate until `/api/admin/session` confirms a valid server-signed session.
  - `/api/admin/*` (`functions/api/admin/*.js`) runs on Cloudflare Pages Functions using the native Web Crypto API (`crypto.subtle`) with zero npm dependencies.
- **Live Communication**:
  - Every admin action is first authorized server-side via `POST /api/admin/action` (verifying HttpOnly cookie signature, expiration, revocation, Same-Origin, CSRF header, Israel exclusion, and parameter bounds).
  - Once authorized, the Admin Control Center dispatches the validated command to the Audience Display tab over same-origin `BroadcastChannel('fca_admin_channel')`.
  - The Live Preview runs in an isolated iframe (`/?preview=1`) where `LS.set` is disabled so previewing overlays/effects can never mutate competitive data or disrupt the live match.

## 3. Security Controls Implemented
1. **No Hardcoded Credentials**: `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and `ADMIN_SESSION_SECRET` are read strictly from Cloudflare Pages server `env`. No `NEXT_PUBLIC_` variables are used.
2. **Fail-Closed Auth**: If any required environment variable/secret is missing or too short, `/api/admin/login` and `/api/admin/session` refuse access with `503 Service Unavailable`.
3. **Constant-Time Verification**: Credential and CSRF comparisons use HMAC-SHA256 digest XOR comparison (`timingSafeEqualStr`) to prevent timing side-channels.
4. **Secure Session Cookies**: Signed HS256 tokens stored in `HttpOnly; Secure; SameSite=Strict; Path=/` cookies with a 4-hour expiration (`SESSION_TTL_SEC = 14400`) and server-side `jti` revocation on logout.
5. **CSRF & Origin Protection**: Every mutating `/api/admin/action` request requires both a valid session cookie, matching `Origin`, and matching `X-FCA-Admin-CSRF` header.
6. **Brute-Force Rate Limiting**: Maximum 5 failed login attempts per IP within a 15-minute window; subsequent attempts return `429 Too Many Requests` with `Retry-After`.
7. **Zero Password Logging**: Passwords are never stored in cookies, `localStorage`, or audit logs.
8. **Dual-Layer Israel Exclusion**: Enforced both in the server API (`containsBannedCountry` returning `403`) and client engine (`BAN`, `BAN_RE`, `validCountry()`, pool sanitizer, and backup restore validator).

## 4. Known Limitations (Honest Scope Disclosure)
- **Same-Browser Control Transport**: In this phase (no cloud database / WebSockets / multi-operator cloud infrastructure), the Admin Control Center communicates with the Audience Display tab via `BroadcastChannel` and `localStorage` on the same browser and origin. Controlling a game running on a completely separate physical computer over the internet would require adding a Cloudflare Durable Object or WebSocket relay in a future phase.
- **Edge Isolate Rate Limiting & Audit Log**: Without an optional `ADMIN_KV` namespace bound, login rate-limit counters, revoked token `jti`s, and server audit logs are stored per Cloudflare edge isolate in memory. Binding a free-tier Cloudflare KV namespace named `ADMIN_KV` makes rate limits and revocations globally consistent across edge POPs.
- **Offline Audience & Gift Integrations**: Per scope rules, social media APIs (TikTok, YouTube, Twitch) and OBS WebSockets are not connected in this phase. The standardized `window.__FCA_EVENT_BUS__` interface is ready for future adapters.
- **Local File (`file://`) Opening**: Because authentication runs server-side via Cloudflare Pages Functions, `/admin.html` must be served through Cloudflare Pages (or `npx wrangler pages dev .`), not opened directly from disk as `file://`.
