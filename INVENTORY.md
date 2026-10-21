# INVENTORY — CPM Community Wall v3.5 (Phase 0)

Audited from source on branch base `0fafe69`. Frontend calls were extracted from every `fetch(` call in the four HTML pages and checked against the handler file, HTTP method, and the body/query fields each handler reads.

## Frontend → API route map

| Page | Call | Method | Payload / query | Handler file | Status |
|---|---|---|---|---|---|
| login.html | `/api/auth?action=login\|register` | POST | `username, password, confirmPassword` | api/auth.js | OK |
| admin.html | `/api/auth?action=login` | POST | `username, password` | api/auth.js | OK |
| admin.html | `/api/admin/analytics` | GET | — | api/admin/analytics.js | OK |
| admin.html | `/api/admin/users?q=&role=` | GET | `q, role` | **api/admin/user.js** | **MISMATCH → 404 (P0, fixed by rename to users.js)** |
| admin.html | `/api/admin/users` | POST | `action: update_role, targetUsername, role` | **api/admin/user.js** | **MISMATCH → 404 (P0, fixed)** |
| admin.html | `/api/admin/users` | POST | `action: ban, targetUsername, reason, hours` | **api/admin/user.js** | **MISMATCH → 404 (P0, fixed)** |
| admin.html | `/api/admin/sessions[?username=]` | GET | `username` | api/admin/sessions.js | OK (route); see R-05 |
| admin.html | `/api/admin/sessions` | POST | `action: revoke, sessionId` | api/admin/sessions.js | OK (route); see R-05 |
| admin.html | `/api/admin/flags` | GET / POST | `action: set\|delete, key, enabled, description` | api/admin/flags.js | OK |
| admin.html | `/api/post` | POST | `action: pin, text, active, isAnnouncement` (`name` ignored by server) | api/post.js | OK |
| admin.html | `/api/admin/audit?limit=&action=&userId=` | GET | query | api/admin/audit.js | OK |
| admin.html | `/api/admin/vip-keys` | GET / POST | `action: create(type,count,durationDays) \| toggle(key) \| revoke(key)` | api/admin/vip-keys.js | OK |
| index.html | `/api/user/me` | GET | Bearer | api/user/me.js | OK |
| index.html | `/api/heartbeat` | POST | (empty body) | api/heartbeat.js | OK |
| index.html | `/api/post` | POST | `action: like\|delete, postId` / `action: pin` / `message, room, replyTo` | api/post.js | OK |
| settings.html | `/api/user/me` | GET | Bearer | api/user/me.js | OK |
| settings.html | `/api/user/change-username` | POST | `newUsername` | api/user/change-username.js | OK |
| settings.html | `/api/user/change-password` | POST | `oldPassword, newPassword` | api/user/change-password.js | OK |

**Result: there is one route mismatch (`/api/admin/users` vs `api/admin/user.js`), and it affects 3 call sites. All other paths, methods and field names match their handlers.**

Routes that exist but no frontend calls: `GET /api/auth?action=me`, `GET /api/post` (the feed is read straight from Firestore through the client SDK), `POST /api/user/me` (photoURL; settings.html stores the avatar only in localStorage).

## API endpoints

| Endpoint | Methods | Auth | Admin check |
|---|---|---|---|
| /api/auth | GET (me), POST (login/register) | none / Bearer for `me` | — |
| /api/post | GET (public), POST | Bearer for POST | Firestore `role==='ADMIN'` for delete/pin |
| /api/heartbeat | POST | none | — |
| /api/user/me | GET, POST | Bearer | — |
| /api/user/change-username | POST | Bearer | — |
| /api/user/change-password | GET, POST | Bearer | — |
| /api/admin/{analytics,users,sessions,flags,audit,vip-keys} | GET (+POST except analytics/audit) | Bearer | Firestore `users/{uid}.role==='ADMIN'` on every request |

## Firestore collections (written by the APIs)
users, posts, posts/*/likes, ip_logs, rate_limits, strikes, banned, pinned, audit_logs, feature_flags, vip_keys, visitors, presence, settings (read). Read but never written by any API: `sessions`, `fingerprint_bans`, `subnet_bans`, `subnet_whitelist`, `shadowbanned`.

## Client-side Firestore reads (index.html, web SDK)
`posts` (latest 100, onSnapshot) and `pinned/current`. These rely on `firestore.rules` allowing public reads, but **`firestore.rules` is not in this repo** (see R-03).

## Env vars
`FIREBASE_SERVICE_KEY` (required), `JWT_SECRET` (required, ≥32 bytes, enforced in auth.js), `GEMINI_API_KEY` (optional), `ALERT_WEBHOOK_URL` (optional).

## Core Files Inventory (Updated 2026-05-12)

| File | Updates |
|---|---|
| `index.html` | Profile Photo Overlay Button logic added. |
| `settings.html` | VIP Redeem Button and Profile Photo Overlay Button logic added. |
| `api/heartbeat.js` | Updated interval to 15s. |
| `vercel.json` | Rewrites for `/settings`, `/settings/`, `/sett`, `/sett/` to `/settings.html`. |

## LocalStorage Keys

* `cpm_profile_photo`
* `cpm_vip_key`

## UI Components

* Profile Photo Overlay
* VIP Redeem Button
* Online Dot
