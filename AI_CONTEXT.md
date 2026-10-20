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
