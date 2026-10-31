// Service worker : garde l'interface en cache pour un démarrage instantané,
// reçoit les notifications push et tient la pastille de l'icône à jour.
// Les données (/api) et les médias Metricool passent toujours par le réseau.
const CACHE = "gacolet-v3";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})); self.skipWaiting(); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== "gc-badge").map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin || u.pathname.startsWith("/api") || u.pathname.startsWith("/agence") || u.pathname.startsWith("/f/")) return;
  const fallback = u.pathname.startsWith("/gestion") ? () => caches.match(e.request) : () => caches.match(e.request).then(r => r || caches.match("/"));
  e.respondWith(fetch(e.request).then(r => { if (r.ok){ const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); } return r; }).catch(fallback));
});

// Pastille : un compteur partagé avec la page (qui le remet au bon chiffre quand on l'ouvre)
const BADGE = "/__badge";
async function getBadge(){ try { const r = await (await caches.open("gc-badge")).match(BADGE); return r ? Number(await r.text()) || 0 : 0; } catch(e){ return 0; } }
async function setBadge(n){ try { await (await caches.open("gc-badge")).put(BADGE, new Response(String(n))); } catch(e){} try { if (n > 0 && self.navigator.setAppBadge) await self.navigator.setAppBadge(n); } catch(e){} }

self.addEventListener("push", e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch(x){ d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil((async () => {
    const n = (await getBadge()) + 1; await setBadge(n);
    await self.registration.showNotification(d.title || "Agence Gacolet", {
      body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag, icon: "/icon-v4-512.png", badge: "/icon-192.png",
      data: { url: d.url || "/gestion", ch: d.ch || "" }, timestamp: Date.now(),
    });
  })());
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const data = e.notification.data || {}, url = data.url || "/gestion";
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const w = wins.find(c => new URL(c.url).pathname.startsWith(url.split("#")[0]));
    if (w){ await w.focus(); w.postMessage({ type: "open-chat", ch: data.ch || "" }); return; }
    await self.clients.openWindow(url + (data.ch ? (url.includes("#") ? "" : "#messagerie") : ""));
  })());
});
self.addEventListener("message", e => { if (e.data && e.data.type === "badge") e.waitUntil(caches.open("gc-badge").then(c => c.put(BADGE, new Response(String(Number(e.data.n) || 0)))).catch(() => {})); });
