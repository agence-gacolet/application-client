/* Gacolet Gestion : liaison avec le serveur de l'agence.
   Reprend la forme d'accès aux données de l'ancien gestionnaire (collection, document, abonnement),
   pour que les écrans fonctionnent à l'identique. Synchronisation toutes les 5 secondes. */
(function () {
  "use strict";
  const KEY = "gacolet-gestion-cle";
  const getKey = () => { try { return localStorage.getItem(KEY) || ""; } catch (e) { return ""; } };
  const setKey = k => { try { k ? localStorage.setItem(KEY, k) : localStorage.removeItem(KEY); } catch (e) {} };

  async function call(method, url, body, isForm) {
    const h = { Authorization: "Bearer " + getKey() };
    if (body && !isForm) h["Content-Type"] = "application/json";
    const r = await fetch(url, { method, headers: h, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
    if (r.status === 401) { setKey(""); window.dispatchEvent(new Event("gc-logout")); throw new Error("Connexion requise."); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || "Erreur du serveur.");
    return j;
  }

  /* Copie locale de toutes les collections */
  const cache = {}, subs = {};
  let since = "", timer = 0, running = false;
  const docsOf = c => Object.keys(cache[c] || {}).map(id => ({ id, exists: true, data: () => JSON.parse(JSON.stringify(cache[c][id])) }));
  const emit = c => (subs[c] || []).forEach(s => { try { s.cb({ docs: docsOf(c) }); } catch (e) { console.error(e); } });

  async function sync() {
    if (running) return; running = true;
    try {
      const j = await call("GET", "/api/g/changes" + (since ? "?since=" + encodeURIComponent(since) : ""));
      const touched = new Set();
      if (j.full) Object.keys(subs).forEach(c => { cache[c] = {}; touched.add(c); });
      j.docs.forEach(d => {
        cache[d.col] = cache[d.col] || {};
        const before = JSON.stringify(cache[d.col][d.id] || null);
        if (d.deleted) delete cache[d.col][d.id]; else cache[d.col][d.id] = d.data;
        if (before !== JSON.stringify(cache[d.col][d.id] || null)) touched.add(d.col);
      });
      /* marge de 5 s : aucune écriture faite pendant la lecture n'est perdue */
      since = new Date(Date.parse(j.now) - 5000).toISOString();
      touched.forEach(emit);
      online(true);
    } catch (e) {
      online(false, e);
    } finally { running = false; }
  }
  function online(ok, e) {
    document.documentElement.toggleAttribute("data-offline", !ok);
    if (!ok) Object.values(subs).flat().forEach(s => s.err && s.err(e));
  }
  function start() {
    if (timer) return;
    sync();
    timer = setInterval(() => { if (!document.hidden) sync(); }, 5000);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) sync(); });
    window.addEventListener("focus", sync);
  }

  /* Écriture : mise à jour locale immédiate, puis envoi au serveur */
  function local(c, id, data) { cache[c] = cache[c] || {}; if (data === null) delete cache[c][id]; else cache[c][id] = data; emit(c); }
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

  function collection(c) {
    return {
      onSnapshot(cb, err) {
        (subs[c] = subs[c] || []).push({ cb, err });
        cache[c] = cache[c] || {};
        if (since) cb({ docs: docsOf(c) });
        start();
        return () => { subs[c] = (subs[c] || []).filter(s => s.cb !== cb); };
      },
      doc(id) {
        id = id || newId();
        return {
          id,
          async set(data) { const old = (cache[c] || {})[id]; local(c, id, data); try { await call("PUT", "/api/g/" + c + "/" + encodeURIComponent(id), { data }); } catch (e) { local(c, id, old || null); throw e; } },
          async update(patch) { const old = (cache[c] || {})[id]; local(c, id, Object.assign({}, old || {}, patch)); try { await call("PATCH", "/api/g/" + c + "/" + encodeURIComponent(id), { data: patch }); } catch (e) { local(c, id, old || null); throw e; } },
          async delete() { const old = (cache[c] || {})[id]; local(c, id, null); try { await call("DELETE", "/api/g/" + c + "/" + encodeURIComponent(id)); } catch (e) { if (old) local(c, id, old); throw e; } },
        };
      },
    };
  }

  const assets = {
    async upload(file) {
      const fd = new FormData(); fd.append("file", file, file.name);
      return call("POST", "/api/g-upload", fd, true);
    },
  };
  const user = { isOwner: async () => false, can: async () => true };

  window.GC = {
    loggedIn: () => !!getKey(),
    async login(password) {
      const r = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Connexion impossible.");
      setKey(j.key);
    },
    logout() { setKey(""); location.reload(); },
    sync,
  };
  window.claude = { use: async what => ({ db: { collection }, user, assets })[what] || null };
})();
