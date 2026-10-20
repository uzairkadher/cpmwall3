# RISKS — Phase 0 security / code review

Scope: all 12 handlers in `api/`, the 4 HTML pages, `vercel.json`. Reviewed by reading the source on base `0fafe69`. Each risk cites the code it comes from. **Severity** is my own judgment. Items marked *(verify)* depend on config that isn't in the repo.

## P0 — fix before relying on it
| ID | Risk | Evidence | Fix |
|---|---|---|---|
| R-01 | **Admin user management returned 404.** The frontend calls `/api/admin/users`, but the file was `api/admin/user.js`. | admin.html:432,470,486 | **Fixed in this PR:** renamed to `api/admin/users.js` (curl proof in TEST_RESULTS.md) |
| R-02 | **Admin "ban user" has no effect.** The `ban` action sets `users/{u}.isBanned` and writes `banned/{rawIp with chars replaced}`. But post.js looks up `banned/{sha256(ip)}` and never reads `isBanned`. auth.js login doesn't check it either. A banned user can still log in and post. | admin/user.js:316-337 vs post.js:443,453; auth.js has no isBanned check | Use the same hashed ipKey in both places. Reject `isBanned` users (respecting `bannedUntil`) in post.js and at login. |
| R-03 | **`firestore.rules` is missing from the repo.** index.html reads `posts` and `pinned/current` directly through the web SDK. The zero-trust rule (`allow write: if false`) can't be checked or deployed from source. *(verify in the Firebase console)* | index.html:979,997; no firestore.rules file | Add `firestore.rules`: global `allow write: if false`, and read access only for `posts` and `pinned`. |
| R-04 | **Shadowban doesn't hide posts.** Clients read `posts` straight from Firestore and `buildBubble` never checks `isShadowbanned`. The GET /api/post filter checks `post.isShadowbanned` on an object that doesn't have that field, so it filters nothing. | post.js:247-262; index.html:837+ | Filter on the client (show only your own shadowbanned posts), or move shadowbanned posts to a separate collection. Fix the field in the GET map. |
| R-05 | **Session revoke does nothing.** No handler ever writes the `sessions` collection, and `verifyJwt` never checks it. Revoking or banning cannot invalidate a JWT, which lives for 30 days. | auth.js:14,signJwt; grep finds `sessions` only in admin/sessions.js | Write a session doc (jti) at login and check it in verifyJwt, or add a `tokenVersion` on the user that is bumped on ban or password change. |

## P1
| ID | Risk | Evidence | Fix |
|---|---|---|---|
| R-06 | **No brute-force or abuse limit on login or register.** The 5/min Firestore limit only applies to new posts. Passwords can be as short as 6 characters. | auth.js handler; post.js:537 | Apply the same `rate_limits` transaction to auth (per IP and per username). |
| R-07 | **CORS allows any `*.vercel.app` origin, plus `null`/`file://`/no Origin.** Anyone can deploy `evil.vercel.app`. The impact is limited because auth uses Bearer tokens in localStorage, not cookies, but it breaks the "allowlist only" rule. The allowlist is copy-pasted into all 12 files. | e.g. auth.js:17-29 | Allow only exact origins (add the specific preview URLs if needed). Move CORS into one shared module. |
| R-08 | **A user can rename themselves to a reserved handle (e.g. `ADMIN`) and get the ADMIN badge.** change-username doesn't check `RESERVED_HANDLES`, and index.html decides the admin badge by `name === 'ADMIN'`, not by role. | change-username.js:170; index.html:840 | Check RESERVED_HANDLES on rename. Render the badge from the stored `post.isAdmin`. |
| R-09 | **Unbounded writes and cost on `/api/heartbeat`.** It is unauthenticated, writes to `visitors` and `presence`, and runs a count query on every call. | heartbeat.js | Throttle per IP, or skip the write if the record was seen less than 30s ago. |
| R-10 | **No CSP header. DOMPurify is loaded from a CDN without SRI.** | vercel.json; index.html:7, admin.html:8 | Add a Content-Security-Policy header and an `integrity=` hash on the DOMPurify script. |
| R-11 | **`like` and the Gemini bot reply aren't rate-limited.** Each `@Apex_Racer` post triggers a paid Gemini call. The bot reply is written outside the rate-limit transaction. | post.js:360,622 | Count bot invocations in the rate limit. |

## P2 / hygiene
- R-12 `verifyStoredPassword` returns `needsUpgrade: true` for passwords already hashed with bcrypt, so every login re-hashes (12 rounds) and writes the user doc. (auth.js:212-215)
- R-13 Legacy SHA-256 hashes with a static salt (`cpm_salt_2025`) are still accepted. They get migrated on login, but accounts that never log in stay weak.
- R-14 `registerUser()` is dead code (auth.js:218). The register path takes the IP from the spoofable `x-forwarded-for`, while other handlers use `x-vercel-forwarded-for`.
- R-15 VIP expiry (`vipExpiresAt`) is never enforced. `isVip` is a plain boolean. (post.js:304, me.js)
- R-16 The Firebase web API key is split into `_k1 + _k2` in index.html. This hides nothing; web API keys are public by design. Security relies on firestore.rules (R-03).
- R-17 Duplicated `getDb`/CORS/`getClientIp` code in 12 files makes fixes drift (getClientIp differs between files: post.js rejects "unknown", user.js doesn't).

## What's already good (checked)
- JWT: HS256 only, alg header checked, timing-safe comparison, `exp` enforced, secret must be ≥32 bytes.
- Every admin handler checks the **current Firestore role** (`role === 'ADMIN'`) on each request. It never trusts JWT claims. There is no `ADMIN_KEY` anywhere.
- The post rate limit is a Firestore transaction (5 per 60s, plus slow mode). There is no in-memory state.
- Every `innerHTML` sink in the HTML is wrapped in `DOMPurify.sanitize`, and post text and author use `textContent`. The `escapeHtml` helper in admin.html is used before sanitizing.
- Admin `users` responses use an explicit field allowlist (`safeUserRecord`). Password hashes are never returned.
