// Flag Clash Arena — Server-Side Admin Authentication & Security Library
// Designed for Cloudflare Pages Functions (Web Crypto API, zero dependencies).
// Credentials are read strictly from Cloudflare Pages Environment Variables & Secrets:
//   - env.ADMIN_USERNAME
//   - env.ADMIN_PASSWORD (Secret)
//   - env.ADMIN_SESSION_SECRET (Secret)

export const COOKIE_NAME = 'fca_admin_session';
export const SESSION_TTL_SEC = 60 * 60 * 4; // 4 hours
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const RATE_LIMIT_MAX_ATTEMPTS = 5;

const ISRAEL_BLOCK_PATTERN = /\b(israel|israeli|isr|state\s+of\s+israel)\b|🇮🇱/i;

// Per-isolate brute-force & revocation stores (supplemented with optional ADMIN_KV if bound)
const loginAttempts = new Map();
const revokedJtis = new Map();
const auditTrail = [];
const MAX_AUDIT_ENTRIES = 250;

const enc = new TextEncoder();

function base64UrlEncode(bytes) {
  let binary = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4);
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmacSign(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return new Uint8Array(sig);
}

// Constant-time string equality via HMAC-SHA256 digest comparison (prevents length/timing leaks)
export async function timingSafeEqualStr(secret, a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const da = await hmacSign(secret || 'fca-const-key', a);
  const db = await hmacSign(secret || 'fca-const-key', b);
  if (da.length !== db.length) return false;
  let diff = 0;
  for (let i = 0; i < da.length; i++) diff |= da[i] ^ db[i];
  return diff === 0;
}

export function checkEnvConfig(env) {
  const hasUser = typeof env?.ADMIN_USERNAME === 'string' && env.ADMIN_USERNAME.trim().length > 0;
  const hasPass = typeof env?.ADMIN_PASSWORD === 'string' && env.ADMIN_PASSWORD.length >= 8;
  const hasSecret = typeof env?.ADMIN_SESSION_SECRET === 'string' && env.ADMIN_SESSION_SECRET.length >= 16;
  return {
    configured: hasUser && hasPass && hasSecret,
    hasUsername: hasUser,
    hasPassword: hasPass,
    hasSessionSecret: hasSecret,
    kvBound: !!(env && env.ADMIN_KV)
  };
}

export function getClientIp(request) {
  return (
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function pruneMaps(now) {
  for (const [k, v] of loginAttempts.entries()) {
    if (now - v.firstAt > RATE_LIMIT_WINDOW_MS && now >= v.lockedUntil) {
      loginAttempts.delete(k);
    }
  }
  for (const [jti, exp] of revokedJtis.entries()) {
    if (exp * 1000 < now) revokedJtis.delete(jti);
  }
}

export async function checkRateLimit(key, env) {
  const now = Date.now();
  pruneMaps(now);

  if (env?.ADMIN_KV) {
    try {
      const raw = await env.ADMIN_KV.get(`rl:${key}`);
      if (raw) {
        const rec = JSON.parse(raw);
        if (rec.lockedUntil && now < rec.lockedUntil) {
          return { allowed: false, retryAfterSec: Math.ceil((rec.lockedUntil - now) / 1000) };
        }
        if (now - rec.firstAt <= RATE_LIMIT_WINDOW_MS && rec.count >= RATE_LIMIT_MAX_ATTEMPTS) {
          return { allowed: false, retryAfterSec: Math.ceil((rec.firstAt + RATE_LIMIT_WINDOW_MS - now) / 1000) };
        }
      }
    } catch (_) {}
  }

  const rec = loginAttempts.get(key);
  if (!rec) return { allowed: true, retryAfterSec: 0 };
  if (rec.lockedUntil && now < rec.lockedUntil) {
    return { allowed: false, retryAfterSec: Math.ceil((rec.lockedUntil - now) / 1000) };
  }
  if (now - rec.firstAt > RATE_LIMIT_WINDOW_MS) {
    loginAttempts.delete(key);
    return { allowed: true, retryAfterSec: 0 };
  }
  if (rec.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSec: Math.ceil((rec.firstAt + RATE_LIMIT_WINDOW_MS - now) / 1000) };
  }
  return { allowed: true, retryAfterSec: 0 };
}

export async function recordFailedLogin(key, env) {
  const now = Date.now();
  const prev = loginAttempts.get(key);
  let rec;
  if (!prev || now - prev.firstAt > RATE_LIMIT_WINDOW_MS) {
    rec = { count: 1, firstAt: now, lockedUntil: 0 };
  } else {
    rec = { count: prev.count + 1, firstAt: prev.firstAt, lockedUntil: prev.lockedUntil };
    if (rec.count >= RATE_LIMIT_MAX_ATTEMPTS) {
      rec.lockedUntil = now + RATE_LIMIT_WINDOW_MS;
    }
  }
  loginAttempts.set(key, rec);
  if (env?.ADMIN_KV) {
    try {
      await env.ADMIN_KV.put(`rl:${key}`, JSON.stringify(rec), { expirationTtl: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000) + 60 });
    } catch (_) {}
  }
  return rec;
}

export async function clearRateLimit(key, env) {
  loginAttempts.delete(key);
  if (env?.ADMIN_KV) {
    try {
      await env.ADMIN_KV.delete(`rl:${key}`);
    } catch (_) {}
  }
}

export function generateRandomId(byteLen = 16) {
  const bytes = new Uint8Array(byteLen);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function createSessionToken(username, env) {
  const nowSec = Math.floor(Date.now() / 1000);
  const exp = nowSec + SESSION_TTL_SEC;
  const jti = generateRandomId(16);
  const csrf = generateRandomId(18);
  const header = base64UrlEncode(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'FCA' })));
  const payload = base64UrlEncode(enc.encode(JSON.stringify({ u: username, iat: nowSec, exp, jti, csrf })));
  const signingInput = `${header}.${payload}`;
  const sig = base64UrlEncode(await hmacSign(env.ADMIN_SESSION_SECRET, signingInput));
  return {
    token: `${signingInput}.${sig}`,
    expiresAt: exp * 1000,
    jti,
    csrf
  };
}

export function parseCookies(request) {
  const header = request.headers.get('Cookie') || '';
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const k = part.slice(0, idx).trim();
      const v = part.slice(idx + 1).trim();
      out[k] = v;
    }
  }
  return out;
}

export function buildSessionCookie(token, request, maxAgeSec = SESSION_TTL_SEC) {
  const url = new URL(request.url);
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const secureFlag = isLocal && url.protocol === 'http:' ? '' : '; Secure';
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secureFlag}`;
}

export function buildClearCookie(request) {
  const url = new URL(request.url);
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  const secureFlag = isLocal && url.protocol === 'http:' ? '' : '; Secure';
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secureFlag}`;
}

export async function verifySession(request, env) {
  const cfg = checkEnvConfig(env);
  if (!cfg.configured) {
    return { ok: false, status: 503, error: 'Admin authentication is not configured on this server.' };
  }

  const cookies = parseCookies(request);
  const token = cookies[COOKIE_NAME];
  if (!token) {
    return { ok: false, status: 401, error: 'Authentication required.' };
  }

  const parts = token.split('.');
  if (parts.length !== 3) {
    return { ok: false, status: 401, error: 'Invalid session token.' };
  }

  const [headerB64, payloadB64, sigB64] = parts;
  const expectedSig = base64UrlEncode(await hmacSign(env.ADMIN_SESSION_SECRET, `${headerB64}.${payloadB64}`));
  const sigMatch = await timingSafeEqualStr(env.ADMIN_SESSION_SECRET, sigB64, expectedSig);
  if (!sigMatch) {
    return { ok: false, status: 401, error: 'Invalid session signature.' };
  }

  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(payloadB64)));
  } catch (_) {
    return { ok: false, status: 401, error: 'Malformed session payload.' };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload || typeof payload.exp !== 'number' || payload.exp <= nowSec) {
    return { ok: false, status: 401, error: 'Session expired.' };
  }

  if (revokedJtis.has(payload.jti)) {
    return { ok: false, status: 401, error: 'Session has been revoked.' };
  }
  if (env?.ADMIN_KV) {
    try {
      const revoked = await env.ADMIN_KV.get(`revoked:${payload.jti}`);
      if (revoked) return { ok: false, status: 401, error: 'Session has been revoked.' };
    } catch (_) {}
  }

  if (payload.u !== env.ADMIN_USERNAME) {
    return { ok: false, status: 401, error: 'Session user mismatch.' };
  }

  return {
    ok: true,
    session: {
      username: payload.u,
      jti: payload.jti,
      csrf: payload.csrf,
      iat: payload.iat * 1000,
      expiresAt: payload.exp * 1000
    }
  };
}

export async function revokeSession(jti, expMs, env) {
  if (!jti) return;
  const expSec = Math.floor((expMs || Date.now() + SESSION_TTL_SEC * 1000) / 1000);
  revokedJtis.set(jti, expSec);
  if (env?.ADMIN_KV) {
    const ttl = Math.max(60, expSec - Math.floor(Date.now() / 1000));
    try {
      await env.ADMIN_KV.put(`revoked:${jti}`, '1', { expirationTtl: ttl });
    } catch (_) {}
  }
}

export function verifySameOrigin(request) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return false;
  return true;
}

export function containsBannedCountry(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return ISRAEL_BLOCK_PATTERN.test(value);
  if (Array.isArray(value)) return value.some(containsBannedCountry);
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (containsBannedCountry(k) || containsBannedCountry(v)) return true;
    }
  }
  return false;
}

export function logAudit(entry) {
  const safeEntry = {
    id: generateRandomId(8),
    at: new Date().toISOString(),
    actor: entry.actor || 'anonymous',
    action: String(entry.action || 'unknown').slice(0, 80),
    status: entry.status || 'ok',
    ip: entry.ip || 'unknown',
    detail: entry.detail ? String(entry.detail).slice(0, 220) : ''
  };
  auditTrail.unshift(safeEntry);
  if (auditTrail.length > MAX_AUDIT_ENTRIES) auditTrail.length = MAX_AUDIT_ENTRIES;
  return safeEntry;
}

export function getAuditLog() {
  return auditTrail.slice(0, 150);
}

export function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders
    }
  });
}
