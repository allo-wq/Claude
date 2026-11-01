/*!
 * Zadbox hero animation
 * One deterministic GSAP master timeline (seekable to any moment), plus a
 * one-time intro. Exposes window.ZadboxHero for chapter control and export.
 */
(function () {
  'use strict';

  var root = document.getElementById('zadbox-hero');
  if (!root || !window.gsap) return;

  var gsap = window.gsap;
  var stage = root.querySelector('.zb-stage');
  var panel = root.querySelector('.zb-panel');
  var $ = function (s, c) { return (c || root).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || root).querySelectorAll(s)); };

  var PURPLE = '#673F9D';
  var PURPLE_SOFT = '#A38BC3';
  var INK = '#211B2A';
  var WHITE = '#FFFFFF';

  /* Chapter boundaries (seconds on the master timeline) */
  var CHAPTERS = [0, 8.35, 16.6];
  var END = 22.6;
  /* Frames shown for each chapter when motion is reduced */
  var POSTERS = [7.4, 15.8, 21.2];
  /* The master timeline starts this far into the intro */
  var HANDOFF = 1.0;

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ------------------------------------------------------------------ */
  /* Layout: fixed design canvas, scaled as one unit                     */
  /* ------------------------------------------------------------------ */
  var DESIGN = { landscape: [1280, 720], portrait: [420, 747] };

  function layout() {
    var W = root.clientWidth;
    var fit = root.getAttribute('data-fit') || 'width';
    var H = fit === 'contain' ? root.clientHeight : 0;
    var mode = W >= 760 && (fit !== 'contain' || W / Math.max(H, 1) >= 0.9) ? 'landscape' : 'portrait';
    if (stage.getAttribute('data-layout') !== mode) stage.setAttribute('data-layout', mode);
    var d = DESIGN[mode];
    var s = W / d[0];
    if (fit === 'contain' && H) s = Math.min(s, H / d[1]);
    var x = (W - d[0] * s) / 2;
    var y = fit === 'contain' && H ? (H - d[1] * s) / 2 : 0;
    stage.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
    if (fit !== 'contain') root.style.height = d[1] * s + 'px';
  }

  /* ------------------------------------------------------------------ */
  /* Headline → word masks                                               */
  /* ------------------------------------------------------------------ */
  var headline = $('.zb-headline');
  var lines = headline.innerHTML.split(/<br\s*\/?>/i).map(function (l) {
    var d = document.createElement('div'); d.innerHTML = l; return d.textContent.trim();
  });
  headline.setAttribute('aria-label', lines.join(' '));
  headline.innerHTML = lines.map(function (line) {
    return line.split(/\s+/).map(function (w) {
      return '<span class="zb-w" aria-hidden="true"><span>' + w + '</span></span>';
    }).join(' ');
  }).join('<br>');

  /* ------------------------------------------------------------------ */
  /* Elements                                                            */
  /* ------------------------------------------------------------------ */
  var E = {
    blobs: $$('.zb-blob'),
    brand: $('.zb-brand'),
    words: $$('.zb-w > span'),
    eyebrows: $$('.zb-eyebrow'),
    captions: $$('.zb-caption'),
    controls: $('.zb-controls'),
    panel: panel,
    headerItems: $$('.zb-hd-item'),
    tabs: $('.zb-tabs'),
    ind: $('.zb-tabs__ind'),
    tab1: $('.zb-tab--order'),
    tab2: $('.zb-tab--sub'),
    cartBtn: $('.zb-cart-btn'),
    badge: $('.zb-badge'),
    viewport: $('.zb-viewport'),

    orderScene: $('.zb-scene--order'),
    orderScroll: $('.zb-scene--order .zb-scroll'),
    orderItems: $$('.zb-o-item'),
    cats: $$('.zb-cat'),
    cards: $$('.zb-card'),
    adds: $$('.zb-add'),
    cartbar: $('.zb-cartbar'),
    items: $('.zb-cartbar__items'),
    total: $('.zb-cartbar__total'),
    cont: $('.zb-continue'),

    subScene: $('.zb-scene--sub'),
    subScroll: $('.zb-scene--sub .zb-scroll'),
    subItems: $$('.zb-s-item'),
    plan: $('.zb-plan'),
    macros: $$('[data-macro]'),
    durItems: $$('.zb-d-item'),
    durPick: $('.zb-dur--pick'),
    durSel: $('.zb-dur--pick .zb-dur__sel'),
    weekItems: $$('.zb-w-item'),
    swapDay: $('.zb-day--swap .zb-day__img'),
    swapA: $('.zb-swap-a'),
    swapB: $('.zb-swap-b'),
    notice: $('.zb-notice'),

    revScene: $('.zb-scene--rev'),
    revItems: $$('.zb-r-item'),
    stars: $$('.zb-star'),
    revCards: $$('.zb-review'),
    revTrack: $('.zb-reviews__track'),
    contact: $('.zb-contact'),
    waRing: $('.zb-wa__ring'),

    tap: $('.zb-tap'),
    ripple: $('.zb-tap__ripple'),
    fly1: $('.zb-fly--1'),
    fly2: $('.zb-fly--2'),
    scrim: $('.zb-scrim'),
    sheet: $('.zb-sheet'),
    sheetFill: $('.zb-sheet__fill'),
    clockHand: $('.zb-clock-hand'),

    chapterBtns: $$('.zb-chapter'),
    chapterFills: $$('.zb-chapter__fill'),
    toggle: $('.zb-toggle')
  };

  /* Layout position of an element inside the panel (transform-independent) */
  function pos(el) {
    var x = 0, y = 0, n = el;
    while (n && n !== panel) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
    return { x: x, y: y, w: el.offsetWidth, h: el.offsetHeight, cx: x + el.offsetWidth / 2, cy: y + el.offsetHeight / 2 };
  }

  /* Sound cues: every audible event, in master-timeline seconds (used by tools/render-audio.cjs) */
  var CUES = [];
  function cue(type, t, data) {
    var c = { type: type, t: Math.round(t * 10000) / 10000 };
    if (data) for (var k in data) c[k] = data[k];
    CUES.push(c);
  }

  /* Text values driven by the timeline (read every frame) */
  var S = { badge: 0, items: 0, total: 0, cal0: 0, cal1: 0, pro0: 0, pro1: 0, carb0: 0, carb1: 0, fat0: 0, fat1: 0 };
  var last = {};
  function put(el, key, val) { if (last[key] !== val) { last[key] = val; el.textContent = val; } }
  function syncText() {
    var r = Math.round;
    put(E.badge, 'badge', String(r(S.badge)));
    var n = r(S.items);
    put(E.items, 'items', n + (n === 1 ? ' item' : ' items'));
    put(E.total, 'total', r(S.total).toFixed(2) + ' SAR');
    put(E.macros[0], 'cal', r(S.cal0) + '–' + r(S.cal1) + ' kcal');
    put(E.macros[1], 'pro', r(S.pro0) + '–' + r(S.pro1) + ' g');
    put(E.macros[2], 'carb', r(S.carb0) + '–' + r(S.carb1) + ' g');
    put(E.macros[3], 'fat', r(S.fat0) + '–' + r(S.fat1) + ' g');
  }

  /* ------------------------------------------------------------------ */
  /* Master timeline                                                     */
  /* ------------------------------------------------------------------ */
  function buildMaster() {
    var tl = gsap.timeline({ paused: true, repeat: -1 });
    CUES.length = 0;
    var out = 'power3.out', inOut = 'power2.inOut', exit = 'power2.in';

    /* measure everything before any transform is applied */
    var P = {
      add1: pos(E.adds[0]), add2: pos(E.adds[1]),
      img1: pos(E.cards[0].querySelector('.zb-card__img')),
      img2: pos(E.cards[1].querySelector('.zb-card__img')),
      cart: pos(E.cartBtn), cont: pos(E.cont), tab2: pos(E.tab2),
      dur: pos(E.durPick), swap: pos(E.swapDay)
    };
    var VH = E.viewport.clientHeight;
    var barH = E.cartbar.offsetHeight;
    var lastCard = E.cards[E.cards.length - 1];
    var S1 = Math.max(0, pos(lastCard).y + lastCard.offsetHeight + 12 - pos(E.viewport).y - (VH - barH));
    var S2 = Math.max(0, pos(E.notice).y + E.notice.offsetHeight + 16 - pos(E.viewport).y - VH);
    var SHIFT = E.revCards[1].offsetLeft - E.revCards[0].offsetLeft;

    /* --- helpers ---------------------------------------------------- */
    function tapAppear(t, x, y) {
      tl.set(E.tap, { x: x, y: y, scale: 1 }, t);
      tl.to(E.tap, { autoAlpha: 1, duration: 0.25, ease: 'power1.out' }, t);
    }
    function tapTo(t, x, y, d) { tl.to(E.tap, { x: x, y: y, duration: d, ease: inOut }, t); }
    function tapHide(t) { tl.to(E.tap, { autoAlpha: 0, duration: 0.3, ease: 'power1.in' }, t); }
    function press(t, target) {
      cue('tap', t);
      tl.to(E.tap, { scale: 0.76, duration: 0.12, ease: 'power2.out' }, t)
        .to(E.tap, { scale: 1, duration: 0.3, ease: 'power2.out' }, t + 0.12)
        .set(E.ripple, { scale: 0.7, autoAlpha: 0.6 }, t + 0.05)
        .to(E.ripple, { scale: 2.5, autoAlpha: 0, duration: 0.6, ease: 'power2.out' }, t + 0.05);
      if (target) {
        tl.to(target, { scale: 0.93, duration: 0.1, ease: 'power2.out' }, t)
          .to(target, { scale: 1, duration: 0.35, ease: 'back.out(3)' }, t + 0.1);
      }
    }
    function fly(t, el, from) {
      var d = 0.78;
      cue('fly', t + 0.06, { d: d, x0: Math.round(from.cx), x1: Math.round(P.cart.cx), w: panel.offsetWidth });
      tl.set(el, { x: from.cx, y: from.cy, scale: 1.25, autoAlpha: 0, rotation: 0 }, t)
        .to(el, { autoAlpha: 1, scale: 1, duration: 0.18, ease: 'power1.out' }, t)
        .to(el, { x: P.cart.cx, duration: d, ease: 'power2.inOut' }, t + 0.06)
        .to(el, { y: P.cart.cy, duration: d, ease: 'power3.in' }, t + 0.06)
        .to(el, { rotation: -10, duration: d, ease: 'none' }, t + 0.06)
        .to(el, { scale: 0.3, duration: 0.3, ease: 'power2.in' }, t + d - 0.2)
        .to(el, { autoAlpha: 0, duration: 0.14, ease: 'none' }, t + d - 0.06);
      return t + d + 0.06;
    }
    function bump(t, count, total) {
      cue('pop', t, { n: count });
      tl.set(S, { badge: count, items: count }, t)
        .to(E.badge, { scale: 1.45, duration: 0.14, ease: 'power2.out' }, t)
        .to(E.badge, { scale: 1, duration: 0.45, ease: 'back.out(3)' }, t + 0.14)
        .to(E.cartBtn, { rotation: -9, duration: 0.1, ease: 'power1.out' }, t)
        .to(E.cartBtn, { rotation: 0, duration: 0.5, ease: 'elastic.out(1.2, 0.4)' }, t + 0.1)
        .to(S, { total: total, duration: 0.55, ease: 'power2.out' }, t);
    }
    function layerIn(el, t) { tl.to(el, { autoAlpha: 1, y: 0, duration: 0.55, ease: out }, t); }
    function layerOut(el, t) { tl.to(el, { autoAlpha: 0, y: -10, duration: 0.35, ease: exit }, t); }

    /* --- state at t = 0 (also the state the loop returns to) -------- */
    tl.set(S, { badge: 0, items: 0, total: 0, cal0: 0, cal1: 0, pro0: 0, pro1: 0, carb0: 0, carb1: 0, fat0: 0, fat1: 0 }, 0)
      .set(E.eyebrows.concat(E.captions), { autoAlpha: 0, y: 10 }, 0)
      .set(E.orderScene, { autoAlpha: 0, x: 0 }, 0)
      .set(E.orderScroll, { y: 0 }, 0)
      .set(E.orderItems, { autoAlpha: 0, y: 12 }, 0)
      .set(E.cats, { autoAlpha: 0, x: 26 }, 0)
      .set(E.cards, { autoAlpha: 0, y: 26 }, 0)
      .set(E.cartbar, { yPercent: 0 }, 0)
      .set(E.cont, { backgroundColor: PURPLE_SOFT }, 0)
      .set(E.ind, { xPercent: 0 }, 0)
      .set(E.tab1, { color: WHITE }, 0)
      .set(E.tab2, { color: INK }, 0)
      .set(E.badge, { scale: 1 }, 0)
      .set(E.cartBtn, { rotation: 0 }, 0)
      .set(E.tap, { autoAlpha: 0, x: 250, y: 420, scale: 1 }, 0)
      .set(E.ripple, { autoAlpha: 0, scale: 0.7 }, 0)
      .set([E.fly1, E.fly2], { autoAlpha: 0 }, 0)
      .set(E.scrim, { autoAlpha: 0 }, 0)
      .set(E.sheet, { yPercent: 105 }, 0)
      .set(E.sheetFill, { scaleX: 0 }, 0)
      .set(E.clockHand, { rotation: 0, svgOrigin: '12 12' }, 0)
      .set(E.subScene, { autoAlpha: 0, x: 40, y: 0 }, 0)
      .set(E.subScroll, { y: 0 }, 0)
      .set(E.subItems.concat([E.plan], E.durItems, E.weekItems), { autoAlpha: 0, y: 14 }, 0)
      .set(E.durSel, { autoAlpha: 0 }, 0)
      .set(E.swapA, { autoAlpha: 1, scale: 1 }, 0)
      .set(E.swapB, { autoAlpha: 0, scale: 1.18 }, 0)
      .set(E.notice, { autoAlpha: 0, y: 10 }, 0)
      .set(E.revScene, { autoAlpha: 0, y: VH }, 0)
      .set(E.revItems, { autoAlpha: 0, y: 12 }, 0)
      .set(E.stars, { autoAlpha: 0, scale: 0.4, transformOrigin: '50% 50%' }, 0)
      .set(E.revCards, { autoAlpha: 0, x: 34 }, 0)
      .set(E.revTrack, { x: 0 }, 0)
      .set(E.contact, { autoAlpha: 0, y: 18 }, 0)
      .set(E.waRing, { autoAlpha: 0, scale: 1 }, 0);

    /* ambient drift, one full cycle per loop */
    tl.to(E.blobs[0], { x: 40, y: 26, duration: END / 2, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 0)
      .to(E.blobs[1], { x: -34, y: -20, duration: END / 2, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 0)
      .to(E.blobs[2], { x: 24, y: 30, duration: END / 2, ease: 'sine.inOut', yoyo: true, repeat: 1 }, 0);

    /* ===== Chapter 1 · Order Now ===================================== */
    layerIn(E.eyebrows[0], 0);
    layerIn(E.captions[0], 0.08);
    tl.set(E.orderScene, { autoAlpha: 1 }, 0.02)
      .to(E.orderItems, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.07, ease: out }, 0.1)
      .to(E.cats, { autoAlpha: 1, x: 0, duration: 0.6, stagger: 0.05, ease: out }, 0.2)
      .to(E.cards, { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.09, ease: out }, 0.42);

    tapAppear(1.3, P.add1.cx + 70, P.add1.cy + 120);
    tapTo(1.32, P.add1.cx, P.add1.cy, 0.66);
    press(2.0, E.adds[0]);
    bump(fly(2.04, E.fly1, P.img1), 1, 19);

    tapTo(3.05, P.add2.cx, P.add2.cy, 0.58);
    press(3.68, E.adds[1]);
    bump(fly(3.72, E.fly2, P.img2), 2, 44);

    tl.to(E.cont, { backgroundColor: PURPLE, duration: 0.35, ease: 'power1.out' }, 4.62)
      .to(E.orderScroll, { y: -S1, duration: 1.15, ease: inOut }, 4.75);
    cue('scroll', 4.75, { d: 1.15 });
    tapTo(5.0, P.cont.cx, P.cont.cy, 0.75);
    press(5.85, E.cont);
    tapHide(6.0);

    cue('sheet', 6.0);
    tl.to(E.scrim, { autoAlpha: 1, duration: 0.4, ease: 'power1.out' }, 6.0)
      .to(E.sheet, { yPercent: 0, duration: 0.75, ease: 'power4.out' }, 6.0)
      .to(E.sheetFill, { scaleX: 1, duration: 2.0, ease: 'power1.inOut' }, 6.45)
      .to(E.clockHand, { rotation: 360, svgOrigin: '12 12', duration: 2.0, ease: 'none' }, 6.45);

    /* ===== Transition → Chapter 2 ===================================== */
    tapAppear(8.35, P.tab2.cx - 30, P.tab2.cy + 150);
    tapTo(8.37, P.tab2.cx, P.tab2.cy, 0.58);
    press(8.98, null);
    cue('switch', 9.02);
    tl.to(E.ind, { xPercent: 100, duration: 0.6, ease: 'power3.inOut' }, 9.02)
      .to(E.tab1, { color: INK, duration: 0.3, ease: 'none' }, 9.1)
      .to(E.tab2, { color: WHITE, duration: 0.3, ease: 'none' }, 9.18);
    tapHide(9.3);
    layerOut(E.eyebrows[0], 9.0);
    layerOut(E.captions[0], 9.0);
    tl.to(E.sheet, { yPercent: 105, duration: 0.45, ease: exit }, 8.2)
      .to(E.scrim, { autoAlpha: 0, duration: 0.4, ease: 'power1.in' }, 8.25)
      .to(E.orderScene, { autoAlpha: 0, x: -40, duration: 0.45, ease: exit }, 9.05)
      .to(E.cartbar, { yPercent: 115, duration: 0.45, ease: exit }, 9.05)
      .to(E.subScene, { autoAlpha: 1, x: 0, duration: 0.65, ease: out }, 9.35);

    /* ===== Chapter 2 · Meal Subscription ============================== */
    layerIn(E.eyebrows[1], 9.38);
    layerIn(E.captions[1], 9.46);
    tl.to(E.subItems, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.07, ease: out }, 9.45)
      .to(E.plan, { autoAlpha: 1, y: 0, duration: 0.65, ease: out }, 9.62)
      .to(S, { cal0: 500, cal1: 700, pro0: 25, pro1: 40, carb0: 40, carb1: 70, fat0: 12, fat1: 22, duration: 1.3, ease: 'power2.out' }, 9.85)
      .to(E.durItems, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.06, ease: out }, 10.15);

    tapAppear(10.95, P.dur.cx + 40, P.dur.cy + 110);
    tapTo(10.97, P.dur.cx, P.dur.cy, 0.62);
    press(11.62, E.durPick);
    cue('count', 9.85, { d: 1.3 });
    cue('select', 11.66);
    tl.to(E.durSel, { autoAlpha: 1, duration: 0.3, ease: 'power1.out' }, 11.66);
    tapHide(12.0);

    cue('scroll', 12.2, { d: 1.15 });
    tl.to(E.subScroll, { y: -S2, duration: 1.15, ease: inOut }, 12.2)
      .to(E.weekItems, { autoAlpha: 1, y: 0, duration: 0.55, stagger: 0.07, ease: out }, 12.75);

    tapAppear(13.95, P.swap.cx + 50, P.swap.cy - S2 + 90);
    tapTo(13.97, P.swap.cx, P.swap.cy - S2, 0.55);
    press(14.55, E.swapDay);
    cue('swap', 14.62);
    tl.to(E.swapA, { autoAlpha: 0, scale: 0.82, duration: 0.35, ease: exit }, 14.62)
      .to(E.swapB, { autoAlpha: 1, scale: 1, duration: 0.6, ease: 'back.out(1.6)' }, 14.8)
      .to(E.notice, { autoAlpha: 1, y: 0, duration: 0.55, ease: out }, 14.95);
    tapHide(15.1);

    /* ===== Transition → Chapter 3 ===================================== */
    layerOut(E.eyebrows[1], 16.6);
    layerOut(E.captions[1], 16.6);
    cue('scroll', 16.7, { d: 0.95, big: true });
    tl.to(E.subScene, { y: -VH, duration: 0.95, ease: 'power3.inOut' }, 16.7)
      .set(E.revScene, { autoAlpha: 1 }, 16.7)
      .to(E.revScene, { y: 0, duration: 0.95, ease: 'power3.inOut' }, 16.7);

    /* ===== Chapter 3 · Reviews ======================================== */
    layerIn(E.eyebrows[2], 17.05);
    layerIn(E.captions[2], 17.13);
    E.stars.forEach(function (_, i) { cue('star', 17.5 + i * 0.06, { i: i }); });
    cue('slide', 19.0, { d: 1.05 });
    cue('ring', 20.3);
    tl.to(E.revItems, { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.1, ease: out }, 17.35)
      .to(E.stars, { autoAlpha: 1, scale: 1, duration: 0.45, stagger: 0.06, ease: 'back.out(2.6)' }, 17.5)
      .to(E.revCards, { autoAlpha: 1, x: 0, duration: 0.65, stagger: 0.1, ease: out }, 17.75)
      .to(E.revTrack, { x: -SHIFT, duration: 1.05, ease: 'power3.inOut' }, 19.0)
      .to(E.contact, { autoAlpha: 1, y: 0, duration: 0.65, ease: out }, 19.45)
      .set(E.waRing, { autoAlpha: 0.7, scale: 1 }, 20.3)
      .to(E.waRing, { autoAlpha: 0, scaleX: 1.12, scaleY: 1.45, duration: 1.0, ease: 'power2.out' }, 20.3);

    /* ===== Loop out → back to the t = 0 state ========================= */
    cue('outro', 21.8);
    layerOut(E.eyebrows[2], 21.8);
    layerOut(E.captions[2], 21.8);
    tl.to(E.revScene, { autoAlpha: 0, y: -18, duration: 0.5, ease: exit }, 21.8)
      .to(E.ind, { xPercent: 0, duration: 0.6, ease: 'power3.inOut' }, 21.95)
      .to(E.tab2, { color: INK, duration: 0.3, ease: 'none' }, 22.0)
      .to(E.tab1, { color: WHITE, duration: 0.3, ease: 'none' }, 22.08)
      .to(E.badge, { scale: 0.6, duration: 0.15, ease: exit }, 22.0)
      .set(S, { badge: 0, items: 0, total: 0 }, 22.15)
      .to(E.badge, { scale: 1, duration: 0.3, ease: 'back.out(2)' }, 22.15)
      .set(E.cont, { backgroundColor: PURPLE_SOFT }, 22.15)
      .to(E.cartbar, { yPercent: 0, duration: 0.45, ease: out }, 22.15)
      .set({}, {}, END);

    tl.seek(END - 0.0001, true).seek(0, true);
    return tl;
  }

  /* ------------------------------------------------------------------ */
  /* Intro (plays once)                                                  */
  /* ------------------------------------------------------------------ */
  function buildIntro() {
    var tl = gsap.timeline({ paused: true });
    tl.from(E.blobs, { autoAlpha: 0, scale: 0.85, duration: 1.4, stagger: 0.1, ease: 'power2.out' }, 0)
      .from(E.brand, { autoAlpha: 0, y: 12, duration: 0.6, ease: 'power3.out' }, 0.05)
      .from(E.words, { yPercent: 115, duration: 0.95, stagger: 0.055, ease: 'power4.out' }, 0.12)
      .from(E.panel, { autoAlpha: 0, y: 46, scale: 0.965, duration: 1.15, ease: 'power3.out' }, 0.18)
      .from(E.headerItems, { autoAlpha: 0, y: -8, duration: 0.45, stagger: 0.05, ease: 'power3.out' }, 0.55)
      .from(E.tabs, { autoAlpha: 0, y: -6, duration: 0.45, ease: 'power3.out' }, 0.72)
      .from(E.cartbar, { autoAlpha: 0, duration: 0.4, ease: 'power1.out' }, 0.8)
      .from(E.controls, { autoAlpha: 0, y: 10, duration: 0.55, ease: 'power3.out' }, 0.85);
    return tl;
  }

  /* ------------------------------------------------------------------ */
  /* Chapter progress UI                                                 */
  /* ------------------------------------------------------------------ */
  var lastChapter = -1;
  function chapterAt(t) {
    for (var i = CHAPTERS.length - 1; i >= 0; i--) if (t >= CHAPTERS[i]) return i;
    return 0;
  }
  function syncChapters(t) {
    var c = chapterAt(t);
    for (var i = 0; i < CHAPTERS.length; i++) {
      var a = CHAPTERS[i], b = i + 1 < CHAPTERS.length ? CHAPTERS[i + 1] : END;
      var p = i < c ? 1 : i > c ? 0 : Math.min(1, Math.max(0, (t - a) / (b - a)));
      E.chapterFills[i].style.transform = 'scaleX(' + p.toFixed(4) + ')';
    }
    if (c !== lastChapter) {
      lastChapter = c;
      E.chapterBtns.forEach(function (b, i) {
        b.classList.toggle('is-active', i === c);
        if (i === c) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
    }
  }

  /* ------------------------------------------------------------------ */
  /* Boot                                                                */
  /* ------------------------------------------------------------------ */
  var master, intro, handoffCall = null;
  var userPaused = false, inView = true, started = false;

  function tick() {
    syncText();
    if (master) syncChapters(master.time());
  }

  function setPausedUI(p) {
    root.classList.toggle('is-paused', p);
    E.toggle.setAttribute('aria-label', p ? 'Play animation' : 'Pause animation');
  }

  function start() {
    if (started) return;
    started = true;
    if (reduceMotion) {
      intro.progress(1);
      master.seek(POSTERS[0], false);
      userPaused = true;
      setPausedUI(true);
      tick();
      return;
    }
    intro.play(0);
    handoffCall = gsap.delayedCall(HANDOFF, function () { handoffCall = null; if (!userPaused && inView) master.play(0); });
  }

  function resume() {
    if (intro.progress() < 1 && !intro.isActive()) intro.play();
    if (handoffCall) return;
    master.play();
  }
  function pause() {
    intro.pause();
    if (handoffCall) { handoffCall.kill(); handoffCall = null; intro.progress(1); }
    master.pause();
  }

  function init() {
    layout();
    master = buildMaster();
    intro = buildIntro();
    gsap.ticker.add(tick);
    tick();
    root.classList.add('is-ready');

    E.toggle.addEventListener('click', function () {
      userPaused = !userPaused;
      setPausedUI(userPaused);
      if (userPaused) pause(); else { intro.progress(1); resume(); }
    });

    E.chapterBtns.forEach(function (btn, i) {
      btn.addEventListener('click', function () {
        if (handoffCall) { handoffCall.kill(); handoffCall = null; }
        intro.progress(1);
        if (userPaused) master.seek(POSTERS[i], false);
        else master.play(CHAPTERS[i] + (i === 0 ? 0 : 0.001), false);
        tick();
      });
    });

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        inView = entries[0].isIntersecting;
        if (!started) { if (inView) start(); return; }
        if (userPaused) return;
        if (inView) resume(); else pause();
      }, { threshold: 0.2 });
      io.observe(root);
    } else {
      start();
    }
  }

  window.addEventListener('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe(root);

  /* wait for fonts so measured positions match the final text layout */
  var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  var imgs = $$('img').map(function (img) {
    return img.complete ? Promise.resolve() : new Promise(function (r) { img.onload = img.onerror = r; });
  });
  Promise.race([
    Promise.all([ready].concat(imgs)),
    new Promise(function (r) { setTimeout(r, 2500); })
  ]).then(init);

  /* ------------------------------------------------------------------ */
  /* Public API (chapter control, export, testing)                       */
  /* ------------------------------------------------------------------ */
  window.ZadboxHero = {
    get duration() { return HANDOFF + END; },
    get loopDuration() { return END; },
    chapters: CHAPTERS.slice(),
    handoff: HANDOFF,
    /* audible events; t = master seconds, video = seconds from the start of the intro */
    get cues() { return CUES.map(function (c) { var o = {}; for (var k in c) o[k] = c[k]; o.video = Math.round((c.t + HANDOFF) * 10000) / 10000; return o; }); },
    /* Render the exact frame at time t (intro + first loop). Stops playback. */
    renderAt: function (t) {
      if (!master) return false;
      started = true;
      userPaused = true;
      if (handoffCall) { handoffCall.kill(); handoffCall = null; }
      intro.pause();
      master.pause();
      intro.seek(Math.min(t, intro.duration()), false);
      master.seek(Math.max(0, Math.min(END - 0.0001, t - HANDOFF)), false);
      tick();
      return true;
    },
    /* Render the exact frame at loop time t with the intro finished. Stops playback. */
    renderLoopAt: function (t) {
      if (!master) return false;
      started = true;
      userPaused = true;
      if (handoffCall) { handoffCall.kill(); handoffCall = null; }
      intro.progress(1);
      master.pause();
      master.seek(Math.max(0, Math.min(END - 0.0001, t)), false);
      tick();
      return true;
    },
    play: function () { userPaused = false; setPausedUI(false); intro.progress(1); resume(); },
    pause: function () { userPaused = true; setPausedUI(true); pause(); },
    get isReady() { return !!master; },
    get time() { return master ? master.time() : 0; },
    get isPlaying() { return !!master && master.isActive(); }
  };
})();
