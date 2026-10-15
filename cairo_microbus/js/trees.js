'use strict';
// Trees: real scanned/modelled CC0 trees from Poly Haven (assets/models) drawn with instancing,
// falling back to simple procedural trees when no model is available.
(function (G) {
  const T = (G.Trees = { models: [] });

  // load tree / palm / bush models listed in credits.json
  T.load = async function () {
    const list = ((G.Assets.credits && G.Assets.credits.models) || []).filter((m) => /tree|palm/i.test(m.id));
    if (!list.length || !THREE.GLTFLoader) return;
    const loader = new THREE.GLTFLoader();
    await Promise.all(list.slice(0, 5).map((m) => new Promise((res) => {
      loader.load('assets/' + m.file, (gltf) => {
        const meshes = [];
        gltf.scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        gltf.scene.traverse((o) => {
          if (!o.isMesh) return;
          const g = o.geometry.clone();
          g.applyMatrix4(o.matrixWorld);
          g.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
          const mat = o.material;
          if (mat.map) mat.map.encoding = THREE.sRGBEncoding;
          mat.side = THREE.DoubleSide;
          mat.userData.linear = true; // glTF colours are already linear
          if (mat.transparent || mat.alphaTest === 0) { mat.alphaTest = 0.5; mat.transparent = false; }
          meshes.push({ g, mat });
        });
        T.models.push({ id: m.id, meshes, height: size.y, palm: /palm/i.test(m.id + (m.tags || []).join(' ')) });
        res();
      }, undefined, () => res());
    })));
  };

  // ---------- date palms: ringed trunk + drooping fronds made of thin leaflets (alpha) ----------
  T.palmParts = function () {
    if (T._palm) return T._palm;
    // frond texture: curved midrib with dense, drooping leaflets (left half green, right half dry)
    const c = G.canvas(256, 512), x = c.getContext('2d');
    x.clearRect(0, 0, 256, 512);
    const frond = (cx, dry) => {
      for (let y = 18; y < 505; y += 3) {
        const t = y / 512, len = 60 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 4;
        const hue = dry ? 35 + Math.random() * 8 : 78 + Math.random() * 22;
        const sat = dry ? 35 + Math.random() * 15 : 30 + Math.random() * 25;
        const lig = dry ? 38 + Math.random() * 15 : 18 + Math.random() * 18 + t * 8;
        x.strokeStyle = `hsl(${hue},${sat}%,${lig}%)`;
        x.lineWidth = 2.2;
        const droop = 10 + t * 26;
        x.beginPath(); x.moveTo(cx, y); x.quadraticCurveTo(cx - len * 0.6, y + droop * 0.3, cx - len, y + droop); x.stroke();
        x.beginPath(); x.moveTo(cx, y); x.quadraticCurveTo(cx + len * 0.6, y + droop * 0.3, cx + len, y + droop); x.stroke();
      }
      x.strokeStyle = dry ? '#8a7350' : '#7a7a45'; x.lineWidth = 3.5;
      x.beginPath(); x.moveTo(cx, 0); x.lineTo(cx, 512); x.stroke();
    };
    frond(64, false);
    frond(192, true);
    const frondMat = new THREE.MeshStandardMaterial({ map: G.tex(c), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.75 });
    frondMat.userData.linear = true;
    // bark: diamond leaf-base pattern of a date palm
    const b = G.canvas(128, 256), bx = b.getContext('2d');
    bx.fillStyle = '#7a6448'; bx.fillRect(0, 0, 128, 256);
    for (let y = 0; y < 256; y += 10) for (let xx = (y / 10) % 2 ? 0 : 8; xx < 128; xx += 16) {
      bx.fillStyle = 'rgba(45,32,18,0.55)'; bx.beginPath(); bx.moveTo(xx, y); bx.lineTo(xx + 8, y + 5); bx.lineTo(xx, y + 10); bx.lineTo(xx - 8, y + 5); bx.fill();
      bx.fillStyle = 'rgba(170,140,100,0.3)'; bx.fillRect(xx - 6, y + 4, 12, 2);
    }
    G.noise(bx, 128, 256, 1500, 0.15, true);
    const barkMat = new THREE.MeshStandardMaterial({ map: G.tex(b, true), roughness: 1 });
    barkMat.userData.linear = true;
    // trunk (unit height, scaled per palm): slim, slight lean, thicker at the crown
    const H = 1, trunk = new THREE.CylinderGeometry(0.2, 0.26, H, 10, 10, true);
    trunk.translate(0, H / 2, 0);
    const tp = trunk.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const y = tp.getY(i), bulge = 1 + 0.35 * Math.max(0, (y - 0.9) / 0.1);
      tp.setXYZ(i, tp.getX(i) * bulge + 0.18 * y * y, y, tp.getZ(i) * bulge);
    }
    const tuv = trunk.attributes.uv;
    for (let i = 0; i < tuv.count; i++) tuv.setY(i, tuv.getY(i) * 8);
    trunk.computeVertexNormals();
    // crown: 3 tiers of long arching fronds (top ones rise, lower ones droop) + dry skirt
    const fronds = [];
    const make = (k, n, up, droop, L, W, dry) => {
      const g = new THREE.PlaneGeometry(W, L, 1, 10);
      g.translate(0, L / 2, 0);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const t = p.getY(i) / L, along = p.getY(i);
        const ang = up - droop * t * t;
        p.setXYZ(i, p.getX(i) * (1 - t * 0.5), along * Math.sin(ang), along * Math.cos(ang));
        uv.setX(i, uv.getX(i) * 0.5 + (dry ? 0.5 : 0));
      }
      g.rotateY((k / n) * Math.PI * 2 + G.rand(-0.15, 0.15));
      g.translate(0.18, 0, 0); // crown sits on the leaning trunk top
      g.computeVertexNormals();
      fronds.push(g);
    };
    for (let k = 0; k < 8; k++) make(k + 0.5, 8, 1.25, 0.9, 3.2, 1.0, false); // upper, rising
    for (let k = 0; k < 12; k++) make(k, 12, 0.55, 1.3, 4.4, 1.25, false); // middle, arching
    for (let k = 0; k < 10; k++) make(k + 0.3, 10, -0.1, 1.1, 4.0, 1.15, false); // lower, drooping
    for (let k = 0; k < 9; k++) make(k + 0.6, 9, -1.2, 0.2, 2.2, 0.9, true); // dry fronds hanging down
    const frondGeo = G.merge(fronds.map((g) => { if (g.attributes.color) g.deleteAttribute('color'); return g; }));
    T._palm = { trunk, frondGeo, frondMat, barkMat };
    return T._palm;
  };

  // ---------- spatial chunks: one InstancedMesh per ~120 m cell, culled by frustum + distance ----------
  T.chunks = [];
  // parts: [{ geo, mat }], items: [{ x, z, mats: [Matrix4 per part] }] -> sets item.ref = [{ mesh, i }] per part
  T.chunked = function (scene, parts, items, shadow) {
    const CELL = 120, cells = new Map();
    items.forEach((it) => {
      const k = Math.floor(it.x / CELL) + ',' + Math.floor(it.z / CELL);
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(it);
    });
    cells.forEach((list) => {
      const c = new THREE.Vector3();
      list.forEach((it) => { c.x += it.x; c.z += it.z; });
      c.multiplyScalar(1 / list.length);
      let r = 0;
      list.forEach((it) => { r = Math.max(r, Math.hypot(it.x - c.x, it.z - c.z)); });
      c.y = 5;
      const meshes = parts.map((pt, pi) => {
        const im = new THREE.InstancedMesh(pt.geo, pt.mat, list.length);
        list.forEach((it, i) => {
          im.setMatrixAt(i, it.mats[pi]);
          (it.ref = it.ref || [])[pi] = { mesh: im, i };
        });
        im.frustumCulled = false; // whole chunk is culled below instead
        im.castShadow = !!shadow;
        im.receiveShadow = true;
        scene.add(im);
        return im;
      });
      T.chunks.push({ meshes, sphere: new THREE.Sphere(c, r + 22) });
    });
  };
  const frustum = new THREE.Frustum(), pv = new THREE.Matrix4();
  T.cull = function (cam) {
    pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    frustum.setFromProjectionMatrix(pv);
    const far = G.Main.isMobile ? 260 : 480;
    T.chunks.forEach((ch) => {
      const v = ch.sphere.center.distanceTo(cam.position) - ch.sphere.radius < far && frustum.intersectsSphere(ch.sphere);
      ch.meshes.forEach((m) => (m.visible = v));
    });
  };

  T.plantPalms = function (scene, spots) {
    if (!spots.length) return;
    const P = T.palmParts();
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const items = spots.map((p) => {
      const h = G.rand(8, 12), rot = G.rand(0, 6.28), sc = G.rand(0.95, 1.2);
      q.setFromAxisAngle(up, rot);
      const m1 = new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y || 0, p.z), q, new THREE.Vector3(sc, h, sc));
      const top = new THREE.Vector3(0.18 * sc, h, 0).applyQuaternion(q);
      const m2 = new THREE.Matrix4().compose(new THREE.Vector3(p.x + top.x, (p.y || 0) + h, p.z + top.z), q, new THREE.Vector3(sc, sc, sc));
      return { x: p.x, z: p.z, mats: [m1, m2] };
    });
    T.chunked(scene, [{ geo: P.trunk, mat: P.barkMat }, { geo: P.frondGeo, mat: P.frondMat }], items, !G.Main.isMobile);
  };

  // place trees at the given spots (Vector3, y = ground height; .palm marks palm spots)
  T.plant = function (scene, spots) {
    if (!spots || !spots.length) return;
    T.plantPalms(scene, spots.filter((p) => p.palm));
    spots = spots.filter((p) => !p.palm);
    if (!spots.length) return;
    if (!T.models.length) { T.procedural(scene, spots); return; }
    const groups = T.models.map(() => []);
    spots.forEach((p, i) => groups[i % T.models.length].push(p));
    const mobile = G.Main && G.Main.isMobile;
    T.nearMax = mobile ? 2 : 14;
    T.lod = [];
    T.models.forEach((m, k) => {
      const ps = groups[k];
      if (!ps.length) return;
      const base = 1 / Math.max(0.5, m.height);
      const inst = ps.map((p) => {
        const s = base * G.rand(6, 9.5);
        const mx = new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y || 0, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), G.rand(0, 6.28)), new THREE.Vector3(s, s, s));
        return { x: p.x, z: p.z, mx, near: false };
      });
      // far: crossed quads showing a picture of this very model (chunked + culled)
      const imp = T.impostor(m);
      inst.forEach((t) => (t.mats = [t.mx]));
      T.chunked(scene, [{ geo: imp.geo, mat: imp.mat }], inst, !G.Main.isMobile);
      const far = null;
      // near: the full 3D model, only for the closest trees
      const near = m.meshes.map(({ g, mat }) => {
        const im = new THREE.InstancedMesh(g, mat, T.nearMax);
        im.count = 0;
        im.castShadow = true;
        im.receiveShadow = true;
        im.frustumCulled = false;
        scene.add(im);
        return im;
      });
      T.lod.push({ inst, far, near });
    });
  };

  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

  // render the model from the side into a transparent texture (unlit albedo, lit later in the scene)
  T.impostor = function (m) {
    const R = G.Main.renderer;
    const box = new THREE.Box3();
    const scene = new THREE.Scene();
    m.meshes.forEach(({ g, mat }) => {
      g.computeBoundingBox();
      box.union(g.boundingBox);
      const b = new THREE.MeshBasicMaterial({ map: mat.map || null, color: mat.color ? mat.color.clone() : 0xffffff, alphaTest: 0.5, side: THREE.DoubleSide });
      scene.add(new THREE.Mesh(g, b));
    });
    const size = box.getSize(new THREE.Vector3());
    const w = Math.max(size.x, size.z) * 1.02, h = size.y * 1.02;
    const res = G.Main.isMobile ? 256 : 512;
    const rt = new THREE.WebGLRenderTarget(res, res, { format: THREE.RGBAFormat, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
    // two views (front + side) side by side in one texture
    const cam = new THREE.OrthographicCamera(-w / 2, w / 2, h, 0, -100, 100);
    const old = { c: R.getClearColor(new THREE.Color()), a: R.getClearAlpha(), rt: R.getRenderTarget(), tm: R.toneMapping, sm: R.shadowMap.autoUpdate };
    R.setRenderTarget(rt);
    R.toneMapping = THREE.NoToneMapping;
    R.setClearColor(0x3b5a2a, 0); // leafy colour so mip edges don't go black
    R.clear();
    [0, Math.PI / 2].forEach((ang, i) => {
      R.setViewport(i * res / 2, 0, res / 2, res);
      R.setScissor(i * res / 2, 0, res / 2, res);
      R.setScissorTest(true);
      cam.position.set(Math.sin(ang) * 50, 0, Math.cos(ang) * 50);
      cam.lookAt(0, 0, 0);
      R.render(scene, cam);
    });
    R.setScissorTest(false);
    R.setRenderTarget(old.rt);
    R.setViewport(0, 0, R.domElement.width / R.getPixelRatio(), R.domElement.height / R.getPixelRatio());
    R.setClearColor(old.c, old.a);
    R.toneMapping = old.tm;
    scene.traverse((o) => o.material && o.material.dispose());
    const tex = rt.texture;
    const mat = new THREE.MeshStandardMaterial({ map: tex, color: 0xd0d0d0, alphaTest: 0.45, roughness: 0.9, metalness: 0, envMapIntensity: 0.6 });
    mat.shadowSide = THREE.DoubleSide;
    mat.userData.linear = true;
    // crossed quads (each in both facings, single-sided); front uses the left half of the
    // texture, side the right half. Normals point mostly up like a leafy crown, so every card
    // is lit the same way whichever way it faces.
    const quads = [];
    [0, 1].forEach((i) => [0, Math.PI].forEach((flip) => {
      const g = new THREE.PlaneGeometry(w, h);
      g.translate(0, h / 2 + box.min.y, 0);
      const uv = g.attributes.uv;
      for (let j = 0; j < uv.count; j++) uv.setX(j, uv.getX(j) * 0.5 + i * 0.5);
      if (flip) { // mirror the picture so the back side reads correctly
        for (let j = 0; j < uv.count; j++) uv.setX(j, i * 0.5 + (0.5 - (uv.getX(j) - i * 0.5)));
        g.rotateY(Math.PI);
      }
      if (i) g.rotateY(Math.PI / 2);
      const n = g.attributes.normal, p = g.attributes.position;
      for (let j = 0; j < n.count; j++) {
        const v = new THREE.Vector3(p.getX(j) * 0.35, 1, p.getZ(j) * 0.35).normalize();
        n.setXYZ(j, v.x, v.y, v.z);
      }
      quads.push(g);
    }));
    const geo = G.merge(quads.map((g) => { if (g.attributes.color) g.deleteAttribute('color'); return g; }));
    return { geo, mat };
  };

  // swap the closest trees to full models (called every frame, works every 0.4 s)
  T.update = function (pos, dt) {
    if (G.Main.camera) T.cull(G.Main.camera);
    if (!T.lod || !T.lod.length) return;
    T._t = (T._t || 0) - dt;
    if (T._t > 0) return;
    T._t = 0.4;
    const all = [];
    T.lod.forEach((L, k) => L.inst.forEach((t, i) => {
      const d = (t.x - pos.x) ** 2 + (t.z - pos.z) ** 2;
      if (d < 90 * 90) all.push({ k, i, d });
    }));
    all.sort((a, b) => a.d - b.d);
    const want = new Set(all.slice(0, T.nearMax).map((e) => e.k + ':' + e.i));
    T.lod.forEach((L, k) => {
      let n = 0;
      L.inst.forEach((t, i) => {
        const nearNow = want.has(k + ':' + i);
        if (nearNow !== t.near) { t.near = nearNow; const r = t.ref[0]; r.mesh.setMatrixAt(r.i, nearNow ? ZERO : t.mx); r.mesh.instanceMatrix.needsUpdate = true; }
        if (nearNow && n < T.nearMax) { L.near.forEach((im) => im.setMatrixAt(n, t.mx)); n++; }
      });
      L.near.forEach((im) => { im.count = n; im.instanceMatrix.needsUpdate = true; });
    });
  };

  T.procedural = function (scene, spots) {
    const B = new G.Batch();
    spots.forEach((p) => {
      const s = G.rand(0.9, 1.4), y = p.y || 0;
      B.add('vc', G.Mat.vc, G.cyl(0.18 * s, 0.26 * s, 3 * s, 6, p.x, y + 1.5 * s, p.z, '#5d4632'));
      const c = new THREE.IcosahedronGeometry(2.2 * s, 1);
      c.scale(1, 0.85, 1);
      c.translate(p.x, y + 3.8 * s, p.z);
      B.add('vc', G.Mat.vc, G.colorize(c, G.pick(['#4f7a31', '#5c8a3a', '#466e2c'])));
    });
    B.build(scene, true, true);
  };
})(window.G);
