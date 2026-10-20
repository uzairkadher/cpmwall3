# AI System Context: CPM Community Wall v3.5 (Empire Studio)

**Summary:** Vercel serverless + Firestore SPA enforcing zero-trust client rules, stateless APIs, dynamic multi-origin CORS, and DOMPurify XSS mitigation. UI follows the Phase 1 Empire Visual Identity (`design-tokens.css`).

**Auth Rule:** Custom JWT (`api/auth.js`) + Firestore `users/{uid}.role === 'ADMIN'` verification. **DO NOT USE FIREBASE AUTH.**

**Environment Variables:**
- `FIREBASE_SERVICE_KEY` (Required: Admin SDK JSON object)
- `JWT_SECRET` (Required: Key for signing/verifying custom JWTs)
- `GEMINI_API_KEY` (Optional: Google AI endpoint key for @Apex_Racer)
- `ALERT_WEBHOOK_URL` (Optional: Discord/Slack webhook for 3-strike alerts)
- *Note: `ADMIN_KEY` is completely deprecated and removed.*

**Collections Quick Ref:** `users`, `posts`, `sessions`, `rate_limits`, `audit_logs`, `feature_flags`, `visitors`, `presence`, `ip_logs`, `ip_notes`, `banned`, `subnet_bans`, `fingerprint_bans`, `shadowbanned`, `strikes`, `vip_members`, `vip_banned`, `settings`, `pinned`, `payments`.

**CRITICAL "DON'T BREAK" RULES:**
1. **NO FIREBASE AUTH:** Only use the established custom JWT implementation.
2. **NO `ADMIN_KEY`:** Admin authorization relies purely on JWT Bearer token + Firestore DB role lookup.
3. **VERCEL IS STATELESS:** Do not use in-memory caches or LRU for rate limiting. Rely entirely on the Firestore `rate_limits` collection (5 requests/minute).
4. **ZERO-TRUST FIRESTORE:** `firestore.rules` MUST securely remain `allow write: if false;` globally.
5. **XSS MITIGATION:** Always render user data using `textContent`. If `innerHTML` is absolutely required, wrap it securely in `DOMPurify.sanitize()`.
6. **MULTI-ORIGIN CORS:** Use the dynamic `ALLOWED_ORIGINS` array + `isOriginAllowed()` checker configured for `cpmwall.tech`. Never use a wildcard `*` with credentials.
7. **UI CONSTRAINTS:** Preserve the Phase 1 Empire Visual Identity. Do not introduce external CSS frameworks, delete `design-tokens.css`, or alter protected DOM IDs.

---

# Change Log (newest first)

## [2026-10-20] PR #3 follow-up: draft-erase fix - DONE (commit 85359c3130b54fde59e8c839f67a2ef8bbf8d0f6)
- What: `sendPost()` preserves composer text and reply targets changed while a post is pending.
- Files: `index.html`, `evidence/phase1_wall_draft.log`, `AI_CONTEXT.md`, `blueprint.md`, `PROGRESS.md`, `TEST_RESULTS.md`.
- Verified: Mocked headless Chrome proof covered normal send, draft replacement, reply-target replacement and normal reply clearing, failed POST preservation, four rapid Enter presses producing one POST, zero page errors, and DOM IDs unchanged versus `main`. Evidence: `evidence/phase1_wall_draft.log`; mocks only, not production.
- Decisions: Clear the input only if it still equals the submitted text, and clear the reply target only if its object identity is unchanged.
- Tokens used: not tracked.

## [2026-10-20] PR #7 R-04 Shadowban hidden from public feed - DONE (commit d980bbb435d03c64621b5ec8cf903d302969d3b4)
- What: `GET /api/post` filters shadowbanned posts using raw Firestore data, includes a viewer's own posts for active sessions, and omits moderation state. The POST success response no longer reveals shadowban status; browser reads of `posts` are denied.
- Decision: Option B was chosen because there is no production access; option A (realtime feed with rules plus backfill) remains possible later.
- Decision: Shadowbanned users continue to see their own posts to preserve the illusion.
- Decision: The wall feed now uses five-second API polling instead of realtime Firestore updates.
- Files: `api/post.js`, `index.html`, `firestore.rules`, `blueprint.md`, `evidence/r04_seed.mjs`, `evidence/r04_proof.sh`, `evidence/r04_shadowban.log`, `AI_CONTEXT.md`, `PROGRESS.md`, `TEST_RESULTS.md`.
- Verified: Emulator curl proof and mocked-browser proof only; not production Firestore or Vercel. Anonymous readers exclude EVE's shadowbanned posts, EVE sees her own, invalid tokens get anonymous results, and POST omits the flag. Browser desktop/mobile rendered four posts without page errors; polling add/update/remove, visibility pause/resume, and single-submit behavior passed. Evidence: `evidence/r04_shadowban.log`. Vercel: all 3 PR #7 checks passed; previews DEPLOYED/Ready (https://cpmwall3-git-devin-1792510105-r04-shadowban-feed-kad-dev.vercel.app).
- Next: R-06 login rate limiting.
## [2026-10-20] PR #6 R-05 Session revoke enforced - DONE (commit baeb829b3f958c0240d2c81449f7c95fe845c9a6)
- What: Login and registration now create Firestore session documents and include `sid` in JWTs; every JWT-protected API route checks the session before protected work. Revoking a session invalidates its session-backed JWT.
- Decision: Legacy JWTs without `sid` remain valid until expiry to avoid logging everyone out at deploy; usernames are not compared to session records.
- Decision: Every authenticated request now adds one Firestore read for session validation; legacy no-`sid` tokens bypass that lookup.
- Files: `api/auth.js`, `api/post.js`, `api/admin/`, `api/user/`, `evidence/r05_seed.mjs`, `evidence/r05_sessions.log`, `AI_CONTEXT.md`, `blueprint.md`, `PROGRESS.md`, `TEST_RESULTS.md`.
- Verified: Fixed-branch and baseline curl scenarios ran against the Firestore emulator only. The fixed sessions query listed BOB, revocation returned 200, the revoked token returned 401 for `/api/user/me` and post, a new session and legacy token returned 200. Evidence: `evidence/r05_sessions.log`. Vercel: all 3 PR #6 checks passed; previews DEPLOYED/Ready (https://cpmwall3-git-devin-1792508888-r05-session-revoke-kad-dev.vercel.app).
- Next: R-04.
## [2026-10-20] PR #5 R-03 firestore.rules in repo - DONE (commit 2a77d7178f5e29bc630a036093a92f8605b78aec)
- What: Added `firestore.rules` with public read-only access to posts, pinned, and presence; all writes and all other browser reads are denied.
- Decision: R-03 initially allowed public post reads; R-04 supersedes that with server-API-only post reads. `firestore.rules` is the source of truth and must be deployed by the project owner.
- Files: `firestore.rules`, `firebase.json`, `evidence/r03_rules.log`, `AI_CONTEXT.md`, `blueprint.md`, `PROGRESS.md`, `TEST_RESULTS.md`.
- Verified: The Firestore emulator loaded `/home/ubuntu/repos/cpmwall3/firestore.rules`; public reads/query returned 200, protected reads/writes returned 403, and a BOB post through the Admin SDK harness returned 200. Emulator only; production is not verified or deployed. Vercel: all 3 PR #5 checks passed; cpm_wall_3 Ready (https://cpmwall3-git-devin-1792508076-r03-firestore-rules-kad-dev.vercel.app), cpmwall3 DEPLOYED.
- Next: R-04 (shadowbanned posts visible via client Firestore reads).
## [2026-10-20] PR #4 R-02 Admin ban enforcement - DONE (commit dd283d079df26c61d6c71383531a5498524093d1)
- What: Admin network bans now use the same SHA-256 IP document key as `api/post.js`; non-admin account bans block post and like actions while permanent or unexpired.
- Decision: Expired account bans remain read-only and are not cleared. No unban action or auth changes.
- Files: `api/admin/users.js`, `api/post.js`, `evidence/r02_seed.mjs`, `evidence/r02_ban.log`, `AI_CONTEXT.md`, `blueprint.md`, `PROGRESS.md`, `TEST_RESULTS.md`.
- Verified: Before/after curl scenarios ran against the Firestore emulator only; not production Firestore or Vercel. Baseline `c67f23b` returned 200 for the ineffective account/network bans; fixed code returned 403. Evidence: `evidence/r02_ban.log`. Vercel: all 3 PR #4 checks passed; cpm_wall_3 preview Ready (https://cpmwall3-git-devin-1792507192-r02-ban-enforcement-kad-dev.vercel.app), cpmwall3 DEPLOYED.
- Next: R-03 (`firestore.rules` not in repo).
## [2026-10-20] PR #3 Phase 1 Wall Empire Retheme - DONE (commit 7617f68)
- What: Retuned palette to obsidian `#0A0A0F` + electric cyan `#00F5FF` + violet `#8B5CF6`; polished wall feed, composer, pinned bar, room tabs, toasts; keyboard focus rings; 44px touch targets on chips/profile chip; themed feed scrollbar; pulse dot honors reduced-motion.
- Behaviour: `sendPost()` now has an in-flight guard (`isPosting`, `#sendBtn.disabled`, `aria-busy`) and a network-error toast. Before: 4 rapid submits sent 4 POSTs. After: 1 POST.
- Tokens added/changed: `--violet #8b5cf6`, `--violet-rgb`, `--cyan #00f5ff`, `--cyan-rgb`, `--cyan-deep #06b6d4` (filled surfaces with white text, for contrast), `--gradient-singularity` (violet→cyan-deep), `--gradient-singularity-text`, `--glow-cyan/violet`, `--focus-ring` now cyan.
- Files: design-tokens.css, index.html, evidence/phase1_wall.log, docs (AI_CONTEXT.md, blueprint.md, PROGRESS.md, TEST_RESULTS.md).
- Verified: headless Chrome + mocked Firestore/API, 0 page errors on all 4 pages, DOM IDs identical (25/11/15/42). Vercel preview: all 3 PR #3 checks passed; cpm_wall_3 preview Ready (https://cpmwall3-git-devin-1792506342-phase1-wall-retheme-kad-dev.vercel.app); the second project, cpmwall3, reported CANCELED (no URL). Live preview not clicked through.
- Next: R-02 admin ban not enforced.

## [2026-10-20] PR #2 Phase 1 Empire Singularity tokens + login retheme - DONE (commit 2118abf)
- What: Login moved off gold palette onto design tokens; semantic status tokens (`--danger*`, `--success*`, `--warning*`, `--text-on-accent`) replace hardcoded hexes on all pages.
- Files: design-tokens.css, login.html, index.html, settings.html, admin.html, evidence/phase1_ui.log.
- Verified: headless render 0 page errors; DOM IDs identical; Vercel checks passed.

## [2026-10-20] PR #1 Phase 0 route fix + audit - DONE (commits a48feee, e17aad8)
- What: Renamed `api/admin/user.js` → `api/admin/users.js` (content identical) to match the 3 `/api/admin/users` calls in admin.html. Added INVENTORY.md, RISKS.md (R-01..R-17), TEST_RESULTS.md.
- Decision: rename instead of vercel.json rewrite (one source of truth, no hidden routing).
- Verified: curl `/api/admin/users` 404 → 401; old `/api/admin/user` → 404 (evidence/phase0_curl.log). Vercel checks passed.
