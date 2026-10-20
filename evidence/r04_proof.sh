#!/usr/bin/env bash
set -euo pipefail

: "${R04_TEST_PASSWORD:?Set R04_TEST_PASSWORD in the environment}"
FIXED_BASE="${FIXED_BASE:-http://127.0.0.1:4180}"
BASELINE_BASE="${BASELINE_BASE:-http://127.0.0.1:4181}"
EVE_IP="${EVE_IP:-203.0.113.44}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

call() {
  local label="$1" base="$2" path="$3"
  shift 3
  local status
  status="$(curl --silent --show-error -D "$TMP_DIR/headers" -o "$TMP_DIR/body" -w '%{http_code}' "$@" "${base}${path}")"
  printf '\n### %s\nHTTP status: %s\nHeaders:\n' "$label" "$status"
  tr -d '\r' < "$TMP_DIR/headers" | sed '/^$/d'
  printf 'Body:\n'
  sed -E 's/("token"[[:space:]]*:[[:space:]]*")[^"]*"/\1[REDACTED JWT]"/g' "$TMP_DIR/body"
  printf '\n'
  LAST_BODY="$TMP_DIR/body"
}

token_from_last_body() {
  node -e 'process.stdout.write(JSON.parse(require("node:fs").readFileSync(0, "utf8")).token)' < "$LAST_BODY"
}

login_payload() {
  node -e 'process.stdout.write(JSON.stringify({ username: process.argv[1], password: process.env.R04_TEST_PASSWORD }))' "$1"
}

printf '%s\n' '## R-04 emulator curl proof'
printf 'Fixed harness: %s\nBaseline harness: %s\nFirestore emulator: 127.0.0.1:8080\n' "$FIXED_BASE" "$BASELINE_BASE"
node evidence/r04_seed.mjs seed

call "Fixed: anonymous GET /api/post" "$FIXED_BASE" /api/post
call "Fixed: BOB login" "$FIXED_BASE" '/api/auth?action=login' -X POST -H 'Content-Type: application/json' --data-binary "$(login_payload BOB)"
BOB_TOKEN="$(token_from_last_body)"
call "Fixed: EVE login" "$FIXED_BASE" '/api/auth?action=login' -X POST -H 'Content-Type: application/json' --data-binary "$(login_payload EVE)"
EVE_TOKEN="$(token_from_last_body)"
call "Fixed: EVE GET /api/post" "$FIXED_BASE" /api/post -H "Authorization: Bearer $EVE_TOKEN"
call "Fixed: BOB GET /api/post" "$FIXED_BASE" /api/post -H "Authorization: Bearer $BOB_TOKEN"
call "Fixed: garbage token GET /api/post" "$FIXED_BASE" /api/post -H 'Authorization: Bearer not-a-valid-token'

node evidence/r04_seed.mjs seed-shadowban "$EVE_IP"
node evidence/r04_seed.mjs clear-rate-limits
call "Fixed: EVE POST /api/post with shadowban active" "$FIXED_BASE" /api/post \
  -X POST -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $EVE_TOKEN" \
  -H "x-vercel-forwarded-for: $EVE_IP" \
  --data-binary '{"action":"post","message":"R04 shadowban flow post","room":"public"}'
call "Fixed: anonymous GET after EVE post" "$FIXED_BASE" /api/post
call "Fixed: EVE GET after EVE post" "$FIXED_BASE" /api/post -H "Authorization: Bearer $EVE_TOKEN"

call "Baseline: anonymous GET /api/post" "$BASELINE_BASE" /api/post
call "Baseline: EVE login" "$BASELINE_BASE" '/api/auth?action=login' -X POST -H 'Content-Type: application/json' --data-binary "$(login_payload EVE)"
BASELINE_EVE_TOKEN="$(token_from_last_body)"
node evidence/r04_seed.mjs clear-rate-limits
call "Baseline: EVE POST /api/post with shadowban active" "$BASELINE_BASE" /api/post \
  -X POST -H 'Content-Type: application/json' \
  -H "Authorization: Bearer $BASELINE_EVE_TOKEN" \
  -H "x-vercel-forwarded-for: $EVE_IP" \
  --data-binary '{"action":"post","message":"Baseline shadowban flow post","room":"public"}'

call "Rules: unauthenticated GET posts/p1" http://127.0.0.1:8080 \
  "/v1/projects/demo-cpm/databases/(default)/documents/posts/p1"
call "Rules: unauthenticated posts runQuery" http://127.0.0.1:8080 \
  "/v1/projects/demo-cpm/databases/(default)/documents:runQuery" \
  -X POST -H 'Content-Type: application/json' \
  --data-binary '{"structuredQuery":{"from":[{"collectionId":"posts"}]}}'
call "Rules: unauthenticated GET pinned/current" http://127.0.0.1:8080 \
  "/v1/projects/demo-cpm/databases/(default)/documents/pinned/current"
