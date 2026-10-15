'use strict';
// Shared helpers: math, canvas textures, geometry merging, collisions.
window.G = window.G || {};
(function (G) {
  // simple mode: just driving the microbus — no getting out, no random pedestrians, fights or crews
  G.SIMPLE = true;
  G.rand = (a, b) => a + Math.random() * (b - a);
  G.randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  G.pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  G.chance = (p) => Math.random() < p;
  G.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  G.lerp = (a, b, t) => a + (b - a) * t;
  G.FONT = '"Cairo", "Segoe UI", Tahoma, Arial, sans-serif';
  G.angleDiff = (a, b) => {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  };
  G.arDigits = (n) => String(n).replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
  G.fmt = (n) => Math.round(n).toLocaleString('en-US');
  G.dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  // ---------- canvas textures ----------
  G.canvas = (w, h) => {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  };
  G.tex = (canvas, repeat) => {
    const t = new THREE.CanvasTexture(canvas);
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    t.encoding = THREE.sRGBEncoding; // canvases hold colour images
    return t;
  };
  G.noise = (ctx, w, h, count, alpha, dark) => {
    for (let i = 0; i < count; i++) {
      const v = dark ? (Math.random() * 90) | 0 : (Math.random() * 255) | 0;
      ctx.fillStyle = `rgba(${v},${v},${v},${alpha})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
  };
  G.arText = (ctx, text, x, y, size, color, weight) => {
    ctx.save();
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${weight || 700} ${size}px ${G.FONT}`;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  };

  // ---------- geometry ----------
  G.colorize = (geo, color) => {
    const c = new THREE.Color(color).convertSRGBToLinear();
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return geo;
  };

  // Merge geometries (position/normal/uv[/color]) into one indexed BufferGeometry.
  G.merge = (geos) => {
    let vCount = 0, iCount = 0;
    const hasColor = geos.every((g) => g.attributes.color);
    geos.forEach((g) => {
      vCount += g.attributes.position.count;
      iCount += g.index ? g.index.count : g.attributes.position.count;
    });
    const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), uv = new Float32Array(vCount * 2);
    const col = hasColor ? new Float32Array(vCount * 3) : null;
    const idx = new Uint32Array(iCount);
    let vo = 0, io = 0;
    geos.forEach((g) => {
      const p = g.attributes.position;
      pos.set(p.array, vo * 3);
      nor.set(g.attributes.normal.array, vo * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
      if (col) col.set(g.attributes.color.array, vo * 3);
      if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io++] = a[i] + vo; }
      else for (let i = 0; i < p.count; i++) idx[io++] = i + vo;
      vo += p.count;
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setIndex(new THREE.BufferAttribute(idx, 1));
    out.computeBoundingSphere();
    return out;
  };

  // Batch: collect geometries per material, then emit one mesh per material.
  G.Batch = function () { this.groups = {}; };
  G.Batch.prototype.add = function (key, mat, geo) {
    if (!this.groups[key]) this.groups[key] = { mat, geos: [] };
    this.groups[key].geos.push(geo);
  };
  G.Batch.prototype.build = function (parent, cast, receive) {
    for (const k in this.groups) {
      const g = this.groups[k];
      if (!g.geos.length) continue;
      const mesh = new THREE.Mesh(G.merge(g.geos), g.mat);
      mesh.castShadow = !!cast;
      mesh.receiveShadow = !!receive;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      parent.add(mesh);
    }
    this.groups = {};
  };

  // Primitive builders (vertex coloured when colour given)
  G.box = (w, h, d, x, y, z, c) => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y, z);
    return c !== undefined ? G.colorize(g, c) : g;
  };
  G.cyl = (rt, rb, h, seg, x, y, z, c) => {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    g.translate(x, y, z);
    return c !== undefined ? G.colorize(g, c) : g;
  };
  G.sphere = (r, x, y, z, c, ws, hs) => {
    const g = new THREE.SphereGeometry(r, ws || 8, hs || 6);
    g.translate(x, y, z);
    return c !== undefined ? G.colorize(g, c) : g;
  };
  G.wheel = (x, y, z, r, w) => {
    const g = new THREE.CylinderGeometry(r, r, w, 12);
    g.rotateZ(Math.PI / 2);
    g.translate(x, y, z);
    return G.colorize(g, '#161616');
  };
  // Apply a rotation then translation to a geometry
  G.xf = (geo, o) => {
    if (o.rx) geo.rotateX(o.rx);
    if (o.rz) geo.rotateZ(o.rz);
    if (o.ry) geo.rotateY(o.ry);
    geo.translate(o.x || 0, o.y || 0, o.z || 0);
    return geo;
  };

  // ---------- collision ----------
  // Circle vs axis aligned box; returns push vector or null
  G.circleAABB = (px, pz, r, b) => {
    const cx = G.clamp(px, b.minX, b.maxX), cz = G.clamp(pz, b.minZ, b.maxZ);
    const dx = px - cx, dz = pz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return null;
    if (d2 > 1e-6) {
      const d = Math.sqrt(d2);
      return { x: (dx / d) * (r - d), z: (dz / d) * (r - d) };
    }
    const l = px - b.minX, rr = b.maxX - px, bo = pz - b.minZ, t = b.maxZ - pz;
    const m = Math.min(l, rr, bo, t);
    if (m === l) return { x: -(l + r), z: 0 };
    if (m === rr) return { x: rr + r, z: 0 };
    if (m === bo) return { x: 0, z: -(bo + r) };
    return { x: 0, z: t + r };
  };
})(window.G);
