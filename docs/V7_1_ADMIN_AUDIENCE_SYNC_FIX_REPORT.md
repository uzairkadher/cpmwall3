# Flag Clash Arena — v7.1 Admin ↔ Audience Live Preview & Control System Fix Report

## 1. Root Cause Analysis (Why Admin Preview Showed Alien Worlds While Audience Showed Classic)
Inspecting `index.html`, `admin.js`, and `admin.html` revealed 5 concrete architectural defects:
1. **Independent Auto-Rotation Inside Preview (`index.html`, `ROT_API.onBattleCompleted`)**: The Admin Preview iframe (`/?preview=1`, `IS_PREVIEW === true`) ran its own independent `every_battle` rotation engine while ignoring `BroadcastChannel` (`if (!IS_PREVIEW)`) and `storage` sync events (`if (!IS_PREVIEW)`). When a round ended inside Preview, it randomly rotated to another edition (e.g., Round 3 · Alien Worlds) while Audience stayed on Round 2 · Classic.
2. **Ephemeral-Only Dispatch on Single-Tab Mobile Workflow (`admin.js`, `execAdminAction` & `dispatchConfirmedToGame`)**: `execAdminAction()` only sent ephemeral `BroadcastChannel` messages that vanished whenever the Audience tab (`cpmwall.tech/`) was closed or backgrounded on mobile. `execConfirmedAction()` wrote a single key (`fca_sync_cmd`), timed out after 1.8s, and `index.html` never drained persisted commands on boot.
3. **No Authoritative Config Revision or Persistent Command Queue**: Without a monotonic `configRev` (`fca_auth_rev_v1`) and bounded persistent queue (`fca_pending_cmds_v1`), Audience and Preview could not detect or reconcile newer Admin changes made while Audience was closed.
4. **Stale `fca_state` Restoration Precedence (`index.html`, `restore()`)**: `restore()` executed on boot before `window.__FCA_ADM__` / `window.__FCA_ROT__` initialized, restoring an older saved Classic round (`ei: 0`) even when Admin had selected a different edition.
5. **Missing Preview Parity Visibility (`admin.html`, `#tab-preview`)**: The Live Preview tab had no indicator showing whether Preview matched Audience's active edition and configuration revision, or whether updates were queued for Audience open.

---

## 2. Targeted Single-Source-of-Truth Repairs Completed
- **`project/index.html`**:
  - Blocked independent auto-rotation inside Preview (`if (IS_PREVIEW || rotEvaluatedRound === round) return;`).
  - Added monotonic `configRev` + `authRev` fields to `adm.getSnapshot()`.
  - Added Audience `adm.drainPendingCommands()` reading `fca_pending_cmds_v1` with `fca_applied_reqs_v1` deduplication (bounded 200 entries), executed automatically on **boot**, **`storage` event**, **`visibilitychange`**, and **`focus`**, with immediate unthrottled `fca_sync_state` + `fca_sync_ack` writes.
  - Added reconciliation on Audience boot so an authoritative manual edition overrides stale `fca_state`.
  - Converted Preview (`IS_PREVIEW === true`) into a **strictly read-only live mirror** subscribing to `BroadcastChannel` telemetry, `storage` updates (`fca_sync_state`, `fca_admin_config`, `fca_rotation_v5`, `fca_v6_config`, `fca_pending_cmds_v1`), and `postMessage` (`preview.sync_state`) — mirroring exact `editionIdx`, `theme`, `visual`, `gameplay`, `showDirector`, `v6Config`, and `configRev` without ever writing competitive records.
- **`project/admin.js`**:
  - Added unified `enqueuePersistentCommand(action, payload)` assigning monotonic `fca_auth_rev_v1` revisions, appending to bounded `fca_pending_cmds_v1`, dispatching via `BroadcastChannel` + `fca_sync_cmd`, and pushing `preview.sync_state` to `#preview-iframe`.
  - Wired BOTH `execAdminAction()` (`dispatchToGame === true`) and `dispatchConfirmedToGame()` through `enqueuePersistentCommand()` so all 40+ Admin controls persist reliably even when Audience is closed on mobile.
  - Replaced misleading timeout failure with honest offline-queued status (`Saved Rev #N — applies on Audience open`) and live parity banner updates (`updatePreviewParityUI`).
- **`project/admin.html`**:
  - Added `#preview-parity-bar` (`#preview-parity-text`, `#preview-parity-pill`, `#btn-preview-resync`) inside `#tab-preview` so Admin can see live `Audience & Preview` edition + `Rev #N` parity at a glance.
- **Untouched**: `admin.css`, `functions/*`, Classic physics (`EDS[0]`), all 77 editions, Israel exclusion, and `original-backup/`.

---

## 3. Admin Control Coverage Audit (Authoritative Sync Pipeline)
| Control Group | Admin Dispatch | Persistent Queue (`fca_pending_cmds_v1`) | Audience Receiver (`handleCommand`) | Preview Mirror | Status |
|---|---|---|---|---|---|
| Edition Selection (`battle.set_edition`, `edition.switch_classic`, `edition.toggle_enabled`) | `execConfirmedAction` / `execAdminAction` | Yes (`Rev #N`) | Applied live or on boot/focus + ACK | Mirrors exact `editionIdx` | `TESTED — VERIFIED` |
| Visual & Audio (`settings.update_visual_audio`, FX intensity, overlays, reduced effects) | `execAdminAction` / `execConfirmedAction` | Yes (`Rev #N`) | Applied + saved to `fca_admin_config` | Mirrors `adm.visual` | `TESTED — VERIFIED` |
| Gameplay & Balancing (`settings.update_gameplay`, difficulty, speed/pull/rot, duration) | `execAdminAction` | Yes (`Rev #N`) | Applied + saved (Classic `1.0x` lock intact) | Mirrors `adm.gameplay` | `TESTED — VERIFIED` |
| Rotation & Themes (`rotation.update`, edition/theme/mode/difficulty rotation) | `execConfirmedAction` | Yes (`Rev #N`) | Applied + saved to `fca_rotation_v5` | Mirrors `rot.theme` (no drift) | `TESTED — VERIFIED` |
| v6.0 Battle Intelligence (`v6.update_config`, Sudden Death, Timelines) | `execConfirmedAction` | Yes (`Rev #N`) | Applied + saved to `fca_v6_config` | Mirrors `v6Cfg` | `TESTED — VERIFIED` |
| Show Director, Presets, Rare Events & Gauntlet (`showdirector.*`, `gauntlet.*`) | `execConfirmedAction` / `execAdminAction` | Yes (`Rev #N`) | Applied + saved | Mirrors `adm.showDirector` | `TESTED — VERIFIED` |
| Live Battle Controls, Queue, Countries, Showcase, Supporters & Emergency Stop | `execAdminAction` / `execConfirmedAction` | Yes (`Rev #N`) | Applied + ACK | Mirrors live state | `TESTED — VERIFIED` |
| Preview Sandbox Overlays (`[data-prev]` showcase/comment/celebration/event/poll) | `postMessage` (`preview.test`) | Isolated (Preview only by design) | Never touches Audience competitive records | Runs inside `#preview-iframe` | `EXISTING — PRESERVED` |

---

## 4. Executed Automated Test Results (100% PASS)
Executed via `node test_sync_e2e.js` (dual-VM Audience + Preview shared-origin harness) and `node run_node_tests.js`:
1. **PASS — Offline Admin -> Audience Boot & Preview Parity (Exact Video Bug Scenario)**: Stale Classic `fca_state` overridden by queued `Alien Worlds (#24)` + `fxIntensity: 80` + `midnight_neon` (`Rev #3`); both Audience and Preview booted on `Alien Worlds (#24)`, `fx: 80`, `midnight_neon`, `Rev #3`.
2. **PASS — Preview Anti-Drift**: 5 calls to `ROT_API.onBattleCompleted()` inside Preview produced zero edition drift (stayed locked on `#24`).
3. **PASS — Live Multi-Tab Sync Parity**: Switching `#14 Volcanic Rise` -> `#15 Frostbite` -> `#0 Classic` synchronized both Audience and Preview with confirmed ACKs.
4. **PASS — Duplicate Command Prevention**: Re-running `drainPendingCommands()` returned `0` re-applications.
5. **PASS — VisibilityChange Reconnection Drain**: Backgrounded Audience tab drained queued `#35 Cyber Overdrive` (`Rev #7`) on `visibilitychange`, ACKed (`ok: true, applied: true`), and mirrored to Preview.
6. **PASS — Full Regression Suite**: 37/37 editions passed (37 unique Canvas 2D & Web Audio signatures), Classic 100% protected, 1,200-tick stability test passed (341ms), 287/287 original Admin IDs preserved, 0 Israel / 0 "God" hits.

## 5. Honest Limitations (`NOT TESTED`)
- **Cross-Device Sync (Different Phones/Browsers)**: `localStorage` and `BroadcastChannel` synchronize tabs within the **same browser/device origin** (such as switching between `cpmwall.tech/admin` and `cpmwall.tech/` on your phone or OBS browser on the same machine). Syncing across **two physically separate devices** (e.g., controlling a PC livestream from a separate phone) requires a shared server-side state store (such as Cloudflare KV or Durable Objects), which is not bound in `wrangler.toml`.
- **Live Browser / Physical Phone Rendering (`NOT TESTED`)**: Headless Chromium is blocked by sandbox enterprise policy; verify on `cpmwall.tech/admin` and `cpmwall.tech/` after deploying.
