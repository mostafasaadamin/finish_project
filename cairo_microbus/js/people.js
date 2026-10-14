'use strict';
// Pedestrians, people waiting at microbus stops, street vendors, coffee shops and street fights.
(function (G) {
  const P = (G.People = { walkers: [], stations: [], vendors: [], ahwa: [], fight: null, fightTimer: 25, officers: [] });
  const M = () => G.Models;
  const tmp = new THREE.Vector3();

  // ---------- sidewalk rings around blocks ----------
  const ringOf = (i, j) => {
    const C = G.City, R = C.R, o = C.RW + 2.2;
    return { i, j, x0: R[i] + o, x1: R[i + 1] - o, z0: R[j] + o, z1: R[j + 1] - o };
  };
  const ringPoint = (r, p) => {
    const W = r.x1 - r.x0, H = r.z1 - r.z0, L = 2 * (W + H);
    p = ((p % L) + L) % L;
    if (p < W) return { x: r.x0 + p, z: r.z0, dx: 1, dz: 0, nx: 0, nz: -1, edge: Math.min(p, W - p) };
    if (p < W + H) { const q = p - W; return { x: r.x1, z: r.z0 + q, dx: 0, dz: 1, nx: 1, nz: 0, edge: Math.min(q, H - q) }; }
    if (p < 2 * W + H) { const q = p - W - H; return { x: r.x1 - q, z: r.z1, dx: -1, dz: 0, nx: 0, nz: 1, edge: Math.min(q, W - q) }; }
    const q = p - 2 * W - H;
    return { x: r.x0, z: r.z1 - q, dx: 0, dz: -1, nx: -1, nz: 0, edge: Math.min(q, H - q) };
  };
  const ringParam = (r, x, z) => {
    const W = r.x1 - r.x0, H = r.z1 - r.z0;
    const d = [Math.abs(z - r.z0), Math.abs(x - r.x1), Math.abs(z - r.z1), Math.abs(x - r.x0)];
    const m = d.indexOf(Math.min(...d));
    if (m === 0) return G.clamp(x - r.x0, 0, W);
    if (m === 1) return W + G.clamp(z - r.z0, 0, H);
    if (m === 2) return W + H + G.clamp(r.x1 - x, 0, W);
    return 2 * W + H + G.clamp(r.z1 - z, 0, H);
  };
  P.ringOf = ringOf; P.ringPoint = ringPoint;

  P.init = function (scene) {
    P.scene = scene;
    const C = G.City, NR = C.NR;
    // walkers
    for (let k = 0; k < 44; k++) {
      const w = { obj: M().person(), ring: ringOf(G.randi(0, NR - 2), G.randi(0, NR - 2)), mode: 'ring', speed: G.rand(1.1, 1.7), s: G.chance(0.5) ? 1 : -1, yellT: 0, fallT: 0 };
      if (w.obj.userData.kind === 'kid') w.speed *= 1.2;
      w.p = G.rand(0, 400);
      scene.add(w.obj);
      P.walkers.push(w);
    }
    // microbus stops
    C.STATIONS.forEach((s) => {
      const st = { s, waiting: [], spawnT: G.rand(0, 3), boost: 0, announced: false };
      for (let k = 0; k < G.randi(2, 5); k++) P.addWaiting(st);
      P.stations.push(st);
    });
    // vendors on random sidewalks, away from stops
    let vi = 0;
    for (let tries = 0; P.vendors.length < 14 && tries < 200; tries++) {
      const ring = ringOf(G.randi(0, NR - 2), G.randi(0, NR - 2));
      const rp = ringPoint(ring, G.rand(0, 400));
      if (rp.edge < 10) continue;
      const pos = new THREE.Vector3(rp.x + rp.nx * 0.9, 0.2, rp.z + rp.nz * 0.9);
      if (P.stations.some((st) => G.dist2(st.s.walkPos, pos) < 20) || P.vendors.some((v) => G.dist2(v.pos, pos) < 60)) continue;
      const def = G.VENDORS[vi++ % G.VENDORS.length];
      const faceOut = Math.atan2(rp.nx, rp.nz);
      const obj = new THREE.Group();
      obj.position.copy(pos);
      obj.rotation.y = faceOut;
      if (!def.kid) {
        const cart = M().cart(def);
        cart.rotation.y = Math.PI / 2;
        cart.position.set(0, 0, -0.6);
        obj.add(cart);
      }
      const person = M().person(def.kid ? 'kid' : G.pick(['man', 'galabeya']));
      person.position.set(def.kid ? 0 : 1.4, 0, def.kid ? 0 : -0.2);
      obj.add(person);
      scene.add(obj);
      P.vendors.push({ def, pos, obj, person, cool: G.rand(2, 8), waveT: 0 });
    }
    // سايس near a few shops
    for (let k = 0; k < 4; k++) {
      const ring = ringOf(G.randi(0, NR - 2), G.randi(0, NR - 2));
      const rp = ringPoint(ring, G.rand(0, 400));
      const person = M().person('galabeya', { robe: '#5d4037' });
      person.position.set(rp.x + rp.nx * 1.5, 0.2, rp.z + rp.nz * 1.5);
      person.rotation.y = Math.atan2(rp.nx, rp.nz);
      scene.add(person);
      P.vendors.push({ def: { type: 'سايس', lines: G.SAYES_LINES, sayes: true }, pos: person.position, obj: person, person, cool: G.rand(5, 15), waveT: 0 });
    }
    // coffee shops: seated customers + a waiter
    C.AHWA.forEach((a) => {
      const group = [];
      for (let k = 0; k < 5; k++) {
        const per = M().person(G.pick(['man', 'galabeya', 'man']));
        const o = (k - 2) * 1.6;
        const along = a.side === '-x' ? new THREE.Vector3(0, 0, o) : new THREE.Vector3(o, 0, 0);
        per.position.copy(a.pos).add(along);
        per.position.y = 0.2 - 0.42;
        per.rotation.y = a.face + (k % 2 ? Math.PI : 0);
        M().animPerson(per, 'sit', 0);
        scene.add(per);
        group.push(per);
      }
      const waiter = M().person('man', { shirt: '#fafafa' });
      waiter.position.copy(a.pos).add(new THREE.Vector3(1.2, 0, 1.2));
      scene.add(waiter);
      P.ahwa.push({ a, group, waiter, cool: G.rand(3, 9), li: G.randi(0, 5) });
    });
    // police officers at the checkpoint
    const cp = C.checkpointPos;
    [[-4, 9.2], [3, 9.4], [0, -9.3]].forEach(([dx, dz], k) => {
      const o = M().person('officer');
      o.position.set(cp.x + dx, 0, cp.z + dz);
      o.rotation.y = k === 2 ? 0 : Math.PI;
      scene.add(o);
      P.officers.push(o);
    });
  };

  P.addWaiting = function (st) {
    if (st.waiting.length >= 7) return;
    const s = st.s;
    const k = st.waiting.length;
    const per = M().person();
    const along = s.along + (k - 3) * 0.9 + G.rand(-0.2, 0.2);
    const off = G.rand(1.2, 2.6);
    G.City.sidePoint(s.axis, G.City.R[s.road], along, s.side, off, per.position);
    per.position.y = 0.2;
    // face the road
    per.rotation.y = s.axis === 'x' ? (s.side > 0 ? Math.PI : 0) : s.side > 0 ? -Math.PI / 2 : Math.PI / 2;
    P.scene.add(per);
    st.waiting.push(per);
  };

  // people currently walking on the road (AI cars brake for them)
  P.roadPeds = function () {
    const out = [];
    for (const w of P.walkers) if (w.mode === 'cross') out.push(w.obj);
    for (const b of P.boarding || []) out.push(b.obj);
    for (const n of G.Combat.npcs) if (n.obj.position.y < 0.1) out.push(n.obj);
    if (G.Foot.active && G.Foot.pos.y < 0.1) out.push(G.Foot.obj);
    return out;
  };

  P.boarding = [];
  // a waiting passenger walks to the microbus door and disappears
  P.board = function (st, busPos) {
    const per = st.waiting.pop();
    if (!per) return false;
    P.boarding.push({ obj: per, target: busPos.clone(), t: 0 });
    return true;
  };

  P.update = function (dt) {
    const Pl = G.Player;
    const ppos = Pl.pos;
    const C = G.City, NR = C.NR;

    // ---- walkers ----
    for (const w of P.walkers.slice()) {
      const o = w.obj;
      const d = G.dist2(o.position, ppos);
      if (w.fallT > 0) {
        w.fallT -= dt;
        o.rotation.x = w.fallT > 1.2 ? -Math.PI / 2 : 0;
        o.position.y = w.fallT > 1.2 ? 0.35 : o.position.y;
        continue;
      }
      if (w.mode === 'ring') {
        w.p += w.s * w.speed * dt;
        const rp = ringPoint(w.ring, w.p);
        o.position.set(rp.x, 0.2, rp.z);
        o.rotation.y = Math.atan2(rp.dx * w.s, rp.dz * w.s);
        // Cairo style: cross the street anywhere
        if (rp.edge > 10 && G.chance(dt * 0.015)) {
          const ni = w.ring.i + rp.nx, nj = w.ring.j + rp.nz;
          if (ni >= 0 && nj >= 0 && ni < NR - 1 && nj < NR - 1) {
            w.mode = 'cross';
            w.to = new THREE.Vector3(rp.x + rp.nx * 2 * (C.RW + 2.2), 0.2, rp.z + rp.nz * 2 * (C.RW + 2.2));
            w.mid = new THREE.Vector3(rp.x + rp.nx * (C.RW + 2.2), 0, rp.z + rp.nz * (C.RW + 2.2));
            w.n = { x: rp.nx, z: rp.nz };
            w.nextRing = ringOf(ni, nj);
          }
        }
      } else {
        tmp.subVectors(w.to, o.position).setY(0);
        const len = tmp.length();
        if (len < 0.3) {
          w.mode = 'ring';
          w.ring = w.nextRing;
          w.p = ringParam(w.ring, o.position.x, o.position.z);
        } else {
          tmp.multiplyScalar(1 / len);
          // wait if the microbus is right there
          const close = G.dist2(o.position, ppos) < 9 && Math.abs(Pl.speed) > 2;
          if (!close) o.position.addScaledVector(tmp, w.speed * 1.15 * dt);
          const fromMid = Math.abs((o.position.x - w.mid.x) * w.n.x + (o.position.z - w.mid.z) * w.n.z);
          o.position.y = fromMid < C.RW ? 0 : 0.2;
          o.rotation.y = Math.atan2(tmp.x, tmp.z);
        }
      }
      M().animPerson(o, 'walk', dt, w.speed);
      o.visible = d < 200;
      w.yellT -= dt;
      // dodge the microbus
      if (d < 4.2 && Math.abs(Pl.speed) > 1.5) {
        const near = G.Traffic.circles(Pl, Pl.pos, Pl.heading, P._circ || (P._circ = []));
        for (const c of near) {
          const dx = o.position.x - c.x, dz = o.position.z - c.z, dd = Math.hypot(dx, dz);
          if (dd < c.r + 0.45) {
            if (G.Combat.vehicleHit(o, Math.abs(Pl.speed), true)) break;
            if (w.yellT <= 0) {
              w.yellT = 8;
              G.Events.pedestrianYell(o, w.obj.userData.kind === 'woman');
            }
            const push = c.r + 0.5 - dd;
            o.position.x += (dx / (dd || 1)) * push;
            o.position.z += (dz / (dd || 1)) * push;
            if (w.mode === 'ring') w.p = ringParam(w.ring, o.position.x, o.position.z);
            break;
          }
        }
      }
    }

    // ---- boarding passengers ----
    P.boarding = P.boarding.filter((b) => {
      b.t += dt;
      tmp.copy(Pl.pos).sub(b.obj.position).setY(0);
      const len = tmp.length();
      if (len < 1.6 || b.t > 2.5) { P.scene.remove(b.obj); return false; }
      b.obj.position.addScaledVector(tmp.normalize(), Math.min(len, 3.5 * dt));
      b.obj.rotation.y = Math.atan2(tmp.x, tmp.z);
      M().animPerson(b.obj, 'walk', dt, 2);
      return true;
    });

    // ---- stops: people keep arriving ----
    for (const st of P.stations) {
      st.boost = Math.max(0, st.boost - dt);
      st.spawnT -= dt * (st.boost > 0 ? 4 : 1);
      if (st.spawnT <= 0) { st.spawnT = G.rand(7, 14); P.addWaiting(st); }
      for (const per of st.waiting) M().animPerson(per, 'idle', dt);
    }

    // ---- vendors call out ----
    for (const v of P.vendors) {
      v.cool -= dt;
      const d = G.dist2(v.pos, ppos);
      v.obj.visible = d < 220;
      if (v.waveT > 0) { v.waveT -= dt; M().animPerson(v.person, 'wave', dt); }
      else M().animPerson(v.person, 'idle', dt);
      if (d < 45 && v.cool <= 0) {
        v.cool = G.rand(10, 18);
        v.waveT = 2.5;
        G.Voice.say(v.def.sayes ? 'sayes' : v.def.kid ? 'kid' : 'vendor', G.pick(v.def.lines), v.person, 0);
        if (v.def.clack) G.Audio.clack(v.pos);
      }
    }

    // ---- coffee shops ----
    for (const a of P.ahwa) {
      a.cool -= dt;
      const d = G.dist2(a.a.pos, ppos);
      M().animPerson(a.waiter, 'idle', dt);
      if (d < 35 && a.cool <= 0) {
        a.cool = G.rand(9, 16);
        const [who, text] = G.AHWA_LINES[a.li++ % G.AHWA_LINES.length];
        G.Voice.say(who, text, who === 'waiter' ? a.waiter : G.pick(a.group), 0);
      }
    }

    for (const o of P.officers) M().animPerson(o, 'idle', dt);

    P.updateFight(dt);
  };

  // ---------- street fights ----------
  P.updateFight = function (dt) {
    const Pl = G.Player;
    const f = P.fight;
    if (!f) {
      P.fightTimer -= dt;
      if (P.fightTimer <= 0) P.fightTimer = P.startFight() ? G.rand(40, 70) : 5;
      return;
    }
    f.t += dt;
    f.cast.forEach((c, k) => { if (k === 2 && !f.done && c.userData.npc && c.userData.npc.state === 'idle') M().animPerson(c, 'wave', dt); });
    const d = G.dist2(f.pos, G.Foot.active ? G.Foot.pos : Pl.pos);
    G.Audio.setCrowd(f.done ? 0.015 : G.clamp(0.09 - d / 1500, 0.015, 0.09));
    if ((f.done && f.t > f.doneAt + 8) || d > 220) {
      f.cast.forEach((c) => (c.userData.npc ? G.Combat.remove(c.userData.npc) : P.scene.remove(c)));
      P.fight = null;
      G.Audio.setCrowd(0.015);
    }
  };

  P.startFight = function () {
    const Pl = G.Player;
    const C = G.City, NR = C.NR;
    const fwd = new THREE.Vector3(Math.sin(Pl.heading), 0, Math.cos(Pl.heading));
    let best = null;
    for (let k = 0; k < 40; k++) {
      const ring = ringOf(G.randi(0, NR - 2), G.randi(0, NR - 2));
      const rp = ringPoint(ring, G.rand(0, 400));
      if (rp.edge < 8) continue;
      const dx = rp.x - Pl.pos.x, dz = rp.z - Pl.pos.z, d = Math.hypot(dx, dz);
      if (d < 30 || d > 85) continue;
      if ((dx * fwd.x + dz * fwd.z) / d < 0.4) continue;
      best = rp; break;
    }
    if (!best) return false;
    const script = G.pick(G.FIGHTS);
    const pos = new THREE.Vector3(best.x, 0.2, best.z);
    const kinds = { fighterA: 'man', fighterB: G.pick(['man', 'galabeya']), fighterF: 'woman', onlooker: 'galabeya', onlooker2: 'galabeya' };
    const cast = script.cast.map((role) => M().person(kinds[role] || 'man'));
    const along = new THREE.Vector3(best.dx, 0, best.dz), out = new THREE.Vector3(best.nx, 0, best.nz);
    // two fighters face each other; onlookers around them
    cast[0].position.copy(pos).addScaledVector(along, -0.75);
    cast[1].position.copy(pos).addScaledVector(along, 0.75);
    cast[0].rotation.y = Math.atan2(along.x, along.z);
    cast[1].rotation.y = Math.atan2(-along.x, -along.z);
    cast[2].position.copy(pos).addScaledVector(out, -1.4).addScaledVector(along, -0.4);
    cast[3].position.copy(pos).addScaledVector(out, -1.3).addScaledVector(along, 1.6);
    cast[2].rotation.y = cast[3].rotation.y = Math.atan2(out.x, out.z);
    for (let k = 0; k < 3; k++) {
      const extra = M().person();
      extra.position.copy(pos).addScaledVector(along, G.rand(-3, 3)).addScaledVector(out, -G.rand(1.8, 2.6));
      extra.rotation.y = Math.atan2(out.x, out.z);
      cast.push(extra);
    }
    cast.forEach((c) => { c.position.y = 0.2; P.scene.add(c); });
    const anchors = {};
    script.cast.forEach((role, k) => (anchors[role] = cast[k]));
    const f = (P.fight = { pos, cast, t: 0, done: false, doneAt: 0 });
    G.Audio.crowdBurst(pos, 3);
    G.HUD.toast('⚠️ خناقة في الشارع قدامك: ' + script.title);
    G.Combat.registerFight(f, script, cast);
    f.convo = G.Voice.conversation(script.lines, anchors, 1, null, () => {
      if (f.joined) return;
      f.done = true; f.doneAt = f.t;
      f.npcs.forEach((n) => { if (n.state === 'brawl') n.state = 'idle'; });
    });
    return true;
  };
})(window.G);
