/* OSINT Atlas — page shell: theme, navigation, pivot launcher, directory, notebook, method. */
(function () {
  'use strict';

  const A = window.Atlas;
  const D = window.ATLAS_DATA;
  const { $, $$, esc, icon, store, toast, copy } = A;

  /* =========================================================
     Theme
     ========================================================= */
  const root = document.documentElement;
  const themeBtn = $('#theme-toggle');
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const currentTheme = () => root.getAttribute('data-theme') || (mq && mq.matches ? 'dark' : 'light');
  function syncThemeButton() {
    const dark = currentTheme() === 'dark';
    themeBtn.innerHTML = icon(dark ? 'sun' : 'moon');
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    themeBtn.title = dark ? 'Light mode' : 'Dark mode';
  }
  themeBtn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    store.set('atlas.theme', next);
    syncThemeButton();
  });
  if (mq && mq.addEventListener) mq.addEventListener('change', syncThemeButton);
  syncThemeButton();

  /* =========================================================
     Navigation highlighting
     ========================================================= */
  const navLinks = $$('.nav a');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          navLinks.forEach((a) => a.classList.toggle('active', a.dataset.nav === en.target.id));
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    ['pivot', 'toolbox', 'directory', 'notebook', 'method'].forEach((id) => { const el = document.getElementById(id); if (el) io.observe(el); });
  }

  /* =========================================================
     Hero stats
     ========================================================= */
  const pivotLinkCount = Object.values(D.pivots).reduce((n, groups) => n + groups.reduce((m, g) => m + g.items.length, 0), 0);
  $('#hero-stats').innerHTML = [
    [D.tools.length, 'curated tools'],
    [pivotLinkCount, 'pivot links'],
    [Object.keys(D.types).length, 'indicator types'],
    [8, 'in-browser utilities'],
  ].map(([n, l]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join('');

  /* =========================================================
     Pivot launcher
     ========================================================= */
  const pForm = $('#pivot-form');
  const pInput = $('#pivot-input');
  const pType = $('#pivot-type');
  const pBadge = $('#pivot-badge');
  const pOut = $('#pivot-results');

  Object.entries(D.types).forEach(([id, t]) => {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = t.label;
    pType.appendChild(o);
  });

  function updateBadge() {
    const d = A.detect(pInput.value, 'auto');
    pBadge.textContent = d ? D.types[d.guessed].label : 'auto';
    pBadge.classList.toggle('on', !!d);
  }
  pInput.addEventListener('input', updateBadge);

  function linkHTML(item, d) {
    let href;
    try { href = item.url(d); } catch (_) { return ''; }
    const flags = (item.manual ? '<span class="flag manual" title="No deep link — the value is copied so you can paste it">paste</span>' : '') +
      (item.active ? '<span class="flag active" title="Visible to others or the target">active</span>' : '');
    return `<a class="plink" href="${esc(href)}" target="_blank" rel="noopener noreferrer"${item.manual ? ' data-manual="1"' : ''}>
      <b>${esc(item.name)}${flags}</b>${item.desc ? `<small>${esc(item.desc)}</small>` : ''}${icon('external')}</a>`;
  }

  function snowflakeTable(value) {
    const rows = A.decodeSnowflake(value);
    if (!rows.length) return '';
    return `<div class="panel-box"><h4>Decoded creation time</h4><table class="kv">${rows.map((r) =>
      `<tr><th>${esc(r.name)} <span class="muted small">${esc(r.note)}</span></th><td>${r.plausible ? `${esc(A.fmtUTC(r.ms))} <span class="muted">· ${esc(A.relTime(r.ms))}</span>` : '<span class="muted">not plausible for this platform</span>'}</td></tr>`).join('')}</table></div>`;
  }

  function relatedChips(d) {
    const chips = [];
    if (d.type === 'email' && d.ctx.domain) {
      chips.push(['domain', d.ctx.domain]);
      if (d.ctx.local && A.RX.username.test(d.ctx.local)) chips.push(['username', d.ctx.local]);
    }
    if (d.type === 'url' && d.ctx.host) chips.push([d.ctx.hostType || 'domain', d.ctx.host]);
    if (d.type === 'domain') {
      const parts = d.value.split('.');
      if (parts.length > 2) chips.push(['domain', parts.slice(-2).join('.')]);
    }
    if (!chips.length) return '';
    return `<div class="related"><span>Pivot further:</span>${chips.map(([t, v]) =>
      `<button type="button" class="chip" data-pivot="${esc(v)}" data-pivot-type="${esc(t)}">${esc(D.types[t].label)}: ${esc(v)}</button>`).join('')}</div>`;
  }

  let lastResult = null;

  function renderPivot(d, example) {
    const groups = D.pivots[d.type] || [];
    const allLinks = [];
    const groupsHTML = groups.map((g) => {
      const links = g.items.map((it) => {
        try { allLinks.push(`${it.name}: ${it.url(d)}`); } catch (_) { /* skip */ }
        return linkHTML(it, d);
      }).join('');
      return `<div class="group"><h4>${esc(g.group)}</h4><div class="link-grid">${links}</div></div>`;
    }).join('');

    const mismatch = d.guessed !== d.type
      ? `<p class="result-note">${icon('alert')}<span>This looks like a <b>${esc(D.types[d.guessed].label.toLowerCase())}</b>, but you chose <b>${esc(D.types[d.type].label.toLowerCase())}</b>. Some links may not resolve.</span></p>` : '';
    const live = !A.hosted && (d.type === 'domain' || d.type === 'ip')
      ? `<button type="button" class="btn sm primary" data-act="live">${icon('globe')} Live DNS &amp; RDAP</button>` : '';
    const coordsTools = d.type === 'coords'
      ? `<p class="result-note">${icon('pin')}<span>Check the sun angle in SunCalc against shadows in your image to estimate the time it was taken.</span></p>` : '';

    lastResult = { d, allLinks };
    pOut.innerHTML = `<article class="result">
      <div class="result-head">
        <span class="result-type">${esc(D.types[d.type].label)}</span>
        <code class="result-value">${esc(d.value)}</code>${example ? '<span class="pill info">Example — try your own above</span>' : ''}
        <div class="result-actions">
          ${live}
          <button type="button" class="btn sm ghost" data-act="copy">${icon('copy')} Copy</button>
          <button type="button" class="btn sm ghost" data-act="links">${icon('copy')} Copy links</button>
          <button type="button" class="btn sm ghost" data-act="log">${icon('book')} Log to notebook</button>
        </div>
      </div>
      <div class="result-body">
        ${mismatch}
        ${d.type === 'snowflake' ? snowflakeTable(d.value) : ''}
        ${relatedChips(d)}
        ${groupsHTML}
        ${coordsTools}
        <p class="result-note">${icon('alert')}<span>Each link opens a third-party service that will see your query and IP address. Links marked <b>active</b> are visible to others; <b>paste</b> sites have no deep link, so clicking copies the value for you.</span></p>
      </div>
    </article>`;
  }

  function runPivot(raw, forcedType, opts = {}) {
    const d = A.detect(raw, forcedType || pType.value);
    if (!d) { pOut.innerHTML = ''; return; }
    renderPivot(d);
    if (opts.scroll !== false) pOut.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  pForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (!pInput.value.trim()) { pInput.focus(); return; }
    runPivot(pInput.value);
  });

  pOut.addEventListener('click', (ev) => {
    const manual = ev.target.closest('a[data-manual]');
    if (manual && lastResult) { copy(lastResult.d.value, 'Value copied — paste it into the site'); return; }
    const chip = ev.target.closest('[data-pivot]');
    if (chip) { A.pivot(chip.dataset.pivot, chip.dataset.pivotType); return; }
    const btn = ev.target.closest('[data-act]');
    if (!btn || !lastResult) return;
    const { d, allLinks } = lastResult;
    if (btn.dataset.act === 'copy') copy(d.value);
    if (btn.dataset.act === 'links') copy(`${D.types[d.type].label}: ${d.value}\n\n${allLinks.join('\n')}`, `${allLinks.length} links copied`);
    if (btn.dataset.act === 'log') A.logEntity(d.type, d.value, '');
    if (btn.dataset.act === 'live') A.runIntel(d.type === 'domain' || d.type === 'ip' ? d.value : '');
  });

  $$('[data-example]').forEach((b) => b.addEventListener('click', () => {
    pInput.value = b.dataset.example;
    pType.value = 'auto';
    updateBadge();
    runPivot(pInput.value, 'auto', { scroll: false });
  }));

  /** Public: load a value into the pivot launcher and run it. */
  A.pivot = function (value, type) {
    pInput.value = value;
    pType.value = type && D.types[type] ? type : 'auto';
    updateBadge();
    runPivot(value, pType.value, { scroll: false });
    document.getElementById('pivot').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => pOut.scrollIntoView({ behavior: 'smooth', block: 'start' }), 350);
  };

  document.addEventListener('keydown', (ev) => {
    if (ev.key !== '/' || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    const t = ev.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    ev.preventDefault();
    pInput.focus();
    pInput.select();
  });

  /* =========================================================
     Directory
     ========================================================= */
  const dirSearch = $('#dir-search');
  const dirCats = $('#dir-cats');
  const dirAccess = $('#dir-access');
  const dirGrid = $('#dir-grid');
  const dirCount = $('#dir-count');
  const catLabel = Object.fromEntries(D.categories.map((c) => [c.id, c.label]));
  const accLabel = { free: 'Free', freemium: 'Freemium', oss: 'Open source' };
  const dir = { q: '', cat: 'all', access: 'all' };

  dirAccess.innerHTML = D.access.map((a) =>
    `<button type="button" class="seg-btn${a.id === 'all' ? ' active' : ''}" data-access="${a.id}" role="radio" aria-checked="${a.id === 'all'}">${esc(a.label)}</button>`).join('');

  function renderCats() {
    const counts = { all: 0 };
    D.tools.forEach((t) => {
      if (dir.access !== 'all' && t.access !== dir.access) return;
      counts.all++;
      counts[t.cat] = (counts[t.cat] || 0) + 1;
    });
    const cats = [{ id: 'all', label: 'All' }].concat(D.categories);
    dirCats.innerHTML = cats.map((c) =>
      `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${dir.cat === c.id}">${esc(c.label)} <span class="count">${counts[c.id] || 0}</span></button>`).join('');
  }

  function renderDir() {
    const terms = dir.q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = D.tools.filter((t) => {
      if (dir.cat !== 'all' && t.cat !== dir.cat) return false;
      if (dir.access !== 'all' && t.access !== dir.access) return false;
      if (!terms.length) return true;
      const hay = `${t.name} ${t.desc} ${catLabel[t.cat]} ${A.hostOf(t.url)} ${accLabel[t.access]}`.toLowerCase();
      return terms.every((w) => hay.includes(w));
    });
    dirCount.textContent = `${list.length} of ${D.tools.length} tools`;
    dirGrid.innerHTML = list.length ? list.map((t) => `
      <a class="tool-card" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">
        <div class="tc-top"><span class="tc-name">${esc(t.name)}</span>${icon('external')}</div>
        <div class="tc-host">${esc(A.hostOf(t.url))}</div>
        <p class="tc-desc">${esc(t.desc)}</p>
        <div class="tc-tags"><span class="tag">${esc(catLabel[t.cat])}</span><span class="tag acc-${t.access}">${esc(accLabel[t.access])}</span></div>
      </a>`).join('')
      : `<div class="dir-empty">No tools match “${esc(dir.q)}”. Try a broader term or another category.</div>`;
  }

  dirSearch.addEventListener('input', () => { dir.q = dirSearch.value.trim(); renderDir(); });
  dirCats.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-cat]');
    if (!b) return;
    dir.cat = b.dataset.cat;
    renderCats();
    renderDir();
  });
  dirAccess.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-access]');
    if (!b) return;
    dir.access = b.dataset.access;
    $$('[data-access]', dirAccess).forEach((x) => { const on = x === b; x.classList.toggle('active', on); x.setAttribute('aria-checked', on); });
    renderCats();
    renderDir();
  });
  renderCats();
  renderDir();

  /* =========================================================
     Notebook
     ========================================================= */
  const NB_KEY = 'atlas.case.v1';
  const nb = Object.assign({ title: '', entities: [], notes: '' }, store.get(NB_KEY, {}));
  if (!Array.isArray(nb.entities)) nb.entities = [];
  const nbTitle = $('#nb-title');
  const nbType = $('#nb-type');
  const nbValue = $('#nb-value');
  const nbNote = $('#nb-note');
  const nbRows = $('#nb-rows');
  const nbEmpty = $('#nb-empty');
  const nbNotes = $('#nb-notes');
  const nbSaved = $('#nb-saved');

  if (!store.ok) $('#nb-storage-warn').hidden = false;

  const nbTypes = Object.entries(D.types).map(([id, t]) => [id, t.label]).concat([['person', 'Person'], ['org', 'Organisation'], ['source', 'Source / URL'], ['other', 'Other']]);
  const nbTypeLabel = Object.fromEntries(nbTypes);
  nbType.innerHTML = nbTypes.map(([id, l]) => `<option value="${id}">${esc(l)}</option>`).join('');

  let saveTimer;
  function saveNB(immediate) {
    clearTimeout(saveTimer);
    const run = () => {
      store.set(NB_KEY, nb);
      nbSaved.textContent = store.ok ? `Saved ${new Date().toLocaleTimeString()}` : 'Not saved — storage unavailable';
    };
    if (immediate) run(); else saveTimer = setTimeout(run, 400);
  }

  function renderNB() {
    nbTitle.value = nb.title;
    nbNotes.value = nb.notes;
    nbEmpty.hidden = nb.entities.length > 0;
    nbRows.innerHTML = nb.entities.map((en) => {
      const canPivot = !!D.types[en.type];
      return `<tr data-id="${esc(en.id)}">
        <td><span class="pill">${esc(nbTypeLabel[en.type] || en.type)}</span></td>
        <td class="v">${esc(en.value)}</td>
        <td class="note">${esc(en.note || '')}</td>
        <td class="t" title="${esc(new Date(en.ts).toISOString())}">${esc(new Date(en.ts).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }))}</td>
        <td class="a">
          ${canPivot ? `<button type="button" class="mini-btn" data-nb="pivot" title="Pivot on this" aria-label="Pivot on ${esc(en.value)}">${icon('search')}</button>` : ''}
          <button type="button" class="mini-btn" data-nb="copy" title="Copy" aria-label="Copy ${esc(en.value)}">${icon('copy')}</button>
          <button type="button" class="mini-btn del" data-nb="del" title="Remove" aria-label="Remove ${esc(en.value)}">${icon('trash')}</button>
        </td></tr>`;
    }).join('');
  }

  function addEntity(type, value, note) {
    value = String(value || '').trim();
    if (!value) return false;
    const dupe = nb.entities.find((x) => x.type === type && x.value === value);
    if (dupe) { toast('Already in the notebook'); return false; }
    nb.entities.unshift({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7), type, value, note: note || '', ts: Date.now() });
    saveNB(true);
    renderNB();
    return true;
  }

  /** Public: add an entity from anywhere in the app. */
  A.logEntity = function (type, value, note) {
    if (addEntity(D.types[type] || nbTypeLabel[type] ? type : 'other', value, note)) toast('Logged to notebook');
  };

  $('#nb-add').addEventListener('submit', (ev) => {
    ev.preventDefault();
    let type = nbType.value;
    if (addEntity(type, nbValue.value, nbNote.value.trim())) {
      nbValue.value = '';
      nbNote.value = '';
      nbValue.focus();
    }
  });
  // Auto-pick the type as the user types a value, unless they already chose one.
  let nbTypeTouched = false;
  nbType.addEventListener('change', () => { nbTypeTouched = true; });
  nbValue.addEventListener('input', () => {
    if (nbTypeTouched) return;
    const d = A.detect(nbValue.value, 'auto');
    if (d && d.guessed !== 'keyword' && d.guessed !== 'username') nbType.value = d.guessed;
  });

  nbRows.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-nb]');
    if (!b) return;
    const id = b.closest('tr').dataset.id;
    const en = nb.entities.find((x) => x.id === id);
    if (!en) return;
    if (b.dataset.nb === 'del') { nb.entities = nb.entities.filter((x) => x.id !== id); saveNB(true); renderNB(); }
    if (b.dataset.nb === 'copy') copy(en.value);
    if (b.dataset.nb === 'pivot') A.pivot(en.value, en.type);
  });
  nbTitle.addEventListener('input', () => { nb.title = nbTitle.value; saveNB(); });
  nbNotes.addEventListener('input', () => { nb.notes = nbNotes.value; saveNB(); });

  const slug = () => (nb.title || 'case').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'case';
  $('#nb-export-json').addEventListener('click', () => {
    A.download(`${slug()}.json`, JSON.stringify({ app: 'osint-atlas', version: 1, exported: new Date().toISOString(), ...nb }, null, 2), 'application/json');
  });
  $('#nb-export-md').addEventListener('click', () => {
    const cell = (s) => String(s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    const lines = [
      `# ${nb.title || 'Untitled case'}`, '',
      `_Exported from OSINT Atlas on ${new Date().toISOString()}_`, '',
      '## Entities', '',
    ];
    if (nb.entities.length) {
      lines.push('| Type | Value | Note | Added (UTC) |', '| --- | --- | --- | --- |');
      nb.entities.forEach((en) => lines.push(`| ${cell(nbTypeLabel[en.type] || en.type)} | \`${cell(en.value)}\` | ${cell(en.note)} | ${cell(A.fmtUTC(en.ts))} |`));
    } else {
      lines.push('_None recorded._');
    }
    lines.push('', '## Notes', '', nb.notes || '_No notes._', '');
    A.download(`${slug()}.md`, lines.join('\n'), 'text/markdown');
  });
  $('#nb-import').addEventListener('change', async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || !Array.isArray(data.entities)) throw new Error('missing entities');
      const clean = data.entities
        .filter((x) => x && typeof x.value === 'string' && typeof x.type === 'string')
        .map((x) => ({ id: String(x.id || Math.random().toString(36).slice(2)), type: x.type.slice(0, 32), value: x.value.slice(0, 2000), note: String(x.note || '').slice(0, 2000), ts: Number(x.ts) || Date.now() }));
      nb.title = typeof data.title === 'string' ? data.title : nb.title;
      nb.notes = typeof data.notes === 'string' ? data.notes : nb.notes;
      nb.entities = clean;
      saveNB(true);
      renderNB();
      toast(`Imported ${clean.length} entities`);
    } catch (_) {
      toast('That file is not an OSINT Atlas case export');
    }
  });
  // Two-step clear: the first click arms the button, a second click within 4 s clears the case.
  const clearBtn = $('#nb-clear');
  let clearTimer = null;
  function disarmClear() {
    clearTimeout(clearTimer);
    clearTimer = null;
    clearBtn.classList.remove('armed');
    clearBtn.innerHTML = `${icon('trash')} Clear`;
  }
  clearBtn.addEventListener('click', () => {
    if (!nb.entities.length && !nb.notes && !nb.title) { toast('The notebook is already empty'); return; }
    if (!clearTimer) {
      clearBtn.classList.add('armed');
      clearBtn.innerHTML = `${icon('trash')} Click again to clear`;
      clearTimer = setTimeout(disarmClear, 4000);
      return;
    }
    disarmClear();
    nb.title = ''; nb.notes = ''; nb.entities = [];
    saveNB(true);
    renderNB();
    toast('Case cleared');
  });
  renderNB();

  // Where page-started downloads are blocked and no save prompt is available, exports copy instead.
  if (A.hosted) {
    A.downloadsReady.then((dl) => {
      if (dl) return;
      $('#nb-export-md').innerHTML = `${icon('copy')} Copy Markdown`;
      $('#nb-export-json').innerHTML = `${icon('copy')} Copy JSON`;
    });
  }

  /* =========================================================
     OPSEC checklist
     ========================================================= */
  const OPSEC_KEY = 'atlas.opsec.v1';
  const opsecState = store.get(OPSEC_KEY, {}) || {};
  const opsecList = $('#opsec-list');
  const opsecProgress = $('#opsec-progress');
  opsecList.innerHTML = D.opsec.map(([k, text]) =>
    `<li><label><input type="checkbox" data-k="${k}"${opsecState[k] ? ' checked' : ''}><span>${esc(text)}</span></label></li>`).join('');
  function opsecCount() {
    const done = D.opsec.filter(([k]) => opsecState[k]).length;
    opsecProgress.textContent = `${done} / ${D.opsec.length} done`;
  }
  opsecList.addEventListener('change', (ev) => {
    const k = ev.target.dataset.k;
    if (!k) return;
    opsecState[k] = ev.target.checked;
    store.set(OPSEC_KEY, opsecState);
    opsecCount();
  });
  opsecCount();

  /* deep link: #q=<value> runs a pivot on load */
  /* otherwise open with a worked example so the first view shows what the launcher does */
  const m = location.hash.match(/^#q=(.+)$/);
  let deepLinked = false;
  if (m) {
    try { A.pivot(decodeURIComponent(m[1])); deepLinked = true; } catch (_) { /* malformed */ }
  }
  if (!deepLinked) renderPivot(A.detect('wikipedia.org', 'auto'), true);
})();
