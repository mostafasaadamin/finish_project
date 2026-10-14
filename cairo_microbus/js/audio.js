'use strict';
// All sound is synthesized with Web Audio: no audio files needed.
(function (G) {
  const A = (G.Audio = { ctx: null, ready: false, listener: { x: 0, z: 0, h: 0 }, radioOn: false });

  A.init = function () {
    if (A.ctx) { A.ctx.resume(); return; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = (A.ctx = new Ctx());
    A.master = ctx.createGain();
    A.master.gain.value = 0.9;
    const comp = ctx.createDynamicsCompressor();
    A.master.connect(comp);
    comp.connect(ctx.destination);

    // white + brown noise buffers
    const len = ctx.sampleRate * 2;
    A.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = A.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    A.brownBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const bd = A.brownBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      bd[i] = last * 3.5;
    }

    // ---- engine (diesel-ish microbus) ----
    A.engFilter = ctx.createBiquadFilter();
    A.engFilter.type = 'lowpass';
    A.engFilter.frequency.value = 400;
    A.engFilter.Q.value = 3;
    A.engGain = ctx.createGain();
    A.engGain.gain.value = 0;
    A.engFilter.connect(A.engGain);
    A.engGain.connect(A.master);
    A.engOsc = [['sawtooth', 1, 0.5], ['square', 0.5, 0.35], ['triangle', 2, 0.2]].map(([type, mul, vol]) => {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      g.gain.value = vol;
      o.connect(g); g.connect(A.engFilter);
      o.start();
      return { o, mul };
    });
    const rumble = A.loopNoise(A.brownBuf);
    A.rumbleGain = ctx.createGain();
    A.rumbleGain.gain.value = 0.0;
    rumble.connect(A.rumbleGain); A.rumbleGain.connect(A.master);

    // ---- city ambience: traffic rumble + crowd murmur ----
    const amb = A.loopNoise(A.brownBuf);
    const ambF = ctx.createBiquadFilter(); ambF.type = 'lowpass'; ambF.frequency.value = 350;
    const ambG = (A.synthAmbGain = ctx.createGain()); ambG.gain.value = 0.22;
    amb.connect(ambF); ambF.connect(ambG); ambG.connect(A.master);
    const crowd = A.loopNoise(A.noiseBuf);
    const crF = ctx.createBiquadFilter(); crF.type = 'bandpass'; crF.frequency.value = 900; crF.Q.value = 0.8;
    A.crowdGain = ctx.createGain(); A.crowdGain.gain.value = 0.015;
    crowd.connect(crF); crF.connect(A.crowdGain); A.crowdGain.connect(A.master);
    A.crowdLevel = 0.015;

    A.ready = true;
    A.loadSamples();
  };

  // ================= REAL RECORDINGS (assets/sounds) =================
  // Roles are picked from each recording's title / tags / description.
  const ROLES = [
    ['musicHorn', /cucaracha|musical horn/i],
    ['horn', /\bhorn|honk|klaxon|hooter/i],
    ['muezzin', /muezzin|adhan|azan|call to prayer|prayer call/i],
    ['microbus', /microbus|minibus|inside.*bus|bus ride|in a bus/i],
    ['cafe', /cafe|café|coffee ?shop|shisha|hookah|domino|backgammon/i],
    ['market', /market|souk|bazaar|hawker|vendor|street seller|crowd|people|walla/i],
    ['traffic', /traffic|street|road|city|cairo|square|downtown|urban|cars/i],
  ];
  A.samples = {};
  A.sampleRole = (s) => {
    const text = [s.title, s.description, (s.tags || []).join(' ')].join(' ');
    for (const [role, re] of ROLES) if (re.test(text)) return role;
    return null;
  };

  A.loadSamples = async function () {
    const list = G.Assets ? G.Assets.sounds() : [];
    if (!list.length) return;
    // a few per role is plenty (memory on phones)
    const per = { traffic: 4, market: 4, horn: 6, musicHorn: 1, muezzin: 1, microbus: 2, cafe: 2 };
    const picked = {};
    list.forEach((s) => {
      const role = A.sampleRole(s);
      if (!role) return;
      (picked[role] = picked[role] || []);
      if (picked[role].length < per[role]) picked[role].push(s);
    });
    const jobs = [];
    Object.entries(picked).forEach(([role, arr]) => arr.forEach((s) => jobs.push(
      fetch('assets/sounds/' + s.file).then((r) => r.arrayBuffer())
        .then((b) => new Promise((res, rej) => A.ctx.decodeAudioData(b, res, rej)))
        .then((buf) => { (A.samples[role] = A.samples[role] || []).push({ buf, info: s }); })
        .catch(() => {}),
    )));
    await Promise.all(jobs);
    A.startBeds();
  };

  A.hasSample = (role) => !!(A.samples[role] && A.samples[role].length);

  // looping ambience beds: city traffic always, market crowd and microbus interior faded in by the game
  A.beds = {};
  A.startBeds = function () {
    const bed = (role, vol) => {
      if (!A.hasSample(role)) return;
      const src = A.ctx.createBufferSource();
      src.buffer = G.pick(A.samples[role]).buf;
      src.loop = true;
      const g = A.ctx.createGain();
      g.gain.value = vol;
      src.connect(g); g.connect(A.master);
      src.start(0, Math.random() * Math.max(0, src.buffer.duration - 1));
      A.beds[role] = { src, g, base: vol };
    };
    bed('traffic', 0.55);
    bed('market', 0);
    bed('microbus', 0);
    bed('cafe', 0);
    // the recordings replace the synthesized hiss
    if (A.beds.traffic) A.synthAmbGain.gain.setTargetAtTime(0.05, A.now(), 1);
    if (A.beds.market) A.crowdGain.gain.setTargetAtTime(0, A.now(), 1);
    // occasional far call to prayer
    if (A.hasSample('muezzin')) setTimeout(() => A.playSample('muezzin', null, 0.25), 45000);
  };

  A.setBed = function (role, level) {
    const b = A.beds[role];
    if (b) b.g.gain.setTargetAtTime(level, A.now(), 0.6);
  };

  // one-shot of a recording (random slice for long files), optionally positioned in the world
  A.playSample = function (role, pos, vol, maxLen) {
    if (!A.ready || !A.hasSample(role)) return false;
    const dest = A.spatial(pos, 140, vol == null ? 0.6 : vol);
    if (!dest) return true;
    const { buf } = G.pick(A.samples[role]);
    const src = A.ctx.createBufferSource();
    src.buffer = buf;
    const len = Math.min(buf.duration, maxLen || buf.duration);
    const offset = buf.duration > len ? Math.random() * (buf.duration - len) : 0;
    const g = A.ctx.createGain();
    const t = A.now();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.05);
    g.gain.setValueAtTime(1, t + Math.max(0.06, len - 0.15));
    g.gain.linearRampToValueAtTime(0, t + len);
    src.connect(g); g.connect(dest);
    src.start(t, offset, len + 0.05);
    return true;
  };

  A.loopNoise = function (buf) {
    const s = A.ctx.createBufferSource();
    s.buffer = buf; s.loop = true;
    s.loopStart = Math.random();
    s.start(0, Math.random() * 1.5);
    return s;
  };

  A.now = () => A.ctx.currentTime;

  // Spatial output node for a world position (gain by distance + stereo pan)
  A.spatial = function (pos, maxD, base) {
    if (!A.ready) return null;
    const L = A.listener;
    let vol = base == null ? 1 : base;
    let pan = 0;
    if (pos) {
      const dx = pos.x - L.x, dz = pos.z - L.z;
      const dist = Math.hypot(dx, dz);
      const f = 1 - dist / (maxD || 80);
      if (f <= 0) return null;
      vol *= f * f;
      // right vector of listener = (-cos h, sin h)
      const rx = -Math.cos(L.h), rz = Math.sin(L.h);
      pan = dist > 0.5 ? G.clamp((dx * rx + dz * rz) / dist, -1, 1) * 0.8 : 0;
    }
    const g = A.ctx.createGain();
    g.gain.value = vol;
    if (A.ctx.createStereoPanner) {
      const p = A.ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p); p.connect(A.master);
    } else g.connect(A.master);
    return g;
  };

  A.tone = function (dest, type, freq, t0, dur, vol, endFreq) {
    const o = A.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.01);
    g.gain.setValueAtTime(vol, t0 + Math.max(0.011, dur - 0.04));
    g.gain.linearRampToValueAtTime(0, t0 + dur);
    o.connect(g); g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  };

  A.noiseHit = function (dest, t0, dur, vol, type, freq, q) {
    const s = A.ctx.createBufferSource();
    s.buffer = A.noiseBuf;
    const f = A.ctx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.value = freq || 1000;
    if (q) f.Q.value = q;
    const g = A.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(dest);
    s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
    return f;
  };

  // ---------- engine ----------
  A.updateEngine = function (rpm, throttle, speed, on) {
    if (!A.ready) return;
    const t = A.now();
    const f0 = on ? rpm / 30 : 0.0001;
    A.engOsc.forEach(({ o, mul }) => o.frequency.setTargetAtTime(Math.max(1, f0 * mul), t, 0.05));
    A.engFilter.frequency.setTargetAtTime(180 + throttle * 700 + rpm * 0.12, t, 0.08);
    A.engGain.gain.setTargetAtTime(on ? 0.1 + throttle * 0.1 : 0, t, 0.1);
    A.rumbleGain.gain.setTargetAtTime(Math.min(0.35, Math.abs(speed) * 0.012), t, 0.2);
  };

  A.setCrowd = function (level) {
    if (!A.ready) return;
    if (A.beds.market) { A.setBed('market', G.clamp(level * 6, 0, 0.6)); return; }
    A.crowdGain.gain.setTargetAtTime(level, A.now(), 0.5);
  };

  // ---------- horns ----------
  A.horn = function (on) {
    if (!A.ready) return;
    const t = A.now();
    if (on && !A.hornNodes) {
      const g = A.ctx.createGain();
      g.gain.value = 0;
      const f = A.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
      f.connect(g); g.connect(A.master);
      const o1 = A.ctx.createOscillator(), o2 = A.ctx.createOscillator();
      o1.type = o2.type = 'square';
      o1.frequency.value = 415; o2.frequency.value = 523;
      o1.connect(f); o2.connect(f);
      o1.start(); o2.start();
      g.gain.setTargetAtTime(0.16, t, 0.01);
      A.hornNodes = { g, o1, o2 };
    } else if (!on && A.hornNodes) {
      const h = A.hornNodes;
      h.g.gain.setTargetAtTime(0, t, 0.02);
      h.o1.stop(t + 0.2); h.o2.stop(t + 0.2);
      A.hornNodes = null;
    }
  };

  // The famous "musical horn" of Cairo microbuses
  A.musicHorn = function () {
    if (!A.ready) return;
    if (A.playSample('musicHorn', null, 0.5, 4)) return;
    const dest = A.spatial(null, 0, 0.12);
    const N = { G4: 392, C5: 523.25, E5: 659.25, B4: 493.88, A4: 440, F4: 349.23, D5: 587.33 };
    const seq = [['G4', 1], ['G4', 1], ['G4', 1], ['C5', 2], ['E5', 2], [null, 1], ['G4', 1], ['G4', 1], ['G4', 1], ['C5', 2], ['E5', 3], [null, 1],
      ['C5', 1], ['C5', 1], ['B4', 1], ['B4', 1], ['A4', 1], ['A4', 1], ['G4', 3]];
    let t = A.now() + 0.02;
    const step = 0.12;
    seq.forEach(([n, len]) => {
      if (n) { A.tone(dest, 'square', N[n], t, step * len * 0.9, 0.5); A.tone(dest, 'square', N[n] * 1.005, t, step * len * 0.9, 0.3); }
      t += step * len;
    });
  };

  A.aiHorn = function (pos) {
    if (A.playSample('horn', pos, 0.5, 1.6)) return;
    const dest = A.spatial(pos, 120, 0.09);
    if (!dest) return;
    const t = A.now();
    const f = G.rand(330, 560);
    const n = G.randi(1, 3);
    for (let i = 0; i < n; i++) {
      A.tone(dest, 'square', f, t + i * 0.22, 0.16, 0.6);
      A.tone(dest, 'square', f * 1.26, t + i * 0.22, 0.16, 0.4);
    }
  };

  // ---------- one-shots ----------
  A.crash = function (intensity) {
    if (!A.ready) return;
    const dest = A.spatial(null, 0, G.clamp(intensity, 0.2, 1) * 0.9);
    const t = A.now();
    A.noiseHit(dest, t, 0.5, 0.9, 'lowpass', 1800);
    A.noiseHit(dest, t + 0.03, 0.25, 0.6, 'highpass', 3000);
    A.tone(dest, 'sine', 120, t, 0.25, 0.8, 40);
    // glass/metal tinkle
    for (let i = 0; i < 5; i++) A.tone(dest, 'triangle', G.rand(2500, 5000), t + 0.05 + i * 0.04, 0.08, 0.08);
  };

  A.door = function () {
    if (!A.ready) return;
    const dest = A.spatial(null, 0, 0.35);
    const t = A.now();
    const f = A.noiseHit(dest, t, 0.45, 0.5, 'bandpass', 600, 2);
    f.frequency.linearRampToValueAtTime(1600, t + 0.4);
    A.tone(dest, 'square', 90, t + 0.42, 0.06, 0.3);
  };

  A.coin = function () {
    if (!A.ready) return;
    const dest = A.spatial(null, 0, 0.18);
    const t = A.now();
    A.tone(dest, 'triangle', 1318, t, 0.08, 0.6);
    A.tone(dest, 'triangle', 1760, t + 0.07, 0.18, 0.6);
  };

  A.tick = function (on) {
    if (!A.ready) return;
    const dest = A.spatial(null, 0, 0.1);
    A.noiseHit(dest, A.now(), 0.03, 0.8, 'bandpass', on ? 3000 : 2200, 3);
  };

  A.whistle = function (pos) {
    const dest = A.spatial(pos, 120, 0.25);
    if (!dest) return;
    const t = A.now();
    [0, 0.55].forEach((o, i) => {
      const osc = A.ctx.createOscillator();
      osc.frequency.value = 2900;
      const lfo = A.ctx.createOscillator(); lfo.frequency.value = 28;
      const lg = A.ctx.createGain(); lg.gain.value = 180;
      lfo.connect(lg); lg.connect(osc.frequency);
      const g = A.ctx.createGain();
      const dur = i ? 0.9 : 0.35;
      g.gain.setValueAtTime(0, t + o);
      g.gain.linearRampToValueAtTime(0.5, t + o + 0.02);
      g.gain.setValueAtTime(0.5, t + o + dur - 0.05);
      g.gain.linearRampToValueAtTime(0, t + o + dur);
      osc.connect(g); g.connect(dest);
      osc.start(t + o); lfo.start(t + o); osc.stop(t + o + dur + 0.05); lfo.stop(t + o + dur + 0.05);
    });
  };

  // brass cups clacking (عرقسوس) or a bell
  A.clack = function (pos) {
    const dest = A.spatial(pos, 60, 0.25);
    if (!dest) return;
    const t = A.now();
    for (let i = 0; i < 6; i++) {
      const tt = t + i * 0.13 + (i % 2) * 0.03;
      [2210, 3380, 5150].forEach((f, k) => A.tone(dest, 'sine', f * G.rand(0.98, 1.02), tt, 0.12, 0.25 / (k + 1)));
    }
  };

  A.crowdBurst = function (pos, dur) {
    const dest = A.spatial(pos, 90, 0.5);
    if (!dest) return;
    const t = A.now();
    for (let i = 0; i < dur * 3; i++) A.noiseHit(dest, t + i / 3 + Math.random() * 0.2, 0.4, 0.4, 'bandpass', G.rand(500, 1300), 1.5);
  };

  // ---------- cassette radio: synthesized mahraganat loop ----------
  const HIJAZ = { D4: 293.66, Eb4: 311.13, Fs4: 369.99, G4: 392, A4: 440, Bb4: 466.16, C5: 523.25, D5: 587.33, Eb5: 622.25 };
  const LEAD = ['D5', null, 'C5', 'Bb4', 'A4', null, 'Bb4', 'A4', 'G4', null, 'Fs4', 'G4', 'A4', null, null, null,
    'A4', 'Bb4', 'A4', 'G4', 'Fs4', null, 'Eb4', 'D4', 'Eb4', 'Fs4', 'G4', null, 'A4', null, null, null,
    'D5', 'Eb5', 'D5', 'C5', 'Bb4', null, 'A4', null, 'Bb4', 'A4', 'G4', 'Fs4', 'G4', null, 'A4', null,
    'G4', 'Fs4', 'Eb4', 'D4', null, 'D4', 'Eb4', 'Fs4', 'G4', 'Fs4', 'Eb4', null, 'D4', null, null, null];
  const BASS = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0];

  A.toggleRadio = function () {
    if (!A.ready) return false;
    A.radioOn = !A.radioOn;
    if (A.radioOn) {
      A.radioBus = A.ctx.createGain();
      A.radioBus.gain.value = 0.2;
      const bp = A.ctx.createBiquadFilter(); bp.type = 'peaking'; bp.frequency.value = 1500; bp.gain.value = 6;
      A.radioBus.connect(bp); bp.connect(A.master);
      A.radioStep = 0;
      A.radioNext = A.now() + 0.05;
      A.radioTimer = setInterval(A.radioSched, 25);
    } else {
      clearInterval(A.radioTimer);
      const bus = A.radioBus;
      bus.gain.setTargetAtTime(0, A.now(), 0.05);
      setTimeout(() => bus.disconnect(), 400);
    }
    return A.radioOn;
  };

  A.radioSched = function () {
    const stepDur = 60 / 132 / 4;
    while (A.radioNext < A.now() + 0.15) {
      A.radioPlayStep(A.radioStep, A.radioNext, stepDur);
      A.radioNext += stepDur;
      A.radioStep = (A.radioStep + 1) % 64;
    }
  };

  A.radioPlayStep = function (s, t, sd) {
    const bus = A.radioBus;
    const st = s % 16;
    if (st % 4 === 0) A.tone(bus, 'sine', 140, t, 0.18, 1.0, 40); // kick
    if (st === 4 || st === 12) A.noiseHit(bus, t, 0.15, 0.7, 'highpass', 1500); // snare
    if (st === 10 || st === 14) A.noiseHit(bus, t, 0.08, 0.5, 'bandpass', 2500, 1); // clap
    if (st % 2 === 1) A.noiseHit(bus, t, 0.04, 0.25, 'highpass', 7000); // hat
    if (BASS[st]) A.tone(bus, 'sawtooth', s < 32 ? 73.4 : 77.8, t, sd * 2.5, 0.35); // bass
    const n = LEAD[s];
    if (n) {
      const o = A.tone(bus, 'sawtooth', HIJAZ[n], t, sd * 1.8, 0.16);
      const lfo = A.ctx.createOscillator(); lfo.frequency.value = 6;
      const lg = A.ctx.createGain(); lg.gain.value = 5;
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t); lfo.stop(t + sd * 2);
    }
  };
})(window.G);
