'use strict';
// AI traffic that follows lanes and picks a random turn at every junction.
(function (G) {
  const T = (G.Traffic = { cars: [] });
  const tmp = new THREE.Vector3();

  const MIX = ['sedan', 'sedan', 'sedan', 'sedan', 'taxi', 'taxi', 'microbus', 'microbus', 'tuktuk', 'sedan', 'pickup', 'taxi', 'sedan', 'microbus', 'tuktuk', 'bus', 'sedan', 'taxi', 'sedan', 'pickup'];

  T.init = function (scene, count) {
    // on the real map the cars drive the OpenStreetMap road graph
    if (G.World.osm) G.OSMTraffic.setup(T);
    for (let k = 0; k < count; k++) {
      const v = G.Models.vehicle(MIX[k % MIX.length]);
      const car = Object.assign(v, {
        pos: new THREE.Vector3(), heading: 0, speed: 0, target: new THREE.Vector3(), segDir: new THREE.Vector3(),
        cruise: v.maxSpeed * G.rand(0.75, 1.05), stuck: 0, honkT: 0, stun: 0, fwd: new THREE.Vector3(), pending: null,
        outer: v.type === 'bus' || v.type === 'tuktuk',
      });
      scene.add(car.mesh);
      T.spawn(car, true);
      if (G.World.osm) car.mesh.position.set(car.pos.x, 0, car.pos.z);
      T.cars.push(car);
    }
  };

  T.spawn = function (car, anywhere) {
    const C = G.City, R = C.R, NR = C.NR;
    for (let tries = 0; tries < 30; tries++) {
      car.axis = G.chance(0.5) ? 'x' : 'z';
      car.road = G.randi(0, NR - 1);
      car.dir = G.chance(0.5) ? 1 : -1;
      const seg = G.randi(0, NR - 2);
      car.lane = car.type === 'bus' || car.type === 'tuktuk' ? 1 : G.randi(0, 1);
      car.nextIdx = car.dir > 0 ? seg + 1 : seg;
      const along = G.rand(R[seg] + C.RW + 4, R[seg + 1] - C.RW - 4);
      C.lanePos(car.axis, R[car.road], car.dir, car.lane, along, car.pos);
      // don't pop in right in front of the player
      if (!anywhere && G.Player && G.dist2(car.pos, G.Player.pos) < 120) continue;
      if (T.cars.some((o) => o !== car && G.dist2(o.pos, car.pos) < 12)) continue;
      break;
    }
    car.heading = C.headingFor(car.axis, car.dir);
    car.speed = car.cruise * 0.5;
    car.mode = 'entry';
    T.setEntry(car);
  };

  T.setTarget = function (car, p) {
    car.target.copy(p);
    car.segDir.subVectors(p, car.pos).setY(0);
    if (car.segDir.lengthSq() < 0.01) car.segDir.set(Math.sin(car.heading), 0, Math.cos(car.heading));
    car.segDir.normalize();
  };

  T.setEntry = function (car) {
    const C = G.City;
    car.mode = 'entry';
    T.setTarget(car, C.lanePos(car.axis, C.R[car.road], car.dir, car.lane, C.R[car.nextIdx] - car.dir * (C.RW + 1), tmp));
  };

  T.chooseTurn = function (car) {
    const C = G.City, R = C.R, NR = C.NR;
    const opts = [];
    const n = car.nextIdx;
    if (n + car.dir >= 0 && n + car.dir < NR) {
      opts.push({ axis: car.axis, road: car.road, dir: car.dir, nextIdx: n + car.dir, w: 2, along: R[n] + car.dir * (C.RW + 1) });
    }
    ['L', 'R'].forEach((turn) => {
      let nAxis, nDir;
      if (car.axis === 'x') { nAxis = 'z'; nDir = turn === 'R' ? car.dir : -car.dir; }
      else { nAxis = 'x'; nDir = turn === 'R' ? -car.dir : car.dir; }
      const nNext = car.road + nDir;
      if (nNext < 0 || nNext >= NR) return;
      opts.push({ axis: nAxis, road: n, dir: nDir, nextIdx: nNext, w: 1, along: R[car.road] + nDir * (C.RW + 1), turn: true });
    });
    let total = opts.reduce((s, o) => s + o.w, 0), r = Math.random() * total;
    let pick = opts[0];
    for (const o of opts) { r -= o.w; if (r <= 0) { pick = o; break; } }
    car.pending = pick;
    car.mode = 'exit';
    car.turning = !!pick.turn;
    if (pick.turn) {
      const nh = G.City.headingFor(pick.axis, pick.dir);
      const side = -Math.sin(nh) * Math.cos(car.heading) + Math.cos(nh) * Math.sin(car.heading);
      car.signal = side > 0 ? 1 : -1;
    } else car.signal = 0;
    T.setTarget(car, C.lanePos(pick.axis, R[pick.road], pick.dir, car.lane, pick.along, tmp));
  };

  T.update = function (dt) {
    const P = G.Player;
    const others = T.cars;
    const peds = G.People ? G.People.roadPeds() : [];
    for (const car of T.cars) {
      const fwd = car.fwd.set(Math.sin(car.heading), 0, Math.cos(car.heading));
      // waypoint reached?
      const dx = car.target.x - car.pos.x, dz = car.target.z - car.pos.z;
      if (dx * car.segDir.x + dz * car.segDir.z < 0.5 || dx * dx + dz * dz < 2) {
        if (car.mode === 'entry') T.chooseTurn(car);
        else {
          Object.assign(car, { axis: car.pending.axis, road: car.pending.road, dir: car.pending.dir, nextIdx: car.pending.nextIdx });
          car.turning = false;
          car.signal = 0;
          T.setEntry(car);
        }
      }
      // steer toward target
      const want = Math.atan2(car.target.x - car.pos.x, car.target.z - car.pos.z);
      const err = G.angleDiff(car.heading, want);
      const rate = 1.7;
      car.heading += G.clamp(err, -rate * dt, rate * dt);

      // desired speed
      let desired = car.cruise;
      if (car.turning) desired = Math.min(desired, 6);
      desired *= G.clamp(Math.cos(err), 0.3, 1);
      // car following: other AI cars going roughly the same way, the player, people crossing
      let gapMin = 1e9, blockedByPlayer = false;
      const check = (o, olen, owid, ofwd, isPlayer) => {
        const rx = o.x - car.pos.x, rz = o.z - car.pos.z;
        const f = rx * fwd.x + rz * fwd.z;
        if (f <= 0 || f > 22) return;
        const lat = Math.abs(rx * fwd.z - rz * fwd.x);
        if (lat > owid / 2 + car.wid / 2 + 0.5) return;
        if (ofwd && ofwd.x * fwd.x + ofwd.z * fwd.z < 0.3) return;
        const gap = f - car.len / 2 - olen / 2;
        if (gap < gapMin) { gapMin = gap; blockedByPlayer = !!isPlayer; }
      };
      for (const o of others) if (o !== car && Math.abs(o.pos.x - car.pos.x) < 24 && Math.abs(o.pos.z - car.pos.z) < 24) check(o.pos, o.len, o.wid, o.fwd);
      if (P) check(P.pos, P.len, P.wid, null, true);
      for (const p of peds) check(p.position, 0.6, 0.8, null);
      if (gapMin < 1e9) desired = Math.min(desired, Math.max(0, (gapMin - 2.5) * 1.1));
      if (car.stun > 0) { car.stun -= dt; desired = 0; }

      if (car.speed > desired) car.speed = Math.max(desired, car.speed - 10 * dt);
      else car.speed = Math.min(desired, car.speed + 3.2 * dt);
      car.pos.addScaledVector(fwd, car.speed * dt);

      // honking when stuck behind the player
      if (blockedByPlayer && car.speed < 0.5) {
        car.honkT += dt;
        if (car.honkT > 2.5) {
          car.honkT = G.rand(-2, 0);
          G.Audio.aiHorn(car.pos);
          if (G.Events) G.Events.blockedYell(car);
        }
      } else car.honkT = 0;
      if (!blockedByPlayer && G.chance(dt * 0.006)) G.Audio.aiHorn(car.pos);

      // recycle cars stuck far away from the player
      car.stuck = car.speed < 0.2 ? car.stuck + dt : 0;
      const dP = P ? G.dist2(car.pos, P.pos) : 0;
      if (car.stuck > 20 && dP > 90) { car.stuck = 0; T.spawn(car); }

      const on = car.signal && Math.floor(performance.now() / 400) % 2 === 0;
      car.blink.L.forEach((m) => (m.visible = on && car.signal < 0));
      car.blink.R.forEach((m) => (m.visible = on && car.signal > 0));
      car.mesh.visible = dP < 360;
      car.mesh.position.set(car.pos.x, 0, car.pos.z);
      car.mesh.rotation.y = car.heading;
    }
  };

  // collision circles along the car's length
  T.circles = function (v, pos, heading, out) {
    const r = v.wid / 2;
    const half = Math.max(0, v.len / 2 - r);
    const n = Math.max(2, Math.ceil((half * 2) / (r * 1.6)) + 1);
    const sx = Math.sin(heading), sz = Math.cos(heading);
    out.length = 0;
    for (let k = 0; k < n; k++) {
      const o = -half + (2 * half * k) / (n - 1);
      out.push({ x: pos.x + sx * o, z: pos.z + sz * o, r });
    }
    return out;
  };
})(window.G);
