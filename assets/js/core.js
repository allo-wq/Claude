/* OSINT Atlas — shared utilities: DOM helpers, storage, clipboard, indicator detection. */
(function () {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ESC[c]);
  const icon = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  /* ---------- storage (every access guarded: private mode, blocked storage, previews) ---------- */
  const store = (() => {
    let ok = false;
    try {
      const k = '__atlas_probe';
      localStorage.setItem(k, '1');
      localStorage.removeItem(k);
      ok = true;
    } catch (_) { ok = false; }
    return {
      ok,
      get(key, fallback) {
        if (!ok) return fallback;
        try {
          const raw = localStorage.getItem(key);
          return raw == null ? fallback : JSON.parse(raw);
        } catch (_) { return fallback; }
      },
      set(key, value) {
        if (!ok) return;
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* quota or blocked */ }
      },
    };
  })();

  /* ---------- feedback ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  async function copy(text, label = 'Copied to clipboard') {
    try {
      await navigator.clipboard.writeText(text);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let done = false;
      try { done = document.execCommand('copy'); } catch (_) { done = false; }
      ta.remove();
      if (!done) { toast('Copy blocked — select the text and copy manually'); return; }
    }
    toast(label);
  }

  function download(filename, text, type = 'text/plain') {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /* ---------- formatting ---------- */
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  function fmtUTC(ms) {
    const d = new Date(ms);
    if (isNaN(d)) return '—';
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`;
  }
  function fmtLocal(ms) {
    const d = new Date(ms);
    if (isNaN(d)) return '—';
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
  }
  const RTF = typeof Intl !== 'undefined' && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat('en', { numeric: 'auto' }) : null;
  function relTime(ms) {
    const diff = ms - Date.now();
    const abs = Math.abs(diff);
    const units = [['year', 31536e6], ['month', 2592e6], ['day', 864e5], ['hour', 36e5], ['minute', 6e4], ['second', 1e3]];
    for (const [unit, size] of units) {
      if (abs >= size || unit === 'second') {
        const v = Math.round(diff / size);
        return RTF ? RTF.format(v, unit) : `${v} ${unit}s`;
      }
    }
    return '';
  }
  function fmtBytes(n) {
    if (n < 1024) return `${n} B`;
    const u = ['KB', 'MB', 'GB'];
    let i = -1;
    do { n /= 1024; i++; } while (n >= 1024 && i < u.length - 1);
    return `${n.toFixed(n < 10 ? 2 : 1)} ${u[i]}`;
  }
  const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (_) { return url; } };

  /* ---------- refang / defang ---------- */
  function refang(s) {
    return String(s == null ? '' : s)
      .replace(/\bh(?:xx|\*\*)p/gi, 'http')
      .replace(/\bfxp(?=s?(?:\[:\]|:))/gi, 'ftp')
      .replace(/\[\.\]|\(\.\)|\{\.\}|\[dot\]|\(dot\)/gi, '.')
      .replace(/\[:\]/g, ':')
      .replace(/\[\/\]/g, '/')
      .replace(/\[@\]|\[at\]/gi, '@');
  }
  function defang(value, type) {
    let v = String(value);
    if (type === 'url') {
      v = v.replace(/^http/i, 'hxxp').replace(/^ftp/i, 'fxp');
      return v.replace(/^([a-z]+:\/\/)([^/?#]+)/i, (m, scheme, host) => scheme + host.replace(/\./g, '[.]'));
    }
    if (type === 'email') return v.replace('@', '[@]').replace(/\.(?=[^@]*$)/g, '[.]');
    if (type === 'ip' || type === 'domain') return v.replace(/\./g, '[.]');
    return v;
  }

  /* ---------- indicator detection ---------- */
  const RX = {
    ipv4: /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/,
    domain: /^(?=.{3,253}$)(?:(?!-)[a-z0-9-]{1,63}(?<!-)\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/i,
    email: /^([^\s@<>()[\]]+)@((?:(?!-)[a-z0-9-]{1,63}(?<!-)\.)+[a-z]{2,63})$/i,
    url: /^[a-z][a-z0-9+.-]*:\/\/\S+$/i,
    coords: /^\(?\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*\)?$/,
    snowflake: /^\d{15,20}$/,
    username: /^@?[a-z0-9_][a-z0-9._-]{0,38}$/i,
    hex: /^[a-f0-9]+$/i,
  };
  const HASH_BY_LEN = { 32: 'md5', 40: 'sha1', 64: 'sha256', 128: 'sha512' };

  function isIPv6(s) {
    if (!/^[0-9a-f:.]+$/i.test(s) || (s.match(/:/g) || []).length < 2) return false;
    try { new URL(`http://[${s}]/`); return true; } catch (_) { return false; }
  }
  const isIP = (s) => RX.ipv4.test(s) || isIPv6(s);

  function guessType(s) {
    const c = s.match(RX.coords);
    if (c && /\./.test(s) && Math.abs(+c[1]) <= 90 && Math.abs(+c[2]) <= 180 && !RX.ipv4.test(s)) return 'coords';
    if (RX.url.test(s)) return 'url';
    if (RX.email.test(s)) return 'email';
    if (isIP(s)) return 'ip';
    if (RX.hex.test(s) && HASH_BY_LEN[s.length]) return 'hash';
    if (RX.snowflake.test(s)) return 'snowflake';
    const slash = s.indexOf('/');
    if (slash > 0 && RX.domain.test(s.slice(0, slash))) return 'url';
    if (RX.domain.test(s.replace(/\.$/, ''))) return 'domain';
    if (RX.username.test(s) && !/^\d+$/.test(s)) return 'username';
    return 'keyword';
  }

  function normalize(type, s) {
    const ctx = {};
    let value = s;
    switch (type) {
      case 'url': {
        const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
        try {
          const u = new URL(withScheme);
          value = u.href;
          ctx.host = u.hostname.replace(/^\[|\]$/g, '');
          ctx.hostType = isIP(ctx.host) ? 'ip' : 'domain';
        } catch (_) { value = withScheme; }
        break;
      }
      case 'email': {
        const m = s.match(/^(.+)@([^@]+)$/);
        if (m) { ctx.local = m[1]; ctx.domain = m[2].toLowerCase(); value = `${m[1]}@${ctx.domain}`; }
        break;
      }
      case 'domain':
        value = s.toLowerCase().replace(/^\*\./, '').replace(/\.$/, '');
        break;
      case 'ip':
        value = s.toLowerCase();
        ctx.version = RX.ipv4.test(s) ? 4 : 6;
        break;
      case 'hash':
        value = s.toLowerCase();
        ctx.algo = HASH_BY_LEN[s.length] || 'hash';
        break;
      case 'username':
        value = s.replace(/^@/, '');
        break;
      case 'coords': {
        const c = s.match(RX.coords);
        if (c) { ctx.lat = +c[1]; ctx.lon = +c[2]; value = `${ctx.lat}, ${ctx.lon}`; }
        break;
      }
      default:
        value = s;
    }
    return { type, value, ctx };
  }

  /** Detects the indicator type (unless forced) and returns { type, value, ctx, guessed }. */
  function detect(raw, forced) {
    const s = refang(raw).trim();
    if (!s) return null;
    const guessed = guessType(s);
    const type = forced && forced !== 'auto' ? forced : guessed;
    const out = normalize(type, s);
    out.guessed = guessed;
    return out;
  }

  /* ---------- snowflake IDs ---------- */
  const SNOWFLAKES = [
    { id: 'x', name: 'X / Twitter', note: 'post or user ID', decode: (n) => Number(n >> 22n) + 1288834974657 },
    { id: 'discord', name: 'Discord', note: 'message, user or server ID', decode: (n) => Number(n >> 22n) + 1420070400000 },
    { id: 'mastodon', name: 'Mastodon', note: 'status ID', decode: (n) => Number(n >> 16n) },
    { id: 'tiktok', name: 'TikTok', note: 'video ID', decode: (n) => Number(n >> 32n) * 1000 },
  ];
  function decodeSnowflake(str) {
    if (!/^\d{1,20}$/.test(String(str).trim())) return [];
    let n;
    try { n = BigInt(String(str).trim()); } catch (_) { return []; }
    const min = Date.UTC(2006, 0, 1);
    const max = Date.now() + 864e5;
    return SNOWFLAKES.map((p) => {
      const ms = p.decode(n);
      return { id: p.id, name: p.name, note: p.note, ms, plausible: ms >= min && ms <= max };
    });
  }

  function isPrivateIP(ip) {
    if (RX.ipv4.test(ip)) {
      const [a, b] = ip.split('.').map(Number);
      return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
    }
    const l = ip.toLowerCase();
    return l === '::1' || l.startsWith('fe80') || l.startsWith('fc') || l.startsWith('fd');
  }

  window.Atlas = {
    $, $$, esc, icon, store, toast, copy, download,
    fmtUTC, fmtLocal, relTime, fmtBytes, hostOf,
    refang, defang, detect, isIP, isIPv6, isPrivateIP, RX,
    decodeSnowflake,
    // populated by app.js / tools.js
    pivot: null, logEntity: null, runIntel: null,
  };
})();
