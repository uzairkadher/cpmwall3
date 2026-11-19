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
  const CFG_KEY = 'fca_admin_config';
  const CFG_HIST_KEY = 'fca_config_history';
  const ACT_LOG_KEY = 'fca_admin_activity_log';
  const REVERSIBLE_ACTIONS = new Set([
    'settings.update_gameplay',
    'settings.update_visual_audio',
    'country.update_config',
    'battle.set_queue',
    'supporter.update_limits',
    'showdirector.update'
  ]);

  const DEFAULT_EDITIONS = [
    { idx: 0, name: 'Classic', tier: 1, rarity: 'Classic', desc: 'Original protected Flag Clash Arena experience.' },
    { idx: 1, name: 'Rivalry', tier: 3, rarity: 'Standard', desc: 'Historic international rivalries collide.' },
    { idx: 2, name: 'Extreme', tier: 3, rarity: 'Special', desc: 'High-speed 60s survival arena.' },
    { idx: 3, name: 'Mystery', tier: 3, rarity: 'Special', desc: 'Hidden flags revealed on elimination.' },
    { idx: 4, name: 'Championship', tier: 1, rarity: 'Legendary', desc: '12-round Championship Tournament standings.' },
    { idx: 5, name: '60-Second Battle', tier: 3, rarity: 'Standard', desc: '7-stage accelerating 60-second sprint.' },
    { idx: 6, name: 'Survival Storm', tier: 2, rarity: 'Special', desc: '4-stage contracting safe zone storm.' },
    { idx: 7, name: 'King of the Arena', tier: 2, rarity: 'Legendary', desc: '1 crowned King defends against 29 challengers.' },
    { idx: 8, name: 'Team Wars', tier: 3, rarity: 'Special', desc: 'Crimson vs Cobalt 15v15 team clash.' },
    { idx: 9, name: 'Sudden Death', tier: 3, rarity: 'Special', desc: 'Zero shields, maximum danger.' },
    { idx: 10, name: 'Boss Battle', tier: 2, rarity: 'Legendary', desc: '29 challengers unite against 1 Boss flag.' },
    { idx: 11, name: 'Chaos Arena', tier: 1, rarity: 'Special', desc: 'Unpredictable controlled arena surprises.' },
    { idx: 12, name: 'Power-Up Battle', tier: 3, rarity: 'Special', desc: 'Collectible arena power orbs.' },
    { idx: 13, name: 'Singularity', tier: 1, rarity: 'Singularity', desc: 'Cosmic black-hole centerpiece & Singularity Collapse.' },
    { idx: 14, name: 'Volcanic Rise', tier: 2, rarity: 'Special', desc: 'Caldera lava veins & Volcanic Surge eruptions.' },
    { idx: 15, name: 'Frostbite', tier: 2, rarity: 'Special', desc: 'Crystalline ice arena & Blizzard Wave sweeps.' },
    { idx: 16, name: 'Thunderbreak', tier: 2, rarity: 'Special', desc: 'Storm sky, lightning arcs & Thunder Strike.' },
    { idx: 17, name: 'Great Colosseum', tier: 1, rarity: 'Legendary', desc: 'Ancient stone colosseum & Champion Legacy framing.' },
    { idx: 18, name: 'Crystal Realms', tier: 4, rarity: 'Special', desc: 'Prismatic crystal shards & Crystal Resonance.' },
    { idx: 19, name: 'Expedition Survival', tier: 4, rarity: 'Standard', desc: 'Rugged canyon ruins & endurance atmosphere.' },
    { idx: 20, name: 'Celestial Ascension', tier: 2, rarity: 'Legendary', desc: 'Golden sky dome & prestigious Ascension.' },
    { idx: 21, name: 'Aurora', tier: 3, rarity: 'Special', desc: 'Northern lights ribbons & Aurora Burst.' },
    { idx: 22, name: 'Candy Mayhem', tier: 4, rarity: 'Standard', desc: 'Colorful pastel arena & playful Sugar Rush.' },
    { idx: 23, name: 'Ronin Rivalry', tier: 4, rarity: 'Special', desc: 'Respectful dojo framing, sakura petals & Honor Duel.' },
    { idx: 24, name: 'Alien Worlds', tier: 3, rarity: 'Special', desc: 'Bioluminescent exoplanet & Xenon Pulse.' },
    { idx: 25, name: 'Titan Mechanics', tier: 4, rarity: 'Special', desc: 'Rotating industrial gears & Mechanical Overdrive.' },
    { idx: 26, name: 'Abyssal Ocean', tier: 3, rarity: 'Special', desc: 'Deep turquoise ocean & Deep Ocean Pulse.' },
    { idx: 27, name: 'Desert Dynasty', tier: 3, rarity: 'Standard', desc: 'Golden dunes & Desert Storm gusts.' },
    { idx: 28, name: 'Reality Break', tier: 2, rarity: 'Legendary', desc: 'Dimensional shards & Reality Fracture visuals.' },
    { idx: 29, name: 'Omega Championship', tier: 1, rarity: 'Ultimate', desc: 'Obsidian & gold championship stage.' },
    { idx: 30, name: 'Multiverse', tier: 2, rarity: 'Ultimate', desc: 'Dynamic realm shifts & Multiverse Shift.' },
    { idx: 31, name: 'Prism Overdrive', tier: 2, rarity: 'Legendary', desc: 'Full-spectrum prismatic rays & Prism Explosion.' },
    { idx: 32, name: 'Skybound', tier: 3, rarity: 'Standard', desc: 'Floating sky islands & Skyfall Gust.' },
    { idx: 33, name: 'Speedforce', tier: 4, rarity: 'Special', desc: 'Kinetic racing arena & Hyper Acceleration.' },
    { idx: 34, name: 'Wilderness', tier: 3, rarity: 'Standard', desc: 'Forest & mountain arena with Nature Fury.' },
    { idx: 35, name: 'Cyber Overdrive', tier: 3, rarity: 'Special', desc: 'Neon cyber grid & Cyber Surge.' },
    { idx: 36, name: 'Legendary Infinity', tier: 1, rarity: 'Ultimate', desc: 'Curated ultimate broadcast showcase.' }
,
    { idx: 37, name: 'Duality', tier: 1, rarity: 'Special', batch: 'v5a', desc: 'Opposing ivory and obsidian realms with mirrored architecture.' },
    { idx: 38, name: 'Timebreak', tier: 1, rarity: 'Legendary', batch: 'v5a', desc: 'Giant Roman clockface arena & visual temporal fracture.' },
    { idx: 39, name: 'BioGlow', tier: 2, rarity: 'Special', batch: 'v5a', desc: 'Bioluminescent subterranean botanical cavern & luminous spores.' },
    { idx: 40, name: 'Art Deco Royale', tier: 1, rarity: 'Legendary', batch: 'v5a', desc: '1920s geometric sunburst arches & champagne-gold symmetry.' },
    { idx: 41, name: 'Paperworld', tier: 2, rarity: 'Standard', batch: 'v5a', desc: 'Handcrafted layered parchment arena & origami geometry.' },
    { idx: 42, name: 'Museum of Worlds', tier: 2, rarity: 'Standard', batch: 'v5a', desc: 'Exhibition gallery with real achievement & battle plaques.' },
    { idx: 43, name: 'Ironworks', tier: 2, rarity: 'Special', batch: 'v5a', desc: 'Heavy steel foundry beams, furnace grates & forge embers.' },
    { idx: 44, name: 'Carnival Royale', tier: 2, rarity: 'Special', batch: 'v5a', desc: 'Big-top marquee stripes, chase-bulb lights & confetti.' },
    { idx: 45, name: 'Silent Prestige', tier: 1, rarity: 'Special', batch: 'v5a', desc: 'Minimalist matte charcoal & silver restrained prestige.' },
    { idx: 46, name: 'Horizon Zero', tier: 2, rarity: 'Special', batch: 'v5a', desc: 'Oversized atmospheric sun disc over silhouetted horizon.' },
    { idx: 47, name: 'Glasshouse', tier: 2, rarity: 'Special', batch: 'v5a', desc: 'Transparent conservatory dome ribs & specular light refraction.' },
    { idx: 48, name: 'Paintstorm', tier: 2, rarity: 'Standard', batch: 'v5a', desc: 'Dynamic studio canvas with bold readable pigment arcs.' },
    { idx: 49, name: 'Last Station', tier: 2, rarity: 'Special', batch: 'v5a', desc: 'Cinematic railway terminus & real-data departure board.' },
    { idx: 50, name: 'Lantern Festival', tier: 2, rarity: 'Special', batch: 'v5a', desc: 'Twilight indigo sky filled with warm floating paper lanterns.' },
    { idx: 51, name: 'Soundwave', tier: 2, rarity: 'Special', batch: 'v5a', desc: 'Tempo-synced circular equalizer spectrum & bass pulses.' },
    { idx: 52, name: 'Labyrinth', tier: 2, rarity: 'Special', batch: 'v5a', desc: 'Concentric stone-and-teal cosmetic maze pathways.' },
    { idx: 53, name: 'World Expo', tier: 1, rarity: 'Special', batch: 'v5a', desc: 'International geodesic pavilion & genuine country showcase.' },
    { idx: 54, name: 'Infinite Mirror', tier: 1, rarity: 'Legendary', batch: 'v5a', desc: 'Recursive vanishing-point mirror frames & reflection depth.' },
    { idx: 55, name: 'Jewelstorm', tier: 1, rarity: 'Legendary', batch: 'v5a', desc: 'Luxury cut-gemstone octagon facets in ruby, sapphire & emerald.' },
    { idx: 56, name: 'Grand Opening', tier: 1, rarity: 'Ultimate', batch: 'v5a', desc: 'Major stadium opening ceremony with sweeping floodlights.' },
    { idx: 57, name: 'Retro Arcade', tier: 2, rarity: 'Special', batch: 'v5b', desc: 'Classic 8-bit CRT bezel, pixel-grid border & retro scoreboard.' },
    { idx: 58, name: 'Steampunk', tier: 2, rarity: 'Special', batch: 'v5b', desc: 'Victorian copper pipes, brass pressure gauges & rising steam.' },
    { idx: 59, name: 'Film Noir', tier: 2, rarity: 'Special', batch: 'v5b', desc: 'High-contrast silver-screen monochrome & sweeping spotlights.' },
    { idx: 60, name: 'Toybox', tier: 3, rarity: 'Standard', batch: 'v5b', desc: 'Polished miniature toy workshop with building-block aesthetics.' },
    { idx: 61, name: 'Botanical Garden', tier: 3, rarity: 'Standard', batch: 'v5b', desc: 'Sunlit conservatory garden with blooming petals & trellis.' },
    { idx: 62, name: 'Blueprint', tier: 2, rarity: 'Special', batch: 'v5b', desc: 'Prussian-blue drafting paper & technical wireframe grid.' },
    { idx: 63, name: "Pharaoh's Empire", tier: 1, rarity: 'Legendary', batch: 'v5b', desc: 'Monumental sandstone colonnade & lapis-and-gold frieze.' },
    { idx: 64, name: 'Megacity', tier: 2, rarity: 'Special', batch: 'v5b', desc: 'Towering metropolitan skyscraper skyline at dusk.' },
    { idx: 65, name: 'Grand Prix', tier: 2, rarity: 'Special', batch: 'v5b', desc: 'Race circuit curbing, checkered finish strip & starting lights.' },
    { idx: 66, name: 'Royal Court', tier: 1, rarity: 'Legendary', batch: 'v5b', desc: 'Ceremonial crimson velvet banners & gilded palace arches.' },
    { idx: 67, name: 'Inflatable World', tier: 3, rarity: 'Standard', batch: 'v5b', desc: 'Glossy soft-cushion arches & playful balloon spectacle.' },
    { idx: 68, name: 'Data Vault', tier: 2, rarity: 'Special', batch: 'v5b', desc: 'High-security digital archive with live real-data telemetry.' },
    { idx: 69, name: 'Canyon Clash', tier: 3, rarity: 'Standard', batch: 'v5b', desc: 'Monumental layered red-rock canyon cliffs & terraced depth.' },
    { idx: 70, name: 'Laser Symphony', tier: 2, rarity: 'Special', batch: 'v5b', desc: 'Coordinated multi-beam concert laser choreography.' },
    { idx: 71, name: 'Broadcast Classic', tier: 2, rarity: 'Standard', batch: 'v5b', desc: 'Vintage television sports broadcast frame & retro chyron.' },
    { idx: 72, name: 'Summit', tier: 2, rarity: 'Special', batch: 'v5b', desc: 'High-altitude alpine mountain peak above sunlit clouds.' },
    { idx: 73, name: 'Geometry', tier: 2, rarity: 'Special', batch: 'v5b', desc: 'Abstract Bauhaus polygon tessellations & vector symmetry.' },
    { idx: 74, name: 'Infinite Library', tier: 1, rarity: 'Legendary', batch: 'v5b', desc: 'Candlelit grand library arches & genuine battle chronicle.' },
    { idx: 75, name: 'Runway Royale', tier: 2, rarity: 'Special', batch: 'v5b', desc: 'High-fashion spotlight catwalk & couture gold framing.' },
    { idx: 76, name: 'Fireworks Finale', tier: 1, rarity: 'Ultimate', batch: 'v5b', desc: 'Night-sky celebration arena with performance-capped fireworks.' }
  ];

  const SPECIAL_EVENTS = [
    { id: 'speed', label: 'Speed Surge' },
    { id: 'gravity', label: 'Gravity Wave' },
    { id: 'shield', label: 'Shield Wave' },
    { id: 'frenzy', label: 'Paddle Frenzy' },
    { id: 'slow', label: 'Slow Motion' },
    { id: 'meteor', label: 'Meteor Shower' },
    { id: 'spot', label: 'Golden Spotlight' },
    { id: 'burst', label: 'Energy Burst' },
    { id: 'golden_flag', label: 'Golden Flag' }
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
  function captureCurrentConfigSnapshot() {
    const raw = readLS(CFG_KEY, null);
    if (raw && typeof raw === 'object') return JSON.parse(JSON.stringify(raw));
    const t = state.telemetry;
    if (!t) return null;
    return JSON.parse(JSON.stringify({
      autoBattle: t.autoBattle,
      nextMatchType: t.nextMatchType,
      nextShowcaseWinner: t.nextShowcaseWinner,
      battleQueue: t.battleQueue || [],
      countryConfig: t.countryConfig || {},
      supporterLimits: t.supporterLimits || {},
      gameplay: t.gameplay || {},
      visual: t.visual || {},
      showDirector: t.showDirector || {}
    }));
  }

  function pushReversibleSnapshot(action, summary, prevCfg) {
    if (!prevCfg || !REVERSIBLE_ACTIONS.has(action)) return;
    const entry = { id: 'cfg_' + Date.now(), at: new Date().toISOString(), action, summary: summary || action, config: prevCfg };
    state.undoStack = state.undoStack || [];
    state.undoStack.unshift(entry);
    if (state.undoStack.length > 15) state.undoStack.length = 15;
    const hist = readLS(CFG_HIST_KEY, []);
    hist.unshift(entry);
    writeLS(CFG_HIST_KEY, hist.slice(0, 10));
    updateUndoButton();
    renderRollbackTable();
  }

  function updateUndoButton() {
    const btn = $('undo-btn');
    if (!btn) return;
    const top = (state.undoStack || [])[0];
    btn.disabled = !top;
    btn.title = top ? `Undo: ${top.summary}` : 'No reversible configuration change to undo';
  }

  function recordLocalActivity(entry) {
    const list = readLS(ACT_LOG_KEY, []);
    list.unshift(entry);
    writeLS(ACT_LOG_KEY, list.slice(0, 200));
  }

  async function execAdminAction(action, payload = {}, summary = '', dispatchToGame = true, meta = {}) {
    if (!state.authenticated) {
      toast('Session expired. Please sign in again.', 'error');
      showAuthGate();
      return { ok: false, error: 'Not authenticated' };
    }

    try {
      const prevCfg = REVERSIBLE_ACTIONS.has(action) ? captureCurrentConfigSnapshot() : null;
      const affectedItem = meta.affectedItem || action.split('.')[0];
      const res = await fetch('/api/admin/action', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-FCA-Admin-CSRF': state.csrfToken
        },
        body: JSON.stringify({
          action,
          payload,
          summary,
          affectedItem,
          previousValue: meta.previousValue !== undefined ? meta.previousValue : undefined,
          newValue: meta.newValue !== undefined ? meta.newValue : undefined,
          reason: meta.reason || ''
        })
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

      if (prevCfg) pushReversibleSnapshot(action, summary, prevCfg);
      if (data.audit) recordLocalActivity(data.audit);
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
    const ids = ['q-countries', 'showcase-winner-select', 'aud-country', 'sup-country', 'poll-opt-a', 'poll-opt-b'];
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
    renderPerformanceAndDiagnostics(d);
    renderRivalryRecords(d);
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
      if ($('vis-reduced')) $('vis-reduced').checked = !!d.visual.reducedEffects;
      if ($('vis-adaptive')) $('vis-adaptive').checked = d.visual.adaptiveQuality !== false;
      $('vis-fx').value = d.visual.fxIntensity ?? 100;
      $('vis-shake').value = d.visual.screenShake ?? 60;
      $('vis-hitstop').checked = d.visual.hitStopEnabled !== false;
      $('vis-slowmo').checked = d.visual.slowMotionEnabled !== false;
      $('vis-vicanim').checked = d.visual.victoryAnimEnabled !== false;
      $('vis-announcer').checked = d.visual.announcerEnabled !== false;
      $('vis-sfx').value = d.visual.sfxVolume ?? 80;
      $('vis-music').value = d.visual.musicVolume ?? 65;
      if ($('ov-hud')) $('ov-hud').checked = d.visual.overlays?.hud !== false;
      if ($('ov-toasts')) $('ov-toasts').checked = d.visual.overlays?.toasts !== false;
      $('ov-comment').checked = d.visual.overlays?.featuredComment !== false;
      $('ov-supporter').checked = d.visual.overlays?.topSupporter !== false;
      if ($('ov-teaser')) $('ov-teaser').checked = d.visual.overlays?.nextTeaser !== false;
      if ($('ov-poll')) $('ov-poll').checked = d.visual.overlays?.poll !== false;
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
    if (d.showDirector) {
      if ($('sd-intro-enabled')) $('sd-intro-enabled').checked = d.showDirector.introEnabled !== false;
      if ($('sd-intro-style')) $('sd-intro-style').value = d.showDirector.introStyle || 'auto';
      if ($('sd-intro-dur')) {
        $('sd-intro-dur').value = d.showDirector.introDurationSec ?? 2.5;
        $('val-sd-dur').textContent = Number($('sd-intro-dur').value).toFixed(1) + 's';
      }
      if ($('sd-rivalry')) $('sd-rivalry').checked = d.showDirector.rivalryAnnouncements !== false;
      if ($('sd-dramatic')) $('sd-dramatic').checked = d.showDirector.dramaticAlerts !== false;
      if ($('sd-teaser')) $('sd-teaser').checked = d.showDirector.nextMatchTeaser !== false;
      if ($('sd-mvp')) $('sd-mvp').checked = d.showDirector.mvpBadge !== false;
      const ee = d.showDirector.enabledEvents || {};
      if ($('sd-ev-golden')) $('sd-ev-golden').checked = ee.golden_flag !== false;
      if ($('sd-ev-revenge')) $('sd-ev-revenge').checked = ee.revenge_match !== false;
      if ($('sd-ev-champ')) $('sd-ev-champ').checked = ee.champions_challenge !== false;
      if ($('sd-ev-underdog')) $('sd-ev-underdog').checked = ee.underdog_challenge !== false;
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
    const gifts = Array.isArray(data.gifts) ? data.gifts : [];
    const totals = {};
    for (const g of gifts) {
      if (!totals[g.supporter]) totals[g.supporter] = { supporter: g.supporter, country: g.country, points: 0 };
      totals[g.supporter].points += Number(g.value || 0);
      totals[g.supporter].country = g.country;
    }
    const ranked = Object.values(totals).sort((a, b) => b.points - a.points);
    const top = ranked[0] || { supporter: 'Arena Supporter', country: 'Arena' };
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
        label: `${name} · Match ${i}/${rounds}`,
        tournamentId: ct.id
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
    await execAdminAction(ct.status === 'active' ? 'tournament.start' : 'tournament.pause', { id: ct.id }, `Tournament ${ct.status}`, true);
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
      reducedEffects: $('vis-reduced') ? $('vis-reduced').checked : false,
      adaptiveQuality: $('vis-adaptive') ? $('vis-adaptive').checked : true,
      fxIntensity: Number($('vis-fx').value),
      screenShake: Number($('vis-shake').value),
      hitStopEnabled: $('vis-hitstop').checked,
      slowMotionEnabled: $('vis-slowmo').checked,
      victoryAnimEnabled: $('vis-vicanim').checked,
      announcerEnabled: $('vis-announcer').checked,
      sfxVolume: Number($('vis-sfx').value),
      musicVolume: Number($('vis-music').value),
      overlays: {
        hud: $('ov-hud') ? $('ov-hud').checked : true,
        toasts: $('ov-toasts') ? $('ov-toasts').checked : true,
        featuredComment: $('ov-comment').checked,
        topSupporter: $('ov-supporter').checked,
        nextTeaser: $('ov-teaser') ? $('ov-teaser').checked : true,
        poll: $('ov-poll') ? $('ov-poll').checked : true,
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
    await execAdminAction('recovery.reload_storage', {}, 'Reloading audience display after backup restore', true);
    toast('Backup restored and audience display reloaded cleanly.', 'ok');
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
    await execAdminAction('recovery.reload_storage', {}, `Reloading audience display after ${scope} reset`, true);
    toast(`Selective reset (${scope}) completed. Pre-reset backup saved and display synced.`, 'ok');
  });

  // ===== AUDIT LOG & SESSION TIMER =====
  async function refreshAuditLog() {
    if (!state.authenticated) return;
    let serverRows = [];
    try {
      const res = await fetch('/api/admin/audit', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        serverRows = data.audit || [];
      }
    } catch (_) {}
    const localRows = readLS(ACT_LOG_KEY, []);
    const seen = new Set();
    const rows = [...serverRows, ...localRows].filter((r) => {
      const k = r.id || (r.at + '|' + r.action);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 120);
    $('audit-table-body').innerHTML = rows.length
      ? rows.map((a) => `<tr>
          <td>${new Date(a.at).toLocaleString()}</td>
          <td><strong>${escapeHtml(a.actor)}</strong></td>
          <td><code>${escapeHtml(a.action)}</code></td>
          <td>${escapeHtml(a.affectedItem || a.action.split('.')[0])}</td>
          <td>${escapeHtml(a.detail || a.reason || '—')}</td>
          <td><span class="badge ${a.status === 'ok' ? 'badge-emerald' : 'badge-crimson'}">${escapeHtml(a.status)}</span></td>
        </tr>`).join('')
      : '<tr><td colspan="6" style="color:var(--text-muted)">No audit entries yet.</td></tr>';
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


  // ===== UNDO & CONFIGURATION ROLLBACK =====
  function renderRollbackTable() {
    const tb = $('rollback-table-body');
    if (!tb) return;
    const hist = readLS(CFG_HIST_KEY, []);
    if (!hist.length) {
      tb.innerHTML = '<tr><td colspan="3" style="color:var(--text-muted)">No configuration snapshots recorded yet.</td></tr>';
      return;
    }
    tb.innerHTML = hist.map((h, i) => `<tr>
      <td>${new Date(h.at).toLocaleString()}</td>
      <td><strong>${escapeHtml(h.summary)}</strong> <small style="color:var(--text-muted)">(${escapeHtml(h.action)})</small></td>
      <td><button type="button" class="btn btn-sm btn-gold" data-rb-idx="${i}">Rollback</button></td>
    </tr>`).join('');
    tb.querySelectorAll('[data-rb-idx]').forEach((b) => {
      b.addEventListener('click', async () => {
        const entry = hist[+b.dataset.rbIdx];
        if (!entry || !entry.config) return;
        const ok = await confirmDialog({
          title: 'Rollback Configuration?',
          body: `Restore settings saved at ${new Date(entry.at).toLocaleString()} before "${entry.summary}"?`,
          confirmText: 'Rollback Settings'
        });
        if (!ok) return;
        const r = await execAdminAction('config.rollback', { config: entry.config }, `Rolled back config to snapshot before "${entry.summary}"`, true, { affectedItem: 'configuration', reason: 'Operator rollback' });
        if (r.ok) {
          state.controlsHydrated = false;
          toast('Configuration rolled back cleanly.', 'ok');
        }
      });
    });
  }

  if ($('undo-btn')) {
    $('undo-btn').addEventListener('click', async () => {
      const stack = state.undoStack || [];
      const top = stack[0];
      if (!top) return toast('No reversible change to undo.', 'error');
      const r = await execAdminAction('config.undo', { config: top.config }, `Undid "${top.summary}"`, true, { affectedItem: top.action.split('.')[0], reason: 'Operator undo' });
      if (r.ok) {
        stack.shift();
        state.controlsHydrated = false;
        updateUndoButton();
        toast(`Undid: ${top.summary}`, 'ok');
      }
    });
  }

  // ===== SHOW DIRECTOR & MANUAL AUDIENCE POLL =====
  if ($('sd-intro-dur')) {
    $('sd-intro-dur').addEventListener('input', () => {
      $('val-sd-dur').textContent = Number($('sd-intro-dur').value).toFixed(1) + 's';
    });
  }

  if ($('btn-sd-save')) {
    $('btn-sd-save').addEventListener('click', async () => {
      const payload = {
        introEnabled: $('sd-intro-enabled').checked,
        introStyle: $('sd-intro-style').value,
        introDurationSec: Number($('sd-intro-dur').value),
        rivalryAnnouncements: $('sd-rivalry').checked,
        dramaticAlerts: $('sd-dramatic').checked,
        nextMatchTeaser: $('sd-teaser').checked,
        mvpBadge: $('sd-mvp').checked,
        enabledEvents: {
          golden_flag: $('sd-ev-golden').checked,
          revenge_match: $('sd-ev-revenge').checked,
          champions_challenge: $('sd-ev-champ').checked,
          underdog_challenge: $('sd-ev-underdog').checked
        }
      };
      const r = await execAdminAction('showdirector.update', payload, 'Updated Show Director configuration', true, { affectedItem: 'showDirector' });
      if (r.ok) toast('Show Director settings saved.', 'ok');
    });
  }

  if ($('btn-sd-return-normal')) {
    $('btn-sd-return-normal').addEventListener('click', async () => {
      const r = await execAdminAction('showdirector.return_normal', {}, 'Returned safely to normal gameplay', true, { affectedItem: 'showDirector' });
      if (r.ok) {
        manualPoll.active = false;
        renderPollStatus();
        toast('Returned safely to normal gameplay.', 'ok');
      }
    });
  }

  document.querySelectorAll('[data-sd-special]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const specialType = btn.dataset.sdSpecial;
      const r = await execAdminAction('showdirector.trigger_special', { specialType }, `Triggered Show Director event: ${specialType}`, true, { affectedItem: specialType });
      if (r.ok) toast(`Triggered ${specialType.replace('_', ' ')}`, 'ok');
    });
  });

  const manualPoll = { active: false, votesA: 0, votesB: 0 };
  function renderPollStatus() {
    if ($('poll-cnt-a')) $('poll-cnt-a').textContent = String(manualPoll.votesA);
    if ($('poll-cnt-b')) $('poll-cnt-b').textContent = String(manualPoll.votesB);
    if ($('btn-poll-toggle')) $('btn-poll-toggle').textContent = manualPoll.active ? 'Hide Poll from Screen' : 'Show Poll on Screen';
    if ($('poll-status-text')) {
      const aName = getCountryName(Number($('poll-opt-a')?.value || 0));
      const bName = getCountryName(Number($('poll-opt-b')?.value || 0));
      $('poll-status-text').textContent = manualPoll.active
        ? `LIVE ON SCREEN: ${aName} (${manualPoll.votesA}) vs ${bName} (${manualPoll.votesB})`
        : `Poll hidden · ${aName} (${manualPoll.votesA}) vs ${bName} (${manualPoll.votesB})`;
    }
  }
  async function syncPollToGame() {
    const optionA = getCountryName(Number($('poll-opt-a')?.value || 0));
    const optionB = getCountryName(Number($('poll-opt-b')?.value || 0));
    renderPollStatus();
    await execAdminAction('audience.poll_update', {
      active: manualPoll.active,
      question: 'Audience Matchup Poll',
      optionA,
      optionB,
      votesA: manualPoll.votesA,
      votesB: manualPoll.votesB
    }, `Updated manual poll (${optionA}: ${manualPoll.votesA}, ${optionB}: ${manualPoll.votesB})`, true, { affectedItem: 'audience_poll' });
  }
  if ($('btn-poll-vote-a')) $('btn-poll-vote-a').addEventListener('click', () => { manualPoll.votesA++; syncPollToGame(); });
  if ($('btn-poll-vote-b')) $('btn-poll-vote-b').addEventListener('click', () => { manualPoll.votesB++; syncPollToGame(); });
  if ($('btn-poll-toggle')) $('btn-poll-toggle').addEventListener('click', () => { manualPoll.active = !manualPoll.active; syncPollToGame(); });
  if ($('btn-poll-reset')) $('btn-poll-reset').addEventListener('click', () => { manualPoll.votesA = 0; manualPoll.votesB = 0; manualPoll.active = false; syncPollToGame(); });
  if ($('btn-poll-queue')) {
    $('btn-poll-queue').addEventListener('click', async () => {
      const idA = Number($('poll-opt-a').value);
      const idB = Number($('poll-opt-b').value);
      const winId = manualPoll.votesB > manualPoll.votesA ? idB : idA;
      const winName = getCountryName(winId);
      const nextQueue = [...state.battleQueue, {
        id: String(Date.now()),
        editionIdx: state.telemetry?.editionIdx || 0,
        countries: [winId],
        matchType: 'normal',
        showcaseWinner: -1,
        label: `Audience Poll Winner: ${winName}`
      }];
      const r = await execAdminAction('battle.set_queue', { queue: nextQueue }, `Queued poll winner (${winName})`);
      if (r.ok) {
        state.battleQueue = nextQueue;
        renderQueueTable();
        toast(`Queued poll winner: ${winName}`, 'ok');
      }
    });
  }

  function renderRivalryRecords(d) {
    const rh = d.rivalryHistory;
    if (!rh || !$('rivalry-table-body')) return;
    const champName = rh.defendingChamp >= 0 ? getCountryName(rh.defendingChamp) : 'None yet';
    $('rivalry-champ-summary').innerHTML = `Defending Competitive Champion: <strong style="color:var(--accent-gold)">${escapeHtml(champName)}</strong> (${rh.defendingStreak || 0}x streak) · Last Runner-Up: <strong>${rh.lastRunnerUp >= 0 ? escapeHtml(getCountryName(rh.lastRunnerUp)) : 'None'}</strong>`;
    const pairs = Object.values(rh.pairs || {}).sort((a, b) => b.matches - a.matches).slice(0, 12);
    $('rivalry-table-body').innerHTML = pairs.length
      ? pairs.map((p) => `<tr>
          <td><strong>${escapeHtml(getCountryName(p.a))}</strong> vs <strong>${escapeHtml(getCountryName(p.b))}</strong></td>
          <td style="color:var(--accent-gold)">${p.winsA} – ${p.winsB}</td>
          <td>${p.matches}</td>
        </tr>`).join('')
      : '<tr><td colspan="3" style="color:var(--text-muted)">Play competitive rounds to build real rivalry records.</td></tr>';
  }

  // ===== PERFORMANCE MONITORING & DIAGNOSTICS =====
  function renderPerformanceAndDiagnostics(d) {
    const p = d.perf;
    if (p && $('perf-fps')) {
      $('perf-fps').textContent = `${p.fps} FPS`;
      $('perf-fps').className = 'kpi-value ' + (p.unstable ? 'kpi-crimson' : 'kpi-emerald');
      $('perf-frametime').textContent = `Avg ${p.avgFrameMs}ms · Max ${p.maxFrameMs}ms`;
      $('perf-quality').textContent = p.adaptiveLevel || 'FULL';
      $('perf-reduced-sub').textContent = `Reduced-Effects: ${d.visual?.reducedEffects ? 'ON' : 'OFF'} · Adaptive: ${d.visual?.adaptiveQuality !== false ? 'ON' : 'OFF'}`;
      $('perf-particles').textContent = String(p.activeParticles || 0);
      $('perf-memory').textContent = p.memoryMB !== null && p.memoryMB !== undefined ? `${p.memoryMB} MB` : 'N/A';
      if ($('perf-warn-banner')) $('perf-warn-banner').classList.toggle('hidden', !p.unstable);
    }
    const diags = Array.isArray(d.diagnostics) ? d.diagnostics : [];
    if ($('badge-diag-count')) $('badge-diag-count').textContent = String(diags.length);
    if ($('diag-table-body')) {
      $('diag-table-body').innerHTML = diags.length
        ? diags.map((x) => `<tr>
            <td><code>${escapeHtml(x.system)}</code></td>
            <td>${escapeHtml(x.message)}</td>
            <td style="color:var(--text-secondary)">${escapeHtml(x.detail || '—')}</td>
            <td><span class="badge badge-crimson">${x.count}x</span></td>
            <td>${new Date(x.lastAt).toLocaleTimeString()}</td>
          </tr>`).join('')
        : '<tr><td colspan="5" style="color:var(--text-muted)">No runtime errors or recovery warnings detected.</td></tr>';
    }
  }

  if ($('btn-diag-clear')) {
    $('btn-diag-clear').addEventListener('click', async () => {
      const r = await execAdminAction('diagnostics.clear', {}, 'Cleared engine diagnostics log');
      if (r.ok) toast('Diagnostics log cleared.', 'ok');
    });
  }

  if ($('btn-safe-reset')) {
    $('btn-safe-reset').addEventListener('click', async () => {
      const ok = await confirmDialog({
        title: 'Run Safe Engine Recovery Reset?',
        body: 'This clears only the transient in-progress round state (fca_state) and starts a fresh round cleanly. All lifetime stats, achievements, and championship records are preserved.',
        confirmText: 'Run Safe Recovery Reset'
      });
      if (!ok) return;
      const r = await execAdminAction('recovery.safe_reset', {}, 'Executed safe engine recovery reset');
      if (r.ok) toast('Safe engine recovery reset completed.', 'ok');
    });
  }

  renderRollbackTable();
  updateUndoButton();

  // Boot
  checkSession();

  // ===== MASTER SYNC v4 (DUAL-TRANSPORT, CONFIRMED ACK, MONOTONIC SEQ) & MOBILE HUB =====
  const SYNC_CMD_KEY = 'fca_sync_cmd';
  const SYNC_ACK_KEY = 'fca_sync_ack';
  const SYNC_STATE_KEY = 'fca_sync_state';
  const pendingAcks = new Map();
  let lastAppliedSeq = 0;
  let activeEdFilter = 'all';

  function updateSyncIndicators(t) {
    const connected = !!(t && Date.now() - state.lastTelemetryAt < 4500);
    const queuedName = t && t.pendingEditionName ? t.pendingEditionName : '';
    const pills = [$('mqd-sync-pill'), $('ed-sync-status')];
    pills.forEach((p) => {
      if (!p) return;
      p.classList.remove('synced', 'queued', 'offline');
      if (!connected) {
        p.classList.add('offline');
        p.textContent = 'Waiting for Game';
      } else if (queuedName) {
        p.classList.add('queued');
        p.textContent = 'Queued: ' + queuedName;
      } else {
        p.classList.add('synced');
        p.textContent = 'Live Synced';
      }
    });
    if ($('mqd-edition') && t) $('mqd-edition').textContent = (t.editionName || 'Classic') + ' · R' + (t.round || 0);
    if ($('mqd-pause-btn') && t) $('mqd-pause-btn').textContent = t.paused ? 'Resume' : 'Pause';
    if ($('mqd-queued-row')) {
      if (queuedName) {
        $('mqd-queued-row').classList.remove('hidden');
        if ($('mqd-queued-text')) $('mqd-queued-text').textContent = 'Queued for next battle: ' + queuedName;
      } else {
        $('mqd-queued-row').classList.add('hidden');
      }
    }
    if ($('ed-active-banner') && t) $('ed-active-banner').textContent = (t.editionName || 'Classic') + ' (#' + ((t.editionIdx || 0) + 1) + ')';
    if ($('ed-queued-banner')) $('ed-queued-banner').textContent = queuedName ? ('Queued for next battle: ' + queuedName) : 'No edition queued';
  }

  function resolveAck(reqId, res) {
    const entry = pendingAcks.get(reqId);
    if (!entry) return;
    clearTimeout(entry.timer);
    pendingAcks.delete(reqId);
    entry.resolve(res);
  }

  function dispatchConfirmedToGame(action, payload) {
    const reqId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const msg = { target: 'game', reqId, action, payload, ts: Date.now() };
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        pendingAcks.delete(reqId);
        resolve({ ok: false, unconfirmed: true, error: 'Main game tab did not confirm in time (ensure Main Game is open).' });
      }, 1800);
      pendingAcks.set(reqId, { resolve, timer });
      try { if (bc) bc.postMessage(msg); } catch (_) {}
      try { localStorage.setItem(SYNC_CMD_KEY, JSON.stringify(msg)); } catch (_) {}
    });
  }

  async function execConfirmedAction(action, payload = {}, summary = '') {
    const authRes = await execAdminAction(action, payload, summary, false);
    if (!authRes.ok) return authRes;
    const ack = await dispatchConfirmedToGame(action, payload);
    if (!ack || !ack.ok) {
      toast((ack && ack.error) || 'Game did not confirm change.', 'error');
      return { ok: false, error: ack && ack.error };
    }
    if (ack.queued) toast(summary + ' (Queued safely for next battle)', 'ok');
    else toast(summary + ' (Applied live)', 'ok');
    return { ok: true, ack };
  }

  function renderEditionsHub(t) {
    const grid = $('editions-card-grid');
    if (!grid) return;
    const list = (t && Array.isArray(t.editions) && t.editions.length) ? t.editions : DEFAULT_EDITIONS;
    const activeIdx = t ? t.editionIdx : 0;
    const queuedIdx = t && Number.isInteger(t.pendingEditionIdx) ? t.pendingEditionIdx : -1;
    const filtered = list.filter((e) => {
      if (activeEdFilter === 'all') return true;
      if (activeEdFilter === 'original') return e.idx <= 12;
      if (activeEdFilter === 'v5a') return e.idx >= 37 && e.idx <= 56;
      if (activeEdFilter === 'v5b') return e.idx >= 57 && e.idx <= 76;
      if (activeEdFilter === 'tier1') return e.tier === 1;
      if (activeEdFilter === 'tier2') return e.tier === 2;
      if (activeEdFilter === 'tier3') return e.tier === 3;
      if (activeEdFilter === 'tier4') return e.tier === 4;
      return true;
    });
    grid.innerHTML = filtered.map((e) => {
      const isAct = e.idx === activeIdx;
      const isQ = e.idx === queuedIdx;
      const rar = e.rarity || 'Standard';
      return '<div class="edition-card ' + (isAct ? 'is-active' : '') + (isQ ? ' is-queued' : '') + '">' +
        '<div class="edition-card-top">' +
          '<span class="edition-name">' + (e.idx + 1) + '. ' + escapeHtml(e.name) + '</span>' +
          '<span class="rarity-badge rarity-' + escapeHtml(rar) + '">' + escapeHtml(rar) + '</span>' +
        '</div>' +
        '<div class="edition-desc">' + escapeHtml(e.desc || (e.name + ' Edition')) + '</div>' +
        '<div style="display:flex;gap:6px;margin-top:4px">' +
          '<button type="button" class="btn btn-sm ' + (isAct ? 'btn-primary' : '') + '" style="flex:1" data-ed-select="' + e.idx + '" data-ed-now="0">' + (isAct ? 'Active' : (isQ ? 'Queued' : 'Select')) + '</button>' +
          '<button type="button" class="btn btn-sm" data-ed-select="' + e.idx + '" data-ed-now="1" title="Switch Immediately">Now</button>' +
          (e.idx > 0 ? '<button type="button" class="btn btn-sm" data-ed-toggle="' + e.idx + '" data-ed-disabled="' + (e.disabled ? '1' : '0') + '" title="Enable or disable in auto-rotation">' + (e.disabled ? 'Off' : 'On') + '</button>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderShowMasterPanels(t) {
    if (!t) return;
    const sd = t.showDirector || {};
    document.querySelectorAll('[data-preset]').forEach((b) => {
      b.classList.toggle('active-preset', b.dataset.preset === sd.preset);
    });
    if ($('sd-intensity-val')) {
      const labels = ['', 'Stage 1 (Normal)', 'Stage 2 (Rising)', 'Stage 3 (High)', 'Stage 4 (Final Climax)'];
      $('sd-intensity-val').textContent = labels[t.intensityStage || 1] || 'Stage 1 (Normal)';
    }
    if ($('sd-stakes-val')) {
      $('sd-stakes-val').textContent = t.currentStakes ? t.currentStakes.label : 'Standard Match';
    }
    if ($('sd-champ-legacy-summary') && t.championLegacy) {
      const cl = t.championLegacy;
      const cName = (state.countries.find((x) => x.id === cl.currentChampion) || {}).name || 'None yet';
      const lName = (state.countries.find((x) => x.id === cl.longestReignC) || {}).name || '-';
      const gStatus = cl.gauntlet && cl.gauntlet.active ? (' · <span style="color:#f97316">GAUNTLET ACTIVE (' + cl.gauntlet.defeated + '/' + cl.gauntlet.targetDefenses + ')</span>') : '';
      $('sd-champ-legacy-summary').innerHTML = 'Current Throne: <strong>' + escapeHtml(cName) + '</strong> (' + (cl.reignDefenses || 0) + ' defenses) · Longest Reign: <strong>' + escapeHtml(lName) + ' (' + (cl.longestReign || 0) + ')</strong>' + gStatus;
    }
    if ($('sd-retention-intel-list') && t.retentionIntel && Array.isArray(t.retentionIntel.recommendations)) {
      $('sd-retention-intel-list').innerHTML = t.retentionIntel.recommendations.map((r) =>
        '<div class="intel-item ' + escapeHtml(r.level || 'ok') + '">' + escapeHtml(r.text) + '</div>'
      ).join('');
    }
    if ($('sd-highlights-list') && Array.isArray(t.highlights)) {
      $('sd-highlights-list').innerHTML = t.highlights.length
        ? t.highlights.map((h) => '<div style="padding:6px 0;border-bottom:1px solid rgba(148,163,184,0.12)"><strong style="color:#fcd34d">' + escapeHtml(h.category) + '</strong> · R' + h.battleRound + ' (' + escapeHtml(h.edition) + ')<br>' + escapeHtml(h.reason) + '</div>').join('')
        : 'No highlights recorded yet.';
    }
    if ($('sd-legends-list') && Array.isArray(t.hallOfLegends)) {
      $('sd-legends-list').innerHTML = t.hallOfLegends.length
        ? t.hallOfLegends.map((l) => '<div>🏆 <strong>' + escapeHtml(l.title) + '</strong>: ' + escapeHtml(l.country) + ' (' + escapeHtml(l.metric) + ')</div>').join('')
        : 'No Legend titles earned yet.';
    }
    if ($('sd-recaps-list') && Array.isArray(t.recaps)) {
      $('sd-recaps-list').innerHTML = t.recaps.length
        ? t.recaps.slice(0, 12).map((r) => '<div style="padding:4px 0;border-bottom:1px solid rgba(148,163,184,0.1)">R' + r.round + ' · <strong>' + escapeHtml(r.winner) + '</strong> (' + escapeHtml(r.edition) + ', ' + r.durationSec + 's) · ' + escapeHtml(r.personality || '') + '</div>').join('')
        : 'No recaps yet.';
    }
  }

  // Patch incoming syncFromTelemetry + dual-transport listeners
  const origSyncFromTelemetry = syncFromTelemetry;
  syncFromTelemetry = function(d) {
    if (d && Number.isInteger(d.stateSeq)) {
      if (d.stateSeq < lastAppliedSeq && Date.now() - state.lastTelemetryAt < 10000) return;
      lastAppliedSeq = d.stateSeq;
    }
    origSyncFromTelemetry(d);
    updateSyncIndicators(d);
    renderEditionsHub(d);
    renderShowMasterPanels(d);
  };

  // Listen to storage fallback for ACKs and Telemetry + wrap BroadcastChannel ack
  window.addEventListener('storage', (ev) => {
    if (ev.key === SYNC_ACK_KEY && ev.newValue) {
      try {
        const a = JSON.parse(ev.newValue);
        if (a && a.reqId) resolveAck(a.reqId, a.res);
      } catch (_) {}
    } else if (ev.key === SYNC_STATE_KEY && ev.newValue) {
      try {
        const snap = JSON.parse(ev.newValue);
        if (snap && snap.ts) {
          state.telemetry = snap;
          state.lastTelemetryAt = Date.now();
          syncFromTelemetry(snap);
        }
      } catch (_) {}
    }
  });

  // Intercept BroadcastChannel ACKs once channel is initialized
  const origInitChannel = initChannel;
  initChannel = function() {
    origInitChannel();
    if (bc && !bc.__fcaAckPatched) {
      bc.__fcaAckPatched = true;
      const prevOnMsg = bc.onmessage;
      bc.onmessage = (ev) => {
        const msg = ev.data;
        if (msg && msg.target === 'admin' && msg.type === 'ack' && msg.reqId) {
          resolveAck(msg.reqId, msg.res);
        }
        if (prevOnMsg) prevOnMsg(ev);
      };
    }
    // Hydrate from last saved sync state immediately
    try {
      const cached = localStorage.getItem(SYNC_STATE_KEY);
      if (cached) {
        const snap = JSON.parse(cached);
        if (snap && Date.now() - snap.ts < 30000) {
          state.telemetry = snap;
          state.lastTelemetryAt = Date.now();
          syncFromTelemetry(snap);
        }
      }
    } catch (_) {}
  };

  // Auto-resync on visibilitychange / focus
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && state.authenticated) {
      dispatchConfirmedToGame('sync.resync', {}).catch(() => {});
    }
  });
  window.addEventListener('focus', () => {
    if (state.authenticated) {
      dispatchConfirmedToGame('sync.resync', {}).catch(() => {});
    }
  });

  // Periodic sync indicator freshness check
  setInterval(() => updateSyncIndicators(state.telemetry), 2000);

  // Mobile Bottom Nav switching
  document.querySelectorAll('.mbn-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.mbnAction === 'more') {
        const sb = document.querySelector('.sidebar');
        if (sb) sb.classList.toggle('open');
        return;
      }
      const tab = btn.dataset.mbnTab;
      if (!tab) return;
      const sb = document.querySelector('.sidebar');
      if (sb) sb.classList.remove('open');
      const targetNav = document.querySelector('.nav-item[data-tab="' + tab + '"]');
      if (targetNav) targetNav.click();
      document.querySelectorAll('.mbn-item').forEach((b) => b.classList.toggle('active', b === btn));
    });
  });

  // Mobile Quick-Action Dock handlers
  $('mqd-pause-btn')?.addEventListener('click', () => {
    const isPaused = !!(state.telemetry && state.telemetry.paused);
    execConfirmedAction(isPaused ? 'battle.resume' : 'battle.pause', {}, isPaused ? 'Resumed battle' : 'Paused battle');
  });
  $('mqd-next-btn')?.addEventListener('click', () => execConfirmedAction('battle.skip', {}, 'Skipped to next battle'));
  $('mqd-classic-btn')?.addEventListener('click', () => execConfirmedAction('edition.switch_classic', {}, 'Switched to Classic Edition'));
  $('mqd-resync-btn')?.addEventListener('click', () => execConfirmedAction('sync.resync', {}, 'Resynchronized with Main Game'));
  $('mqd-cancel-queue')?.addEventListener('click', () => execConfirmedAction('edition.cancel_queue', {}, 'Cancelled queued edition'));

  // Editions Hub handlers
  $('btn-ed-return-classic')?.addEventListener('click', () => execConfirmedAction('edition.switch_classic', {}, 'Returned to Classic Edition'));
  $('btn-ed-cancel-queue')?.addEventListener('click', () => execConfirmedAction('edition.cancel_queue', {}, 'Cancelled queued edition'));
  $('ed-filter-bar')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ed-filter]');
    if (!btn) return;
    activeEdFilter = btn.dataset.edFilter;
    document.querySelectorAll('[data-ed-filter]').forEach((b) => b.classList.toggle('active-filter', b === btn));
    renderEditionsHub(state.telemetry);
  });
  $('editions-card-grid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ed-select]');
    if (!btn) return;
    const idx = Number(btn.dataset.edSelect);
    const immediate = btn.dataset.edNow === '1';
    const safeQueue = immediate ? false : !!($('ed-safe-queue-toggle') && $('ed-safe-queue-toggle').checked);
    const edObj = (state.telemetry && state.telemetry.editions && state.telemetry.editions[idx]) || DEFAULT_EDITIONS[idx];
    execConfirmedAction('battle.set_edition', { editionIdx: idx, safeQueue, immediate }, 'Edition -> ' + (edObj ? edObj.name : ('#' + idx)));
  });

  // Show Director Master Suite handlers
  $('sd-preset-grid')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-preset]');
    if (!btn) return;
    execConfirmedAction('showdirector.apply_preset', { preset: btn.dataset.preset }, 'Applied preset: ' + btn.textContent.trim());
  });
  $('sd-pacing-select')?.addEventListener('change', (e) => {
    execConfirmedAction('showdirector.set_pacing', { pacingMode: e.target.value }, 'Set pacing: ' + e.target.value);
  });
  $('sd-intensity-toggle')?.addEventListener('change', (e) => {
    execConfirmedAction('showdirector.set_intensity', { enabled: e.target.checked }, 'Intensity Director ' + (e.target.checked ? 'ON' : 'OFF'));
  });
  $('sd-statusbar-toggle')?.addEventListener('change', (e) => {
    execConfirmedAction('settings.update_visual_audio', { overlays: { statusBar: e.target.checked } }, 'Live Show Status Bar ' + (e.target.checked ? 'ON' : 'OFF'));
  });
  $('btn-gauntlet-start')?.addEventListener('click', () => {
    const targetDefenses = Math.max(2, Math.min(10, parseInt($('gauntlet-target')?.value || '5', 10) || 5));
    execConfirmedAction('gauntlet.start', { targetDefenses }, "Started Champion's Gauntlet (" + targetDefenses + ' defenses)');
  });
  $('btn-gauntlet-stop')?.addEventListener('click', () => execConfirmedAction('gauntlet.stop', {}, "Stopped Champion's Gauntlet"));
  $('btn-sd-save-rare')?.addEventListener('click', () => {
    execConfirmedAction('showdirector.update_rare_config', {
      enabled: !!$('sd-rare-enabled')?.checked,
      chance: parseFloat($('sd-rare-chance')?.value || '0.12'),
      cooldownRounds: parseInt($('sd-rare-cd')?.value || '5', 10)
    }, 'Updated Rare Moment rules');
  });
  $('btn-sd-trigger-rare')?.addEventListener('click', () => {
    const rareId = $('sd-rare-select')?.value || 'golden_arena';
    execConfirmedAction('showdirector.trigger_rare', { rareId }, 'Triggered Rare Moment: ' + rareId);
  });
  $('btn-sd-launch-finale')?.addEventListener('click', () => {
    const format = $('sd-finale-format')?.value || 'Grand Championship Finale';
    execConfirmedAction('showdirector.trigger_finale', { format, editionIdx: 36 }, 'Launched Finale: ' + format);
  });
  $('btn-smart-queue')?.addEventListener('click', () => execConfirmedAction('queue.smart_fill', { count: 3 }, 'Smart-filled 3 varied battles'));
  $('btn-clear-highlights')?.addEventListener('click', async () => {
    const ok = await confirmDialog({ title: 'Clear Highlights Log', body: 'Remove all stored highlight metadata entries? Competitive win records are unaffected.', confirmText: 'Clear Highlights' });
    if (ok) execConfirmedAction('highlights.clear', {}, 'Cleared Highlights log');
  });

  // Render initial 37 editions grid right away
  renderEditionsHub(null);


  // ===== v5.0 ROTATION & v6.0 BATTLE INTELLIGENCE ADMIN WIRING =====
  const prevRenderShowMaster = renderShowMasterPanels;
  renderShowMasterPanels = function(t) {
    prevRenderShowMaster(t);
    if (!t) return;
    if (t.rotation) {
      const r = t.rotation;
      if ($('rot-status-badge')) $('rot-status-badge').textContent = 'Edition: ' + (r.edition.mode || 'every_battle');
      if ($('rot-ed-next')) $('rot-ed-next').textContent = '(' + (r.edition.nextLabel || '') + ')';
      if ($('rot-theme-next')) $('rot-theme-next').textContent = '(' + (r.theme.nextLabel || '') + ')';
      if ($('rot-mode-next')) $('rot-mode-next').textContent = '(' + (r.mode.nextLabel || '') + ')';
      if ($('rot-diff-next')) $('rot-diff-next').textContent = '(' + (r.difficulty.nextLabel || '') + ')';
      if ($('rot-current-summary')) {
        $('rot-current-summary').textContent = 'Active: ' + r.edition.currentName + ' · Theme: ' + r.theme.currentName + ' · Mode: ' + r.mode.current + ' · Diff: ' + r.difficulty.current;
      }
      if (document.activeElement?.id !== 'rot-edition-mode' && $('rot-edition-mode')) $('rot-edition-mode').value = r.edition.mode;
      if (document.activeElement?.id !== 'rot-theme-mode' && $('rot-theme-mode')) $('rot-theme-mode').value = r.theme.mode;
      if (document.activeElement?.id !== 'rot-mode-mode' && $('rot-mode-mode')) $('rot-mode-mode').value = r.mode.mode;
      if (document.activeElement?.id !== 'rot-diff-mode' && $('rot-diff-mode')) $('rot-diff-mode').value = r.difficulty.mode;
    }
    if (t.v6Config) {
      const c = t.v6Config;
      if ($('v6-sudden-en')) $('v6-sudden-en').checked = !!c.suddenDeath?.enabled;
      if ($('v6-rivalry-en')) $('v6-rivalry-en').checked = !!c.rivalry?.enabled;
      if ($('v6-director-en')) $('v6-director-en').checked = !!c.eventDirector?.enabled;
      if ($('v6-upset-en')) $('v6-upset-en').checked = !!c.upsetDetector?.enabled;
      if ($('v6-comeback-en')) $('v6-comeback-en').checked = !!c.comeback?.enabled;
      if ($('v6-entrance-en')) $('v6-entrance-en').checked = !!c.entranceEvolution?.enabled;
      if (document.activeElement?.id !== 'v6-sudden-sec' && $('v6-sudden-sec')) $('v6-sudden-sec').value = c.suddenDeath?.triggerSec || 75;
      if (document.activeElement?.id !== 'v6-profile-select' && $('v6-profile-select')) $('v6-profile-select').value = c.personalityProfile || 'auto';
    }
    if (t.v6Runtime && $('v6-live-summary')) {
      const rt = t.v6Runtime;
      const rivTxt = rt.activeRivalry ? (rt.activeRivalry.nameA + ' vs ' + rt.activeRivalry.nameB + ' (' + rt.activeRivalry.winsA + '-' + rt.activeRivalry.winsB + ')') : 'None active';
      $('v6-live-summary').innerHTML = 'Entrance: <strong>' + escapeHtml(rt.entranceTier || 'Standard') + '</strong> · Profile: <strong>' + escapeHtml(rt.profileLabel || 'Auto') + '</strong> · Rivalry: <strong>' + escapeHtml(rivTxt) + '</strong> · Sudden Death: <strong>' + (rt.suddenActive ? 'ACTIVE' : 'Standby') + '</strong>';
    }
    if ($('v6-journey-list') && Array.isArray(t.countryJourney)) {
      $('v6-journey-list').innerHTML = t.countryJourney.length
        ? t.countryJourney.map((j) => '<div style="padding:3px 0;border-bottom:1px solid rgba(148,163,184,0.1)"><strong>' + escapeHtml(j.name) + '</strong> [' + escapeHtml(j.tier) + '] · ' + j.wins + 'W/' + j.battles + 'B</div>').join('')
        : 'No journey records yet.';
    }
    if ($('v6-timelines-list') && Array.isArray(t.momentTimelines)) {
      $('v6-timelines-list').innerHTML = t.momentTimelines.length
        ? t.momentTimelines.slice(0, 8).map((tl) => '<div style="padding:3px 0;border-bottom:1px solid rgba(148,163,184,0.1)"><strong>R' + tl.round + ' ' + escapeHtml(tl.winner) + '</strong> (' + escapeHtml(tl.edition) + ', ' + (tl.moments?.length || 0) + ' events)</div>').join('')
        : 'No timelines captured yet.';
    }
  };

  // Edition enable/disable toggle handler
  $('editions-card-grid')?.addEventListener('click', async (ev) => {
    const tBtn = ev.target.closest('[data-ed-toggle]');
    if (!tBtn) return;
    ev.stopPropagation();
    const idx = parseInt(tBtn.dataset.edToggle, 10);
    const currentlyDisabled = tBtn.dataset.edDisabled === '1';
    await execConfirmedAction('edition.toggle_enabled', { editionIdx: idx, enabled: currentlyDisabled }, (currentlyDisabled ? 'Enabled' : 'Disabled') + ' edition #' + (idx + 1));
  });

  // Rotation Save button
  $('rot-save-btn')?.addEventListener('click', async () => {
    const timedSec = Math.max(30, Math.min(7200, parseInt($('rot-timed-sec')?.value || '300', 10) || 300));
    await execConfirmedAction('rotation.update', {
      edition: { mode: $('rot-edition-mode')?.value || 'every_battle', timedSec },
      theme: { mode: $('rot-theme-mode')?.value || 'manual', timedSec },
      mode: { mode: $('rot-mode-mode')?.value || 'manual', timedSec },
      difficulty: { mode: $('rot-diff-mode')?.value || 'manual', timedSec }
    }, 'Updated round-based rotation settings');
  });

  // v6.0 Config Save / Trigger Sudden Death / Clear Timelines
  $('v6-save-btn')?.addEventListener('click', async () => {
    await execConfirmedAction('v6.update_config', {
      suddenDeath: { enabled: !!$('v6-sudden-en')?.checked, triggerSec: Math.max(20, Math.min(300, parseInt($('v6-sudden-sec')?.value || '75', 10) || 75)) },
      rivalry: { enabled: !!$('v6-rivalry-en')?.checked },
      eventDirector: { enabled: !!$('v6-director-en')?.checked },
      upsetDetector: { enabled: !!$('v6-upset-en')?.checked },
      comeback: { enabled: !!$('v6-comeback-en')?.checked },
      entranceEvolution: { enabled: !!$('v6-entrance-en')?.checked },
      personalityProfile: $('v6-profile-select')?.value || 'auto'
    }, 'Saved v6.0 Battle Intelligence configuration');
  });
  $('v6-trigger-sd-btn')?.addEventListener('click', async () => {
    await execConfirmedAction('v6.trigger_sudden_death', {}, 'Triggered Sudden Death overtime');
  });
  $('v6-clear-tl-btn')?.addEventListener('click', async () => {
    await execConfirmedAction('v6.clear_timelines', {}, 'Cleared stored battle moment timelines');
  });

})();
