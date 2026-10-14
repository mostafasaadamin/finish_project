'use strict';
// Real downtown Cairo from OpenStreetMap (© OpenStreetMap contributors, ODbL):
// roads with their real names and widths, building footprints and heights, parks, the Nile,
// trees, real shop and cafe names. Exposes the same G.World interface as the procedural grid city.
(function (G) {
  const W = (G.OSM = { ok: false });
  const DRIVE = { motorway: 16, motorway_link: 7, trunk: 16, trunk_link: 7, primary: 14, primary_link: 7, secondary: 12, secondary_link: 7, tertiary: 10, tertiary_link: 6, residential: 7, unclassified: 7, living_street: 5.5, service: 4.5 };
  const WALK = { pedestrian: 6, footway: 2.5, path: 2, steps: 2.5 };
  const SW = 3; // sidewalk width along roads
  const CELL = 40; // spatial grid cell

  W.load = async function () {
    try {
      const r = await fetch('assets/osm/downtown.json', { cache: 'no-cache' });
      if (!r.ok) return false;
      W.data = await r.json();
      W.ok = W.data.elements && W.data.elements.length > 100;
    } catch (e) { W.ok = false; }
    return W.ok;
  };

  // ---------------------------------------------------------------- projection
  let lat0, lon0, kx, kz;
  const P = (ll) => new THREE.Vector3((ll[1] - lon0) * kx, 0, -(ll[0] - lat0) * kz);
  const key = (ll) => ll[0].toFixed(7) + ',' + ll[1].toFixed(7);

  // ---------------------------------------------------------------- spatial grid
  const Grid = function () { this.c = new Map(); };
  Grid.prototype.add = function (minX, minZ, maxX, maxZ, item) {
    for (let i = Math.floor(minX / CELL); i <= Math.floor(maxX / CELL); i++) {
      for (let j = Math.floor(minZ / CELL); j <= Math.floor(maxZ / CELL); j++) {
        const k = i + ':' + j;
        if (!this.c.has(k)) this.c.set(k, []);
        this.c.get(k).push(item);
      }
    }
  };
  Grid.prototype.near = function (x, z) { return this.c.get(Math.floor(x / CELL) + ':' + Math.floor(z / CELL)) || []; };
  Grid.prototype.around = function (x, z, r) {
    const out = new Set();
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++)
      for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) (this.c.get(i + ':' + j) || []).forEach((v) => out.add(v));
    return out;
  };

  // distance from point to segment, with the closest point parameter
  const segDist = (px, pz, a, b) => {
    const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1e-6;
    const t = G.clamp(((px - a.x) * dx + (pz - a.z) * dz) / l2, 0, 1);
    const cx = a.x + dx * t, cz = a.z + dz * t;
    return { d: Math.hypot(px - cx, pz - cz), t, cx, cz };
  };
  const pointInPoly = (x, z, poly) => {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[i], b = poly[j];
      if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
    }
    return inside;
  };
  // shoelace area in (x, z); negative means the outside is on the right of each edge
  const area = (poly) => { let s = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; s += a.x * b.z - b.x * a.z; } return s / 2; };

  // ---------------------------------------------------------------- parse
  function parse() {
    const d = W.data;
    const [s, w, n, e] = d.bbox;
    lat0 = (s + n) / 2; lon0 = (w + e) / 2;
    kx = 111320 * Math.cos((lat0 * Math.PI) / 180); kz = 110540;
    W.bounds = { minX: (w - lon0) * kx, maxX: (e - lon0) * kx, minZ: -(n - lat0) * kz, maxZ: -(s - lat0) * kz };
    W.roads = []; W.walks = []; W.buildings = []; W.parks = []; W.water = []; W.trees = []; W.pois = []; W.signals = []; W.flyovers = [];
    const nodeUse = new Map();
    d.elements.forEach((el) => {
      const t = el.tags || {};
      if (el.t === 'n') {
        const p = P(el.g);
        if (t.natural === 'tree') W.trees.push(p);
        else if (t.highway === 'traffic_signals') W.signals.push(p);
        else if (t.amenity || t.shop) W.pois.push({ p, tags: t, name: t['name:ar'] || t.name || '' });
        return;
      }
      const rings = el.t === 'r' ? el.g : [el.g];
      if (t.building) {
        rings.forEach((g) => {
          const poly = g.map(P);
          if (poly.length > 3 && poly[0].distanceTo(poly[poly.length - 1]) < 0.01) poly.pop();
          if (poly.length < 3 || Math.abs(area(poly)) < 12) return;
          if (area(poly) > 0) poly.reverse(); // walls face the right of each edge: keep the outside there
          let h = parseFloat(t.height);
          const lv = parseFloat(t['building:levels']);
          if (!h) h = lv ? lv * 3.2 + 1 : G.randi(5, 10) * 3.2 + 1;
          W.buildings.push({ poly, h: G.clamp(h, 4, 80), levels: lv || Math.round(h / 3.2), name: t['name:ar'] || t.name || '', kind: t.building, amenity: t.amenity });
        });
        return;
      }
      if (t.leisure === 'park' || t.leisure === 'garden' || t.landuse === 'grass' || t.landuse === 'park') { rings.forEach((g) => W.parks.push(g.map(P))); return; }
      if (t.natural === 'water' || t.waterway === 'riverbank') { rings.forEach((g) => W.water.push(g.map(P))); return; }
      if (!t.highway || el.t !== 'w' || t.tunnel === 'yes' || +t.layer < 0) return;
      const pts = el.g.map(P);
      const name = t['name:ar'] || t.name || '';
      if (DRIVE[t.highway] && !(t.highway === 'service' && /parking|driveway/.test(t.service || ''))) {
        let wdt = parseFloat(t.width) || (t.lanes ? +t.lanes * 3.3 : DRIVE[t.highway]);
        if (t.oneway === 'yes' && !t.width && !t.lanes) wdt = Math.min(wdt, 10);
        const r = { pts, w: G.clamp(wdt, 4, 22), name, type: t.highway, oneway: t.oneway === 'yes' || t.oneway === '1', keys: el.g.map(key), bridge: t.bridge === 'yes' && +t.layer > 0 };
        if (r.bridge) W.flyovers.push(r); else W.roads.push(r);
        if (!r.bridge) r.keys.forEach((k) => nodeUse.set(k, (nodeUse.get(k) || 0) + 1));
      } else if (WALK[t.highway] && t.area !== 'yes') {
        W.walks.push({ pts, w: WALK[t.highway], name });
      }
    });
    W.nodeUse = nodeUse;
    // junction points: nodes shared by several roads or ends of roads
    W.junctions = [];
    W.roads.forEach((r) => r.keys.forEach((k, i) => {
      if (nodeUse.get(k) > 1 && !W.junctions.some((j) => j.key === k)) W.junctions.push({ key: k, p: r.pts[i], hw: 0 });
    }));
    const jmap = new Map(W.junctions.map((j) => [j.key, j]));
    W.roads.forEach((r) => r.keys.forEach((k) => { const j = jmap.get(k); if (j) j.hw = Math.max(j.hw, r.w / 2); }));
    W.jmap = jmap;
    // spatial indices
    W.roadGrid = new Grid();
    W.roads.forEach((r) => {
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1], m = r.w / 2 + SW + 1;
        W.roadGrid.add(Math.min(a.x, b.x) - m, Math.min(a.z, b.z) - m, Math.max(a.x, b.x) + m, Math.max(a.z, b.z) + m, { r, a, b, i });
      }
    });
    W.jGrid = new Grid();
    W.junctions.forEach((j) => W.jGrid.add(j.p.x - 20, j.p.z - 20, j.p.x + 20, j.p.z + 20, j));
    W.bGrid = new Grid();
    W.buildings.forEach((b) => {
      let minX = 1e9, minZ = 1e9, maxX = -1e9, maxZ = -1e9;
      b.poly.forEach((p) => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
      b.box = { minX, minZ, maxX, maxZ };
      W.bGrid.add(minX, minZ, maxX, maxZ, b);
    });
  }

  // nearest road segment to a point (within range)
  W.nearestRoad = function (x, z, range) {
    let best = null;
    W.roadGrid.around(x, z, range || 0).forEach((s) => {
      const q = segDist(x, z, s.a, s.b);
      if (q.d - s.r.w / 2 < (best ? best.e : (range || 0))) best = { s, q, e: q.d - s.r.w / 2 };
    });
    return best;
  };
  const nearJunction = (x, z, pad) => {
    for (const j of W.jGrid.near(x, z)) if (Math.hypot(j.p.x - x, j.p.z - z) < j.hw + pad) return j;
    return null;
  };
  const onOtherRoad = (x, z, r) => {
    for (const s of W.roadGrid.near(x, z)) if (s.r !== r && segDist(x, z, s.a, s.b).d < s.r.w / 2 + 0.3) return true;
    return false;
  };

  // ---------------------------------------------------------------- geometry helpers
  // a ribbon along a polyline: offsets o1..o2 from the centre line (right is positive)
  function ribbon(pts, o1, o2, y, uScale, filter) {
    const pos = [], uv = [], idx = [];
    let dist = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
      if (L < 0.05) continue;
      const rx = -dz / L, rz = dx / L; // right of travel direction: (-dz, dx) for z-down maps... consistent per strip
      const steps = filter ? Math.max(1, Math.ceil(L / 2)) : 1;
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps, t1 = (k + 1) / steps;
        const ax = a.x + dx * t0, az = a.z + dz * t0, bx = a.x + dx * t1, bz = a.z + dz * t1;
        if (filter && !filter((ax + bx) / 2 + rx * (o1 + o2) / 2, (az + bz) / 2 + rz * (o1 + o2) / 2)) continue;
        const base = pos.length / 3;
        const ext = filter ? 0 : 0.0; // segment pieces
        pos.push(ax + rx * o1, y, az + rz * o1, ax + rx * o2, y, az + rz * o2, bx + rx * o1, y, bz + rz * o1, bx + rx * o2, y, bz + rz * o2);
        const u0 = (dist + L * t0) / uScale, u1 = (dist + L * t1) / uScale;
        uv.push(u0, 0, u0, 1, u1, 0, u1, 1);
        idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
        void ext;
      }
      dist += L;
    }
    return mk(pos, uv, idx);
  }
  // vertical strip along a polyline at offset o, from y0 to y1, facing +right if face>0
  function wall(pts, o, y0, y1, uScale, face, filter) {
    const pos = [], uv = [], idx = [];
    let dist = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz);
      if (L < 0.05) continue;
      const rx = -dz / L, rz = dx / L;
      const steps = Math.max(1, Math.ceil(L / 2));
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps, t1 = (k + 1) / steps;
        const ax = a.x + dx * t0 + rx * o, az = a.z + dz * t0 + rz * o, bx = a.x + dx * t1 + rx * o, bz = a.z + dz * t1 + rz * o;
        if (filter && !filter((ax + bx) / 2, (az + bz) / 2)) continue;
        const base = pos.length / 3;
        pos.push(ax, y0, az, bx, y0, bz, ax, y1, az, bx, y1, bz);
        const u0 = (dist + L * t0) / uScale, u1 = (dist + L * t1) / uScale;
        uv.push(u0, 0, u1, 0, u0, 1, u1, 1);
        if (face > 0) idx.push(base, base + 1, base + 2, base + 2, base + 1, base + 3);
        else idx.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
      }
      dist += L;
    }
    return mk(pos, uv, idx);
  }
  function mk(pos, uv, idx) {
    if (!pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  function polyGeo(poly, y, uScale) {
    const contour = poly.map((p) => new THREE.Vector2(p.x, p.z));
    let tris;
    try { tris = THREE.ShapeUtils.triangulateShape(contour, []); } catch (e) { return null; }
    const pos = [], uv = [], idx = [];
    poly.forEach((p) => { pos.push(p.x, y, p.z); uv.push(p.x / uScale, p.z / uScale); });
    tris.forEach((t) => idx.push(t[0], t[2], t[1]));
    const g = mk(pos, uv, idx);
    if (g) {
      // make sure it faces up
      const n = g.attributes.normal;
      if (n.count && n.getY(0) < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const tmp = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = tmp; } g.computeVertexNormals(); }
    }
    return g;
  }

  // convex hull (x/z) - monotone chain
  function convexHull(pts) {
    const p = pts.slice().sort((a, b) => a.x - b.x || a.z - b.z);
    const cross = (o, a, b) => (a.x - o.x) * (b.z - o.z) - (a.z - o.z) * (b.x - o.x);
    const lo = [], up = [];
    p.forEach((q) => { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); });
    p.slice().reverse().forEach((q) => { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); });
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }

  // road texture with markings for a number of lanes
  const roadTexCache = {};
  function roadMaterial(lanes, oneway) {
    const k = lanes + (oneway ? 'o' : 't');
    if (roadTexCache[k]) return roadTexCache[k];
    const Wd = 256 * Math.max(1, Math.min(lanes, 4)), Hh = 512; // u along (10 m), v across
    const c = G.canvas(512, Wd), x = c.getContext('2d');
    const asphalt = G.Assets.ok && G.Assets.image('asphalt');
    if (!G.Assets.tileInto(x, asphalt, 0, 0, 512, Wd, 256)) { x.fillStyle = '#555'; x.fillRect(0, 0, 512, Wd); G.noise(x, 512, Wd, 6000, 0.08); }
    x.globalCompositeOperation = 'multiply'; x.fillStyle = '#b8b5ae'; x.fillRect(0, 0, 512, Wd); x.globalCompositeOperation = 'source-over';
    const line = (v, dashed, color) => {
      x.fillStyle = color;
      for (let px = 0; px < (dashed ? 256 : 512); px += 4) if (Math.random() < 0.88) x.fillRect(px, v - 3 + G.rand(-0.5, 0.5), 4, 6);
    };
    line(10, false, 'rgba(235,235,228,0.75)');
    line(Wd - 10, false, 'rgba(235,235,228,0.75)');
    for (let l = 1; l < lanes; l++) {
      const v = (l / lanes) * Wd;
      if (!oneway && l === lanes / 2) { line(v - 5, false, 'rgba(226,178,40,0.8)'); line(v + 5, false, 'rgba(226,178,40,0.8)'); }
      else line(v, true, 'rgba(235,235,228,0.7)');
    }
    for (let i = 0; i < 10; i++) { x.fillStyle = 'rgba(10,10,10,0.12)'; x.beginPath(); x.ellipse(G.rand(0, 512), G.rand(0, Wd), G.rand(8, 30), G.rand(3, 10), 0, 0, 7); x.fill(); }
    // canvas is drawn "u across"; rotate so u runs along the road
    const r = G.canvas(Wd, 512), rx = r.getContext('2d');
    rx.translate(Wd, 0); rx.rotate(Math.PI / 2); rx.drawImage(c, 0, 0);
    const t = G.tex(r, true);
    const m = new THREE.MeshStandardMaterial({ map: t, normalMap: G.Tex.roadN || null, roughnessMap: G.Tex.roadR || null, roughness: 0.9 });
    roadTexCache[k] = m;
    return m;
  }

  // ---------------------------------------------------------------- build
  W.build = function (scene) {
    parse();
    const root = (W.root = new THREE.Group());
    scene.add(root);
    const B = new G.Batch(), BF = new G.Batch();
    const M = G.Mat;

    // ground: paved city, sand beyond
    const span = Math.max(W.bounds.maxX - W.bounds.minX, W.bounds.maxZ - W.bounds.minZ) + 400;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(span, span, 20, 20), M.ground || M.paving);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    const gUV = ground.geometry.attributes.uv;
    for (let i = 0; i < gUV.count; i++) gUV.setXY(i, gUV.getX(i) * span / 2, gUV.getY(i) * span / 2);
    root.add(ground);
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000, 30, 30), M.sand);
    sand.rotation.x = -Math.PI / 2; sand.position.y = -0.6;
    G.Tex.sand.repeat.set(600, 600);
    root.add(sand);

    // water (the Nile) and parks
    W.water.forEach((poly) => { const g = polyGeo(poly, 0.02, 30); if (g) root.add(new THREE.Mesh(g, M.water)); });
    W.parks.forEach((poly) => { const g = polyGeo(poly, 0.03, 4); if (g) BF.add('grass', M.grass, g); });

    // roads: surface, sidewalks with painted curbs, junction patches
    W.roads.forEach((r) => {
      const hw = r.w / 2, lanes = G.clamp(Math.round(r.w / 3.3), 1, 4);
      const y = 0.04 + (DRIVE[r.type] || 6) * 0.0006;
      const g = ribbon(r.pts, -hw, hw, y, 10);
      if (g) { const m = new THREE.Mesh(g, roadMaterial(lanes, r.oneway)); m.receiveShadow = true; root.add(m); }
      if (r.type === 'service') return;
      // sidewalk + curb on both sides, cut away at junctions and where another road passes
      [1, -1].forEach((side) => {
        const o1 = side * hw, o2 = side * (hw + SW);
        const ok = (x, z) => !nearJunction(x, z, 2.5) && !onOtherRoad(x, z, r);
        const band = ribbon(r.pts, Math.min(o1, o2), Math.max(o1, o2), 0.16, 2, ok);
        if (band) BF.add('paving', M.paving, band);
        const curb = wall(r.pts, o1, 0.0, 0.16, 2, side < 0 ? 1 : -1, (x, z) => ok(x + 0, z + 0));
        if (curb) BF.add('curb', M.curb, curb);
      });
    });
    W.junctions.forEach((j) => {
      if (W.nodeUse.get(j.key) < 2) return;
      // corners where each incident road meets the junction, then the convex hull of them
      const pts = [];
      W.roadGrid.around(j.p.x, j.p.z, 2).forEach((sg) => {
        const k = sg.r.keys, i = sg.i;
        let from = null, to = null;
        if (k[i] === j.key) { from = sg.a; to = sg.b; } else if (k[i + 1] === j.key) { from = sg.b; to = sg.a; } else return;
        const L = from.distanceTo(to) || 1, dx = (to.x - from.x) / L, dz = (to.z - from.z) / L, hw = sg.r.w / 2;
        const d = Math.min(L, j.hw + 1.5);
        [1, -1].forEach((sd) => pts.push(new THREE.Vector3(from.x + dx * d - dz * hw * sd, 0, from.z + dz * d + dx * hw * sd)));
      });
      if (pts.length < 3) return;
      const hull = convexHull(pts);
      const g = polyGeo(hull, 0.065, 8);
      if (g) BF.add('asph', M.asphalt, g);
    });
    // pedestrian streets (e.g. passages downtown)
    W.walks.forEach((wk) => { const g = ribbon(wk.pts, -wk.w / 2, wk.w / 2, 0.17, 2); if (g) BF.add('paving', M.paving, g); });

    // flyovers (6th of October bridge): elevated decks on pillars, not drivable
    W.flyovers.forEach((r) => {
      const g = ribbon(r.pts, -r.w / 2, r.w / 2, 7.5, 10);
      if (g) { const m = new THREE.Mesh(g, roadMaterial(G.clamp(Math.round(r.w / 3.3), 1, 4), r.oneway)); m.castShadow = true; root.add(m); }
      const under = ribbon(r.pts, -r.w / 2, r.w / 2, 7.0, 4);
      if (under) { under.index.array.reverse(); under.computeVertexNormals(); BF.add('roof', M.roof, under); }
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1], L = a.distanceTo(b);
        for (let t = 0; t < L; t += 28) {
          const p = a.clone().lerp(b, t / L);
          B.add('vc', M.vc, G.box(1.2, 7, 1.2, p.x, 3.5, p.z, '#9a958b'));
        }
      }
    });

    // the map misses many buildings: fill holes inside blocks with buildings facing the nearest street
    const parkHit = (x, z) => W.parks.some((poly) => pointInPoly(x, z, poly)) || W.water.some((poly) => pointInPoly(x, z, poly));
    const walkHit = (x, z) => W.walks.some((wk) => wk.pts.some((p, i) => i && segDist(x, z, wk.pts[i - 1], p).d < wk.w / 2 + 6));
    const bd = W.bounds, STEP = 14;
    let fill = 0;
    for (let x = bd.minX + 10; x < bd.maxX - 10; x += STEP) {
      for (let z = bd.minZ + 10; z < bd.maxZ - 10; z += STEP) {
        const cx = x + G.rand(-2, 2), cz = z + G.rand(-2, 2);
        const nr = W.nearestRoad(cx, cz, 45);
        if (!nr || nr.e < SW + 5.5) continue; // keep the sidewalk and a gap to the street
        if (W.inBuilding(cx, cz) || parkHit(cx, cz) || walkHit(cx, cz)) continue;
        // footprint aligned with the street
        const s0 = nr.s, L = s0.a.distanceTo(s0.b) || 1, dx = (s0.b.x - s0.a.x) / L, dz = (s0.b.z - s0.a.z) / L;
        const hw = 6, hd = 6, poly = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]].map(([u, v]) => new THREE.Vector3(cx + dx * u - dz * v, 0, cz + dz * u + dx * v));
        if (poly.some((p) => W.inBuilding(p.x, p.z) || (W.nearestRoad(p.x, p.z, SW + 4) || { e: 99 }).e < SW + 1)) continue;
        if (area(poly) > 0) poly.reverse();
        const b = { poly, h: G.randi(5, 9) * 3.2 + 1, levels: 0, name: '', kind: 'filler' };
        let minX = 1e9, minZ = 1e9, maxX = -1e9, maxZ = -1e9;
        poly.forEach((p) => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
        b.box = { minX, minZ, maxX, maxZ };
        W.buildings.push(b);
        W.bGrid.add(minX, minZ, maxX, maxZ, b);
        fill++;
      }
    }
    W.fillers = fill;

    // buildings
    const facadeN = M.facades.length;
    let balconies = 0;
    const MAXBAL = G.Main && G.Main.isMobile ? 2500 : 7000;
    W.buildings.forEach((b) => {
      const v = G.randi(0, facadeN - 1);
      const uo = G.randi(0, 3) / 4;
      const poly = b.poly, H = b.h + 0.7;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], c = poly[(i + 1) % poly.length];
        const L = a.distanceTo(c);
        if (L < 0.3) continue;
        const g = wall([a, c], 0, 0, H, 1, 1);
        if (!g) continue;
        // facade UVs: 12 m x 12.8 m per texture repeat
        const uv = g.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) / 12 + uo, uv.getY(k) * H / 12.8);
        B.add('fac' + v, M.facades[v], g);
        // street-facing walls: shop fronts and balconies
        const mx = (a.x + c.x) / 2, mz = (a.z + c.z) / 2;
        const nr = W.nearestRoad(mx, mz, 14);
        if (!nr || L < 4) continue;
        const dx = (c.x - a.x) / L, dz = (c.z - a.z) / L, nx = -dz, nz = dx; // outward = right of the edge
        // a row of separate shops along the ground floor, ~7 m each
        const nShops = Math.max(1, Math.round(L / 7)), segL = L / nShops;
        for (let q = 0; q < nShops; q++) {
          const p0 = new THREE.Vector3(a.x + dx * q * segL, 0, a.z + dz * q * segL);
          const p1 = new THREE.Vector3(a.x + dx * ((q + 1) * segL - 0.25), 0, a.z + dz * ((q + 1) * segL - 0.25));
          const k = G.randi(0, 7), col = k % 4, row = Math.floor(k / 4);
          const sh = wall([p0, p1], 0.07, 0.15, 3.4, segL, 1); // just outside the wall
          if (!sh) continue;
          const suv = sh.attributes.uv;
          for (let w = 0; w < suv.count; w++) suv.setXY(w, (col + G.clamp(suv.getX(w), 0, 1)) / 4, 1 - (row + 1 - suv.getY(w)) / 2);
          B.add('shops', M.shops, sh);
        }
        if (balconies < MAXBAL) {
          const floors = Math.floor(b.h / 3.2);
          for (let f = 1; f < floors; f++) {
            for (let t = 2; t < L - 2; t += 3.6) {
              if (!G.chance(0.32) || balconies >= MAXBAL) continue;
              balconies++;
              const px = a.x + dx * t + nx * 0.6, pz = a.z + dz * t + nz * 0.6, py = f * 3.2 + 0.1;
              const ang = Math.atan2(dx, dz);
              // slab with its long side along the wall
              const s2 = new THREE.BoxGeometry(2.4, 0.14, 1.2); s2.rotateY(ang - Math.PI / 2); s2.translate(px, py, pz);
              B.add('vc', M.vc, G.colorize(s2, '#bdb19c'));
              const rail = new THREE.BoxGeometry(2.4, 0.9, 0.05); rail.rotateY(ang - Math.PI / 2);
              rail.translate(px + nx * 0.58, py + 0.52, pz + nz * 0.58);
              B.add('rail', M.rail, rail);
              if (G.chance(0.25)) {
                const ac = new THREE.BoxGeometry(0.8, 0.55, 0.45); ac.rotateY(ang - Math.PI / 2);
                ac.translate(a.x + dx * (t + 1.7) + nx * 0.25, py + 1.6, a.z + dz * (t + 1.7) + nz * 0.25);
                B.add('vc', M.vc, G.colorize(ac, '#e6e1d3'));
              }
            }
          }
        }
      }
      const roof = polyGeo(poly, b.h, 8);
      if (roof) BF.add('roof', M.roof, roof);
      // roof clutter
      if (G.chance(0.7)) {
        const cx = poly.reduce((s, p) => s + p.x, 0) / poly.length, cz = poly.reduce((s, p) => s + p.z, 0) / poly.length;
        if (pointInPoly(cx, cz, poly)) {
          B.add('vc', M.vc, G.cyl(0.6, 0.6, 1.3, 8, cx, b.h + 0.65, cz, G.pick(['#222', '#ddd', '#1565c0'])));
          if (G.chance(0.6)) { const dish = new THREE.CylinderGeometry(0.55, 0.12, 0.25, 10); G.xf(dish, { rx: -0.9, ry: G.rand(0, 6), x: cx + 1.5, y: b.h + 0.9, z: cz }); B.add('vc', M.vc, G.colorize(dish, '#e8e8e8')); }
        }
      }
    });
    W.balconies = balconies;

    // trees: OSM trees, plus a row along main roads where none are mapped
    W.treeSpots = W.trees.slice();
    W.roads.forEach((r) => {
      if (!/primary|secondary|trunk/.test(r.type)) return;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1], L = a.distanceTo(b);
        const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
        for (let t = 6; t < L - 6; t += 16) {
          [1, -1].forEach((side) => {
            const o = side * (r.w / 2 + 1.2);
            const x = a.x + dx * t - dz * o, z = a.z + dz * t + dx * o;
            if (!nearJunction(x, z, 4) && !onOtherRoad(x, z, r) && !W.inBuilding(x, z) && !W.treeSpots.some((p) => Math.abs(p.x - x) < 6 && Math.abs(p.z - z) < 6)) {
              const v = new THREE.Vector3(x, 0.16, z);
              // palms on the Corniche and the big avenues, leafy trees elsewhere
              v.palm = /trunk|primary/.test(r.type) || /كورنيش|النيل/.test(r.name);
              W.treeSpots.push(v);
            }
          });
        }
      }
    });
    W.parks.forEach((poly) => {
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      poly.forEach((p) => { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
      const n = Math.min(40, Math.floor(((maxX - minX) * (maxZ - minZ)) / 120));
      for (let k = 0; k < n; k++) { const x = G.rand(minX, maxX), z = G.rand(minZ, maxZ); if (pointInPoly(x, z, poly)) { const v = new THREE.Vector3(x, 0.03, z); v.palm = k % 3 === 0; W.treeSpots.push(v); } }
    });

    // street lamps along roads
    W.roads.forEach((r) => {
      if (r.type === 'service') return;
      for (let i = 0; i < r.pts.length - 1; i++) {
        const a = r.pts[i], b = r.pts[i + 1], L = a.distanceTo(b);
        const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
        for (let t = 10; t < L - 4; t += 32) {
          const o = r.w / 2 + 0.4;
          const x = a.x + dx * t - dz * o, z = a.z + dz * t + dx * o;
          if (nearJunction(x, z, 3) || onOtherRoad(x, z, r)) continue;
          B.add('vc', M.vc, G.cyl(0.07, 0.11, 8, 6, x, 4.16, z, '#5f5f5f'));
          B.add('vc', M.vc, G.box(0.08 + Math.abs(dz) * 1.6, 0.08, 0.08 + Math.abs(dx) * 1.6, x + dz * 0.8, 8.1, z - dx * 0.8, '#5f5f5f'));
          B.add('vc', M.vc, G.box(0.45, 0.14, 0.45, x + dz * 1.5, 8.0, z - dx * 1.5, '#f2f2f2'));
        }
      }
    });
    // traffic lights at mapped signals
    W.signals.forEach((p) => {
      const nr = W.nearestRoad(p.x, p.z, 12);
      if (!nr) return;
      B.add('vc', M.vc, G.cyl(0.08, 0.08, 4.2, 6, p.x + 0.5, 2.2, p.z + 0.5, '#333'));
      B.add('vc', M.vc, G.box(0.35, 1.0, 0.3, p.x + 0.5, 4.6, p.z + 0.5, '#222'));
      B.add('vc', M.vc, G.sphere(0.1, p.x + 0.5, 4.9, p.z + 0.32, '#d32f2f'));
      B.add('vc', M.vc, G.sphere(0.1, p.x + 0.5, 4.6, p.z + 0.32, '#ffb300'));
      B.add('vc', M.vc, G.sphere(0.1, p.x + 0.5, 4.3, p.z + 0.32, '#2e7d32'));
    });

    B.build(root, true, true);
    BF.build(root, false, true);
    W.buildWalkPaths();
    W.placeSpots();
  };

  // ---------------------------------------------------------------- world queries
  W.inBuilding = function (x, z) {
    for (const b of W.bGrid.near(x, z)) {
      if (x < b.box.minX || x > b.box.maxX || z < b.box.minZ || z > b.box.maxZ) continue;
      if (pointInPoly(x, z, b.poly)) return b;
    }
    return null;
  };
  // push a circle out of building walls
  W.collide = function (x, z, r) {
    let px = 0, pz = 0, hit = false;
    for (const b of W.bGrid.around(x, z, r)) {
      if (x < b.box.minX - r || x > b.box.maxX + r || z < b.box.minZ - r || z > b.box.maxZ + r) continue;
      const inside = pointInPoly(x, z, b.poly);
      let best = null;
      for (let i = 0; i < b.poly.length; i++) {
        const q = segDist(x, z, b.poly[i], b.poly[(i + 1) % b.poly.length]);
        if (!best || q.d < best.d) best = q;
      }
      if (!best) continue;
      if (inside || best.d < r) {
        let nx = x - best.cx, nz = z - best.cz;
        const L = Math.hypot(nx, nz) || 1e-6;
        nx /= L; nz /= L;
        if (inside) { nx = -nx; nz = -nz; }
        const push = inside ? best.d + r : r - best.d;
        px += nx * push; pz += nz * push; hit = true;
      }
    }
    const bd = W.bounds, m = 5;
    if (x < bd.minX + m) { px += bd.minX + m - x; hit = true; }
    if (x > bd.maxX - m) { px -= x - (bd.maxX - m); hit = true; }
    if (z < bd.minZ + m) { pz += bd.minZ + m - z; hit = true; }
    if (z > bd.maxZ - m) { pz -= z - (bd.maxZ - m); hit = true; }
    return hit ? { x: px, z: pz } : null;
  };
  W.groundY = function (x, z) {
    const nr = W.nearestRoad(x, z, SW + 0.5);
    if (nr && nr.e < 0) return 0.05;
    if (nr && nr.e < SW && !nearJunction(x, z, 2.5)) return 0.16;
    return 0;
  };
  W.roadName = function (x, z) {
    const nr = W.nearestRoad(x, z, 2);
    return nr && nr.s.r.name ? nr.s.r.name : null;
  };

  // walk paths: the middle of every sidewalk band, split where it is cut
  W.buildWalkPaths = function () {
    W.paths = [];
    W.roads.forEach((r) => {
      if (r.type === 'service') return;
      [1, -1].forEach((side) => {
        const o = side * (r.w / 2 + SW / 2);
        let cur = [];
        const flush = () => { if (cur.length > 1) { const L = cur.reduce((s, p, i) => (i ? s + p.distanceTo(cur[i - 1]) : 0), 0); if (L > 8) W.paths.push({ pts: cur, r, side }); } cur = []; };
        for (let i = 0; i < r.pts.length - 1; i++) {
          const a = r.pts[i], b = r.pts[i + 1], L = a.distanceTo(b);
          if (L < 0.05) continue;
          const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
          for (let t = 0; t <= L; t += 2) {
            const p = new THREE.Vector3(a.x + dx * t - dz * o, 0.16, a.z + dz * t + dx * o);
            if (nearJunction(p.x, p.z, 2.5) || onOtherRoad(p.x, p.z, r) || W.inBuilding(p.x, p.z)) flush();
            else cur.push(p);
          }
        }
        flush();
      });
    });
    W.paths.forEach((p) => {
      p.cum = [0];
      for (let i = 1; i < p.pts.length; i++) p.cum.push(p.cum[i - 1] + p.pts[i].distanceTo(p.pts[i - 1]));
      p.len = p.cum[p.cum.length - 1];
    });
    W.pathGrid = new Grid();
    W.paths.forEach((p) => p.pts.forEach((q, i) => W.pathGrid.add(q.x, q.z, q.x, q.z, { p, i })));
  };

  // point on a path at distance s: position, direction along, normal toward the road
  W.pathPoint = function (p, s) {
    s = G.clamp(s, 0, p.len);
    let i = 1;
    while (i < p.cum.length - 1 && p.cum[i] < s) i++;
    const a = p.pts[i - 1], b = p.pts[i], L = p.cum[i] - p.cum[i - 1] || 1;
    const t = (s - p.cum[i - 1]) / L;
    const dx = (b.x - a.x) / L, dz = (b.z - a.z) / L;
    // the road is on the opposite side of this band: normal = -side * right
    const nx = p.side * dz, nz = -p.side * dx;
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, dx, dz, nx, nz, edge: Math.min(s, p.len - s), path: p, s };
  };
  W.nearestPath = function (x, z) {
    let best = null, bd = 1e9;
    W.pathGrid.around(x, z, 12).forEach(({ p, i }) => { const q = p.pts[i], d = Math.hypot(q.x - x, q.z - z); if (d < bd) { bd = d; best = { p, s: p.cum[i] }; } });
    return best;
  };
  W.randomSidewalk = function (minEdge) {
    for (let k = 0; k < 50; k++) {
      const p = G.pick(W.paths);
      if (p.len < (minEdge || 0) * 2 + 2) continue;
      return W.pathPoint(p, G.rand(minEdge || 0, p.len - (minEdge || 0)));
    }
    return W.pathPoint(W.paths[0], 1);
  };

  // stops, cafes, gas station, police checkpoint on the real streets
  W.placeSpots = function () {
    const main = W.paths.filter((p) => /primary|secondary|tertiary/.test(p.r.type) && p.len > 40);
    const famous = ['طلعت حرب', 'قصر النيل', '26 يوليو', 'شريف', 'عماد الدين', 'محمد فريد', 'رمسيس', 'الجمهوري', 'القصر العيني', 'التحرير'];
    const used = [];
    W.stations = G.STATION_NAMES.map((name, idx) => {
      let pt = null;
      const want = famous[idx];
      const pref = want ? W.paths.filter((p) => p.len > 30 && p.r.name.includes(want)) : [];
      for (let k = 0; k < 80 && !pt; k++) {
        const p = G.pick(pref.length && k < 30 ? pref : main.length ? main : W.paths);
        const q = W.pathPoint(p, p.len / 2 + G.rand(-p.len / 4, p.len / 4));
        if (used.some((u) => Math.hypot(u.x - q.x, u.z - q.z) < 110 - k)) continue;
        pt = q;
      }
      used.push(pt);
      const r = pt.path.r, lanes = r.oneway ? 1 : 2;
      // stop position: outer lane next to this sidewalk, heading with the traffic on this side
      const off = r.w / 2 - Math.min(2.2, r.w / (2 * lanes));
      const stop = new THREE.Vector3(pt.x + pt.nx * (SW / 2 + (r.w / 2 - off)), 0, pt.z + pt.nz * (SW / 2 + (r.w / 2 - off)));
      const heading = Math.atan2(pt.dx, pt.dz); // along the street; flipped below so the sidewalk is on the right
      return {
        idx, name, stopPos: stop, heading, walkPos: new THREE.Vector3(pt.x, 0.16, pt.z), along: pt,
        waitPoint: (k) => new THREE.Vector3(pt.x + pt.dx * (k - 3) * 0.9 - pt.nx * G.rand(-0.6, 0.8), 0.16, pt.z + pt.dz * (k - 3) * 0.9 - pt.nz * G.rand(-0.6, 0.8)),
        faceRoad: Math.atan2(pt.nx, pt.nz),
      };
    });
    // sanity: heading so that the right side faces the sidewalk
    W.stations.forEach((s) => {
      const fx = Math.sin(s.heading), fz = Math.cos(s.heading);
      const rx = -fz, rz = fx; // right of a heading in this game
      const toWalkX = s.walkPos.x - s.stopPos.x, toWalkZ = s.walkPos.z - s.stopPos.z;
      if (rx * toWalkX + rz * toWalkZ < 0) s.heading += Math.PI;
    });
    // real cafes from the map (fall back to random sidewalks)
    const cafes = W.pois.filter((p) => p.tags.amenity === 'cafe').map((p) => {
      const np = W.nearestPath(p.p.x, p.p.z);
      return np ? W.pathPoint(np.p, np.s) : null;
    }).filter(Boolean).slice(0, 6);
    while (cafes.length < 3) cafes.push(W.randomSidewalk(6));
    W.AHWA = cafes.map((q) => ({ pos: new THREE.Vector3(q.x - q.nx * 0.4, 0.16, q.z - q.nz * 0.4), face: Math.atan2(q.nx, q.nz), along: { x: q.dx, z: q.dz } }));
    const fuel = W.pois.find((p) => p.tags.amenity === 'fuel');
    const gq = fuel ? W.nearestPath(fuel.p.x, fuel.p.z) : null;
    const g = gq ? W.pathPoint(gq.p, gq.s) : W.randomSidewalk(10);
    W.gasPos = new THREE.Vector3(g.x + g.nx * (SW / 2 + 1.6), 0, g.z + g.nz * (SW / 2 + 1.6));
    W.gasSide = g;
    const prim = W.paths.filter((p) => /primary|trunk/.test(p.r.type) && p.len > 50);
    const cp = prim.length ? W.pathPoint(G.pick(prim), 25) : W.randomSidewalk(20);
    W.checkpointSide = cp;
    W.checkpointPos = new THREE.Vector3(cp.x + cp.nx * (SW / 2 + cp.path.r.w / 2), 0, cp.z + cp.nz * (SW / 2 + cp.path.r.w / 2));
  };

  // pre-rendered minimap base (roads + buildings) in world units
  W.mapCanvas = function () {
    const bd = W.bounds, S = 1.2; // px per metre
    const c = G.canvas(Math.ceil((bd.maxX - bd.minX) * S), Math.ceil((bd.maxZ - bd.minZ) * S)), x = c.getContext('2d');
    x.fillStyle = '#d8cdb5'; x.fillRect(0, 0, c.width, c.height);
    x.setTransform(S, 0, 0, S, -bd.minX * S, -bd.minZ * S);
    x.fillStyle = '#3d7fa0'; W.water.forEach((poly) => { x.beginPath(); poly.forEach((p, i) => (i ? x.lineTo(p.x, p.z) : x.moveTo(p.x, p.z))); x.fill(); });
    x.fillStyle = '#7aa35a'; W.parks.forEach((poly) => { x.beginPath(); poly.forEach((p, i) => (i ? x.lineTo(p.x, p.z) : x.moveTo(p.x, p.z))); x.fill(); });
    x.strokeStyle = '#6b6b6b'; x.lineCap = 'round'; x.lineJoin = 'round';
    W.roads.forEach((r) => { x.lineWidth = r.w + 2; x.beginPath(); r.pts.forEach((p, i) => (i ? x.lineTo(p.x, p.z) : x.moveTo(p.x, p.z))); x.stroke(); });
    x.fillStyle = '#b9ab92'; W.buildings.forEach((b) => { x.beginPath(); b.poly.forEach((p, i) => (i ? x.lineTo(p.x, p.z) : x.moveTo(p.x, p.z))); x.fill(); });
    return { canvas: c, S, minX: bd.minX, minZ: bd.minZ };
  };
})(window.G);
