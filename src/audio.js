'use strict';
// Every sound is synthesized with WebAudio: no audio files to load.
// Two buses (effects, music) share an underwater echo send and a master compressor.

const Sound = (() => {
  let ac = null, master, sfx, music, muffle, sfxSend, musicSend, noiseBuf;
  let sfxOn = store.get('sfx', true);
  let musicOn = store.get('music', true);
  const last = Object.create(null);
  const drone = { oscs: [], gain: null, filter: null };
  let nextNoteAt = 0, nextPulseAt = 0, intensity = 0, rootHz = 55;
  let pickIdx = 0, pickAt = 0;
  const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];

  function ensure() {
    if (ac) {
      if (ac.state === 'suspended') ac.resume().catch(() => {});
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try { ac = new AC(); } catch (e) { ac = null; return false; }

    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 10; comp.ratio.value = 5;
    comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ac.createGain(); master.gain.value = 0.85;
    master.connect(comp); comp.connect(ac.destination);

    muffle = ac.createBiquadFilter(); muffle.type = 'lowpass'; muffle.frequency.value = 12000; muffle.Q.value = 0.3;
    sfx = ac.createGain(); sfx.gain.value = sfxOn ? 0.62 : 0;
    sfx.connect(muffle); muffle.connect(master);
    music = ac.createGain(); music.gain.value = musicOn ? 0.5 : 0;
    music.connect(master);

    // Underwater echo: a dark feedback delay.
    const delay = ac.createDelay(1.5); delay.delayTime.value = 0.37;
    const fb = ac.createGain(); fb.gain.value = 0.42;
    const tone = ac.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 1500;
    delay.connect(tone); tone.connect(fb); fb.connect(delay);
    const wet = ac.createGain(); wet.gain.value = 0.5;
    tone.connect(wet); wet.connect(master);
    sfxSend = ac.createGain(); sfxSend.gain.value = sfxOn ? 1 : 0; sfxSend.connect(delay);
    musicSend = ac.createGain(); musicSend.gain.value = musicOn ? 1 : 0; musicSend.connect(delay);

    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    startDrone();
    return true;
  }

  const ready = () => ac && ac.state === 'running';
  function throttled(name, ms) {
    const now = performance.now();
    if (last[name] && now - last[name] < ms) return true;
    last[name] = now;
    return false;
  }

  function voice(o) {
    const t0 = ac.currentTime + (o.t || 0);
    const osc = ac.createOscillator();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t0);
    if (o.f1 && o.f1 !== o.f0) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f1), t0 + (o.slide || o.dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = ac.createGain();
    const a = o.a ?? 0.004, vol = o.vol ?? 0.1;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node = osc;
    if (o.lp) {
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; f.Q.value = o.q || 0.8;
      osc.connect(f); node = f;
    }
    node.connect(g);
    const isMusic = o.bus === 'music';
    g.connect(isMusic ? music : sfx);
    if (o.send) {
      const s = ac.createGain(); s.gain.value = o.send;
      g.connect(s); s.connect(isMusic ? musicSend : sfxSend);
    }
    osc.start(t0); osc.stop(t0 + o.dur + 0.05);
  }

  function noise(o) {
    const t0 = ac.currentTime + (o.t || 0);
    const src = ac.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const f = ac.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.f0, t0);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + o.dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol ?? 0.1, t0 + (o.a ?? 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f); f.connect(g); g.connect(sfx);
    if (o.send) { const s = ac.createGain(); s.gain.value = o.send; g.connect(s); s.connect(sfxSend); }
    src.start(t0, Math.random() * 0.5); src.stop(t0 + o.dur + 0.05);
  }

  const can = () => ready() && sfxOn;

  // ---- Effects ----
  const fx = {
    shoot() {
      if (!can() || throttled('shoot', 45)) return;
      voice({ type: 'triangle', f0: rand(820, 900), f1: 380, dur: 0.07, vol: 0.045 });
    },
    hit() {
      if (!can() || throttled('hit', 35)) return;
      noise({ f0: 2400, q: 1.5, dur: 0.05, vol: 0.05 });
    },
    kill(big) {
      if (!can() || throttled('kill', 28)) return;
      voice({ type: 'sine', f0: big ? 220 : rand(340, 420), f1: big ? 50 : 90, dur: big ? 0.35 : 0.14, vol: big ? 0.22 : 0.1 });
      noise({ f0: big ? 600 : 1400, f1: 300, q: 0.7, dur: big ? 0.3 : 0.1, vol: big ? 0.12 : 0.05 });
    },
    pickup() {
      if (!can() || throttled('pickup', 38)) return;
      const now = performance.now();
      if (now - pickAt > 600) pickIdx = 0;
      pickAt = now;
      const semi = PENTA[Math.min(pickIdx, PENTA.length - 1)];
      pickIdx++;
      voice({ type: 'sine', f0: 660 * Math.pow(2, semi / 12), dur: 0.12, vol: 0.05, send: 0.35 });
    },
    levelUp() {
      if (!can()) return;
      [0, 4, 7, 12, 16].forEach((s, i) => voice({ type: 'triangle', f0: 440 * Math.pow(2, s / 12), dur: 0.5, vol: 0.07, t: i * 0.06, send: 0.6 }));
    },
    choose() {
      if (!can()) return;
      voice({ type: 'sine', f0: 880, f1: 1320, dur: 0.18, vol: 0.08, send: 0.5 });
    },
    tick() {
      if (!can() || throttled('tick', 40)) return;
      voice({ type: 'sine', f0: 1500, dur: 0.03, vol: 0.025 });
    },
    hurt() {
      if (!can()) return;
      voice({ type: 'sawtooth', f0: 180, f1: 45, dur: 0.38, vol: 0.28, lp: 900 });
      noise({ type: 'lowpass', f0: 1200, f1: 200, dur: 0.3, vol: 0.2 });
    },
    dash() {
      if (!can()) return;
      noise({ f0: 380, f1: 2200, q: 2, dur: 0.2, vol: 0.12 });
    },
    flare() {
      if (!can()) return;
      voice({ type: 'sine', f0: 110, f1: 880, dur: 0.9, vol: 0.2, slide: 0.5, send: 0.6 });
      [0, 7, 12, 19].forEach((s, i) => voice({ type: 'triangle', f0: 330 * Math.pow(2, s / 12), dur: 1.6, vol: 0.06, a: 0.05, t: 0.05 + i * 0.04, send: 0.8 }));
      noise({ type: 'highpass', f0: 3000, dur: 0.9, vol: 0.08, a: 0.02 });
    },
    shock() {
      if (!can() || throttled('shock', 120)) return;
      voice({ type: 'sine', f0: 140, f1: 38, dur: 0.32, vol: 0.22 });
      noise({ type: 'lowpass', f0: 900, f1: 120, dur: 0.25, vol: 0.08 });
    },
    zap() {
      if (!can() || throttled('zap', 70)) return;
      voice({ type: 'square', f0: rand(1800, 2400), f1: 600, dur: 0.07, vol: 0.025, lp: 4000 });
    },
    enemyShoot() {
      if (!can() || throttled('eshoot', 70)) return;
      voice({ type: 'sine', f0: 520, f1: 300, dur: 0.09, vol: 0.04 });
    },
    telegraph() {
      if (!can() || throttled('tele', 120)) return;
      voice({ type: 'sine', f0: 600, f1: 640, dur: 0.12, vol: 0.04 });
    },
    slam() {
      if (!can() || throttled('slam', 90)) return;
      voice({ type: 'sine', f0: 90, f1: 30, dur: 0.4, vol: 0.3 });
      noise({ type: 'lowpass', f0: 700, f1: 80, dur: 0.35, vol: 0.15 });
    },
    heal() {
      if (!can()) return;
      [0, 7, 12].forEach((s, i) => voice({ type: 'sine', f0: 523 * Math.pow(2, s / 12), dur: 0.4, vol: 0.06, t: i * 0.07, send: 0.5 }));
    },
    pearl() {
      if (!can()) return;
      [0, 5, 9, 12, 17].forEach((s, i) => voice({ type: 'sine', f0: 587 * Math.pow(2, s / 12), dur: 0.6, vol: 0.06, t: i * 0.05, send: 0.7 }));
    },
    // A sonar ping: used for zone changes and boss warnings.
    sonar(low) {
      if (!can()) return;
      voice({ type: 'sine', f0: low ? 620 : 1180, dur: 1.6, vol: 0.12, a: 0.01, send: 0.9 });
    },
    roar() {
      if (!can()) return;
      voice({ type: 'sawtooth', f0: 70, f1: 38, dur: 1.8, vol: 0.22, lp: 380, q: 4, a: 0.15 });
      voice({ type: 'sawtooth', f0: 105, f1: 52, dur: 1.6, vol: 0.12, lp: 300, a: 0.2, detune: 12 });
    },
    beam() {
      if (!can() || throttled('beam', 200)) return;
      voice({ type: 'sawtooth', f0: 220, f1: 200, dur: 0.6, vol: 0.06, lp: 1200, a: 0.05 });
    },
    bossDie() {
      if (!can()) return;
      noise({ type: 'lowpass', f0: 2000, f1: 60, dur: 2.4, vol: 0.3, a: 0.02, send: 0.5 });
      voice({ type: 'sine', f0: 160, f1: 30, dur: 2.2, vol: 0.3 });
      [0, 3, 7, 10, 15].forEach((s, i) => voice({ type: 'triangle', f0: 220 * Math.pow(2, s / 12), dur: 2, vol: 0.05, t: 0.4 + i * 0.12, send: 0.9 }));
    },
    death() {
      if (!can()) return;
      voice({ type: 'sine', f0: 440, f1: 55, dur: 2.2, vol: 0.18, send: 0.8 });
      noise({ type: 'lowpass', f0: 1500, f1: 80, dur: 1.5, vol: 0.15 });
    },
    victory() {
      if (!can()) return;
      [0, 4, 7, 11, 14, 19, 24].forEach((s, i) => voice({ type: 'triangle', f0: 220 * Math.pow(2, s / 12), dur: 2.4, vol: 0.06, a: 0.05, t: i * 0.16, send: 0.9 }));
    },
  };

  // ---- Music: a detuned drone plus sparse pentatonic notes; a heartbeat pulse joins in boss fights ----
  function startDrone() {
    const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 240; f.Q.value = 3;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.05;
    const lg = ac.createGain(); lg.gain.value = 130;
    lfo.connect(lg); lg.connect(f.frequency); lfo.start();
    const g = ac.createGain(); g.gain.value = 0.0001;
    g.gain.exponentialRampToValueAtTime(0.14, ac.currentTime + 5);
    const spec = [['sawtooth', 1, -6], ['sine', 1.5, 0], ['triangle', 2, 7]];
    for (const [type, mul, det] of spec) {
      const o = ac.createOscillator(); o.type = type; o.frequency.value = rootHz * mul; o.detune.value = det;
      o.connect(f); o.start(); drone.oscs.push([o, mul]);
    }
    f.connect(g); g.connect(music);
    drone.gain = g; drone.filter = f;
  }

  function setZone(z) {
    const roots = [55, 51.91, 49, 46.25, 43.65, 41.2];
    rootHz = roots[clamp(z, 0, roots.length - 1)];
    if (!ac) return;
    for (const [o, mul] of drone.oscs) o.frequency.setTargetAtTime(rootHz * mul, ac.currentTime, 1.5);
  }

  function update() {
    if (!ready() || !musicOn) return;
    const now = ac.currentTime;
    if (nextNoteAt < now) nextNoteAt = now + 0.2;
    while (nextNoteAt < now + 0.3) {
      const t = nextNoteAt - now;
      const semi = PENTA[randInt(0, 7)] + (chance(0.25) ? 12 : 0);
      const f0 = rootHz * 8 * Math.pow(2, semi / 12);
      voice({ bus: 'music', type: 'sine', f0, dur: rand(2.4, 3.6), vol: 0.045, a: 0.5, t, send: 0.8 });
      if (chance(0.3)) voice({ bus: 'music', type: 'sine', f0: f0 * 1.5, dur: 3, vol: 0.025, a: 0.7, t: t + 0.2, send: 0.8 });
      nextNoteAt += intensity > 0.5 ? rand(0.5, 1.1) : rand(1.3, 3.2);
    }
    if (intensity > 0.5) {
      if (nextPulseAt < now) nextPulseAt = now + 0.05;
      while (nextPulseAt < now + 0.3) {
        const t = nextPulseAt - now;
        voice({ bus: 'music', type: 'sine', f0: 92, f1: 40, dur: 0.3, vol: 0.26, t });
        voice({ bus: 'music', type: 'sine', f0: 80, f1: 38, dur: 0.25, vol: 0.16, t: t + 0.2 });
        nextPulseAt += 0.86;
      }
    }
  }

  function setIntensity(v) {
    intensity = v;
    if (drone.filter && ac) drone.filter.frequency.setTargetAtTime(v > 0.5 ? 420 : 240, ac.currentTime, 1);
  }
  function setDepth(depth) {
    if (!muffle || !ac) return;
    muffle.frequency.setTargetAtTime(lerp(12000, 3800, clamp(depth / 11000, 0, 1)), ac.currentTime, 0.5);
  }

  function setSfx(on) {
    sfxOn = on; store.set('sfx', on);
    if (ac) {
      sfx.gain.setTargetAtTime(on ? 0.62 : 0, ac.currentTime, 0.05);
      sfxSend.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.05);
    }
  }
  function setMusic(on) {
    musicOn = on; store.set('music', on);
    if (ac) {
      music.gain.setTargetAtTime(on ? 0.5 : 0, ac.currentTime, 0.2);
      musicSend.gain.setTargetAtTime(on ? 1 : 0, ac.currentTime, 0.2);
    }
  }
  function suspend() { if (ac && ac.state === 'running') ac.suspend().catch(() => {}); }
  function resume() { if (ac && ac.state === 'suspended') ac.resume().catch(() => {}); }

  return {
    ensure, update, setZone, setIntensity, setDepth, setSfx, setMusic, suspend, resume,
    get sfxOn() { return sfxOn; }, get musicOn() { return musicOn; },
    ...fx,
  };
})();
