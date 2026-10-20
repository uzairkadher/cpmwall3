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

## Phase 1 Wall draft/reply preservation (PR #3 follow-up, commit 85359c3130b54fde59e8c839f67a2ef8bbf8d0f6)

Browser proof, not curl: headless Chrome via Playwright/CDP against the local harness, with mocked Firestore and `/api/post` responses and a 1.5 s POST delay. This is mock-only evidence, not production verification. Raw output: [`evidence/phase1_wall_draft.log`](evidence/phase1_wall_draft.log).

| Check | Result |
|---|---|
| Normal send with HTTP 200 | Input cleared |
| Replace `first` with `second draft` while POST is pending | `second draft` remained after 200 |
| Change reply target from post A to post B while POST is pending | B remained selected after 200; a normal reply send then cleared the target |
| Failed POST (500) | Input remained |
| Four rapid Enter presses | Exactly one POST |
| Page errors / `index.html` DOM IDs vs `main` | 0 / identical |
| Rejected POST / network failure | Exact uncertain-outcome toast; input remained |
