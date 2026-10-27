'use strict';
// DOM side: HUD, banners, level-up cards, pause and end-of-dive panels.
// HUD writes are cached so the DOM is only touched when a value changes.

const UI = (() => {
  const $ = id => document.getElementById(id);
  const el = {};
  const cache = Object.create(null);
  let cardLockUntil = 0, choices = [], toastTimer = 0;
  const HEART = '<svg viewBox="0 0 22 20"><path d="M11 18.5C4.6 14 1.5 10.6 1.5 6.6 1.5 3.8 3.7 1.6 6.4 1.6c1.9 0 3.6 1 4.6 2.6 1-1.6 2.7-2.6 4.6-2.6 2.7 0 4.9 2.2 4.9 5 0 4-3.1 7.4-9.5 11.9z"/></svg>';

  function set(key, node, value, prop = 'textContent') {
    if (cache[key] === value) return;
    cache[key] = value;
    node[prop] = value;
  }

  function init() {
    for (const id of ['hud', 'hearts', 'lvl', 'zoneName', 'depth', 'bossbar', 'bossName', 'bossLatin', 'bossFill', 'score', 'combo',
      'gTrack', 'gFill', 'gMark', 'rPress', 'rTemp', 'rTime', 'dashPip', 'abFlare', 'flareFill', 'xpFill', 'toast', 'banner',
      'bnEyebrow', 'bnTitle', 'bnLine', 'touchUI', 'stick', 'knob', 'tbDash', 'tbFlare', 'tbPause', 'title', 'diveplan',
      'bestLine', 'levelup', 'luEyebrow', 'luTitle', 'luSub', 'cards', 'pause', 'pauseEyebrow', 'tSfx', 'tMusic', 'tShake',
      'tAim', 'buildList', 'over', 'overEyebrow', 'overTitle', 'overLine', 'overRecord', 'overStats']) el[id] = $(id);

    $('btnStart').addEventListener('click', () => Game.start());
    $('btnResume').addEventListener('click', () => Game.resume());
    $('btnRestart').addEventListener('click', () => Game.start());
    $('btnQuit').addEventListener('click', () => Game.toTitle());
    $('btnAgain').addEventListener('click', () => Game.start());
    $('btnMenu').addEventListener('click', () => Game.toTitle());
    el.tSfx.addEventListener('click', () => { Sound.ensure(); Sound.setSfx(!Sound.sfxOn); syncToggles(); });
    el.tMusic.addEventListener('click', () => { Sound.ensure(); Sound.setMusic(!Sound.musicOn); syncToggles(); });
    el.tShake.addEventListener('click', () => { Settings.shake = !Settings.shake; store.set('shake', Settings.shake); syncToggles(); });
    el.tAim.addEventListener('click', () => { Settings.autoAim = !Settings.autoAim; store.set('autoAim', Settings.autoAim); syncToggles(); });
    document.addEventListener('click', e => { if (e.target.closest('button')) Sound.tick(); });

    buildGauge();
    refreshTitle();
    syncToggles();
  }

  // Depth gauge uses a square-root scale so the shallow zones stay legible.
  const gaugePos = d => Math.sqrt(clamp(d / BOTTOM, 0, 1)) * 100;
  function buildGauge() {
    const marks = [
      [200, '200'], [1000, '1,000', 'angler'], [4000, '4,000', 'squid'], [6000, '6,000', 'oarfish'], [BOTTOM, '10,935', 'maw'],
    ];
    for (const [d, label, boss] of marks) {
      const t = document.createElement('div');
      t.className = 'g-tick' + (boss ? ' boss' : '');
      if (boss) t.dataset.boss = boss;
      t.style.top = gaugePos(d) + '%';
      t.textContent = label;
      el.gTrack.appendChild(t);
    }
  }

  function refreshTitle() {
    const best = store.get('best', null);
    if (best && best.depth > 0) {
      el.bestLine.innerHTML = `Deepest dive <b>${fmtInt(best.depth)} m</b> · best score <b>${fmtInt(best.score)}</b>`;
    } else {
      el.bestLine.textContent = 'No dives logged yet';
    }
    const seen = store.get('seen', []);
    const rows = [
      { d: 0, name: 'Sunlight Zone', sci: 'Epipelagic' },
      { d: 200, name: 'Twilight Zone', sci: 'Mesopelagic' },
      { d: 1000, name: 'Midnight Zone', sci: 'Bathypelagic', boss: 'angler' },
      { d: 4000, name: 'The Abyss', sci: 'Abyssopelagic', boss: 'squid' },
      { d: 6000, name: 'The Trenches', sci: 'Hadopelagic', boss: 'oarfish' },
      { d: BOTTOM, name: 'Challenger Deep', sci: 'Mariana Trench', boss: 'maw', last: true },
    ];
    el.diveplan.innerHTML = rows.map(r => {
      const known = r.boss && seen.includes(r.boss);
      const boss = r.boss ? `<span class="dp-boss${known ? '' : ' unknown'}">${known ? 'Guarded by: ' + BOSSES[r.boss].name : 'Unidentified sonar contact'}</span>` : '';
      return `<li${r.last ? ' class="last"' : ''}><span class="dp-depth">${fmtInt(r.d)} m</span><span class="dp-name">${r.name}</span><span class="dp-sci">${r.sci}</span>${boss}</li>`;
    }).join('');
  }

  function syncToggles() {
    el.tSfx.setAttribute('aria-pressed', String(Sound.sfxOn));
    el.tMusic.setAttribute('aria-pressed', String(Sound.musicOn));
    el.tShake.setAttribute('aria-pressed', String(Settings.shake));
    el.tAim.setAttribute('aria-pressed', String(Settings.autoAim));
  }

  function showOnly(name) {
    for (const s of ['title', 'levelup', 'pause', 'over']) el[s].hidden = s !== name;
    el.hud.hidden = name === 'title' || name === 'over';
    document.body.classList.toggle('playing', name === null);
    document.body.classList.toggle('menu', name !== null);
  }

  // ---- Banners ----
  function banner(eyebrow, title, line, boss) {
    el.bnEyebrow.textContent = eyebrow;
    el.bnTitle.textContent = title;
    el.bnLine.textContent = line;
    el.banner.classList.toggle('boss', !!boss);
    el.banner.classList.remove('show');
    void el.banner.offsetWidth;
    el.banner.classList.add('show');
  }
  function zoneBanner(z) {
    banner(`${z.sci} · ${fmtInt(z.from)} m`, z.name, z.line, false);
  }
  function bossWarning(b) {
    banner(`Sonar contact · ${fmtInt(G.depth)} m`, b.name, b.latin, true);
  }
  function toast(text) {
    el.toast.textContent = text;
    el.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.toast.classList.remove('show'), 2600);
  }

  // ---- Level up ----
  function showLevelUp(list, pearl) {
    choices = list;
    el.luEyebrow.textContent = pearl ? 'A pearl from the deep' : `Level ${G.level - G.pending + 1}`;
    el.luTitle.textContent = pearl ? 'A rare adaptation' : 'Adapt';
    el.luSub.textContent = Input.mode === 'touch' ? 'Choose one. Tap a card.' : Input.mode === 'pad' ? 'Choose one with the d-pad and A.' : 'Choose one. Press 1, 2 or 3, or click a card.';
    el.cards.innerHTML = '';
    list.forEach((u, i) => {
      const lv = G.player.lv[u.id] || 0;
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'card';
      card.dataset.cat = u.cat;
      let pips = '';
      if (Number.isFinite(u.max)) for (let k = 0; k < u.max; k++) pips += `<i class="${k < lv ? 'on' : k === lv ? 'next' : ''}"></i>`;
      card.innerHTML = `<span class="card-top"><span class="card-cat">${CATS[u.cat]}${lv === 0 && Number.isFinite(u.max) ? ' · New' : ''}</span><span class="card-key">${i + 1}</span></span>`
        + `<span class="card-name">${u.name}</span><span class="card-desc">${u.desc(lv + 1)}</span><span class="card-pips">${pips}</span>`;
      card.addEventListener('click', () => pickCard(i));
      el.cards.appendChild(card);
    });
    showOnly('levelup');
    cardLockUntil = performance.now() + 380;
    if (Input.mode !== 'touch') setTimeout(() => { if (!el.levelup.hidden) el.cards.firstChild?.focus({ preventScroll: true }); }, 400);
  }
  function pickCard(i) {
    if (performance.now() < cardLockUntil || !choices[i] || G.state !== 'levelup') return;
    Game.choose(choices[i]);
  }

  // ---- Pause ----
  function showPause() {
    el.pauseEyebrow.textContent = `Paused · ${fmtInt(G.depth)} m · ${ZONES[G.zone].name}`;
    const owned = UPGRADES.filter(u => G.player.lv[u.id] > 0);
    el.buildList.innerHTML = owned.length
      ? owned.map(u => `<li><span>${u.name}</span><span>${G.player.lv[u.id]}/${u.max}</span></li>`).join('')
      : '<li class="empty">None yet. Collect plankton to level up.</li>';
    syncToggles();
    showOnly('pause');
    if (Input.mode !== 'touch') $('btnResume').focus({ preventScroll: true });
  }

  // ---- End of dive ----
  function showEnd(won, record) {
    const z = ZONES[G.zone];
    if (won) {
      el.overEyebrow.textContent = 'Mariana Trench · 10,935 m';
      el.overTitle.textContent = 'Challenger Deep';
      el.overLine.textContent = 'You reached the deepest point on Earth, carrying your own light the whole way down.';
    } else {
      el.overEyebrow.textContent = `${z.sci} · ${z.name}`;
      el.overTitle.textContent = `Lost at ${fmtInt(G.depth)} m`;
      const next = BOSS_AT.find(b => b.depth > G.depth);
      el.overLine.textContent = G.boss && !G.boss.dying
        ? `The ${G.boss.name.toLowerCase()} got you.`
        : next ? `${fmtInt(next.depth - G.depth)} m short of the next guardian.` : '';
    }
    el.overRecord.hidden = !record;
    const stats = [
      ['Depth', `${fmtInt(G.depth)} m`], ['Dive time', fmtTime(G.time)], ['Level', G.level],
      ['Kills', fmtInt(G.kills)], ['Best chain', fmtInt(G.bestCombo)], ['Score', fmtInt(G.score)],
    ];
    el.overStats.innerHTML = stats.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
    showOnly('over');
    refreshTitle();
    if (Input.mode !== 'touch') setTimeout(() => $('btnAgain').focus({ preventScroll: true }), 50);
  }

  // ---- Menu navigation with arrows / d-pad ----
  function navigate(inp) {
    const open = ['levelup', 'pause', 'over', 'title'].find(s => !el[s].hidden);
    if (!open) return;
    if (open === 'levelup' && inp.pick) { pickCard(inp.pick - 1); return; }
    const items = [...el[open].querySelectorAll('button')].filter(b => b.offsetParent !== null);
    if (!items.length) return;
    const idx = items.indexOf(document.activeElement);
    const step = (inp.right || inp.down) ? 1 : (inp.left || inp.up) ? -1 : 0;
    if (step) {
      const next = items[(idx < 0 ? 0 : idx + step + items.length) % items.length];
      next.focus({ preventScroll: true });
    }
    if (inp.mode === 'pad' && inp.confirm && idx >= 0) items[idx].click();
    else if (inp.confirm && idx < 0) items[0].click();
  }

  // ---- HUD ----
  function update(inp) {
    navigate(inp);
    const P = G.player;
    const touch = inp.mode === 'touch';
    document.body.classList.toggle('touch', touch);
    const showTouch = touch && (G.state === 'play');
    el.touchUI.hidden = !showTouch;
    if (showTouch) {
      const s = Input.stick;
      el.stick.hidden = s.id === null;
      if (s.id !== null) {
        el.stick.style.left = s.ox + 'px'; el.stick.style.top = s.oy + 'px';
        el.knob.style.transform = `translate(${s.x - s.ox}px, ${s.y - s.oy}px)`;
      }
      el.tbFlare.classList.toggle('ready', G.flare >= 100);
    }
    if (el.hud.hidden || !P) return;

    const hk = `${P.hp}/${P.maxHp}`;
    if (cache.hearts !== hk) {
      const prev = cache.hearts ? Number(cache.hearts.split('/')[0]) : P.hp;
      cache.hearts = hk;
      let h = '';
      for (let i = 0; i < P.maxHp; i++) h += `<span class="${i < P.hp ? 'full' : 'empty'}">${HEART}</span>`;
      el.hearts.innerHTML = h;
      if (P.hp < prev) { el.hearts.classList.remove('hit'); void el.hearts.offsetWidth; el.hearts.classList.add('hit'); }
    }
    set('lvl', el.lvl, String(G.level));
    set('zone', el.zoneName, G.boss ? 'Sonar contact' : ZONES[G.zone].name);
    set('depth', el.depth, fmtInt(G.depth));
    set('score', el.score, fmtInt(G.score));
    const comboText = G.combo >= 5 ? `×${G.mult.toFixed(1)} · ${G.combo} chain` : '';
    set('combo', el.combo, comboText);
    set('comboHot', el.combo, G.mult > 1 ? 'combo hot' : 'combo', 'className');

    const b = G.boss;
    set('bossOn', el.bossbar, !b, 'hidden');
    if (b) {
      set('bossName', el.bossName, b.name);
      set('bossLatin', el.bossLatin, b.latin);
      const k = clamp(b.hp / b.maxHp, 0, 1).toFixed(3);
      set('bossFill', el.bossFill.style, `scaleX(${k})`, 'transform');
    }

    const gp = gaugePos(G.depth).toFixed(2) + '%';
    set('gMark', el.gMark.style, gp, 'top');
    set('gFill', el.gFill.style, gp, 'height');
    set('rPress', el.rPress, fmtInt(pressureAtm(G.depth)));
    set('rTemp', el.rTemp, curve(TEMP, G.depth).toFixed(1));
    set('rTime', el.rTime, fmtTime(G.time));
    if (cache.beaten !== G.bossIdx) {
      cache.beaten = G.bossIdx;
      el.gTrack.querySelectorAll('.g-tick.boss').forEach(t => {
        const i = BOSS_AT.findIndex(x => x.kind === t.dataset.boss);
        t.classList.toggle('done', i < G.bossesBeaten);
      });
    }

    set('dash', el.dashPip, P.dashCd <= 0 ? 'dash-pip on' : 'dash-pip', 'className');
    set('flare', el.flareFill.style, `${G.flare.toFixed(1)}%`, 'width');
    set('flareReady', el.abFlare, G.flare >= 100 ? 'ability flare-ab ready' : 'ability flare-ab', 'className');
    set('xp', el.xpFill.style, `${(G.xp / G.xpNext * 100).toFixed(1)}%`, 'width');
  }

  return { init, showOnly, zoneBanner, bossWarning, toast, showLevelUp, showPause, showEnd, update, refreshTitle, syncToggles };
})();
