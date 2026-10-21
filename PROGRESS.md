# ROADMAP PROGRESS — CPM Community Wall v3.5 Singularity Edition
Source of truth: `CPM_Community_Wall_Singularity_Edition_Roadmap.pdf` (20 Oct 2026). Every item marked DONE has a commit hash and evidence in TEST_RESULTS.md / `evidence/`.

## [2026-05-12] - Completed
Files changed: settings.html index.html api/heartbeat.js vercel.json
- Profile Photo: Added + button (24px white circle with black +) on avatar circles in index.html top bar and settings.html User Settings section. Hidden input id="profilePhotoInput" accept="image/*" <2MB FileReader DataURL saved to localStorage key cpm_profile_photo.
- VIP Redeem: In settings.html VIP Lounge Membership card below Buy VIP via WhatsApp button added button id="redeemVipBtn" transparent background purple border #8b5cf6. Modal with input id="vipKeyInput" placeholder "Enter VIP Key e.g. VIP-XXXX-XXXX" with Redeem and Cancel buttons saves to localStorage key cpm_vip_key.
- Online Indicator: Changed Lobby Chat button to show pulsing green dot 8px color #22c55e with pulse animation and span id="onlineCountText" showing online count. Added @keyframes pulse animation. File api/heartbeat.js updated to 15s interval.
- Routing: vercel.json added rewrites for /settings, /settings/, /sett, /sett/ to /settings.html keeping existing /privacy and /terms.
- Tip Jar: Changed from JazzCash to NayaPay IBAN PK97NAYA1234503427565802 with label NayaPay Pakistan and Copy button.
- Social Links: IG Profile https://www.instagram.com/cpmwall?srtk=MWJtOWdkYXJyc3Nndg== and IG Group https://ig.me/j/cg7TKtGMHAtXh-Hz/

## Phase 0 — Singularity Core
- [x] Resolve admin users API route mismatch — a48feee (PR #1). Deployed-route check: local harness only.
- [x] One authoritative inventory (INVENTORY.md) — e17aad8 (PR #1)
- [x] Audit each API route: auth, role, validation, errors (RISKS.md) — e17aad8 (PR #1)
- [ ] Login abuse controls / JWT revocation / session invalidation (R-05, R-06)
- [ ] Restrict CORS to approved origins (R-07)
- [ ] Test rate limiting, moderation, bans, presence, duplicate likes against real Firestore
- [ ] Automated smoke tests for critical endpoints

## Security findings (RISKS.md)
- [ ] R-02 Admin ban not enforced (ban doc key ≠ post.js IP key; `isBanned` unchecked)
- [ ] R-03 `firestore.rules` not in repo (rules exist only as text in blueprint.md §4)
- [ ] R-04 Shadowbanned posts visible via client Firestore reads
- [ ] R-05 Session revoke ineffective (no session docs written; JWT verify ignores `sessions`)

## Phase 1 — Empire Visual Singularity
- [x] design-tokens.css palette/gradients/glows/status tokens — 2118abf (PR #2), 7617f68 (PR #3)
- [x] login.html retheme — 2118abf (PR #2)
- [x] index.html wall polish: feed, composer, pinned, navigation, toasts — 7617f68 (PR #3)
- [x] Focus states, 44px touch targets, reduced-motion — 7617f68 (PR #3)
- [x] Prevent repeated submissions while posting — 7617f68 (PR #3)
- [x] Preserve composer drafts/reply targets changed during an in-flight post — 85359c3130b54fde59e8c839f67a2ef8bbf8d0f6 (PR #3; mocked-browser proof)
- [x] Clarify uncertain outcomes after rejected post requests — 1634ca4db6f7ed0a6638c2918ab6307f5aa7f03e (PR #3; mocked-browser proof)
- [ ] settings.html polish (beyond token swap)
- [ ] admin.html polish (Phase 4 overlaps)

## Phase 2 — Zero-Jank Performance
- [ ] Not started

## Phase 3 — PWA & Resilience
- [ ] Not started

## Phase 4 — Admin Command Center
- [ ] Not started

## Phase 5 — Production Certification
- [ ] Not started
