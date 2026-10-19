# AI System Context: CPM Community Wall v3.5

**Summary:** Vercel serverless + Firestore SPA enforcing zero-trust client rules, stateless APIs, and DOMPurify XSS mitigation.

**Auth Rule:** Custom JWT (`api/auth.js`) + Firestore `users/{uid}.role === 'ADMIN'` verification. **DO NOT USE FIREBASE AUTH.**

**Environment Variables:**
- `FIREBASE_SERVICE_KEY` (Required: Admin SDK JSON object)
- `JWT_SECRET` (Required: Key for signing/verifying custom JWTs)
- `GEMINI_API_KEY` (Optional: Google AI endpoint key for @Apex_Racer)
- `ALERT_WEBHOOK_URL` (Optional: Discord/Slack webhook for 3-strike alerts)
- *Note: `ADMIN_KEY` is completely deprecated and removed.*

**Collections Quick Ref:**
`users`, `posts`, `sessions`, `rate_limits`, `audit_logs`, `feature_flags`, `visitors`[span_0](start_span)[span_0](end_span), `presence`[span_1](start_span)[span_1](end_span), `ip_logs`[span_2](start_span)[span_2](end_span), `ip_notes`[span_3](start_span)[span_3](end_span), `banned`[span_4](start_span)[span_4](end_span), `subnet_bans`[span_5](start_span)[span_5](end_span), `fingerprint_bans`[span_6](start_span)[span_6](end_span), `shadowbanned`[span_7](start_span)[span_7](end_span), `strikes`[span_8](start_span)[span_8](end_span), `vip_members`[span_9](start_span)[span_9](end_span), `vip_banned`[span_10](start_span)[span_10](end_span), `settings`[span_11](start_span)[span_11](end_span), `pinned`[span_12](start_span)[span_12](end_span), `payments`[span_13](start_span)[span_13](end_span).

**CRITICAL "DON'T BREAK" RULES:**
1. **NO FIREBASE AUTH:** Only use the established custom JWT implementation.
2. **NO `ADMIN_KEY`:** Admin authorization relies purely on JWT Bearer token + Firestore DB role lookup.
3. **VERCEL IS STATELESS:** Do not use in-memory caches or LRU for rate limiting. Rely entirely on the Firestore `rate_limits` collection (5 requests/minute).
4. **ZERO-TRUST FIRESTORE:** `firestore.rules` MUST securely remain `allow write: if false;` globally[span_14](start_span)[span_14](end_span)[span_15](start_span)[span_15](end_span).
5. **XSS MITIGATION:** Always render user data using `textContent`. If `innerHTML` is absolutely required, wrap it securely in `DOMPurify.sanitize()`.
