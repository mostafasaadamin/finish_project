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
    // frond texture: a midrib with many narrow leaflets
    const c = G.canvas(128, 512), x = c.getContext('2d');
    x.clearRect(0, 0, 128, 512);
    for (let y = 30; y < 500; y += 5) {
      const len = 58 * Math.sin(Math.PI * (y / 512)) + 6;
      x.strokeStyle = `hsl(${88 + Math.random() * 16},${38 + Math.random() * 15}%,${22 + Math.random() * 14}%)`;
      x.lineWidth = 3;
      x.beginPath(); x.moveTo(64, y); x.lineTo(64 - len, y + 22); x.stroke();
      x.beginPath(); x.moveTo(64, y); x.lineTo(64 + len, y + 22); x.stroke();
    }
    x.strokeStyle = '#6b6b3a'; x.lineWidth = 4; x.beginPath(); x.moveTo(64, 0); x.lineTo(64, 512); x.stroke();
    const frondMat = new THREE.MeshStandardMaterial({ map: G.tex(c), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8 });
    frondMat.userData.linear = true;
    // bark texture with leaf-base rings
    const b = G.canvas(64, 256), bx = b.getContext('2d');
    bx.fillStyle = '#6e5a43'; bx.fillRect(0, 0, 64, 256);
    for (let y = 0; y < 256; y += 9) { bx.fillStyle = 'rgba(40,28,16,0.55)'; bx.fillRect(0, y, 64, 3); bx.fillStyle = 'rgba(160,130,95,0.35)'; bx.fillRect(0, y + 3, 64, 2); }
    G.noise(bx, 64, 256, 800, 0.15, true);
    const barkMat = new THREE.MeshStandardMaterial({ map: G.tex(b, true), roughness: 1 });
    barkMat.userData.linear = true;
    // trunk, slightly curved
    const H = 1, trunk = new THREE.CylinderGeometry(0.17, 0.24, H, 8, 8, true);
    trunk.translate(0, H / 2, 0);
    const tp = trunk.attributes.position;
    for (let i = 0; i < tp.count; i++) { const y = tp.getY(i); tp.setX(i, tp.getX(i) + 0.25 * y * y); }
    const tuv = trunk.attributes.uv;
    for (let i = 0; i < tuv.count; i++) tuv.setY(i, tuv.getY(i) * 6);
    trunk.computeVertexNormals();
    // ~16 fronds radiating from the crown, bending down
    const fronds = [];
    for (let k = 0; k < 16; k++) {
      const g = new THREE.PlaneGeometry(0.9, 3.4, 1, 8);
      g.translate(0, 1.7, 0); // base at origin, length along +y
      const up = k < 5 ? 0.9 : 0.35, droop = k < 5 ? 0.35 : 0.9;
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = p.getY(i) / 3.4;
        // lay the frond out and let it droop
        const out = p.getY(i) * Math.cos(up - droop * t), h = p.getY(i) * Math.sin(up - droop * t) * 0.6;
        p.setXYZ(i, p.getX(i) * (1 - t * 0.4), h, out);
      }
      g.rotateY((k / 16) * Math.PI * 2 + (k % 2) * 0.2);
      g.translate(0.25, 0, 0); // crown sits on the curved trunk top
      g.computeVertexNormals();
      fronds.push(g);
    }
    const frondGeo = G.merge(fronds.map((g) => { g.deleteAttribute('color'); return g; }));
    T._palm = { trunk, frondGeo, frondMat, barkMat };
    return T._palm;
  };

  T.plantPalms = function (scene, spots) {
    if (!spots.length) return;
    const P = T.palmParts();
    const n = spots.length;
    const trunkIM = new THREE.InstancedMesh(P.trunk, P.barkMat, n);
    const crownIM = new THREE.InstancedMesh(P.frondGeo, P.frondMat, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    spots.forEach((p, i) => {
      const h = G.rand(7, 11), rot = G.rand(0, 6.28), s = G.rand(0.9, 1.15);
      q.setFromAxisAngle(up, rot);
      m.compose(new THREE.Vector3(p.x, p.y || 0, p.z), q, new THREE.Vector3(s, h, s));
      trunkIM.setMatrixAt(i, m);
      // crown on top of the (curved) trunk
      const top = new THREE.Vector3(0.25 * s, h, 0).applyQuaternion(q);
      m.compose(new THREE.Vector3(p.x + top.x, (p.y || 0) + h, p.z + top.z), q, new THREE.Vector3(s, s, s));
      crownIM.setMatrixAt(i, m);
    });
    [trunkIM, crownIM].forEach((im) => { im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; scene.add(im); });
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
    T.nearMax = mobile ? 8 : 24;
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
      // far: crossed quads showing a picture of this very model
      const imp = T.impostor(m);
      const far = new THREE.InstancedMesh(imp.geo, imp.mat, inst.length);
      inst.forEach((t, i) => far.setMatrixAt(i, t.mx));
      far.frustumCulled = false; // instances span the whole city
      far.castShadow = true;
      far.receiveShadow = true;
      scene.add(far);
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
    const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.9, metalness: 0 });
    mat.userData.linear = true;
    // crossed quads; front uses the left half of the texture, side the right half
    const quads = [0, 1].map((i) => {
      const g = new THREE.PlaneGeometry(w, h);
      g.translate(0, h / 2 + box.min.y, 0);
      const uv = g.attributes.uv;
      for (let j = 0; j < uv.count; j++) uv.setX(j, uv.getX(j) * 0.5 + i * 0.5);
      if (i) g.rotateY(Math.PI / 2);
      // round normals so the flat cards shade like a crown
      const n = g.attributes.normal, p = g.attributes.position;
      for (let j = 0; j < n.count; j++) {
        const v = new THREE.Vector3(p.getX(j), (p.getY(j) - h * 0.5) * 0.6, p.getZ(j)).normalize();
        v.y += 0.6;
        v.normalize();
        n.setXYZ(j, v.x, v.y, v.z);
      }
      return g;
    });
    const geo = G.merge(quads.map((g) => { if (g.attributes.color) g.deleteAttribute('color'); return g; }));
    return { geo, mat };
  };

  // swap the closest trees to full models (called every frame, works every 0.4 s)
  T.update = function (pos, dt) {
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
      let n = 0, dirty = false;
      L.inst.forEach((t, i) => {
        const nearNow = want.has(k + ':' + i);
        if (nearNow !== t.near) { t.near = nearNow; L.far.setMatrixAt(i, nearNow ? ZERO : t.mx); dirty = true; }
        if (nearNow && n < T.nearMax) { L.near.forEach((im) => im.setMatrixAt(n, t.mx)); n++; }
      });
      if (dirty) L.far.instanceMatrix.needsUpdate = true;
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
