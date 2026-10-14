'use strict';
// Detailed vehicle models built from real side profiles: rounded extruded bodies with cut-out wheel
// arches, clear-coat paint, reflective glass with interiors, lathed tyres and rims, lamps, bumpers,
// mirrors and Egyptian plates. Used for the player's microbus (Toyota HiAce) and the traffic.
(function (G) {
  const V = (G.Vehicles = {});
  const cache = {};
  const lin = (c) => new THREE.Color(c).convertSRGBToLinear();
  const tag = (m) => { m.userData.linear = true; return m; };
  // phones: plain standard materials instead of clear-coat physical ones (much cheaper shaders)
  const PhysMat = function (o) {
    if (!(G.Main && G.Main.isMobile)) return new THREE.MeshPhysicalMaterial(o);
    const q = Object.assign({}, o); delete q.clearcoat; delete q.clearcoatRoughness;
    return new THREE.MeshStandardMaterial(q);
  };

  // ---------- shared materials ----------
  function mats() {
    if (cache.mats) return cache.mats;
    const M = {};
    M.glass = tag(new PhysMat({ color: lin('#0d1216'), roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02, transparent: true, opacity: 0.78, envMapIntensity: 1.6 }));
    M.rubber = tag(new THREE.MeshStandardMaterial({ color: lin('#1b1b1c'), roughness: 0.92, metalness: 0 }));
    M.plastic = tag(new THREE.MeshStandardMaterial({ color: lin('#232425'), roughness: 0.7, metalness: 0 }));
    M.chrome = tag(new THREE.MeshStandardMaterial({ color: lin('#e8e8e8'), roughness: 0.12, metalness: 1, envMapIntensity: 1.3 }));
    M.steel = tag(new THREE.MeshStandardMaterial({ color: lin('#7d8186'), roughness: 0.45, metalness: 0.8 }));
    M.lampGlass = tag(new PhysMat({ color: lin('#f6f6f2'), roughness: 0.05, metalness: 0.2, clearcoat: 1, emissive: lin('#fff3d6'), emissiveIntensity: 0.15 }));
    M.tail = tag(new PhysMat({ color: lin('#9c0c0c'), roughness: 0.15, clearcoat: 1, emissive: lin('#5a0000'), emissiveIntensity: 0.4 }));
    M.amber = tag(new PhysMat({ color: lin('#e08a00'), roughness: 0.15, clearcoat: 1, emissive: lin('#3a2000'), emissiveIntensity: 0.4 }));
    M.seat = tag(new THREE.MeshStandardMaterial({ color: lin('#3a3530'), roughness: 0.95 }));
    M.cabin = tag(new THREE.MeshStandardMaterial({ color: lin('#2a2826'), roughness: 0.95, side: THREE.BackSide }));
    // tyre with tread grooves (bump)
    const tc = G.canvas(256, 128), tx = tc.getContext('2d');
    tx.fillStyle = '#909090'; tx.fillRect(0, 0, 256, 128);
    // grooves only across the tread (middle of the lathe profile), smooth sidewalls
    for (let i = 0; i < 256; i += 6) { tx.fillStyle = '#3a3a3a'; tx.fillRect(i, 44, 2, 40); }
    tx.fillStyle = '#2a2a2a'; tx.fillRect(0, 56, 256, 3); tx.fillRect(0, 70, 256, 3);
    const tb = G.tex(tc, true);
    M.tyre = tag(new THREE.MeshStandardMaterial({ color: lin('#1a1a1a'), roughness: 0.95, bumpMap: tb, bumpScale: 0.02 }));
    M.tyreD = tag(M.tyre.clone()); M.tyreD.side = THREE.DoubleSide;
    M.steelD = tag(M.steel.clone()); M.steelD.side = THREE.DoubleSide;
    cache.mats = M;
    return M;
  }

  // paint texture: base colour, stripes and road dust towards the sills (planar side mapping)
  function paintTex(base, stripes, dirt, opts) {
    const key = base + stripes.join() + dirt + JSON.stringify(opts || {});
    if (cache[key]) return cache[key];
    const c = G.canvas(1024, 512), x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, 1024, 512);
    // stripes: [y0, y1 as fraction of height from bottom, colour]
    stripes.forEach(([a, b, col]) => { x.fillStyle = col; x.fillRect(0, 512 * (1 - b), 1024, 512 * (b - a)); });
    if (opts && opts.checker) { // Cairo taxi black-and-white check band
      const [a, b] = opts.checker, hgt = 512 * (b - a), y0 = 512 * (1 - b);
      for (let i = 0; i * hgt / 2 < 1024; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#f4f4f0'; x.fillRect(i * hgt / 2, y0 + j * hgt / 2, hgt / 2, hgt / 2); }
    }
    // dust and grime towards the bottom, a few streaks
    const g = x.createLinearGradient(0, 512, 0, 512 * 0.55);
    g.addColorStop(0, `rgba(120,96,62,${0.55 * dirt})`); g.addColorStop(1, 'rgba(120,96,62,0)');
    x.fillStyle = g; x.fillRect(0, 0, 1024, 512);
    for (let i = 0; i < 60 * dirt; i++) {
      x.fillStyle = `rgba(110,90,60,${Math.random() * 0.12})`;
      x.fillRect(Math.random() * 1024, 512 * (0.5 + Math.random() * 0.4), 2 + Math.random() * 4, 20 + Math.random() * 90);
    }
    // panel gaps: front doors, sliding door, rear hatch (z in metres along a 5 m body)
    if (opts && opts.seams) opts.seams.forEach(([z, v0, v1]) => {
      const u = ((z + 2.5) / 5) * 1024;
      x.fillStyle = 'rgba(40,40,40,0.55)'; x.fillRect(u, 512 * (1 - v1), 2, 512 * (v1 - v0));
      x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(u + 2, 512 * (1 - v1), 1, 512 * (v1 - v0));
    });
    G.noise(x, 1024, 512, 6000, 0.03);
    const t = G.tex(c);
    t.anisotropy = 4;
    cache[key] = t;
    return t;
  }

  // Extrude a side profile ([z, y] points, front = +z) across the width with rounded edges.
  // taper: how much narrower the roof is than the sills (tumblehome).
  function body(profile, width, opt) {
    const r = opt.round || 0.08;
    const shape = new THREE.Shape();
    profile.forEach(([z, y], i) => (i ? shape.lineTo(z, y) : shape.moveTo(z, y)));
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: width - 2 * r, bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 4, curveSegments: 18, steps: 1 });
    g.rotateY(-Math.PI / 2);
    g.translate((width - 2 * r) / 2, 0, 0);
    const p = g.attributes.position, uv = g.attributes.uv;
    const belt = opt.belt || 1.1, top = opt.top || 2;
    let zmin = 1e9, zmax = -1e9;
    for (let i = 0; i < p.count; i++) { zmin = Math.min(zmin, p.getZ(i)); zmax = Math.max(zmax, p.getZ(i)); }
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > belt) p.setX(i, p.getX(i) * (1 - (opt.taper || 0.06) * Math.min(1, (y - belt) / (top - belt))));
      uv.setXY(i, (p.getZ(i) - zmin) / (zmax - zmin), y / (top + r));
    }
    g.computeVertexNormals();
    return g;
  }
  // half width of a tapered body at height y
  const halfAt = (W, y, opt) => (W / 2) * (1 - (opt.taper || 0.06) * G.clamp((y - (opt.belt || 1.1)) / ((opt.top || 2) - (opt.belt || 1.1)), 0, 1));

  // a flat pane following a 2D outline ([z, y]) on one side of the body
  function sidePane(outline, side, W, opt, mat, inset) {
    const s = new THREE.Shape();
    outline.forEach(([z, y], i) => (i ? s.lineTo(z, y) : s.moveTo(z, y)));
    const g = new THREE.ShapeGeometry(s);
    // ShapeGeometry lies in XY: map shape x -> world z, shape y -> world y, push to the side
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const z = p.getX(i), y = p.getY(i);
      p.setXYZ(i, side * (halfAt(W, y, opt) + (inset || 0.004)), y, z);
    }
    if (side > 0) g.index.array.reverse(); // the side mapping mirrors the winding
    g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  }

  // wheel: lathed tyre with sidewall bulge + pressed steel rim, hub and nuts
  function wheelGeo(R, Wd) {
    const key = 'w' + R + Wd;
    if (cache[key]) return cache[key];
    const pts = [];
    const rr = R * 0.62, h = Wd / 2;
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI;
      pts.push(new THREE.Vector2(rr + (R - rr) * (0.55 + 0.45 * Math.sin(a)) + (i === 0 || i === 16 ? -0.01 : 0), -h + (i / 16) * Wd));
    }
    pts.unshift(new THREE.Vector2(rr, -h * 0.9));
    pts.push(new THREE.Vector2(rr, h * 0.9));
    const tyre = new THREE.LatheGeometry(pts, 40);
    tyre.rotateZ(-Math.PI / 2); // lathe axis -> +x (outer face)
    // rim: dished disc
    const rp = [[0, h * 0.55], [rr * 0.35, h * 0.6], [rr * 0.55, h * 0.35], [rr * 0.95, h * 0.5], [rr * 1.02, h * 0.75], [rr * 1.02, -h * 0.6], [0, -h * 0.6]].map(([a, b]) => new THREE.Vector2(a, b));
    const rim = new THREE.LatheGeometry(rp, 28);
    rim.rotateZ(-Math.PI / 2);
    const nuts = [];
    for (let k = 0; k < 6; k++) {
      const n = new THREE.CylinderGeometry(0.014, 0.014, 0.03, 6);
      n.rotateZ(Math.PI / 2);
      const a = (k / 6) * Math.PI * 2;
      n.translate(h * 0.62, Math.sin(a) * rr * 0.42, Math.cos(a) * rr * 0.42);
      nuts.push(n);
    }
    const hub = new THREE.CylinderGeometry(rr * 0.3, rr * 0.36, 0.05, 20);
    hub.rotateZ(Math.PI / 2);
    hub.translate(h * 0.62, 0, 0);
    cache[key] = { tyre, rim, hub: G.merge([hub].concat(nuts).map((q) => { if (q.attributes.color) q.deleteAttribute('color'); return q; })) };
    return cache[key];
  }
  function wheel(R, Wd, side) {
    const w = wheelGeo(R, Wd), M = mats();
    const grp = new THREE.Group();
    const spin = new THREE.Group();
    const t = new THREE.Mesh(w.tyre, M.tyreD), r = new THREE.Mesh(w.rim, M.steelD), h = new THREE.Mesh(w.hub, M.chrome);
    [t, r, h].forEach((m) => { m.castShadow = true; spin.add(m); });
    if (side < 0) spin.scale.x = -1;
    grp.add(spin);
    grp.userData.spin = spin;
    return grp;
  }

  // rounded box helper (bumpers, lamps)
  function rbox(w, h, d, r, mat) {
    const s = new THREE.Shape();
    const x0 = -w / 2, y0 = -h / 2;
    s.moveTo(x0 + r, y0); s.lineTo(x0 + w - r, y0); s.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    s.lineTo(x0 + w, y0 + h - r); s.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    s.lineTo(x0 + r, y0 + h); s.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
    s.lineTo(x0, y0 + r); s.quadraticCurveTo(x0, y0, x0 + r, y0);
    const g = new THREE.ExtrudeGeometry(s, { depth: d - 0.02, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.01, bevelSegments: 2, curveSegments: 6 });
    g.translate(0, 0, -(d - 0.02) / 2);
    const m = new THREE.Mesh(g, mat);
    m.castShadow = true;
    return m;
  }

  // Egyptian plate: blue band "مصر EGYPT" over Arabic letters and numbers
  V.plateTex = function (orange) {
    const key = 'plate' + !!orange;
    if (cache[key]) return cache[key];
    const c = G.canvas(256, 128), x = c.getContext('2d');
    x.fillStyle = '#f4f4f0'; x.fillRect(0, 0, 256, 128);
    x.fillStyle = orange ? '#e06d00' : '#1f5fae'; x.fillRect(0, 0, 256, 38);
    x.fillStyle = '#fff'; x.font = 'bold 26px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('مصر   EGYPT', 128, 20);
    x.fillStyle = '#111'; x.font = 'bold 52px sans-serif';
    x.fillText('ق ر ب', 70, 85);
    x.fillText('٤٣٧١', 186, 85);
    x.fillRect(128, 44, 3, 80);
    x.strokeStyle = '#222'; x.lineWidth = 6; x.strokeRect(3, 3, 250, 122);
    cache[key] = G.tex(c);
    return cache[key];
  };

  // ======================= TOYOTA HIACE MICROBUS =======================
  V.microbus = function (opts) {
    opts = opts || {};
    const M = mats();
    const W = 1.9, R = 0.34;
    const fa = 1.52, ra = -1.08, ar = 0.47; // axles and arch radius (profile is inset by the bevel)
    const opt = { round: 0.08, belt: 1.15, top: 2.0, taper: 0.07 };
    const prof = [[2.36, 0.4]];
    const arch = (cz) => { for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI; prof.push([cz + Math.cos(a) * ar, 0.36 + Math.sin(a) * ar]); } };
    arch(fa);
    arch(ra);
    prof.push([-2.38, 0.4], [-2.42, 0.62], [-2.42, 1.82], [-2.36, 1.97], [-2.22, 2.0], [1.62, 2.0], [1.82, 1.96], [1.96, 1.86],
      [2.28, 1.2], [2.38, 1.1], [2.42, 0.95], [2.42, 0.55]);
    const geo = body(prof, W, opt);
    const paint = tag(new PhysMat({
      color: 0xffffff, map: paintTex(opts.color || '#f2f2ee', opts.stripes || [[0.5, 0.515, '#1b6e3a'], [0.522, 0.552, '#d9771f'], [0.559, 0.574, '#1b6e3a']], opts.dirt == null ? 0.8 : opts.dirt, { seams: [[2.02, 0.2, 0.6], [1.12, 0.2, 0.6], [0.55, 0.2, 0.6], [-0.5, 0.2, 0.6], [-2.38, 0.3, 0.9]] }),
      roughness: 0.32, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1,
    }));
    const root = new THREE.Group();
    const bodyM = new THREE.Mesh(geo, paint);
    bodyM.castShadow = true;
    bodyM.receiveShadow = true;
    root.add(bodyM);

    // ---- glass: continuous dark band down each side, windscreen, rear window
    [1, -1].forEach((s) => {
      root.add(sidePane([[-2.3, 1.3], [1.45, 1.3], [1.83, 1.3], [1.9, 1.86], [1.6, 1.9], [-2.25, 1.9], [-2.32, 1.82]], s, W, opt, M.glass, 0.006));
      // black pillars between panes
      [-1.35, -0.4, 0.55, 1.42].forEach((z) => {
        const pl = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.62, 0.07), M.plastic);
        pl.position.set(s * (halfAt(W, 1.6, opt) + 0.012), 1.6, z);
        pl.rotation.z = s * -0.06;
        root.add(pl);
      });
      // rubber seals along the glass band
      [1.29, 1.91].forEach((y) => {
        const sl = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.025, 4.15), M.rubber);
        sl.position.set(s * (halfAt(W, y, opt) + 0.009), y, -0.25);
        root.add(sl);
      });
    });
    const ws = new THREE.PlaneGeometry(1.62, 0.83);
    const wsm = new THREE.Mesh(ws, M.glass);
    wsm.position.set(0, 1.55, 2.14 + 0.08);
    wsm.rotation.x = -Math.atan2(2.28 - 1.96, 1.86 - 1.2);
    root.add(wsm);
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(1.52, 0.6), M.glass);
    rw.position.set(0, 1.55, -2.507);
    rw.rotation.y = Math.PI;
    root.add(rw);

    // ---- interior visible through the glass: lining, benches, dashboard, steering wheel
    const lining = new THREE.Mesh(new THREE.BoxGeometry(W - 0.16, 1.0, 4.3), M.cabin);
    lining.position.set(0, 1.45, -0.25);
    root.add(lining);
    for (let k = 0; k < 4; k++) {
      const seat = rbox(1.5, 0.5, 0.14, 0.05, M.seat);
      seat.position.set(-0.05, 1.18, -1.9 + k * 0.85);
      root.add(seat);
    }
    [0.42, -0.4].forEach((x) => { const s = rbox(0.5, 0.55, 0.14, 0.06, M.seat); s.position.set(x, 1.2, 1.25); root.add(s); });
    const dash = rbox(1.7, 0.22, 0.4, 0.05, M.plastic);
    dash.position.set(0, 1.25, 1.95);
    root.add(dash);
    const sw = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 8, 24), M.plastic);
    sw.position.set(0.45, 1.42, 1.72);
    sw.rotation.x = -0.9;
    root.add(sw);

    // ---- front: headlamps, grille, bumper, wipers
    [1, -1].forEach((s) => {
      const hl = rbox(0.3, 0.2, 0.06, 0.04, M.chrome);
      hl.position.set(s * 0.63, 0.92, 2.49);
      root.add(hl);
      const lens = rbox(0.27, 0.17, 0.04, 0.035, M.lampGlass);
      lens.position.set(s * 0.63, 0.92, 2.515);
      root.add(lens);
      const ind = rbox(0.12, 0.07, 0.04, 0.02, M.amber);
      ind.position.set(s * 0.82, 0.74, 2.5);
      root.add(ind);
    });
    for (let k = 0; k < 4; k++) {
      const bar = rbox(0.82, 0.03, 0.03, 0.012, k % 3 ? M.plastic : M.chrome);
      bar.position.set(0, 0.84 + k * 0.045, 2.505);
      root.add(bar);
    }
    const fb = rbox(1.94, 0.24, 0.16, 0.06, M.plastic);
    fb.position.set(0, 0.52, 2.5);
    root.add(fb);
    [0.35, -0.38].forEach((x) => {
      const wp = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.018, 0.018), M.plastic);
      wp.position.set(x, 1.24, 2.33);
      wp.rotation.z = x > 0 ? 0.12 : -0.08;
      root.add(wp);
    });
    // ---- rear: tail lamps, bumper, spare details
    [1, -1].forEach((s) => {
      const tl = rbox(0.16, 0.42, 0.05, 0.03, M.tail);
      tl.position.set(s * 0.83, 0.98, -2.5);
      root.add(tl);
      const ti = rbox(0.16, 0.1, 0.05, 0.02, M.amber);
      ti.position.set(s * 0.83, 0.71, -2.5);
      root.add(ti);
    });
    const rb = rbox(1.94, 0.22, 0.14, 0.06, M.plastic);
    rb.position.set(0, 0.5, -2.5);
    root.add(rb);
    // ---- mirrors on arms, door handles, side step, mud flaps
    [1, -1].forEach((s) => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.025, 0.025), M.plastic);
      arm.position.set(s * 1.02, 1.5, 1.82);
      root.add(arm);
      const mir = rbox(0.06, 0.22, 0.15, 0.03, M.plastic);
      mir.rotation.y = Math.PI / 2;
      mir.position.set(s * 1.13, 1.55, 1.82);
      root.add(mir);
      [1.25, -0.2].forEach((z) => {
        const hd = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.035, 0.16), M.chrome);
        hd.position.set(s * (W / 2 + 0.008), 1.12, z);
        root.add(hd);
      });
      [fa - 0.55, ra - 0.55].forEach((z) => {
        const mf = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.012), M.rubber);
        mf.position.set(s * 0.8, 0.22, z);
        root.add(mf);
      });
    });
    const step = rbox(0.9, 0.05, 0.22, 0.02, M.plastic);
    step.rotation.y = Math.PI / 2;
    step.position.set(-W / 2 + 0.05, 0.32, 0.25);
    root.add(step);
    // dark wheel wells so the arches aren't see-through
    [fa, ra].forEach((z) => [1, -1].forEach((sd) => {
      const well = new THREE.Mesh(new THREE.CircleGeometry(ar + 0.05, 24, 0, Math.PI), M.cabin);
      well.material = M.plastic;
      well.rotation.y = sd * Math.PI / 2;
      well.position.set(sd * 0.55, 0.36, z);
      root.add(well);
    }));
    // ---- wheels (spun / steered by the owner)
    const wheels = [];
    [[fa, 1], [fa, -1], [ra, 1], [ra, -1]].forEach(([z, s]) => {
      const w = wheel(R, 0.22, s);
      w.position.set(s * (W / 2 - 0.14), R, z);
      w.userData.front = z > 0;
      root.add(w);
      wheels.push(w);
    });
    root.traverse((o) => { if (o.isMesh && o !== bodyM) o.castShadow = o.castShadow || false; });
    return { root, wheels, len: 4.95, wid: W, plateZ: 2.6, plateY: 0.52 };
  };

  // merge every static mesh of a vehicle by material (few draw calls per car); wheels stay apart
  V.bake = function (root, keep, all) {
    root.updateMatrixWorld(true);
    const groups = new Map();
    const remove = [];
    root.traverse((o) => {
      if (!o.isMesh || (keep && keep(o))) return;
      let k = o; let skip = false;
      while (k && k !== root) { if (!all && (k.userData.spin || k.userData.keep)) skip = true; k = k.parent; }
      if (skip) return;
      const g = o.geometry.index ? o.geometry.clone() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      ['color', 'uv2'].forEach((a) => g.attributes[a] && g.deleteAttribute(a));
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!groups.has(o.material)) groups.set(o.material, []);
      groups.get(o.material).push(g);
      remove.push(o);
    });
    remove.forEach((o) => o.parent.remove(o));
    groups.forEach((geos, mat) => {
      const m = new THREE.Mesh(G.merge(geos), mat);
      m.castShadow = !mat.transparent;
      m.receiveShadow = true;
      root.add(m);
    });
    return root;
  };

  // generic car: side profile + glass band + lamps + bumpers + wheels
  V.car = function (sp) {
    const M = mats();
    const W = sp.W, R = sp.R, opt = { round: sp.round || 0.07, belt: sp.belt, top: sp.top, taper: sp.taper };
    const prof = [[sp.L / 2 - 0.05, sp.sill]];
    const arch = (cz, ar) => { for (let i = 0; i <= 14; i++) { const a = (i / 14) * Math.PI; prof.push([cz + Math.cos(a) * ar, R * 0.98 + Math.sin(a) * ar]); } };
    sp.axles.forEach((z) => arch(z, R + 0.12));
    prof.push([-sp.L / 2 + 0.05, sp.sill]);
    sp.upper.forEach((q) => prof.push(q));
    const geo = body(prof, W, opt);
    const paint = tag(new PhysMat({
      color: 0xffffff, map: paintTex(sp.color, sp.stripes || [], sp.dirt == null ? 0.5 : sp.dirt, { seams: sp.seams || [], checker: sp.checker }),
      roughness: 0.3, metalness: sp.metallic ? 0.35 : 0.05, clearcoat: 1, clearcoatRoughness: 0.08,
    }));
    const root = new THREE.Group();
    const bm = new THREE.Mesh(geo, paint);
    root.add(bm);
    // roof paint (e.g. black-and-white taxis) as a thin cap
    if (sp.roofColor) {
      const rc = new THREE.Mesh(new THREE.BoxGeometry(halfAt(W, sp.top, opt) * 2 - 0.12, 0.02, sp.roofLen), tag(new PhysMat({ color: lin(sp.roofColor), roughness: 0.3, clearcoat: 1 })));
      rc.position.set(0, sp.top + opt.round + 0.002, sp.roofZ || 0);
      root.add(rc);
    }
    [1, -1].forEach((s) => {
      root.add(sidePane(sp.window, s, W, opt, M.glass, 0.006));
      (sp.pillars || []).forEach((z) => {
        const pl = new THREE.Mesh(new THREE.BoxGeometry(0.02, sp.top - sp.belt - 0.06, 0.06), M.plastic);
        pl.position.set(s * (halfAt(W, (sp.top + sp.belt) / 2, opt) + 0.01), (sp.top + sp.belt) / 2, z);
        pl.rotation.z = s * -sp.taper * 0.9;
        root.add(pl);
      });
      // mirrors, handles
      const mir = rbox(0.05, 0.13, 0.17, 0.03, M.plastic);
      mir.rotation.y = Math.PI / 2;
      mir.position.set(s * (W / 2 + 0.09), sp.belt + 0.08, sp.mirrorZ);
      root.add(mir);
      (sp.handles || []).forEach((z) => {
        const hd = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.03, 0.14), M.chrome);
        hd.position.set(s * (W / 2 + 0.006), sp.belt - 0.08, z);
        root.add(hd);
      });
      // lamps
      const hl = rbox(sp.headW || 0.32, sp.headH || 0.14, 0.05, 0.04, M.lampGlass);
      hl.position.set(s * (W / 2 - 0.22), sp.headY, sp.L / 2 + 0.035);
      root.add(hl);
      const tl = rbox(sp.tailW || 0.32, sp.tailH || 0.13, 0.05, 0.04, M.tail);
      tl.position.set(s * (W / 2 - 0.22), sp.tailY, -sp.L / 2 - 0.035);
      root.add(tl);
    });
    // windscreen and rear window as tilted planes between two profile points
    const pane = (a, b, back) => {
      const dz = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dz, dy);
      const yTop = Math.max(a[1], b[1]);
      const w = halfAt(W, yTop, opt) * 2 - 0.16;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, len * 0.92), M.glass);
      const n = back ? -1 : 1;
      m.position.set(0, (a[1] + b[1]) / 2 + 0.05, (a[0] + b[0]) / 2 + n * 0.06);
      m.rotation.order = 'YXZ';
      m.rotation.y = back ? Math.PI : 0;
      m.rotation.x = -Math.atan2(Math.abs(dz), Math.abs(dy));
      root.add(m);
    };
    pane(sp.ws[0], sp.ws[1], false);
    if (sp.rw) pane(sp.rw[0], sp.rw[1], true);
    // interior so the glass isn't see-through
    const lin2 = new THREE.Mesh(new THREE.BoxGeometry(W - 0.2, sp.top - sp.belt + 0.1, sp.cabinLen), M.cabin);
    lin2.position.set(0, (sp.top + sp.belt) / 2, sp.cabinZ);
    root.add(lin2);
    [sp.cabinZ + sp.cabinLen * 0.22, sp.cabinZ - sp.cabinLen * 0.25].forEach((z) => {
      const seat = rbox(W - 0.35, 0.42, 0.14, 0.05, M.seat);
      seat.position.set(0, sp.belt + 0.1, z);
      root.add(seat);
    });
    // bumpers
    const fb = rbox(W + 0.02, 0.2, 0.14, 0.06, sp.chromeBumper ? M.chrome : M.plastic);
    fb.position.set(0, sp.bumperY, sp.L / 2 + 0.03);
    root.add(fb);
    const rb = rbox(W + 0.02, 0.2, 0.14, 0.06, sp.chromeBumper ? M.chrome : M.plastic);
    rb.position.set(0, sp.bumperY, -sp.L / 2 - 0.03);
    root.add(rb);
    // grille
    const gr = rbox(W * 0.42, 0.1, 0.03, 0.02, M.plastic);
    gr.position.set(0, sp.headY - 0.02, sp.L / 2 + 0.05);
    root.add(gr);
    // wheel wells
    sp.axles.forEach((z) => [1, -1].forEach((sd) => {
      const well = new THREE.Mesh(new THREE.CircleGeometry(R + 0.16, 20, 0, Math.PI), M.plastic);
      well.rotation.y = sd * Math.PI / 2;
      well.position.set(sd * (W / 2 - 0.3), R * 0.98, z);
      root.add(well);
    }));
    if (sp.extra) sp.extra(root, M, opt);
    const wheels = [];
    sp.axles.forEach((z, i) => [1, -1].forEach((s) => {
      if (sp.single && i === 0) { if (s < 0) return; }
      const w = wheel(R, sp.tyreW || 0.2, s);
      w.position.set(sp.single && i === 0 ? 0 : s * (W / 2 - 0.13), R, z);
      w.userData.front = z > 0;
      root.add(w);
      wheels.push(w);
    }));
    return { root, wheels };
  };

  const plateOn = (root, L, y) => {
    const pm = cache.plateMat || (cache.plateMat = new THREE.MeshStandardMaterial({ map: V.plateTex(false), roughness: 0.5 }));
    [1, -1].forEach((s) => {
      const p = new THREE.Mesh(cache.plateGeo || (cache.plateGeo = new THREE.PlaneGeometry(0.42, 0.21)), pm);
      p.position.set(0, y, s * (L / 2 + 0.105));
      if (s < 0) p.rotation.y = Math.PI;
      root.add(p);
    });
  };

  const SPEC = {
    sedan: (color) => ({
      L: 4.3, W: 1.72, R: 0.31, sill: 0.34, belt: 0.95, top: 1.38, taper: 0.13, axles: [1.3, -1.32],
      upper: [[-2.16, 0.72], [-2.1, 0.9], [-1.55, 0.97], [-1.0, 1.36], [0.3, 1.38], [0.95, 0.98], [2.05, 0.83], [2.15, 0.68], [2.15, 0.42]],
      window: [[-1.32, 1.0], [0.86, 1.0], [0.36, 1.34], [-0.96, 1.33]], pillars: [-0.25], ws: [[0.95, 0.98], [0.3, 1.38]], rw: [[-1.0, 1.36], [-1.55, 0.97]],
      color, metallic: true, seams: [[0.9, 0.22, 0.66], [-0.25, 0.22, 0.66], [-1.25, 0.22, 0.66]], handles: [0.55, -0.6], mirrorZ: 0.78,
      headY: 0.74, tailY: 0.8, bumperY: 0.44, cabinLen: 2.1, cabinZ: -0.3, dirt: 0.45,
    }),
    taxi: () => Object.assign(SPEC.sedan('#f4f4f0'), { metallic: false, checker: [0.53, 0.58], dirt: 0.6, extra: (root, M) => {
      const sign = rbox(0.5, 0.16, 0.2, 0.04, tag(new THREE.MeshStandardMaterial({ color: lin('#f5f5f5'), emissive: lin('#ffe9a8'), emissiveIntensity: 0.25 })));
      sign.position.set(0, 1.55, -0.35);
      root.add(sign);
    } }),
    oldtaxi: () => Object.assign(SPEC.sedan('#141414'), { metallic: false, roofColor: '#f2f2f2', roofLen: 1.3, roofZ: -0.35, stripes: [[0.4, 0.46, '#f2f2f2']], dirt: 0.7, chromeBumper: true }),
    police: () => Object.assign(SPEC.sedan('#f2f2f2'), { metallic: false, stripes: [[0.36, 0.47, '#0d2a5c']], extra: (root, M) => {
      const bar = rbox(1.0, 0.1, 0.26, 0.04, M.plastic);
      bar.position.set(0, 1.5, -0.3);
      root.add(bar);
    } }),
    pickup: (color) => ({
      L: 4.7, W: 1.78, R: 0.35, sill: 0.42, belt: 1.12, top: 1.72, taper: 0.08, axles: [1.45, -1.45],
      upper: [[-2.33, 1.08], [-0.55, 1.08], [-0.5, 1.72], [0.75, 1.72], [1.3, 1.15], [2.3, 1.02], [2.35, 0.8], [2.35, 0.5]],
      window: [[-0.42, 1.18], [1.15, 1.18], [0.74, 1.66], [-0.42, 1.66]], ws: [[1.3, 1.15], [0.75, 1.72]], rw: null,
      color, seams: [[1.3, 0.28, 0.63], [-0.48, 0.28, 0.63]], handles: [0.3], mirrorZ: 1.05,
      headY: 0.88, tailY: 0.92, bumperY: 0.5, cabinLen: 1.1, cabinZ: 0.3, dirt: 0.8, chromeBumper: true,
      extra: (root, M) => { // open bed: dark floor inset + crates
        const bed = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.02, 1.7), M.plastic);
        bed.position.set(0, 1.1, -1.4);
        root.add(bed);
        const crate = ['#43a047', '#e53935', '#fb8c00'];
        for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
          const c = rbox(0.62, 0.4, 0.5, 0.03, tag(new THREE.MeshStandardMaterial({ color: lin(crate[(i + j) % 3]), roughness: 0.7 })));
          c.position.set(-0.36 + j * 0.72, 1.33, -2.0 + i * 0.58);
          root.add(c);
        }
      },
    }),
    bus: () => ({
      L: 10.6, W: 2.5, R: 0.5, sill: 0.45, belt: 1.45, top: 2.9, taper: 0.03, axles: [3.4, -2.9], round: 0.12,
      upper: [[-5.3, 0.6], [-5.32, 2.8], [-5.2, 2.95], [5.1, 2.95], [5.28, 2.7], [5.3, 1.3], [5.3, 0.6]],
      window: [[-5.0, 1.55], [4.3, 1.55], [4.3, 2.6], [-5.0, 2.6]], pillars: [-3.6, -2.2, -0.8, 0.6, 2.0, 3.4], ws: [[5.38, 1.3], [5.33, 2.6]], rw: [[-5.38, 2.6], [-5.38, 1.7]],
      color: '#efefeb', stripes: [[0.28, 0.42, '#b71c1c'], [0.86, 0.9, '#b71c1c']], dirt: 0.9, seams: [[4.6, 0.12, 0.5], [0.0, 0.12, 0.5]], mirrorZ: 5.1,
      headY: 0.8, tailY: 1.0, bumperY: 0.5, cabinLen: 9.6, cabinZ: -0.2, headW: 0.4, tailW: 0.25, tailH: 0.35, tyreW: 0.3,
    }),
    tuktuk: (color) => ({
      L: 2.7, W: 1.3, R: 0.26, sill: 0.3, belt: 0.95, top: 1.85, taper: 0.04, axles: [0.95, -0.85], single: true,
      upper: [[-1.3, 0.85], [-1.32, 1.8], [-1.22, 1.9], [0.75, 1.9], [0.95, 1.75], [1.2, 1.0], [1.3, 0.75], [1.32, 0.45]],
      window: [[-0.95, 1.05], [0.6, 1.05], [0.6, 1.72], [-0.95, 1.72]], ws: [[1.2, 1.05], [0.95, 1.72]], rw: null,
      color, roofColor: '#1c1c1c', roofLen: 2.3, roofZ: -0.2, mirrorZ: 0.9, headY: 0.95, tailY: 0.8, bumperY: 0.4, cabinLen: 1.8, cabinZ: -0.3,
      headW: 0.2, tailW: 0.12, dirt: 0.9,
    }),
  };

  // build a traffic / parked vehicle of the given type (body baked into a few meshes)
  V.make = function (type) {
    let sp;
    switch (type) {
      case 'taxi': sp = G.chance(0.35) ? SPEC.oldtaxi() : SPEC.taxi(); break;
      case 'police': sp = SPEC.police(); break;
      case 'pickup': sp = SPEC.pickup(G.pick(['#1f4f8f', '#e9e9e6', '#8f949a', '#7a1f1f'])); break;
      case 'bus': sp = SPEC.bus(); break;
      case 'tuktuk': sp = SPEC.tuktuk(G.pick(['#b71c1c', '#1d4f9a', '#2e7d32', '#5e2a84'])); break;
      case 'microbus': {
        const mb = V.microbus({ dirt: G.pick([0.5, 1]) });
        V.bake(mb.root, null, true);
        return { root: mb.root, wheels: [], len: 4.8, wid: 1.9, blinkF: [0.82, 0.74, 2.53], blinkR: [0.83, 0.71, -2.53] };
      }
      default: sp = SPEC.sedan(G.pick(['#e9e9e6', '#1d1f22', '#8a8f95', '#b7babd', '#7a1c1c', '#1f3f6e', '#c9c1a8', '#3c4a3a']));
    }
    const v = V.car(sp);
    plateOn(v.root, sp.L, sp.bumperY + 0.02);
    V.bake(v.root, null, true); // traffic wheels don't spin: everything in a few meshes
    return {
      root: v.root, wheels: [], len: sp.L, wid: sp.W,
      blinkF: [sp.W / 2 - 0.1, sp.headY - 0.1, sp.L / 2 + 0.06], blinkR: [sp.W / 2 - 0.1, sp.tailY - 0.12, -sp.L / 2 - 0.06],
    };
  };

  // spin / steer the wheels of a built vehicle
  V.updateWheels = function (wheels, speed, steer, dt, R) {
    const a = (speed * dt) / (R || 0.34);
    wheels.forEach((w) => {
      w.userData.spin.rotation.x += a;
      if (w.userData.front) w.rotation.y = steer * 0.5;
    });
  };
})(window.G);
