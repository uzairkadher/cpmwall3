import { checkEnvConfig, jsonResponse, verifySession } from '../../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const cfg = checkEnvConfig(env);
  if (!cfg.configured) {
    return jsonResponse(
      {
        authenticated: false,
        configured: false,
        error: 'Server admin credentials are not configured.'
      },
      503
    );
  }

  const auth = await verifySession(request, env);
  if (!auth.ok) {
    return jsonResponse({ authenticated: false, configured: true, error: auth.error }, auth.status);
  }

  return jsonResponse({
    authenticated: true,
    configured: true,
    username: auth.session.username,
    expiresAt: auth.session.expiresAt,
    csrfToken: auth.session.csrf,
    kvBound: cfg.kvBound
  });
}

export async function onRequest() {
  return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405, { Allow: 'GET' });
}
