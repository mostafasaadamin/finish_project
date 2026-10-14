'use strict';
// In-app voice studio: record every line of the game with real voices, stored on the device.
(function (G) {
  const $ = (id) => document.getElementById(id);
  const LINES = G.allLines();
  const WHO_ORDER = Object.keys(G.SPK);
  const groups = {};
  LINES.forEach((l) => (groups[l.who] = groups[l.who] || []).push(l));
  const whos = WHO_ORDER.filter((w) => groups[w]);
  let have = new Set(), tab = whos[0], sel = null, rec = null, chunks = [], stream = null, analyser = null;

  async function refresh() {
    have = new Set(await G.VoiceStore.ids());
    $('prog').textContent = `متسجّل ${G.arDigits(LINES.filter((l) => have.has(l.id)).length)} من ${G.arDigits(LINES.length)} جملة`;
    renderTabs();
    renderList();
  }

  function renderTabs() {
    const nav = $('tabs');
    nav.textContent = '';
    whos.forEach((w) => {
      const b = document.createElement('button');
      b.className = 'tab' + (w === tab ? ' on' : '');
      const done = groups[w].filter((l) => have.has(l.id)).length;
      b.textContent = G.SPK[w].name;
      const n = document.createElement('b');
      n.textContent = `${G.arDigits(done)}/${G.arDigits(groups[w].length)}`;
      b.appendChild(n);
      b.onclick = () => { tab = w; select(groups[w].find((l) => !have.has(l.id)) || groups[w][0]); refresh(); };
      nav.appendChild(b);
    });
  }

  function renderList() {
    const list = $('list');
    list.textContent = '';
    groups[tab].forEach((l) => {
      const b = document.createElement('button');
      b.className = 'row' + (have.has(l.id) ? ' done' : '') + (sel === l ? ' sel' : '');
      b.setAttribute('role', 'listitem');
      const st = document.createElement('span');
      st.className = 'st';
      st.textContent = have.has(l.id) ? '✓' : '○';
      const t = document.createElement('span');
      t.textContent = l.text;
      b.append(st, t);
      b.onclick = () => { select(l); renderList(); };
      list.appendChild(b);
    });
  }

  function select(l) {
    sel = l;
    $('who').textContent = G.SPK[l.who].name;
    $('line').textContent = l.text;
    $('err').textContent = '';
  }

  const mime = () => ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';

  async function start() {
    try {
      if (!stream) {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        analyser = ctx.createAnalyser();
        ctx.createMediaStreamSource(stream).connect(analyser);
        meter();
      }
    } catch (e) {
      $('err').textContent = 'محتاج إذن المايك عشان تسجّل. اسمح للتطبيق باستخدام الميكروفون من الإعدادات وجرّب تاني.';
      return;
    }
    chunks = [];
    const m = mime();
    rec = new MediaRecorder(stream, m ? { mimeType: m } : undefined);
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = async () => {
      const blob = new Blob(chunks, { type: rec.mimeType || m || 'audio/webm' });
      const line = sel;
      await G.VoiceStore.put(line.id, blob);
      await refresh();
      // move on to the next line that still needs a voice
      const next = groups[tab].find((l) => !have.has(l.id));
      if (next) select(next);
      renderList();
    };
    rec.start();
    $('recBtn').classList.add('live');
    $('recBtn').textContent = 'وقّف';
  }

  function stop() {
    if (rec && rec.state === 'recording') rec.stop();
    $('recBtn').classList.remove('live');
    $('recBtn').textContent = 'سجّل';
  }

  function meter() {
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128));
      $('meter').firstElementChild.style.width = Math.min(100, (peak / 128) * 160) + '%';
      requestAnimationFrame(tick);
    };
    tick();
  }

  $('recBtn').onclick = () => (rec && rec.state === 'recording' ? stop() : start());
  $('playBtn').onclick = async () => {
    const b = sel && (await G.VoiceStore.get(sel.id));
    if (!b) { $('err').textContent = 'الجملة دي لسه متسجّلتش.'; return; }
    new Audio(URL.createObjectURL(b)).play();
  };
  $('delBtn').onclick = async () => { if (sel) { await G.VoiceStore.del(sel.id); refresh(); } };
  $('nextBtn').onclick = () => {
    const arr = groups[tab], i = arr.indexOf(sel);
    select(arr[(i + 1) % arr.length]);
    renderList();
  };

  // ---------- ZIP export (stored, no compression) ----------
  const CRC = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(), parts = [], central = [];
    let off = 0;
    files.forEach(({ name, data }) => {
      const nm = enc.encode(name), crc = crc32(data);
      const h = new DataView(new ArrayBuffer(30));
      h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint32(14, crc, true);
      h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nm.length, true);
      parts.push(new Uint8Array(h.buffer), nm, data);
      const c = new DataView(new ArrayBuffer(46));
      c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint32(16, crc, true);
      c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
      central.push(new Uint8Array(c.buffer), nm);
      off += 30 + nm.length + data.length;
    });
    const csize = central.reduce((s, p) => s + p.length, 0);
    const e = new DataView(new ArrayBuffer(22));
    e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true);
    e.setUint32(12, csize, true); e.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(e.buffer)], { type: 'application/zip' });
  }
  $('exportBtn').onclick = async () => {
    const ids = await G.VoiceStore.ids();
    if (!ids.length) { $('err').textContent = 'مفيش تسجيلات لسه.'; return; }
    const files = [];
    for (const id of ids) {
      const b = await G.VoiceStore.get(id);
      const ext = /mp4|aac/.test(b.type) ? 'm4a' : /ogg/.test(b.type) ? 'ogg' : 'webm';
      files.push({ name: `${id}.${ext}`, data: new Uint8Array(await b.arrayBuffer()) });
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(zip(files));
    a.download = 'cairo_microbus_voices.zip';
    a.click();
    $('err').textContent = 'ابعت الملف ده عشان يتحط في اللعبة لكل الناس (assets/voices).';
  };

  select(groups[tab][0]);
  refresh();
})(window.G);
