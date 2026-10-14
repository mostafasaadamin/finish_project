'use strict';
// The player's microbus + gameplay events (passengers, fares, fights with other drivers, police, fuel).
(function (G) {
  const Pl = (G.Player = {
    pos: new THREE.Vector3(), heading: 0, speed: 0, steer: 0, gear: 'D', throttle: 0, braking: false,
    fuel: 35, maxFuel: 60, money: 300, passengers: [], cap: 14, len: 4.8, wid: 1.9, rpm: 800, gearN: 1,
    blink: 0, blinkOn: false, blinkT: 0, shake: 0, delivered: 0, earned: 0, type: 'microbus',
  });
  const PASSENGER_VOICES = ['passenger', 'passengerF', 'oldman', 'passenger2', 'passengerF'];

  Pl.init = function (scene) {
    const v = G.Models.vehicle('microbus');
    Pl.mesh = v.mesh;
    Pl.body = v.body;
    scene.add(Pl.mesh);
    const plateGeo = new THREE.PlaneGeometry(0.52, 0.26);
    const rear = new THREE.Mesh(plateGeo, G.Mat.plate);
    rear.position.set(0, 0.62, -2.52); rear.rotation.y = Math.PI;
    const front = new THREE.Mesh(plateGeo, G.Mat.plate);
    front.position.set(0, 0.6, 2.52);
    Pl.body.add(rear, front);
    // brake lights + blinkers
    const bm = (Pl.brakeMat = new THREE.MeshBasicMaterial({ color: '#550000' }));
    [0.82, -0.82].forEach((x) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.2), bm);
      m.position.set(x, 1.1, -2.45); m.rotation.y = Math.PI;
      Pl.body.add(m);
    });
    Pl.blinkers = { L: [], R: [] };
    const om = new THREE.MeshBasicMaterial({ color: '#ffab00' });
    [[0.82, 2.45, 'L'], [-0.82, 2.45, 'R'], [0.82, -2.45, 'L'], [-0.82, -2.45, 'R']].forEach(([x, z, side]) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.04), om);
      m.position.set(x, z > 0 ? 0.65 : 0.82, z + Math.sign(z) * 0.0);
      m.visible = false;
      Pl.body.add(m);
      Pl.blinkers[side].push(m);
    });
    const s = G.World.STATIONS[0];
    Pl.heading = s.heading;
    Pl.pos.copy(s.stopPos).addScaledVector(new THREE.Vector3(Math.sin(s.heading), 0, Math.cos(s.heading)), -28);
  };

  Pl.fwd = () => new THREE.Vector3(Math.sin(Pl.heading), 0, Math.cos(Pl.heading));

  const circ = [], carCirc = [];
  Pl.update = function (dt) {
    const I = G.Input;
    const engineOn = Pl.fuel > 0;
    const prevSpeed = Pl.speed;

    // steering (touch wheel is direct, keyboard is smoothed)
    if (I.wheelActive) Pl.steer = I.steer;
    else Pl.steer += (I.steer - Pl.steer) * Math.min(1, dt * (I.steer === 0 ? 5 : 2.6));

    // throttle / brake / auto reverse on keyboard
    let thr = 0, brk = I.brake;
    if (I.kbUp) { if (Pl.speed < -0.5) brk = 1; else { Pl.gear = 'D'; thr = 1; } }
    if (I.kbDown) { if (Pl.speed > 0.5) brk = 1; else { Pl.gear = 'R'; thr = 1; } }
    if (I.gas > 0) thr = Math.max(thr, I.gas);
    if (I.handbrake) brk = 1;
    if (!engineOn) thr = 0;
    Pl.throttle = thr;
    const MAX = 29;
    if (Pl.gear === 'D') {
      if (Pl.speed >= -0.2) Pl.speed += thr * 4.3 * (1 - Pl.speed / MAX) * dt;
      else brk = Math.max(brk, thr);
    } else {
      if (Pl.speed <= 0.2) Pl.speed -= thr * 3 * (1 + Pl.speed / 7) * dt;
      else brk = Math.max(brk, thr);
    }
    if (brk > 0) {
      const b = brk * 13 * dt;
      Pl.speed = Pl.speed > 0 ? Math.max(0, Pl.speed - b) : Math.min(0, Pl.speed + b);
    }
    const drag = (0.35 + 0.0015 * Pl.speed * Pl.speed) * dt;
    Pl.speed = Pl.speed > 0 ? Math.max(0, Pl.speed - drag) : Math.min(0, Pl.speed + drag);
    Pl.braking = brk > 0.1;

    const sa = (Pl.steer * 0.6) / (1 + Math.abs(Pl.speed) * 0.05);
    Pl.heading -= (Pl.speed / 2.6) * Math.tan(sa) * dt;
    Pl.pos.x += Math.sin(Pl.heading) * Pl.speed * dt;
    Pl.pos.z += Math.cos(Pl.heading) * Pl.speed * dt;

    Pl.fuel = Math.max(0, Pl.fuel - (0.003 + thr * 0.045) * dt);

    // engine rpm with an automatic gearbox
    const s = Math.abs(Pl.speed), TH = [0, 5, 10, 16, 22, 31];
    let g = 1;
    while (g < 5 && s > TH[g]) g++;
    Pl.gearN = g;
    let rpm = 1000 + ((s - TH[g - 1]) / (TH[g] - TH[g - 1])) * 3200;
    if (s < 0.5) rpm = 800 + thr * 2600;
    Pl.rpm += (G.clamp(rpm, 700, 4800) - Pl.rpm) * Math.min(1, dt * 6);
    G.Audio.updateEngine(Pl.rpm, thr, Pl.speed, engineOn);

    Pl.collide();

    // hard braking with passengers on board
    if (prevSpeed > 9 && (prevSpeed - Pl.speed) / dt > 10.5) {
      G.Events.reckless();
      if (G.Events.ready('skid', 2)) G.Audio.playSample('skid', null, 0.5, 1.5);
    }

    // blinkers
    if (Pl.blink) {
      Pl.blinkT -= dt;
      if (Pl.blinkT <= 0) { Pl.blinkT = 0.4; Pl.blinkOn = !Pl.blinkOn; G.Audio.tick(Pl.blinkOn); }
    } else Pl.blinkOn = false;
    Pl.blinkers.L.forEach((m) => (m.visible = Pl.blinkOn && (Pl.blink === -1 || Pl.blink === 2)));
    Pl.blinkers.R.forEach((m) => (m.visible = Pl.blinkOn && (Pl.blink === 1 || Pl.blink === 2)));
    Pl.brakeMat.color.set(Pl.braking ? '#ff1a1a' : '#550000');

    Pl.mesh.position.set(Pl.pos.x, 0, Pl.pos.z);
    Pl.mesh.rotation.y = Pl.heading;
    Pl.body.rotation.z = -Pl.steer * G.clamp(Math.abs(Pl.speed) / 20, 0, 1) * 0.05;
    Pl.body.rotation.x = G.lerp(Pl.body.rotation.x, G.clamp((prevSpeed - Pl.speed) / dt, -6, 12) * 0.004, Math.min(1, dt * 5));
    Pl.shake = Math.max(0, Pl.shake - dt * 2);
  };

  Pl.collide = function () {
    const C = G.World;
    let impact = 0;
    const v = Pl.fwd().multiplyScalar(Pl.speed);
    for (let it = 0; it < 2; it++) {
      G.Traffic.circles(Pl, Pl.pos, Pl.heading, circ);
      for (const c of circ) {
        const p = G.World.collide(c.x, c.z, c.r);
        if (!p) continue;
        Pl.pos.x += p.x; Pl.pos.z += p.z;
        c.x += p.x; c.z += p.z;
        const len = Math.hypot(p.x, p.z) || 1;
        const vn = -(v.x * p.x + v.z * p.z) / len;
        if (vn > impact) impact = vn;
      }
    }
    if (impact > 0.5) {
      const ratio = impact / Math.max(0.1, Math.abs(Pl.speed));
      if (ratio > 0.55) Pl.speed = -Pl.speed * 0.15;
      else Pl.speed *= 0.9;
      if (impact > 4) G.Events.crash(impact, null);
    }
    // other cars
    G.Traffic.circles(Pl, Pl.pos, Pl.heading, circ);
    let hit = null, hitImpact = 0;
    for (const car of G.Traffic.cars) {
      if (Math.abs(car.pos.x - Pl.pos.x) > 14 || Math.abs(car.pos.z - Pl.pos.z) > 14) continue;
      G.Traffic.circles(car, car.pos, car.heading, carCirc);
      for (const a of circ) for (const b of carCirc) {
        const dx = a.x - b.x, dz = a.z - b.z, d = Math.hypot(dx, dz), min = a.r + b.r;
        if (d >= min || d < 1e-4) continue;
        const nx = dx / d, nz = dz / d, ov = min - d;
        Pl.pos.x += nx * ov * 0.7; Pl.pos.z += nz * ov * 0.7;
        car.pos.x -= nx * ov * 0.3; car.pos.z -= nz * ov * 0.3;
        const rel = -((v.x - car.fwd.x * car.speed) * nx + (v.z - car.fwd.z * car.speed) * nz);
        if (rel > hitImpact) { hitImpact = rel; hit = car; }
      }
    }
    for (const n of G.Combat.npcs) {
      if (n.state === 'dead' || Math.abs(n.obj.position.x - Pl.pos.x) > 5 || Math.abs(n.obj.position.z - Pl.pos.z) > 5) continue;
      for (const a of circ) {
        const dx = n.obj.position.x - a.x, dz = n.obj.position.z - a.z, d = Math.hypot(dx, dz);
        if (d < a.r + 0.4) {
          if (!G.Combat.vehicleHit(n.obj, Math.abs(Pl.speed), false) && d > 1e-4) {
            n.obj.position.x += (dx / d) * (a.r + 0.4 - d); n.obj.position.z += (dz / d) * (a.r + 0.4 - d);
          }
          break;
        }
      }
    }
    if (hit && hitImpact > 1.5) {
      Pl.speed *= 0.35;
      hit.speed = 0;
      hit.stun = 3;
      if (hitImpact > 2.5) G.Events.crash(hitImpact, hit);
    }
    const bd = G.World.bounds;
    Pl.pos.x = G.clamp(Pl.pos.x, bd.minX, bd.maxX);
    Pl.pos.z = G.clamp(Pl.pos.z, bd.minZ, bd.maxZ);
  };

  // =================== EVENTS ===================
  const E = (G.Events = { cool: {}, stopT: 0, fastT: 0, radioT: 0, lowFuelWarned: false, gasTalked: false });
  const now = () => performance.now() / 1000;
  E.ready = (key, sec) => {
    if ((E.cool[key] || 0) > now()) return false;
    E.cool[key] = now() + sec;
    return true;
  };
  const busAnchors = (extra) => Object.assign({ driver: null, _default: Pl.mesh }, extra || {});
  const pickPassengerVoice = () => G.pick(PASSENGER_VOICES);
  E.addMoney = (n, label) => {
    Pl.money += n;
    if (n > 0) { Pl.earned += n; G.Audio.coin(); }
    G.HUD.floatMoney(n, label);
  };

  E.crash = function (impact, car) {
    if (!E.ready('crashSfx', 0.8)) return;
    G.Audio.crash(G.clamp(impact / 12, 0.2, 1));
    Pl.shake = G.clamp(impact / 10, 0.3, 1);
    const dmg = Math.round(G.clamp(impact * 6, 10, 120));
    E.addMoney(-dmg, 'تصليح');
    if (car && impact > 6 && G.chance(0.6) && !G.Foot.active) {
      G.Combat.angryDriver(car);
    } else if (car && E.ready('otherDriver', 9)) {
      G.Voice.conversation(G.pick(G.TALK.otherDriver), { driver: null, otherDriver: car.mesh }, 2);
    } else if (Pl.passengers.length && E.ready('crashP', 14)) {
      G.Voice.conversation(G.pick(G.TALK.crashPassengers), busAnchors(), 2);
    }
  };

  E.reckless = function () {
    if (!Pl.passengers.length || !E.ready('reckless', 22)) return;
    E.recklessCount = (E.recklessCount || 0) + 1;
    G.Voice.conversation(G.pick(G.TALK.reckless), busAnchors(), 2, null, () => { if (E.recklessCount >= 2 && G.chance(0.5)) E.makeAngry(); });
  };

  E.blockedYell = function (car) {
    if (!E.ready('blocked', 14)) return;
    G.Voice.say('otherDriver', G.pick(G.TALK.blocked), car.mesh, 1);
  };

  E.pedestrianYell = function (obj, female) {
    if (!E.ready('pedYell', 4)) return;
    const opts = G.TALK.pedestrian.filter((l) => (female ? l[0] === 'pedestrianF' : l[0] === 'pedestrian'));
    const [who, text] = G.pick(opts.length ? opts : G.TALK.pedestrian);
    G.Voice.say(who, text, obj, 2);
  };

  E.hitPedestrian = function (obj) {
    if (!E.ready('hitPed', 6)) return;
    G.Audio.crash(0.25);
    Pl.speed *= 0.4;
    Pl.shake = 0.5;
    E.addMoney(-200, 'تعويض');
    G.Voice.conversation(G.TALK.hitPedestrian, { driver: null, pedestrian: obj, onlooker: obj }, 2);
  };

  E.makeAngry = function (p) {
    p = p || G.pick(Pl.passengers);
    if (!p) return;
    E.angry = { p, until: now() + 25 };
    G.HUD.toast('😠 راكب عامل مشكلة… تقدر تنزّله (👋 نزّله)');
  };

  E.pay = function (p) {
    p.paid = true;
    if (G.chance(0.18) && E.ready('dispute', 45)) {
      G.Voice.conversation(G.pick(G.TALK.fareDispute), busAnchors(), 2, null, () => { E.addMoney(10, 'أجرة'); E.makeAngry(Pl.passengers.find((q) => q !== p)); });
    } else E.addMoney(10, 'أجرة');
  };

  E.collectFare = function () {
    const unpaid = Pl.passengers.filter((p) => !p.paid);
    if (!E.ready('askFare', 4)) return;
    if (!Pl.passengers.length) { G.HUD.toast('العربية فاضية يا اسطى! روح على أي موقف 🚐'); return; }
    G.Voice.say('driver', G.pick(G.TALK.askFare), null, 2);
    if (!unpaid.length) {
      G.Voice.say(pickPassengerVoice(), 'كلنا دفعنا يا اسطى!', Pl.mesh, 2);
      return;
    }
    unpaid.forEach((p) => (p.paid = true));
    const total = unpaid.length * 10;
    const dispute = G.chance(0.35) && E.ready('dispute', 30);
    const lines = dispute ? G.pick(G.TALK.fareDispute) : G.pick(G.TALK.payFare);
    G.Voice.conversation(lines, busAnchors(), 2, null, () => {
      E.addMoney(total, `أجرة ${G.arDigits(unpaid.length)} ركاب`);
      if (dispute) E.makeAngry(G.pick(unpaid));
    });
  };

  E.callRoute = function () {
    if (!E.ready('call', 3)) return;
    const counts = {};
    Pl.passengers.forEach((p) => (counts[p.dest] = (counts[p.dest] || 0) + 1));
    const top = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const near = G.People.stations.slice().sort((a, b) => G.dist2(a.s.stopPos, Pl.pos) - G.dist2(b.s.stopPos, Pl.pos));
    const dest = top != null ? G.World.STATIONS[top].name : near[1].s.name;
    G.Voice.say('driver', G.Voice.fill(G.pick(G.TALK.callRoute), { dest }), null, 2);
    near.forEach((st) => { if (G.dist2(st.s.stopPos, Pl.pos) < 140) st.boost = 20; });
  };

  E.buyFuel = function () {
    if (G.dist2(Pl.pos, G.World.gasPos) < 30) { G.HUD.toast('اقف جنب البنزينة والعامل هيفوّلك ⛽'); return; }
    if (Pl.money < 250) { G.HUD.toast('الفلوس مش مكفية لبنزين دليفري (٢٥٠ جنيه)'); return; }
    Pl.fuel = Math.min(Pl.maxFuel, Pl.fuel + 10);
    E.addMoney(-250, 'بنزين دليفري');
    G.HUD.toast('جالك جركن بنزين دليفري ⛽ +١٠ لتر');
  };

  E.update = function (dt) {
    const C = G.World;
    const stopped = Math.abs(Pl.speed) < 1.3;
    E.stopT -= dt;

    // ---- microbus stops: drop off, collect, pick up ----
    for (const st of G.People.stations) {
      const s = st.s;
      const d = G.dist2(Pl.pos, s.stopPos);
      const rider = Pl.passengers.find((p) => p.dest === s.idx);
      if (rider && d < 95 && d > 22 && !st.announced) {
        st.announced = true;
        G.Voice.say(rider.who, G.Voice.fill(G.pick(G.TALK.stopRequest), { dest: s.name }), Pl.mesh, 2);
      }
      if (d > 140) st.announced = false;
      if (d < 12 && stopped) {
        if (E.stopT > 0) continue;
        const k = Pl.passengers.findIndex((p) => p.dest === s.idx);
        if (k >= 0) {
          const p = Pl.passengers.splice(k, 1)[0];
          E.stopT = 0.7;
          G.Audio.door();
          Pl.delivered++;
          if (!p.paid) E.pay(p);
        } else if (st.waiting.length && Pl.passengers.length < Pl.cap) {
          G.People.board(st, Pl.pos);
          let dest;
          do dest = G.randi(0, C.STATIONS.length - 1); while (dest === s.idx);
          const who = pickPassengerVoice();
          Pl.passengers.push({ dest, paid: false, who });
          E.stopT = 0.8;
          G.Audio.door();
          if (!st.talked) {
            st.talked = true;
            const conv = G.pick(G.TALK.boarding).map(([w, t]) => [w === 'driver' ? w : who, t]);
            G.Voice.conversation(conv, busAnchors(), 1, { dest: C.STATIONS[dest].name });
          }
        }
      } else if (d > 25) st.talked = false;
    }

    // ---- reckless driving ----
    if (Math.abs(Pl.speed) > 22) { E.fastT += dt; if (E.fastT > 3) { E.fastT = 0; E.reckless(); } } else E.fastT = 0;

    // ---- passengers hate the mahraganat ----
    if (G.Audio.radioOn && Pl.passengers.length) {
      E.radioT += dt;
      if (E.radioT > 30) { E.radioT = 0; if (G.chance(0.6)) G.Voice.conversation(G.pick(G.TALK.radioComplain), busAnchors(), 1); }
    }

    // ---- police checkpoint ----
    const dc = G.dist2(Pl.pos, C.checkpointPos);
    if (dc < 22) {
      const off = G.People.officers;
      if (Math.abs(Pl.speed) > 11 && E.ready('cpFast', 50)) {
        G.Audio.whistle(C.checkpointPos);
        G.Voice.conversation(G.TALK.checkpointFast, { driver: null, officer: off[0], police: off[1] }, 2, null, () => E.addMoney(-100, 'مخالفة'));
      } else if (Math.abs(Pl.speed) < 4 && E.ready('cpSlow', 80)) {
        G.Voice.conversation(G.TALK.checkpointSlow, { driver: null, police: off[1] }, 2);
      }
    }

    // ---- gas station ----
    const dg = G.dist2(Pl.pos, C.gasPos);
    if (dg < 11 && stopped && Pl.fuel < Pl.maxFuel - 0.3) {
      if (!E.gasTalked) { E.gasTalked = true; G.Voice.conversation(G.TALK.gas, { driver: null, attendant: C.gasPos }, 1); }
      const liters = Math.min(6 * dt, Pl.maxFuel - Pl.fuel), cost = liters * 15;
      if (Pl.money >= cost) { Pl.fuel += liters; Pl.money -= cost; }
      else if (E.ready('gasNoMoney', 20)) G.Voice.conversation(G.TALK.gasNoMoney, { driver: null, attendant: C.gasPos }, 1);
    }
    if (dg > 30) E.gasTalked = false;

    if (Pl.fuel < 5 && !E.lowFuelWarned) { E.lowFuelWarned = true; G.HUD.toast('⛽ البنزين قرّب يخلص! روح البنزينة أو اطلب دليفري (+)'); }
    if (Pl.fuel > 8) E.lowFuelWarned = false;
    if (Pl.fuel <= 0 && E.ready('noFuel', 15)) G.HUD.toast('العربية فصلت بنزين! دوس + جنب البنزين');
  };
})(window.G);
