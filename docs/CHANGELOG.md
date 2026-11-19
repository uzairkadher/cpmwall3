# Changelog — Flag Clash Arena Admin Control Center

## v2.0.0 — Essential Admin Panel Integration
### Added
- **Cloudflare Pages Functions Auth & Security Backend** (`functions/_lib/auth.js`, `functions/api/admin/login.js`, `logout.js`, `session.js`, `action.js`, `audit.js`):
  - Server-side authentication via Cloudflare Pages Environment Variables & Secrets (`ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET`).
  - `HttpOnly; Secure; SameSite=Strict` signed session cookies, 4-hour expiration, logout token revocation, CSRF header verification, brute-force rate limiting, bounds validation, and server-side audit logging.
- **Separate Admin Control Center** (`admin.html`, `admin.css`, `admin.js`):
  - Dark-themed responsive gaming operations dashboard with 12 sections: Dashboard, Live Battle Control, Country Management, Special Match Control, Audience & Comments, Gifts & Supporters, Tournaments & Championship, Settings & Balancing, Visual & Audio, Achievements & Hall of Fame, Live Preview, and Backups & Security.
  - Persistent top-bar **Emergency Stop** button and reusable confirmation dialogs (with typed confirmation for destructive resets/restores).
- **Game Engine Bridge & Internal Event Bus** (`index.html`):
  - Non-invasive `window.__FCA_ADM__` bridge and `BroadcastChannel('fca_admin_channel')` sync.
  - Split Web Audio master gain into independent `MUSIC_G` and `SFX_G` buses plus Voice Announcer toggle.
  - Added Classic Mode Physics Lock, validated gameplay multipliers, hit-stop, bounded screen shake, and slow-motion toggle.
  - Added Operator-Controlled Showcase mode with visible `"OPERATOR-CONTROLLED SHOWCASE"` canvas banner and isolated `fca_showcase_results` storage.
  - Added bounded supporter effects (`shield_boost`, `speed_boost`, `recovery_nudge`) and standardized `window.__FCA_EVENT_BUS__`.
  - Added isolated `/?preview=1` sandbox mode for safe overlay/effect inspection.
- **Untouched Original Backup**: Preserved all 7 original files in `original-backup/`.

### Changed
- Updated `_headers` with strict `no-store` caching and `X-Frame-Options: DENY` for `/admin.html` while keeping `SAMEORIGIN` on `/` for the Admin Live Preview iframe.
- Hardened Israel exclusion regex (`BAN_RE`) across both client engine and server API endpoints.
- Updated `isW(f)` so Normal Competitive matches let physics decide the winner while Showcase matches explicitly protect only the operator-selected showcase winner.
