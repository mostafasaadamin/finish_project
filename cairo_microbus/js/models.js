'use strict';
// Procedural textures and low-poly models.
(function (G) {
  const M = (G.Models = {});
  const Tex = (G.Tex = {});
  const Mat = (G.Mat = {});

  // ================= TEXTURES =================
  // Photo textures (G.Assets) are used when available; otherwise everything is drawn procedurally.
  const PH = () => G.Assets && G.Assets.ok;
  // compose a canvas by tiling one photo map, then optionally paint on top
  const photoCanvas = (w, h, surface, kind, tilePx, paint) => {
    const im = PH() ? G.Assets.image(surface, kind) : null;
    if (!im) return null;
    const c = G.canvas(w, h), x = c.getContext('2d');
    G.Assets.tileInto(x, im, 0, 0, w, h, tilePx);
    if (paint) paint(x, w, h);
    return c;
  };
  const dataTex = (c, repeat) => {
    if (!c) return null;
    const t = new THREE.CanvasTexture(c);
    if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    return t; // linear data (normal / roughness)
  };
  // Standard material, with optional normal/roughness maps
  const std = (opts) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9, metalness: 0 }, opts));

  M.buildTextures = function () {
    // ---- asphalt ----
    let c = photoCanvas(512, 512, 'asphalt', 'Color', 256, (x) => {
      x.globalCompositeOperation = 'multiply'; x.fillStyle = '#b8b5ae'; x.fillRect(0, 0, 512, 512);
      x.globalCompositeOperation = 'source-over';
    });
    let x;
    if (!c) {
      c = G.canvas(256, 256); x = c.getContext('2d');
      x.fillStyle = '#5a5a58'; x.fillRect(0, 0, 256, 256);
      G.noise(x, 256, 256, 9000, 0.08);
    }
    x = c.getContext('2d');
    for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(20,20,20,0.16)'; x.beginPath(); x.ellipse(G.rand(0, c.width), G.rand(0, c.height), G.rand(10, 60), G.rand(6, 35), G.rand(0, 3), 0, 7); x.fill(); }
    Tex.asphalt = G.tex(c, true);
    Tex.asphaltN = dataTex(photoCanvas(512, 512, 'asphalt', 'NormalGL', 256), true);
    Tex.asphaltR = dataTex(photoCanvas(512, 512, 'asphalt', 'Roughness', 256), true);

    // ---- road with lanes: horizontal = along road (12 m), vertical = across (20 m) ----
    const RW_ = 1024, RH = 512, tile = 256; // one photo tile ~ 3 m
    c = G.canvas(RW_, RH); x = c.getContext('2d');
    if (!G.Assets || !G.Assets.tileInto(x, PH() && G.Assets.image('asphalt'), 0, 0, RW_, RH, tile)) {
      x.drawImage(Tex.asphalt.image, 0, 0, RW_ / 2, RH); x.drawImage(Tex.asphalt.image, RW_ / 2, 0, RW_ / 2, RH);
    } else { x.globalCompositeOperation = 'multiply'; x.fillStyle = '#b8b5ae'; x.fillRect(0, 0, RW_, RH); x.globalCompositeOperation = 'source-over'; }
    const Y = (p) => ((p + 10) / 20) * RH;
    // worn paint: draw lines then scratch them
    const line = (y, w, color, dash) => {
      x.fillStyle = color;
      for (let px = 0; px < (dash ? RW_ / 2 : RW_); px += 4) { if (Math.random() < 0.9) x.fillRect(px, y - w / 2 + G.rand(-0.4, 0.4), 4, w); }
    };
    [-1.05, 1.05, -9.5, 9.5].forEach((p) => line(Y(p), 5, 'rgba(226,178,40,0.85)'));
    [-5.4, 5.4].forEach((p) => line(Y(p), 5, 'rgba(235,235,230,0.85)', true));
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.fillRect(0, 0, RW_, 7); x.fillRect(0, RH - 7, RW_, 7);
    // oil stains in the middle of each lane
    for (let i = 0; i < 18; i++) { x.fillStyle = 'rgba(10,10,10,0.12)'; x.beginPath(); x.ellipse(G.rand(0, RW_), Y(G.pick([-7.6, -3.2, 3.2, 7.6])) + G.rand(-12, 12), G.rand(10, 40), G.rand(4, 12), 0, 0, 7); x.fill(); }
    Tex.road = G.tex(c, true);
    Tex.roadN = dataTex(photoCanvas(RW_, RH, 'asphalt', 'NormalGL', tile), true);
    Tex.roadR = dataTex(photoCanvas(RW_, RH, 'asphalt', 'Roughness', tile), true);

    // ---- sidewalk paving (texture spans 2 m) ----
    c = photoCanvas(512, 512, 'sidewalk', 'Color', 512, (x2) => {
      x2.globalCompositeOperation = 'multiply'; x2.fillStyle = '#d9cbb0'; x2.fillRect(0, 0, 512, 512); x2.globalCompositeOperation = 'source-over';
      for (let i = 0; i < 6; i++) { x2.fillStyle = 'rgba(60,45,25,0.08)'; x2.beginPath(); x2.arc(G.rand(0, 512), G.rand(0, 512), G.rand(20, 90), 0, 7); x2.fill(); }
    });
    if (!c) {
      c = G.canvas(128, 128); x = c.getContext('2d');
      x.fillStyle = '#b9ab92'; x.fillRect(0, 0, 128, 128);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.fillStyle = `hsl(36,${15 + Math.random() * 10}%,${58 + Math.random() * 8}%)`; x.fillRect(i * 32 + 1, j * 32 + 1, 30, 30); }
      G.noise(x, 128, 128, 1500, 0.08);
    }
    Tex.paving = G.tex(c, true);
    Tex.pavingN = dataTex(photoCanvas(512, 512, 'sidewalk', 'NormalGL', 512), true);

    // ---- black & white painted curb over concrete (2 m period) ----
    c = G.canvas(256, 64); x = c.getContext('2d');
    G.Assets && PH() && G.Assets.tileInto(x, G.Assets.image('concrete'), 0, 0, 256, 64, 128);
    x.globalCompositeOperation = PH() ? 'multiply' : 'source-over';
    x.fillStyle = '#2a2a2a'; x.fillRect(0, 0, 128, 64);
    x.fillStyle = '#f2f2ea'; x.fillRect(128, 0, 128, 64);
    x.globalCompositeOperation = 'source-over';
    G.noise(x, 256, 64, 600, 0.12);
    x.fillStyle = 'rgba(60,50,40,0.25)'; x.fillRect(0, 50, 256, 14);
    Tex.curb = G.tex(c, true);

    // ---- roof concrete ----
    c = photoCanvas(256, 256, 'concrete', 'Color', 256);
    if (!c) {
      c = G.canvas(128, 128); x = c.getContext('2d');
      x.fillStyle = '#9d968a'; x.fillRect(0, 0, 128, 128);
      G.noise(x, 128, 128, 2500, 0.12);
    }
    Tex.roof = G.tex(c, true);

    // ---- sand ground ----
    c = photoCanvas(512, 512, 'sand', 'Color', 512, (x2) => { x2.globalCompositeOperation = 'multiply'; x2.fillStyle = '#e8d6b0'; x2.fillRect(0, 0, 512, 512); x2.globalCompositeOperation = 'source-over'; });
    if (!c) { c = G.canvas(256, 256); x = c.getContext('2d'); x.fillStyle = '#c4ad86'; x.fillRect(0, 0, 256, 256); G.noise(x, 256, 256, 8000, 0.08); }
    Tex.sand = G.tex(c, true);

    // grass
    c = G.canvas(128, 128); x = c.getContext('2d');
    x.fillStyle = '#6f8f3c'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 3000; i++) { x.fillStyle = `hsl(${80 + Math.random() * 20},45%,${25 + Math.random() * 20}%)`; x.fillRect(Math.random() * 128, Math.random() * 128, 1, 3); }
    Tex.grass = G.tex(c, true);

    // water
    c = G.canvas(256, 256); x = c.getContext('2d');
    x.fillStyle = '#3e7a86'; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 400; i++) { x.fillStyle = `rgba(200,230,235,${Math.random() * 0.25})`; x.fillRect(Math.random() * 256, Math.random() * 256, G.rand(6, 30), 1.5); }
    Tex.water = G.tex(c, true);

    Tex.facades = [
      ['#d8c3a0', '#8a6d48'], ['#c9a77c', '#6e5235'], ['#e2cfb0', '#7d6a55'], ['#b9a48a', '#4f4a44'], ['#d6b796', '#8b4f37'], ['#cdb08e', '#5d4a3a'],
    ].map(([b, a], i) => G.tex(M.facadeCanvas(b, a, i), true));
    // plaster surface detail shared by all facades (window cells stay roughly flat)
    Tex.facadeN = dataTex(photoCanvas(512, 512, 'plaster', 'NormalGL', 128), true);
    Tex.shops = G.tex(M.shopAtlas(), false);
    Tex.billboards = G.tex(M.billboardAtlas(), false);
    Tex.streetSigns = G.tex(M.streetSignAtlas(), false);
    Tex.plate = G.tex(M.plateCanvas(), false);

    // ---- materials ----
    const nScale = (v) => new THREE.Vector2(v, v);
    Mat.vc = std({ vertexColors: true, roughness: 0.85 });
    Mat.car = std({ vertexColors: true, roughness: 0.32, metalness: 0.35, envMapIntensity: 1.2 });
    Mat.road = std({ map: Tex.road, normalMap: Tex.roadN, roughnessMap: Tex.roadR, normalScale: nScale(0.8) });
    Mat.asphalt = std({ map: Tex.asphalt, normalMap: Tex.asphaltN, roughnessMap: Tex.asphaltR, normalScale: nScale(0.8) });
    Mat.paving = std({ map: Tex.paving, normalMap: Tex.pavingN, roughness: 0.85 });
    Mat.curb = std({ map: Tex.curb, roughness: 0.8 });
    Mat.roof = std({ map: Tex.roof, roughness: 0.95 });
    Mat.sand = std({ map: Tex.sand, roughness: 1 });
    // dusty city ground (concrete photo, darker and warmer)
    const gc = photoCanvas(512, 512, 'concrete', 'Color', 256, (x2) => { x2.globalCompositeOperation = 'multiply'; x2.fillStyle = '#a99f8f'; x2.fillRect(0, 0, 512, 512); x2.globalCompositeOperation = 'source-over'; G.noise(x2, 512, 512, 3000, 0.05, true); });
    Mat.ground = gc ? std({ map: G.tex(gc, true), roughness: 0.95 }) : null;
    Mat.grass = std({ map: Tex.grass, roughness: 1 });
    Mat.water = std({ map: Tex.water, transparent: true, opacity: 0.9, roughness: 0.15, metalness: 0.1 });
    Mat.facades = Tex.facades.map((t) => std({ map: t, normalMap: Tex.facadeN, normalScale: nScale(0.6), roughness: 0.92 }));
    Mat.shops = std({ map: Tex.shops, roughness: 0.7 });
    Mat.billboards = std({ map: Tex.billboards, roughness: 0.6 });
    Mat.streetSigns = std({ map: Tex.streetSigns, roughness: 0.5 });
    Mat.plate = new THREE.MeshBasicMaterial({ map: Tex.plate });
    // balcony railings: rusty painted iron
    const metal = G.Assets && G.Assets.ok ? G.Assets.texture('metal', 'Color', 1) : null;
    Mat.rail = std({ map: metal, color: metal ? 0x6b6560 : 0x2b2622, roughness: 0.55, metalness: 0.4, side: THREE.DoubleSide });
  };

  // 4 columns x 4 floors, each column 3m, each floor 3.2m => 12m x 12.8m per repeat
  M.facadeCanvas = function (base, accent, variant) {
    const c = G.canvas(512, 512), x = c.getContext('2d');
    const plaster = PH() && G.Assets.image(['plaster', 'plaster2', 'plaster3'][variant % 3]);
    const wood = PH() && G.Assets.image('shutter');
    if (plaster) {
      // real plaster photo tinted to the building's paint colour
      G.Assets.tileInto(x, plaster, 0, 0, 512, 512, 128);
      x.globalCompositeOperation = 'multiply';
      x.fillStyle = base; x.fillRect(0, 0, 512, 512);
      x.globalCompositeOperation = 'source-over';
      x.fillStyle = 'rgba(255,245,225,0.12)'; x.fillRect(0, 0, 512, 512);
    } else {
      x.fillStyle = base; x.fillRect(0, 0, 512, 512);
      G.noise(x, 512, 512, 7000, 0.06);
    }
    for (let i = 0; i < 30; i++) { x.fillStyle = 'rgba(70,50,30,0.06)'; x.fillRect(G.rand(0, 512), G.rand(0, 512), G.rand(2, 10), G.rand(30, 220)); }
    const shutters = ['#6b4a2b', '#3f5a3a', '#7a6a50', '#5d4037', '#4b6a6e'];
    const clothes = ['#e53935', '#1e88e5', '#fdd835', '#ffffff', '#43a047', '#8e24aa', '#ff7043'];
    for (let f = 0; f < 4; f++) {
      for (let col = 0; col < 4; col++) {
        const X = col * 128, Yy = f * 128;
        x.fillStyle = 'rgba(0,0,0,0.07)'; x.fillRect(X, Yy + 120, 128, 8);
        const balcony = Math.random() < 0.38;
        const wx = X + 30, wy = Yy + 20, ww = 68, wh = balcony ? 96 : 66;
        x.fillStyle = accent; x.fillRect(wx - 5, wy - 5, ww + 10, wh + 10);
        const gr = x.createLinearGradient(0, wy, 0, wy + wh);
        gr.addColorStop(0, '#26303a'); gr.addColorStop(1, '#4a5966');
        x.fillStyle = gr; x.fillRect(wx, wy, ww, wh);
        const r = Math.random();
        const sc = G.pick(shutters);
        const drawSlats = (sx, sw) => {
          if (wood) {
            // real weathered wood, tinted to the shutter paint
            x.save(); x.beginPath(); x.rect(sx, wy, sw, wh); x.clip();
            x.drawImage(wood, G.rand(0, 600), G.rand(0, 600), 300, 300, sx, wy, Math.max(sw, wh), Math.max(sw, wh));
            x.globalCompositeOperation = 'multiply'; x.fillStyle = sc; x.fillRect(sx, wy, sw, wh);
            x.restore();
          } else { x.fillStyle = sc; x.fillRect(sx, wy, sw, wh); }
          x.fillStyle = 'rgba(0,0,0,0.3)';
          for (let k = wy + 4; k < wy + wh; k += 6) x.fillRect(sx + 2, k, sw - 4, 2);
        };
        if (r < 0.35) drawSlats(wx, ww);
        else if (r < 0.6) drawSlats(wx, ww / 2);
        else if (r < 0.7) { x.fillStyle = 'rgba(255,240,200,0.35)'; x.fillRect(wx + 4, wy + 4, ww - 8, wh - 8); }
        if (balcony) {
          x.fillStyle = '#bdb19c'; x.fillRect(X + 16, Yy + 112, 96, 9);
          x.fillStyle = '#2b2b2b';
          x.fillRect(X + 16, Yy + 84, 96, 3);
          for (let k = X + 18; k < X + 112; k += 7) x.fillRect(k, Yy + 84, 2, 28);
          if (Math.random() < 0.55) {
            x.strokeStyle = '#333'; x.lineWidth = 1;
            x.beginPath(); x.moveTo(X + 16, Yy + 66); x.lineTo(X + 112, Yy + 66); x.stroke();
            for (let k = X + 20; k < X + 104; k += G.rand(12, 20)) { x.fillStyle = G.pick(clothes); x.fillRect(k, Yy + 66, G.rand(8, 14), G.rand(12, 22)); }
          }
          if (Math.random() < 0.3) { x.fillStyle = '#4caf50'; x.beginPath(); x.arc(X + 104, Yy + 78, 8, 0, 7); x.fill(); }
        }
        if (Math.random() < 0.3) {
          x.fillStyle = '#e6e1d3'; x.fillRect(X + 101, Yy + 44, 24, 18);
          x.fillStyle = '#9e9a8e'; for (let k = 0; k < 4; k++) x.fillRect(X + 103, Yy + 47 + k * 4, 20, 1.5);
          x.fillStyle = 'rgba(60,40,20,0.25)'; x.fillRect(X + 112, Yy + 62, 2, 30);
        }
        if (Math.random() < 0.08) { x.fillStyle = '#ddd'; x.beginPath(); x.ellipse(X + 12, Yy + 50, 9, 11, 0.3, 0, 7); x.fill(); }
      }
    }
    return c;
  };

  M.SHOPS = [['كشري التحرير', '#c62828'], ['صيدلية الشفاء', '#2e7d32'], ['حلواني الأمل', '#ad1457'], ['سوبر ماركت النور', '#1565c0'],
    ['فول وطعمية', '#ef6c00'], ['موبايلات الهلال', '#6a1b9a'], ['عصير قصب', '#558b2f'], ['مكوجي رِجل', '#455a64']];
  M.shopAtlas = function () {
    const c = G.canvas(1024, 512), x = c.getContext('2d');
    M.SHOPS.forEach(([name, color], i) => {
      const X = (i % 4) * 256, Yy = Math.floor(i / 4) * 256;
      x.fillStyle = '#cbb89a'; x.fillRect(X, Yy, 256, 256);
      x.fillStyle = color; x.fillRect(X + 4, Yy + 6, 248, 70);
      x.strokeStyle = '#fff'; x.lineWidth = 3; x.strokeRect(X + 8, Yy + 10, 240, 62);
      G.arText(x, name, X + 128, Yy + 42, 34, '#fff', 900);
      if (Math.random() < 0.45 && i !== 0 && i !== 4) {
        x.fillStyle = '#8f9396'; x.fillRect(X + 14, Yy + 86, 228, 170);
        x.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = Yy + 90; k < Yy + 256; k += 7) x.fillRect(X + 14, k, 228, 2);
      } else {
        x.fillStyle = '#2c2520'; x.fillRect(X + 14, Yy + 86, 228, 170);
        for (let s = 0; s < 3; s++) {
          x.fillStyle = '#5d4a3a'; x.fillRect(X + 18, Yy + 110 + s * 45, 220, 5);
          for (let k = 0; k < 14; k++) { x.fillStyle = `hsl(${Math.random() * 360},60%,55%)`; x.fillRect(X + 22 + k * 15, Yy + 92 + s * 45, 11, 18); }
        }
        x.fillStyle = '#f5e7b8'; x.fillRect(X + 110, Yy + 150, 40, 106);
      }
    });
    G.noise(x, 1024, 512, 6000, 0.05);
    return c;
  };

  M.BILLBOARDS = [['شقق للبيع بالتقسيط', 'مقدم ١٠٪ وتقسيط على ١٠ سنين', '#0d47a1'], ['عسل النحلة', 'أحلى عسل في مصر', '#f9a825'],
    ['مدرسة النجاح للغات', 'التقديم مفتوح', '#2e7d32'], ['شاي الفلاحين', 'كوباية تعدّل المزاج', '#b71c1c']];
  M.billboardAtlas = function () {
    const c = G.canvas(1024, 512), x = c.getContext('2d');
    M.BILLBOARDS.forEach(([t1, t2, color], i) => {
      const X = (i % 2) * 512, Yy = Math.floor(i / 2) * 256;
      const g = x.createLinearGradient(X, Yy, X + 512, Yy + 256);
      g.addColorStop(0, color); g.addColorStop(1, '#111');
      x.fillStyle = g; x.fillRect(X, Yy, 512, 256);
      x.strokeStyle = '#fff'; x.lineWidth = 8; x.strokeRect(X + 6, Yy + 6, 500, 244);
      G.arText(x, t1, X + 256, Yy + 100, 56, '#fff', 900);
      G.arText(x, t2, X + 256, Yy + 180, 34, '#ffe082', 700);
    });
    return c;
  };

  M.streetSignAtlas = function () {
    const c = G.canvas(512, 1024), x = c.getContext('2d');
    const names = G.City.namesAlongX.concat(G.City.namesAlongZ);
    names.forEach((n, i) => {
      const Yy = i * 64;
      x.fillStyle = '#1f4e9c'; x.fillRect(0, Yy, 512, 64);
      x.strokeStyle = '#fff'; x.lineWidth = 4; x.strokeRect(6, Yy + 6, 500, 52);
      G.arText(x, n, 256, Yy + 33, 34, '#fff', 800);
    });
    return c;
  };

  M.plateCanvas = function () {
    const c = G.canvas(256, 128), x = c.getContext('2d');
    x.fillStyle = '#f4f4f4'; x.fillRect(0, 0, 256, 128);
    x.fillStyle = '#1d5fbf'; x.fillRect(0, 0, 256, 36);
    G.arText(x, 'مصر', 200, 19, 22, '#fff', 900);
    x.font = `900 18px Arial`; x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('EGYPT', 64, 19);
    x.fillStyle = '#111'; x.fillRect(127, 40, 3, 84);
    G.arText(x, '١٢٣٤', 64, 84, 46, '#111', 900);
    G.arText(x, 'ب ج د', 192, 84, 44, '#111', 900);
    x.strokeStyle = '#111'; x.lineWidth = 4; x.strokeRect(2, 2, 252, 124);
    return c;
  };

  M.signCanvas = function (text, bg, fg, w, h, sub) {
    const c = G.canvas(w || 512, h || 128), x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height);
    x.strokeStyle = fg; x.lineWidth = 6; x.strokeRect(5, 5, c.width - 10, c.height - 10);
    if (sub) {
      G.arText(x, text, c.width / 2, c.height * 0.38, c.height * 0.36, fg, 900);
      G.arText(x, sub, c.width / 2, c.height * 0.75, c.height * 0.2, fg, 700);
    } else G.arText(x, text, c.width / 2, c.height / 2 + 2, c.height * 0.5, fg, 900);
    return c;
  };

  // ================= VEHICLES =================
  const GLASS = '#1b2530';
  M.SEDAN_COLORS = ['#b8b8b8', '#e6e6e6', '#2b2b2b', '#8b0000', '#1f3a5f', '#c9b37e', '#5a5a5a', '#d8d0c0', '#3d5c3a', '#f0f0f0'];

  M.microbusParts = function () {
    const W = '#f3f3ef';
    return [
      G.box(1.9, 0.9, 4.8, 0, 0.78, 0, W),
      G.box(1.86, 0.95, 4.55, 0, 1.68, -0.12, W),
      G.box(1.92, 0.55, 3.55, 0, 1.75, -0.4, GLASS),
      G.box(1.66, 0.62, 0.06, 0, 1.72, 2.17, GLASS),
      G.box(1.6, 0.55, 0.06, 0, 1.76, -2.4, GLASS),
      G.box(1.8, 0.09, 4.4, 0, 2.19, -0.12, '#e3e3df'),
      G.box(1.93, 0.08, 4.83, 0, 1.17, 0, '#e8731a'),
      G.box(1.93, 0.05, 4.83, 0, 1.09, 0, '#2e7d32'),
      G.box(1.93, 0.05, 4.83, 0, 1.02, 0, '#8d5524'),
      G.box(1.4, 0.28, 0.06, 0, 0.78, 2.41, '#262626'),
      G.box(0.32, 0.2, 0.06, 0.72, 0.88, 2.41, '#fff6c8'),
      G.box(0.32, 0.2, 0.06, -0.72, 0.88, 2.41, '#fff6c8'),
      G.box(1.96, 0.2, 0.16, 0, 0.4, 2.42, '#2a2a2a'),
      G.box(1.96, 0.2, 0.16, 0, 0.4, -2.42, '#2a2a2a'),
      G.box(0.18, 0.42, 0.06, 0.82, 1.0, -2.41, '#8a1010'),
      G.box(0.18, 0.42, 0.06, -0.82, 1.0, -2.41, '#8a1010'),
      G.box(0.08, 0.22, 0.14, 1.04, 1.62, 1.95, '#1d1d1d'),
      G.box(0.08, 0.22, 0.14, -1.04, 1.62, 1.95, '#1d1d1d'),
      G.box(0.02, 1.25, 0.04, -0.955, 1.25, 0.9, '#9a9a9a'),
      G.box(0.02, 1.25, 0.04, -0.955, 1.25, -0.6, '#9a9a9a'),
      G.wheel(0.86, 0.37, 1.55, 0.37, 0.26), G.wheel(-0.86, 0.37, 1.55, 0.37, 0.26),
      G.wheel(0.86, 0.37, -1.55, 0.37, 0.26), G.wheel(-0.86, 0.37, -1.55, 0.37, 0.26),
    ];
  };

  M.sedanParts = function (color, taxi) {
    const p = [
      G.box(1.76, 0.62, 4.3, 0, 0.62, 0, color),
      G.box(1.6, 0.55, 2.2, 0, 1.2, -0.25, GLASS),
      G.box(1.56, 0.07, 1.9, 0, 1.5, -0.3, color),
      G.box(1.62, 0.12, 0.08, 0, 1.0, 1.0, color),
      G.box(1.8, 0.16, 0.14, 0, 0.38, 2.16, '#2a2a2a'),
      G.box(1.8, 0.16, 0.14, 0, 0.38, -2.16, '#2a2a2a'),
      G.box(0.32, 0.14, 0.05, 0.62, 0.75, 2.16, '#fff6c8'), G.box(0.32, 0.14, 0.05, -0.62, 0.75, 2.16, '#fff6c8'),
      G.box(0.35, 0.14, 0.05, 0.62, 0.78, -2.16, '#a01515'), G.box(0.35, 0.14, 0.05, -0.62, 0.78, -2.16, '#a01515'),
      G.wheel(0.8, 0.33, 1.35, 0.33, 0.24), G.wheel(-0.8, 0.33, 1.35, 0.33, 0.24),
      G.wheel(0.8, 0.33, -1.35, 0.33, 0.24), G.wheel(-0.8, 0.33, -1.35, 0.33, 0.24),
    ];
    if (taxi) {
      p.push(G.box(1.78, 0.14, 4.32, 0, 0.72, 0, '#111'));
      for (let k = -9; k <= 9; k++) p.push(G.box(1.79, 0.07, 0.2, 0, k % 2 ? 0.69 : 0.75, k * 0.22, '#fafafa'));
      p.push(G.box(0.5, 0.18, 0.25, 0, 1.63, -0.3, '#fafafa'));
    }
    return p;
  };

  M.tuktukParts = function (color) {
    return [
      G.box(1.3, 0.85, 1.9, 0, 0.85, -0.25, color),
      G.box(0.75, 0.75, 0.7, 0, 0.75, 0.95, color),
      G.box(1.36, 0.07, 2.5, 0, 1.95, -0.1, '#1e1e1e'),
      G.box(0.05, 0.75, 0.05, 0.6, 1.55, 1.05, '#222'), G.box(0.05, 0.75, 0.05, -0.6, 1.55, 1.05, '#222'),
      G.box(1.2, 0.5, 0.05, 0, 1.55, 1.1, GLASS),
      G.box(1.3, 0.7, 0.05, 0, 1.55, -1.2, '#1e1e1e'),
      G.box(1.0, 0.12, 0.05, 0, 1.0, -1.21, '#ffd600'),
      G.wheel(0, 0.28, 1.15, 0.28, 0.16), G.wheel(0.62, 0.28, -0.85, 0.28, 0.18), G.wheel(-0.62, 0.28, -0.85, 0.28, 0.18),
    ];
  };

  M.busParts = function () {
    const p = [
      G.box(2.5, 2.3, 10.5, 0, 1.6, 0, '#eeeeee'),
      G.box(2.52, 0.5, 10.52, 0, 1.0, 0, '#c62828'),
      G.box(2.54, 0.85, 8.6, 0, 2.15, -0.6, GLASS),
      G.box(2.2, 1.0, 0.06, 0, 2.05, 5.26, GLASS),
      G.box(2.4, 0.06, 0.06, 0, 2.9, 5.26, '#ff9800'),
      G.box(2.4, 0.08, 10.2, 0, 2.8, 0, '#dddddd'),
      G.wheel(1.15, 0.5, 3.6, 0.5, 0.3), G.wheel(-1.15, 0.5, 3.6, 0.5, 0.3),
      G.wheel(1.15, 0.5, -3.4, 0.5, 0.3), G.wheel(-1.15, 0.5, -3.4, 0.5, 0.3),
    ];
    return p;
  };

  M.pickupParts = function (color) {
    const p = [
      G.box(1.8, 0.65, 4.6, 0, 0.7, 0, color),
      G.box(1.7, 0.75, 1.5, 0, 1.4, 1.2, color),
      G.box(1.72, 0.45, 1.4, 0, 1.45, 1.2, GLASS),
      G.box(1.8, 0.4, 0.06, 0, 1.2, -2.3, color),
      G.wheel(0.82, 0.36, 1.5, 0.36, 0.26), G.wheel(-0.82, 0.36, 1.5, 0.36, 0.26),
      G.wheel(0.82, 0.36, -1.5, 0.36, 0.26), G.wheel(-0.82, 0.36, -1.5, 0.36, 0.26),
    ];
    const crate = ['#43a047', '#e53935', '#fb8c00'];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) p.push(G.box(0.7, 0.45, 0.7, -0.4 + j * 0.8, 1.25, -1.8 + i * 0.85, G.pick(crate)));
    return p;
  };

  M.policeParts = function () {
    const p = M.sedanParts('#f5f5f5');
    p.push(G.box(1.78, 0.22, 4.32, 0, 0.62, 0, '#0d2a5c'));
    p.push(G.box(1.1, 0.12, 0.3, 0, 1.6, -0.3, '#333'));
    return p;
  };

  // returns { mesh, len, wid, maxSpeed, type }
  M.vehicle = function (type, opts) {
    if (G.Vehicles) {
      // detailed vehicles; the body group tilts, wheels spin inside it
      const SPEED = { microbus: 15, taxi: 15, tuktuk: 9, bus: 11, pickup: 13, police: 15 };
      // the player's microbus keeps separate parts; traffic bodies are baked into a few meshes
      const vb = opts && opts.player ? Object.assign(G.Vehicles.microbus(), { blinkF: [0.82, 0.74, 2.53], blinkR: [0.83, 0.71, -2.53] }) : G.Vehicles.make(type);
      if (opts && opts.player) G.Vehicles.bake(vb.root); // body merged, wheels stay separate to spin
      if (vb.real) { vb.blinkF = [0.8, 0.72, 2.41]; vb.blinkR = [0.83, 0.82, -2.42]; }
      const group = new THREE.Group();
      group.add(vb.root);
      if (!Mat.blink) Mat.blink = new THREE.MeshBasicMaterial({ color: 0xffa000 });
      const blink = { L: [], R: [] };
      [[1, 'L'], [-1, 'R']].forEach(([sx, side]) => [vb.blinkF, vb.blinkR].forEach(([x, y, z]) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.08, 0.02), Mat.blink);
        m.position.set(sx * x, y, z);
        m.visible = false;
        vb.root.add(m);
        blink[side].push(m);
      }));
      const len = vb.len || 4.8, wid = vb.wid || 1.9;
      return { mesh: group, body: vb.root, len, wid, maxSpeed: SPEED[type] || 16, type, blink, wheels: vb.wheels, real: vb.real };
    }
    let parts, len, wid, maxSpeed;
    switch (type) {
      case 'microbus': parts = M.microbusParts(); len = 4.8; wid = 1.9; maxSpeed = 15; break;
      case 'taxi': parts = M.sedanParts('#f5f5f5', true); len = 4.3; wid = 1.76; maxSpeed = 15; break;
      case 'tuktuk': parts = M.tuktukParts(G.pick(['#c62828', '#1565c0', '#2e7d32', '#6a1b9a'])); len = 2.7; wid = 1.3; maxSpeed = 9; break;
      case 'bus': parts = M.busParts(); len = 10.6; wid = 2.5; maxSpeed = 11; break;
      case 'pickup': parts = M.pickupParts(G.pick(['#1565c0', '#eeeeee', '#9e9e9e'])); len = 4.6; wid = 1.8; maxSpeed = 13; break;
      case 'police': parts = M.policeParts(); len = 4.3; wid = 1.76; maxSpeed = 15; break;
      default: parts = M.sedanParts(G.pick(M.SEDAN_COLORS)); len = 4.3; wid = 1.76; maxSpeed = 16;
    }
    const group = new THREE.Group();
    const body = new THREE.Mesh(G.merge(parts), Mat.car);
    body.castShadow = true;
    group.add(body);
    // turn signals at the four corners (left is +x when facing +z)
    if (!Mat.blink) Mat.blink = new THREE.MeshBasicMaterial({ color: 0xffa000 });
    const blink = { L: [], R: [] };
    [[1, 'L'], [-1, 'R']].forEach(([sx, side]) => [1, -1].forEach((sz) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.05), Mat.blink);
      m.position.set(sx * (wid / 2 - 0.12), type === 'bus' ? 1.0 : 0.72, sz * (len / 2 + 0.02));
      m.visible = false;
      group.add(m);
      blink[side].push(m);
    }));
    return { mesh: group, body, len, wid, maxSpeed, type, blink };
  };

  // ================= PEOPLE =================
  const matCache = {};
  M.mat = (color) => matCache[color] || (matCache[color] = Object.assign(new THREE.MeshStandardMaterial({ color: new THREE.Color(color).convertSRGBToLinear(), roughness: 0.85 }), { userData: { linear: true } }));
  let geo = null;
  const initPersonGeo = () => {
    geo = {
      leg: new THREE.BoxGeometry(0.15, 0.88, 0.17).translate(0, -0.44, 0),
      arm: new THREE.BoxGeometry(0.11, 0.62, 0.12).translate(0, -0.31, 0),
      torso: new THREE.BoxGeometry(0.46, 0.62, 0.26),
      head: new THREE.SphereGeometry(0.13, 10, 8),
      hair: new THREE.SphereGeometry(0.135, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      scarf: new THREE.SphereGeometry(0.16, 10, 8),
      robe: new THREE.CylinderGeometry(0.25, 0.36, 1.2, 10),
      skirt: new THREE.CylinderGeometry(0.22, 0.34, 0.95, 10),
    };
  };
  const SKIN = ['#c68a5a', '#a8724a', '#d9a77c', '#8d5a3b', '#b98258'];
  const SHIRTS = ['#e0e0e0', '#1e88e5', '#43a047', '#fb8c00', '#6d4c41', '#5c6bc0', '#c62828', '#00897b', '#f5f5f5', '#424242'];
  const PANTS = ['#263238', '#37474f', '#3e2723', '#1a237e', '#4e342e', '#212121'];
  const ROBES = ['#f2efe6', '#9e9e9e', '#6d4c41', '#3949ab', '#8d6e63', '#d7ccc8'];
  const SCARVES = ['#ad1457', '#3949ab', '#212121', '#6a1b9a', '#00897b', '#f06292', '#8d6e63', '#ef6c00'];

  // kind: man | galabeya | woman | kid | officer
  M.person = function (kind, opts) {
    if (G.Chars && G.Chars.ready) return G.Chars.make(kind || G.pick(['man', 'man', 'galabeya', 'woman', 'woman', 'kid']), opts);
    if (!geo) initPersonGeo();
    opts = opts || {};
    kind = kind || G.pick(['man', 'man', 'galabeya', 'woman', 'woman', 'kid']);
    const root = new THREE.Group();
    const skin = M.mat(G.pick(SKIN));
    let shirt = M.mat(opts.shirt || G.pick(SHIRTS));
    let pants = M.mat(G.pick(PANTS));
    if (kind === 'officer') { shirt = M.mat('#f5f5f5'); pants = M.mat('#111'); }
    const legL = new THREE.Mesh(geo.leg, pants), legR = new THREE.Mesh(geo.leg, pants);
    legL.position.set(0.11, 0.9, 0); legR.position.set(-0.11, 0.9, 0);
    const armL = new THREE.Mesh(geo.arm, kind === 'galabeya' ? M.mat(opts.robe || '#eee') : shirt);
    const armR = new THREE.Mesh(geo.arm, armL.material);
    armL.position.set(0.3, 1.47, 0); armR.position.set(-0.3, 1.47, 0);
    const torso = new THREE.Mesh(geo.torso, shirt);
    torso.position.y = 1.2;
    const head = new THREE.Mesh(geo.head, skin);
    head.position.y = 1.66;
    root.add(legL, legR, armL, armR, torso, head);
    if (kind === 'galabeya') {
      const robeMat = M.mat(opts.robe || G.pick(ROBES));
      torso.material = robeMat; armL.material = armR.material = robeMat;
      const robe = new THREE.Mesh(geo.robe, robeMat);
      robe.position.y = 0.72;
      root.add(robe);
      const cap = new THREE.Mesh(geo.hair, M.mat(G.chance(0.5) ? '#f5f5f5' : '#5d4037'));
      cap.position.y = 1.69; root.add(cap);
    } else if (kind === 'woman') {
      const sc = M.mat(G.pick(SCARVES));
      const scarf = new THREE.Mesh(geo.scarf, sc);
      scarf.position.set(0, 1.68, -0.04);
      root.add(scarf);
      if (G.chance(0.7)) {
        const skirt = new THREE.Mesh(geo.skirt, M.mat(G.pick(PANTS.concat(['#5d4037', '#283593']))));
        skirt.position.y = 0.5;
        root.add(skirt);
      }
    } else {
      const hair = new THREE.Mesh(geo.hair, M.mat(kind === 'officer' ? '#111' : G.pick(['#1b1b1b', '#3e2723', '#555'])));
      hair.position.y = 1.68; root.add(hair);
    }
    if (kind === 'kid') root.scale.setScalar(0.66);
    root.userData = { legL, legR, armL, armR, torso, phase: Math.random() * 6, kind };
    return root;
  };

  // walk / idle / fight / sit animation
  M.animPerson = function (p, mode, dt, speed) {
    const u = p.userData;
    if (u.real) { G.Chars.anim(p, mode, dt, speed); return; }
    if (mode === 'walk') {
      u.phase += dt * (speed || 1.4) * 5;
      const s = Math.sin(u.phase) * 0.6;
      u.legL.rotation.x = s; u.legR.rotation.x = -s;
      u.armL.rotation.x = -s * 0.8; u.armR.rotation.x = s * 0.8;
      u.armL.rotation.z = u.armR.rotation.z = 0;
    } else if (mode === 'fight') {
      u.phase += dt * 14;
      u.legL.rotation.x = u.legR.rotation.x = 0;
      u.armL.rotation.x = -1.6 + Math.sin(u.phase) * 0.7;
      u.armR.rotation.x = -1.2 + Math.sin(u.phase * 1.3 + 1) * 0.9;
      u.torso.rotation.z = Math.sin(u.phase * 0.7) * 0.08;
    } else if (mode === 'wave') {
      u.phase += dt * 8;
      u.armR.rotation.x = -2.6;
      u.armR.rotation.z = Math.sin(u.phase) * 0.4;
      u.armL.rotation.x = 0;
    } else if (mode === 'sit') {
      u.legL.rotation.x = u.legR.rotation.x = -1.45;
      u.armL.rotation.x = u.armR.rotation.x = -0.6;
    } else {
      u.phase += dt;
      u.legL.rotation.x = u.legR.rotation.x = 0;
      u.armL.rotation.x = Math.sin(u.phase) * 0.05; u.armR.rotation.x = -Math.sin(u.phase) * 0.05;
      u.armR.rotation.z = 0;
      u.torso.rotation.z = 0;
    }
  };

  // white plastic coffee-shop chair (seat at 0.45 m)
  M.chair = function () {
    if (!M._chair) {
      const parts = [G.box(0.44, 0.04, 0.42, 0, 0.45, 0, '#eeeeea'), G.box(0.44, 0.42, 0.04, 0, 0.68, -0.2, '#eeeeea')];
      [[-0.19, -0.18], [0.19, -0.18], [-0.19, 0.18], [0.19, 0.18]].forEach(([x, z]) => parts.push(G.box(0.035, 0.45, 0.035, x, 0.225, z, '#e2e2dc')));
      M._chair = G.merge(parts);
    }
    const m = new THREE.Mesh(M._chair, G.Mat.vc);
    m.castShadow = true;
    return m;
  };

  M.cart = function (v) {
    const parts = [
      G.box(1.0, 0.7, 1.7, 0, 0.75, 0, v.color),
      G.box(1.06, 0.08, 1.76, 0, 1.12, 0, '#5d4037'),
      G.wheel(0.55, 0.32, 0.2, 0.32, 0.08), G.wheel(-0.55, 0.32, 0.2, 0.32, 0.08),
      G.box(0.05, 0.05, 0.8, 0.3, 0.75, 1.2, '#5d4037'), G.box(0.05, 0.05, 0.8, -0.3, 0.75, 1.2, '#5d4037'),
    ];
    if (v.umb) {
      parts.push(G.cyl(0.03, 0.03, 1.6, 6, 0, 1.9, 0, '#444'));
      const u = new THREE.ConeGeometry(1.2, 0.5, 10);
      u.translate(0, 2.8, 0);
      parts.push(G.colorize(u, v.umb));
    }
    if (v.type === 'عرقسوس') parts.push(G.cyl(0.25, 0.3, 0.6, 10, 0, 1.45, 0, '#b08d57'));
    if (v.type === 'بطاطا' || v.type === 'درة مشوي') parts.push(G.cyl(0.08, 0.08, 0.8, 6, 0.3, 1.6, -0.6, '#222'));
    const mesh = new THREE.Mesh(G.merge(parts), Mat.vc);
    mesh.castShadow = true;
    const g = new THREE.Group();
    g.add(mesh);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.3), new THREE.MeshLambertMaterial({ map: G.tex(M.signCanvas(v.type, '#fff8e1', '#b71c1c', 256, 80)) }));
    sign.position.set(0, 0.85, 0.87);
    g.add(sign);
    const back = sign.clone(); back.rotation.y = Math.PI; back.position.z = -0.87; g.add(back);
    return g;
  };
})(window.G);
