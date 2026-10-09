'use strict';
(function (G) {
  const Main = (G.Main = { started: false, paused: false, camMode: 0, t: 0 });
  const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || 'ontouchstart' in window;

  function setupRenderer() {
    const renderer = new THREE.WebGLRenderer({ antialias: !isMobile, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.25 : 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    document.getElementById('game').appendChild(renderer.domElement);
    Main.renderer = renderer;

    const scene = (Main.scene = new THREE.Scene());
    const sky = G.canvas(4, 256), sx = sky.getContext('2d');
    const gr = sx.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#8fb8d8'); gr.addColorStop(0.55, '#c9d6dc'); gr.addColorStop(1, '#e6d9bd');
    sx.fillStyle = gr; sx.fillRect(0, 0, 4, 256);
    scene.background = G.tex(sky);
    scene.fog = new THREE.Fog('#d9cfb8', 90, 520);

    scene.add(new THREE.HemisphereLight('#dbe8f5', '#9c8a6a', 0.75));
    const sun = (Main.sun = new THREE.DirectionalLight('#fff3dc', 0.95));
    sun.castShadow = true;
    const sz = isMobile ? 1024 : 2048;
    sun.shadow.mapSize.set(sz, sz);
    const sc = sun.shadow.camera;
    sc.left = -75; sc.right = 75; sc.top = 75; sc.bottom = -75; sc.near = 1; sc.far = 260;
    sun.shadow.bias = -0.0006;
    scene.add(sun, sun.target);

    Main.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.3, 3000);
    window.addEventListener('resize', () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      Main.camera.aspect = window.innerWidth / window.innerHeight;
      Main.camera.updateProjectionMatrix();
    });
  }

  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  function updateCamera(dt, snap) {
    const Pl = G.Player, cam = Main.camera;
    const f = Pl.fwd();
    const rev = Pl.speed < -0.5 && Main.camMode !== 2;
    if (Main.camMode === 2) {
      // driver's seat (left-hand drive, like Egypt)
      tmp.copy(Pl.pos).addScaledVector(f, 1.2).add(new THREE.Vector3(Math.cos(Pl.heading) * 0.45, 1.75, -Math.sin(Pl.heading) * 0.45));
      tmp2.copy(tmp).addScaledVector(f, 20); tmp2.y = 1.2;
      camPos.copy(tmp); camLook.copy(tmp2);
    } else {
      const back = Main.camMode === 0 ? 9 : 16, up = Main.camMode === 0 ? 3.8 : 7.5;
      tmp.copy(Pl.pos).addScaledVector(f, rev ? back * 0.8 : -back); tmp.y = up;
      tmp2.copy(Pl.pos).addScaledVector(f, rev ? -4 : 6); tmp2.y = 1.6;
      const k = snap ? 1 : 1 - Math.exp(-dt * 5);
      camPos.lerp(tmp, k); camLook.lerp(tmp2, k);
      if (snap) { camPos.copy(tmp); camLook.copy(tmp2); }
    }
    Pl.mesh.visible = Main.camMode !== 2;
    cam.position.copy(camPos);
    if (Pl.shake > 0) cam.position.add(new THREE.Vector3(G.rand(-1, 1), G.rand(-1, 1), G.rand(-1, 1)).multiplyScalar(Pl.shake * 0.25));
    cam.lookAt(camLook);
    const fov = 62 + G.clamp(Math.abs(Pl.speed) - 10, 0, 20) * 0.4;
    if (Math.abs(cam.fov - fov) > 0.1) { cam.fov = fov; cam.updateProjectionMatrix(); }
    G.Audio.listener.x = Pl.pos.x; G.Audio.listener.z = Pl.pos.z; G.Audio.listener.h = Pl.heading;
  }

  function loop() {
    requestAnimationFrame(loop);
    const now = performance.now();
    let dt = Math.min(0.05, (now - (Main.last || now)) / 1000);
    Main.last = now;
    if (!Main.started || Main.paused) { if (Main.started) Main.renderer.render(Main.scene, Main.camera); return; }
    Main.t += dt;
    const I = G.Input;
    if (!I.wheelActive) I.steer = (I.kbRight ? 1 : 0) - (I.kbLeft ? 1 : 0);
    G.Player.update(dt);
    G.Traffic.update(dt);
    G.People.update(dt);
    G.Events.update(dt);
    updateCamera(dt);
    // sun + shadows follow the microbus
    const p = G.Player.pos;
    Main.sun.position.set(p.x + 60, 110, p.z + 35);
    Main.sun.target.position.set(p.x, 0, p.z);
    // police lights & the Nile
    const blink = Math.floor(Main.t * 6) % 2;
    G.City.policeLights[0].visible = !!blink;
    G.City.policeLights[1].visible = !blink;
    G.Tex.water.offset.x = Main.t * 0.01;
    G.Tex.water.offset.y = Main.t * 0.004;
    G.HUD.update();
    Main.renderer.render(Main.scene, Main.camera);
    G.Voice.updateBubbles(Main.camera, window.innerWidth, window.innerHeight);
  }

  async function boot() {
    const status = document.getElementById('loadStatus');
    try {
      if (document.fonts && document.fonts.load) {
        await Promise.race([Promise.all([document.fonts.load('900 40px Cairo'), document.fonts.load('700 40px Cairo')]), new Promise((r) => setTimeout(r, 2500))]);
      }
    } catch (e) { /* system font fallback */ }
    status.textContent = 'بنبني شوارع القاهرة…';
    await new Promise((r) => setTimeout(r, 30));
    setupRenderer();
    G.Models.buildTextures();
    G.City.build(Main.scene);
    G.Traffic.init(Main.scene, isMobile ? 26 : 38);
    G.People.init(Main.scene);
    G.Player.init(Main.scene);
    G.HUD.init();
    G.Voice.init();
    updateCamera(0, true);
    Main.renderer.render(Main.scene, Main.camera);
    status.textContent = 'جاهز! 🚐';
    const btn = document.getElementById('startBtn');
    btn.disabled = false;
    btn.addEventListener('click', start);
    loop();
  }

  function start() {
    if (Main.started) return;
    G.Audio.init();
    // unlock speech synthesis with a user gesture
    Main.started = true;
    document.getElementById('start').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    G.HUD.resizeCanvases();
    G.Voice.conversation(G.TALK.start, { driver: null }, 2);
    setTimeout(() => G.HUD.toast('اطلع على أول موقف ولمّ ركاب – الموقف الأزرق على الخريطة 🗺️'), 1500);
    if (document.documentElement.requestFullscreen && isMobile) document.documentElement.requestFullscreen().catch(() => {});
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && Main.started && !Main.paused) G.HUD.togglePause();
  });

  window.addEventListener('load', () => {
    boot().catch((e) => {
      console.error(e);
      document.getElementById('loadStatus').textContent = 'حصلت مشكلة في التحميل: ' + e.message;
    });
  });
})(window.G);
