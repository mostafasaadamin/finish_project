'use strict';
// Loads the downloaded real-world assets (photo textures, HDR sky, recorded sounds) listed in
// assets/credits.json. Everything is optional: if a file is missing the game keeps its procedural look/sound.
(function (G) {
  const A = (G.Assets = { credits: null, img: {}, ok: false });
  const BASE = 'assets/';

  A.load = async function (onStatus) {
    try {
      const r = await fetch(BASE + 'credits.json', { cache: 'no-cache' });
      if (!r.ok) throw new Error('no credits');
      A.credits = await r.json();
      A.ok = true;
    } catch (e) {
      A.credits = { sounds: [], textures: [], hdri: [] };
      return false;
    }
    // preload the texture sets the city uses
    const want = {};
    Object.values(A.PICK).forEach((list) => {
      const d = A.firstDir(list);
      if (d) want[d] = true;
    });
    const jobs = [];
    Object.keys(want).forEach((dir) => ['Color', 'NormalGL', 'Roughness'].forEach((k) => jobs.push(A.loadImage(dir, k))));
    let done = 0;
    await Promise.all(jobs.map((p) => p.then(() => { done++; if (onStatus) onStatus(done, jobs.length); })));
    return true;
  };

  // candidate texture folders per surface, best first
  A.PICK = {
    asphalt: ['ph_asphalt_02', 'acg_Asphalt031'],
    sidewalk: ['acg_Tiles143', 'acg_Tiles139'],
    plaster: ['ph_beige_wall_001', 'ph_white_plaster_02'],
    plaster2: ['acg_PaintedPlaster006', 'ph_painted_plaster_wall'],   // peeling paint
    plaster3: ['acg_Plaster007', 'ph_white_plaster_02'],              // dirty, stained
    concrete: ['acg_Concrete034', 'ph_concrete_floor_worn_001'],
    sand: ['acg_Ground110', 'ph_coast_sand_rocks_02'],
    shutter: ['ph_weathered_brown_planks'],
    metal: ['ph_rusty_metal_02', 'ph_green_metal_rust'],
  };

  A.dirs = () => (A.credits ? A.credits.textures.map((t) => t.dir) : []);
  A.firstDir = (list) => list.find((d) => A.dirs().includes(d)) || null;

  // ambientCG files are named "1K-JPG_Color.jpg", Poly Haven ones "Color.jpg"
  A.path = (dir, kind) => BASE + 'textures/' + dir + '/' + (dir.startsWith('acg_') ? '1K-JPG_' : '') + kind + '.jpg';

  A.loadImage = function (dir, kind) {
    const key = dir + '/' + kind;
    if (A.img[key] !== undefined) return Promise.resolve(A.img[key]);
    return new Promise((res) => {
      const im = new Image();
      im.onload = () => { A.img[key] = im; res(im); };
      im.onerror = () => { A.img[key] = null; res(null); };
      im.src = A.path(dir, kind);
    });
  };

  // the loaded image for a surface (e.g. 'asphalt', 'Color'), or null
  A.image = (surface, kind) => {
    const d = A.firstDir(A.PICK[surface] || []);
    return d ? A.img[d + '/' + (kind || 'Color')] || null : null;
  };

  // repeat-wrapped THREE texture straight from a photo
  A.texture = (surface, kind, repeat) => {
    const im = A.image(surface, kind);
    if (!im) return null;
    const t = new THREE.Texture(im);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if ((kind || 'Color') === 'Color') t.encoding = THREE.sRGBEncoding;
    if (repeat) t.repeat.set(repeat, repeat);
    t.needsUpdate = true;
    return t;
  };

  // tile a photo across a canvas region (used to compose road/facade textures)
  A.tileInto = (ctx, im, x, y, w, h, tile) => {
    if (!im) return false;
    for (let ty = y; ty < y + h; ty += tile) for (let tx = x; tx < x + w; tx += tile) ctx.drawImage(im, tx, ty, tile, tile);
    return true;
  };

  // a daytime sky (skip night / moonless HDRIs)
  A.hdri = () => {
    const list = (A.credits && A.credits.hdri) || [];
    const day = list.filter((h) => !/night|moon|dusk|sunset/i.test(h.id));
    const pick = day.find((h) => /partly_cloudy|clear_puresky/.test(h.id)) || day[0];
    return pick ? BASE + pick.file : null;
  };
  A.sounds = () => (A.credits ? A.credits.sounds : []);
})(window.G);
