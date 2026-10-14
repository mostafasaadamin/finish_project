'use strict';
// Real people: Microsoft Rocketbox avatars (MIT licence) — photo-textured, fully rigged humans incl.
// men in galabeya, women in hijab/abaya, kids, police and workers — with their motion-captured
// animations (walk, run, idle, sit, wave, angry arguing...). Replaces the box figures.
(function (G) {
  const C = (G.Chars = { avatars: [], byKind: {}, clips: {}, ready: false, live: [] });
  const DIR = 'assets/people/';
  const mobile = () => G.Main && G.Main.isMobile;

  C.load = async function () {
    if (!THREE.GLTFLoader || !THREE.SkeletonUtils) return;
    let index, anims;
    try {
      [index, anims] = await Promise.all([fetch(DIR + 'index.json').then((r) => r.json()), fetch(DIR + 'anims.json').then((r) => r.json())]);
    } catch (e) { return; }
    Object.keys(anims).forEach((k) => {
      anims[k].tracks = anims[k].tracks.filter((t) => /^Bip01/.test(t.name)); // helper tracks would grab the root
      C.clips[k] = THREE.AnimationClip.parse(anims[k]);
    });
    const loader = new THREE.GLTFLoader();
    const texL = new THREE.TextureLoader();
    const lo = mobile();
    let list = index.avatars;
    // phones: fewer distinct people to keep GPU memory sane
    if (lo) { const seen = {}; list = list.filter((a) => (seen[a.kind] = (seen[a.kind] || 0) + 1) <= ({ man: 5, woman: 4, galabeya: 2, kid: 2, officer: 1, worker: 2 }[a.kind] || 1)); }
    const tex = (dir, f, srgb) => {
      const t = texL.load(DIR + dir + '/' + f);
      if (srgb) t.encoding = THREE.sRGBEncoding;
      t.anisotropy = 4;
      return t;
    };
    await Promise.all(list.map((a) => new Promise((res) => {
      loader.load(DIR + a.id + '/model.glb', (g) => {
        g.scene.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = true;
          o.frustumCulled = false; // skinned bounds don't follow the bones
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          const out = mats.map((m) => {
            const d = a.mats[m.name] || {};
            const nm = new THREE.MeshStandardMaterial({ name: m.name, roughness: 0.78, metalness: 0, envMapIntensity: 0.55 });
            if (d.map) nm.map = tex(a.id, lo && d.lo ? d.lo : d.map, true);
            if (d.normal && !lo) { nm.normalMap = tex(a.id, d.normal, false); nm.normalScale.set(0.8, 0.8); }
            if (d.alpha) { nm.alphaTest = 0.45; nm.side = THREE.DoubleSide; nm.roughness = 0.6; }
            nm.skinning = true;
            nm.userData.linear = true;
            return nm;
          });
          o.material = Array.isArray(o.material) ? out : out[0];
        });
        g.scene.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(g.scene);
        const av = Object.assign({}, a, { scene: g.scene, h: box.max.y - box.min.y, minY: box.min.y });
        C.avatars.push(av);
        (C.byKind[a.kind] = C.byKind[a.kind] || []).push(av);
        res();
      }, undefined, () => res());
    })));
    C.ready = C.avatars.length > 0;
  };

  // which avatar pool serves each kind the game asks for
  const POOL = { man: ['man', 'man', 'man', 'galabeya'], galabeya: ['galabeya'], woman: ['woman'], kid: ['kid'], officer: ['officer'], worker: ['worker'] };
  const HEIGHT = { man: [1.66, 1.82], galabeya: [1.66, 1.8], woman: [1.56, 1.7], kid: [1.1, 1.4], officer: [1.75, 1.85], worker: [1.68, 1.8] };
  const clipFor = (sex, n) => {
    const keys = Object.keys(C.clips);
    const key = keys.find((k) => k.startsWith(sex + '_' + n)) || keys.find((k) => k.startsWith('m_' + n));
    return key && C.clips[key];
  };

  // kind: man | galabeya | woman | kid | officer | worker
  C.make = function (kind, opts) {
    opts = opts || {};
    const poolKind = G.pick(POOL[kind] || POOL.man);
    const pool = C.byKind[poolKind] || C.byKind.man || C.avatars;
    const av = (opts.avatar && C.avatars.find((a) => a.id === opts.avatar)) || G.pick(pool);
    const model = THREE.SkeletonUtils.clone(av.scene);
    const root = new THREE.Group();
    const hr = HEIGHT[kind] || HEIGHT[av.kind] || HEIGHT.man;
    const s = G.rand(hr[0], hr[1]) / av.h;
    model.scale.multiplyScalar(s);
    model.position.y = -av.minY * s;
    root.add(model);
    const sex = av.female ? 'f' : 'm';
    const mixer = new THREE.AnimationMixer(model);
    const acts = {};
    const names = {
      idle: G.chance(0.7) ? 'idle_neutral_01' : 'idle_look_around_01', walk: 'walk_neutral_01', run: 'run_neutral_01',
      sit: 'sit_chair_idle_neutral_01', wave: 'wave_01', fight: 'gestic_talk_angry', angry: 'idle_angry_01',
      talk: 'gestic_talk_neutral_01', drink: 'drink_drinking',
    };
    Object.keys(names).forEach((n) => {
      const clip = clipFor(sex, names[n]);
      if (!clip) return;
      const a = mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(n === 'idle' ? 1 : 0);
      a.time = Math.random() * clip.duration;
      acts[n] = a;
    });
    const dummy = () => new THREE.Object3D();
    root.userData = {
      legL: dummy(), legR: dummy(), armL: dummy(), armR: dummy(), torso: dummy(),
      phase: Math.random() * 6, kind: kind === 'man' && av.kind === 'galabeya' ? 'galabeya' : kind, real: true,
      mixer, acts, model, avatar: av.id, w: {}, mode: 'idle', lunge: 0,
    };
    Object.keys(acts).forEach((n) => (root.userData.w[n] = n === 'idle' ? 1 : 0));
    root.userData.meshes = [];
    model.traverse((o) => { if (o.isMesh) root.userData.meshes.push(o); });
    mixer.update(0); // never show the bind T-pose
    C.live.push(root);
    return root;
  };

  const tmpV = new THREE.Vector3();
  const farD2 = () => (mobile() ? 60 : 90) ** 2;

  // drive the character for the given mode (same modes the box figures used)
  C.anim = function (p, mode, dt, speed) {
    const u = p.userData;
    u.frame = C.frame;
    let want = mode;
    if (mode === 'walk') want = speed > 2.6 ? 'run' : 'walk';
    if (!u.acts[want]) want = 'idle';
    u.mode = want;
    if (!dt) { // posing (e.g. seated at the ahwa) — snap straight to it
      Object.keys(u.acts).forEach((n) => { u.w[n] = n === want ? 1 : 0; u.acts[n].setEffectiveWeight(u.w[n]); });
      u.mixer.update(0);
      return;
    }
    const cam = G.Main && G.Main.camera;
    const d2 = cam ? p.getWorldPosition(tmpV).distanceToSquared(cam.position) : 0;
    u.model.visible = d2 < farD2() * 1.5;
    if (d2 > farD2()) return;
    const k = Math.min(1, dt * 6);
    Object.keys(u.acts).forEach((n) => {
      u.w[n] += ((n === want ? 1 : 0) - u.w[n]) * k;
      u.acts[n].setEffectiveWeight(u.w[n]);
    });
    if (want === 'walk') u.acts.walk.timeScale = (speed || 1.4) / 1.35;
    if (want === 'run') u.acts.run.timeScale = (speed || 4) / 4.2;
    // punches from the combat code: a quick lunge of the whole body
    if (u.armR.rotation.x < -1.5) u.lunge = 0.25;
    u.lunge = Math.max(0, u.lunge - dt);
    u.model.position.z = Math.sin((u.lunge / 0.25) * Math.PI) * 0.18;
    // flinch from being hit
    u.model.rotation.x = u.torso.rotation.x ? -u.torso.rotation.x * 0.5 : 0;
    u.mixer.update(dt);
  };

  // idle animation + distance visibility for everyone the game logic didn't animate this frame
  C.update = function (dt) {
    const cam = G.Main.camera, far = farD2();
    C.live = C.live.filter((p) => {
      let top = p;
      while (top.parent) top = top.parent;
      const u = p.userData;
      if (!top.isScene) return (u.off = (u.off || 0) + 1) < 600; // dropped once long detached
      u.off = 0;
      const d2 = p.getWorldPosition(tmpV).distanceToSquared(cam.position);
      if (u.frame !== C.frame) {
        u.model.visible = d2 < far * 1.5;
        if (d2 < far) u.mixer.update(dt);
      }
      // only people near the camera cast shadows (skinned shadow passes are expensive)
      const sh = d2 < (mobile() ? 18 : 35) ** 2;
      if (sh !== u.shadow) { u.shadow = sh; u.meshes.forEach((m) => (m.castShadow = sh && !m.material.alphaTest)); }
      return true;
    });
    C.frame = (C.frame || 0) + 1;
  };
})(window.G);
