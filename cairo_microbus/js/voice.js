'use strict';
// Speech: browser Arabic text-to-speech (prefers ar-EG voices), subtitles and 3D speech bubbles.
(function (G) {
  const V = (G.Voice = {
    enabled: true, supported: 'speechSynthesis' in window, voices: [], byGender: { m: null, f: null },
    queue: [], current: null, bubbles: [], hasArabic: false, voiceLabel: '',
  });
  const FEMALE = /salma|hoda|zariyah|laila|layla|mariam|maryam|amina|fatima|hala|sana|rana|noura|imane|amal|reem|dalia|zeina|amany|female|woman/i;
  const MALE = /shakir|naayf|hamed|maged|tarik|omar|bassel|hamdan|fahed|saleh|moaz|rami|taim|male|man\b/i;

  // Inside the Android app (Capacitor) the WebView has no speechSynthesis: use the native TTS plugin
  const nativeTTS = () => {
    const C = window.Capacitor;
    return C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.TextToSpeech;
  };

  V.init = function () {
    const tts = nativeTTS();
    if (tts) {
      V.native = tts;
      V.supported = true;
      V.voiceLabel = 'الصوت: نطق أندرويد العربي';
      tts.getSupportedLanguages().then((r) => {
        const langs = (r && r.languages) || [];
        V.nativeLang = langs.find((l) => /^ar[-_]EG/i.test(l)) || langs.find((l) => /^ar/i.test(l)) || null;
        V.hasArabic = !!V.nativeLang;
        if (!V.hasArabic) V.voiceLabel = 'نزّل صوت عربي من إعدادات أندرويد (Text-to-speech) – هتظهر الترجمة بس دلوقتي';
        if (G.HUD) G.HUD.voiceStatus();
      }).catch(() => { V.nativeLang = 'ar-EG'; V.hasArabic = true; });
      return;
    }
    if (!V.supported) { V.voiceLabel = 'المتصفح ده مش بيدعم الصوت'; return; }
    const pick = () => {
      const vs = speechSynthesis.getVoices();
      const ar = vs.filter((v) => /^ar/i.test(v.lang));
      // Egyptian first, then natural/online voices, then any Arabic
      const score = (v) => (/EG/i.test(v.lang) ? 4 : 0) + (/natural|online|neural/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1);
      ar.sort((a, b) => score(b) - score(a));
      V.voices = ar;
      V.hasArabic = ar.length > 0;
      V.byGender.f = ar.find((v) => FEMALE.test(v.name)) || null;
      V.byGender.m = ar.find((v) => MALE.test(v.name)) || ar.find((v) => !FEMALE.test(v.name)) || ar[0] || null;
      if (!V.byGender.f) V.byGender.f = ar[0] || null;
      V.voiceLabel = V.hasArabic
        ? 'الصوت: ' + (V.byGender.m ? V.byGender.m.name : ar[0].name)
        : 'مفيش صوت عربي متسطّب على الجهاز – هتظهر الترجمة بس';
      if (G.HUD) G.HUD.voiceStatus();
    };
    pick();
    speechSynthesis.onvoiceschanged = pick;
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
    let i = 0;
    const next = () => {
      if (i >= lines.length) { if (onDone) onDone(); return; }
      const [who, raw] = lines[i++];
      const text = V.fill(raw, vars);
      const anchor = anchors ? (anchors[who] !== undefined ? anchors[who] : anchors._default) : null;
      V.say(who, text, anchor, prio == null ? 1 : prio, () => setTimeout(next, 120));
    };
    next();
  };

  V.fill = (s, vars) => (vars ? s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m)) : s);

  V.stopCurrent = function () {
    if (V.native) V.native.stop().catch(() => {});
    else if (V.supported) speechSynthesis.cancel();
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

    let vol = 1;
    if (item.anchor && G.Player) {
      const p = item.anchor.isObject3D ? item.anchor.getWorldPosition(new THREE.Vector3()) : item.anchor;
      vol = G.clamp(1.15 - G.dist2(p, G.Player.pos) / 70, 0, 1);
    }
    if (V.enabled && V.native && V.hasArabic && vol > 0.08) {
      clearTimeout(fallback);
      fallback = setTimeout(finish, est * 2.5 + 3000);
      V.native.speak({ text: item.text, lang: V.nativeLang, rate: spk.rate, pitch: G.clamp(spk.pitch, 0.5, 1.8), volume: vol, category: 'playback' })
        .then(finish, finish);
    } else if (V.enabled && V.supported && !V.native && V.hasArabic && vol > 0.08) {
      const u = new SpeechSynthesisUtterance(item.text);
      const voice = V.byGender[spk.g] || V.voices[0];
      u.voice = voice;
      u.lang = voice ? voice.lang : 'ar-EG';
      // if we only have one voice, shift pitch more to tell characters apart
      const sameVoice = V.byGender.m === V.byGender.f;
      u.pitch = G.clamp(sameVoice ? spk.pitch : 1 + (spk.pitch - 1) * 0.4, 0.1, 2);
      u.rate = spk.rate;
      u.volume = vol;
      u.onend = finish;
      u.onerror = finish;
      clearTimeout(fallback);
      fallback = setTimeout(finish, est * 2.5 + 3000);
      speechSynthesis.speak(u);
    }
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
