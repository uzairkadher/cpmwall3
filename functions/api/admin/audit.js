import { checkEnvConfig, getAuditLog, jsonResponse, verifySession } from '../../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const auth = await verifySession(request, env);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.error }, auth.status);
  }

  const cfg = checkEnvConfig(env);
  return jsonResponse({
    ok: true,
    audit: getAuditLog(),
    health: {
      serverAuthConfigured: cfg.configured,
      kvBackedRateLimit: cfg.kvBound,
      sessionExpiresAt: auth.session.expiresAt,
      serverTime: new Date().toISOString()
    }
  });
}

export async function onRequest() {
  return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405, { Allow: 'GET' });
}
