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

  // place trees at the given spots (Vector3, y = ground height)
  T.plant = function (scene, spots) {
    if (!spots || !spots.length) return;
    if (!T.models.length) { T.procedural(scene, spots); return; }
    const groups = T.models.map(() => []);
    spots.forEach((p, i) => groups[i % T.models.length].push(p));
    T.models.forEach((m, k) => {
      const ps = groups[k];
      if (!ps.length) return;
      const target = m.palm ? G.rand(7, 9) : G.rand(6, 9);
      const base = target / Math.max(0.5, m.height);
      const mats = ps.map((p) => {
        const s = base * G.rand(0.8, 1.2);
        return new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y || 0, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), G.rand(0, 6.28)), new THREE.Vector3(s, s, s));
      });
      m.meshes.forEach(({ g, mat }) => {
        const im = new THREE.InstancedMesh(g, mat, ps.length);
        mats.forEach((mx, i) => im.setMatrixAt(i, mx));
        im.castShadow = true;
        im.receiveShadow = true;
        scene.add(im);
      });
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
