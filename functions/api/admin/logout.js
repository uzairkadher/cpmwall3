import {
  buildClearCookie,
  getClientIp,
  jsonResponse,
  logAudit,
  revokeSession,
  verifySameOrigin,
  verifySession
} from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  if (!verifySameOrigin(request)) {
    return jsonResponse({ ok: false, error: 'Cross-origin request rejected.' }, 403);
  }

  const ip = getClientIp(request);
  const auth = await verifySession(request, env);
  if (auth.ok) {
    await revokeSession(auth.session.jti, auth.session.expiresAt, env);
    logAudit({
      actor: auth.session.username,
      action: 'auth.logout',
      status: 'ok',
      ip
    });
  }

  return jsonResponse({ ok: true }, 200, {
    'Set-Cookie': buildClearCookie(request)
  });
}

export async function onRequest() {
  return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405, { Allow: 'POST' });
}
