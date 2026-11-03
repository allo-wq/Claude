/* OSINT Atlas — toolbox utilities. Everything runs locally except the Domain & IP intel lookup. */
(function () {
  'use strict';

  const A = window.Atlas;
  const D = window.ATLAS_DATA;
  const { $, $$, esc, icon, store, toast, copy } = A;

  /* =========================================================
     Tabs
     ========================================================= */
  const tabs = $$('.tool-tab');
  function selectTool(id, focus) {
    if (!document.getElementById(`tool-${id}`)) id = 'intel';
    tabs.forEach((t) => {
      const on = t.dataset.tool === id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      if (on && focus) t.focus();
    });
    $$('.tool-panel').forEach((p) => { p.hidden = p.id !== `tool-${id}`; });
    store.set('atlas.tool', id);
  }
  tabs.forEach((t) => t.addEventListener('click', () => selectTool(t.dataset.tool)));
  $('#tool-tabs').addEventListener('keydown', (ev) => {
    const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (!(ev.key in keys) && ev.key !== 'Home' && ev.key !== 'End') return;
    ev.preventDefault();
    const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
    let n = ev.key === 'Home' ? 0 : ev.key === 'End' ? tabs.length - 1 : (i + keys[ev.key] + tabs.length) % tabs.length;
    selectTool(tabs[n].dataset.tool, true);
  });
  selectTool(store.get('atlas.tool', 'intel'));

  const loading = (msg) => `<div class="loading"><span class="spinner"></span>${esc(msg)}</div>`;
  const pivotBtn = (value, type, label) =>
    `<button type="button" class="linkish" data-pivot="${esc(value)}" data-pivot-type="${esc(type)}" title="Pivot on ${esc(value)}">${esc(label || value)}</button>`;
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest('.tool-panels [data-pivot]');
    if (b) A.pivot(b.dataset.pivot, b.dataset.pivotType);
  });

  function fetchTimeout(url, opts = {}, ms = 10000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, Object.assign({ credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctrl.signal }, opts))
      .finally(() => clearTimeout(timer));
  }

  async function digestHex(algo, buf) {
    if (!(window.crypto && crypto.subtle)) return null;
    const h = await crypto.subtle.digest(algo, buf);
    return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  /* =========================================================
     1. Domain & IP intel (DNS-over-HTTPS + RDAP)
     ========================================================= */
  const intelForm = $('#intel-form');
  const intelInput = $('#intel-input');
  const intelOut = $('#intel-out');
  const DNS_TYPES = [['A', 1], ['AAAA', 28], ['CNAME', 5], ['MX', 15], ['NS', 2], ['TXT', 16], ['SOA', 6], ['CAA', 257]];
  let intelToken = 0;

  async function doh(name, type) {
    const endpoints = [
      `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
    ];
    let lastErr;
    for (const url of endpoints) {
      try {
        const r = await fetchTimeout(url, { headers: { accept: 'application/dns-json' } }, 8000);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
      } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error('DNS lookup failed');
  }

  async function rdap(kind, value) {
    const r = await fetchTimeout(`https://rdap.org/${kind}/${encodeURIComponent(value)}`, { headers: { accept: 'application/rdap+json, application/json' } }, 12000);
    if (r.status === 404) { const e = new Error('not found'); e.notFound = true; throw e; }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  function registrableCandidates(name) {
    const l = name.split('.');
    const out = [name];
    if (l.length > 3) out.push(l.slice(-3).join('.'));
    if (l.length > 2) out.push(l.slice(-2).join('.'));
    return Array.from(new Set(out));
  }

  const vcard = (ent, field) => {
    const arr = ent && ent.vcardArray && ent.vcardArray[1];
    if (!Array.isArray(arr)) return null;
    const hit = arr.find((x) => x[0] === field);
    if (!hit) return null;
    const v = Array.isArray(hit[3]) ? hit[3].filter(Boolean).join(' ') : hit[3];
    return v ? String(v) : null;
  };
  function findRole(entities, role) {
    for (const ent of entities || []) {
      if ((ent.roles || []).includes(role)) return ent;
      const nested = findRole(ent.entities, role);
      if (nested) return nested;
    }
    return null;
  }
  const eventsOf = (j) => Object.fromEntries((j.events || []).map((e) => [e.eventAction, e.eventDate]));
  const fmtDate = (iso) => {
    const ms = Date.parse(iso);
    return isNaN(ms) ? esc(iso || '—') : `${esc(A.fmtUTC(ms).slice(0, 10))} <span class="muted">· ${esc(A.relTime(ms))}</span>`;
  };
  const kvRows = (rows) => rows.filter((r) => r && r[1] != null && r[1] !== '').map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('');

  function reverseName(ip) {
    if (A.RX.ipv4.test(ip)) return `${ip.split('.').reverse().join('.')}.in-addr.arpa`;
    const [head, tail] = ip.split('::');
    const h = head ? head.split(':') : [];
    const t = tail !== undefined && tail ? tail.split(':') : [];
    const groups = ip.includes('::') ? h.concat(Array(Math.max(0, 8 - h.length - t.length)).fill('0'), t) : h;
    return `${groups.map((g) => g.padStart(4, '0')).join('').split('').reverse().join('.')}.ip6.arpa`;
  }

  function dnsValue(type, data) {
    const clean = String(data).replace(/\.$/, '');
    if (type === 'A' || type === 'AAAA') return pivotBtn(clean, 'ip');
    if (type === 'NS' || type === 'CNAME') return pivotBtn(clean, 'domain');
    if (type === 'MX') {
      const m = clean.match(/^(\d+)\s+(.+)$/);
      if (m && m[2] !== '' && m[2] !== '.') return `<span class="muted">${esc(m[1])}</span> ${pivotBtn(m[2].replace(/\.$/, ''), 'domain')}`;
    }
    return esc(data);
  }

  function spfVerdict(txts) {
    const spf = txts.filter((t) => /^v=spf1\b/i.test(t));
    if (!spf.length) return { cls: 'warn', text: 'No SPF record — anyone can claim to send mail from this domain.' };
    if (spf.length > 1) return { cls: 'bad', text: 'Multiple SPF records — this is invalid and SPF will fail.' };
    const r = spf[0];
    if (/[+?]all\b|\sall\b/i.test(r) && !/[-~]all\b/i.test(r)) return { cls: 'bad', text: 'SPF ends in +all or ?all — it permits any sender.' };
    if (/-all\b/i.test(r)) return { cls: 'ok', text: 'SPF hard-fails unauthorised senders (-all).' };
    if (/~all\b/i.test(r)) return { cls: 'warn', text: 'SPF soft-fails unauthorised senders (~all).' };
    return { cls: 'warn', text: 'SPF has no terminating "all" mechanism.' };
  }
  function dmarcVerdict(txts) {
    const rec = txts.find((t) => /^v=DMARC1\b/i.test(t));
    if (!rec) return { cls: 'bad', text: 'No DMARC record — spoofed mail from this domain is not rejected.' };
    const p = ((rec.match(/\bp=(\w+)/i) || [])[1] || '').toLowerCase();
    if (p === 'reject') return { cls: 'ok', text: 'DMARC policy is reject.' };
    if (p === 'quarantine') return { cls: 'ok', text: 'DMARC policy is quarantine.' };
    return { cls: 'warn', text: `DMARC policy is ${p || 'missing'} — monitoring only, spoofed mail is still delivered.` };
  }
  const flagRow = (cls, text) => `<div class="flag-row ${cls}">${icon(cls === 'ok' ? 'check' : 'alert')}<span>${text}</span></div>`;

  async function intelDomain(name, token) {
    intelOut.innerHTML = `
      <div class="flags" id="intel-flags"></div>
      <div class="grid-2">
        <div class="panel-box"><h4>Registration (RDAP)</h4><div class="pb-body" id="intel-rdap">${loading('Querying RDAP…')}</div></div>
        <div class="panel-box"><h4>Email security</h4><div class="pb-body" id="intel-mail">${loading('Checking SPF and DMARC…')}</div></div>
      </div>
      <div class="panel-box"><h4>DNS records <span class="pill">${esc(name)}</span></h4><div id="intel-dns">${'<div class="pb-body">' + loading('Resolving…') + '</div>'}</div></div>
      <div class="row"><button type="button" class="btn ghost sm" data-pivot="${esc(name)}" data-pivot-type="domain">${icon('arrow')} Open all pivots for ${esc(name)}</button></div>`;
    const flags = [];
    const pushFlag = (cls, text) => { flags.push(flagRow(cls, text)); if (token === intelToken) $('#intel-flags').innerHTML = flags.join(''); };

    const dnsP = Promise.allSettled(DNS_TYPES.map(([t]) => doh(name, t)));
    const dmarcP = doh(`_dmarc.${name}`, 'TXT').catch(() => null);
    const rdapP = (async () => {
      let lastErr;
      for (const c of registrableCandidates(name)) {
        try { return { data: await rdap('domain', c), queried: c }; } catch (e) { lastErr = e; if (!e.notFound) break; }
      }
      throw lastErr || new Error('not found');
    })();
    rdapP.catch(() => {}); // handled below; avoids an unhandled-rejection report while DNS resolves

    // DNS
    const results = await dnsP;
    if (token !== intelToken) return;
    const anyOk = results.some((r) => r.status === 'fulfilled');
    const txts = [];
    let hasMX = false;
    if (!anyOk) {
      $('#intel-dns').innerHTML = `<div class="pb-body"><p class="err">Couldn't reach a DNS-over-HTTPS resolver. A network filter or browser extension may be blocking dns.google and cloudflare-dns.com.</p></div>`;
    } else {
      const nx = results[0].status === 'fulfilled' && results[0].value.Status === 3;
      if (nx) pushFlag('bad', `<b>NXDOMAIN</b> — ${esc(name)} does not exist in DNS.`);
      const rows = DNS_TYPES.map(([t, num], i) => {
        const r = results[i];
        if (r.status !== 'fulfilled') return `<tr><th>${t}</th><td class="none">lookup failed</td><td class="ttl"></td></tr>`;
        const ans = (r.value.Answer || []).filter((a) => a.type === num);
        if (t === 'TXT') ans.forEach((a) => txts.push(String(a.data).replace(/^"|"$/g, '').replace(/"\s*"/g, '')));
        if (t === 'MX' && ans.some((a) => !/^0\s+\.?$/.test(a.data))) hasMX = true;
        if (!ans.length) return `<tr><th>${t}</th><td class="none">none</td><td class="ttl"></td></tr>`;
        return ans.map((a, j) => `<tr>${j === 0 ? `<th rowspan="${ans.length}">${t}</th>` : ''}<td>${dnsValue(t, t === 'TXT' ? String(a.data).replace(/^"|"$/g, '') : a.data)}</td><td class="ttl">${esc(a.TTL)}s</td></tr>`).join('');
      }).join('');
      $('#intel-dns').innerHTML = `<table class="dns-table">${rows}</table>`;
    }

    // Email security
    const dmarc = await dmarcP;
    if (token !== intelToken) return;
    if (!anyOk) {
      $('#intel-mail').innerHTML = '<p class="muted">Unavailable — DNS lookups failed.</p>';
    } else {
      const dmarcTxt = ((dmarc && dmarc.Answer) || []).filter((a) => a.type === 16).map((a) => String(a.data).replace(/^"|"$/g, '').replace(/"\s*"/g, ''));
      const spf = spfVerdict(txts);
      const dm = dmarcVerdict(dmarcTxt);
      const spfRec = txts.find((t) => /^v=spf1/i.test(t));
      const dmRec = dmarcTxt.find((t) => /^v=DMARC1/i.test(t));
      $('#intel-mail').innerHTML = `<div class="flags">
        ${flagRow(hasMX ? 'ok' : 'warn', hasMX ? 'Has MX records — receives email.' : 'No usable MX record — the domain does not receive email.')}
        ${flagRow(spf.cls, esc(spf.text))}
        ${flagRow(dm.cls, esc(dm.text))}
      </div>
      <table class="kv">${kvRows([['SPF', spfRec ? esc(spfRec) : null], ['DMARC', dmRec ? esc(dmRec) : null]])}</table>`;
    }

    // RDAP
    try {
      const { data: j, queried } = await rdapP;
      if (token !== intelToken) return;
      const ev = eventsOf(j);
      const registrar = findRole(j.entities, 'registrar');
      const abuse = registrar ? findRole(registrar.entities, 'abuse') : findRole(j.entities, 'abuse');
      const registrant = findRole(j.entities, 'registrant');
      const ianaId = registrar && (registrar.publicIds || []).find((p) => /iana/i.test(p.type || ''));
      const status = (j.status || []).map((s) => `<span class="pill${/hold|redemption|pending delete/i.test(s) ? ' bad' : ''}">${esc(s)}</span>`).join(' ');
      const ns = (j.nameservers || []).map((n) => pivotBtn(String(n.ldhName || '').toLowerCase(), 'domain')).join('<br>');
      $('#intel-rdap').innerHTML = `<table class="kv">${kvRows([
        queried !== name ? ['Registered domain', pivotBtn(queried, 'domain')] : null,
        ['Registrar', registrar ? esc(vcard(registrar, 'fn') || registrar.handle || '—') + (ianaId ? ` <span class="muted">IANA ${esc(ianaId.identifier)}</span>` : '') : null],
        ['Registrant', registrant ? esc(vcard(registrant, 'org') || vcard(registrant, 'fn') || 'Redacted') : null],
        ['Created', ev.registration ? fmtDate(ev.registration) : null],
        ['Expires', ev.expiration ? fmtDate(ev.expiration) : null],
        ['Updated', ev['last changed'] ? fmtDate(ev['last changed']) : null],
        ['Status', status || null],
        ['Nameservers', ns || null],
        ['DNSSEC', j.secureDNS ? (j.secureDNS.delegationSigned ? '<span class="pill ok">signed</span>' : '<span class="pill">unsigned</span>') : null],
        ['Abuse contact', abuse ? esc(vcard(abuse, 'email') || vcard(abuse, 'tel') || '—') : null],
      ])}</table>`;
      const created = Date.parse(ev.registration);
      if (!isNaN(created)) {
        const days = Math.floor((Date.now() - created) / 864e5);
        if (days < 30) pushFlag('bad', `<b>Newly registered</b> — ${days} day${days === 1 ? '' : 's'} old. Fresh domains are common in phishing and fraud.`);
        else if (days < 180) pushFlag('warn', `Registered recently — ${Math.round(days / 30)} months ago.`);
        else pushFlag('ok', `Domain has existed for ${(days / 365).toFixed(1)} years.`);
      }
      const exp = Date.parse(ev.expiration);
      if (!isNaN(exp) && exp - Date.now() < 30 * 864e5) pushFlag('warn', `Registration expires ${esc(A.relTime(exp))}.`);
      if ((j.status || []).some((s) => /hold/i.test(s))) pushFlag('bad', 'Domain is on <b>hold</b> — usually suspended by the registrar or registry.');
    } catch (e) {
      if (token !== intelToken) return;
      $('#intel-rdap').innerHTML = e.notFound
        ? `<p class="muted">No RDAP record found. Some country-code registries don't offer RDAP yet — try <a href="https://lookup.icann.org/en/lookup?name=${encodeURIComponent(name)}" target="_blank" rel="noopener noreferrer">ICANN Lookup</a> or the registry's WHOIS.</p>`
        : `<p class="err">RDAP lookup failed (${esc(e.message || 'network error')}). The registry may not allow browser requests.</p>`;
    }
  }

  async function intelIP(ip, token) {
    const priv = A.isPrivateIP(ip);
    intelOut.innerHTML = `
      <div class="flags" id="intel-flags">${priv ? flagRow('warn', '<b>Private or reserved address</b> — not routable on the public internet, so public lookups return little.') : ''}</div>
      <div class="grid-2">
        <div class="panel-box"><h4>Network owner (RDAP)</h4><div class="pb-body" id="intel-rdap">${loading('Querying RDAP…')}</div></div>
        <div class="panel-box"><h4>Reverse DNS</h4><div class="pb-body" id="intel-ptr">${loading('Looking up PTR…')}</div></div>
      </div>
      <div class="row"><button type="button" class="btn ghost sm" data-pivot="${esc(ip)}" data-pivot-type="ip">${icon('arrow')} Open all pivots for ${esc(ip)}</button></div>`;

    const ptrP = doh(reverseName(ip), 'PTR').catch(() => null);
    const rdapP = rdap('ip', ip);
    rdapP.catch(() => {}); // handled below

    const ptr = await ptrP;
    if (token !== intelToken) return;
    const names = ((ptr && ptr.Answer) || []).filter((a) => a.type === 12).map((a) => String(a.data).replace(/\.$/, ''));
    $('#intel-ptr').innerHTML = ptr == null
      ? '<p class="err">Couldn\'t reach a DNS-over-HTTPS resolver.</p>'
      : names.length ? `<table class="kv">${names.map((n) => `<tr><th>PTR</th><td>${pivotBtn(n, 'domain')}</td></tr>`).join('')}</table>`
        : '<p class="muted">No PTR record.</p>';

    try {
      const j = await rdapP;
      if (token !== intelToken) return;
      const ev = eventsOf(j);
      const reg = findRole(j.entities, 'registrant') || findRole(j.entities, 'administrative');
      const abuse = findRole(j.entities, 'abuse');
      const cidrs = (j.cidr0_cidrs || []).map((c) => `${c.v4prefix || c.v6prefix}/${c.length}`).join(', ');
      const rir = (j.port43 || '').replace(/^whois\./, '').split('.')[0];
      $('#intel-rdap').innerHTML = `<table class="kv">${kvRows([
        ['Network', esc(j.name || j.handle || '—')],
        ['Organisation', reg ? esc(vcard(reg, 'org') || vcard(reg, 'fn') || reg.handle || '—') : null],
        ['Range', j.startAddress ? `${esc(j.startAddress)} – ${esc(j.endAddress)}` : null],
        ['CIDR', cidrs ? esc(cidrs) : null],
        ['Country', j.country ? esc(j.country) : null],
        ['Type', j.type ? esc(j.type) : null],
        ['Registry', rir ? esc(rir.toUpperCase()) : null],
        ['Registered', ev.registration ? fmtDate(ev.registration) : null],
        ['Updated', ev['last changed'] ? fmtDate(ev['last changed']) : null],
        ['Abuse contact', abuse ? esc(vcard(abuse, 'email') || '—') : null],
      ])}</table>`;
    } catch (e) {
      if (token !== intelToken) return;
      $('#intel-rdap').innerHTML = `<p class="err">RDAP lookup failed (${esc(e.notFound ? 'no record' : e.message || 'network error')}).</p>`;
    }
  }

  function intelRun(raw) {
    const d = A.detect(raw, 'auto');
    intelToken++;
    if (!d) { intelOut.innerHTML = ''; return; }
    let target = null, kind = null;
    if (d.type === 'domain') { target = d.value; kind = 'domain'; }
    else if (d.type === 'ip') { target = d.value; kind = 'ip'; }
    else if (d.type === 'url' && d.ctx.host) { target = d.ctx.host; kind = d.ctx.hostType; }
    else if (d.type === 'email' && d.ctx.domain) { target = d.ctx.domain; kind = 'domain'; }
    if (!target) {
      intelOut.innerHTML = `<p class="err">Enter a domain name or IP address. “${esc(raw.trim())}” looks like a ${esc(D.types[d.type].label.toLowerCase())}.</p>`;
      return;
    }
    if (target !== raw.trim()) intelInput.value = target;
    (kind === 'ip' ? intelIP : intelDomain)(target, intelToken);
  }

  intelForm.addEventListener('submit', (ev) => { ev.preventDefault(); intelRun(intelInput.value); });

  /** Public: open the intel tool and run it on a value. */
  A.runIntel = function (value) {
    selectTool('intel');
    document.getElementById('toolbox').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (value) { intelInput.value = value; intelRun(value); }
  };

  /* =========================================================
     2. Image metadata (EXIF)
     ========================================================= */
  const exifDrop = $('#exif-drop');
  const exifFile = $('#exif-file');
  const exifOut = $('#exif-out');
  let exifURL = null;

  function wireDrop(zone, input, handler) {
    ['dragenter', 'dragover'].forEach((t) => zone.addEventListener(t, (ev) => { ev.preventDefault(); zone.classList.add('drag'); }));
    ['dragleave', 'dragend', 'drop'].forEach((t) => zone.addEventListener(t, () => zone.classList.remove('drag')));
    zone.addEventListener('drop', (ev) => {
      ev.preventDefault();
      const f = ev.dataTransfer && ev.dataTransfer.files && ev.dataTransfer.files[0];
      if (f) handler(f);
    });
    input.addEventListener('change', () => { const f = input.files && input.files[0]; if (f) handler(f); input.value = ''; });
  }

  const exifDate = (s) => (typeof s === 'string' ? s.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3') : s);
  const fmtExposure = (x) => (typeof x !== 'number' || !x ? null : x >= 1 ? `${+x.toFixed(1)} s` : `1/${Math.round(1 / x)} s`);
  const ORIENT = { 1: 'Normal', 3: 'Rotated 180°', 6: 'Rotated 90° CW', 8: 'Rotated 90° CCW', 2: 'Mirrored', 4: 'Mirrored vertically', 5: 'Mirrored + 90° CCW', 7: 'Mirrored + 90° CW' };
  const EDITORS = /photoshop|lightroom|gimp|snapseed|picsart|affinity|canva|pixelmator|facetune|capture one|luminar|paint\.net/i;

  async function handleImage(file) {
    exifOut.innerHTML = loading(`Reading ${file.name}…`);
    if (file.size > 256 * 1024 * 1024) { exifOut.innerHTML = '<p class="err">That file is over 256 MB — too large to read here.</p>'; return; }
    const buf = await file.arrayBuffer();
    let meta = null;
    try { meta = window.AtlasExif.parse(buf); } catch (_) { meta = null; }
    const [sha256, md5hex] = await Promise.all([digestHex('SHA-256', buf).catch(() => null), Promise.resolve(window.md5(new Uint8Array(buf)))]);
    if (exifURL) URL.revokeObjectURL(exifURL);
    exifURL = URL.createObjectURL(file);
    const dims = await new Promise((res) => {
      const img = new Image();
      img.onload = () => res([img.naturalWidth, img.naturalHeight]);
      img.onerror = () => res(null);
      img.src = exifURL;
    });

    const i0 = (meta && meta.ifd0) || {};
    const ex = (meta && meta.exif) || {};
    const gps = (meta && meta.gps) || {};
    const pos = window.AtlasExif.gpsToDecimal(gps);
    const flags = [];
    if (!meta || (!Object.keys(i0).length && !Object.keys(ex).length)) {
      flags.push(flagRow('warn', '<b>No EXIF metadata.</b> Social platforms and messaging apps usually strip it on upload — try a reverse image search to find an earlier, unstripped copy.'));
    }
    if (pos) flags.push(flagRow('bad', '<b>Contains GPS coordinates</b> — the location where the photo was taken.'));
    if (i0.Software && EDITORS.test(i0.Software)) flags.push(flagRow('warn', `Processed with <b>${esc(i0.Software)}</b> — the image may have been edited.`));
    if (i0.DateTime && ex.DateTimeOriginal && i0.DateTime !== ex.DateTimeOriginal) flags.push(flagRow('warn', 'File was modified after capture (DateTime differs from DateTimeOriginal).'));
    if (ex.BodySerialNumber || ex.LensSerialNumber) flags.push(flagRow('warn', 'Camera or lens <b>serial number</b> present — it can link photos taken with the same device.'));

    const lens = [ex.LensMake, ex.LensModel].filter(Boolean).join(' ');
    const flash = typeof ex.Flash === 'number' ? (ex.Flash & 1 ? 'Fired' : 'Did not fire') : null;
    const focal = typeof ex.FocalLength === 'number' ? `${+ex.FocalLength.toFixed(1)} mm${ex.FocalLengthIn35mmFilm ? ` (${ex.FocalLengthIn35mmFilm} mm equiv.)` : ''}` : null;
    const gpsTime = Array.isArray(gps.GPSTimeStamp) ? gps.GPSTimeStamp.map((n) => String(Math.floor(n)).padStart(2, '0')).join(':') : null;

    const box = (title, rows) => {
      const body = kvRows(rows);
      return body ? `<div class="panel-box"><h4>${esc(title)}</h4><table class="kv">${body}</table></div>` : '';
    };

    const gpsCard = pos ? `<div class="gps-card">
        <div class="coords">${icon('pin')} ${esc(pos.lat)}, ${esc(pos.lon)}${pos.alt != null ? ` <span class="muted small">· ${esc(Math.round(pos.alt))} m</span>` : ''}</div>
        <div class="row">
          <button type="button" class="btn sm primary" data-pivot="${esc(`${pos.lat}, ${pos.lon}`)}" data-pivot-type="coords">${icon('search')} Pivot on location</button>
          <a class="btn sm ghost" href="https://www.google.com/maps/search/?api=1&query=${pos.lat},${pos.lon}" target="_blank" rel="noopener noreferrer">${icon('external')} Google Maps</a>
          <a class="btn sm ghost" href="https://www.openstreetmap.org/?mlat=${pos.lat}&mlon=${pos.lon}#map=17/${pos.lat}/${pos.lon}" target="_blank" rel="noopener noreferrer">${icon('external')} OpenStreetMap</a>
          <button type="button" class="btn sm ghost" id="exif-log">${icon('book')} Log to notebook</button>
        </div>
        ${gps.GPSDateStamp || gpsTime ? `<p class="small muted">GPS fix: ${esc(exifDate(gps.GPSDateStamp || ''))} ${esc(gpsTime || '')} UTC</p>` : ''}
      </div>` : '';

    const hashRows = [
      ['SHA-256', sha256 ? `${esc(sha256)} ${pivotBtn(sha256, 'hash', '→ lookup')}` : null],
      ['MD5', `${esc(md5hex)}`],
    ];

    exifOut.innerHTML = `
      <div class="exif-top">
        ${dims ? `<img class="exif-thumb" src="${esc(exifURL)}" alt="Preview of ${esc(file.name)}">` : '<div class="exif-thumb"></div>'}
        <div class="stack">
          ${box('File', [
            ['Name', esc(file.name)],
            ['Type', esc(file.type || 'unknown')],
            ['Size', esc(A.fmtBytes(file.size))],
            ['Dimensions', dims ? `${dims[0]} × ${dims[1]} px` : null],
          ].concat(hashRows))}
        </div>
      </div>
      ${flags.length ? `<div class="flags">${flags.join('')}</div>` : ''}
      ${gpsCard}
      <div class="grid-2">
        ${box('Device', [
          ['Make', i0.Make ? esc(i0.Make) : null], ['Model', i0.Model ? esc(i0.Model) : null], ['Lens', lens ? esc(lens) : null],
          ['Body serial', ex.BodySerialNumber ? esc(ex.BodySerialNumber) : null], ['Lens serial', ex.LensSerialNumber ? esc(ex.LensSerialNumber) : null],
          ['Owner', ex.CameraOwnerName ? esc(ex.CameraOwnerName) : null], ['Artist', i0.Artist ? esc(i0.Artist) : null],
          ['Copyright', i0.Copyright ? esc(i0.Copyright) : null], ['Description', i0.ImageDescription ? esc(i0.ImageDescription) : null],
        ])}
        ${box('Capture', [
          ['Taken', ex.DateTimeOriginal ? esc(exifDate(ex.DateTimeOriginal)) + (ex.OffsetTimeOriginal ? ` <span class="muted">${esc(ex.OffsetTimeOriginal)}</span>` : '') : null],
          ['Digitised', ex.DateTimeDigitized ? esc(exifDate(ex.DateTimeDigitized)) : null],
          ['Modified', i0.DateTime ? esc(exifDate(i0.DateTime)) : null],
          ['Software', i0.Software ? esc(i0.Software) : null],
          ['Exposure', fmtExposure(ex.ExposureTime)], ['Aperture', typeof ex.FNumber === 'number' ? `f/${+ex.FNumber.toFixed(1)}` : null],
          ['ISO', ex.ISO != null ? esc(Array.isArray(ex.ISO) ? ex.ISO[0] : ex.ISO) : null], ['Focal length', focal],
          ['Flash', flash], ['Orientation', i0.Orientation ? esc(ORIENT[i0.Orientation] || i0.Orientation) : null],
        ])}
      </div>
      <div class="panel-box"><h4>Reverse image search</h4><div class="pb-body">
        <p class="small muted" style="margin-bottom:10px">These services need you to upload the image yourself — doing so shares it with them.</p>
        <div class="row">
          <a class="btn sm ghost" href="https://lens.google.com/" target="_blank" rel="noopener noreferrer">${icon('external')} Google Lens</a>
          <a class="btn sm ghost" href="https://tineye.com/" target="_blank" rel="noopener noreferrer">${icon('external')} TinEye</a>
          <a class="btn sm ghost" href="https://yandex.com/images/" target="_blank" rel="noopener noreferrer">${icon('external')} Yandex</a>
          <a class="btn sm ghost" href="https://www.bing.com/visualsearch" target="_blank" rel="noopener noreferrer">${icon('external')} Bing</a>
        </div></div></div>`;

    const logBtn = $('#exif-log');
    if (logBtn && pos) logBtn.addEventListener('click', () => A.logEntity('coords', `${pos.lat}, ${pos.lon}`, `GPS from ${file.name}`));
  }
  wireDrop(exifDrop, exifFile, handleImage);

  /* =========================================================
     3. IOC extractor
     ========================================================= */
  const iocIn = $('#ioc-in');
  const iocOut = $('#ioc-out');
  const iocDefang = $('#ioc-defang');
  const NOT_TLD = new Set('exe dll sys bat cmd ps1 psm1 vbs vbe jar tmp log dat bin ini cfg conf txt pdf doc docx docm xls xlsx xlsm ppt pptx rtf csv json xml yml yaml html htm php asp aspx jsp png jpg jpeg gif bmp svg ico iso img dmg apk msi lnk hta wsf scr cpl ocx drv pif reg py rb js ts tsx jsx css map lock gz tar rar 7z bak old swp'.split(' '));
  const IOC_TYPES = [
    { id: 'ipv4', label: 'IPv4', pivot: 'ip', rx: /\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g },
    { id: 'ipv6', label: 'IPv6', pivot: 'ip', rx: /(?<![0-9a-f:])(?:[0-9a-f]{1,4}:){1,7}(?::|[0-9a-f]{1,4})(?::?[0-9a-f]{1,4}){0,6}(?![0-9a-f:])/gi,
      keep: (m) => A.isIPv6(m) && m.length >= 6 && (m.match(/[0-9a-f]{1,4}/gi) || []).length >= 2 && !/^\d{1,2}:\d{2}(:\d{2})?$/.test(m) },
    { id: 'domain', label: 'Domains', pivot: 'domain', rx: /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,23}\b/gi,
      keep: (m) => !NOT_TLD.has(m.split('.').pop().toLowerCase()) && !A.RX.ipv4.test(m), norm: (m) => m.toLowerCase() },
    { id: 'url', label: 'URLs', pivot: 'url', rx: /\b(?:https?|ftp):\/\/[^\s<>"'`]+/gi, norm: (m) => m.replace(/[.,;:!?)\]}>'"]+$/, '') },
    { id: 'email', label: 'Emails', pivot: 'email', rx: /\b[a-z0-9._%+-]+@(?:[a-z0-9-]+\.)+[a-z]{2,24}\b/gi, norm: (m) => m.toLowerCase() },
    { id: 'md5', label: 'MD5', pivot: 'hash', rx: /\b[a-f0-9]{32}\b/gi, norm: (m) => m.toLowerCase() },
    { id: 'sha1', label: 'SHA-1', pivot: 'hash', rx: /\b[a-f0-9]{40}\b/gi, norm: (m) => m.toLowerCase() },
    { id: 'sha256', label: 'SHA-256', pivot: 'hash', rx: /\b[a-f0-9]{64}\b/gi, norm: (m) => m.toLowerCase() },
    { id: 'sha512', label: 'SHA-512', pivot: 'hash', rx: /\b[a-f0-9]{128}\b/gi, norm: (m) => m.toLowerCase() },
    { id: 'cve', label: 'CVEs', rx: /\bCVE-\d{4}-\d{4,7}\b/gi, norm: (m) => m.toUpperCase(), link: (m) => `https://nvd.nist.gov/vuln/detail/${m}` },
    { id: 'btc', label: 'Bitcoin', rx: /\b(?:bc1[a-z0-9]{25,62}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})\b/g, keep: (m) => /[a-zA-Z]/.test(m) && !/^[0-9a-f]+$/i.test(m) },
    { id: 'eth', label: 'Ethereum', rx: /\b0x[a-fA-F0-9]{40}\b/g },
  ];
  const DEFANG_AS = { ipv4: 'ip', ipv6: 'ip', domain: 'domain', url: 'url', email: 'email' };

  function extractIOCs(text) {
    const src = A.refang(text);
    const found = {};
    IOC_TYPES.forEach((t) => {
      const set = new Set();
      for (const m of src.matchAll(t.rx)) {
        let v = t.norm ? t.norm(m[0]) : m[0];
        if (t.keep && !t.keep(v)) continue;
        set.add(v);
      }
      if (set.size) found[t.id] = Array.from(set);
    });
    return found;
  }

  function renderIOCs() {
    const text = iocIn.value;
    if (!text.trim()) { iocOut.innerHTML = '<div class="ioc-empty">Indicators will appear here as you paste.</div>'; return; }
    const found = extractIOCs(text);
    const defang = iocDefang.checked;
    const show = (t, v) => (defang && DEFANG_AS[t.id] ? A.defang(v, DEFANG_AS[t.id]) : v);
    const groups = IOC_TYPES.filter((t) => found[t.id]);
    if (!groups.length) { iocOut.innerHTML = '<div class="ioc-empty">No indicators found.</div>'; return; }
    const total = groups.reduce((n, t) => n + found[t.id].length, 0);
    iocOut.innerHTML = `<div class="row" style="justify-content:space-between"><span class="small muted">${total} unique indicator${total === 1 ? '' : 's'}</span>
      <button type="button" class="btn sm ghost" data-ioc-copy="all">${icon('copy')} Copy all</button></div>` +
      groups.map((t) => `<section class="ioc-group">
        <header><b>${esc(t.label)}<span class="count">${found[t.id].length}</span></b>
          <button type="button" class="btn sm ghost" data-ioc-copy="${t.id}" aria-label="Copy ${esc(t.label)}">${icon('copy')}</button></header>
        <ul>${found[t.id].map((v) => {
          const label = esc(show(t, v));
          if (t.pivot) return `<li><button type="button" data-pivot="${esc(v)}" data-pivot-type="${t.pivot}" title="Pivot on this">${label}</button></li>`;
          if (t.link) return `<li><a href="${esc(t.link(v))}" target="_blank" rel="noopener noreferrer">${label}</a></li>`;
          return `<li>${label}</li>`;
        }).join('')}</ul></section>`).join('');
    iocOut._found = { found, show, groups };
  }
  iocOut.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ioc-copy]');
    if (!b || !iocOut._found) return;
    const { found, show, groups } = iocOut._found;
    const id = b.dataset.iocCopy;
    const text = id === 'all'
      ? groups.map((t) => `# ${t.label}\n${found[t.id].map((v) => show(t, v)).join('\n')}`).join('\n\n')
      : found[id].map((v) => show(IOC_TYPES.find((t) => t.id === id), v)).join('\n');
    copy(text, 'Indicators copied');
  });
  let iocTimer;
  iocIn.addEventListener('input', () => { clearTimeout(iocTimer); iocTimer = setTimeout(renderIOCs, 150); });
  iocDefang.addEventListener('change', renderIOCs);
  $('#ioc-sample').addEventListener('click', () => {
    iocIn.value = [
      'Incident summary — phishing campaign (sample data)',
      '',
      'The lure came from billing@invoice-example[.]com and linked to',
      'hxxps://login.example-secure[.]net/auth/verify?id=8812, which served invoice_8812.zip.',
      '',
      'The archive dropped update.exe:',
      '  MD5     44d88612fea8a8f36de82e1278abb02f',
      '  SHA-1   3395856ce81f2b7382dee72602f798b642f14140',
      '  SHA-256 275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f',
      '',
      'Beacons went to 203.0.113.45:8443 and 198.51.100[.]23, plus 2001:db8:85a3::8a2e:370:7334.',
      'Initial access exploited CVE-2023-4966 on the VPN appliance.',
      'Ransom demanded to bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4 or 0x52908400098527886E0F7030069857D2E4169EE7.',
      'Report further sightings to soc@example.org.',
    ].join('\n');
    renderIOCs();
  });
  renderIOCs();

  /* =========================================================
     4. Dork builder
     ========================================================= */
  const dkFields = Object.fromEntries($$('[data-dk]').map((el) => [el.dataset.dk, el]));
  const dkQuery = $('#dork-query');
  const dkEngines = $('#dork-engines');
  const ENGINES = [
    ['Google', (s) => `https://www.google.com/search?q=${encodeURIComponent(s)}`],
    ['Bing', (s) => `https://www.bing.com/search?q=${encodeURIComponent(s)}`],
    ['DuckDuckGo', (s) => `https://duckduckgo.com/?q=${encodeURIComponent(s)}`],
    ['Yandex', (s) => `https://yandex.com/search/?text=${encodeURIComponent(s)}`],
  ];
  const tokens = (s) => (String(s || '').match(/"[^"]+"|\S+/g) || []);
  const quoteIf = (s) => (/\s/.test(s.trim()) ? `"${s.trim().replace(/"/g, '')}"` : s.trim());

  function buildDork() {
    const f = Object.fromEntries(Object.entries(dkFields).map(([k, el]) => [k, el.value.trim()]));
    const p = [];
    if (f.words) p.push(f.words);
    if (f.exact) p.push(`"${f.exact.replace(/"/g, '')}"`);
    const any = tokens(f.any);
    if (any.length === 1) p.push(any[0]); else if (any.length > 1) p.push(`(${any.join(' OR ')})`);
    tokens(f.none).forEach((w) => p.push(`-${w.replace(/^-/, '')}`));
    if (f.site) p.push(`site:${f.site.replace(/^https?:\/\//, '').replace(/\/$/, '')}`);
    if (f.nosite) p.push(`-site:${f.nosite.replace(/^https?:\/\//, '').replace(/\/$/, '')}`);
    const ft = f.filetype.split(/[\s,]+/).map((x) => x.replace(/^\./, '')).filter(Boolean);
    if (ft.length === 1) p.push(`filetype:${ft[0]}`); else if (ft.length > 1) p.push(`(${ft.map((x) => `filetype:${x}`).join(' OR ')})`);
    if (f.intitle) p.push(`intitle:${quoteIf(f.intitle)}`);
    if (f.inurl) p.push(`inurl:${quoteIf(f.inurl)}`);
    if (f.intext) p.push(`intext:${quoteIf(f.intext)}`);
    if (f.after) p.push(`after:${f.after}`);
    if (f.before) p.push(`before:${f.before}`);
    return p.join(' ');
  }
  function renderDork() {
    const qs = buildDork();
    dkQuery.textContent = qs || 'Fill in a field to build a query';
    dkQuery.classList.toggle('empty', !qs);
    dkEngines.innerHTML = qs
      ? ENGINES.map(([n, u]) => `<a class="btn sm${n === 'Google' ? ' primary' : ' ghost'}" href="${esc(u(qs))}" target="_blank" rel="noopener noreferrer">${icon('external')} ${n}</a>`).join('') +
        `<button type="button" class="btn sm ghost" id="dork-copy">${icon('copy')} Copy</button><span class="small muted">after:, before: and intext: are Google-specific.</span>`
      : '';
  }
  Object.values(dkFields).forEach((el) => el.addEventListener('input', renderDork));
  dkEngines.addEventListener('click', (ev) => { if (ev.target.closest('#dork-copy')) copy(buildDork(), 'Query copied'); });
  $('#dork-clear').addEventListener('click', () => { Object.values(dkFields).forEach((el) => { el.value = ''; }); renderDork(); });
  $('#dork-presets').innerHTML = D.dorkPresets.map((p, i) => `<button type="button" class="chip" data-preset="${i}">${esc(p.name)}</button>`).join('');
  $('#dork-presets').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-preset]');
    if (!b) return;
    const p = D.dorkPresets[+b.dataset.preset];
    const cur = Object.fromEntries(Object.entries(dkFields).map(([k, el]) => [k, el.value.trim()]));
    const keepSite = cur.site;
    Object.values(dkFields).forEach((el) => { el.value = ''; });
    dkFields.site.value = keepSite;
    const patch = p.fn ? p.fn(cur) : p.set;
    Object.entries(patch).forEach(([k, v]) => { if (dkFields[k]) dkFields[k].value = v; });
    renderDork();
    if (p.needs === 'site' && !keepSite) { dkFields.site.focus(); toast('Add a site or domain to target'); }
  });
  renderDork();

  /* =========================================================
     5. Email header analyzer
     ========================================================= */
  const hdrIn = $('#hdr-in');
  const hdrOut = $('#hdr-out');

  function parseHeaders(raw) {
    const lines = raw.replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    for (const line of lines) {
      if (!line.trim()) { if (out.length) break; continue; }
      if (/^[ \t]/.test(line) && out.length) { out[out.length - 1].value += ' ' + line.trim(); continue; }
      const m = line.match(/^([!-9;-~]+):\s*(.*)$/);
      if (m) out.push({ name: m[1], key: m[1].toLowerCase(), value: m[2].trim() });
    }
    return out;
  }
  const addrDomain = (v) => { const m = String(v || '').match(/@([a-z0-9.-]+\.[a-z]{2,})>?\s*$/i) || String(v || '').match(/@([a-z0-9.-]+\.[a-z]{2,})/i); return m ? m[1].toLowerCase() : null; };
  const baseDomain = (d) => (d ? d.split('.').slice(-2).join('.') : d);

  function parseReceived(v) {
    const semi = v.lastIndexOf(';');
    const body = semi >= 0 ? v.slice(0, semi) : v;
    const dateStr = semi >= 0 ? v.slice(semi + 1).trim() : '';
    const pick = (rx) => ((body.match(rx) || [])[1] || '');
    const ips = new Set();
    for (const m of body.matchAll(/\[(?:IPv6:)?([0-9a-f:.]+)\]/gi)) if (A.isIP(m[1])) ips.add(m[1]);
    for (const m of body.matchAll(/\(([^)]*)\)/g)) for (const n of m[1].matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g)) if (A.RX.ipv4.test(n[0])) ips.add(n[0]);
    const ms = Date.parse(dateStr.replace(/\s*\([^)]*\)\s*$/, ''));
    return { from: pick(/\bfrom\s+([^\s;()]+)/i), by: pick(/\bby\s+([^\s;()]+)/i), with: pick(/\bwith\s+([^\s;()]+)/i), ips: Array.from(ips), ms, dateStr };
  }
  function fmtDelay(ms) {
    if (!isFinite(ms)) return '';
    const s = Math.round(ms / 1000);
    const a = Math.abs(s);
    const sign = s < 0 ? '-' : '';
    if (a < 60) return `${s}s`;
    if (a < 3600) return `${sign}${Math.floor(a / 60)}m ${a % 60}s`;
    if (a < 86400) return `${sign}${Math.floor(a / 3600)}h ${Math.floor((a % 3600) / 60)}m`;
    return `${sign}${(a / 86400).toFixed(1)}d`;
  }
  const authCls = (r) => (r === 'pass' ? 'ok' : /fail|softfail|permerror/.test(r) ? 'bad' : 'warn');

  function analyzeHeaders() {
    const hs = parseHeaders(hdrIn.value);
    if (!hs.length) { hdrOut.innerHTML = '<p class="err">No headers found. Paste the raw header block, starting with lines like “Received:”.</p>'; return; }
    const get = (k) => (hs.find((h) => h.key === k) || {}).value || '';
    const all = (k) => hs.filter((h) => h.key === k).map((h) => h.value);

    const hops = all('received').map(parseReceived).reverse();
    const ar = all('authentication-results')[0] || '';
    const auth = {};
    ['spf', 'dkim', 'dmarc'].forEach((k) => { const m = ar.match(new RegExp(`\\b${k}=([a-z]+)`, 'i')); if (m) auth[k] = m[1].toLowerCase(); });
    if (!auth.spf) { const rs = get('received-spf'); if (rs) auth.spf = rs.split(/\s/)[0].toLowerCase(); }

    const from = get('from'), replyTo = get('reply-to'), returnPath = get('return-path'), msgId = get('message-id');
    const fromD = addrDomain(from), rtD = addrDomain(replyTo), rpD = addrDomain(returnPath), midD = addrDomain(msgId);
    const xOrig = (get('x-originating-ip') || get('x-sender-ip')).replace(/[[\]]/g, '').trim();
    const firstPublic = hops.flatMap((h) => h.ips).find((ip) => !A.isPrivateIP(ip));
    const originIP = A.isIP(xOrig) ? xOrig : firstPublic;

    const flags = [];
    ['spf', 'dkim', 'dmarc'].forEach((k) => {
      if (!auth[k]) return;
      if (auth[k] === 'pass') flags.push(flagRow('ok', `<b>${k.toUpperCase()} pass</b>`));
      else flags.push(flagRow(authCls(auth[k]) === 'bad' ? 'bad' : 'warn', `<b>${k.toUpperCase()} ${esc(auth[k])}</b> — ${k === 'dmarc' ? 'the From domain could not be authenticated.' : k === 'spf' ? 'the sending server is not authorised by the envelope domain.' : 'the message signature is missing or invalid.'}`));
    });
    if (!ar && !get('received-spf')) flags.push(flagRow('warn', 'No Authentication-Results header — SPF/DKIM/DMARC outcomes are unknown.'));
    if (fromD && rtD && baseDomain(fromD) !== baseDomain(rtD)) flags.push(flagRow('bad', `<b>Reply-To mismatch</b> — replies go to <code>${esc(rtD)}</code>, not the sender's <code>${esc(fromD)}</code>.`));
    if (fromD && rpD && baseDomain(fromD) !== baseDomain(rpD)) flags.push(flagRow('warn', `Return-Path domain <code>${esc(rpD)}</code> differs from From <code>${esc(fromD)}</code> — normal for mailing services, suspicious otherwise.`));
    if (fromD && midD && baseDomain(fromD) !== baseDomain(midD)) flags.push(flagRow('warn', `Message-ID was generated by <code>${esc(midD)}</code>, not <code>${esc(fromD)}</code>.`));
    const disp = from.match(/^\s*"?([^"<]*)"?\s*</);
    if (disp && /@/.test(disp[1]) && addrDomain(disp[1]) !== fromD) flags.push(flagRow('bad', '<b>Display-name spoofing</b> — the visible name contains a different email address.'));

    const summary = kvRows([
      ['From', from ? esc(from) : null], ['Reply-To', replyTo ? esc(replyTo) : null], ['Return-Path', returnPath ? esc(returnPath) : null],
      ['To', get('to') ? esc(get('to')) : null], ['Subject', get('subject') ? esc(get('subject')) : null], ['Date', get('date') ? esc(get('date')) : null],
      ['Message-ID', msgId ? esc(msgId) : null], ['Origin IP', originIP ? `${pivotBtn(originIP, 'ip')}${xOrig ? ' <span class="muted">(X-Originating-IP)</span>' : ' <span class="muted">(earliest public hop)</span>'}` : null],
      ['Mailer', get('x-mailer') || get('user-agent') ? esc(get('x-mailer') || get('user-agent')) : null],
    ]);
    const authPills = ['spf', 'dkim', 'dmarc'].map((k) => `<span class="pill ${auth[k] ? authCls(auth[k]) : ''}">${k.toUpperCase()} ${esc(auth[k] || 'n/a')}</span>`).join('');

    const hopsHTML = hops.map((h, i) => {
      const delay = i > 0 && isFinite(h.ms) && isFinite(hops[i - 1].ms) ? h.ms - hops[i - 1].ms : NaN;
      const delayCls = !isFinite(delay) ? '' : delay < 0 ? 'warn' : delay > 3600e3 ? 'bad' : delay > 300e3 ? 'warn' : 'ok';
      return `<li class="hop"><span class="hop-n">${i + 1}</span><div class="hop-body">
        <div class="hop-line">${h.from ? `<span class="muted">from</span> ${esc(h.from)} ` : ''}${h.by ? `<span class="muted">by</span> ${esc(h.by)}` : ''}</div>
        <div class="hop-meta">
          ${h.ips.map((ip) => `<span class="pill${A.isPrivateIP(ip) ? '' : ' info'}">${A.isPrivateIP(ip) ? esc(ip) + ' · private' : pivotBtn(ip, 'ip')}</span>`).join('')}
          ${h.with ? `<span class="pill">${esc(h.with)}</span>` : ''}
          ${isFinite(h.ms) ? `<span class="small">${esc(A.fmtUTC(h.ms))}</span>` : ''}
          ${isFinite(delay) ? `<span class="pill ${delayCls} hop-delay">${delay >= 0 ? '+' : ''}${fmtDelay(delay)}</span>` : ''}
        </div></div></li>`;
    }).join('');

    hdrOut.innerHTML = `
      ${flags.length ? `<div class="flags">${flags.join('')}</div>` : ''}
      <div class="panel-box"><h4>Summary <span class="pills">${authPills}</span></h4><table class="kv">${summary}</table></div>
      <div class="panel-box"><h4>Relay path <span class="pill">${hops.length} hop${hops.length === 1 ? '' : 's'} · oldest first</span></h4><div class="pb-body">
        ${hops.length ? `<ol class="hops">${hopsHTML}</ol>` : '<p class="muted">No Received headers.</p>'}
      </div></div>`;
  }
  $('#hdr-go').addEventListener('click', analyzeHeaders);
  $('#hdr-sample').addEventListener('click', () => {
    hdrIn.value = [
      'Delivered-To: analyst@example.org',
      'Received: from mx.example.org (mx.example.org [192.0.2.25])',
      '        by mail.example.org with ESMTPS id 7f3c2a1b',
      '        for <analyst@example.org>; Tue, 13 Oct 2026 07:42:18 -0700 (PDT)',
      'Received: from relay.bulk-mailer.example.net (relay.bulk-mailer.example.net [198.51.100.77])',
      '        by mx.example.org with ESMTP id 4b2a9e10;',
      '        Tue, 13 Oct 2026 14:42:15 +0000',
      'Received: from [10.12.0.8] (unknown [203.0.113.45])',
      '        by relay.bulk-mailer.example.net with ESMTPA id 99c1;',
      '        Tue, 13 Oct 2026 14:41:02 +0000',
      'Authentication-Results: mx.example.org;',
      '       dkim=none;',
      '       spf=softfail (example.org: domain of transitioning billing@example.com does not designate 198.51.100.77 as permitted sender) smtp.mailfrom=billing@example.com;',
      '       dmarc=fail (p=REJECT sp=REJECT dis=QUARANTINE) header.from=example.com',
      'Return-Path: <bounce-7731@bulk-mailer.example.net>',
      'From: "Example Corp Billing" <billing@example.com>',
      'Reply-To: <payments.desk@example.net>',
      'To: analyst@example.org',
      'Subject: Overdue invoice #8812 - action required',
      'Date: Tue, 13 Oct 2026 14:40:57 +0000',
      'Message-ID: <20261013144057.99c1@relay.bulk-mailer.example.net>',
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset="UTF-8"',
      'X-Mailer: PHPMailer 6.8.0',
    ].join('\n');
    analyzeHeaders();
  });

  /* =========================================================
     6. Hash generator
     ========================================================= */
  const hashText = $('#hash-text');
  const hashOut = $('#hash-out');
  let hashToken = 0;

  async function renderHashes(bytes, label) {
    const token = ++hashToken;
    hashOut.innerHTML = loading('Hashing…');
    const buf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const [sha1, sha256, sha512] = await Promise.all(['SHA-1', 'SHA-256', 'SHA-512'].map((a) => digestHex(a, buf).catch(() => null)));
    const md5hex = window.md5(bytes);
    if (token !== hashToken) return;
    const rows = [['MD5', md5hex], ['SHA-1', sha1], ['SHA-256', sha256], ['SHA-512', sha512]];
    hashOut.innerHTML = `${label ? `<p class="small muted">${label}</p>` : ''}<div class="hash-list">${rows.map(([n, h]) => `
      <div class="hash-row"><b>${n}</b>${h ? `<code>${esc(h)}</code>` : '<code class="muted">unavailable — requires HTTPS</code>'}
        <span class="acts">${h ? `<button type="button" class="mini-btn" data-copy="${esc(h)}" title="Copy" aria-label="Copy ${n}">${icon('copy')}</button>` : ''}
        ${h && n !== 'SHA-512' ? `<button type="button" class="mini-btn" data-pivot="${esc(h)}" data-pivot-type="hash" title="Look up" aria-label="Look up ${n}">${icon('search')}</button>` : ''}</span></div>`).join('')}</div>`;
  }
  hashOut.addEventListener('click', (ev) => { const b = ev.target.closest('[data-copy]'); if (b) copy(b.dataset.copy); });
  let hashTimer;
  hashText.addEventListener('input', () => {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      if (!hashText.value) { hashToken++; hashOut.innerHTML = ''; return; }
      const bytes = new TextEncoder().encode(hashText.value);
      renderHashes(bytes, `${bytes.length} bytes of UTF-8 text`);
    }, 150);
  });
  wireDrop($('#hash-drop'), $('#hash-file'), async (file) => {
    if (file.size > 512 * 1024 * 1024) { hashOut.innerHTML = '<p class="err">That file is over 512 MB — too large to hash in the browser.</p>'; return; }
    hashOut.innerHTML = loading(`Reading ${file.name}…`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    renderHashes(bytes, `${esc(file.name)} · ${esc(A.fmtBytes(file.size))}`);
  });
  $$('[data-hash-mode]').forEach((b) => b.addEventListener('click', () => {
    $$('[data-hash-mode]').forEach((x) => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-checked', String(on)); });
    $$('[data-hash-pane]').forEach((p) => { p.hidden = p.dataset.hashPane !== b.dataset.hashMode; });
    hashToken++;
    hashOut.innerHTML = '';
    if (b.dataset.hashMode === 'text' && hashText.value) hashText.dispatchEvent(new Event('input'));
  }));

  /* =========================================================
     7. Encode / decode
     ========================================================= */
  const codecOp = $('#codec-op');
  const codecIn = $('#codec-in');
  const codecOut = $('#codec-out');
  const codecErr = $('#codec-err');
  const te = new TextEncoder();
  const td = new TextDecoder('utf-8', { fatal: false });
  const b64encBytes = (bytes) => { let s = ''; bytes.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
  const b64decBytes = (s) => {
    let t = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (t.length % 4) t += '=';
    const bin = atob(t);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  };
  const OPS = [
    ['b64e', 'Base64 encode', (s) => b64encBytes(te.encode(s))],
    ['b64d', 'Base64 decode (incl. URL-safe)', (s) => td.decode(b64decBytes(s))],
    ['urle', 'URL encode', (s) => encodeURIComponent(s)],
    ['urld', 'URL decode', (s) => decodeURIComponent(s.replace(/\+/g, ' '))],
    ['hexe', 'Hex encode', (s) => Array.from(te.encode(s), (b) => b.toString(16).padStart(2, '0')).join(' ')],
    ['hexd', 'Hex decode', (s) => {
      const h = s.replace(/0x|\\x|[\s:,-]/gi, '');
      if (!/^[0-9a-f]*$/i.test(h) || h.length % 2) throw new Error('Input is not valid hex');
      return td.decode(Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16)));
    }],
    ['jwt', 'JWT decode', (s) => {
      const parts = s.trim().split('.');
      if (parts.length < 2) throw new Error('A JWT has three dot-separated parts');
      const dec = (p) => JSON.parse(td.decode(b64decBytes(p)));
      const header = dec(parts[0]);
      const payload = dec(parts[1]);
      const times = ['iat', 'nbf', 'exp'].filter((k) => typeof payload[k] === 'number').map((k) => `// ${k}: ${A.fmtUTC(payload[k] * 1000)} (${A.relTime(payload[k] * 1000)})`);
      return `// header\n${JSON.stringify(header, null, 2)}\n\n// payload\n${JSON.stringify(payload, null, 2)}${times.length ? '\n\n' + times.join('\n') : ''}\n\n// signature is not verified`;
    }],
    ['rot13', 'ROT13', (s) => s.replace(/[a-z]/gi, (c) => { const b = c <= 'Z' ? 65 : 97; return String.fromCharCode(((c.charCodeAt(0) - b + 13) % 26) + b); })],
    ['htmle', 'HTML entities encode', (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))],
    ['htmld', 'HTML entities decode', (s) => new DOMParser().parseFromString(`<!doctype html><body>${s.replace(/</g, '&lt;')}`, 'text/html').body.textContent],
    ['unid', 'Unicode / \\x escapes decode', (s) => s.replace(/\\u\{([0-9a-f]+)\}|\\u([0-9a-f]{4})|\\x([0-9a-f]{2})/gi, (m, a, b, c) => String.fromCodePoint(parseInt(a || b || c, 16)))],
    ['unie', 'Unicode escape non-ASCII', (s) => Array.from(s, (ch) => { const cp = ch.codePointAt(0); return cp < 128 ? ch : cp > 0xffff ? `\\u{${cp.toString(16)}}` : `\\u${cp.toString(16).padStart(4, '0')}`; }).join('')],
    ['bine', 'Binary encode', (s) => Array.from(te.encode(s), (b) => b.toString(2).padStart(8, '0')).join(' ')],
    ['bind', 'Binary decode', (s) => {
      const bits = s.replace(/[^01]/g, '');
      if (!bits.length || bits.length % 8) throw new Error('Binary input must be a multiple of 8 bits');
      return td.decode(Uint8Array.from(bits.match(/.{8}/g), (x) => parseInt(x, 2)));
    }],
    ['defang', 'Defang URLs, domains & IPs', (s) => A.refang(s)
      .replace(/\b(?:https?|ftp):\/\/[^\s<>"']+/gi, (u) => A.defang(u, 'url'))
      .replace(/\b(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\b/g, (ip) => A.defang(ip, 'ip'))
      .replace(/\b[a-z0-9._%+-]+@(?:[a-z0-9-]+\.)+[a-z]{2,24}\b/gi, (m) => A.defang(m, 'email'))],
    ['refang', 'Refang', (s) => A.refang(s)],
    ['rev', 'Reverse text', (s) => Array.from(s).reverse().join('')],
  ];
  codecOp.innerHTML = OPS.map(([id, label]) => `<option value="${id}">${esc(label)}</option>`).join('');
  codecOp.value = store.get('atlas.codec', 'b64d');
  if (!codecOp.value) codecOp.value = 'b64d';
  function runCodec() {
    const op = OPS.find((o) => o[0] === codecOp.value);
    codecErr.hidden = true;
    if (!codecIn.value) { codecOut.value = ''; return; }
    try { codecOut.value = op[2](codecIn.value); }
    catch (e) { codecOut.value = ''; codecErr.textContent = e && e.message && !/atob|URI malformed/i.test(e.message) ? e.message : 'Input is not valid for this operation.'; codecErr.hidden = false; }
  }
  codecOp.addEventListener('change', () => { store.set('atlas.codec', codecOp.value); runCodec(); });
  codecIn.addEventListener('input', runCodec);
  $('#codec-swap').addEventListener('click', () => { codecIn.value = codecOut.value; runCodec(); codecIn.focus(); });
  $('#codec-copy').addEventListener('click', () => { if (codecOut.value) copy(codecOut.value); });

  /* =========================================================
     8. Time & ID decoder
     ========================================================= */
  const tsIn = $('#ts-in');
  const tsOut = $('#ts-out');
  const sfIn = $('#sf-in');
  const sfOut = $('#sf-out');
  const kvItem = (k, v, dim) => `<div class="kv-item${dim ? ' dim' : ''}"><span>${esc(k)}</span><span>${v}</span></div>`;

  function parseTs(s) {
    s = s.trim();
    if (!s) return null;
    if (/^-?\d+(\.\d+)?$/.test(s)) {
      const n = parseFloat(s);
      const abs = Math.abs(n);
      if (abs < 1e11) return { ms: n * 1000, unit: 'Unix seconds' };
      if (abs < 1e14) return { ms: n, unit: 'Unix milliseconds' };
      if (abs < 1e17) return { ms: n / 1e3, unit: 'Unix microseconds' };
      return { ms: n / 1e6, unit: 'Unix nanoseconds' };
    }
    const p = Date.parse(s);
    if (!isNaN(p)) return { ms: p, unit: 'Date string' };
    return { error: true };
  }
  function renderTs() {
    const r = parseTs(tsIn.value);
    if (!r) { tsOut.innerHTML = ''; return; }
    if (r.error || !isFinite(r.ms) || isNaN(new Date(r.ms))) { tsOut.innerHTML = kvItem('Result', '<span class="err">Unrecognised timestamp or date</span>'); return; }
    const d = new Date(r.ms);
    tsOut.innerHTML = [
      kvItem('Read as', esc(r.unit), true),
      kvItem('UTC', esc(A.fmtUTC(r.ms))),
      kvItem('Local', esc(A.fmtLocal(r.ms))),
      kvItem('ISO 8601', esc(d.toISOString())),
      kvItem('Relative', esc(A.relTime(r.ms))),
      kvItem('Unix (s)', esc(Math.floor(r.ms / 1000))),
      kvItem('Unix (ms)', esc(Math.round(r.ms))),
      kvItem('Weekday', esc(d.toLocaleDateString('en', { weekday: 'long', timeZone: 'UTC' }) + ' (UTC)')),
    ].join('');
  }
  function renderSf() {
    const v = sfIn.value.trim();
    if (!v) { sfOut.innerHTML = ''; return; }
    const rows = A.decodeSnowflake(v);
    if (!rows.length) { sfOut.innerHTML = kvItem('Result', '<span class="err">Enter a numeric ID (up to 20 digits)</span>'); return; }
    sfOut.innerHTML = rows.map((r) => kvItem(r.name, r.plausible ? `${esc(A.fmtUTC(r.ms))}<br><span class="muted small">${esc(A.relTime(r.ms))}</span>` : '<span class="muted">not a plausible ID here</span>', !r.plausible)).join('') +
      `<p class="small muted" style="margin-top:10px">Only the platform the ID came from is meaningful. Use the decoded time to verify when a post was really made.</p>`;
  }
  tsIn.addEventListener('input', renderTs);
  sfIn.addEventListener('input', renderSf);
  $('#ts-now').addEventListener('click', () => { tsIn.value = String(Math.floor(Date.now() / 1000)); renderTs(); });
})();
