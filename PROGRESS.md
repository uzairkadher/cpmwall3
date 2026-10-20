# ROADMAP PROGRESS — CPM Community Wall v3.5 Singularity Edition
Source of truth: `CPM_Community_Wall_Singularity_Edition_Roadmap.pdf` (20 Oct 2026). Every item marked DONE has a commit hash and evidence in TEST_RESULTS.md / `evidence/`.

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
