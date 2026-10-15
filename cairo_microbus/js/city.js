'use strict';
// Procedural "Downtown Cairo": a grid of avenues with medians, dense apartment blocks,
// shops, a mosque, a park, a gas station, the Nile corniche, Cairo Tower and the pyramids far away.
(function (G) {
  const D = G.DISTRICT;
  const BLOCK = D ? 150 : 110, RW = D ? 12 : 10, SW = D ? 5 : 4.5, NR = 7, NH = 3;
  const MED = D ? 1.3 : 0.8; // median half width
  const C = (G.City = { BLOCK, RW, SW, NR, colliders: [], blocks: [], decor: {} });
  C.R = [];
  for (let k = 0; k < NR; k++) C.R.push((k - NH) * BLOCK);
  C.MIN = C.R[0];
  C.MAX = C.R[NR - 1];

  // roads with constant z (they run along x), index j ; south -> north
  C.namesAlongX = ['شارع الجيزة', 'شارع القصر العيني', 'شارع رمسيس', 'شارع ٢٦ يوليو', 'شارع الجيش', 'شارع شبرا', 'شارع الترعة البولاقية'];
  // roads with constant x (they run along z), index i ; west -> east (Nile)
  C.namesAlongZ = ['شارع فيصل', 'شارع الدقي', 'شارع التحرير', 'شارع طلعت حرب', 'شارع محمد فريد', 'شارع الجلاء', 'كورنيش النيل'];

  // microbus stops: road axis, road index, segment index, sidewalk side
  C.STATIONS = [
    ['x', 3, 1, 1], ['z', 3, 3, -1], ['x', 5, 4, -1], ['z', 1, 1, 1], ['x', 1, 4, 1],
    ['z', 5, 2, -1], ['x', 6, 2, -1], ['x', 0, 3, 1], ['z', 6, 3, 1],
  ].map(([axis, road, seg, side], idx) => ({ idx, name: G.STATION_NAMES[idx], axis, road, seg, side }));
  C.GAS = { axis: 'x', road: 2, seg: 4, side: -1 };
  C.CHECKPOINT = { axis: 'x', road: 3, seg: 4 };
  const SPECIAL = { '1,4': 'park', '2,3': 'mosque', '4,1': 'gas' };

  C.laneOff = (lane) => (D ? 2.9 + lane * 3.6 : 3.2 + lane * 4.4);
  // position of a lane point. axis x: road z = rc, moving along x with dir
  C.lanePos = (axis, rc, dir, lane, along, out) => {
    out = out || new THREE.Vector3();
    const off = C.laneOff(lane);
    if (axis === 'x') out.set(along, 0, rc + dir * off);
    else out.set(rc - dir * off, 0, along);
    return out;
  };
  C.headingFor = (axis, dir) => (axis === 'x' ? (dir * Math.PI) / 2 : dir > 0 ? 0 : Math.PI);
  // dir such that the sidewalk on `side` is on the driver's right
  C.dirForSide = (axis, side) => (axis === 'x' ? side : -side);
  C.sidePoint = (axis, rc, along, side, off, out) => {
    out = out || new THREE.Vector3();
    if (axis === 'x') out.set(along, 0, rc + side * (RW + off));
    else out.set(rc + side * (RW + off), 0, along);
    return out;
  };

  C.roadName = function (x, z) {
    let best = null, bd = 1e9;
    for (let j = 0; j < NR; j++) { const d = Math.abs(z - C.R[j]); if (d < RW + 2 && d < bd) { bd = d; best = C.namesAlongX[j]; } }
    for (let i = 0; i < NR; i++) { const d = Math.abs(x - C.R[i]); if (d < RW + 2 && d < bd) { bd = d; best = C.namesAlongZ[i]; } }
    return best;
  };

  // ---------------- helpers ----------------
  const scaleUV = (g, su, sv, uo, vo) => {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su + (uo || 0), uv.getY(i) * sv + (vo || 0));
    return g;
  };
  const remapUV = (g, u0, u1, v0, v1) => {
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    return g;
  };
  let B; // batch for static, shadow-casting geometry
  let BF; // batch for flat ground geometry (receives shadows only)

  function curbBox(minX, maxX, minZ, maxZ, h, collide, topMat) {
    const w = maxX - minX, d = maxZ - minZ, cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const top = new THREE.PlaneGeometry(w, d);
    top.rotateX(-Math.PI / 2);
    scaleUV(top, w / 2, d / 2);
    top.translate(cx, h, cz);
    BF.add(topMat ? 'grass' : 'paving', topMat || G.Mat.paving, top);
    [[w, Math.PI, cx, minZ], [w, 0, cx, maxZ], [d, Math.PI / 2, maxX, cz], [d, -Math.PI / 2, minX, cz]].forEach(([len, ry, x, z]) => {
      const s = new THREE.PlaneGeometry(len, h);
      scaleUV(s, len / 2, 1);
      s.rotateY(ry);
      s.translate(x, h / 2, z);
      BF.add('curb', G.Mat.curb, s);
    });
    if (collide) C.colliders.push({ minX, maxX, minZ, maxZ });
  }

  const FACES = {
    '-z': (b) => ({ pw: b.w, ry: Math.PI, x: b.cx, z: b.minZ, nx: 0, nz: -1 }),
    '+z': (b) => ({ pw: b.w, ry: 0, x: b.cx, z: b.maxZ, nx: 0, nz: 1 }),
    '+x': (b) => ({ pw: b.d, ry: Math.PI / 2, x: b.maxX, z: b.cz, nx: 1, nz: 0 }),
    '-x': (b) => ({ pw: b.d, ry: -Math.PI / 2, x: b.minX, z: b.cz, nx: -1, nz: 0 }),
  };

  function addBuilding(minX, maxX, minZ, maxZ, floors, front, noProps) {
    const b = { minX, maxX, minZ, maxZ, w: maxX - minX, d: maxZ - minZ, cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2 };
    if (b.w < 3 || b.d < 3) return;
    const y0 = 0.2, h = floors * 3.2, H = h + 0.7;
    const v = G.randi(0, G.Mat.facades.length - 1);
    const uo = G.randi(0, 3) / 4;
    ['-z', '+z', '+x', '-x'].forEach((k) => {
      const f = FACES[k](b);
      const g = new THREE.PlaneGeometry(f.pw, H);
      scaleUV(g, f.pw / 12, H / 12.8, uo);
      g.rotateY(f.ry);
      g.translate(f.x, y0 + H / 2, f.z);
      B.add('fac' + v, G.Mat.facades[v], g);
    });
    const roof = new THREE.PlaneGeometry(b.w, b.d);
    roof.rotateX(-Math.PI / 2);
    scaleUV(roof, b.w / 8, b.d / 8);
    roof.translate(b.cx, y0 + h, b.cz);
    BF.add('roof', G.Mat.roof, roof);

    if (front) {
      const f = FACES[front](b);
      const k = G.randi(0, 7), col = k % 4, row = Math.floor(k / 4);
      const g = new THREE.PlaneGeometry(Math.max(2, f.pw - 0.6), 3.3);
      remapUV(g, col / 4, (col + 1) / 4, 1 - (row + 1) / 2, 1 - row / 2);
      g.rotateY(f.ry);
      g.translate(f.x + f.nx * 0.06, y0 + 1.65, f.z + f.nz * 0.06);
      B.add('shops', G.Mat.shops, g);
      // awning
      if (G.chance(0.4)) {
        const aw = G.box(f.nx ? 1.2 : f.pw - 0.8, 0.12, f.nz ? 1.2 : f.pw - 0.8, f.x + f.nx * 0.6, y0 + 3.45, f.z + f.nz * 0.6, G.pick(['#2e7d32', '#c62828', '#1565c0', '#f9a825', '#6d4c41']));
        B.add('vc', G.Mat.vc, aw);
      }
      if (h > 22 && G.chance(0.1)) {
        const bb = G.randi(0, 3), bc = bb % 2, br = Math.floor(bb / 2);
        const g2 = new THREE.PlaneGeometry(12, 6);
        remapUV(g2, bc / 2, (bc + 1) / 2, 1 - (br + 1) / 2, 1 - br / 2);
        g2.rotateY(f.ry);
        const cx = b.cx + f.nx * (b.w / 2 - 3), cz = b.cz + f.nz * (b.d / 2 - 3);
        g2.translate(cx, y0 + h + 5, cz);
        B.add('bill', G.Mat.billboards, g2);
        B.add('vc', G.Mat.vc, G.box(0.2, 3, 0.2, cx - (f.nz ? 4 : 0), y0 + h + 1.5, cz - (f.nx ? 4 : 0), '#333'));
        B.add('vc', G.Mat.vc, G.box(0.2, 3, 0.2, cx + (f.nz ? 4 : 0), y0 + h + 1.5, cz + (f.nx ? 4 : 0), '#333'));
      }
    }
    if (noProps) return;
    // roof clutter: water tanks, satellite dishes, unfinished rebar columns
    const n = G.randi(1, 4);
    for (let i = 0; i < n; i++) {
      const px = G.rand(minX + 1.5, maxX - 1.5), pz = G.rand(minZ + 1.5, maxZ - 1.5), py = y0 + h;
      const r = Math.random();
      if (r < 0.4) B.add('vc', G.Mat.vc, G.cyl(0.6, 0.6, 1.3, 8, px, py + 0.65, pz, G.pick(['#222', '#ddd', '#1565c0'])));
      else if (r < 0.75) {
        const dish = new THREE.CylinderGeometry(0.55, 0.12, 0.25, 10);
        G.xf(dish, { rx: -0.9, ry: G.rand(0, 6), x: px, y: py + 0.9, z: pz });
        B.add('vc', G.Mat.vc, G.colorize(dish, '#e8e8e8'));
        B.add('vc', G.Mat.vc, G.box(0.06, 0.8, 0.06, px, py + 0.4, pz, '#555'));
      } else {
        for (let k = 0; k < 4; k++) B.add('vc', G.Mat.vc, G.box(0.06, 1.6, 0.06, px + (k % 2) * 0.3, py + 0.8, pz + (k >> 1) * 0.3, '#5d4037'));
      }
    }
  }

  // a row of buildings along `axis` between from..to with front face at `front`, extending to `inward`
  function row(axis, from, to, front, inward, o) {
    o = o || {};
    let a = from;
    while (a < to - 4) {
      let w = G.rand(o.wMin || 10, o.wMax || 17);
      if (to - (a + w) < 6) w = to - a;
      const d = G.rand(o.dMin || 12, o.dMax || 18);
      const floors = G.randi(o.fMin || 4, o.fMax || 11);
      let minX, maxX, minZ, maxZ, side;
      if (axis === 'x') {
        minX = a; maxX = a + w;
        if (inward > 0) { minZ = front; maxZ = front + d; side = '-z'; } else { minZ = front - d; maxZ = front; side = '+z'; }
      } else {
        minZ = a; maxZ = a + w;
        if (inward > 0) { minX = front; maxX = front + d; side = '-x'; } else { minX = front - d; maxX = front; side = '+x'; }
      }
      addBuilding(minX, maxX, minZ, maxZ, floors, o.shops === false ? null : side, o.noProps);
      a += w;
    }
  }

  // --------------- decoration geometry ---------------
  function palm(x, z, y) {
    const h = G.rand(6, 9);
    y = y || 0;
    for (let k = 0; k < 4; k++) B.add('vc', G.Mat.vc, G.cyl(0.2 - k * 0.02, 0.24 - k * 0.02, h / 4, 7, x, y + h / 8 + (k * h) / 4, z, k % 2 ? '#7a5c3c' : '#6b4f33'));
    for (let k = 0; k < 9; k++) {
      const leaf = new THREE.BoxGeometry(0.5, 0.05, 3.4);
      leaf.translate(0, 0, 1.7);
      G.xf(leaf, { rx: G.rand(0.25, 0.6), ry: (k / 9) * Math.PI * 2 + G.rand(-0.2, 0.2), x, y: y + h, z });
      B.add('vc', G.Mat.vc, G.colorize(leaf, G.pick(['#3d6b2a', '#4c7a2f', '#2f5a22'])));
    }
  }
  function tree(x, z, y, s) {
    s = s || G.rand(0.8, 1.3);
    y = y || 0.2;
    B.add('vc', G.Mat.vc, G.cyl(0.18 * s, 0.25 * s, 3 * s, 6, x, y + 1.5 * s, z, '#5d4632'));
    const c = new THREE.IcosahedronGeometry(2.2 * s, 1);
    c.scale(1, 0.85, 1);
    c.translate(x, y + 3.8 * s, z);
    B.add('vc', G.Mat.vc, G.colorize(c, G.pick(['#4f7a31', '#5c8a3a', '#466e2c'])));
  }
  // double-armed lamp post; arms across the road
  function lamp(x, z, acrossX) {
    B.add('vc', G.Mat.vc, G.cyl(0.08, 0.13, 9, 6, x, 4.5 + 0.3, z, '#6b6b6b'));
    const ax = acrossX ? 2.4 : 0.1, az = acrossX ? 0.1 : 2.4;
    B.add('vc', G.Mat.vc, G.box(ax, 0.1, az, x, 9.2, z, '#6b6b6b'));
    const ox = acrossX ? 1.2 : 0, oz = acrossX ? 0 : 1.2;
    B.add('vc', G.Mat.vc, G.box(0.5, 0.15, 0.5, x + ox, 9.1, z + oz, '#eeeeee'));
    B.add('vc', G.Mat.vc, G.box(0.5, 0.15, 0.5, x - ox, 9.1, z - oz, '#eeeeee'));
  }
  function signPost(x, z, rowIdx, faceRy, y) {
    // two back-to-back single-sided planes so the text never appears mirrored
    for (let k = 0; k < 2; k++) {
      const g = new THREE.PlaneGeometry(3.2, 0.4);
      remapUV(g, 0, 1, 1 - (rowIdx + 1) / 16, 1 - rowIdx / 16);
      g.rotateY(faceRy + k * Math.PI);
      g.translate(x, y, z);
      B.add('signs', G.Mat.streetSigns, g);
    }
  }
  function cone(x, z) {
    const c = new THREE.ConeGeometry(0.25, 0.75, 8);
    c.translate(x, 0.38, z);
    B.add('vc', G.Mat.vc, G.colorize(c, '#ff6d00'));
    B.add('vc', G.Mat.vc, G.cyl(0.15, 0.17, 0.1, 8, x, 0.45, z, '#fafafa'));
  }

  // ---------------- special blocks ----------------
  function mosque(cx, z0) {
    const W = '#e9dcc0', A = '#c8b48e';
    B.add('vc', G.Mat.vc, G.box(30, 10, 22, cx, 5.2, z0 + 11, W));
    B.add('vc', G.Mat.vc, G.box(30.2, 0.6, 22.2, cx, 10.2, z0 + 11, A));
    for (let k = -3; k <= 3; k++) {
      B.add('vc', G.Mat.vc, G.box(2, 4, 0.1, cx + k * 4, 5, z0 - 0.02, '#4e3b2a'));
      const arch = new THREE.CylinderGeometry(1, 1, 0.1, 10, 1, false, -Math.PI / 2, Math.PI);
      G.xf(arch, { rx: Math.PI / 2, x: cx + k * 4, y: 7, z: z0 - 0.02 });
      B.add('vc', G.Mat.vc, G.colorize(arch, '#4e3b2a'));
    }
    B.add('vc', G.Mat.vc, G.box(4, 6, 0.2, cx, 3.2, z0 - 0.05, '#2f5d50'));
    const dome = new THREE.SphereGeometry(8, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.translate(cx, 10.5, z0 + 11);
    B.add('vc', G.Mat.vc, G.colorize(dome, '#b7c9b0'));
    B.add('vc', G.Mat.vc, G.cyl(8.2, 8.2, 1.5, 16, cx, 10.6, z0 + 11, A));
    B.add('vc', G.Mat.vc, G.cyl(0.08, 0.08, 3, 4, cx, 20, z0 + 11, '#c9a227'));
    B.add('vc', G.Mat.vc, G.sphere(0.4, cx, 21.5, z0 + 11, '#c9a227'));
    [-18, 18].forEach((dx) => {
      const x = cx + dx, z = z0 + 3;
      B.add('vc', G.Mat.vc, G.box(4, 12, 4, x, 6.2, z, W));
      B.add('vc', G.Mat.vc, G.cyl(1.6, 1.8, 12, 8, x, 18, z, W));
      B.add('vc', G.Mat.vc, G.cyl(2.3, 2.0, 0.8, 10, x, 24.4, z, A));
      B.add('vc', G.Mat.vc, G.cyl(1.2, 1.4, 8, 8, x, 28.8, z, W));
      B.add('vc', G.Mat.vc, G.cyl(1.9, 1.6, 0.7, 10, x, 33, z, A));
      B.add('vc', G.Mat.vc, G.cyl(0.9, 1.0, 4, 8, x, 35.3, z, W));
      const top = new THREE.ConeGeometry(1.0, 3, 8);
      top.translate(x, 38.8, z);
      B.add('vc', G.Mat.vc, G.colorize(top, '#b7c9b0'));
      B.add('vc', G.Mat.vc, G.sphere(0.3, x, 40.6, z, '#c9a227'));
    });
  }

  function gasStation(x0, x1, zFront) {
    const cx = (x0 + x1) / 2, cz = zFront - 9;
    B.add('vc', G.Mat.vc, G.box(26, 0.9, 13, cx, 5.6, cz, '#f5f5f5'));
    B.add('vc', G.Mat.vc, G.box(26.1, 0.35, 13.1, cx, 5.25, cz, '#c62828'));
    [[-9, -4], [9, -4], [-9, 4], [9, 4]].forEach(([dx, dz]) => B.add('vc', G.Mat.vc, G.box(0.5, 5, 0.5, cx + dx, 2.7, cz + dz, '#ddd')));
    [-6, 0, 6].forEach((dx) => {
      B.add('vc', G.Mat.vc, G.box(0.9, 1.7, 0.6, cx + dx, 1.05, cz, '#c62828'));
      B.add('vc', G.Mat.vc, G.box(0.7, 0.4, 0.62, cx + dx, 1.4, cz, '#222'));
    });
    addBuilding(cx - 8, cx + 8, zFront - 26, zFront - 17, 1, '+z', true);
    B.add('vc', G.Mat.vc, G.box(0.4, 9, 0.4, x0 + 2, 4.7, zFront - 1.5, '#888'));
    const s = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), new THREE.MeshLambertMaterial({ map: G.tex(G.Models.signCanvas('بنزينة النيل', '#c62828', '#fff', 512, 256, '٨٠ – ٩٢ – ٩٥ – سولار')) }));
    s.position.set(x0 + 2, 9.5, zFront - 1.3);
    C.root.add(s);
    const s2 = s.clone(); s2.rotation.y = Math.PI; s2.position.z -= 0.05; C.root.add(s2);
    C.gasCenterX = cx;
  }

  function park(x0, x1, z0, z1) {
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
    g.rotateX(-Math.PI / 2);
    scaleUV(g, (x1 - x0) / 4, (z1 - z0) / 4);
    g.translate((x0 + x1) / 2, 0.22, (z0 + z1) / 2);
    BF.add('grass', G.Mat.grass, g);
    for (let k = 0; k < 28; k++) tree(G.rand(x0 + 4, x1 - 4), G.rand(z0 + 4, z1 - 4), 0.2, G.rand(0.9, 1.6));
    for (let k = 0; k < 4; k++) palm(G.rand(x0 + 6, x1 - 6), G.rand(z0 + 6, z1 - 6), 0.2);
    const F = '#2e5d34';
    [[x0, z0, x1, z0], [x0, z1, x1, z1], [x0, z0, x0, z1], [x1, z0, x1, z1]].forEach(([ax, az, bx, bz]) => {
      const len = Math.hypot(bx - ax, bz - az);
      const horiz = az === bz;
      for (let t = 0; t < len; t += 2.5) {
        const x = ax + (horiz ? t : 0), z = az + (horiz ? 0 : t);
        if (Math.abs(t - len / 2) < 3) continue; // gate
        B.add('vc', G.Mat.vc, G.box(0.08, 1.3, 0.08, x, 0.85, z, F));
      }
      B.add('vc', G.Mat.vc, G.box(horiz ? len : 0.06, 0.06, horiz ? 0.06 : len, (ax + bx) / 2, 1.4, (az + bz) / 2, F));
    });
  }

  // ---------------- landmarks outside the grid ----------------
  function landmarks() {
    const hazy = (c) => new THREE.MeshLambertMaterial({ color: c, fog: false });
    // Pyramids of Giza far to the south-west
    [[0, 0, 1.0], [-260, -160, 0.9], [-430, -260, 0.55]].forEach(([dx, dz, s]) => {
      const p = new THREE.Mesh(new THREE.ConeGeometry(160 * s, 200 * s, 4), hazy('#dcc79e'));
      p.position.set(C.MIN - 950 + dx, 100 * s - 2, C.MIN - 700 + dz);
      p.rotation.y = Math.PI / 4;
      C.root.add(p);
    });
    // Nile
    const wx0 = C.MAX + RW + SW + 1;
    const w = new THREE.Mesh(new THREE.PlaneGeometry(900, 3000), G.Mat.water);
    w.rotation.x = -Math.PI / 2;
    w.position.set(wx0 + 450, -0.15, 0);
    G.Tex.water.repeat.set(40, 120);
    C.root.add(w);
    C.water = w;
    // Zamalek island + Cairo Tower
    const isl = new THREE.Mesh(new THREE.PlaneGeometry(220, 900), G.Mat.grass);
    isl.rotation.x = -Math.PI / 2;
    isl.position.set(wx0 + 300, 0.1, 0);
    C.root.add(isl);
    for (let k = 0; k < 45; k++) tree(wx0 + G.rand(200, 400), G.rand(-430, 430), 0.1, G.rand(1.2, 2));
    const tx = wx0 + 290, tz = 40;
    const tower = new THREE.Group();
    const tm = new THREE.MeshLambertMaterial({ color: '#c3a98a' });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(5, 8, 150, 16, 1, true), tm);
    shaft.position.y = 75;
    const lattice = new THREE.Mesh(new THREE.CylinderGeometry(5.3, 8.3, 150, 16, 20, true), new THREE.MeshLambertMaterial({ color: '#8a7158', wireframe: true }));
    lattice.position.y = 75;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(9, 5, 14, 16), tm);
    top.position.y = 155;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 1.2, 25, 6), tm);
    mast.position.y = 175;
    tower.add(shaft, lattice, top, mast);
    tower.position.set(tx, 0, tz);
    C.root.add(tower);
    // a few towers on the far bank
    for (let k = 0; k < 18; k++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(G.rand(15, 30), G.rand(30, 90), G.rand(15, 30)), new THREE.MeshLambertMaterial({ color: G.pick(['#cdbfa6', '#b9b2a6', '#d8cdb8']) }));
      m.position.set(wx0 + G.rand(480, 700), m.geometry.parameters.height / 2, G.rand(-700, 700));
      C.root.add(m);
    }
  }


  // ---------------- district (reference look): low beige buildings with setbacks and walls ----------------
  function palmSpot(x, z, y) { const v = new THREE.Vector3(x, y || 0.2, z); v.palm = true; C.treeSpots.push(v); }
  function treeSpot(x, z, y) { C.treeSpots.push(new THREE.Vector3(x, y || 0.2, z)); }
  // boundary wall with a cap and a gate gap, along x (horiz) or z
  function wallRun(x0, z0, x1, z1, gateAt) {
    const horiz = Math.abs(z1 - z0) < 0.01, len = horiz ? x1 - x0 : z1 - z0;
    const seg = (a, b) => {
      if (b - a < 0.3) return;
      const m = (a + b) / 2, l = b - a;
      if (horiz) {
        B.add('vc', G.Mat.vc, G.box(l, 2.1, 0.25, x0 + m, 1.25, z0, '#cdb894'));
        B.add('vc', G.Mat.vc, G.box(l, 0.12, 0.35, x0 + m, 2.36, z0, '#b39c78'));
      } else {
        B.add('vc', G.Mat.vc, G.box(0.25, 2.1, l, x0, 1.25, z0 + m, '#cdb894'));
        B.add('vc', G.Mat.vc, G.box(0.35, 0.12, l, x0, 2.36, z0 + m, '#b39c78'));
      }
    };
    if (gateAt == null) seg(0, len);
    else {
      seg(0, gateAt - 1.8); seg(gateAt + 1.8, len);
      const gx = horiz ? x0 + gateAt : x0, gz = horiz ? z0 : z0 + gateAt;
      B.add('vc', G.Mat.vc, horiz ? G.box(3.4, 1.9, 0.08, gx, 1.15, gz, '#3b3b38') : G.box(0.08, 1.9, 3.4, gx, 1.15, gz, '#3b3b38'));
    }
  }
  // plots along one side of the block; axis = direction of the street side
  function plotRow(axis, a0, a1, front, inward) {
    let a = a0;
    while (a < a1 - 10) {
      let w = G.rand(18, 30);
      if (a1 - (a + w) < 12) w = a1 - a;
      const walled = G.chance(0.55);
      const set = walled ? G.rand(4, 7) : 0.3; // setback from the sidewalk
      const gap = G.rand(1.5, 4);
      const depth = G.rand(13, 19), floors = G.randi(3, 5);
      const b0 = a + gap, b1 = a + w - gap;
      let minX, maxX, minZ, maxZ, side;
      if (axis === 'x') {
        minX = b0; maxX = b1;
        if (inward > 0) { minZ = front + set; maxZ = minZ + depth; side = '-z'; } else { maxZ = front - set; minZ = maxZ - depth; side = '+z'; }
      } else {
        minZ = b0; maxZ = b1;
        if (inward > 0) { minX = front + set; maxX = minX + depth; side = '-x'; } else { maxX = front - set; minX = maxX - depth; side = '+x'; }
      }
      addBuilding(minX, maxX, minZ, maxZ, floors, walled ? null : side, false);
      if (walled) {
        if (axis === 'x') wallRun(a + 0.3, front + inward * 0.2, a + w - 0.3, front + inward * 0.2, G.rand(4, w - 4));
        else wallRun(front + inward * 0.2, a + 0.3, front + inward * 0.2, a + w - 0.3, G.rand(4, w - 4));
        if (G.chance(0.6)) { // a tree in the front yard
          const t = a + G.rand(3, w - 3), o = front + inward * set * 0.5;
          if (axis === 'x') treeSpot(t, o); else treeSpot(o, t);
        }
      }
      a += w;
    }
  }
  function districtBlock(x0, x1, z0, z1, ax0, ax1, az0, az1) {
    plotRow('x', ax0, ax1, az0, 1);
    plotRow('x', ax0, ax1, az1, -1);
    plotRow('z', az0 + 26, az1 - 26, ax0, 1);
    plotRow('z', az0 + 26, az1 - 26, ax1, -1);
    // sidewalks stay clear like the reference; trees only in walled front yards
    void x0; void x1; void z0; void z1;
  }

  // ======================= BUILD =======================
  C.build = function (scene) {
    C.treeSpots = [];
    B = new G.Batch();
    BF = new G.Batch();
    const root = (C.root = new THREE.Group());
    scene.add(root);
    const R = C.R, MIN = C.MIN, MAX = C.MAX;

    // ground
    // well below the roads so it can never z-fight with them; tessellated for depth precision
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000, 40, 40), G.Mat.sand);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.6;
    G.Tex.sand.repeat.set(400, 400);
    ground.receiveShadow = true;
    root.add(ground);

    // roads, intersections, medians
    const L = BLOCK - 2 * RW;
    for (let r = 0; r < NR; r++) {
      for (let s = 0; s < NR - 1; s++) {
        const mid = (R[s] + R[s + 1]) / 2;
        // along x at z = R[r]
        let g = new THREE.PlaneGeometry(L, 2 * RW);
        scaleUV(g, L / 12, 1);
        g.rotateX(-Math.PI / 2);
        g.translate(mid, 0, R[r]);
        BF.add('road', G.Mat.road, g);
        curbBox(mid - L / 2, mid + L / 2, R[r] - MED, R[r] + MED, 0.3, true);
        // along z at x = R[r]
        g = new THREE.PlaneGeometry(L, 2 * RW);
        scaleUV(g, L / 12, 1);
        g.rotateX(-Math.PI / 2);
        g.rotateY(Math.PI / 2);
        g.translate(R[r], 0, mid);
        BF.add('road', G.Mat.road, g);
        curbBox(R[r] - MED, R[r] + MED, mid - L / 2, mid + L / 2, 0.3, true);
        // median lamps / palms
        const mainX = r === NH, avenue = r === NH || r === NR - 1;
        for (let t = -L / 2 + 8; t < L / 2 - 4; t += 15) {
          const odd = Math.round((t + L / 2) / 15) % 2;
          if (D && odd) { palmSpot(mid + t, R[r], 0.3); palmSpot(R[r], mid + t, 0.3); }
          else if (avenue && odd) { palm(mid + t, R[r]); palm(R[r], mid + t); }
          else { lamp(mid + t, R[r], false); lamp(R[r], mid + t, true); }
        }
        void mainX;
      }
      for (let c = 0; c < NR; c++) {
        const g = new THREE.PlaneGeometry(2 * RW, 2 * RW);
        scaleUV(g, 2.5, 2.5);
        g.rotateX(-Math.PI / 2);
        g.translate(R[r], 0.001, R[c]);
        BF.add('asph', G.Mat.asphalt, g);
        // street name signs at the NE corner of every junction
        const sx = R[r] + RW + 1.3, sz = R[c] + RW + 1.3;
        B.add('vc', G.Mat.vc, G.cyl(0.05, 0.05, 3.6, 5, sx, 2.0, sz, '#555'));
        signPost(sx, sz, c, Math.PI / 2, 3.55); // name of the road running along x (z = R[c])
        signPost(sx, sz, 7 + r, 0, 3.05); // name of the road running along z (x = R[r])
      }
    }

    // city blocks
    for (let i = 0; i < NR - 1; i++) {
      for (let j = 0; j < NR - 1; j++) {
        const x0 = R[i] + RW, x1 = R[i + 1] - RW, z0 = R[j] + RW, z1 = R[j + 1] - RW;
        const type = SPECIAL[i + ',' + j] || 'normal';
        curbBox(x0, x1, z0, z1, 0.2, true);
        C.blocks.push({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, type, i, j });
        const ax0 = x0 + SW, ax1 = x1 - SW, az0 = z0 + SW, az1 = z1 - SW;
        if (type === 'park') { park(ax0, ax1, az0, az1); continue; }
        if (D && type === 'normal') { districtBlock(x0, x1, z0, z1, ax0, ax1, az0, az1); continue; }
        const cx = (ax0 + ax1) / 2;
        if (type === 'mosque') {
          row('x', ax0, cx - 21, az0, 1);
          row('x', cx + 21, ax1, az0, 1);
          mosque(cx, az0);
        } else row('x', ax0, ax1, az0, 1);
        if (type === 'gas') {
          row('x', ax0, ax0 + 20, az1, -1);
          gasStation(ax0 + 20, ax1, az1);
        } else row('x', ax0, ax1, az1, -1);
        row('z', az0 + 18, az1 - 18, ax0, 1);
        row('z', az0 + 18, az1 - 18, ax1, -1);
        if (type !== 'mosque' && type !== 'gas') addBuilding(ax0 + 14, ax1 - 14, az0 + 14, az1 - 14, G.randi(2, 4), null, true);
        // sidewalk trees
        [[x0 + 1.3, null], [x1 - 1.3, null], [null, z0 + 1.3], [null, z1 - 1.3]].forEach(([fx, fz]) => {
          for (let t = 12; t < x1 - x0 - 12; t += 22) {
            if (!G.chance(0.35)) continue;
            tree(fx != null ? fx : x0 + t, fz != null ? fz : z0 + t);
          }
        });
      }
    }

    // edge strips of buildings that close the grid (west, south, north) + corniche walkway (east)
    const E = 70;
    curbBox(MIN - RW - E, MIN - RW, MIN - RW - E, MAX + RW + E, 0.2, true);
    row('z', MIN - RW, MAX + RW, MIN - RW - SW, -1, D ? { fMin: 3, fMax: 5 } : { fMax: 8 });
    row('z', MIN - RW - E, MAX + RW + E, MIN - RW - SW - 22, -1, D ? { shops: false, fMin: 4, fMax: 6, noProps: true } : { shops: false, fMin: 6, fMax: 10, noProps: true });
    curbBox(MIN - RW, MAX + RW + SW + 1, MIN - RW - E, MIN - RW, 0.2, true);
    row('x', MIN - RW, MAX + RW, MIN - RW - SW, -1, D ? { fMin: 3, fMax: 5 } : { fMax: 7 });
    row('x', MIN - RW, MAX + RW, MIN - RW - SW - 22, -1, D ? { shops: false, fMin: 4, fMax: 6, noProps: true } : { shops: false, fMin: 5, fMax: 9, noProps: true });
    curbBox(MIN - RW, MAX + RW + SW + 1, MAX + RW, MAX + RW + E, 0.2, true);
    row('x', MIN - RW, MAX + RW, MAX + RW + SW, 1, D ? { fMin: 3, fMax: 5 } : {});
    row('x', MIN - RW, MAX + RW, MAX + RW + SW + 22, 1, D ? { shops: false, fMin: 4, fMax: 6, noProps: true } : { shops: false, fMin: 6, fMax: 12, noProps: true });
    curbBox(MAX + RW, MAX + RW + SW + 1, MIN - RW, MAX + RW, 0.2, true);
    C.blocks.push({ minX: MIN - RW - E, maxX: MIN - RW, minZ: MIN - RW - E, maxZ: MAX + RW + E, type: 'edge' });
    C.blocks.push({ minX: MIN - RW, maxX: MAX + RW + SW + 1, minZ: MIN - RW - E, maxZ: MIN - RW, type: 'edge' });
    C.blocks.push({ minX: MIN - RW, maxX: MAX + RW + SW + 1, minZ: MAX + RW, maxZ: MAX + RW + E, type: 'edge' });
    C.blocks.push({ minX: MAX + RW, maxX: MAX + RW + SW + 1, minZ: MIN - RW, maxZ: MAX + RW, type: 'corniche' });
    // corniche railing + palms
    const rx = MAX + RW + SW + 0.8;
    B.add('vc', G.Mat.vc, G.box(0.1, 0.1, MAX - MIN + 2 * RW, rx, 1.2, 0, '#2d4f3c'));
    B.add('vc', G.Mat.vc, G.box(0.1, 0.1, MAX - MIN + 2 * RW, rx, 0.7, 0, '#2d4f3c'));
    for (let z = MIN - RW + 1; z < MAX + RW; z += 2.5) B.add('vc', G.Mat.vc, G.box(0.08, 1.1, 0.08, rx, 0.75, z, '#2d4f3c'));
    for (let z = MIN; z < MAX; z += 16) (D ? palmSpot : palm)(MAX + RW + 2.8, z + 8, 0.2);

    landmarks();

    // police checkpoint (كمين)
    const cp = C.CHECKPOINT;
    const cpx = (R[cp.seg] + R[cp.seg + 1]) / 2, cpz = R[cp.road];
    C.checkpointPos = new THREE.Vector3(cpx, 0, cpz);
    for (let t = -14; t <= 14; t += 3.5) { cone(cpx + t, cpz + 9.3); cone(cpx + t, cpz - 9.3); cone(cpx + t, cpz + 1.4); cone(cpx + t, cpz - 1.4); }
    B.add('vc', G.Mat.vc, G.box(3, 0.9, 0.6, cpx - 18, 0.45, cpz + 9.3, '#e0e0e0'));
    B.add('vc', G.Mat.vc, G.box(3, 0.9, 0.6, cpx - 18, 0.45, cpz - 9.3, '#e0e0e0'));
    const police = G.Models.vehicle('police');
    police.mesh.position.set(cpx + 6, 0.2, cpz + RW + 2.2);
    police.mesh.rotation.y = Math.PI / 2;
    root.add(police.mesh);
    const lr = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.28), new THREE.MeshBasicMaterial({ color: '#ff1744' }));
    const lb = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.28), new THREE.MeshBasicMaterial({ color: '#2979ff' }));
    lr.position.set(0.3, 1.72, -0.3); lb.position.set(-0.3, 1.72, -0.3);
    police.mesh.add(lr, lb);
    C.policeLights = [lr, lb];
    if (D) {
      // red/white concrete barriers narrowing the road, a second police car on the other side
      for (let t = -10; t <= 10; t += 5) {
        B.add('vc', G.Mat.vc, G.box(2.0, 0.8, 0.5, cpx + t, 0.4, cpz + 4.6, t % 10 ? '#d8d4cc' : '#b71c1c'));
        B.add('vc', G.Mat.vc, G.box(2.0, 0.8, 0.5, cpx + t, 0.4, cpz - 4.6, t % 10 ? '#d8d4cc' : '#b71c1c'));
      }
      const p2 = G.Models.vehicle('police');
      p2.mesh.position.set(cpx - 8, 0.2, cpz - RW - 2.2);
      p2.mesh.rotation.y = -Math.PI / 2;
      root.add(p2.mesh);
    }

    // station signs
    C.STATIONS.forEach((s) => {
      const along = (R[s.seg] + R[s.seg + 1]) / 2;
      s.along = along;
      s.dir = C.dirForSide(s.axis, s.side);
      s.stopPos = C.lanePos(s.axis, R[s.road], s.dir, D ? 2 : 1, along);
      s.heading = C.headingFor(s.axis, s.dir);
      s.walkPos = C.sidePoint(s.axis, R[s.road], along, s.side, 1.6);
      const pole = C.sidePoint(s.axis, R[s.road], along + 6, s.side, 0.8);
      B.add('vc', G.Mat.vc, G.cyl(0.07, 0.07, 3.4, 6, pole.x, 1.9, pole.z, '#444'));
      const mat = new THREE.MeshLambertMaterial({ map: G.tex(G.Models.signCanvas('موقف ' + s.name, '#f9a825', '#1a1a1a', 512, 192, 'ميكروباص')) });
      for (let k = 0; k < 2; k++) {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.9), mat);
        m.position.set(pole.x, 3.4, pole.z);
        m.rotation.y = (s.axis === 'x' ? Math.PI / 2 : 0) + k * Math.PI;
        root.add(m);
      }
      // little shelter
      const sp = C.sidePoint(s.axis, R[s.road], along, s.side, 3.4);
      const shelter = s.axis === 'x' ? G.box(7, 0.12, 2, sp.x, 2.8, sp.z, '#1565c0') : G.box(2, 0.12, 7, sp.x, 2.8, sp.z, '#1565c0');
      B.add('vc', G.Mat.vc, shelter);
      for (const o of [-3.2, 3.2]) {
        const q = C.sidePoint(s.axis, R[s.road], along + o, s.side, 4.2);
        B.add('vc', G.Mat.vc, G.box(0.1, 2.6, 0.1, q.x, 1.5, q.z, '#888'));
      }
    });
    const g = C.GAS;
    C.gasPos = C.lanePos(g.axis, R[g.road], C.dirForSide(g.axis, g.side), 1, C.gasCenterX || (R[g.seg] + R[g.seg + 1]) / 2);

    // coffee shops (قهوة): sidewalk spots
    C.AHWA = [];
    [[3, 2, '-x'], [0, 4, '-z'], [5, 3, '+z']].forEach(([i, j, side]) => {
      const x0 = R[i] + RW, x1 = R[i + 1] - RW, z0 = R[j] + RW, z1 = R[j + 1] - RW;
      const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
      let p, face;
      if (side === '-x') { p = new THREE.Vector3(x0 + 2.4, 0.2, cz + 12); face = -Math.PI / 2; }
      else if (side === '-z') { p = new THREE.Vector3(cx - 14, 0.2, z0 + 2.4); face = Math.PI; }
      else { p = new THREE.Vector3(cx + 10, 0.2, z1 - 2.4); face = 0; }
      C.AHWA.push({ pos: p, face, side });
      for (let k = 0; k < 3; k++) {
        const o = (k - 1) * 3.2;
        const tx = p.x + (side === '-x' ? 0 : o), tz = p.z + (side === '-x' ? o : 0);
        B.add('vc', G.Mat.vc, G.cyl(0.4, 0.4, 0.05, 10, tx, 0.95, tz, '#eeeeee'));
        B.add('vc', G.Mat.vc, G.cyl(0.05, 0.05, 0.75, 5, tx, 0.57, tz, '#999'));
        B.add('vc', G.Mat.vc, G.cyl(0.08, 0.1, 0.25, 6, tx + 0.15, 1.1, tz, '#c62828'));
      }
    });

    B.build(root, true, true);
    BF.build(root, false, true);
  };
})(window.G);
