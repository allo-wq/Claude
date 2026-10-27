'use strict';
// Keyboard and mouse, touch (floating stick plus buttons) and gamepad, merged into one intent per frame.

const Input = (() => {
  const keys = new Set();
  const pressed = new Set(); // key codes pressed since the last frame
  const mouse = { x: innerWidth / 2, y: innerHeight / 2, seen: false };
  const stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 };
  // Start in touch mode on phones and tablets so the right controls are shown before the first tap.
  let mode = window.matchMedia && matchMedia('(hover: none) and (pointer: coarse)').matches ? 'touch' : 'kbm'; // 'kbm' | 'touch' | 'pad'
  let rightClick = false, touchDash = false, touchFlare = false, touchPause = false;
  let padPrev = [];
  let padAim = null;

  const out = {
    mx: 0, my: 0, mode: 'kbm', aim: 'mouse', padAim: null,
    dash: false, flare: false, pause: false, mute: false, pick: 0,
    up: false, down: false, left: false, right: false, confirm: false, back: false,
  };

  const anyPressed = codes => codes.some(c => pressed.has(c));

  window.addEventListener('keydown', e => {
    if (!e.repeat) pressed.add(e.code);
    keys.add(e.code);
    mode = 'kbm';
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && !(e.target instanceof HTMLButtonElement && e.code !== 'Space')) {
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  window.addEventListener('blur', () => { keys.clear(); stick.id = null; });
  window.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.seen = true;
    mode = 'kbm';
  });

  function attach(canvas, ui) {
    canvas.addEventListener('mousedown', e => {
      mode = 'kbm'; mouse.seen = true;
      if (e.button === 2) rightClick = true;
    });
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    canvas.addEventListener('touchstart', e => {
      mode = 'touch';
      for (const t of e.changedTouches) {
        if (stick.id === null && t.clientX < innerWidth * 0.55) {
          stick.id = t.identifier;
          stick.ox = stick.x = t.clientX; stick.oy = stick.y = t.clientY;
        } else if (t.clientX >= innerWidth * 0.55) {
          touchDash = true;
        }
      }
      e.preventDefault();
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier !== stick.id) continue;
        stick.x = t.clientX; stick.y = t.clientY;
        // Floating stick: drag the origin along once the thumb goes past the rim.
        const dx = stick.x - stick.ox, dy = stick.y - stick.oy, l = Math.hypot(dx, dy), max = 64;
        if (l > max) { stick.ox = stick.x - dx / l * max; stick.oy = stick.y - dy / l * max; }
      }
      e.preventDefault();
    }, { passive: false });
    const end = e => { for (const t of e.changedTouches) if (t.identifier === stick.id) stick.id = null; };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);

    const hold = (el, fn) => el.addEventListener('touchstart', e => { mode = 'touch'; fn(); e.preventDefault(); e.stopPropagation(); }, { passive: false });
    hold(ui.dash, () => { touchDash = true; });
    hold(ui.flare, () => { touchFlare = true; });
    hold(ui.pause, () => { touchPause = true; });
    ui.dash.addEventListener('click', () => { touchDash = true; });
    ui.flare.addEventListener('click', () => { touchFlare = true; });
    ui.pause.addEventListener('click', () => { touchPause = true; });
  }

  function pollPad() {
    padAim = null;
    if (!navigator.getGamepads) return null;
    let gp = null;
    try { for (const p of navigator.getGamepads()) if (p && p.connected) { gp = p; break; } } catch (e) { return null; }
    if (!gp) return null;
    const now = gp.buttons.map(b => b.pressed);
    const edge = i => now[i] && !padPrev[i];
    padPrev = now;
    const dz = v => (Math.abs(v) < 0.2 ? 0 : (v - Math.sign(v) * 0.2) / 0.8);
    const lx = dz(gp.axes[0] || 0), ly = dz(gp.axes[1] || 0);
    const rx = gp.axes[2] || 0, ry = gp.axes[3] || 0;
    if (Math.hypot(rx, ry) > 0.35) padAim = Math.atan2(ry, rx);
    const r = {
      mx: lx + (now[15] ? 1 : 0) - (now[14] ? 1 : 0),
      my: ly + (now[13] ? 1 : 0) - (now[12] ? 1 : 0),
      dash: edge(0) || edge(5) || edge(7),
      flare: edge(1) || edge(4) || edge(6) || edge(3),
      pause: edge(9),
      up: edge(12), down: edge(13), left: edge(14), right: edge(15),
      confirm: edge(0), back: edge(1),
    };
    if (now.some(Boolean) || Math.hypot(lx, ly) > 0 || padAim !== null) mode = 'pad';
    return r;
  }

  function frame() {
    let mx = 0, my = 0;
    if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1;
    if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
    if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1;
    if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;

    out.dash = anyPressed(['Space', 'ShiftLeft', 'ShiftRight']) || rightClick || touchDash;
    out.flare = anyPressed(['KeyE', 'KeyQ', 'KeyF']) || touchFlare;
    out.pause = anyPressed(['Escape', 'KeyP']) || touchPause;
    out.mute = pressed.has('KeyM');
    out.pick = pressed.has('Digit1') || pressed.has('Numpad1') ? 1 : pressed.has('Digit2') || pressed.has('Numpad2') ? 2 : pressed.has('Digit3') || pressed.has('Numpad3') ? 3 : 0;
    out.up = anyPressed(['ArrowUp', 'KeyW']);
    out.down = anyPressed(['ArrowDown', 'KeyS']);
    out.left = anyPressed(['ArrowLeft', 'KeyA']);
    out.right = anyPressed(['ArrowRight', 'KeyD']);
    out.confirm = anyPressed(['Enter', 'NumpadEnter']);
    out.back = false;

    if (stick.id !== null) {
      const dx = stick.x - stick.ox, dy = stick.y - stick.oy, l = Math.hypot(dx, dy);
      const m = clamp((l - 6) / 50, 0, 1);
      if (l > 0) { mx = dx / l * m; my = dy / l * m; }
    }

    const pad = pollPad();
    if (pad) {
      mx += pad.mx; my += pad.my;
      out.dash ||= pad.dash; out.flare ||= pad.flare; out.pause ||= pad.pause;
      out.up ||= pad.up; out.down ||= pad.down; out.left ||= pad.left; out.right ||= pad.right;
      out.confirm ||= pad.confirm; out.back = pad.back;
    }

    const l = Math.hypot(mx, my);
    if (l > 1) { mx /= l; my /= l; }
    out.mx = mx; out.my = my;
    out.mode = mode;
    out.padAim = padAim;
    out.aim = padAim !== null ? 'pad' : mode === 'kbm' && mouse.seen ? 'mouse' : 'auto';

    pressed.clear();
    rightClick = touchDash = touchFlare = touchPause = false;
    return out;
  }

  return { attach, frame, mouse, stick, get mode() { return mode; } };
})();
