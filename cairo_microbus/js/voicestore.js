'use strict';
// Recordings made in the in-app studio (record.html), kept on the device in IndexedDB.
(function (G) {
  const VS = (G.VoiceStore = {});
  let dbp = null;
  const open = () => {
    if (dbp) return dbp;
    dbp = new Promise((res) => {
      try {
        const rq = indexedDB.open('cairo_voices', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('lines');
        rq.onsuccess = () => res(rq.result);
        rq.onerror = () => res(null);
      } catch (e) { res(null); }
    });
    return dbp;
  };
  const tx = async (mode, fn) => {
    const db = await open();
    if (!db) return null;
    return new Promise((res) => {
      const t = db.transaction('lines', mode);
      const r = fn(t.objectStore('lines'));
      t.oncomplete = () => res(r && 'result' in r ? r.result : true);
      t.onerror = () => res(null);
    });
  };
  VS.put = (id, blob) => tx('readwrite', (s) => s.put(blob, id));
  VS.get = (id) => tx('readonly', (s) => s.get(id));
  VS.del = (id) => tx('readwrite', (s) => s.delete(id));
  VS.ids = async () => (await tx('readonly', (s) => s.getAllKeys())) || [];
})(window.G);
