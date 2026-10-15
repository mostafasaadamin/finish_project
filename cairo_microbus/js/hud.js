'use strict';
// HUD, touch controls and keyboard input.
(function (G) {
  const H = (G.HUD = {});
  const I = (G.Input = { steer: 0, gas: 0, brake: 0, kbUp: false, kbDown: false, kbLeft: false, kbRight: false, handbrake: false, wheelActive: false });
  const $ = (id) => document.getElementById(id);

  H.init = function () {
    if (G.SIMPLE) { const fb = $('footBtns'); if (fb) fb.style.display = 'none'; }
    H.mm = $('minimap'); H.mmx = H.mm.getContext('2d');
    H.gg = $('gauges'); H.ggx = H.gg.getContext('2d');
    H.wheel = $('wheel');
    H.bindKeys();
    H.bindTouch();
    H.resizeCanvases();
    window.addEventListener('resize', H.resizeCanvases);
    H.voiceStatus();
  };

  H.resizeCanvases = function () {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    [H.mm, H.gg].forEach((c) => {
      const r = c.getBoundingClientRect();
      c.width = Math.max(1, Math.round(r.width * dpr));
      c.height = Math.max(1, Math.round(r.height * dpr));
    });
  };

  // ---------------- input ----------------
  H.bindKeys = function () {
    const set = (e, v) => {
      const k = e.key.toLowerCase();
      if (['arrowup', 'w'].includes(k)) I.kbUp = v;
      else if (['arrowdown', 's'].includes(k)) I.kbDown = v;
      else if (['arrowleft', 'a'].includes(k)) I.kbLeft = v;
      else if (['arrowright', 'd'].includes(k)) I.kbRight = v;
      else if (k === ' ') { if (G.Foot.active) { if (v) G.Foot.punch(); } else I.handbrake = v; }
      else if (k === 'g') I.hold = v;
      else if (k === 'h') G.Audio.horn(v);
      else if (k === 'shift') I.clutch = v;
      else return false;
      return true;
    };
    window.addEventListener('keydown', (e) => {
      if (G.Main && !G.Main.started) return;
      if (set(e, true)) { e.preventDefault(); return; }
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'j') G.Audio.musicHorn();
      else if (k === 'f') G.Events.collectFare();
      else if (k === 'c') G.Events.callRoute();
      else if (k === 'v') H.cycleCamera();
      else if (k === 'm') H.toggleRadio();
      else if (k === 'r') G.Gearbox.shift(-1);
      else if (k === '0' || k === 'n' && false) G.Gearbox.shift(0);
      else if (/^[1-5]$/.test(k)) G.Gearbox.shift(+k);
      else if (k === 'i') G.Gearbox.start();
      else if (k === 'q') H.setBlink(-1);
      else if (k === 'e') H.setBlink(1);
      else if (k === 'x') H.setBlink(2);
      else if (k === 'p' || k === 'escape') H.togglePause();
      else if (k === 'b' && !G.SIMPLE) (G.Foot.active ? G.Foot.enter() : G.Foot.exit());
      else if (k === 'n' && !G.SIMPLE) G.Combat.kickPassenger();
    });
    window.addEventListener('keyup', (e) => set(e, false));
    window.addEventListener('blur', () => { I.kbUp = I.kbDown = I.kbLeft = I.kbRight = I.handbrake = false; I.gas = I.brake = 0; G.Audio.horn(false); });
  };

  const hold = (el, down, up) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('pressed'); down(e); });
    const end = () => { el.classList.remove('pressed'); up(); };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  };
  const tap = (id, fn) => $(id).addEventListener('click', (e) => { e.preventDefault(); fn(); });

  H.bindTouch = function () {
    // steering wheel: drag in a circle
    const w = H.wheel;
    let startA = 0, baseRot = 0, rot = 0, lastA = 0;
    const angle = (e) => {
      const r = w.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
    };
    const joy = (e) => {
      const r = w.getBoundingClientRect();
      const jx = G.clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2), -1, 1);
      const jy = G.clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2), -1, 1);
      G.Foot.joy.x = jx; G.Foot.joy.y = jy;
      $('joyKnob').style.transform = `translate(${jx * 60}%,${jy * 60}%)`;
    };
    w.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      w.setPointerCapture(e.pointerId);
      if (G.Foot.active) { H.joyActive = true; joy(e); return; }
      // the middle of the wheel is the horn, like a real car
      const r = w.getBoundingClientRect();
      if (Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height * 0.56)) < r.width * 0.17) { H.hubHorn = true; G.Audio.horn(true); return; }
      I.wheelActive = true;
      startA = lastA = angle(e);
      baseRot = rot = G.Player.steer * 135;
    });
    w.addEventListener('pointermove', (e) => {
      if (H.joyActive) { joy(e); return; }
      if (!I.wheelActive) return;
      const a = angle(e);
      let d = a - lastA;
      if (d > Math.PI) d -= Math.PI * 2;
      if (d < -Math.PI) d += Math.PI * 2;
      lastA = a;
      rot = G.clamp(rot + (d * 180) / Math.PI, -135, 135);
      I.steer = rot / 135;
    });
    const release = () => {
      if (H.hubHorn) { H.hubHorn = false; G.Audio.horn(false); }
      I.wheelActive = false; I.steer = 0;
      H.joyActive = false; G.Foot.joy.x = G.Foot.joy.y = 0;
      $('joyKnob').style.transform = '';
    };
    w.addEventListener('pointerup', release);
    w.addEventListener('pointercancel', release);
    void startA; void baseRot;

    hold($('gas'), () => (I.gas = 1), () => (I.gas = 0));
    hold($('brake'), () => (I.brake = 1), () => (I.brake = 0));
    hold($('horn'), () => G.Audio.horn(true), () => G.Audio.horn(false));
    tap('musichorn', () => G.Audio.musicHorn());
    tap('exitBtn', () => (G.Foot.active ? G.Foot.enter() : G.Foot.exit()));
    tap('kickBtn', () => G.Combat.kickPassenger());
    hold($('punchBtn'), () => G.Foot.punch(), () => {});
    hold($('holdBtn'), () => (I.hold = true), () => (I.hold = false));
    hold($('clutch'), () => (I.clutch = true), () => (I.clutch = false));
    tap('keyBtn', () => G.Gearbox.start());
    tap('clutchBtn', () => {
      const order = ['auto', 'manual', 'clutch'];
      G.Gearbox.setMode(order[(order.indexOf(G.Gearbox.mode) + 1) % 3]);
      H.voiceStatus();
    });
    tap('gfxBtn', () => {
      try { localStorage.setItem('cm_hq', G.Main.hq ? '0' : '1'); } catch (e) { /* storage unavailable */ }
      location.reload(); // shadow settings are baked into the shaders
    });
    tap('blinkL', () => H.setBlink(-1));
    tap('blinkR', () => H.setBlink(1));
    tap('hazard', () => H.setBlink(2));
    tap('camBtn', () => H.cycleCamera());
    tap('fareBtn', () => G.Events.collectFare());
    tap('callBtn', () => G.Events.callRoute());
    tap('radioBtn', () => H.toggleRadio());
    tap('fuelPlus', () => G.Events.buyFuel());
    tap('moneyPlus', () => H.toast('الفلوس بتيجي من الركاب يا اسطى 😉 لمّ الأجرة!'));
    tap('pauseBtn', () => H.togglePause());
    tap('resumeBtn', () => H.togglePause());
    tap('voiceBtn', () => {
      G.Voice.enabled = !G.Voice.enabled;
      if (!G.Voice.enabled) G.Voice.stopCurrent();
      H.voiceStatus();
    });
  };

  H.setMode = function (mode) {
    $('hud').classList.toggle('foot', mode === 'foot');
    $('exitBtn').querySelector('span').textContent = mode === 'foot' ? 'اركب' : 'انزل';
    $('punchBtn').classList.toggle('hidden', mode !== 'foot');
    $('hpBar').classList.toggle('hidden', mode !== 'foot');
    I.kbUp = I.kbDown = I.kbLeft = I.kbRight = false; I.gas = I.brake = 0;
  };
  H.flash = function () {
    const f = $('flash');
    f.classList.add('on');
    setTimeout(() => f.classList.remove('on'), 60);
  };

  H.setGear = function (g) {
    if (Math.abs(G.Player.speed) > 1.5 && g !== G.Player.gear) { H.toast('اقف الأول قبل ما تغيّر الفتيس!'); return; }
    G.Player.gear = g;
  };
  H.setBlink = function (v) {
    G.Player.blink = G.Player.blink === v ? 0 : v;
    G.Player.blinkStartH = null;
    G.Player.blinkT = 0;
  };
  H.toggleRadio = function () {
    const on = G.Audio.toggleRadio();
    $('radioBtn').classList.toggle('on', on);
    H.toast(on ? (G.Audio.hasSample('mezmar') ? '📻 الكاسيت شغّال: مزمار بلدي' : '📻 الكاسيت شغّال') : '📻 الكاسيت اتقفل');
  };
  H.cycleCamera = function () {
    G.Main.camMode = (G.Main.camMode + 1) % 3;
    H.toast(['📷 كاميرا ورا العربية', '📷 كاميرا بعيدة', '📷 من جوه الكابينة'][G.Main.camMode]);
  };
  H.togglePause = function () {
    G.Main.paused = !G.Main.paused;
    $('pause').classList.toggle('hidden', !G.Main.paused);
    if (G.Audio.ctx) G.Main.paused ? G.Audio.ctx.suspend() : G.Audio.ctx.resume();
        if (G.Main.paused) G.Voice.stopCurrent();
  };

  H.voiceStatus = function () {
    const el = $('voiceStatus');
    if (el) el.textContent = G.Voice.voiceLabel || 'بيدوّر على صوت عربي…';
    const b = $('voiceBtn');
    if (b) b.textContent = G.Voice.enabled ? '🔊 أصوات الكلام: شغّالة' : '🔇 أصوات الكلام: مقفولة';
    const gb = $('gfxBtn');
    if (gb) gb.textContent = G.Main.hq ? '🎨 الجرافيكس: عالي (بظلال) – دوس لو بتقطّع' : '🎨 الجرافيكس: منخفض (أسرع)';
    const cb = $('clutchBtn');
    if (cb) cb.textContent = { auto: '⚙️ الفتيس: أوتوماتيك', manual: '⚙️ الفتيس: مانوال (كلتش أوتوماتيك)', clutch: '⚙️ الفتيس: مانوال بالكلتش (ممكن العربية تفصل)' }[G.Gearbox.mode];
  };

  H.toast = function (text) {
    const box = $('toasts');
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = text;
    box.appendChild(t);
    while (box.children.length > 3) box.removeChild(box.firstChild);
    setTimeout(() => t.classList.add('fade'), 2800);
    setTimeout(() => t.remove(), 3500);
  };

  H.floatMoney = function (n, label) {
    const el = document.createElement('div');
    el.className = 'floatMoney ' + (n >= 0 ? 'plus' : 'minus');
    el.textContent = `${n >= 0 ? '+' : '−'}${G.fmt(Math.abs(n))} ج ${label ? '(' + label + ')' : ''}`;
    $('moneyBox').appendChild(el);
    setTimeout(() => el.remove(), 1800);
  };

  // ---------------- per-frame ----------------
  let frame = 0;
  H.update = function () {
    const Pl = G.Player;
    frame++;
    $('pax').textContent = `${Pl.passengers.length}/${Pl.cap}`;
    $('money').textContent = G.fmt(Pl.money);
    $('fuel').textContent = Math.floor(Pl.fuel);
    $('fuelPill').classList.toggle('low', Pl.fuel < 8);
    const name = G.World.roadName(Pl.pos.x, Pl.pos.z);
    if (name && name !== H.lastRoad) { H.lastRoad = name; $('street').textContent = name; }
    $('keyBtn').classList.toggle('hidden', G.Gearbox.engineOn || G.Foot.active);
    ['blinkL', 'blinkR', 'hazard'].forEach((id, k) => $(id).classList.toggle('on', Pl.blinkOn && Pl.blink === [-1, 1, 2][k]));
    H.wheel.style.transform = G.Foot.active ? '' : `rotate(${Pl.steer * 135}deg)`;
    const E = G.Events;
    $('kickBtn').classList.toggle('hidden', !(E.angry && performance.now() / 1000 < E.angry.until && !G.Foot.active));
    $('holdBtn').classList.toggle('hidden', !G.Foot.canSeparate);
    $('holdFill').style.height = Math.min(100, (G.Foot.holdT / 2.4) * 100) + '%';
    if (G.Foot.active) $('hpFill').style.width = G.Foot.hp + '%';
    $('exitBtn').classList.toggle('dim', !G.Foot.active && Math.abs(Pl.speed) > 1.5);
    if (frame % 15 === 0) H.updateNext();
    H.drawMinimap();
    H.drawGauges();
  };

  H.updateNext = function () {
    const Pl = G.Player;
    const el = $('nextStop');
    if (!Pl.passengers.length) {
      el.innerHTML = '🚐 العربية فاضية – روح أقرب <b>موقف</b> (العلامة الزرقا) ونادي على الركاب';
      return;
    }
    const counts = {};
    Pl.passengers.forEach((p) => (counts[p.dest] = (counts[p.dest] || 0) + 1));
    let best = null, bd = 1e9;
    Object.keys(counts).forEach((k) => {
      const d = G.dist2(G.World.STATIONS[k].stopPos, Pl.pos);
      if (d < bd) { bd = d; best = k; }
    });
    const unpaid = Pl.passengers.filter((p) => !p.paid).length;
    el.innerHTML = `📍 المحطة الجاية: <b>${G.World.STATIONS[best].name}</b> (${G.arDigits(counts[best])} نازلين) – ${G.arDigits(Math.round(bd))} متر` +
      (unpaid ? ` · 💰 <b>${G.arDigits(unpaid)}</b> لسه ما دفعوش` : '');
  };

  H.drawMinimap = function () {
    const c = H.mm, x = H.mmx, Pl = G.Player, C = G.World;
    const W = c.width, Hh = c.height, cx = W / 2, cy = Hh * 0.62;
    const s = W / 230; // pixels per metre
    const h = Pl.heading, cs = Math.cos(h), sn = Math.sin(h);
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = '#6b6b6b';
    x.fillRect(0, 0, W, Hh);
    // world -> map: forward is up
    const a = -s * cs, b = -s * sn, cc = s * sn, d = -s * cs;
    x.setTransform(a, b, cc, d, cx - (a * Pl.pos.x + cc * Pl.pos.z), cy - (b * Pl.pos.x + d * Pl.pos.z));
    G.World.drawMap(x);
    x.setTransform(1, 0, 0, 1, 0, 0);
    const toMap = (wx, wz) => {
      const dx = wx - Pl.pos.x, dz = wz - Pl.pos.z;
      return [cx + s * (-cs * dx + sn * dz), cy - s * (sn * dx + cs * dz)];
    };
    const clampPt = ([px, py]) => [G.clamp(px, 10, W - 10), G.clamp(py, 10, Hh - 10)];
    const dests = new Set(Pl.passengers.map((p) => p.dest));
    G.People.stations.forEach((st) => {
      const [px, py] = clampPt(toMap(st.s.stopPos.x, st.s.stopPos.z));
      const isDest = dests.has(st.s.idx);
      x.fillStyle = isDest ? '#e53935' : '#1e88e5';
      x.beginPath(); x.arc(px, py, W * 0.045, 0, 7); x.fill();
      x.strokeStyle = '#fff'; x.lineWidth = W * 0.01; x.stroke();
      x.fillStyle = '#fff'; x.font = `bold ${Math.round(W * 0.05)}px ${G.FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText(isDest ? '⬇' : String(st.waiting.length), px, py + 1);
    });
    const [gx, gy] = clampPt(toMap(C.gasPos.x, C.gasPos.z));
    x.font = `${Math.round(W * 0.08)}px sans-serif`;
    x.fillText('⛽', gx, gy);
    const [qx, qy] = toMap(C.checkpointPos.x, C.checkpointPos.z);
    if (qx > 0 && qx < W && qy > 0 && qy < Hh) x.fillText('🚓', qx, qy);
    // player arrow
    x.fillStyle = '#1e88e5'; x.strokeStyle = '#fff'; x.lineWidth = W * 0.012;
    x.beginPath();
    x.moveTo(cx, cy - W * 0.06); x.lineTo(cx + W * 0.04, cy + W * 0.04); x.lineTo(cx, cy + W * 0.015); x.lineTo(cx - W * 0.04, cy + W * 0.04);
    x.closePath(); x.fill(); x.stroke();
  };

  H.drawGauges = function () {
    const c = H.gg, x = H.ggx, Pl = G.Player;
    const W = c.width, Hh = c.height, k = W / 320;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, W, Hh);
    const dial = (cx, cy, r, val, max, step, label, warnFrom) => {
      x.fillStyle = 'rgba(15,15,18,0.85)';
      x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
      x.strokeStyle = '#555'; x.lineWidth = 3 * k; x.stroke();
      const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      if (warnFrom != null) {
        x.strokeStyle = '#c62828'; x.lineWidth = 4 * k;
        x.beginPath(); x.arc(cx, cy, r * 0.86, a0 + (a1 - a0) * (warnFrom / max), a1); x.stroke();
      }
      x.fillStyle = '#ddd'; x.font = `${Math.round(r * 0.16)}px Arial`; x.textAlign = 'center'; x.textBaseline = 'middle';
      for (let v = 0; v <= max + 1e-6; v += step) {
        const a = a0 + (a1 - a0) * (v / max);
        x.strokeStyle = '#ccc'; x.lineWidth = 1.5 * k;
        x.beginPath(); x.moveTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78); x.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92); x.stroke();
        if (r > 40 * k) x.fillText(String(Math.round(v)), cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62);
      }
      const a = a0 + (a1 - a0) * G.clamp(val / max, 0, 1);
      x.strokeStyle = '#ff3d00'; x.lineWidth = 3 * k;
      x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * r * 0.82, cy + Math.sin(a) * r * 0.82); x.stroke();
      x.fillStyle = '#222'; x.beginPath(); x.arc(cx, cy, r * 0.1, 0, 7); x.fill();
      x.fillStyle = '#aaa'; x.font = `${Math.round(r * 0.15)}px Arial`;
      x.fillText(label, cx, cy + r * 0.4);
    };
    const kmh = Math.abs(Pl.speed) * 3.6;
    dial(62 * k, 95 * k, 52 * k, Pl.rpm / 1000, 6, 1, 'RPM x1000', 4.8);
    dial(258 * k, 95 * k, 52 * k, Pl.fuel, Pl.maxFuel, 15, 'FUEL', null);
    dial(160 * k, 82 * k, 74 * k, kmh, 140, 20, 'km/h', null);
    x.fillStyle = '#fff'; x.font = `bold ${Math.round(24 * k)}px Arial`; x.textAlign = 'center';
    x.fillText(String(Math.round(kmh)), 160 * k, 128 * k);
    x.fillStyle = Pl.gear === 'R' ? '#ff5252' : Pl.gear === 'N' ? '#ffd54a' : '#69f0ae';
    x.font = `bold ${Math.round(16 * k)}px Arial`;
    x.fillText(Pl.gear, 160 * k, 52 * k);
  };
})(window.G);
