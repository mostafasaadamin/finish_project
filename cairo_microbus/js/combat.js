'use strict';
// Getting out of the microbus, fist fights, people hit by cars, and the interactive street events:
// separating or joining a street fight, throwing a passenger out, other drivers coming for you,
// and a crew cutting a tree on the sidewalk.
(function (G) {
  const F = (G.Foot = { active: false, hp: 100, pos: new THREE.Vector3(), heading: 0, speed: 0, punchT: 0, holdT: 0, ko: false, joy: { x: 0, y: 0 } });
  const Cb = (G.Combat = { npcs: [], bodies: [], wanted: 0 });
  const M = () => G.Models;
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  const now = () => performance.now() / 1000;
  const say = (who, text, anchor, prio) => G.Voice.say(who, text, anchor, prio == null ? 2 : prio);

  // ---------------------------------------------------------------- sound helpers
  // real recording when available, small synthesized fallback otherwise
  Cb.sfx = function (role, pos, vol, maxLen) {
    const A = G.Audio;
    if (!A.ready) return;
    if (A.playSample(role, pos, vol, maxLen || 2.5)) return;
    const dest = A.spatial(pos, 60, (vol || 0.6) * 0.8);
    if (!dest) return;
    const t = A.now();
    if (role === 'punch' || role === 'hit_body') { A.tone(dest, 'sine', 110, t, 0.12, 0.9, 45); A.noiseHit(dest, t, 0.08, 0.5, 'lowpass', 900); }
    else if (role === 'van_door' || role === 'car_door') A.door();
  };

  // ---------------------------------------------------------------- NPC combat
  Cb.add = function (obj, o) {
    const n = Object.assign({
      obj, hp: 60, state: 'idle', target: null, atkT: G.rand(0.6, 1.2), flinch: 0, downT: 0, kb: new THREE.Vector3(),
      who: 'fighterA', dmg: [6, 12], speed: 2.8, baseY: obj.position.y, punchAnim: 0, life: 0,
    }, o || {});
    obj.userData.npc = n;
    Cb.npcs.push(n);
    return n;
  };
  Cb.remove = function (n) {
    Cb.npcs = Cb.npcs.filter((x) => x !== n);
    if (n.obj.parent) n.obj.parent.remove(n.obj);
  };
  const busDoor = (out) => {
    const Pl = G.Player;
    // driver door is on the left: left = (cos h, -sin h)
    return (out || new THREE.Vector3()).set(Pl.pos.x + Math.cos(Pl.heading) * 1.6, 0, Pl.pos.z - Math.sin(Pl.heading) * 1.6);
  };
  Cb.targetPos = (n) => (n.target === 'player' ? (F.active ? F.pos : busDoor(tmp2)) : n.target.obj.position);

  Cb.hit = function (from, n, dmg, byPlayer) {
    if (n.state === 'down' || n.state === 'dead') return;
    n.hp -= dmg;
    n.flinch = 0.35;
    tmp.subVectors(n.obj.position, from).setY(0);
    if (tmp.lengthSq() < 1e-4) tmp.set(0, 0, 1);
    tmp.normalize();
    n.kb.copy(tmp).multiplyScalar(3.2);
    Cb.sfx('punch', n.obj.position, 0.9, 1);
    if (G.chance(0.6)) Cb.sfx('grunt', n.obj.position, 0.7, 1.5);
    if (byPlayer && n.state !== 'fight') {
      n.state = 'fight';
      n.target = 'player';
      if (n.onProvoked) n.onProvoked(n);
    }
    if (n.hp <= 0) Cb.knockDown(n, tmp, false);
  };

  Cb.knockDown = function (n, dir, dead) {
    n.state = dead ? 'dead' : 'down';
    n.downT = dead ? 1e9 : G.rand(6, 10);
    n.fallT = 0;
    // face the hit and fall backwards along it
    n.obj.rotation.y = Math.atan2(-dir.x, -dir.z);
    Cb.sfx('hit_body', n.obj.position, 0.8, 1.5);
    if (n.onDown) n.onDown(n, dead);
  };

  Cb.update = function (dt) {
    for (const n of Cb.npcs.slice()) {
      const o = n.obj, u = o.userData;
      n.life += dt;
      if (n.kb.lengthSq() > 0.01) { o.position.addScaledVector(n.kb, dt); n.kb.multiplyScalar(Math.max(0, 1 - dt * 5)); }
      if (n.state === 'down' || n.state === 'dead') {
        n.fallT += dt;
        const k = Math.min(1, n.fallT * 4);
        o.rotation.x = (-Math.PI / 2) * k;
        o.position.y = n.baseY + 0.15 * k;
        u.armL.rotation.x = u.armR.rotation.x = -0.4 * k;
        n.downT -= dt;
        if (n.state === 'down' && n.downT <= 0) {
          o.rotation.x = 0; o.position.y = n.baseY;
          n.hp = 35;
          n.state = n.afterUp || 'flee';
          n.fleeT = 8;
        }
        continue;
      }
      if (n.flinch > 0) {
        n.flinch -= dt;
        u.torso.rotation.x = -0.35;
        M().animPerson(o, 'idle', dt);
        continue;
      }
      u.torso.rotation.x = 0;
      if (n.state === 'fight' || n.state === 'brawl') {
        if (n.target !== 'player' && n.target && (n.target.state === 'down' || n.target.state === 'dead' || !Cb.npcs.includes(n.target))) { n.state = 'idle'; continue; }
        const tp = Cb.targetPos(n);
        tmp.subVectors(tp, o.position).setY(0);
        const d = tmp.length();
        o.rotation.y = Math.atan2(tmp.x, tmp.z);
        if (d > 1.15) {
          o.position.addScaledVector(tmp.multiplyScalar(1 / d), Math.min(d - 1, n.speed * dt));
          M().animPerson(o, 'walk', dt, n.speed);
        } else {
          M().animPerson(o, 'fight', dt);
          n.atkT -= dt;
          if (n.atkT <= 0) {
            n.atkT = G.rand(0.8, 1.4);
            n.punchAnim = 0.18;
            if (n.target === 'player') {
              if (F.active && !F.ko) { if (G.chance(0.7)) F.damage(G.rand(n.dmg[0], n.dmg[1]), o.position); else Cb.sfx('footsteps', o.position, 0.4, 0.4); }
              else if (!F.active) { Cb.sfx('hit_body', o.position, 0.7, 0.8); G.Player.shake = 0.25; }
            } else if (G.chance(0.6)) Cb.sfx('punch', o.position, 0.7, 1); // show fight between two NPCs
          }
        }
        if (n.punchAnim > 0) { n.punchAnim -= dt; u.armR.rotation.x = -1.7; }
        if (n.giveUpT && n.life > n.giveUpT && !F.active) { n.state = 'flee'; n.fleeT = 12; }
      } else if (n.state === 'flee') {
        n.fleeT -= dt;
        const from = F.active ? F.pos : G.Player.pos;
        tmp.subVectors(o.position, from).setY(0).normalize();
        o.position.addScaledVector(tmp, 4 * dt);
        o.rotation.y = Math.atan2(tmp.x, tmp.z);
        M().animPerson(o, 'walk', dt, 4);
        if (n.fleeT <= 0) { n.state = 'idle'; if (n.removeAfterFlee) { Cb.remove(n); continue; } }
      } else if (n.state === 'gawk') {
        tmp.subVectors(n.gawkAt, o.position).setY(0);
        const d = tmp.length();
        if (d > 2.2) { o.position.addScaledVector(tmp.multiplyScalar(1 / d), 2 * dt); o.rotation.y = Math.atan2(tmp.x, tmp.z); M().animPerson(o, 'walk', dt, 2); }
        else M().animPerson(o, n.waves ? 'wave' : 'idle', dt);
      } else if (n.state === 'work') {
        M().animPerson(o, 'fight', dt * 0.6);
      } else M().animPerson(o, 'idle', dt);
      // stay on the sidewalk height where they stand
      o.position.y = Cb.groundY(o.position) + 0;
      n.baseY = o.position.y;
    }
    // clean up far away bodies / brawlers
    const ref = F.active ? F.pos : G.Player.pos;
    for (const n of Cb.npcs.slice()) if (n.life > 20 && G.dist2(n.obj.position, ref) > 170 && !n.keep) Cb.remove(n);
  };

  // inside a building zone (block minus its sidewalk)?
  Cb.inBuilding = (x, z) => G.World.inBuilding(x, z);

  // 0.2 on sidewalks / blocks, 0 on the road
  Cb.groundY = (p) => G.World.groundY(p.x, p.z);

  // ---------------------------------------------------------------- on foot
  F.exit = function () {
    const Pl = G.Player;
    if (F.active) return;
    if (Math.abs(Pl.speed) > 1.5) { G.HUD.toast('اقف الأول عشان تنزل!'); return; }
    Pl.speed = 0;
    if (!F.obj) {
      F.obj = M().person('man', { shirt: '#3d4f6e' });
      F.obj.userData.isPlayer = true;
    }
    busDoor(F.pos);
    F.heading = Pl.heading + Math.PI / 2;
    F.obj.position.copy(F.pos);
    G.Main.scene.add(F.obj);
    F.active = true;
    F.ko = false;
    G.Audio.horn(false);
    Cb.sfx('van_door', Pl.pos, 0.6, 2);
    G.HUD.setMode('foot');
  };

  F.enter = function () {
    if (!F.active || F.ko) return;
    if (G.dist2(F.pos, G.Player.pos) > 4.5) { G.HUD.toast('روح جنب الميكروباص عشان تركب'); return; }
    F.active = false;
    G.Main.scene.remove(F.obj);
    Cb.sfx('van_door', G.Player.pos, 0.6, 2);
    G.HUD.setMode('drive');
  };

  F.damage = function (d, from) {
    if (F.ko) return;
    F.hp = Math.max(0, F.hp - d);
    Cb.sfx('punch', F.pos, 1, 1);
    if (G.chance(0.5)) Cb.sfx('grunt', F.pos, 0.8, 1.2);
    tmp.subVectors(F.pos, from).setY(0).normalize();
    F.pos.addScaledVector(tmp, 0.35);
    G.HUD.flash();
    if (F.hp <= 0) F.knockOut();
  };

  F.knockOut = function () {
    F.ko = true;
    F.koT = 0;
    const lost = Math.round(G.Player.money * 0.25);
    G.Events.addMoney(-lost, 'اتضربت');
    G.HUD.toast('اتضربت علقة واغمى عليك! 😵 ضاع منك ' + G.arDigits(lost) + ' جنيه');
    Cb.npcs.forEach((n) => { if (n.target === 'player' && n.state === 'fight') { n.state = 'flee'; n.fleeT = 10; } });
  };

  F.update = function (dt) {
    if (!F.active) return;
    const I = G.Input, u = F.obj.userData;
    if (F.ko) {
      F.koT += dt;
      F.obj.rotation.x = -Math.PI / 2 * Math.min(1, F.koT * 3);
      F.obj.position.y = Cb.groundY(F.pos) + 0.15;
      if (F.koT > 4) {
        // wake up next to the microbus
        F.ko = false; F.hp = 60; F.obj.rotation.x = 0;
        busDoor(F.pos);
      }
      return;
    }
    const fwd = (I.kbUp ? 1 : 0) - (I.kbDown ? 1 : 0) + -F.joy.y;
    const turn = (I.kbRight ? 1 : 0) - (I.kbLeft ? 1 : 0) + F.joy.x;
    F.heading -= G.clamp(turn, -1, 1) * 2.8 * dt;
    const sp = G.clamp(fwd, -1, 1) * (Math.abs(fwd) > 0.85 ? 4.2 : 2.6);
    tmp.set(Math.sin(F.heading), 0, Math.cos(F.heading));
    F.pos.addScaledVector(tmp, sp * dt);
    // walls, the microbus and cars
    const r = 0.35;
    const hp = G.World.collideFoot(F.pos.x, F.pos.z, r);
    if (hp) { F.pos.x += hp.x; F.pos.z += hp.z; }
    const cars = [G.Player].concat(G.Traffic.cars.filter((c) => G.dist2(c.pos, F.pos) < 8));
    for (const c of cars) {
      for (const k of G.Traffic.circles(c, c.pos, c.heading, F._c || (F._c = []))) {
        const dx = F.pos.x - k.x, dz = F.pos.z - k.z, d = Math.hypot(dx, dz);
        if (d < k.r + r && d > 1e-4) { F.pos.x += (dx / d) * (k.r + r - d); F.pos.z += (dz / d) * (k.r + r - d); }
      }
    }
    F.pos.y = Cb.groundY(F.pos);
    F.obj.position.copy(F.pos);
    F.obj.rotation.set(0, F.heading, 0);
    if (F.punchT > 0) {
      F.punchT -= dt;
      M().animPerson(F.obj, 'fight', dt);
      u.armR.rotation.x = F.punchT > 0.25 ? -1.7 : -0.6;
    } else if (Math.abs(sp) > 0.1) M().animPerson(F.obj, 'walk', dt, Math.abs(sp));
    else M().animPerson(F.obj, 'idle', dt);
    if (F.hp < 100) F.hp = Math.min(100, F.hp + dt * 1.5);

    // separating a street fight: hold the button near it
    const f = G.People.fight;
    F.canSeparate = !!(f && !f.done && !f.joined && G.dist2(F.pos, f.pos) < 4);
    if (F.canSeparate && I.hold) {
      F.holdT += dt;
      if (F.holdT > 2.4) Cb.separateFight();
    } else F.holdT = Math.max(0, F.holdT - dt * 2);
  };

  F.punch = function () {
    if (!F.active || F.ko || F.punchT > 0) return;
    F.punchT = 0.45;
    const fx = Math.sin(F.heading), fz = Math.cos(F.heading);
    let best = null, bd = 1.7;
    const consider = (obj, n) => {
      const dx = obj.position.x - F.pos.x, dz = obj.position.z - F.pos.z, d = Math.hypot(dx, dz);
      if (d > bd || (dx * fx + dz * fz) / (d || 1) < 0.5) return;
      bd = d; best = { obj, n };
    };
    Cb.npcs.forEach((n) => { if (n.state !== 'down' && n.state !== 'dead') consider(n.obj, n); });
    G.People.walkers.forEach((w) => consider(w.obj, null));
    if (!best) { Cb.sfx('footsteps', F.pos, 0.3, 0.3); return; }
    let n = best.n;
    if (!n) n = Cb.fromWalker(best.obj, G.chance(0.55) ? 'fight' : 'flee');
    Cb.hit(F.pos, n, G.rand(18, 28), true);
  };

  // a walker on the sidewalk becomes a combat NPC (stops following its route)
  Cb.fromWalker = function (obj, state) {
    const P = G.People;
    P.walkers = P.walkers.filter((w) => w.obj !== obj);
    const n = Cb.add(obj, { state, target: state === 'fight' ? 'player' : null, fleeT: 10, who: obj.userData.kind === 'woman' ? 'pedestrianF' : 'pedestrian' });
    if (state === 'fight') say(n.who, G.pick(G.TALK2.provoked), obj, 2);
    return n;
  };

  // ---------------------------------------------------------------- street fights (hooked from people.js)
  Cb.registerFight = function (f, script, cast) {
    const a = Cb.add(cast[0], { state: 'brawl', who: script.cast[0], dmg: [8, 14], keep: true });
    const b = Cb.add(cast[1], { state: 'brawl', who: script.cast[1], dmg: [8, 14], keep: true });
    a.target = b; b.target = a;
    f.npcs = [a, b];
    // onlookers can be hit too
    cast.slice(2).forEach((c, k) => Cb.add(c, { state: 'idle', who: k === 0 ? 'onlooker' : 'onlooker2', keep: true }));
    const joined = () => {
      if (f.joined) return;
      f.joined = true;
      if (f.convo) f.convo.stop();
      [a, b].forEach((n) => { if (n.state === 'brawl' || n.state === 'idle') { n.state = 'fight'; n.target = 'player'; } });
      Cb.sfx('crowd_shout', f.pos, 0.8, 4);
      G.Voice.conversation(G.TALK2.joinFight, { fighterA: cast[0], fighterB: cast[1], onlooker: cast[2], _default: cast[2] }, 2);
    };
    [a, b].forEach((n) => (n.onProvoked = joined));
    let downs = 0;
    [a, b].forEach((n) => (n.onDown = () => {
      if (++downs === 2) {
        f.done = true; f.doneAt = f.t;
        Cb.sfx('crowd_shout', f.pos, 0.7, 3);
        say('onlooker', G.pick(G.TALK2.bothDown), cast[2], 2);
      }
    }));
  };

  Cb.separateFight = function () {
    const f = G.People.fight;
    if (!f || f.done) return;
    F.holdT = 0;
    f.done = true; f.doneAt = f.t;
    if (f.convo) f.convo.stop();
    f.npcs.forEach((n) => { n.state = 'idle'; });
    G.Voice.conversation(G.TALK2.separated, { fighterA: f.cast[0], fighterB: f.cast[1], onlooker: f.cast[2], _default: f.cast[2] }, 2,
      null, () => G.Events.addMoney(50, 'حجزت الخناقة'));
    G.HUD.toast('حجزت بينهم! 👏 الناس شكرتك');
  };

  // ---------------------------------------------------------------- passengers
  // throw out an angry passenger: they may come for the driver
  Cb.kickPassenger = function () {
    const Pl = G.Player, E = G.Events;
    if (!E.angry || now() > E.angry.until) return;
    if (Math.abs(Pl.speed) > 1.5) { G.HUD.toast('اقف على جنب الأول!'); return; }
    const k = Pl.passengers.findIndex((p) => p === E.angry.p);
    const p = k >= 0 ? Pl.passengers.splice(k, 1)[0] : Pl.passengers.pop();
    E.angry = null;
    if (!p) return;
    Cb.sfx('van_door', Pl.pos, 0.7, 2);
    // the sliding door is on the right side: right = (-cos h, sin h)
    const obj = M().person(p.who === 'passengerF' ? 'woman' : G.pick(['man', 'galabeya']));
    obj.position.set(Pl.pos.x - Math.cos(Pl.heading) * 1.7, 0, Pl.pos.z + Math.sin(Pl.heading) * 1.7);
    G.Main.scene.add(obj);
    const hostile = p.who !== 'passengerF' && G.chance(0.7);
    const n = Cb.add(obj, { state: hostile ? 'fight' : 'flee', target: hostile ? 'player' : null, who: p.who, fleeT: 12, removeAfterFlee: true, giveUpT: 25, dmg: [7, 13] });
    say('driver', G.pick(G.TALK2.kickOut), null, 2);
    if (hostile) {
      G.Voice.conversation(G.TALK2.kickedHostile.map(([w, t]) => [w === 'passenger' ? p.who : w, t]), { _default: obj, driver: null }, 2);
      G.HUD.toast('الراكب نزل وعايز يتخانق! انزل له (🚪) أو امشي');
      // sometimes his friend from the back seat joins him
      if (Pl.passengers.length && G.chance(0.3)) {
        const q = Pl.passengers.pop();
        const o2 = M().person('man');
        o2.position.copy(obj.position).add(new THREE.Vector3(0.8, 0, 0.8));
        G.Main.scene.add(o2);
        Cb.add(o2, { state: 'fight', target: 'player', who: q.who, giveUpT: 25, removeAfterFlee: true });
      }
    } else say(p.who, G.pick(G.TALK2.kickedCalm), obj, 2);
    void n;
  };

  // ---------------------------------------------------------------- other drivers
  Cb.angryDriver = function (car) {
    if (car.angryOut) return;
    car.angryOut = true;
    car.stun = 30;
    const obj = M().person('man');
    obj.position.set(car.pos.x + Math.cos(car.heading) * 1.4, 0, car.pos.z - Math.sin(car.heading) * 1.4);
    G.Main.scene.add(obj);
    Cb.sfx('car_door', car.pos, 0.7, 1.5);
    const n = Cb.add(obj, { state: 'fight', target: 'player', who: 'otherDriver', giveUpT: 18, removeAfterFlee: true, fleeT: 6 });
    n.onRemove = () => { car.angryOut = false; car.stun = 0; };
    say('otherDriver', G.pick(G.TALK2.otherDriverOut), obj, 2);
  };

  // ---------------------------------------------------------------- people hit by the microbus
  // returns true when the person was handled as a casualty
  Cb.vehicleHit = function (obj, impactSpeed, isWalker) {
    const Pl = G.Player;
    if (impactSpeed < 5) return false;
    let n = obj.userData.npc;
    if (!n) n = isWalker ? Cb.fromWalker(obj, 'idle') : Cb.add(obj, {});
    if (n.state === 'down' || n.state === 'dead') return true;
    tmp.set(Math.sin(Pl.heading), 0, Math.cos(Pl.heading));
    if (Pl.speed < 0) tmp.negate();
    const dead = impactSpeed > 12;
    n.kb.copy(tmp).multiplyScalar(impactSpeed * (dead ? 0.7 : 0.35));
    Cb.knockDown(n, tmp, dead);
    n.afterUp = G.chance(0.5) ? 'fight' : 'flee';
    n.target = 'player';
    Cb.sfx('car_hit_person', obj.position, 1, 2);
    Cb.sfx('scream', obj.position, 0.8, 2);
    Pl.speed *= dead ? 0.75 : 0.5;
    Pl.shake = 0.6;
    setTimeout(() => Cb.sfx('crowd_shout', obj.position, 0.8, 5), 600);
    if (dead) {
      G.Events.addMoney(-1000, 'دية');
      Cb.wanted = 180;
      G.HUD.toast('🚨 خبطت واحد ومات! البوليس بيدوّر عليك… ابعد عن الكمين');
      G.Voice.conversation(G.TALK2.killed, { _default: obj }, 2);
      Cb.gather(obj.position);
    } else {
      G.Events.addMoney(-200, 'تعويض');
      G.Voice.conversation(G.TALK.hitPedestrian, { driver: null, pedestrian: obj, onlooker: obj }, 2);
    }
    return true;
  };

  // people walk over and stand around
  Cb.gather = function (at) {
    const near = G.People.walkers.filter((w) => G.dist2(w.obj.position, at) < 45).slice(0, 5);
    near.forEach((w, k) => {
      const n = Cb.fromWalker(w.obj, 'gawk');
      n.gawkAt = at.clone().add(new THREE.Vector3(Math.cos(k * 1.3) * 2, 0, Math.sin(k * 1.3) * 2));
      n.waves = k % 2 === 0;
    });
  };

  // ---------------------------------------------------------------- tree cutting crew
  Cb.crew = null;
  Cb.crewTimer = 50;
  Cb.startCrew = function () {
    const Pl = G.Player;
    const fwd = tmp.set(Math.sin(Pl.heading), 0, Math.cos(Pl.heading)).clone();
    const rp = G.World.sidewalkAhead(Pl.pos, Pl.heading, 45, 100, 10);
    void fwd;
    if (!rp) return false;
    const base = new THREE.Vector3(rp.x, G.World.groundY(rp.x, rp.z), rp.z);
    const group = new THREE.Group();
    // fallen trunk lying along the curb, branches spilling into the street
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, 7, 8), M().mat('#6b4f33'));
    trunk.rotation.z = Math.PI / 2;
    trunk.rotation.y = Math.atan2(rp.dx, rp.dz) + Math.PI / 2;
    trunk.position.set(base.x + rp.nx * 1.6, 0.5, base.z + rp.nz * 1.6);
    trunk.castShadow = true;
    group.add(trunk);
    for (let k = 0; k < 7; k++) {
      const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(G.rand(0.7, 1.2), 0), M().mat(G.pick(['#4f7a31', '#5c8a3a', '#466e2c'])));
      leaf.position.set(base.x + rp.nx * G.rand(1.8, 3.2) + rp.dx * G.rand(-3, 3), 0.6, base.z + rp.nz * G.rand(1.8, 3.2) + rp.dz * G.rand(-3, 3));
      leaf.castShadow = true;
      group.add(leaf);
    }
    G.Main.scene.add(group);
    const workers = [0, 1].map((k) => {
      const w = M().person('worker', { robe: k ? '#ff8f00' : '#5d4037' });
      w.position.copy(base).addScaledVector(new THREE.Vector3(rp.dx, 0, rp.dz), k ? 2.5 : -1.5);
      w.rotation.y = Math.atan2(rp.nx, rp.nz);
      G.Main.scene.add(w);
      return Cb.add(w, { state: 'work', who: 'worker', keep: true, afterUp: 'flee' });
    });
    // block the curb lane while they work
    const box = new THREE.Box3().setFromObject(trunk);
    const col = { minX: box.min.x, maxX: box.max.x, minZ: box.min.z, maxZ: box.max.z };
    G.World.addCollider(col);
    Cb.crew = { group, workers, pos: base, col, t: 0, warned: false };
    Cb.sfx('tree_fall', base, 0.9, 4);
    G.HUD.toast('🌳 عمال بيقطعوا شجرة على الرصيف قدامك');
    return true;
  };

  Cb.updateCrew = function (dt) {
    const c = Cb.crew, A = G.Audio;
    if (!c) {
      Cb.crewTimer -= dt;
      if (Cb.crewTimer <= 0) Cb.crewTimer = Cb.startCrew() ? G.rand(120, 180) : 10;
      return;
    }
    c.t += dt;
    const ref = F.active ? F.pos : G.Player.pos;
    const d = G.dist2(c.pos, ref);
    // chainsaw bursts while they work
    c.sawT = (c.sawT || 0) - dt;
    if (c.sawT <= 0 && c.workers.some((w) => w.state === 'work')) { c.sawT = G.rand(2.5, 4); Cb.sfx('chainsaw', c.pos, 0.55, 3); }
    if (!c.warned && d < 30) { c.warned = true; say('worker', G.pick(G.TALK2.crew), c.workers[0].obj, 1); }
    if (c.t > 90 || d > 230) {
      A && G.Main.scene.remove(c.group);
      G.World.removeCollider(c.col);
      c.workers.forEach((w) => Cb.remove(w));
      Cb.crew = null;
    }
  };

  // ---------------------------------------------------------------- wanted by the police
  Cb.updateWanted = function (dt) {
    if (Cb.wanted <= 0) return;
    Cb.wanted -= dt;
    Cb.sirenT = (Cb.sirenT || 0) - dt;
    if (Cb.sirenT <= 0) { Cb.sirenT = G.rand(12, 20); Cb.sfx('siren', null, 0.25, 4); }
    const ref = F.active ? F.pos : G.Player.pos;
    if (G.dist2(ref, G.World.checkpointPos) < 25) {
      Cb.wanted = 0;
      Cb.sfx('whistle', G.World.checkpointPos, 0.8, 2);
      G.Voice.conversation(G.TALK2.arrested, { driver: null, _default: G.People.officers[0] }, 2, null, () => {
        G.Events.addMoney(-2000, 'قضية');
        const s = G.World.STATIONS[0];
        if (F.active) F.enter();
        G.Player.pos.copy(s.stopPos); G.Player.heading = s.heading; G.Player.speed = 0;
        G.HUD.toast('🚔 اتقبض عليك! خرجت بكفالة ٢٠٠٠ جنيه');
      });
    }
  };

  Cb.updateAll = function (dt) {
    F.update(dt);
    Cb.update(dt);
    Cb.updateCrew(dt);
    Cb.updateWanted(dt);
  };

  // remove() hook for NPCs that own a callback
  const baseRemove = Cb.remove;
  Cb.remove = function (n) { if (n.onRemove) n.onRemove(); baseRemove(n); };
})(window.G);
