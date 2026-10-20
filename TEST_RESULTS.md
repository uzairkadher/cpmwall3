# TEST_RESULTS — Phase 0

## Environment
- Node 20.20.2 (nvm), `npm install` of package.json deps (npm audit: 7 moderate, 2 high, not addressed in this PR).
- `npx vercel dev` could not run: it needs Vercel credentials ("No existing credentials found. Please log in").
- Instead I used a **local harness** that copies Vercel's filesystem routing: `/api/<path>` runs `api/<path>.js`, a missing file returns 404, and clean URLs are served. It used a dummy `JWT_SECRET` and a dummy Firebase service account. **This is not a real Vercel deployment.** It proves which route resolves and that the auth gate works. It can't test Firestore-backed behaviour.
- Full raw curl transcript (commands + headers + bodies): [`evidence/phase0_curl.log`](evidence/phase0_curl.log).

## P0 route fix: `/api/admin/users`
| # | Request | Before rename | After rename | Expected |
|---|---|---|---|---|
| 1 | `GET /api/admin/users` | **404** `{"error":"Not found"}` | **401** `Authentication required.` | not 404 ✅ |
| 2 | `GET /api/admin/users?q=&role=` + `Origin: https://cpmwall.tech` | — | **401** | not 404 ✅ |
| 3 | `POST /api/admin/users` `{"action":"update_role",...}` no token | — | **401** | not 404 ✅ |
| 4 | `GET /api/admin/users` + valid HS256 JWT (`TESTADMIN`) | — | **500**: the handler got to the Firestore role lookup, which failed with `16 UNAUTHENTICATED` because the service account is a dummy | JWT accepted. A real role check needs real Firebase creds ⚠️ |
| 5 | `GET /api/admin/user` (old singular path) | — | **404** | 404 ✅ |

## Other endpoints: none return 404
| Endpoint | Status (no token) | Why |
|---|---|---|
| GET /api/admin/analytics | 401 | auth gate |
| GET /api/admin/audit | 401 | auth gate |
| GET /api/admin/flags | 401 | auth gate |
| GET /api/admin/sessions | 401 | auth gate |
| GET /api/admin/vip-keys | 401 | auth gate |
| GET /api/auth | 400 | no `action` |
| POST /api/heartbeat | 503 | Firestore unavailable (dummy creds) |
| GET /api/post | 500 | Firestore unavailable (dummy creds) |
| GET /api/user/change-password | 401 | auth gate |
| POST /api/user/change-username | 401 | auth gate |
| GET /api/user/me | 401 | auth gate |
| GET /admin (clean URL) | 200 | static page |

## Not yet tested (needs real Firebase + Vercel)
- An ADMIN-role user loading, updating the role of, and banning a user from admin.html against real Firestore.
- The 5/min post rate limit (429 on the 6th post) against real Firestore.
- CORS rejection on the deployed domain.

# TEST_RESULTS — Phase 1 Wall (commit 7617f68)
Raw log: [`evidence/phase1_wall.log`](evidence/phase1_wall.log). Headless Chrome (playwright-core over CDP) against the local harness. Firestore Web SDK modules replaced in-browser by a mock (4 posts + pinned), `/api/post` mocked with a 1.5 s delay.

| Check | Before (2118abf) | After (7617f68) |
|---|---|---|
| Rapid submit (Enter, Enter, click, Enter) → POST /api/post calls | **4** | **1** ✅ |
| `#sendBtn` while request in flight | enabled | `disabled`, `aria-busy="true"` ✅ |
| `#sendBtn` after response | — | re-enabled, input cleared ✅ |
| Feed renders mocked posts | 4 | 4 ✅ |
| Page errors (/, 1280 and 390 wide) | 0 | 0 ✅ |
| Page errors (/login, /settings, /admin with new tokens) | 0 | 0 ✅ |
| DOM IDs (index/login/settings/admin) | 25/11/15/42 | identical ✅ |

Not tested: real Firestore feed, real posting, rate limit, likes against production.

# TEST_RESULTS — R-02 Admin ban enforcement (commit dd283d079df26c61d6c71383531a5498524093d1)

Raw terminal/curl transcript and seed/helper script: [`evidence/r02_ban.log`](evidence/r02_ban.log), [`evidence/r02_seed.mjs`](evidence/r02_seed.mjs).

**This proof ran against the Firestore emulator only. It is not a test of production Firestore or Vercel.** The baseline comparison used PR #3 code at `c67f23b` with a fresh emulator wipe. Both harnesses used throwaway `demo-cpm` service-account JSON with freshly generated RSA keys and the local-only JWT secret. Requests supplied both `x-forwarded-for` and `x-vercel-forwarded-for`; the handler trusts the latter. The same-IP rate-limit record was deleted before each CAROL post test.

| Scenario | Before (PR #3 `c67f23b`) | After (`dd283d0`) |
|---|---:|---:|
| BOB posts from `203.0.113.7` before ban | 200 | 200 |
| ADMINU bans BOB for one hour | 200; banned doc ID was raw `203.0.113.7` | 200; banned doc ID was SHA-256 `fec52565aa0cf18f57d7cf5b3ac728503b8992d2d6f7d46da1d1201090902b02` |
| BOB posts from `198.51.100.9` while account ban is active | 200 | 403, `Your account is banned from posting.` |
| BOB likes seeded post while account ban is active | 200 | 403, `Your account is banned from posting.` |
| CAROL posts from BOB's banned IP `203.0.113.7` | 200 | 403, `Posting is restricted for this network.` |
| BOB posts after `bannedUntil` is set in the past and network ban doc is deleted | Not run | 200; `users/BOB.isBanned` remained `true` |

No `fingerprint_bans` documents were seeded; the collection dump showed count `0` in both runs. The raw log preserves an initial fixed-branch CAROL test request mistakenly signed as ADMINU (which bypassed network-ban enforcement); it is explicitly excluded from the result above. The corrected request used CAROL's JWT and returned 403.
