# Flag Clash Arena — Admin Panel Feature Summary & Operator Guide

## 1. Admin Dashboard
- Real-time KPI cards: Game Status (`LIVE BATTLE`, `PAUSED`, `E-STOP`, `INTERMISSION`), Active Edition & Round, Arena Survivors (`alive / 30`), Active Special Event, Battle Queue count, and Championship progress.
- Quick-access match transport bar (`Start New`, `Pause`, `Resume`, `Restart`, `Skip Next`) and persistent top-bar **EMERGENCY STOP** button.
- Live System Health overview, Recent Results table (tagged `NORMAL` vs `SHOWCASE`), and upcoming Battle Queue preview.

## 2. Live Battle Control
- Full match transport: Start, Pause, Resume, Restart, and Skip.
- Instant switching across all 13 editions (Classic, Rivalry, Extreme, Mystery, Championship, 60-Second Battle, Survival Storm, King of the Arena, Team Wars, Sudden Death, Boss Battle, Chaos Arena, Power-Up Battle).
- Automatic battle toggle and configurable custom battle duration (`20–180s`).
- Manual country selection, Battle Queue builder (add, reorder up/down, delete, clear), and one-click Special Event triggers (`Speed Surge`, `Gravity Wave`, `Shield Wave`, `Paddle Frenzy`, `Slow Motion`, `Meteor Shower`, `Golden Spotlight`, `Energy Burst`).
- Live Arena Combatants table displaying role/team, HP/status, active shield timers, and supporter boost timers.

## 3. Country Management
- Enable/disable individual countries across the 55 eligible nations (enforces a minimum of 30 enabled countries so arena rounds always remain valid).
- Save and switch named custom Country Pools, feature priority countries, toggle balanced rotation vs. pure random selection, and prevent back-to-back duplicate winners.
- **Permanent Israel Exclusion**: Israel and all variants (`Israel`, `ISR`, `IL`, `State of Israel`, `Israeli`, `🇮🇱`) are permanently blocked at both client engine and server API layers and cannot be reintroduced via pools, requests, gifts, or backup imports.

## 4. Special Match Control
- **Normal Competitive Battles**: Physics engine determines the winner with zero secret manipulation. Results count toward competitive statistics, achievements, and championships. Supports configurable bounded supporter advantages (`maxEffectsPerRound`, `maxEffectsPerCountry`, `maxShieldSec`, `cooldownSec`).
- **Operator-Controlled Showcase Matches**: Administrator selects the showcase winner. The audience canvas visibly displays **`OPERATOR-CONTROLLED SHOWCASE`** during gameplay and results are isolated in `fca_showcase_results`, never inflating competitive win rates, achievements, or championship records.

## 5. Audience, Comments & Supporter Management
- Standardized internal event interface (`window.__FCA_EVENT_BUS__`) prepared for future social platform adapters (explicitly offline — no fake external platform connection).
- Viewer Request workflow with `pending`, `approved`, and `rejected` statuses, one-click **Approve → Queue**, **Feature Comment** on canvas, and username muting.
- Internal Gifts & Supporters system with supporter records, gift history, rankings, Top Supporter badge, bounded supporter effects (`shield_boost`, `speed_boost`, `recovery_nudge`), and supporter celebrations.

## 6. Tournaments, Settings, Visual/Audio, Hall of Fame, Live Preview & Backups
- **Tournaments & Championship**: Integrated directly with the built-in 12-round Championship (`tourney`, `tourneyHistory`, `champ`) plus custom tournament scheduling into the battle queue.
- **Settings & Balancing**: Validated bounded sliders for Speed, Center Pull, Paddle Rotation, Shield Cooldown, Event Frequency, Boss HP/Damage, Comeback Mechanics, and Difficulty, protected by the **Classic Mode Physics Lock** (default ON).
- **Visual & Audio**: Independent SFX and Music volume buses, Voice Announcer toggle, Particles toggle, FX intensity, Screen Shake (capped at 8px), Hit-Stop, Slow Motion, Victory Animations, and Overlay visibility toggles.
- **Achievements & Hall of Fame**: Read-only protected view of lifetime wins, streaks, and unlocked achievements.
- **Isolated Live Preview**: Sandboxed `/?preview=1` iframe that tests showcase badges, comments, celebrations, announcements, and effects without writing to `localStorage` or disturbing the live audience match.
- **Backups & Security**: Local snapshot creation, full JSON backup download, validated JSON restore (auto-backups before restoring and rejects excluded countries), battle-history CSV export, selective resets (auto-backup + typed confirmation), and server-verified Admin Activity Audit Log.
