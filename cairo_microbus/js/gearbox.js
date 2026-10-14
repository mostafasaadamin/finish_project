'use strict';
// Manual gearbox: R, N, 1-5 with real ratios, rpm tied to the wheels through the clutch, a torque
// curve, engine braking and a rev limiter. Automatic clutch by default; full manual clutch as an
// option (grinding gears, stalling, ignition key). Includes the 3D H-pattern gear lever.
(function (G) {
  const GB = (G.Gearbox = {
    gear: 0, clutchManual: false, clutchPedal: 0, c: 0, shiftT: 0, engineOn: true, rpm: 800,
    gate: { x: -1, y: 0 }, view: { x: -1, y: 0 },
  });
  GB.K = 26.5; // wheel rpm per m/s with 0.36 m wheels: 60 / (2*pi*0.36)
  // overall ratios (gearbox x final drive): 1st tops out ~25 km/h, 5th ~120 km/h at 4800 rpm
  GB.RATIO = { '-1': 32.6, 1: 26.1, 2: 14.5, 3: 9.33, 4: 6.86, 5: 5.44 };
  GB.IDLE = 800;
  GB.RED = 4800;
  // H pattern: [column, row]
  const SLOT = { 1: [-1, 1], 2: [-1, -1], 3: [0, 1], 4: [0, -1], 5: [1, 1], '-1': [1, -1] };
  const slotGear = (col, row) => Object.keys(SLOT).map(Number).find((g) => SLOT[g][0] === col && SLOT[g][1] === row);

  GB.label = () => (GB.gear === 0 ? 'N' : GB.gear === -1 ? 'R' : GB.auto ? 'D' : String(GB.gear));
  // transmission: 'auto' (default), 'manual' (lever, automatic clutch) or 'clutch' (lever + clutch pedal)
  GB.mode = 'auto';
  try { GB.mode = localStorage.getItem('cm_trans') || 'auto'; } catch (e) { /* storage unavailable */ }
  GB.setMode = function (m) {
    GB.mode = m;
    GB.auto = m === 'auto';
    GB.clutchManual = m === 'clutch';
    if (GB.auto) { GB.engineOn = true; if (GB.gear === 0) GB.gear = 1; }
    try { localStorage.setItem('cm_trans', m); } catch (e) { /* storage unavailable */ }
    const hud = document.getElementById('hud');
    if (hud) hud.classList.toggle('auto', GB.auto);
  };
  GB.setMode(GB.mode);

  const sfx = (kind) => {
    const A = G.Audio;
    if (!A.ready) return;
    if (kind === 'shift' && A.playSample('gear_shift', null, 0.5, 0.6)) return;
    if (kind === 'grind' && A.playSample('gear_grind', null, 0.6, 0.8)) return;
    const dest = A.spatial(null, 0, kind === 'grind' ? 0.5 : 0.35);
    const t = A.now();
    if (kind === 'shift') { A.noiseHit(dest, t, 0.06, 0.8, 'bandpass', 1800, 2); A.tone(dest, 'square', 140, t + 0.03, 0.05, 0.4); }
    else if (kind === 'grind') { for (let i = 0; i < 6; i++) A.noiseHit(dest, t + i * 0.05, 0.06, 0.7, 'bandpass', G.rand(2500, 4500), 6); }
    else if (kind === 'stall') { A.tone(dest, 'sawtooth', 60, t, 0.5, 0.6, 18); }
    else if (kind === 'starter') { for (let i = 0; i < 8; i++) A.tone(dest, 'square', 55 + i * 4, t + i * 0.09, 0.07, 0.35); }
  };

  // try to engage a gear; returns false (and grinds) when the move isn't possible
  GB.shift = function (g, fromLever) {
    if (g === GB.gear) return true;
    const v = G.Player.speed;
    if (g !== 0) {
      if (GB.clutchManual && GB.clutchPedal < 0.6 && GB.engineOn) { sfx('grind'); G.HUD.toast('دوس الكلتش الأول! ⚙️'); return false; }
      if ((g === -1 && v > 1.5) || (g > 0 && v < -1.5)) { sfx('grind'); return false; }
    }
    GB.gear = g;
    GB.shiftT = GB.clutchManual ? 0 : 0.28;
    sfx('shift');
    if (!fromLever) { const s = SLOT[g]; GB.gate.x = s ? s[0] : GB.gate.x; GB.gate.y = s ? s[1] : 0; }
    return true;
  };
  GB.up = () => GB.shift(GB.gear === -1 ? 0 : Math.min(5, GB.gear + 1));
  GB.down = () => GB.shift(GB.gear <= 0 ? -1 : GB.gear - 1);

  GB.stall = function () {
    GB.engineOn = false;
    sfx('stall');
    G.HUD.toast('العربية فصلت! 😅 دوس الكلتش أو حط مور، وشغّل بالمفتاح 🔑');
  };
  GB.start = function () {
    if (GB.engineOn) return;
    if (G.Player.fuel <= 0) { G.HUD.toast('مفيش بنزين!'); return; }
    if (GB.gear !== 0 && GB.clutchManual && GB.clutchPedal < 0.6) { G.HUD.toast('حط مور (N) أو دوس الكلتش قبل ما تدوّر'); return; }
    sfx('starter');
    setTimeout(() => { GB.engineOn = true; GB.rpm = 1100; }, 650);
  };

  // per frame: returns forward acceleration from the engine and engine braking
  GB.update = function (dt, thr) {
    const v = G.Player.speed;
    GB.shiftT -= dt;
    GB.clutchPedal += ((G.Input.clutch ? 1 : 0) - GB.clutchPedal) * Math.min(1, dt * 10);
    if (G.Player.fuel <= 0 && GB.engineOn) GB.stall();
    const ratio = GB.gear === 0 ? 0 : GB.RATIO[GB.gear];
    const wheelRpm = Math.abs(v) * GB.K * ratio;
    let c;
    if (!ratio) c = 0;
    else if (GB.clutchManual) c = 1 - GB.clutchPedal;
    else if (GB.shiftT > 0) c = 0;
    else if (wheelRpm < 1300) c = thr > 0.05 ? G.clamp(0.3 + (wheelRpm / 1300) * 0.7, 0, 1) : wheelRpm < 750 ? 0 : 1;
    else c = 1;
    GB.c = c;
    if (GB.auto && GB.gear > 0 && GB.shiftT < -0.4) {
      if (wheelRpm > 3300 + thr * 900 && GB.gear < 5) GB.shift(GB.gear + 1);
      else if (wheelRpm < 1350 && GB.gear > 1) GB.shift(GB.gear - 1);
    }
    const free = GB.engineOn ? GB.IDLE + thr * (GB.RED + 200 - GB.IDLE) : 0;
    const target = c * Math.max(wheelRpm, GB.engineOn ? GB.IDLE * 0.55 : 0) + (1 - c) * free;
    GB.rpm += (target - GB.rpm) * Math.min(1, dt * (c > 0.9 ? 18 : 5));
    if (GB.clutchManual && GB.engineOn && ratio && c > 0.85 && wheelRpm < 420) GB.stall();
    let acc = 0, eb = 0;
    if (GB.engineOn && ratio) {
      const t = GB.rpm > GB.RED ? 0 : thr; // rev limiter
      const torque = G.clamp(1 - Math.pow((GB.rpm - 2600) / 3200, 2), 0.3, 1);
      acc = t * torque * ratio * 0.118 * c * (GB.gear === -1 ? -1 : 1);
    }
    if (ratio && c > 0.5 && thr < 0.05) eb = (GB.rpm / GB.RED) * ratio * 0.03 * c;
    return { acc, eb };
  };

  // ================= 3D GEAR LEVER =================
  GB.initLever = function (holder) {
    const W = holder.clientWidth || 150, H = holder.clientHeight || 150;
    const r = (GB.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.setSize(W, H);
    r.outputEncoding = THREE.sRGBEncoding;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    holder.appendChild(r.domElement);
    const scene = (GB.scene = new THREE.Scene());
    const pm = new THREE.PMREMGenerator(r);
    if (THREE.RoomEnvironment) scene.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture;
    const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
    const cam = (GB.cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 50));
    cam.position.set(0, 5.2, 5.4);
    cam.lookAt(0, 0.95, 0);
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(2, 6, 3);
    scene.add(sun, new THREE.AmbientLight(0xffffff, 0.25));

    // console plate with the engraved H gate
    const pc = G.canvas(512, 512), x = pc.getContext('2d');
    const gr = x.createRadialGradient(256, 256, 40, 256, 256, 360);
    gr.addColorStop(0, '#2a2a2c'); gr.addColorStop(1, '#141415');
    x.fillStyle = gr; x.fillRect(0, 0, 512, 512);
    G.noise(x, 512, 512, 9000, 0.05);
    x.strokeStyle = '#050505'; x.lineWidth = 26; x.lineCap = 'round';
    x.beginPath();
    [-1, 0, 1].forEach((c) => { x.moveTo(256 + c * 130, 256 - 150); x.lineTo(256 + c * 130, 256 + 150); });
    x.moveTo(256 - 130, 256); x.lineTo(256 + 130, 256);
    x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.08)'; x.lineWidth = 2; x.stroke();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.18, 3.2), new THREE.MeshStandardMaterial({ map: G.tex(pc), roughness: 0.75, metalness: 0.1, envMapIntensity: 0.5 }));
    plate.position.y = -0.09;
    scene.add(plate);
    // chrome trim ring
    const trim = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.06, 12, 48), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.18 }));
    trim.rotation.x = Math.PI / 2; trim.position.y = 0.02;
    scene.add(trim);
    // leather boot with wrinkles
    const boot = new THREE.CylinderGeometry(0.2, 1.0, 0.95, 28, 10, true);
    const bp = boot.attributes.position;
    for (let i = 0; i < bp.count; i++) {
      const px = bp.getX(i), py = bp.getY(i), pz = bp.getZ(i);
      const a = Math.atan2(pz, px), w = 1 + 0.07 * Math.sin(a * 9 + py * 14) * (0.5 - py);
      bp.setXYZ(i, px * w, py, pz * w);
    }
    boot.computeVertexNormals();
    boot.translate(0, 0.47, 0);
    const bootM = new THREE.Mesh(boot, new THREE.MeshStandardMaterial({ color: lin(0x1a1714), roughness: 0.62, metalness: 0, envMapIntensity: 0.35, side: THREE.DoubleSide }));
    scene.add(bootM);
    GB.bootGeo = boot; GB.bootBase = Float32Array.from(boot.attributes.position.array);
    // lever: pivot at the boot base, chrome rod and a knob with the engraved pattern
    const pivot = (GB.pivot = new THREE.Group());
    pivot.position.y = 0.15;
    scene.add(pivot);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 1.9, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.12 }));
    rod.position.y = 0.95;
    pivot.add(rod);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 24), new THREE.MeshStandardMaterial({ color: lin(0x0c0c0d), roughness: 0.25, metalness: 0.1, envMapIntensity: 0.6 }));
    knob.scale.set(1, 0.85, 1);
    knob.position.y = 2.0;
    pivot.add(knob);
    const kc = G.canvas(256, 256), kx = kc.getContext('2d');
    kx.fillStyle = '#0b0b0c'; kx.fillRect(0, 0, 256, 256);
    kx.strokeStyle = '#e0e0e0'; kx.lineWidth = 5;
    kx.beginPath();
    [-1, 0, 1].forEach((c) => { kx.moveTo(128 + c * 50, 70); kx.lineTo(128 + c * 50, 186); });
    kx.moveTo(78, 128); kx.lineTo(178, 128); kx.stroke();
    kx.fillStyle = '#ffffff'; kx.font = 'bold 34px Arial'; kx.textAlign = 'center'; kx.textBaseline = 'middle';
    [['1', 78, 46], ['3', 128, 46], ['5', 178, 46], ['2', 78, 212], ['4', 128, 212], ['R', 178, 212]].forEach(([t, px, py]) => kx.fillText(t, px, py));
    const decal = new THREE.Mesh(new THREE.CircleGeometry(0.31, 32), new THREE.MeshStandardMaterial({ map: G.tex(kc), roughness: 0.3, transparent: true }));
    decal.rotation.x = -Math.PI / 2;
    decal.position.y = 2.36;
    pivot.add(decal);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.035, 10, 32), new THREE.MeshStandardMaterial({ color: 0xcfcfcf, metalness: 1, roughness: 0.2 }));
    ring.rotation.x = Math.PI / 2; ring.position.y = 1.75;
    pivot.add(ring);

    GB.bindLever(r.domElement);
    GB.dirty = true;
  };

  // drag the knob along the H gate
  GB.bindLever = function (el) {
    let drag = false;
    const toGate = (e) => {
      const b = el.getBoundingClientRect();
      return { x: G.clamp(((e.clientX - b.left) / b.width - 0.5) / 0.3, -1, 1), y: G.clamp(-((e.clientY - b.top) / b.height - 0.55) / 0.3, -1, 1) };
    };
    const move = (p) => {
      let { x, y } = GB.gate;
      if (Math.abs(y) < 0.22) x = p.x; // along the neutral rail
      const col = Math.round(x);
      if (Math.abs(x - col) < 0.3) { x = Math.abs(p.y) > 0.22 ? col : x; y = p.y; } else y = 0;
      GB.gate.x = x; GB.gate.y = y;
      if (Math.abs(y) > 0.82) {
        const g = slotGear(col, Math.sign(y));
        if (g !== GB.gear && !GB.shift(g, true)) GB.gate.y = 0.5 * Math.sign(y); // pushed back out of the slot
      } else if (Math.abs(y) < 0.3 && GB.gear !== 0) GB.shift(0, true);
      GB.dirty = true;
    };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); drag = true; move(toGate(e)); });
    el.addEventListener('pointermove', (e) => { if (drag) move(toGate(e)); });
    const up = () => {
      drag = false;
      // let go between slots: spring back to neutral
      if (Math.abs(GB.gate.y) <= 0.82) { GB.gate.y = 0; if (GB.gear !== 0) GB.shift(0, true); }
      else GB.gate.y = Math.sign(GB.gate.y);
      GB.gate.x = Math.abs(GB.gate.y) > 0.5 ? Math.round(GB.gate.x) : GB.gate.x;
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  GB.renderLever = function (dt, t) {
    if (!GB.renderer) return;
    const v = GB.view;
    v.x += (GB.gate.x - v.x) * Math.min(1, dt * 18);
    v.y += (GB.gate.y - v.y) * Math.min(1, dt * 18);
    const shake = GB.engineOn ? Math.sin(t * (GB.rpm / 60) * 0.5) * 0.004 * (GB.rpm / 2000) : 0;
    GB.pivot.rotation.x = -v.y * 0.36 + shake;
    GB.pivot.rotation.z = -v.x * 0.3;
    // the boot follows the lever a little
    const p = GB.bootGeo.attributes.position, b = GB.bootBase;
    for (let i = 0; i < p.count; i++) {
      const h = b[i * 3 + 1] / 0.95;
      p.setXYZ(i, b[i * 3] + v.x * 0.25 * h * h, b[i * 3 + 1], b[i * 3 + 2] - v.y * 0.28 * h * h);
    }
    p.needsUpdate = true;
    GB.renderer.render(GB.scene, GB.cam);
  };
})(window.G);
