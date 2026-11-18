// Flag Clash Arena — Admin Control Center Controller
// Zero hardcoded credentials. All authentication & action authorization happens on the server
// via Cloudflare Pages Functions (/api/admin/*) with HttpOnly cookies and CSRF protection.

(() => {
  'use strict';

  const BAN_RE = /\b(israel|israeli|isr|state\s+of\s+israel)\b|🇮🇱/i;
  const isAllowedCountryName = (n) => typeof n === 'string' && n.trim() !== '' && !BAN_RE.test(n);

  const AUD_KEY = 'fca_audience_requests';
  const MOD_KEY = 'fca_audience_muted';
  const SUP_KEY = 'fca_supporters';
  const TOURN_CUSTOM_KEY = 'fca_custom_tournament';
  const BACKUP_KEY = 'fca_last_backup';
  const HIST_KEY = 'fca_match_history';
  const SHOW_KEY = 'fca_showcase_results';

  const DEFAULT_EDITIONS = [
    { idx: 0, name: 'Classic' },
    { idx: 1, name: 'Rivalry' },
    { idx: 2, name: 'Extreme' },
    { idx: 3, name: 'Mystery' },
    { idx: 4, name: 'Championship' },
    { idx: 5, name: '60-Second Battle' },
    { idx: 6, name: 'Survival Storm' },
    { idx: 7, name: 'King of the Arena' },
    { idx: 8, name: 'Team Wars' },
    { idx: 9, name: 'Sudden Death' },
    { idx: 10, name: 'Boss Battle' },
    { idx: 11, name: 'Chaos Arena' },
    { idx: 12, name: 'Power-Up Battle' }
  ];

  const SPECIAL_EVENTS = [
    { id: 'speed', label: 'Speed Surge' },
    { id: 'gravity', label: 'Gravity Wave' },
    { id: 'shield', label: 'Shield Wave' },
    { id: 'frenzy', label: 'Paddle Frenzy' },
    { id: 'slow', label: 'Slow Motion' },
    { id: 'meteor', label: 'Meteor Shower' },
    { id: 'spot', label: 'Golden Spotlight' },
    { id: 'burst', label: 'Energy Burst' }
  ];

  const state = {
    authenticated: false,
    username: '',
    expiresAt: 0,
    csrfToken: '',
    kvBound: false,
    telemetry: null,
    lastTelemetryAt: 0,
    countries: [],
    countryConfig: {
      disabled: [],
      featured: [],
      activePool: '',
      pools: {},
      randomMode: 'balanced',
      preventDuplicates: true
    },
    battleQueue: [],
    emergencyStop: false,
    controlsHydrated: false
  };

  let bc = null;
  let pendingModalResolve = null;

  const $ = (id) => document.getElementById(id);

  function escapeHtml(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function toast(msg, type = 'info') {
    const stack = $('toast-stack');
    const el = document.createElement('div');
    el.className = `toast-item ${type === 'error' ? 'err' : type === 'ok' ? 'ok' : ''}`;
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 3800);
  }

  function readLS(k, fb) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : fb;
    } catch (_) {
      return fb;
    }
  }

  function writeLS(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (_) {}
  }

  // ===== CONFIRMATION MODAL =====
  function confirmDialog({ title, body, confirmText = 'Confirm', requireTyped = '' }) {
    return new Promise((resolve) => {
      pendingModalResolve = resolve;
      $('modal-title').textContent = title;
      $('modal-body').textContent = body;
      $('modal-confirm').textContent = confirmText;
      const wrap = $('modal-type-wrap');
      const input = $('modal-type-input');
      input.value = '';
      if (requireTyped) {
        wrap.classList.remove('hidden');
        $('modal-type-label').textContent = `Type "${requireTyped}" to confirm`;
        $('modal-confirm').disabled = true;
        input.oninput = () => {
          $('modal-confirm').disabled = input.value.trim() !== requireTyped;
        };
      } else {
        wrap.classList.add('hidden');
        $('modal-confirm').disabled = false;
      }
      $('confirm-modal').classList.remove('hidden');
    });
  }

  $('modal-cancel').addEventListener('click', () => {
    $('confirm-modal').classList.add('hidden');
    if (pendingModalResolve) {
      pendingModalResolve(false);
      pendingModalResolve = null;
    }
  });

  $('modal-confirm').addEventListener('click', () => {
    $('confirm-modal').classList.add('hidden');
    if (pendingModalResolve) {
      pendingModalResolve(true);
      pendingModalResolve = null;
    }
  });

  // ===== SERVER AUTH & PROTECTED API =====
  async function checkSession() {
    try {
      const res = await fetch('/api/admin/session', { credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.authenticated) {
        onAuthenticated(data);
        return true;
      }
      if (res.status === 503) {
        showAuthAlert(data.error || 'Admin credentials are not configured on Cloudflare Pages.');
      }
    } catch (_) {
      showAuthAlert('Unable to reach server authentication endpoint (/api/admin/session). Deploy via Cloudflare Pages Functions or Wrangler dev.');
    }
    showAuthGate();
    return false;
  }

  function showAuthAlert(msg) {
    const el = $('auth-alert');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function clearAuthAlert() {
    $('auth-alert').classList.add('hidden');
  }

  function showAuthGate() {
    state.authenticated = false;
    $('app-shell').classList.add('hidden');
    $('auth-screen').classList.remove('hidden');
  }

  function onAuthenticated(data) {
    state.authenticated = true;
    state.username = data.username || 'admin';
    state.expiresAt = data.expiresAt || Date.now() + 3600000;
    state.csrfToken = data.csrfToken || '';
    state.kvBound = !!data.kvBound;
    clearAuthAlert();
    $('auth-screen').classList.add('hidden');
    $('app-shell').classList.remove('hidden');
    initChannel();
    populateStaticDropdowns();
    refreshAuditLog();
    renderAudience();
    renderSupporters();
    renderCustomTournament();
    renderBackupInfo();
  }

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAuthAlert();
    const btn = $('login-submit');
    btn.disabled = true;
    btn.textContent = 'Verifying...';
    const username = $('login-username').value.trim();
    const password = $('login-password').value;
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json().catch(() => ({}));
      $('login-password').value = '';
      if (!res.ok || !data.ok) {
        showAuthAlert(data.error || 'Authentication failed.');
      } else {
        onAuthenticated(data);
        toast(`Signed in as ${data.username}`, 'ok');
      }
    } catch (_) {
      showAuthAlert('Network error contacting /api/admin/login.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In to Control Center';
    }
  });

  $('logout-btn').addEventListener('click', async () => {
    try {
      await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (_) {}
    showAuthGate();
    toast('Signed out cleanly.', 'ok');
  });

  // Every administrative action is authorized on the server FIRST via /api/admin/action
  async function execAdminAction(action, payload = {}, summary = '', dispatchToGame = true) {
    if (!state.authenticated) {
      toast('Session expired. Please sign in again.', 'error');
      showAuthGate();
      return { ok: false, error: 'Not authenticated' };
    }

    try {
      const res = await fetch('/api/admin/action', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-FCA-Admin-CSRF': state.csrfToken
        },
        body: JSON.stringify({ action, payload, summary })
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        toast('Session expired. Please sign in again.', 'error');
        showAuthGate();
        return { ok: false, error: 'Unauthorized' };
      }
      if (!res.ok || !data.ok) {
        toast(data.error || 'Server rejected action.', 'error');
        return { ok: false, error: data.error };
      }

      if (dispatchToGame && bc) {
        bc.postMessage({
          target: 'game',
          reqId: 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
          action,
          payload
        });
      }
      refreshAuditLog();
      return { ok: true, audit: data.audit };
    } catch (_) {
      toast('Failed to authorize action with server.', 'error');
      return { ok: false, error: 'Network error' };
    }
  }

  // ===== BROADCAST CHANNEL TO AUDIENCE GAME ENGINE =====
  function initChannel() {
    if (bc || typeof BroadcastChannel === 'undefined') return;
    bc = new BroadcastChannel('fca_admin_channel');
    bc.onmessage = (ev) => {
      const msg = ev.data;
      if (!msg || msg.target !== 'admin') return;
      if (msg.type === 'telemetry' && msg.data) {
        state.telemetry = msg.data;
        state.lastTelemetryAt = Date.now();
        syncFromTelemetry(msg.data);
      } else if (msg.type === 'ack' && msg.res && !msg.res.ok) {
        toast(msg.res.error || 'Engine reported an error.', 'error');
      }
    };
    bc.postMessage({ target: 'game', action: 'ping' });
  }

  function populateStaticDropdowns() {
    const edSelects = ['battle-edition-select', 'q-edition', 'showcase-edition-select', 'tourn-edition'];
    for (const id of edSelects) {
      const el = $(id);
      if (!el || el.options.length > 0) continue;
      DEFAULT_EDITIONS.forEach((e) => {
        const opt = document.createElement('option');
        opt.value = String(e.idx);
        opt.textContent = `${e.idx + 1}. ${e.name}`;
        el.appendChild(opt);
      });
    }

    const evGrid = $('event-trigger-grid');
    if (evGrid && evGrid.children.length === 0) {
      SPECIAL_EVENTS.forEach((ev) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn btn-sm';
        b.textContent = ev.label;
        b.addEventListener('click', async () => {
          const r = await execAdminAction('battle.trigger_event', { eventId: ev.id }, `Triggered ${ev.label}`);
          if (r.ok) toast(`Triggered ${ev.label}`, 'ok');
        });
        evGrid.appendChild(b);
      });
    }
  }

  function populateCountrySelectors(countries) {
    const clean = countries.filter((c) => isAllowedCountryName(c.name));
    state.countries = clean;
    const ids = ['q-countries', 'showcase-winner-select', 'aud-country', 'sup-country'];
    for (const id of ids) {
      const el = $(id);
      if (!el) continue;
      if (el.options.length === clean.length) continue;
      const prev = el.value;
      el.innerHTML = '';
      clean.forEach((c) => {
        const opt = document.createElement('option');
        opt.value = String(c.id);
        opt.textContent = c.name;
        el.appendChild(opt);
      });
      if (prev) el.value = prev;
    }
  }

  function syncFromTelemetry(d) {
    if (Array.isArray(d.countries) && d.countries.length) {
      populateCountrySelectors(d.countries);
    }
    state.emergencyStop = !!d.emergencyStop;
    state.battleQueue = Array.isArray(d.battleQueue) ? d.battleQueue : [];
    if (!state.controlsHydrated) {
      state.controlsHydrated = true;
      state.countryConfig = d.countryConfig || state.countryConfig;
      hydrateFormControls(d);
    }

    // Connection & Topbar
    const connPill = $('conn-pill');
    connPill.className = 'status-pill live';
    $('conn-label').textContent = 'Audience Engine Live';
    $('top-edition').textContent = `${d.editionName} · R${d.round}`;

    const estopBtn = $('estop-btn');
    if (d.emergencyStop) {
      estopBtn.textContent = 'RESUME OPERATIONS';
      estopBtn.classList.add('active');
      $('estop-banner').classList.remove('hidden');
    } else {
      estopBtn.textContent = 'EMERGENCY STOP';
      estopBtn.classList.remove('active');
      $('estop-banner').classList.add('hidden');
    }

    // Dashboard KPIs
    const kpiStatus = $('kpi-status');
    if (d.emergencyStop) {
      kpiStatus.textContent = 'E-STOP';
      kpiStatus.className = 'kpi-value kpi-crimson';
    } else if (d.paused) {
      kpiStatus.textContent = 'PAUSED';
      kpiStatus.className = 'kpi-value kpi-gold';
    } else {
      kpiStatus.textContent = d.phase === 0 ? 'LIVE BATTLE' : 'INTERMISSION';
      kpiStatus.className = 'kpi-value kpi-emerald';
    }

    $('kpi-match-type').textContent =
      d.matchType === 'showcase'
        ? `Mode: OPERATOR SHOWCASE (${getCountryName(d.showcaseWinner)})`
        : 'Mode: Normal Competitive';
    $('kpi-edition').textContent = d.editionName;
    $('kpi-round').textContent = `Round ${d.round} · ${d.elapsedSec}s elapsed${d.remainingSec !== null ? ` · ${d.remainingSec}s left` : ''}`;
    $('kpi-alive').textContent = `${d.aliveCount} / ${d.totalFlags}`;
    $('kpi-event').textContent = `Active Event: ${d.activeEvent ? d.activeEvent.name : 'None'}`;
    $('kpi-queue').textContent = `${state.battleQueue.length} queued`;
    $('kpi-tourney').textContent = `Championship: Round ${d.tourney?.round || 0}/12`;

    // System Health
    $('dash-health').innerHTML = `
      <div>Engine Connection: <strong style="color:var(--accent-emerald)">Connected</strong></div>
      <div>Server Auth: <strong style="color:var(--accent-emerald)">Cloudflare Secrets Verified</strong></div>
      <div>Israel Exclusion Filter: <strong style="color:var(--accent-emerald)">Active (Client + Server)</strong></div>
      <div>Supporter Effects This Round: <strong>${d.roundSupporterEffects?.total || 0} / ${d.supporterLimits?.maxEffectsPerRound ?? 4}</strong></div>
    `;

    // Upcoming Queue Preview
    $('dash-queue-list').innerHTML = state.battleQueue.length
      ? state.battleQueue
          .slice(0, 5)
          .map(
            (q, i) =>
              `<div style="padding:4px 0;border-bottom:1px solid var(--border)">#${i + 1} <strong>${escapeHtml(
                q.label || 'Queued Match'
              )}</strong> — ${DEFAULT_EDITIONS[q.editionIdx]?.name || 'Classic'} (${q.matchType.toUpperCase()})</div>`
          )
          .join('')
      : 'Queue is empty (automatic selection active).';

    // Recent Results (Normal + Showcase combined with clear tags)
    const combined = [
      ...(d.recentResults || []).slice(0, 8),
      ...(d.showcaseResults || []).slice(0, 4)
    ]
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 10);

    $('dash-recent-body').innerHTML = combined.length
      ? combined
          .map(
            (r) => `<tr>
          <td>#${r.round}</td>
          <td>${escapeHtml(r.edition)}</td>
          <td><strong>${escapeHtml(r.winnerName)}</strong></td>
          <td><span class="badge ${r.matchType === 'showcase' ? 'badge-crimson' : 'badge-emerald'}">${escapeHtml(
              r.matchType
            )}</span></td>
          <td>${r.durationSec}s</td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="5" style="color:var(--text-muted)">No recent results yet.</td></tr>';

    // Live Mode Telemetry
    const modeBits = [];
    if (d.boss) modeBits.push(`Boss: ${d.boss.country} (HP ${d.boss.hp}/${d.boss.maxHp}, Dmg Taken ${d.boss.dmg})`);
    if (d.king) modeBits.push(`King: ${d.king.country} (${d.king.alive ? 'Alive' : 'Defeated'})`);
    if (d.storm) modeBits.push(`Storm Stage ${d.storm.stage} · In Danger: ${d.storm.dangerCount}`);
    if (d.team) modeBits.push(`Team A Alive: ${d.team.aAlive} vs Team B Alive: ${d.team.bAlive}`);
    modeBits.push(`Phase: ${d.phase === 0 ? 'Active Combat' : 'Post-Round Screen'}`);
    $('live-mode-telemetry').textContent = modeBits.join(' · ');

    // Live Combatants Table
    $('live-flags-body').innerHTML = (d.aliveFlags || []).length
      ? d.aliveFlags
          .map(
            (f) => `<tr>
          <td><strong>${escapeHtml(f.name)}</strong></td>
          <td>${f.isBoss ? '<span class="badge badge-gold">BOSS</span>' : f.isKing ? '<span class="badge badge-gold">KING</span>' : f.team === 0 ? '<span class="badge badge-crimson">Team A</span>' : f.team === 1 ? '<span class="badge badge-cyan">Team B</span>' : 'Combatant'}</td>
          <td>${f.isBoss ? `HP ${f.hp}` : f.inDanger ? '<span class="badge badge-crimson">In Danger</span>' : f.inHole ? '<span class="badge badge-gold">Near Hole</span>' : '<span class="badge badge-emerald">Healthy</span>'}</td>
          <td>${f.shield > 0 ? f.shield + 's' : '—'}</td>
          <td>${f.supBoost > 0 ? '+' + f.supBoost + 's' : '—'}</td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="5" style="color:var(--text-muted)">No active flags.</td></tr>';

    renderQueueTable();
    renderCountryGrid();
    renderShowcaseHistory(d.showcaseResults || []);
    renderChampionship(d);
    renderHoF(d);
  }

  function hydrateFormControls(d) {
    $('toggle-auto-battle').checked = d.autoBattle !== false;
    $('battle-edition-select').value = String(d.editionIdx || 0);
    if (d.gameplay) {
      $('set-classic-lock').checked = d.gameplay.classicPhysicsLock !== false;
      $('set-speed').value = d.gameplay.speedMul ?? 1;
      $('set-pull').value = d.gameplay.pullMul ?? 1;
      $('set-rot').value = d.gameplay.rotMul ?? 1;
      $('set-shcd').value = d.gameplay.shieldCooldown ?? 22;
      $('set-evfreq').value = d.gameplay.eventFreqMul ?? 1;
      $('set-bosshp').value = d.gameplay.bossHpMul ?? 1;
      $('set-bossdmg').value = d.gameplay.bossDmgMul ?? 1;
      $('set-difficulty').value = d.gameplay.difficulty || 'normal';
      $('set-comeback').checked = !!d.gameplay.comebackEnabled;
      $('set-cbstr').value = d.gameplay.comebackStrength ?? 0.5;
      $('battle-duration-input').value = d.gameplay.battleDuration ?? 60;
      $('toggle-custom-dur').checked = !!d.gameplay.customDurationEnabled;
      updateSliderLabels();
    }
    if (d.visual) {
      $('vis-particles').checked = d.visual.particlesEnabled !== false;
      $('vis-fx').value = d.visual.fxIntensity ?? 100;
      $('vis-shake').value = d.visual.screenShake ?? 60;
      $('vis-hitstop').checked = d.visual.hitStopEnabled !== false;
      $('vis-slowmo').checked = d.visual.slowMotionEnabled !== false;
      $('vis-vicanim').checked = d.visual.victoryAnimEnabled !== false;
      $('vis-announcer').checked = d.visual.announcerEnabled !== false;
      $('vis-sfx').value = d.visual.sfxVolume ?? 80;
      $('vis-music').value = d.visual.musicVolume ?? 65;
      $('ov-comment').checked = d.visual.overlays?.featuredComment !== false;
      $('ov-supporter').checked = d.visual.overlays?.topSupporter !== false;
      $('ov-showcase').checked = d.visual.overlays?.showcaseBadge !== false;
      updateSliderLabels();
    }
    if (d.supporterLimits) {
      $('sup-lim-enabled').checked = d.supporterLimits.enabled !== false;
      $('sup-lim-round').value = d.supporterLimits.maxEffectsPerRound ?? 4;
      $('sup-lim-country').value = d.supporterLimits.maxEffectsPerCountry ?? 2;
      $('sup-lim-shield').value = d.supporterLimits.maxShieldSec ?? 4;
      $('sup-lim-cd').value = d.supporterLimits.cooldownSec ?? 6;
    }
    if (d.countryConfig) {
      $('country-random-mode').value = d.countryConfig.randomMode || 'balanced';
      $('toggle-prevent-dup').checked = d.countryConfig.preventDuplicates !== false;
    }
  }

  function getCountryName(id) {
    const found = state.countries.find((c) => c.id === +id);
    return found ? found.name : `#${id}`;
  }

  // ===== NAVIGATION =====
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      document.querySelectorAll('.tab-panel').forEach((sec) => {
        sec.classList.toggle('hidden', sec.id !== `tab-${tab}`);
      });
      $('sidebar').classList.remove('open');
    });
  });

  $('menu-toggle').addEventListener('click', () => {
    $('sidebar').classList.toggle('open');
  });

  // ===== QUICK BATTLE CONTROLS & EMERGENCY STOP =====
  document.querySelectorAll('[data-quick]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.quick;
      const r = await execAdminAction(action, {}, `Quick action: ${action}`);
      if (r.ok) toast(`Executed ${action.replace('battle.', '').toUpperCase()}`, 'ok');
    });
  });

  $('estop-btn').addEventListener('click', async () => {
    if (!state.emergencyStop) {
      const ok = await confirmDialog({
        title: 'Activate Emergency Stop?',
        body: 'This will immediately halt active gameplay, cancel pending supporter effects, and block new matches while preserving all saved records.',
        confirmText: 'ACTIVATE EMERGENCY STOP'
      });
      if (!ok) return;
      const r = await execAdminAction('emergency.stop', {}, 'Operator triggered Emergency Stop');
      if (r.ok) toast('EMERGENCY STOP ACTIVATED', 'error');
    } else {
      const ok = await confirmDialog({
        title: 'Resume Arena Operations?',
        body: 'Confirm that you have reviewed the situation and are ready to resume normal Flag Clash Arena operations.',
        confirmText: 'Resume Operations'
      });
      if (!ok) return;
      const r = await execAdminAction('emergency.resume', {}, 'Operator cleared Emergency Stop');
      if (r.ok) toast('Arena operations resumed.', 'ok');
    }
  });

  $('apply-edition-btn').addEventListener('click', async () => {
    const editionIdx = Number($('battle-edition-select').value);
    const r = await execAdminAction('battle.set_edition', { editionIdx }, `Switched to ${DEFAULT_EDITIONS[editionIdx]?.name}`);
    if (r.ok) toast(`Switched to ${DEFAULT_EDITIONS[editionIdx]?.name}`, 'ok');
  });

  $('toggle-auto-battle').addEventListener('change', async (e) => {
    await execAdminAction('battle.set_auto', { autoBattle: e.target.checked }, `Auto-battle: ${e.target.checked}`);
  });

  $('save-duration-btn').addEventListener('click', async () => {
    const battleDuration = Number($('battle-duration-input').value);
    const customDurationEnabled = $('toggle-custom-dur').checked;
    const r = await execAdminAction('battle.set_duration', { battleDuration, customDurationEnabled }, `Duration ${battleDuration}s`);
    if (r.ok) toast('Battle duration updated.', 'ok');
  });

  // ===== BATTLE QUEUE =====
  function getSelectedQueueCountries() {
    return Array.from($('q-countries').selectedOptions).map((o) => Number(o.value));
  }

  $('btn-launch-now').addEventListener('click', async () => {
    const countries = getSelectedQueueCountries();
    const editionIdx = Number($('q-edition').value);
    const r = await execAdminAction('battle.select_countries', { countries, editionIdx, matchType: 'normal' }, `Launched custom matchup (${countries.length} pinned)`);
    if (r.ok) toast('Launched selected matchup immediately.', 'ok');
  });

  $('btn-add-queue').addEventListener('click', async () => {
    const countries = getSelectedQueueCountries();
    const editionIdx = Number($('q-edition').value);
    const label = $('q-label').value.trim() || `Match #${state.battleQueue.length + 1}`;
    const nextQueue = [...state.battleQueue, { id: String(Date.now()), editionIdx, countries, matchType: 'normal', showcaseWinner: -1, label }];
    const r = await execAdminAction('battle.set_queue', { queue: nextQueue }, `Queued "${label}"`);
    if (r.ok) {
      state.battleQueue = nextQueue;
      $('q-label').value = '';
      renderQueueTable();
      toast(`Added "${label}" to battle queue.`, 'ok');
    }
  });

  $('btn-clear-queue').addEventListener('click', async () => {
    const r = await execAdminAction('battle.set_queue', { queue: [] }, 'Cleared battle queue');
    if (r.ok) {
      state.battleQueue = [];
      renderQueueTable();
      toast('Battle queue cleared.', 'ok');
    }
  });

  function renderQueueTable() {
    const tb = $('queue-table-body');
    if (!state.battleQueue.length) {
      tb.innerHTML = '<tr><td colspan="5" style="color:var(--text-muted)">No queued matchups.</td></tr>';
      return;
    }
    tb.innerHTML = state.battleQueue
      .map(
        (q, i) => `<tr>
        <td>${i + 1}</td>
        <td><strong>${escapeHtml(q.label || 'Queued Match')}</strong><br><small style="color:var(--text-muted)">${q.countries?.length || 0} pinned</small></td>
        <td>${escapeHtml(DEFAULT_EDITIONS[q.editionIdx]?.name || 'Classic')}</td>
        <td><span class="badge ${q.matchType === 'showcase' ? 'badge-crimson' : 'badge-emerald'}">${escapeHtml(q.matchType)}</span></td>
        <td>
          <button class="btn btn-sm" data-q-up="${i}">↑</button>
          <button class="btn btn-sm" data-q-down="${i}">↓</button>
          <button class="btn btn-sm btn-danger" data-q-del="${i}">✕</button>
        </td>
      </tr>`
      )
      .join('');

    tb.querySelectorAll('[data-q-up]').forEach((b) =>
      b.addEventListener('click', () => moveQueue(+b.dataset.qUp, -1))
    );
    tb.querySelectorAll('[data-q-down]').forEach((b) =>
      b.addEventListener('click', () => moveQueue(+b.dataset.qDown, 1))
    );
    tb.querySelectorAll('[data-q-del]').forEach((b) =>
      b.addEventListener('click', () => removeQueue(+b.dataset.qDel))
    );
  }

  async function moveQueue(idx, dir) {
    const target = idx + dir;
    if (target < 0 || target >= state.battleQueue.length) return;
    const next = [...state.battleQueue];
    [next[idx], next[target]] = [next[target], next[idx]];
    const r = await execAdminAction('battle.set_queue', { queue: next }, 'Reordered battle queue');
    if (r.ok) {
      state.battleQueue = next;
      renderQueueTable();
    }
  }

  async function removeQueue(idx) {
    const next = state.battleQueue.filter((_, i) => i !== idx);
    const r = await execAdminAction('battle.set_queue', { queue: next }, 'Removed queued matchup');
    if (r.ok) {
      state.battleQueue = next;
      renderQueueTable();
    }
  }

  // ===== COUNTRY MANAGEMENT =====
  function renderCountryGrid() {
    const grid = $('country-grid');
    if (!grid || !state.countries.length) return;
    const filter = ($('country-search').value || '').trim().toLowerCase();
    const disabledSet = new Set(state.countryConfig.disabled || []);
    const featuredSet = new Set(state.countryConfig.featured || []);
    const enabledCount = state.countries.length - disabledSet.size;

    $('country-summary').innerHTML = `
      <div>Total Eligible: <strong>${state.countries.length}</strong> (Israel permanently excluded)</div>
      <div>Currently Enabled: <strong style="color:var(--accent-emerald)">${enabledCount}</strong> (min 30 required)</div>
      <div>Featured Countries: <strong style="color:var(--accent-gold)">${featuredSet.size}</strong></div>
      <div>Saved Pools: <strong>${Object.keys(state.countryConfig.pools || {}).length}</strong></div>
    `;

    // Pool selector
    const poolSel = $('active-pool-select');
    const curPool = state.countryConfig.activePool || '';
    const poolNames = Object.keys(state.countryConfig.pools || {});
    if (poolSel.options.length !== poolNames.length + 1) {
      poolSel.innerHTML = '<option value="">All Enabled Countries (Default)</option>';
      poolNames.forEach((p) => {
        const opt = document.createElement('option');
        opt.value = p;
        opt.textContent = `${p} (${state.countryConfig.pools[p].length} countries)`;
        poolSel.appendChild(opt);
      });
      poolSel.value = curPool;
    }

    const filtered = state.countries.filter((c) => !filter || c.name.toLowerCase().includes(filter));
    grid.innerHTML = filtered
      .map((c) => {
        const dis = disabledSet.has(c.id);
        const feat = featuredSet.has(c.id);
        return `<div class="country-chip ${dis ? 'disabled' : ''} ${feat ? 'featured' : ''}">
          <div class="country-chip-head">
            <span>${escapeHtml(c.name)}</span>
            <small style="color:var(--text-muted)">${c.wins}W</small>
          </div>
          <div class="country-chip-actions">
            <button type="button" class="btn btn-sm ${dis ? 'btn-success' : ''}" data-c-toggle="${c.id}">${dis ? 'Enable' : 'Disable'}</button>
            <button type="button" class="btn btn-sm ${feat ? 'btn-gold' : ''}" data-c-feat="${c.id}">${feat ? '★ Featured' : '☆ Feature'}</button>
          </div>
        </div>`;
      })
      .join('');

    grid.querySelectorAll('[data-c-toggle]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = +b.dataset.cToggle;
        const set = new Set(state.countryConfig.disabled || []);
        if (set.has(id)) {
          set.delete(id);
        } else {
          if (state.countries.length - (set.size + 1) < 30) {
            toast('At least 30 countries must remain enabled for arena rounds.', 'error');
            return;
          }
          set.add(id);
        }
        state.countryConfig.disabled = [...set];
        renderCountryGrid();
      })
    );

    grid.querySelectorAll('[data-c-feat]').forEach((b) =>
      b.addEventListener('click', () => {
        const id = +b.dataset.cFeat;
        const set = new Set(state.countryConfig.featured || []);
        if (set.has(id)) set.delete(id);
        else set.add(id);
        state.countryConfig.featured = [...set];
        renderCountryGrid();
      })
    );
  }

  $('country-search').addEventListener('input', renderCountryGrid);

  $('btn-create-pool').addEventListener('click', () => {
    const name = $('new-pool-name').value.trim();
    if (!name) return toast('Enter a pool name first.', 'error');
    const dis = new Set(state.countryConfig.disabled || []);
    const enabled = state.countries.filter((c) => !dis.has(c.id)).map((c) => c.id);
    if (enabled.length < 30) return toast('Pool must have at least 30 countries.', 'error');
    state.countryConfig.pools = { ...(state.countryConfig.pools || {}), [name]: enabled };
    state.countryConfig.activePool = name;
    $('new-pool-name').value = '';
    renderCountryGrid();
    toast(`Pool "${name}" prepared. Click Save Country Config to apply.`, 'ok');
  });

  $('btn-save-countries').addEventListener('click', async () => {
    state.countryConfig.randomMode = $('country-random-mode').value;
    state.countryConfig.preventDuplicates = $('toggle-prevent-dup').checked;
    state.countryConfig.activePool = $('active-pool-select').value;
    const r = await execAdminAction('country.update_config', state.countryConfig, 'Updated country pool configuration');
    if (r.ok) toast('Country configuration saved and applied.', 'ok');
  });

  // ===== SPECIAL MATCH CONTROL =====
  $('btn-save-sup-limits').addEventListener('click', async () => {
    const payload = {
      enabled: $('sup-lim-enabled').checked,
      maxEffectsPerRound: Number($('sup-lim-round').value),
      maxEffectsPerCountry: Number($('sup-lim-country').value),
      maxShieldSec: Number($('sup-lim-shield').value),
      cooldownSec: Number($('sup-lim-cd').value)
    };
    const r = await execAdminAction('supporter.update_limits', payload, 'Updated bounded supporter advantage limits');
    if (r.ok) toast('Competitive supporter limits saved.', 'ok');
  });

  $('btn-start-showcase').addEventListener('click', async () => {
    const showcaseWinner = Number($('showcase-winner-select').value);
    const editionIdx = Number($('showcase-edition-select').value);
    const name = getCountryName(showcaseWinner);
    const ok = await confirmDialog({
      title: 'Launch Operator-Controlled Showcase?',
      body: `This will start a visibly labeled "OPERATOR-CONTROLLED SHOWCASE" match with ${name} as the selected winner. Results will be stored separately and will NOT affect competitive stats.`,
      confirmText: 'Launch Showcase'
    });
    if (!ok) return;
    const r = await execAdminAction('match.start_showcase', { showcaseWinner, editionIdx }, `Launched Showcase (Winner: ${name})`);
    if (r.ok) toast(`Showcase match launched for ${name}.`, 'ok');
  });

  $('btn-queue-showcase').addEventListener('click', async () => {
    const showcaseWinner = Number($('showcase-winner-select').value);
    const editionIdx = Number($('showcase-edition-select').value);
    const name = getCountryName(showcaseWinner);
    const nextQueue = [
      ...state.battleQueue,
      {
        id: String(Date.now()),
        editionIdx,
        countries: [showcaseWinner],
        matchType: 'showcase',
        showcaseWinner,
        label: `Showcase: ${name}`
      }
    ];
    const r = await execAdminAction('battle.set_queue', { queue: nextQueue }, `Queued Showcase (${name})`);
    if (r.ok) {
      state.battleQueue = nextQueue;
      renderQueueTable();
      toast(`Queued Operator-Controlled Showcase for ${name}.`, 'ok');
    }
  });

  function renderShowcaseHistory(list) {
    const tb = $('showcase-results-body');
    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="5" style="color:var(--text-muted)">No showcase matches recorded yet.</td></tr>';
      return;
    }
    tb.innerHTML = list
      .map(
        (r) => `<tr>
        <td>${new Date(r.at).toLocaleString()}</td>
        <td>${escapeHtml(r.edition)}</td>
        <td><strong style="color:var(--accent-gold)">${escapeHtml(r.winnerName)}</strong></td>
        <td>${r.durationSec}s</td>
        <td>${r.elims}</td>
      </tr>`
      )
      .join('');
  }

  // ===== AUDIENCE & COMMENT MANAGEMENT =====
  function renderAudience() {
    const reqs = readLS(AUD_KEY, []);
    const muted = readLS(MOD_KEY, []);
    const pendingCount = reqs.filter((r) => r.status === 'pending').length;
    $('badge-pending-req').textContent = String(pendingCount);

    $('mod-banned-list').innerHTML = muted.length
      ? muted
          .map(
            (u) =>
              `<span class="badge badge-crimson" style="margin:2px">${escapeHtml(u)} <a href="#" data-unmute="${escapeHtml(
                u
              )}" style="color:#fff;margin-left:4px;text-decoration:none">×</a></span>`
          )
          .join('')
      : 'No muted usernames.';

    $('mod-banned-list')
      .querySelectorAll('[data-unmute]')
      .forEach((a) =>
        a.addEventListener('click', (e) => {
          e.preventDefault();
          const target = a.dataset.unmute;
          writeLS(
            MOD_KEY,
            muted.filter((x) => x !== target)
          );
          renderAudience();
        })
      );

    const tb = $('audience-table-body');
    if (!reqs.length) {
      tb.innerHTML = '<tr><td colspan="5" style="color:var(--text-muted)">No viewer requests logged yet.</td></tr>';
      return;
    }
    tb.innerHTML = reqs
      .map(
        (r) => `<tr>
        <td><strong>${escapeHtml(r.user)}</strong></td>
        <td>${escapeHtml(r.country)}</td>
        <td>${escapeHtml(r.comment || '—')}</td>
        <td><span class="badge ${r.status === 'approved' ? 'badge-emerald' : r.status === 'rejected' ? 'badge-crimson' : 'badge-gold'}">${escapeHtml(
          r.status
        )}</span></td>
        <td class="btn-group">
          ${r.status === 'pending' ? `<button class="btn btn-sm btn-success" data-req-approve="${r.id}">Approve → Queue</button><button class="btn btn-sm btn-danger" data-req-reject="${r.id}">Reject</button>` : ''}
          <button class="btn btn-sm btn-primary" data-req-feature="${r.id}">Feature</button>
        </td>
      </tr>`
      )
      .join('');

    tb.querySelectorAll('[data-req-approve]').forEach((b) =>
      b.addEventListener('click', () => handleAudienceDecision(b.dataset.reqApprove, 'approved'))
    );
    tb.querySelectorAll('[data-req-reject]').forEach((b) =>
      b.addEventListener('click', () => handleAudienceDecision(b.dataset.reqReject, 'rejected'))
    );
    tb.querySelectorAll('[data-req-feature]').forEach((b) =>
      b.addEventListener('click', async () => {
        const item = reqs.find((x) => x.id === b.dataset.reqFeature);
        if (!item) return;
        const r = await execAdminAction('audience.feature_comment', { user: item.user, text: item.comment || `Requested ${item.country}!`, ttl: 12 }, `Featured comment by ${item.user}`);
        if (r.ok) toast(`Featuring comment from ${item.user}`, 'ok');
      })
    );
  }

  async function handleAudienceDecision(id, status) {
    const reqs = readLS(AUD_KEY, []);
    const item = reqs.find((x) => x.id === id);
    if (!item) return;
    item.status = status;
    writeLS(AUD_KEY, reqs);

    if (status === 'approved') {
      const cObj = state.countries.find((c) => c.name.toLowerCase() === item.country.toLowerCase());
      const nextQueue = [
        ...state.battleQueue,
        {
          id: String(Date.now()),
          editionIdx: state.telemetry?.editionIdx || 0,
          countries: cObj ? [cObj.id] : [],
          matchType: 'normal',
          showcaseWinner: -1,
          label: `Viewer Req: ${item.country} (${item.user})`
        }
      ];
      await execAdminAction('battle.set_queue', { queue: nextQueue }, `Approved request from ${item.user} (${item.country})`);
      state.battleQueue = nextQueue;
      renderQueueTable();
      toast(`Approved ${item.user}'s request for ${item.country} and added to queue.`, 'ok');
    } else {
      await execAdminAction('audience.reject_request', { id }, `Rejected request from ${item.user}`, false);
      toast(`Rejected request from ${item.user}.`);
    }
    renderAudience();
  }

  $('btn-add-request').addEventListener('click', async () => {
    const user = $('aud-user').value.trim() || 'Viewer';
    const countryId = Number($('aud-country').value);
    const country = getCountryName(countryId);
    const comment = $('aud-comment').value.trim();
    const muted = readLS(MOD_KEY, []);
    if (muted.includes(user.toLowerCase())) {
      return toast(`User "${user}" is muted by moderation.`, 'error');
    }
    if (!isAllowedCountryName(country)) {
      return toast('Restricted country blocked.', 'error');
    }
    const r = await execAdminAction('audience.submit_request', { user, country, comment }, `Logged viewer request (${country})`, false);
    if (!r.ok) return;
    const reqs = readLS(AUD_KEY, []);
    reqs.unshift({
      id: 'req_' + Date.now(),
      user,
      country,
      comment,
      status: 'pending',
      source: 'internal_manual',
      at: new Date().toISOString()
    });
    writeLS(AUD_KEY, reqs.slice(0, 300));
    $('aud-comment').value = '';
    renderAudience();
    toast('Viewer request added.', 'ok');
  });

  $('btn-clear-featured').addEventListener('click', async () => {
    const r = await execAdminAction('audience.clear_featured', {}, 'Cleared featured comment');
    if (r.ok) toast('Featured comment cleared.');
  });

  $('btn-ban-user').addEventListener('click', async () => {
    const u = $('mod-ban-user').value.trim().toLowerCase();
    if (!u) return;
    const muted = readLS(MOD_KEY, []);
    if (!muted.includes(u)) muted.push(u);
    writeLS(MOD_KEY, muted);
    $('mod-ban-user').value = '';
    await execAdminAction('audience.moderate', { mutedUser: u }, `Muted username ${u}`, false);
    renderAudience();
    toast(`Muted "${u}".`, 'ok');
  });

  // ===== GIFTS & SUPPORTERS =====
  function renderSupporters() {
    const data = readLS(SUP_KEY, { gifts: [] });
    const gifts = Array.isArray(data.gifts) ? data.gifts : [];

    // Aggregate rankings
    const map = {};
    for (const g of gifts) {
      if (!map[g.supporter]) map[g.supporter] = { name: g.supporter, points: 0, count: 0, country: g.country };
      map[g.supporter].points += Number(g.value || 0);
      map[g.supporter].count += 1;
      map[g.supporter].country = g.country;
    }
    const ranked = Object.values(map).sort((a, b) => b.points - a.points);

    $('supporter-rank-body').innerHTML = ranked.length
      ? ranked
          .slice(0, 10)
          .map(
            (s, i) => `<tr>
          <td>#${i + 1}</td>
          <td><strong>${escapeHtml(s.name)}</strong></td>
          <td>${escapeHtml(s.country)}</td>
          <td style="color:var(--accent-gold);font-weight:700">${s.points.toLocaleString()}</td>
          <td>${s.count}</td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="5" style="color:var(--text-muted)">No supporters recorded yet.</td></tr>';

    $('supporter-hist-body').innerHTML = gifts.length
      ? gifts
          .slice(0, 30)
          .map(
            (g) => `<tr>
          <td>${new Date(g.at).toLocaleTimeString()}</td>
          <td><strong>${escapeHtml(g.supporter)}</strong></td>
          <td>${escapeHtml(g.country)}</td>
          <td>${escapeHtml(g.gift)}</td>
          <td><span class="badge badge-cyan">${escapeHtml(g.effect || 'none')}</span></td>
          <td>${g.value}</td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="6" style="color:var(--text-muted)">No gift history yet.</td></tr>';
  }

  $('btn-record-gift').addEventListener('click', async () => {
    const supporter = $('sup-name').value.trim() || 'Supporter';
    const countryId = Number($('sup-country').value);
    const country = getCountryName(countryId);
    const gift = $('sup-gift').value.trim() || 'Arena Gift';
    const value = Math.max(1, Math.min(100000, Number($('sup-value').value) || 100));
    const effect = $('sup-effect').value;

    if (!isAllowedCountryName(country)) return toast('Restricted country blocked.', 'error');

    const r = await execAdminAction('supporter.add_gift', { supporter, country, gift, value, effect }, `Gift from ${supporter} (${country})`, false);
    if (!r.ok) return;

    if (effect !== 'none') {
      await execAdminAction('supporter.trigger_effect', { effectType: effect, countryId, supporterName: supporter }, `Applied ${effect} to ${country}`);
    }

    const data = readLS(SUP_KEY, { gifts: [] });
    data.gifts.unshift({
      id: 'gift_' + Date.now(),
      supporter,
      country,
      gift,
      value,
      effect,
      at: new Date().toISOString()
    });
    data.gifts = data.gifts.slice(0, 500);
    writeLS(SUP_KEY, data);
    renderSupporters();
    toast(`Recorded gift from ${supporter} for ${country}.`, 'ok');
  });

  $('btn-celebrate-top').addEventListener('click', async () => {
    const data = readLS(SUP_KEY, { gifts: [] });
    const top = data.gifts[0] || { supporter: 'Arena Supporter', country: 'Arena' };
    const r = await execAdminAction(
      'supporter.celebrate',
      { supporterName: top.supporter, countryName: top.country, message: 'TOP SUPPORTER CELEBRATION!', topSupporter: top.supporter },
      `Triggered supporter celebration for ${top.supporter}`
    );
    if (r.ok) toast(`Triggered celebration for ${top.supporter}.`, 'ok');
  });

  // ===== TOURNAMENTS & CHAMPIONSHIP =====
  function renderChampionship(d) {
    const t = d.tourney || { id: 1, round: 0, scores: {}, wins: {} };
    $('champ-status-box').innerHTML = `Tournament <strong>#${t.id}</strong> · Round <strong>${t.round}/12</strong> · Completed Tournaments: <strong>${(d.tourneyHistory || []).length}</strong>`;

    const standings = Object.keys(t.scores || {})
      .map((k) => ({ id: +k, name: getCountryName(+k), pts: t.scores[k], wins: t.wins?.[k] || 0 }))
      .sort((a, b) => b.pts - a.pts || b.wins - a.wins);

    $('champ-standings-body').innerHTML = standings.length
      ? standings
          .slice(0, 10)
          .map(
            (x, i) => `<tr><td>${i + 1}</td><td><strong>${escapeHtml(x.name)}</strong></td><td style="color:var(--accent-gold)">${x.pts}</td><td>${x.wins}</td></tr>`
          )
          .join('')
      : '<tr><td colspan="4" style="color:var(--text-muted)">No active Championship standings yet.</td></tr>';

    const hist = (d.tourneyHistory || []).slice().reverse();
    $('tourney-history-body').innerHTML = hist.length
      ? hist
          .map(
            (h) => `<tr>
          <td>#${h.id}</td>
          <td><strong style="color:var(--accent-gold)">${escapeHtml(getCountryName(h.champion))}</strong></td>
          <td>${(h.standings || []).slice(0, 3).map((s, i) => `${i + 1}. ${escapeHtml(getCountryName(s.c))} (${s.score}pts)`).join(' · ')}</td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="3" style="color:var(--text-muted)">No completed tournaments yet.</td></tr>';
  }

  $('btn-launch-champ').addEventListener('click', async () => {
    const r = await execAdminAction('battle.set_edition', { editionIdx: 4 }, 'Switched to World Championship');
    if (r.ok) toast('Switched arena to World Championship Edition.', 'ok');
  });

  function renderCustomTournament() {
    const ct = readLS(TOURN_CUSTOM_KEY, null);
    $('custom-tourn-status').innerHTML = ct
      ? `<strong>${escapeHtml(ct.name)}</strong> (${escapeHtml(ct.format)}) · Status: <span class="badge ${ct.status === 'active' ? 'badge-emerald' : 'badge-gold'}">${escapeHtml(
          ct.status
        )}</span> · ${ct.rounds} matches scheduled`
      : 'No custom tournament scheduled.';
  }

  $('btn-create-tourn').addEventListener('click', async () => {
    const name = $('tourn-name').value.trim() || 'Arena Cup';
    const format = $('tourn-format').value;
    const rounds = Math.max(2, Math.min(24, Number($('tourn-rounds').value) || 6));
    const editionIdx = Number($('tourn-edition').value);

    const ct = { id: 'ct_' + Date.now(), name, format, rounds, editionIdx, status: 'active', createdAt: new Date().toISOString() };
    const r = await execAdminAction('tournament.create', ct, `Created tournament "${name}"`, false);
    if (!r.ok) return;

    writeLS(TOURN_CUSTOM_KEY, ct);
    const scheduled = [];
    for (let i = 1; i <= rounds; i++) {
      scheduled.push({
        id: `${ct.id}_m${i}`,
        editionIdx,
        countries: [],
        matchType: 'normal',
        showcaseWinner: -1,
        label: `${name} · Match ${i}/${rounds}`
      });
    }
    const nextQueue = [...state.battleQueue, ...scheduled];
    await execAdminAction('battle.set_queue', { queue: nextQueue }, `Scheduled ${rounds} matches for ${name}`);
    state.battleQueue = nextQueue;
    renderQueueTable();
    renderCustomTournament();
    toast(`Created "${name}" and scheduled ${rounds} matches in queue.`, 'ok');
  });

  $('btn-tourn-toggle').addEventListener('click', async () => {
    const ct = readLS(TOURN_CUSTOM_KEY, null);
    if (!ct) return toast('Create a custom tournament first.', 'error');
    ct.status = ct.status === 'active' ? 'paused' : 'active';
    writeLS(TOURN_CUSTOM_KEY, ct);
    await execAdminAction(ct.status === 'active' ? 'tournament.start' : 'tournament.pause', { id: ct.id }, `Tournament ${ct.status}`, false);
    renderCustomTournament();
    toast(`Tournament "${ct.name}" is now ${ct.status}.`, 'ok');
  });

  // ===== SETTINGS & BALANCING =====
  function updateSliderLabels() {
    $('val-speed').textContent = Number($('set-speed').value).toFixed(2) + 'x';
    $('val-pull').textContent = Number($('set-pull').value).toFixed(2) + 'x';
    $('val-rot').textContent = Number($('set-rot').value).toFixed(2) + 'x';
    $('val-shcd').textContent = $('set-shcd').value + 's';
    $('val-evfreq').textContent = Number($('set-evfreq').value).toFixed(2) + 'x';
    $('val-bosshp').textContent = Number($('set-bosshp').value).toFixed(2) + 'x';
    $('val-bossdmg').textContent = Number($('set-bossdmg').value).toFixed(2) + 'x';
    $('val-cbstr').textContent = Number($('set-cbstr').value).toFixed(2);
    $('val-fx').textContent = $('vis-fx').value + '%';
    $('val-shake').textContent = $('vis-shake').value + '%';
    $('val-sfx').textContent = $('vis-sfx').value + '%';
    $('val-music').textContent = $('vis-music').value + '%';
  }

  ['set-speed', 'set-pull', 'set-rot', 'set-shcd', 'set-evfreq', 'set-bosshp', 'set-bossdmg', 'set-cbstr', 'vis-fx', 'vis-shake', 'vis-sfx', 'vis-music'].forEach((id) => {
    $(id).addEventListener('input', updateSliderLabels);
  });

  $('btn-save-balance').addEventListener('click', async () => {
    const payload = {
      classicPhysicsLock: $('set-classic-lock').checked,
      speedMul: Number($('set-speed').value),
      pullMul: Number($('set-pull').value),
      rotMul: Number($('set-rot').value),
      shieldCooldown: Number($('set-shcd').value),
      eventFreqMul: Number($('set-evfreq').value),
      bossHpMul: Number($('set-bosshp').value),
      bossDmgMul: Number($('set-bossdmg').value),
      difficulty: $('set-difficulty').value,
      comebackEnabled: $('set-comeback').checked,
      comebackStrength: Number($('set-cbstr').value),
      battleDuration: Number($('battle-duration-input').value),
      customDurationEnabled: $('toggle-custom-dur').checked
    };
    const r = await execAdminAction('settings.update_gameplay', payload, 'Saved gameplay balance settings');
    if (r.ok) toast('Gameplay settings validated and saved.', 'ok');
  });

  $('btn-reset-balance').addEventListener('click', async () => {
    $('set-classic-lock').checked = true;
    $('set-speed').value = 1;
    $('set-pull').value = 1;
    $('set-rot').value = 1;
    $('set-shcd').value = 22;
    $('set-evfreq').value = 1;
    $('set-bosshp').value = 1;
    $('set-bossdmg').value = 1;
    $('set-difficulty').value = 'normal';
    $('set-comeback').checked = false;
    $('set-cbstr').value = 0.5;
    updateSliderLabels();
    $('btn-save-balance').click();
  });

  // ===== VISUAL & AUDIO =====
  $('btn-save-visual').addEventListener('click', async () => {
    const payload = {
      particlesEnabled: $('vis-particles').checked,
      fxIntensity: Number($('vis-fx').value),
      screenShake: Number($('vis-shake').value),
      hitStopEnabled: $('vis-hitstop').checked,
      slowMotionEnabled: $('vis-slowmo').checked,
      victoryAnimEnabled: $('vis-vicanim').checked,
      announcerEnabled: $('vis-announcer').checked,
      sfxVolume: Number($('vis-sfx').value),
      musicVolume: Number($('vis-music').value),
      overlays: {
        featuredComment: $('ov-comment').checked,
        topSupporter: $('ov-supporter').checked,
        showcaseBadge: $('ov-showcase').checked
      }
    };
    const r = await execAdminAction('settings.update_visual_audio', payload, 'Saved visual & audio settings');
    if (r.ok) toast('Visual and audio controls applied.', 'ok');
  });

  // ===== HALL OF FAME & ACHIEVEMENTS =====
  function renderHoF(d) {
    const life = d.life || { r: 0, w: {} };
    const champ = d.champ || {};
    const top = Object.entries(life.w || {})
      .map(([k, v]) => ({ id: +k, name: getCountryName(+k), wins: v, champWins: champ[k] || 0 }))
      .sort((a, b) => b.wins - a.wins)
      .slice(0, 15);

    $('hof-table-body').innerHTML = top.length
      ? top
          .map(
            (x, i) => `<tr>
          <td>#${i + 1}</td>
          <td><strong>${escapeHtml(x.name)}</strong></td>
          <td style="color:var(--accent-gold);font-weight:700">${x.wins}</td>
          <td>${((x.wins / Math.max(1, life.r)) * 100).toFixed(1)}%</td>
          <td>${x.champWins}</td>
        </tr>`
          )
          .join('')
      : '<tr><td colspan="5" style="color:var(--text-muted)">No lifetime wins recorded yet.</td></tr>';

    const s = d.session || {};
    $('streak-summary').innerHTML = `Lifetime Rounds: <strong>${life.r}</strong> · Session Best Streak: <strong>${
      s.sb?.n ? `${escapeHtml(getCountryName(s.sb.c))} x${s.sb.n}` : 'None'
    }</strong> · Total Achievements Unlocked: <strong>${(d.achievementRecords || []).length}</strong>`;

    const achDefs = new Map((d.achievements || []).map((a) => [a[0], a[1]]));
    const recs = (d.achievementRecords || []).slice().reverse().slice(0, 40);
    $('ach-table-body').innerHTML = recs.length
      ? recs
          .map(
            (r) => `<tr><td><strong>${escapeHtml(achDefs.get(r.k) || r.k)}</strong></td><td>${escapeHtml(getCountryName(r.c))}</td><td>R${r.round}</td></tr>`
          )
          .join('')
      : '<tr><td colspan="3" style="color:var(--text-muted)">No achievements unlocked yet.</td></tr>';
  }

  // ===== LIVE PREVIEW (ISOLATED IFRAME) =====
  document.querySelectorAll('[data-prev]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const iframe = $('preview-iframe');
      if (!iframe || !iframe.contentWindow) return;
      const type = btn.dataset.prev;
      const payload = { type };
      if (type === 'showcase') payload.enabled = true;
      if (type === 'announcement') payload.text = $('prev-custom-text').value.trim() || 'PREVIEW ANNOUNCEMENT';
      if (type === 'event') payload.eventId = 'burst';
      iframe.contentWindow.postMessage({ target: 'preview', action: 'preview.test', payload }, location.origin);
      toast(`Previewed "${type}" in isolated sandbox.`, 'ok');
    });
  });

  // ===== BACKUPS, EXPORT, RESTORE & SELECTIVE RESET =====
  function buildFullSnapshot() {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith('fca_') && k !== BACKUP_KEY) {
        data[k] = localStorage.getItem(k);
      }
    }
    return {
      schema: 'fca-backup-v1',
      createdAt: new Date().toISOString(),
      createdBy: state.username,
      keys: data
    };
  }

  function renderBackupInfo() {
    const bk = readLS(BACKUP_KEY, null);
    $('backup-info').textContent = bk
      ? `Last local recovery snapshot: ${new Date(bk.createdAt).toLocaleString()} (${Object.keys(bk.keys || {}).length} storage keys)`
      : 'No manual snapshot saved yet.';
  }

  $('btn-create-backup').addEventListener('click', async () => {
    const snap = buildFullSnapshot();
    const r = await execAdminAction('backup.create', { keyCount: Object.keys(snap.keys).length }, 'Created local recovery backup', false);
    if (!r.ok) return;
    writeLS(BACKUP_KEY, snap);
    renderBackupInfo();
    toast('Local backup snapshot saved.', 'ok');
  });

  $('btn-export-backup').addEventListener('click', async () => {
    const snap = buildFullSnapshot();
    const r = await execAdminAction('backup.create', { keyCount: Object.keys(snap.keys).length }, 'Exported JSON backup', false);
    if (!r.ok) return;
    const blob = new Blob([JSON.stringify(snap, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `flag-clash-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Backup JSON downloaded.', 'ok');
  });

  $('btn-export-history-csv').addEventListener('click', () => {
    const normal = readLS(HIST_KEY, []);
    const show = readLS(SHOW_KEY, []);
    const rows = [['Timestamp', 'Round', 'Edition', 'Winner', 'MatchType', 'DurationSec', 'Eliminations']];
    [...normal, ...show]
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .forEach((r) => rows.push([r.at, r.round, r.edition, r.winnerName, r.matchType, r.durationSec, r.elims]));
    const csv = rows.map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `flag-clash-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Battle history CSV exported.', 'ok');
  });

  $('restore-file-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let parsed;
    try {
      parsed = JSON.parse(await file.text());
    } catch (_) {
      return toast('Invalid JSON backup file.', 'error');
    }
    if (!parsed || parsed.schema !== 'fca-backup-v1' || !parsed.keys || typeof parsed.keys !== 'object') {
      return toast('Backup schema validation failed.', 'error');
    }
    // Enforce Israel exclusion across entire imported backup
    if (BAN_RE.test(JSON.stringify(parsed.keys))) {
      return toast('Restore rejected: backup contains permanently excluded country data.', 'error');
    }
    const ok = await confirmDialog({
      title: 'Restore Backup Snapshot?',
      body: `This will create an automatic safety snapshot of current data first, then restore ${Object.keys(parsed.keys).length} keys from ${parsed.createdAt}.`,
      confirmText: 'Restore Backup',
      requireTyped: 'RESTORE'
    });
    if (!ok) return;

    const r = await execAdminAction('backup.restore', { keyCount: Object.keys(parsed.keys).length }, 'Restored backup JSON', false);
    if (!r.ok) return;

    writeLS(BACKUP_KEY, buildFullSnapshot());
    for (const [k, v] of Object.entries(parsed.keys)) {
      if (k.startsWith('fca_') && typeof v === 'string') {
        localStorage.setItem(k, v);
      }
    }
    renderBackupInfo();
    renderAudience();
    renderSupporters();
    toast('Backup restored successfully. Reload the Audience Display tab to apply restored state.', 'ok');
  });

  $('btn-selective-reset').addEventListener('click', async () => {
    const scope = $('reset-scope').value;
    const ok = await confirmDialog({
      title: 'Confirm Selective Reset',
      body: `An automatic backup snapshot will be created before resetting "${scope}". This operation clears the selected stored records.`,
      confirmText: 'Reset Selected Data',
      requireTyped: 'RESET'
    });
    if (!ok) return;

    const r = await execAdminAction('backup.selective_reset', { scope }, `Selective reset: ${scope}`, false);
    if (!r.ok) return;

    // Mandatory pre-reset backup
    writeLS(BACKUP_KEY, buildFullSnapshot());

    const scopeKeys = {
      session: ['fca_sess', 'fca_hour'],
      showcase: [SHOW_KEY],
      audience_supporters: [AUD_KEY, SUP_KEY, MOD_KEY],
      tournament: ['fca_tournament', TOURN_CUSTOM_KEY],
      all_stats: [
        'fca_life', 'fca_sess', 'fca_sessions', 'fca_champ', 'fca_tournament',
        'fca_tourney_history', 'fca_achievements', 'fca_hour', 'fca_hist', 'fca_last',
        'fca_king_stats', 'fca_team_stats', 'fca_sudden_stats', 'fca_boss_stats',
        'fca_chaos_stats', 'fca_power_stats', HIST_KEY
      ]
    };

    for (const k of scopeKeys[scope] || []) {
      localStorage.removeItem(k);
    }
    renderBackupInfo();
    renderAudience();
    renderSupporters();
    renderCustomTournament();
    toast(`Selective reset (${scope}) completed. Pre-reset backup saved.`, 'ok');
  });

  // ===== AUDIT LOG & SESSION TIMER =====
  async function refreshAuditLog() {
    if (!state.authenticated) return;
    try {
      const res = await fetch('/api/admin/audit', { credentials: 'same-origin' });
      if (!res.ok) return;
      const data = await res.json();
      const rows = data.audit || [];
      $('audit-table-body').innerHTML = rows.length
        ? rows
            .map(
              (a) => `<tr>
            <td>${new Date(a.at).toLocaleString()}</td>
            <td><strong>${escapeHtml(a.actor)}</strong></td>
            <td><code>${escapeHtml(a.action)}</code></td>
            <td><span class="badge ${a.status === 'ok' ? 'badge-emerald' : 'badge-crimson'}">${escapeHtml(a.status)}</span></td>
            <td>${escapeHtml(a.detail || '—')}</td>
          </tr>`
            )
            .join('')
        : '<tr><td colspan="5" style="color:var(--text-muted)">No audit entries yet.</td></tr>';
    } catch (_) {}
  }

  $('btn-refresh-audit').addEventListener('click', refreshAuditLog);

  setInterval(() => {
    if (!state.authenticated) return;
    const remMs = state.expiresAt - Date.now();
    if (remMs <= 0) {
      showAuthGate();
      showAuthAlert('Your administrator session expired. Please sign in again.');
      return;
    }
    const mins = Math.floor(remMs / 60000);
    const secs = Math.floor((remMs % 60000) / 1000);
    $('session-timer').textContent = `${state.username} · ${mins}m ${String(secs).padStart(2, '0')}s`;

    // Warn if audience tab disconnected
    if (state.lastTelemetryAt && Date.now() - state.lastTelemetryAt > 3500) {
      $('conn-pill').className = 'status-pill warn';
      $('conn-label').textContent = 'Audience Tab Disconnected';
    }
  }, 1000);

  // Boot
  checkSession();
})();
