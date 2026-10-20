# ROADMAP PROGRESS — CPM Community Wall v3.5 Singularity Edition
Source of truth: `CPM_Community_Wall_Singularity_Edition_Roadmap.pdf` (20 Oct 2026). Every item marked DONE has a commit hash and evidence in TEST_RESULTS.md / `evidence/`.

## Phase 0 — Singularity Core
- [x] Resolve admin users API route mismatch — a48feee (PR #1). Deployed-route check: local harness only.
- [x] One authoritative inventory (INVENTORY.md) — e17aad8 (PR #1)
- [x] Audit each API route: auth, role, validation, errors (RISKS.md) — e17aad8 (PR #1)
- [~] Login abuse controls / JWT revocation / session invalidation — R-05 done (baeb829b3f958c0240d2c81449f7c95fe845c9a6; PR #__PR__); R-06 open
- [ ] Restrict CORS to approved origins (R-07)
- [ ] Test rate limiting, moderation, bans, presence, duplicate likes against real Firestore
- [ ] Automated smoke tests for critical endpoints

## Security findings (RISKS.md)
- [x] R-02 Admin ban enforcement — dd283d079df26c61d6c71383531a5498524093d1 (PR #4)
- [x] R-03 Add `firestore.rules` — 2a77d7178f5e29bc630a036093a92f8605b78aec (PR #5); production deploy pending the user
- [ ] R-04 Shadowbanned posts visible via client Firestore reads
- [x] R-05 Enforce session revocation — baeb829b3f958c0240d2c81449f7c95fe845c9a6 (PR #__PR__)

## Phase 1 — Empire Visual Singularity
- [x] design-tokens.css palette/gradients/glows/status tokens — 2118abf (PR #2), 7617f68 (PR #3)
- [x] login.html retheme — 2118abf (PR #2)
- [x] index.html wall polish: feed, composer, pinned, navigation, toasts — 7617f68 (PR #3)
- [x] Focus states, 44px touch targets, reduced-motion — 7617f68 (PR #3)
- [x] Prevent repeated submissions while posting — 7617f68 (PR #3)
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
