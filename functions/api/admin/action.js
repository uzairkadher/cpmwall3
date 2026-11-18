import {
  containsBannedCountry,
  getClientIp,
  jsonResponse,
  logAudit,
  timingSafeEqualStr,
  verifySameOrigin,
  verifySession
} from '../../_lib/auth.js';

const ALLOWED_ACTIONS = new Set([
  'battle.start',
  'battle.pause',
  'battle.resume',
  'battle.restart',
  'battle.skip',
  'battle.set_edition',
  'battle.set_auto',
  'battle.set_duration',
  'battle.select_countries',
  'battle.set_queue',
  'battle.trigger_event',
  'country.update_config',
  'audience.submit_request',
  'audience.approve_request',
  'audience.reject_request',
  'audience.feature_comment',
  'audience.clear_featured',
  'audience.moderate',
  'supporter.add_gift',
  'supporter.trigger_effect',
  'supporter.celebrate',
  'supporter.update_limits',
  'match.set_mode',
  'match.start_showcase',
  'tournament.create',
  'tournament.start',
  'tournament.pause',
  'tournament.reset',
  'tournament.schedule',
  'settings.update_gameplay',
  'settings.update_visual_audio',
  'backup.create',
  'backup.restore',
  'backup.selective_reset',
  'emergency.stop',
  'emergency.resume'
]);

function validateBounds(action, payload) {
  if (!payload || typeof payload !== 'object') return null;

  if (action === 'settings.update_gameplay') {
    const checks = [
      ['speedMul', 0.5, 2.0],
      ['pullMul', 0.5, 2.0],
      ['rotMul', 0.5, 2.0],
      ['shieldCooldown', 6, 60],
      ['eventFreqMul', 0.25, 2.5],
      ['bossHpMul', 0.5, 3.0],
      ['bossDmgMul', 0.5, 2.5],
      ['battleDuration', 20, 180],
      ['comebackStrength', 0, 2.0]
    ];
    for (const [key, min, max] of checks) {
      if (payload[key] !== undefined) {
        const v = Number(payload[key]);
        if (!Number.isFinite(v) || v < min || v > max) {
          return `Setting "${key}" out of safe bounds (${min} to ${max}).`;
        }
      }
    }
  }

  if (action === 'settings.update_visual_audio') {
    const checks = [
      ['fxIntensity', 0, 100],
      ['screenShake', 0, 100],
      ['sfxVolume', 0, 100],
      ['musicVolume', 0, 100]
    ];
    for (const [key, min, max] of checks) {
      if (payload[key] !== undefined) {
        const v = Number(payload[key]);
        if (!Number.isFinite(v) || v < min || v > max) {
          return `Visual/audio setting "${key}" out of safe bounds (${min} to ${max}).`;
        }
      }
    }
  }

  if (action === 'supporter.update_limits') {
    const maxPerRound = Number(payload.maxEffectsPerRound);
    const maxPerCountry = Number(payload.maxEffectsPerCountry);
    const shieldDur = Number(payload.maxShieldSec);
    if (payload.maxEffectsPerRound !== undefined && (!Number.isFinite(maxPerRound) || maxPerRound < 0 || maxPerRound > 10)) {
      return 'maxEffectsPerRound must be between 0 and 10.';
    }
    if (payload.maxEffectsPerCountry !== undefined && (!Number.isFinite(maxPerCountry) || maxPerCountry < 0 || maxPerCountry > 3)) {
      return 'maxEffectsPerCountry must be between 0 and 3.';
    }
    if (payload.maxShieldSec !== undefined && (!Number.isFinite(shieldDur) || shieldDur < 1 || shieldDur > 6)) {
      return 'maxShieldSec must be between 1 and 6 seconds.';
    }
  }

  return null;
}

export async function onRequestPost({ request, env }) {
  if (!verifySameOrigin(request)) {
    return jsonResponse({ ok: false, error: 'Cross-origin request rejected.' }, 403);
  }

  const auth = await verifySession(request, env);
  if (!auth.ok) {
    return jsonResponse({ ok: false, error: auth.error }, auth.status);
  }

  const csrfHeader = request.headers.get('X-FCA-Admin-CSRF') || '';
  const csrfOk = await timingSafeEqualStr(env.ADMIN_SESSION_SECRET, csrfHeader, auth.session.csrf);
  if (!csrfOk) {
    return jsonResponse({ ok: false, error: 'Invalid or missing CSRF token.' }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch (_) {
    return jsonResponse({ ok: false, error: 'Invalid JSON payload.' }, 400);
  }

  const action = typeof body?.action === 'string' ? body.action.trim() : '';
  const payload = body?.payload ?? {};

  if (!ALLOWED_ACTIONS.has(action)) {
    return jsonResponse({ ok: false, error: `Unsupported administrative action: ${action}` }, 400);
  }

  // Permanent Israel exclusion enforced server-side across all actions and imports
  if (containsBannedCountry(payload)) {
    logAudit({
      actor: auth.session.username,
      action,
      status: 'blocked',
      ip: getClientIp(request),
      detail: 'Blocked restricted country reference.'
    });
    return jsonResponse(
      { ok: false, error: 'Action rejected: permanently excluded country reference detected.' },
      403
    );
  }

  const boundError = validateBounds(action, payload);
  if (boundError) {
    return jsonResponse({ ok: false, error: boundError }, 400);
  }

  const auditEntry = logAudit({
    actor: auth.session.username,
    action,
    status: 'ok',
    ip: getClientIp(request),
    detail: typeof body?.summary === 'string' ? body.summary : ''
  });

  return jsonResponse({
    ok: true,
    action,
    authorizedAt: Date.now(),
    audit: auditEntry
  });
}

export async function onRequest() {
  return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405, { Allow: 'POST' });
}
