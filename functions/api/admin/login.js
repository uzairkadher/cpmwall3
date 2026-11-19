import {
  buildSessionCookie,
  checkEnvConfig,
  checkRateLimit,
  clearRateLimit,
  createSessionToken,
  getClientIp,
  jsonResponse,
  logAudit,
  recordFailedLogin,
  timingSafeEqualStr,
  verifySameOrigin
} from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  if (!verifySameOrigin(request)) {
    return jsonResponse({ ok: false, error: 'Cross-origin request rejected.' }, 403);
  }

  const cfg = checkEnvConfig(env);
  if (!cfg.configured) {
    return jsonResponse(
      {
        ok: false,
        error:
          'Server admin credentials are not configured. Set ADMIN_USERNAME, ADMIN_PASSWORD, and ADMIN_SESSION_SECRET in Cloudflare Pages Environment Variables & Secrets.'
      },
      503
    );
  }

  const ip = getClientIp(request);
  const rl = await checkRateLimit(ip, env);
  if (!rl.allowed) {
    logAudit({ actor: 'anonymous', action: 'auth.login.rate_limited', status: 'blocked', ip });
    return jsonResponse(
      {
        ok: false,
        error: `Too many failed login attempts. Try again in ${rl.retryAfterSec} seconds.`,
        retryAfterSec: rl.retryAfterSec
      },
      429,
      { 'Retry-After': String(rl.retryAfterSec) }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ ok: false, error: 'Invalid JSON request body.' }, 400);
  }

  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!username || !password) {
    return jsonResponse({ ok: false, error: 'Username and password are required.' }, 400);
  }

  const userOk = await timingSafeEqualStr(env.ADMIN_SESSION_SECRET, username, env.ADMIN_USERNAME.trim());
  const passOk = await timingSafeEqualStr(env.ADMIN_SESSION_SECRET, password, env.ADMIN_PASSWORD);

  if (!userOk || !passOk) {
    const rec = await recordFailedLogin(ip, env);
    logAudit({
      actor: username.slice(0, 40) || 'unknown',
      action: 'auth.login.failed',
      status: 'denied',
      ip,
      detail: `Attempt ${rec.count}`
    });
    return jsonResponse({ ok: false, error: 'Invalid username or password.' }, 401);
  }

  await clearRateLimit(ip, env);
  const session = await createSessionToken(env.ADMIN_USERNAME.trim(), env);
  logAudit({
    actor: env.ADMIN_USERNAME.trim(),
    action: 'auth.login.success',
    status: 'ok',
    ip
  });

  return jsonResponse(
    {
      ok: true,
      username: env.ADMIN_USERNAME.trim(),
      expiresAt: session.expiresAt,
      csrfToken: session.csrf
    },
    200,
    { 'Set-Cookie': buildSessionCookie(session.token, request) }
  );
}

export async function onRequest() {
  return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405, { Allow: 'POST' });
}
