'use strict';
// One interface over the two city builders: the real downtown Cairo map (G.OSM) when its data is
// present, otherwise the procedural grid (G.City). The rest of the game only talks to G.World.
(function (G) {
  const W = (G.World = { osm: false });

  W.build = function (scene) {
    W.osm = !!(G.OSM && G.OSM.ok);
    if (W.osm) {
      G.OSM.build(scene);
      const O = G.OSM;
      W.bounds = O.bounds;
      W.STATIONS = O.stations;
      W.gasPos = O.gasPos;
      W.checkpointPos = O.checkpointPos;
      W.AHWA = O.AHWA;
      W.paths = O.paths.map((p) => Object.assign(p, { closed: false, crossDist: p.r.w + 3 }));
      const c = O.checkpointSide;
      W.checkpointFrame = { dx: c.dx, dz: c.dz, nx: c.nx, nz: c.nz, hw: c.path.r.w / 2 };
      W.decorOSM(scene);
    } else {
      const C = G.City;
      C.build(scene);
      W.bounds = { minX: C.MIN - C.RW - 60, maxX: C.MAX + C.RW + C.SW, minZ: C.MIN - C.RW - 60, maxZ: C.MAX + C.RW + 60 };
      W.STATIONS = C.STATIONS.map((s) => Object.assign(s, {
        waitPoint: (k) => {
          const v = C.sidePoint(s.axis, C.R[s.road], s.along + (k - 3) * 0.9 + G.rand(-0.2, 0.2), s.side, G.rand(1.2, 2.6));
          v.y = 0.2;
          return v;
        },
        faceRoad: s.axis === 'x' ? (s.side > 0 ? Math.PI : 0) : s.side > 0 ? -Math.PI / 2 : Math.PI / 2,
      }));
      W.gasPos = C.gasPos;
      W.checkpointPos = C.checkpointPos;
      W.AHWA = C.AHWA.map((a) => Object.assign(a, { along: a.side === '-x' ? { x: 0, z: 1 } : { x: 1, z: 0 } }));
      W.policeLights = C.policeLights;
      W.checkpointFrame = { dx: 1, dz: 0, nx: 0, nz: 1, hw: C.RW };
      W.paths = W.gridPaths();
    }
    W.paths.forEach((p) => {
      if (!p.cum) {
        p.cum = [0];
        for (let i = 1; i < p.pts.length; i++) p.cum.push(p.cum[i - 1] + Math.hypot(p.pts[i].x - p.pts[i - 1].x, p.pts[i].z - p.pts[i - 1].z));
        p.len = p.cum[p.cum.length - 1];
      }
    });
  };

  // ---------------------------------------------------------------- queries
  W.roadName = (x, z) => (W.osm ? G.OSM.roadName(x, z) : G.City.roadName(x, z));

  // push a circle out of buildings / curbs; returns {x, z} or null
  W.collide = function (x, z, r) {
    if (W.osm) {
      const p = G.OSM.collide(x, z, r);
      // temporary obstacles (fallen tree)
      let q = p;
      for (const b of W.extraColliders) {
        const h = G.circleAABB(x + (q ? q.x : 0), z + (q ? q.z : 0), r, b);
        if (h) q = { x: (q ? q.x : 0) + h.x, z: (q ? q.z : 0) + h.z };
      }
      return q;
    }
    let px = 0, pz = 0, hit = false;
    for (const b of G.City.colliders) {
      if (x < b.minX - r - 1 || x > b.maxX + r + 1 || z < b.minZ - r - 1 || z > b.maxZ + r + 1) continue;
      const h = G.circleAABB(x + px, z + pz, r, b);
      if (h) { px += h.x; pz += h.z; hit = true; }
    }
    return hit ? { x: px, z: pz } : null;
  };
  W.extraColliders = [];
  W.addCollider = (b) => (W.osm ? W.extraColliders.push(b) : G.City.colliders.push(b));
  W.removeCollider = (b) => {
    W.extraColliders = W.extraColliders.filter((x) => x !== b);
    G.City.colliders = G.City.colliders.filter((x) => x !== b);
  };

  // someone on foot: buildings only (sidewalks and curbs are walkable)
  W.collideFoot = function (x, z, r) {
    if (W.osm) return W.collide(x, z, r);
    const SW = G.City.SW;
    let px = 0, pz = 0, hit = false;
    for (const b of G.City.colliders) {
      if (b.maxX - b.minX <= 3 || b.maxZ - b.minZ <= 3) continue;
      const h = G.circleAABB(x + px, z + pz, r, { minX: b.minX + SW, maxX: b.maxX - SW, minZ: b.minZ + SW, maxZ: b.maxZ - SW });
      if (h) { px += h.x; pz += h.z; hit = true; }
    }
    return hit ? { x: px, z: pz } : null;
  };

  // people can walk on sidewalks but not into buildings
  W.inBuilding = function (x, z) {
    if (W.osm) return !!G.OSM.inBuilding(x, z);
    const SW = G.City.SW;
    return G.City.colliders.some((b) => b.maxX - b.minX > 3 && b.maxZ - b.minZ > 3 && x > b.minX + SW && x < b.maxX - SW && z > b.minZ + SW && z < b.maxZ - SW);
  };
  W.groundY = function (x, z) {
    if (W.osm) return G.OSM.groundY(x, z);
    return G.City.colliders.some((b) => b.maxX - b.minX > 3 && b.maxZ - b.minZ > 3 && x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ) ? 0.2 : 0;
  };

  // ---------------------------------------------------------------- sidewalk paths
  // grid city: one closed loop around every block
  W.gridPaths = function () {
    const C = G.City, R = C.R, o = C.RW + 2.2, out = [];
    for (let i = 0; i < C.NR - 1; i++) for (let j = 0; j < C.NR - 1; j++) {
      const x0 = R[i] + o, x1 = R[i + 1] - o, z0 = R[j] + o, z1 = R[j + 1] - o;
      const pts = [[x0, z0], [x1, z0], [x1, z1], [x0, z1], [x0, z0]].map(([x, z]) => new THREE.Vector3(x, 0.2, z));
      out.push({ pts, closed: true, side: 1, crossDist: 2 * o });
    }
    return out;
  };

  // point on a path: position, direction along it, normal toward the road, distance to the nearest end/corner
  W.pathPoint = function (p, s) {
    if (p.closed) s = ((s % p.len) + p.len) % p.len; else s = G.clamp(s, 0, p.len);
    let i = 1;
    while (i < p.cum.length - 1 && p.cum[i] < s) i++;
    const a = p.pts[i - 1], b = p.pts[i], L = p.cum[i] - p.cum[i - 1] || 1;
    const t = (s - p.cum[i - 1]) / L;
    const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
    const nx = p.side * dz, nz = -p.side * dx;
    const edge = p.closed ? Math.min(s - p.cum[i - 1], p.cum[i] - s) : Math.min(s, p.len - s);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx, dz, nx, nz, edge, path: p, s };
  };
  W.nearestPath = function (x, z) {
    if (W.osm) {
      const q = G.OSM.nearestPath(x, z);
      return q ? { p: q.p, s: q.s } : null;
    }
    let best = null, bd = 1e9;
    for (const p of W.paths) {
      for (let i = 1; i < p.pts.length; i++) {
        const a = p.pts[i - 1], b = p.pts[i], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
        const t = G.clamp(((x - a.x) * dx + (z - a.z) * dz) / l2, 0, 1);
        const d = Math.hypot(a.x + dx * t - x, a.z + dz * t - z);
        if (d < bd) { bd = d; best = { p, s: p.cum[i - 1] + Math.sqrt(l2) * t }; }
      }
    }
    return best;
  };
  // a sidewalk point near a spot ahead of someone (for events the player should see)
  W.sidewalkAhead = function (from, heading, dMin, dMax, minEdge) {
    const fx = Math.sin(heading), fz = Math.cos(heading);
    for (let k = 0; k < 30; k++) {
      const d = G.rand(dMin, dMax), side = G.rand(-15, 15);
      const np = W.nearestPath(from.x + fx * d - fz * side, from.z + fz * d + fx * side);
      if (!np) continue;
      const q = W.pathPoint(np.p, np.s);
      const dx = q.x - from.x, dz = q.z - from.z, dd = Math.hypot(dx, dz);
      if (q.edge >= (minEdge || 0) && dd > dMin * 0.7 && dd < dMax * 1.3 && (dx * fx + dz * fz) / dd > 0.3) return q;
    }
    return null;
  };

  // a sidewalk point between minD and maxD metres from pos (for keeping the streets around you busy)
  W.sidewalkNear = function (pos, minD, maxD) {
    for (let k = 0; k < 120; k++) {
      const q = W.randomSidewalk(2);
      const d = Math.hypot(q.x - pos.x, q.z - pos.z);
      if (d > minD && d < maxD) return q;
    }
    return null;
  };

  W.randomSidewalk = function (minEdge) {
    for (let k = 0; k < 60; k++) {
      const p = G.pick(W.paths);
      const q = W.pathPoint(p, G.rand(0, p.len));
      if (q.edge >= (minEdge || 0)) return q;
    }
    const p = W.paths[0];
    return W.pathPoint(p, p.len / 2);
  };

  // ---------------------------------------------------------------- props on the real map
  W.decorOSM = function (scene) {
    const B = new G.Batch(), M = G.Mat;
    // microbus stop signs and shelters
    W.STATIONS.forEach((s) => {
      const q = s.along;
      const px = q.x + q.dx * 6 + q.nx * 1.2, pz = q.z + q.dz * 6 + q.nz * 1.2;
      B.add('vc', M.vc, G.cyl(0.07, 0.07, 3.4, 6, px, 1.86, pz, '#444'));
      const mat = new THREE.MeshStandardMaterial({ map: G.tex(G.Models.signCanvas('موقف ' + s.name, '#f9a825', '#1a1a1a', 512, 192, 'ميكروباص')), roughness: 0.6 });
      for (let k = 0; k < 2; k++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), mat);
        m.position.set(px, 3.4, pz);
        m.rotation.y = Math.atan2(q.dx, q.dz) + k * Math.PI;
        scene.add(m);
      }
      const ang = Math.atan2(q.dx, q.dz);
      const roof = new THREE.BoxGeometry(2, 0.12, 7); roof.rotateY(ang); roof.translate(q.x - q.nx * 0.6, 2.9, q.z - q.nz * 0.6);
      B.add('vc', M.vc, G.colorize(roof, '#1565c0'));
      [-3.2, 3.2].forEach((o) => B.add('vc', M.vc, G.cyl(0.05, 0.05, 2.7, 5, q.x + q.dx * o - q.nx * 1.4, 1.55, q.z + q.dz * o - q.nz * 1.4, '#888')));
    });
    // gas station canopy on the sidewalk side
    const g = G.OSM.gasSide;
    if (g) {
      const ang = Math.atan2(g.dx, g.dz);
      const can = new THREE.BoxGeometry(9, 0.8, 16); can.rotateY(ang); can.translate(g.x - g.nx * 1.5, 5.4, g.z - g.nz * 1.5);
      B.add('vc', M.vc, G.colorize(can, '#f5f5f5'));
      [-5, 0, 5].forEach((o) => B.add('vc', M.vc, G.box(0.9, 1.7, 0.6, g.x + g.dx * o - g.nx * 0.4, 1.0, g.z + g.dz * o - g.nz * 0.4, '#c62828')));
      const s = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshStandardMaterial({ map: G.tex(G.Models.signCanvas('بنزينة', '#c62828', '#fff', 512, 256, '٨٠ – ٩٢ – ٩٥ – سولار')) }));
      s.position.set(g.x + g.dx * 9, 6.5, g.z + g.dz * 9);
      s.rotation.y = Math.atan2(g.nx, g.nz);
      scene.add(s);
    }
    // police checkpoint: cones, barriers, a police car with lights
    const c = G.OSM.checkpointSide, cp = W.checkpointPos;
    if (c) {
      const r = c.path.r;
      for (let t = -14; t <= 14; t += 3.5) {
        [r.w / 2 - 0.6, 0.6 - r.w / 2].forEach((o) => {
          const x = cp.x + c.dx * t + c.nx * 0, z = cp.z + c.dz * t;
          const cx = x - c.nx * o, cz = z - c.nz * o;
          const cone = new THREE.ConeGeometry(0.25, 0.75, 8); cone.translate(cx, 0.43, cz);
          B.add('vc', M.vc, G.colorize(cone, '#ff6d00'));
        });
      }
      const police = G.Models.vehicle('police');
      police.mesh.position.set(c.x - c.nx * 0.3, 0.16, c.z - c.nz * 0.3);
      police.mesh.rotation.y = Math.atan2(c.dx, c.dz);
      scene.add(police.mesh);
      const lr = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.28), new THREE.MeshBasicMaterial({ color: '#ff1744' }));
      const lb = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.28), new THREE.MeshBasicMaterial({ color: '#2979ff' }));
      lr.position.set(0.3, 1.72, -0.3); lb.position.set(-0.3, 1.72, -0.3);
      police.mesh.add(lr, lb);
      W.policeLights = [lr, lb];
    }
    // coffee shop tables
    W.AHWA.forEach((a) => {
      for (let k = -1; k <= 1; k++) {
        const tx = a.pos.x + a.along.x * k * 3.2, tz = a.pos.z + a.along.z * k * 3.2;
        B.add('vc', M.vc, G.cyl(0.4, 0.4, 0.05, 10, tx, 0.95, tz, '#eeeeee'));
        B.add('vc', M.vc, G.cyl(0.05, 0.05, 0.75, 5, tx, 0.57, tz, '#999'));
        B.add('vc', M.vc, G.cyl(0.08, 0.1, 0.25, 6, tx + 0.15, 1.1, tz, '#c62828'));
      }
    });
    B.build(scene, true, true);
    G.Trees.plant(scene, G.OSM.treeSpots);
  };

  // ---------------------------------------------------------------- minimap
  W.drawMap = function (x) {
    if (W.osm) {
      if (!W._map) W._map = G.OSM.mapCanvas();
      const m = W._map;
      x.imageSmoothingEnabled = true;
      x.drawImage(m.canvas, m.minX, m.minZ, m.canvas.width / m.S, m.canvas.height / m.S);
      return;
    }
    const C = G.City;
    x.fillStyle = '#3d7fa0';
    x.fillRect(C.MAX + C.RW + C.SW + 1, -2000, 2000, 4000);
    C.blocks.forEach((bk) => {
      x.fillStyle = bk.type === 'park' ? '#7aa35a' : bk.type === 'corniche' ? '#c8b896' : '#d8cdb5';
      x.fillRect(bk.minX, bk.minZ, bk.maxX - bk.minX, bk.maxZ - bk.minZ);
    });
  };
})(window.G);
