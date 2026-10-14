'use strict';
// AI traffic on the real OpenStreetMap road network: lanes on the right, one-way streets respected,
// a weighted random turn at every junction (going straight is most likely).
(function (G) {
  const OT = (G.OSMTraffic = {});
  const tmp = new THREE.Vector3();

  OT.buildGraph = function () {
    const O = G.OSM;
    const nodes = new Map(), edges = [];
    const node = (k, p) => { if (!nodes.has(k)) nodes.set(k, { k, p, out: [] }); return nodes.get(k); };
    O.roads.forEach((r) => {
      if (r.type === 'service' && r.w < 5) return;
      let start = 0;
      for (let i = 1; i < r.pts.length; i++) {
        const isJ = i === r.pts.length - 1 || O.nodeUse.get(r.keys[i]) > 1;
        if (!isJ) continue;
        const pts = r.pts.slice(start, i + 1);
        const cum = [0];
        for (let q = 1; q < pts.length; q++) cum.push(cum[q - 1] + pts[q].distanceTo(pts[q - 1]));
        const len = cum[cum.length - 1];
        if (len > 0.5) {
          const e = { pts, cum, len, w: r.w, oneway: r.oneway, name: r.name, a: node(r.keys[start], pts[0]), b: node(r.keys[i], pts[pts.length - 1]) };
          edges.push(e);
          e.a.out.push({ e, dir: 1 });
          if (!r.oneway) e.b.out.push({ e, dir: -1 });
        }
        start = i;
      }
    });
    OT.nodes = nodes; OT.edges = edges;
    OT.totalLen = edges.reduce((s, e) => s + e.len, 0);
  };

  // point and tangent at distance s along an edge in a direction
  OT.at = function (e, dir, s, out) {
    const d = dir > 0 ? G.clamp(s, 0, e.len) : G.clamp(e.len - s, 0, e.len);
    let i = 1;
    while (i < e.cum.length - 1 && e.cum[i] < d) i++;
    const a = e.pts[i - 1], b = e.pts[i], L = e.cum[i] - e.cum[i - 1] || 1;
    const t = (d - e.cum[i - 1]) / L;
    out.p.set(a.x + (b.x - a.x) * t, 0, a.z + (b.z - a.z) * t);
    out.tx = ((b.x - a.x) / L) * dir; out.tz = ((b.z - a.z) / L) * dir;
    return out;
  };

  OT.laneOffset = function (car, e) {
    if (e.oneway) {
      const lanes = Math.max(1, Math.round(e.w / 3.3));
      const lane = car.outer ? lanes - 1 : G.randi(0, lanes - 1);
      return -e.w / 2 + ((lane + 0.5) * e.w) / lanes;
    }
    const per = Math.max(1, Math.round(e.w / 6.6));
    const lane = car.outer ? per - 1 : G.randi(0, per - 1);
    return ((lane + 0.5) * (e.w / 2)) / per;
  };

  OT.place = function (car, e, dir, s) {
    car.edge = e; car.dir = dir; car.s = s;
    car.off = OT.laneOffset(car, e);
    OT.exact(car);
    car.pos.copy(car.ex);
    car.heading = Math.atan2(car.tx, car.tz);
  };

  const at = { p: new THREE.Vector3(), tx: 0, tz: 1 };
  OT.exact = function (car) {
    OT.at(car.edge, car.dir, car.s, at);
    car.tx = at.tx; car.tz = at.tz;
    // right of travel = (-tz, tx)
    car.ex = car.ex || new THREE.Vector3();
    car.ex.set(at.p.x - at.tz * car.off, 0, at.p.z + at.tx * car.off);
  };

  OT.spawn = function (car, anywhere) {
    const P = G.Player;
    for (let k = 0; k < 40; k++) {
      let r = Math.random() * OT.totalLen, e = OT.edges[0];
      for (const x of OT.edges) { r -= x.len; if (r <= 0) { e = x; break; } }
      const dir = e.oneway ? 1 : G.chance(0.5) ? 1 : -1;
      OT.place(car, e, dir, G.rand(0, e.len));
      if (!anywhere && P && G.dist2(car.pos, P.pos) < 90) continue;
      if (G.Traffic.cars.some((o) => o !== car && o.pos && G.dist2(o.pos, car.pos) < 10)) continue;
      break;
    }
    car.speed = car.cruise * 0.5;
  };

  // pick the next edge at a junction
  OT.next = function (car) {
    const end = car.dir > 0 ? car.edge.b : car.edge.a;
    let opts = end.out.filter((o) => o.e !== car.edge);
    if (!opts.length) opts = end.out; // dead end: turn around
    if (!opts.length) return null;
    const w = opts.map((o) => {
      OT.at(o.e, o.dir, 0, at);
      const dot = at.tx * car.tx + at.tz * car.tz;
      return 0.3 + Math.max(0, dot) * 2.5;
    });
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < opts.length; i++) { r -= w[i]; if (r <= 0) return opts[i]; }
    return opts[0];
  };

  OT.setup = function (T) {
    OT.buildGraph();
    if (!OT.edges.length) return false;
    T.spawn = OT.spawn;
    T.update = OT.update;
    return true;
  };

  OT.update = function (dt) {
    const T = G.Traffic, P = G.Player;
    const peds = G.People ? G.People.roadPeds() : [];
    for (const car of T.cars) {
      const fwd = car.fwd.set(Math.sin(car.heading), 0, Math.cos(car.heading));
      // turning at a junction slows the car down
      const turnAhead = car.edge.len - car.s < 12 ? 0.7 : 1;
      let desired = car.cruise * turnAhead;
      let gapMin = 1e9, blockedByPlayer = false;
      const check = (o, olen, owid, ofwd, isPlayer) => {
        const rx = o.x - car.pos.x, rz = o.z - car.pos.z;
        const f = rx * fwd.x + rz * fwd.z;
        if (f <= 0 || f > 22) return;
        const lat = Math.abs(rx * fwd.z - rz * fwd.x);
        if (lat > owid / 2 + car.wid / 2 + 0.4) return;
        if (ofwd && ofwd.x * fwd.x + ofwd.z * fwd.z < 0.3) return;
        const gap = f - car.len / 2 - olen / 2;
        if (gap < gapMin) { gapMin = gap; blockedByPlayer = !!isPlayer; }
      };
      for (const o of T.cars) if (o !== car && Math.abs(o.pos.x - car.pos.x) < 24 && Math.abs(o.pos.z - car.pos.z) < 24) check(o.pos, o.len, o.wid, o.fwd);
      if (P) check(P.pos, P.len, P.wid, null, true);
      for (const p of peds) check(p.position, 0.6, 0.8, null);
      if (gapMin < 1e9) desired = Math.min(desired, Math.max(0, (gapMin - 2.5) * 1.1));
      if (car.stun > 0) { car.stun -= dt; desired = 0; }
      if (car.speed > desired) car.speed = Math.max(desired, car.speed - 10 * dt);
      else car.speed = Math.min(desired, car.speed + 3 * dt);

      car.s += car.speed * dt;
      while (car.s >= car.edge.len) {
        const nx = OT.next(car);
        if (!nx) { car.s = car.edge.len; car.speed = 0; break; }
        const rest = car.s - car.edge.len;
        car.edge = nx.e; car.dir = nx.dir; car.s = rest;
        car.off = OT.laneOffset(car, nx.e);
      }
      OT.exact(car);
      // smooth the corners: the drawn car eases toward the exact lane position
      const k = 1 - Math.exp(-dt * 6);
      car.pos.lerp(car.ex, k);
      const want = Math.atan2(car.ex.x - car.pos.x + car.tx * 3, car.ex.z - car.pos.z + car.tz * 3);
      car.heading += G.clamp(G.angleDiff(car.heading, want), -2.5 * dt, 2.5 * dt);

      if (blockedByPlayer && car.speed < 0.5) {
        car.honkT += dt;
        if (car.honkT > 2.5) { car.honkT = G.rand(-2, 0); G.Audio.aiHorn(car.pos); if (G.Events) G.Events.blockedYell(car); }
      } else car.honkT = 0;
      if (!blockedByPlayer && G.chance(dt * 0.006)) G.Audio.aiHorn(car.pos);

      car.stuck = car.speed < 0.2 ? car.stuck + dt : 0;
      const dP = P ? G.dist2(car.pos, P.pos) : 0;
      if (car.stuck > 20 && dP > 90) { car.stuck = 0; OT.spawn(car); }
      car.mesh.visible = dP < 360;
      car.mesh.position.set(car.pos.x, 0, car.pos.z);
      car.mesh.rotation.y = car.heading;
    }
  };
})(window.G);
