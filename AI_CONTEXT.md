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

