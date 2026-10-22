// DOM text layer: hook, item names, price counter, lock brackets, running
// total and outro. Driven purely by time like the 3D scene.
import { L, O, countValue } from './timeline.js';
import { clamp, lerp, prog, eOutCubic, eInCubic, eOutBack, spring, pulse, fmtMoney, wobble } from './util.js';

const $ = (id) => document.getElementById(id);

function setMoney(el, cur, n) {
  const s = cur + fmtMoney(n);
  if (el._s === s) return;
  el._s = s;
  el.innerHTML = [...s]
    .map((c) => (c === ',' ? '<span class="c">,</span>' : /\d/.test(c) ? `<span class="d">${c}</span>` : `<span class="cur">${c}</span>`))
    .join('');
}
function style(el, { x = 0, y = 0, s = 1, r = 0, skew = 0, o = 1, blur = 0, ls = null, glitch = 0 }) {
  el.style.opacity = o;
  el.style.transform = `translate(${x}px, ${y}px) rotate(${r}deg) skewX(${skew}deg) scale(${s})`;
  el.style.filter = blur > 0.3 ? `blur(${blur}px)` : 'none';
  if (ls !== null) el.style.letterSpacing = `${ls}px`;
  el.classList.toggle('rgb', glitch > 0.2);
}
// Text that slams in at `t1` (scale 2.6 -> 1) and leaves through a whip at `out`.
function slam(el, t, t1, out = Infinity, dur = 0.14, from = 2.6) {
  if (t < t1 - dur) return style(el, { o: 0 });
  const p = eOutCubic(prog(t, t1 - dur, t1));
  const q = eInCubic(prog(t, out, out + 0.3));
  style(el, {
    s: lerp(from, 1, p) * (1 + q * 0.2),
    o: p * (1 - q),
    blur: (1 - p) * 14 + q * 10,
    x: spring(t - t1, 30, 9) * 10 + q * 1100,
    skew: -q * 25,
    glitch: q,
  });
}

export function createHud(cfg, TL) {
  const el = {};
  for (const id of [
    'hook', 'h1', 'h2', 'h3', 'topbar', 'itemNum', 'pips', 'totalNum', 'totalTag', 'name', 'sub', 'priceWrap', 'priceLabel',
    'price', 'brackets', 'lockText', 'outro', 'oTitle', 'oTotalLabel', 'oTotal', 'cta', 'flash',
  ])
    el[id] = $(id);
  el.h1.textContent = cfg.hook[0];
  el.h2.textContent = cfg.hook[1];
  el.h3.textContent = cfg.hook[2];
  el.oTitle.textContent = cfg.outroTitle;
  el.cta.textContent = cfg.outroCta;
  el.pips.innerHTML = TL.pieces.map(() => '<i></i>').join('');
  const pips = [...el.pips.children];
  const N = TL.pieces.length;
  const oS = TL.outroStart;
  const cur = cfg.currency;

  return {
    update(t, fx) {
      // ---- Hook.
      const hookOut = TL.hits.find((h) => h.glitch && h.t < TL.pieces[0].t0).t;
      el.hook.style.display = t < hookOut + 0.4 ? '' : 'none';
      [el.h1, el.h2, el.h3].forEach((h, k) => slam(h, t, 0.1 + k * 0.5, hookOut + k * 0.04, 0.12));
      el.h3.style.transform += ` scale(${1 + 0.06 * Math.sin(t * 9) * prog(t, 1.2, 1.5)})`;

      // ---- Top bar: item counter, pips, running total.
      const inPieces = t >= TL.pieces[0].t0 - 0.25 && t < oS;
      el.topbar.style.opacity = inPieces ? clamp((t - TL.pieces[0].t0 + 0.25) / 0.25) * (1 - prog(t, oS - 0.3, oS)) : 0;
      const idx = clamp(Math.floor((t - TL.pieces[0].t0) / cfg.pieceDuration), 0, N - 1);
      el.itemNum.textContent = String(idx + 1).padStart(2, '0');
      let total = 0, bump = 0;
      TL.pieces.forEach((p, j) => {
        const k = p.t0 + L.count1;
        total += p.price * eOutCubic(prog(t, k, k + 0.35));
        bump = Math.max(bump, pulse(t - k, 6));
        pips[j].className = t >= k ? 'done' : j === idx ? 'cur' : '';
      });
      setMoney(el.totalNum, cur, total);
      el.totalTag.style.transform = `scale(${1 + bump * 0.18})`;
      el.totalTag.classList.toggle('hot', bump > 0.25);

      // ---- Current piece texts.
      const P = TL.pieces[idx];
      const lt = t - P.t0;
      const live = t >= P.t0 && t < oS;
      el.name.style.display = el.sub.style.display = el.priceWrap.style.display = el.brackets.style.display = live ? '' : 'none';
      if (live) {
        if (el.name.textContent !== P.name) {
          el.name.textContent = P.name;
          // Black Ops One runs ~0.7em per glyph; keep long names inside the frame.
          el.name.style.fontSize = `${Math.min(112, 1000 / (P.name.length * 0.7))}px`;
        }
        slam(el.name, lt, L.label, L.exit0 + 0.02);
        const n = Math.floor(prog(lt, L.label + 0.08, L.label + 0.4) * P.sub.length);
        el.sub.textContent = P.sub.slice(0, n) + (n < P.sub.length && n > 0 ? '▌' : '');
        const subOut = eInCubic(prog(lt, L.exit0 + 0.05, L.exit0 + 0.35));
        style(el.sub, { o: (n > 0 ? 1 : 0) * (1 - subOut), x: subOut * 1100, blur: subOut * 10, skew: -subOut * 25 });

        // Price: pops in after the scan locks, counts 1 -> price, lands with a punch.
        const pin = eOutBack(prog(lt, L.count0 - 0.12, L.count0 + 0.06), 2.2);
        const pout = eInCubic(prog(lt, L.exit0 + 0.06, L.exit0 + 0.36));
        const counting = lt < L.count1;
        setMoney(el.price, cur, countValue(P.price, prog(lt, L.count0, L.count1)));
        const land = lt - L.count1;
        const jit = counting && lt > L.count0 ? 1 : 0;
        style(el.priceWrap, {
          o: clamp(pin * 1.5) * (1 - pout),
          s: lerp(0.3, 1, pin) * (1 + 0.32 * pulse(land, 7) + 0.05 * spring(land, 25, 6)),
          x: pout * 1100 + wobble(t * 3, 1) * 4 * jit,
          y: wobble(t * 3, 2) * 4 * jit,
          skew: -pout * 25,
          blur: pout * 10,
          glitch: pout,
        });
        el.price.classList.toggle('landed', land >= 0);
        el.priceLabel.style.opacity = prog(lt, L.count0, L.count0 + 0.2);

        // Lock-on brackets close in when the scan completes.
        const b = eOutCubic(prog(lt, L.scan1 - 0.12, L.scan1 + 0.1));
        const bo = prog(lt, L.exit0, L.exit0 + 0.15);
        el.brackets.style.opacity = b * (1 - bo) * (lt < L.scan1 + 0.25 ? (Math.floor(lt * 30) % 2 ? 1 : 0.4) : 1);
        el.brackets.style.setProperty('--gap', `${lerp(130, 0, b) + bo * 60}px`);
        el.lockText.textContent = lt < L.count1 ? 'TARGET LOCKED  ·  VALUE SCAN' : 'MARKET PRICE CONFIRMED';
      }

      // ---- Outro.
      el.outro.style.display = t >= oS ? '' : 'none';
      if (t >= oS) {
        const ot = t - oS;
        slam(el.oTitle, ot, O.title);
        const tin = eOutBack(prog(ot, O.count0 - 0.12, O.count0 + 0.08), 2);
        setMoney(el.oTotal, cur, countValue(TL.total, prog(ot, O.count0, O.count1)));
        const land = ot - O.count1;
        const jit = ot > O.count0 && land < 0 ? 1 : 0;
        style(el.oTotal, {
          o: clamp(tin * 1.5),
          s: lerp(0.3, 1, tin) * (1 + 0.35 * pulse(land, 6) + 0.05 * spring(land, 22, 5)),
          x: wobble(t * 3, 4) * 5 * jit,
          y: wobble(t * 3, 5) * 5 * jit,
        });
        el.oTotal.classList.toggle('landed', land >= 0);
        style(el.oTotalLabel, { o: prog(ot, O.count0, O.count0 + 0.2) });
        if (ot < O.cta - 0.1) style(el.cta, { o: 0 });
        else {
          const p = eOutCubic(prog(ot, O.cta - 0.1, O.cta));
          style(el.cta, { s: lerp(3.2, 1, p) * (1 + 0.04 * Math.sin(ot * 6)), o: p, r: -7 + spring(ot - O.cta, 25, 7) * 4, blur: (1 - p) * 8 });
        }
      }

      // ---- Flash overlay (screen blend so text gets washed too).
      el.flash.style.opacity = clamp(fx.flash);
      el.flash.style.background = `rgb(${fx.flashCol.map((c) => Math.round(c * 255)).join(',')})`;
    },
  };
}
