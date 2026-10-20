# CPM Community Wall v3.5 (Empire Studio)
## Current Project Blueprint and Deployment Handoff
**Prepared:** 20 October 2026
**Primary Project URL:** `https://cpmwall.tech`
**Firebase project ID in the existing blueprint:** `cpmwall3`

> This handoff documents the current project state, explicitly
incorporating the standalone admin login architecture, extensionless
frontend routing, strict server-side multi-origin CORS enforcement, 
and the Phase 1 Empire visual identity. It does not
claim the deployment has been tested end-to-end. Confirm the
production domain and test the listed flows before treating deployment
as verified.

## 1. Project architecture
**Frontend:** Vanilla HTML, CSS and JavaScript pages:
`index.html`, `login.html`, `admin.html`, `settings.html`. Deployed
using Clean URLs (extensionless routing) with the Empire Visual Identity (`design-tokens.css`).
**Backend:** Vercel serverless API routes under `api/`.
**Database:** Cloud Firestore.
**Authentication:** Custom username/password authentication. The
backend verifies a bcrypt password hash stored in Firestore and issues
a signed JWT. Firebase Authentication is not used.
**Admin authorization:** The backend checks the user's Firestore
record and `role`. Configure an administrator in
`users/{UPPERCASE_USERNAME}` with `role: "ADMIN"`. The admin interface
operates securely and independently from the main application.
**Firebase access:** The server uses Firebase Admin SDK with
`FIREBASE_SERVICE_KEY`. Admin SDK operations bypass Firestore Security
Rules; browser clients do not.
**Rate limiting:** Persist limits in Firestore `rate_limits`,
intended limit 5 posts per minute. Do not replace this with in-memory
state in Vercel functions.
**Frontend security:** Render user-supplied text with
`textContent`. If HTML insertion is unavoidable, sanitize it with
DOMPurify. Never expose private account fields to the browser.

## 2. Files included in the current project
Frontend/config: `index.html`, `login.html`, `settings.html`,
`admin.html`, `design-tokens.css`, `manifest.json`, `vercel.json`, `package.json`,
`blueprint.md`, `AI_CONTEXT.md`.
APIs: `api/auth.js`, `api/post.js`, `api/heartbeat.js`,
`api/user/me.js`, `api/user/change-username.js`,
`api/user/change-password.js`, `api/admin/users.js`,
`api/admin/sessions.js`, `api/admin/audit.js`,
`api/admin/analytics.js`, `api/admin/flags.js`,
`api/admin/vip-keys.js`.

## 3. Environment variables
Set these in **Vercel Project Settings → Environment Variables**,
for every environment where the app should run (Production and
Preview/Development).

| Variable | Required? | Purpose / notes |
|---|---|---|
| `FIREBASE_SERVICE_KEY` | Required | Firebase service-account credentials used by Firebase Admin SDK. Supply the exact JSON format expected by the current API initialization code. Keep private; never prefix with `NEXT_PUBLIC_` or put it in frontend HTML. |
| `JWT_SECRET` | Required | Secret used to sign/verify custom JWTs. Use a long, cryptographically random value. Rotating it generally invalidates existing JWTs. |
| `GEMINI_API_KEY` | Optional | Used by `api/post.js` for the optional Apex_Racer/Gemini feature. Set only if that feature is intended to run. |
| `ALERT_WEBHOOK_URL` | Optional | Used by `api/post.js` for moderation/strike alert notifications. Keep the URL private. |

**Retired variables:** Do not add or rely on `ADMIN_KEY` or
`NEXT_PUBLIC_ADMIN_KEY`. Admin authorization should use the
authenticated JWT and the role stored in Firestore.

After changing Vercel environment variables, redeploy for changes to
apply.

## 4. Firestore Security Rules
**strict configuration**
Paste into **Firebase Console → Firestore Database → Rules**, then
Publish. These rules allow public reads of posts, pinned posts, and
presence, while denying browser access to `users` and all other
collections.

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Public community posts: read-only for browser clients
    match /posts/{document} {
      allow read: if true;
      allow write: if false;
    }
    // Public pinned posts: read-only for browser clients
    match /pinned/{document} {
      allow read: if true;
      allow write: if false;
    }
    // Public presence: read-only for browser clients
    match /presence/{document} {
      allow read: if true;
      allow write: if false;
    }
    // Private accounts, including password hashes and account metadata
    match /users/{document} {
      allow read, write: if false;
    }
    // Deny browser-client access to every other collection
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

## 5. API route status (2026-10-20)
All 12 frontend `fetch()` targets resolve to a handler (see INVENTORY.md). The only mismatch, `/api/admin/users`, was fixed in PR #1 by renaming the handler file. Evidence: `evidence/phase0_curl.log`. Real Firestore-backed behaviour is still unverified (no credentials in the test environment).
R-02: admin IP bans and non-admin account bans are enforced using matching SHA-256 IP keys and `isBanned`/`bannedUntil` checks; emulator evidence only, not production Firestore or Vercel (`evidence/r02_ban.log`).

## 6. Empire Singularity design system progress
| Item | Status | Commit |
|---|---|---|
| Tokens: obsidian `#0A0A0F`, electric cyan `#00F5FF`, violet `#8B5CF6`, `--cyan-deep`, gradients, glows, semantic status colors | DONE | 2118abf, 7617f68 |
| login.html on tokens (gold removed) | DONE | 2118abf |
| index.html wall: feed, composer, pinned, tabs, toasts, focus, touch targets, double-submit guard | DONE | 7617f68 |
| Composer preserves drafts and reply targets changed during an in-flight post | DONE | 85359c3130b54fde59e8c839f67a2ef8bbf8d0f6 |
| settings.html / admin.html: tokenized colors only; deeper polish pending | PARTIAL | 2118abf |
| Skeletons / empty / error states consistent on settings + admin | TODO | — |

Rules: no CSS frameworks; keep `design-tokens.css`; never change DOM IDs; filled cyan surfaces with white text use `--cyan-deep` for contrast.
