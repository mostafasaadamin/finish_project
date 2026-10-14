'use strict';
// Speech: only real recorded voices (assets/voices/<line id>.*). Lines without a recording
// are shown as subtitles and speech bubbles. No synthetic / text-to-speech voices.
(function (G) {
  const V = (G.Voice = { enabled: true, queue: [], current: null, bubbles: [], files: {}, buffers: {}, voiceLabel: '' });

  V.init = async function () {
    try {
      const r = await fetch('assets/voices/index.json', { cache: 'no-cache' });
      if (r.ok) V.files = (await r.json()).files || {};
    } catch (e) { /* no recordings yet */ }
    // recordings made on this device in the studio
    V.local = new Set(G.VoiceStore ? await G.VoiceStore.ids() : []);
    const n = new Set(Object.keys(V.files).concat([...V.local])).size;
    V.voiceLabel = n ? `أصوات متسجّلة: ${n} جملة` : 'لسه مفيش أصوات متسجّلة – الكلام بيظهر ترجمة بس';
    if (G.HUD) G.HUD.voiceStatus();
  };

  V.hasRecording = (text) => { const id = G.lineId(text); return !!(V.files[id] || (V.local && V.local.has(id))); };

  // decode (and cache) the recording of a line
  V.buffer = function (text) {
    const id = G.lineId(text), f = V.files[id], local = V.local && V.local.has(id);
    if ((!f && !local) || !G.Audio.ctx) return Promise.resolve(null);
    if (!V.buffers[id]) {
      // the player's own recording wins over the bundled one
      const bytes = local ? G.VoiceStore.get(id).then((b) => b.arrayBuffer()) : fetch('assets/voices/' + f).then((r) => r.arrayBuffer());
      V.buffers[id] = bytes
        .then((b) => new Promise((res, rej) => G.Audio.ctx.decodeAudioData(b, res, rej))).catch(() => null);
    }
    return V.buffers[id];
  };

  // anchor: THREE.Object3D, Vector3 or null (inside the microbus)
  V.say = function (who, text, anchor, prio, onEnd) {
    const item = { who, text, anchor, prio: prio || 0, onEnd, t: performance.now() };
    if (item.prio === 0) {
      // ambient chatter: don't build up a backlog
      if (V.queue.length > 2) { V.bubble(item, 2600); V.subtitle(item); return; }
    }
    if (V.queue.length > 10) V.queue = V.queue.filter((q) => q.prio > 0);
    V.queue.push(item);
    if (V.current && V.current.prio === 0 && item.prio >= 2) V.stopCurrent();
    V.pump();
  };

  // lines: [[who, text], ...]; anchors: {who: anchor} ; vars replaces {dest}
  V.conversation = function (lines, anchors, prio, vars, onDone) {
    let i = 0, stopped = false;
    const next = () => {
      if (stopped) return;
      if (i >= lines.length) { if (onDone) onDone(); return; }
      const [who, raw] = lines[i++];
      const text = V.fill(raw, vars);
      const anchor = anchors ? (anchors[who] !== undefined ? anchors[who] : anchors._default) : null;
      V.say(who, text, anchor, prio == null ? 1 : prio, () => setTimeout(next, 120));
    };
    next();
    return { stop: () => { stopped = true; } };
  };

  V.fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)) : s);

  V.stopCurrent = function () {
    if (V.current && V.current.src) { try { V.current.src.stop(); } catch (e) { /* already stopped */ } }
  };

  V.pump = function () {
    if (V.current || !V.queue.length) return;
    // highest priority first, FIFO within a priority; drop stale ambient lines
    const now = performance.now();
    V.queue = V.queue.filter((q) => q.prio > 0 || now - q.t < 6000);
    if (!V.queue.length) return;
    let best = 0;
    for (let i = 1; i < V.queue.length; i++) if (V.queue[i].prio > V.queue[best].prio) best = i;
    const item = V.queue.splice(best, 1)[0];
    V.current = item;
    V.play(item);
  };

  V.play = function (item) {
    const spk = G.SPK[item.who] || G.SPK.passenger;
    const est = 700 + item.text.length * 75 / (spk.rate || 1);
    V.subtitle(item);
    V.bubble(item, est + 600);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(fallback);
      V.current = null;
      if (item.onEnd) item.onEnd();
      setTimeout(V.pump, 80);
    };
    let fallback = setTimeout(finish, est + 300);

    if (!V.enabled || !V.hasRecording(item.text)) return;
    clearTimeout(fallback);
    fallback = setTimeout(finish, est + 4000); // until the recording is decoded
    const pos = item.anchor ? (item.anchor.isObject3D ? item.anchor.getWorldPosition(new THREE.Vector3()) : item.anchor) : null;
    V.buffer(item.text).then((buf) => {
      if (!buf || done) return;
      const dest = G.Audio.spatial(pos, 80, 1);
      if (!dest) return;
      const src = G.Audio.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(dest);
      src.onended = finish;
      item.src = src;
      clearTimeout(fallback);
      fallback = setTimeout(finish, buf.duration * 1000 + 1500);
      src.start();
    });
  };

  V.subtitle = function (item) {
    const el = document.getElementById('subs');
    if (!el) return;
    const spk = G.SPK[item.who] || G.SPK.passenger;
    const line = document.createElement('div');
    line.className = 'sub';
    line.innerHTML = `<b style="color:${spk.color}">${spk.name}:</b> `;
    line.appendChild(document.createTextNode(item.text));
    el.appendChild(line);
    while (el.children.length > 3) el.removeChild(el.firstChild);
    setTimeout(() => line.classList.add('old'), 6000);
    setTimeout(() => line.remove(), 9000);
  };

  V.bubble = function (item, ms) {
    if (!item.anchor) return;
    const layer = document.getElementById('bubbles');
    if (!layer) return;
    const spk = G.SPK[item.who] || G.SPK.passenger;
    const el = document.createElement('div');
    el.className = 'bubble';
    el.style.borderColor = spk.color;
    el.textContent = item.text;
    layer.appendChild(el);
    const b = { el, anchor: item.anchor, until: performance.now() + ms };
    V.bubbles.push(b);
  };

  const tmp = new THREE.Vector3();
  V.updateBubbles = function (camera, w, h) {
    const now = performance.now();
    V.bubbles = V.bubbles.filter((b) => {
      if (now > b.until) { b.el.remove(); return false; }
      if (b.anchor.isObject3D) { b.anchor.getWorldPosition(tmp); tmp.y += 2.3; }
      else tmp.set(b.anchor.x, (b.anchor.y || 0) + 2.3, b.anchor.z);
      const d = camera.position.distanceTo(tmp);
      tmp.project(camera);
      if (tmp.z > 1 || d > 90 || Math.abs(tmp.x) > 1.1 || Math.abs(tmp.y) > 1.1) { b.el.style.display = 'none'; return true; }
      b.el.style.display = 'block';
      b.el.style.transform = `translate(-50%,-100%) translate(${((tmp.x + 1) / 2) * w}px,${((1 - tmp.y) / 2) * h}px)`;
      b.el.style.opacity = G.clamp(1.4 - d / 80, 0.35, 1);
      return true;
    });
  };
})(window.G);
