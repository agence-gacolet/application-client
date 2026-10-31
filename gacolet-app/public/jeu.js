/* Hameau Gacolet : le jeu de l'agence, façon Warcraft.
   Les tâches de chacun deviennent des quêtes données par les clients ; les rendre valide la tâche dans l'application.
   Commandes comme dans Warcraft : ZQSD ou WASD, souris (clic gauche maintenu : caméra, clic droit maintenu : caméra et personnage), etc. */
(function () {
"use strict";
const $ = s => document.querySelector(s);
const el = (t, c, x) => { const e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
const KEY = localStorage.getItem("gacolet-gestion-cle") || "";
const AV = ["#C6FF33","#5AC8FA","#FF9F5A","#C49BFF","#4CD9A0","#FF6B8B","#F5D04C","#7AA7FF"];
const avColor = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV[h % AV.length]; };
const initials = s => { const w = String(s || "?").trim().split(/\s+/); return ((w[0] || "?")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase(); };
const today = () => new Date().toISOString().slice(0, 10);
const fmtD = d => { if (!/^\d{4}-\d{2}-\d{2}/.test(d || "")) return ""; const x = new Date(d + "T12:00:00"); return x.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }); };
async function api(method, url, body) {
  const r = await fetch(url, { method, headers: Object.assign({ Authorization: "Bearer " + KEY }, body ? { "Content-Type": "application/json" } : {}), body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.error || "Erreur"), { status: r.status });
  return j;
}

/* ---------- Accès : ordinateur uniquement ---------- */
function gate(msg) { $("#loading").hidden = true; $("#gate").hidden = false; $("#gate-tx").textContent = msg; }
const touchOnly = matchMedia("(pointer:coarse)").matches && !matchMedia("(pointer:fine)").matches;
if (touchOnly || innerWidth < 900) return gate("Le Hameau se joue sur ordinateur, au clavier et à la souris, comme Warcraft.");
if (!KEY) return gate("Connecte-toi d’abord à l’application, puis reviens ici.");
if (!window.THREE) return gate("Le moteur 3D n’a pas pu se charger. Vérifie ta connexion puis recharge la page.");

/* ---------- État ---------- */
const G = { me: null, quests: [], mail: [], team: [], others: {}, sid: 0, target: null, accepted: new Set(), npcs: [], interact: null, emote: "", mount: false, hearthCd: 0, sayQ: "" };
try { JSON.parse(localStorage.getItem("hg-acc") || "[]").forEach(id => G.accepted.add(id)); } catch (e) {}
const saveAcc = () => { try { localStorage.setItem("hg-acc", JSON.stringify([...G.accepted])); } catch (e) {} };

/* ---------- Moteur ---------- */
const canvas = $("#gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xC9DCEB, 130, 430);
/* Ciel peint : dégradé du bleu profond vers l'horizon doré */
{ const g = new THREE.SphereGeometry(450, 32, 16), c = [], p = g.attributes.position, top = new THREE.Color(0x3C7DC4), mid = new THREE.Color(0x9CC9EC), hor = new THREE.Color(0xF4E2B8);
  for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 450, col = y > 0.15 ? mid.clone().lerp(top, Math.min(1, (y - 0.15) / 0.6)) : hor.clone().lerp(mid, Math.max(0, (y + 0.05) / 0.2)); c.push(col.r, col.g, col.b); }
  g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
  const sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })); scene.add(sky); window.__sky = sky; }
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 900);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();

scene.add(new THREE.HemisphereLight(0xCFE3FF, 0x4A5A2A, 0.9));
const sun = new THREE.DirectionalLight(0xFFF1D6, 0.85);
sun.position.set(60, 90, 40); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -80, right: 80, top: 80, bottom: -80, near: 10, far: 260 });
scene.add(sun); scene.add(sun.target);

const M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0 });
const MET = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.75 });
function paintTex(w, h, fn, rep) { const c = document.createElement("canvas"); c.width = w; c.height = h; fn(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(rep[0], rep[1]); t.anisotropy = 8; return t; }
let tseed = 3; const trnd = () => (tseed = (tseed * 16807) % 2147483647) / 2147483647;
const GRASS = paintTex(256, 256, (x, w, h) => { x.fillStyle = "#4F7F2E"; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) { const g = 90 + trnd() * 70, r = 50 + trnd() * 40; x.fillStyle = "rgba(" + (r | 0) + "," + (g | 0) + "," + (25 + trnd() * 30 | 0) + "," + (0.25 + trnd() * 0.35) + ")"; const sx = trnd() * w, sy = trnd() * h; x.fillRect(sx, sy, 1 + trnd() * 3, 2 + trnd() * 5); }
  for (let i = 0; i < 30; i++) { x.fillStyle = "rgba(255,240,150," + (0.15 + trnd() * 0.2) + ")"; x.beginPath(); x.arc(trnd() * w, trnd() * h, 6 + trnd() * 18, 0, 7); x.fill(); } }, [80, 80]);
const STONE = paintTex(256, 256, (x, w, h) => { x.fillStyle = "#6E675C"; x.fillRect(0, 0, w, h); const bh = 32;
  for (let row = 0; row < h / bh; row++) { const off = row % 2 ? 0 : 32; for (let col = -1; col < w / 64 + 1; col++) { const v = 95 + trnd() * 45; x.fillStyle = "rgb(" + (v + 8 | 0) + "," + (v | 0) + "," + (v - 12 | 0) + ")"; x.fillRect(col * 64 + off + 2, row * bh + 2, 60, bh - 4);
    x.fillStyle = "rgba(255,255,255,.08)"; x.fillRect(col * 64 + off + 2, row * bh + 2, 60, 3); x.fillStyle = "rgba(0,0,0,.18)"; x.fillRect(col * 64 + off + 2, row * bh + bh - 6, 60, 4); } } });
const COBBLE = paintTex(256, 256, (x, w, h) => { x.fillStyle = "#7C7466"; x.fillRect(0, 0, w, h); for (let i = 0; i < 160; i++) { const v = 120 + trnd() * 50; x.fillStyle = "rgb(" + (v | 0) + "," + (v - 6 | 0) + "," + (v - 18 | 0) + ")"; x.beginPath(); x.ellipse(trnd() * w, trnd() * h, 8 + trnd() * 10, 6 + trnd() * 8, trnd() * 3, 0, 7); x.fill(); } }, [6, 6]);
const DIRT = paintTex(128, 128, (x, w, h) => { x.fillStyle = "#9A7B52"; x.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { const v = 120 + trnd() * 60; x.fillStyle = "rgba(" + (v | 0) + "," + (v * .8 | 0) + "," + (v * .55 | 0) + ",.5)"; x.fillRect(trnd() * w, trnd() * h, 2, 2); } }, [1, 20]);
const ROOF = paintTex(128, 128, (x, w, h) => { x.fillStyle = "#1F2B57"; x.fillRect(0, 0, w, h); for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const v = 35 + trnd() * 25; x.fillStyle = "rgb(" + (v | 0) + "," + (v + 12 | 0) + "," + (v + 50 | 0) + ")"; x.beginPath(); x.arc(c * 16 + (r % 2) * 8 + 8, r * 16 + 4, 9, 0, Math.PI); x.fill(); } }, [6, 3]);
const box = (w, h, d, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), typeof c === "object" ? c : M(c)); m.castShadow = true; m.receiveShadow = true; return m; };
const cyl = (rt, rb, h, c, s) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, s || 12), M(c)); m.castShadow = true; m.receiveShadow = true; return m; };
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const COLL = []; // obstacles : cercles {x, z, r}
const FLAGS = [], TORCHES = [];
const solid = (x, z, r) => COLL.push({ x, z, r });

function textTex(lines, o) {
  o = Object.assign({ w: 512, h: 128, bg: null, color: "#fff", font: "600 44px Inter", stroke: "rgba(0,0,0,.85)" }, o);
  const c = document.createElement("canvas"); c.width = o.w; c.height = o.h; const x = c.getContext("2d");
  if (o.bg) { x.fillStyle = o.bg; x.fillRect(0, 0, o.w, o.h); }
  x.textAlign = "center"; x.textBaseline = "middle";
  const L = [].concat(lines), lh = o.h / L.length;
  L.forEach((l, i) => { const t = typeof l === "string" ? { t: l } : l; x.font = t.font || o.font; x.lineWidth = 8; x.strokeStyle = o.stroke; if (o.stroke) x.strokeText(t.t, o.w / 2, lh * i + lh / 2); x.fillStyle = t.color || o.color; x.fillText(t.t, o.w / 2, lh * i + lh / 2); });
  const tx = new THREE.CanvasTexture(c); tx.anisotropy = 4; return tx;
}
function label(lines, o, scale) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTex(lines, o), depthTest: true, transparent: true }));
  const s = scale || 1; sp.scale.set(4 * s, 1 * s * ((o && o.h) || 128) / 128, 1); return sp;
}

/* ---------- Le monde ---------- */
/* Relief : collines douces, et au nord la montagne du chalet (on peut y monter) */
const MT = { x: 30, z: -215, r: 88, h: 105, top: 9 };
const mountainH = (x, z) => { const d = Math.hypot(x - MT.x, z - MT.z); if (d >= MT.r) return 0; const k = Math.min(1, (MT.r - d) / (MT.r - MT.top));
  const n = (Math.sin(x * .11) * Math.cos(z * .09) + Math.sin((x + z) * .05)) * 3.5 * (1 - k) * k * 4; return MT.h * Math.pow(k, 1.45) * (k < 1 ? 1 : 1) + (k < 1 ? n : 0); };
const heightAt = (x, z) => { const d = Math.hypot(x, z); const hill = d > 80 ? (Math.sin(x * 0.05) + Math.cos(-z * 0.04)) * Math.min(6, (d - 80) * 0.04) : 0; return Math.max(hill, mountainH(x, z) + (mountainH(x, z) > 0 ? hill * 0.3 : 0)); };
const ground = new THREE.Mesh(new THREE.PlaneGeometry(640, 640, 160, 160), new THREE.MeshStandardMaterial({ map: GRASS, roughness: 1, vertexColors: true }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
{ const p = ground.geometry.attributes.position, col = [], rock = new THREE.Color(0x8F8A80), snow = new THREE.Color(0xFFFFFF), white = new THREE.Color(1, 1, 1);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = -p.getY(i), h = heightAt(x, z); p.setZ(i, h); const m = mountainH(x, z);
    let c = white.clone(); if (m > 18) c = white.clone().lerp(new THREE.Color(1.5, 1.45, 1.4), Math.min(1, (m - 18) / 25)); if (m > 70) c.lerp(new THREE.Color(2.4, 2.5, 2.7), Math.min(1, (m - 70) / 18)); col.push(c.r, c.g, c.b); }
  ground.geometry.setAttribute("color", new THREE.Float32BufferAttribute(col, 3)); ground.geometry.computeVertexNormals(); }
scene.add(ground);

// Place pavée et chemins
const plaza = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ map: COBBLE, roughness: .95 })); plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.03; plaza.receiveShadow = true; scene.add(plaza);
const ring = new THREE.Mesh(new THREE.RingGeometry(29.4, 30.4, 64), M(0x8C826C)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; scene.add(ring);
[[0, -1], [0, 1], [1, 0], [-1, 0]].forEach(([dx, dz]) => { const tx = DIRT.clone(); tx.needsUpdate = true; tx.repeat.set(dx ? 20 : 1, dz ? 20 : 1); const r = new THREE.Mesh(new THREE.PlaneGeometry(dx ? 140 : 7, dz ? 140 : 7), new THREE.MeshStandardMaterial({ map: tx, roughness: 1 })); r.rotation.x = -Math.PI / 2; r.position.set(dx * 95, 0.02, dz * 95); r.receiveShadow = true; scene.add(r); });

// Fontaine
{ const b = cyl(5, 5.4, 1, 0x9A9384, 32); b.position.y = 0.5; scene.add(b);
  const w = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.2, 32), new THREE.MeshLambertMaterial({ color: 0x4DA3D9, transparent: true, opacity: .85 })); w.position.y = 0.95; scene.add(w);
  const c = cyl(0.5, 0.7, 3.2, 0x9A9384); c.position.y = 2.2; scene.add(c);
  const t = cyl(1.6, 0.4, 0.5, 0x9A9384, 20); t.position.y = 3.8; scene.add(t); solid(0, 0, 5.8); }

// Le château de l'agence
const HQ = { x: 0, z: -66 };
{ const g = new THREE.Group(), stone = new THREE.MeshStandardMaterial({ map: STONE, roughness: .95 }), stoneD = new THREE.MeshStandardMaterial({ map: STONE, color: 0xB8B0A0, roughness: .95 });
  const roofM = new THREE.MeshStandardMaterial({ map: ROOF, roughness: .7 });
  const W = 46, D = 34, H = 11, T = 2.4;
  const wall = (w, d, x, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), stone); m.position.set(x, H / 2, z); m.castShadow = m.receiveShadow = true; g.add(m);
    const n = Math.floor(Math.max(w, d) / 2.2); for (let i = 0; i < n; i++) { if (i % 2) continue; const c = new THREE.Mesh(new THREE.BoxGeometry(w > d ? 1.3 : T + .3, 1.4, w > d ? T + .3 : 1.3), stoneD); const k = (i + .5) / n - .5;
      c.position.set(x + (w > d ? k * w : 0), H + .7, z + (w > d ? 0 : k * d)); c.castShadow = true; g.add(c); } };
  wall(W, T, 0, -D / 2); wall(T, D, -W / 2, 0); wall(T, D, W / 2, 0);
  wall((W - 9) / 2, T, -(W + 9) / 4, D / 2); wall((W - 9) / 2, T, (W + 9) / 4, D / 2);
  // Porte : arche et herse
  const lint = new THREE.Mesh(new THREE.BoxGeometry(10, 3, T + .6), stoneD); lint.position.set(0, H - 1.2, D / 2); lint.castShadow = true; g.add(lint);
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, T + .4, 24, 1, false, 0, Math.PI), stoneD); arch.rotation.x = Math.PI / 2; arch.rotation.z = Math.PI / 2; arch.position.set(0, 6.6, D / 2); g.add(arch);
  for (let i = -3; i <= 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(.18, 3, .18), MET(0x3A3A3A)); b.position.set(i * 1.2, 9.3, D / 2 + 1.3); g.add(b); }
  // Tours d'angle
  const tower = (x, z, r, h, flag) => { const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, h, 20), stone); t.position.set(x, h / 2, z); t.castShadow = t.receiveShadow = true; g.add(t);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(r + .5, r + .5, 1.2, 20), stoneD); ring.position.set(x, h + .2, z); ring.castShadow = true; g.add(ring);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r + .9, r * 2.6, 20), roofM); roof.position.set(x, h + .8 + r * 1.3, z); roof.castShadow = true; g.add(roof);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(.35, 10, 8), MET(0xF5C542)); tip.position.set(x, h + .8 + r * 2.6, z); g.add(tip);
    if (flag) { const pole = cyl(.08, .08, 4, 0x444444, 6); pole.position.set(x, h + r * 2.6 + 2.6, z); g.add(pole);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.5, 8, 1), new THREE.MeshStandardMaterial({ color: 0xC6FF33, side: THREE.DoubleSide, roughness: .9 })); f.position.set(x + 1.35, h + r * 2.6 + 3.7, z); g.add(f); FLAGS.push(f); }
    for (let k = 0; k < 3; k++) { const wdw = new THREE.Mesh(new THREE.PlaneGeometry(.8, 1.6), new THREE.MeshBasicMaterial({ color: 0xFFD27A })); const a = k * 2.1 + .5; wdw.position.set(x + Math.sin(a) * (r + .02), h * .35 + k * h * .2, z + Math.cos(a) * (r + .02)); wdw.rotation.y = a; g.add(wdw); }
  };
  [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]].forEach(([x, z]) => tower(x, z, 4, 17, true));
  [-6.5, 6.5].forEach(x => tower(x, D / 2 + .5, 2.4, 14, false));
  // Donjon
  const keep = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 14), stone); keep.position.set(0, 10, -7); keep.castShadow = keep.receiveShadow = true; g.add(keep);
  const kr = new THREE.Mesh(new THREE.ConeGeometry(15.5, 10, 4), roofM); kr.rotation.y = Math.PI / 4; kr.scale.set(1, 1, .72); kr.position.set(0, 25, -7); kr.castShadow = true; g.add(kr);
  tower(0, -7, 4.5, 30, true);
  for (let i = -1; i <= 1; i++) { const wdw = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3), new THREE.MeshBasicMaterial({ color: 0xFFD27A })); wdw.position.set(i * 6, 13, .02); g.add(wdw); }
  const kd = new THREE.Mesh(new THREE.PlaneGeometry(4, 6), M(0x4A2E18)); kd.position.set(0, 3, .03); g.add(kd);
  // Bannières de l'agence sur la façade
  [-14, 14].forEach(x => { const b = new THREE.Mesh(new THREE.PlaneGeometry(3, 7), new THREE.MeshStandardMaterial({ map: textTex([{ t: "G", font: "italic 160px 'Bebas Neue'" }], { w: 128, h: 300, bg: "#0E0E0D", color: "#C6FF33", stroke: null }), roughness: .9 }));
    b.position.set(x, 6.8, D / 2 + 1.25); g.add(b); });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.2), new THREE.MeshBasicMaterial({ map: textTex([{ t: "AGENCE GACOLET", font: "italic 92px 'Bebas Neue'" }], { w: 1024, h: 192, bg: "#0E0E0D", color: "#C6FF33", stroke: null }) }));
  sign.position.set(0, H + 1.6, D / 2 + 1.35); g.add(sign);
  // Torches de part et d'autre de la porte
  [-5.6, 5.6].forEach(x => { const f = new THREE.Mesh(new THREE.SphereGeometry(.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xFFA733 })); f.position.set(x, 6, D / 2 + 1.6); g.add(f); TORCHES.push(f);
    const l = new THREE.PointLight(0xFFA040, 1.2, 14); l.position.copy(f.position); g.add(l); });
  g.position.set(HQ.x, 0, HQ.z); scene.add(g);
  // Collisions : murs (porte ouverte), tours, donjon
  const seg = (x1, z1, x2, z2, r) => { const n = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / r); for (let i = 0; i <= n; i++) solid(HQ.x + x1 + (x2 - x1) * i / n, HQ.z + z1 + (z2 - z1) * i / n, r); };
  seg(-W / 2, -D / 2, W / 2, -D / 2, 1.4); seg(-W / 2, -D / 2, -W / 2, D / 2, 1.4); seg(W / 2, -D / 2, W / 2, D / 2, 1.4);
  seg(-W / 2, D / 2, -4.6, D / 2, 1.4); seg(4.6, D / 2, W / 2, D / 2, 1.4);
  seg(-10, -14, 10, -14, 1.5); seg(-10, 0, -4, 0, 1.5); seg(4, 0, 10, 0, 1.5); seg(-10, -14, -10, 0, 1.5); seg(10, -14, 10, 0, 1.5);
  [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]].forEach(([x, z]) => solid(HQ.x + x, HQ.z + z, 4.3)); [-6.5, 6.5].forEach(x => solid(HQ.x + x, HQ.z + D / 2 + .5, 2.6)); }

// Arbres feuillus façon forêt d'Elwynn : troncs tordus et feuillages en boules
const LEAF = [0x3F7A2B, 0x4E8A31, 0x2F6A28, 0x5B9236, 0xC9822F, 0xB5532A];
function tree(x, z, s) { const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * s, 0.6 * s, 4.2 * s, 7), M(0x5C3E24)); t.position.y = 2.1 * s; t.rotation.z = (rnd() - .5) * .15; t.castShadow = true; g.add(t);
  const col = LEAF[rnd() < .12 ? 4 + Math.floor(rnd() * 2) : Math.floor(rnd() * 4)], mat = new THREE.MeshStandardMaterial({ color: col, roughness: .9, flatShading: true });
  const n = 4 + Math.floor(rnd() * 3); for (let i = 0; i < n; i++) { const r = (1.3 + rnd() * 1.1) * s, c = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), mat);
    c.position.set((rnd() - .5) * 2.6 * s, (4.4 + rnd() * 2) * s, (rnd() - .5) * 2.6 * s); c.castShadow = true; g.add(c); }
  g.rotation.y = rnd() * 6; g.position.set(x, heightAt(x, z), z); scene.add(g); solid(x, z, 0.9 * s); }
for (let i = 0; i < 260; i++) { const a = rnd() * Math.PI * 2, d = 58 + rnd() * 200, x = Math.cos(a) * d, z = Math.sin(a) * d;
  if (Math.abs(x) < 6 || Math.abs(z) < 6) continue; if (Math.abs(x - HQ.x) < 34 && Math.abs(z - HQ.z) < 30) continue; if (mountainH(x, z) > 55) continue; tree(x, z, 0.8 + rnd() * 0.7); }
// Fleurs et touffes
{ const fm = [0xF2D14B, 0xE86A8A, 0xF4F1E8, 0x9A7BE0].map(c => new THREE.MeshBasicMaterial({ color: c })), geo = new THREE.SphereGeometry(.18, 6, 4);
  for (let i = 0; i < 500; i++) { const a = rnd() * Math.PI * 2, d = 33 + rnd() * 140, x = Math.cos(a) * d, z = Math.sin(a) * d; if (Math.abs(x) < 5 || Math.abs(z) < 5) continue; if (Math.abs(x - HQ.x) < 26 && Math.abs(z - HQ.z) < 20) continue;
    const f = new THREE.Mesh(geo, fm[i % 4]); f.position.set(x, heightAt(x, z) + .2, z); scene.add(f); } }
// Le chalet en haut de la montagne : notre objectif
const CHALET = { x: MT.x, z: MT.z, y: MT.h, name: "Le chalet", kind: "chalet" };
{ const g = new THREE.Group();
  const LOG = paintTex(256, 128, (x, w, h) => { for (let r = 0; r < 8; r++) { const v = 95 + trnd() * 30; x.fillStyle = "rgb(" + (v + 30 | 0) + "," + (v | 0) + "," + (v * .6 | 0) + ")"; x.fillRect(0, r * 16, w, 16); x.fillStyle = "rgba(0,0,0,.35)"; x.fillRect(0, r * 16 + 13, w, 3); x.fillStyle = "rgba(255,230,180,.12)"; x.fillRect(0, r * 16 + 1, w, 3); } }, [2, 2]);
  const logM = new THREE.MeshStandardMaterial({ map: LOG, roughness: .9 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(12, 1.2, 10), new THREE.MeshStandardMaterial({ map: STONE, roughness: 1 })); base.position.y = .3; g.add(base);
  const body = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 8), logM); body.position.y = 3.9; body.castShadow = body.receiveShadow = true; g.add(body);
  const roofG = new THREE.CylinderGeometry(6.6, 6.6, 11.5, 3, 1); const roof = new THREE.Mesh(roofG, new THREE.MeshStandardMaterial({ color: 0x4A2E1C, roughness: .9 })); roof.rotation.z = Math.PI / 2; roof.rotation.y = Math.PI / 2; roof.rotation.x = Math.PI / 6; roof.scale.set(1, 1, .62); roof.position.y = 9.4;
  roof.rotation.set(0, 0, 0); roof.rotation.z = Math.PI / 2; roof.rotation.x = -Math.PI / 2; roof.position.y = 8.8; roof.castShadow = true; g.add(roof);
  const snowR = new THREE.Mesh(roofG, new THREE.MeshStandardMaterial({ color: 0xF4F8FF, roughness: .8 })); snowR.rotation.copy(roof.rotation); snowR.scale.set(1.04, 1.02, .66); snowR.position.y = 9.1; g.add(snowR);
  const ch = new THREE.Mesh(new THREE.BoxGeometry(1.4, 4, 1.4), new THREE.MeshStandardMaterial({ map: STONE, roughness: 1 })); ch.position.set(2.8, 11, -1.5); ch.castShadow = true; g.add(ch);
  const winM = new THREE.MeshBasicMaterial({ color: 0xFFC25A });
  [[-2.8, 3.6], [2.8, 3.6]].forEach(([x, y]) => { const w = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), winM); w.position.set(x, y, 4.02); g.add(w); const fr = new THREE.Mesh(new THREE.BoxGeometry(2.3, .2, .2), logM); fr.position.set(x, y - 1.1, 4.1); g.add(fr); });
  const big = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.4), winM); big.position.set(0, 8.2, 4.05); big.scale.set(.8, .8, 1); g.add(big);
  const door = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 3.4), new THREE.MeshStandardMaterial({ color: 0x3A2414 })); door.position.set(0, 2.9, 4.03); g.add(door);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(12, .4, 4), logM); deck.position.set(0, 1, 6); deck.receiveShadow = true; g.add(deck);
  const lamp = new THREE.PointLight(0xFFB050, 2.2, 30); lamp.position.set(0, 4, 7); g.add(lamp);
  // sapins enneigés autour
  [[-9, -4], [9, -5], [-8, 6], [10, 5], [-3, -9], [5, -9]].forEach(([x, z]) => { const t = new THREE.Group(); for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(2.2 - i * .6, 2.8, 8), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x2B5A33 : 0xEEF4FA, roughness: .9, flatShading: true })); c.position.y = 1.6 + i * 1.5; c.castShadow = true; t.add(c); } t.position.set(x, 0, z); g.add(t); solid(CHALET.x + x, CHALET.z + z, 1.2); });
  const tg = label([{ t: "Le chalet", color: "#FFE08A", font: "italic 70px 'Bebas Neue'" }, { t: "Notre objectif : moins d’un an", font: "500 30px Inter", color: "#fff" }], { h: 192 }, 2.2); tg.position.y = 17; g.add(tg);
  g.position.set(CHALET.x, MT.h, CHALET.z); g.rotation.y = 0.35; scene.add(g); CHALET.obj = g;
  for (let x = -5; x <= 5; x += 2.5) solid(CHALET.x + x, CHALET.z, 4.2);
  window.__smoke = { x: CHALET.x + 2.8 * Math.cos(.35) - 1.5 * Math.sin(.35), y: MT.h + 13, z: CHALET.z - 2.8 * Math.sin(.35) - 1.5 * Math.cos(.35), parts: [] }; }
// Brume qui flotte autour de la montagne
const MIST = []; { const tex = paintTex(256, 256, (x, w, h) => { for (let i = 0; i < 14; i++) { const cx = 40 + trnd() * 176, cy = 70 + trnd() * 116, r = 30 + trnd() * 60; const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, w, h); } });
  for (let i = 0; i < 26; i++) { const a = rnd() * Math.PI * 2, lvl = rnd(), r = MT.r * (1 - lvl * .75) * (.6 + rnd() * .5), y = 12 + lvl * (MT.h - 10);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: .55 + rnd() * .3, depthWrite: false, fog: false })); const s = 50 + rnd() * 60; sp.scale.set(s, s * .45, 1);
    sp.position.set(MT.x + Math.cos(a) * r, y, MT.z + Math.sin(a) * r); sp.userData = { a, r, y, sp: (rnd() - .5) * .05, op: sp.material.opacity }; scene.add(sp); MIST.push(sp); } }
// Fumée de la cheminée
const SMOKE_M = new THREE.MeshBasicMaterial({ color: 0xDDDDDD, transparent: true, opacity: .5, depthWrite: false });

// Rochers
for (let i = 0; i < 40; i++) { const a = rnd() * Math.PI * 2, d = 70 + rnd() * 180, x = Math.cos(a) * d, z = Math.sin(a) * d; if (Math.abs(x) < 6 || Math.abs(z) < 6) continue;
  const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + rnd() * 2), M(0x8A8A82)); r.position.set(x, heightAt(x, z) + 0.5, z); r.rotation.set(rnd(), rnd(), rnd()); r.castShadow = true; scene.add(r); solid(x, z, 1.8); }
// Lampadaires autour de la place
const LAMPS = [];
for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8, x = Math.cos(a) * 31.5, z = Math.sin(a) * 31.5;
  const p = cyl(0.15, 0.2, 5, 0x222222, 8); p.position.set(x, 2.5, z); scene.add(p);
  const l = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshBasicMaterial({ color: 0xFFE2A0 })); l.position.set(x, 5.2, z); scene.add(l); LAMPS.push(l); solid(x, z, 0.5); }
// Nuages
const CLOUDS = [];
for (let i = 0; i < 18; i++) { const g = new THREE.Group(); for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(4 + rnd() * 4, 10, 8), new THREE.MeshLambertMaterial({ color: 0xFFFFFF, transparent: true, opacity: .9 })); s.position.set(k * 5, rnd() * 2, rnd() * 4); g.add(s); }
  g.position.set(-250 + rnd() * 500, 55 + rnd() * 25, -250 + rnd() * 500); scene.add(g); CLOUDS.push(g); }

/* ---------- Personnages : silhouettes de héros façon Warcraft (épaulières, tabard, cape) ---------- */
function makeChar(name, o) {
  o = o || {}; const g = new THREE.Group(), shirt = new THREE.Color(o.shirt || avColor(name)), skin = o.skin || 0xE2B48C;
  const mS = M(skin), mShirt = new THREE.MeshStandardMaterial({ color: shirt, roughness: .8 }), mPants = M(o.pants || 0x3A2A1E), mBoot = M(0x2A1C12), mArmor = MET(o.metal || (o.npc ? 0x9AA3AD : 0xC9A243)), mLeather = M(0x5A3A22);
  const add = (geo, mat, x, y, z, par) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; (par || g).add(m); return m; };
  // Jambes
  const legL = new THREE.Group(), legR = new THREE.Group(); legL.position.set(-0.3, 1.75, 0); legR.position.set(0.3, 1.75, 0);
  [legL, legR].forEach(L => { add(new THREE.CylinderGeometry(0.24, 0.19, 1.1, 10), mPants, 0, -0.5, 0, L); add(new THREE.CylinderGeometry(0.21, 0.24, 0.75, 10), mBoot, 0, -1.25, 0.02, L);
    const f = add(new THREE.SphereGeometry(0.25, 10, 8), mBoot, 0, -1.58, 0.12, L); f.scale.set(1, .6, 1.5); });
  // Torse
  const body = add(new THREE.SphereGeometry(0.72, 16, 12), mShirt, 0, 2.55, 0); body.scale.set(1.05, 1.15, 0.72);
  const belt = add(new THREE.CylinderGeometry(0.6, 0.62, 0.22, 16), mLeather, 0, 1.85, 0);
  const buckle = add(new THREE.BoxGeometry(0.22, 0.18, 0.06), mArmor, 0, 1.85, 0.6);
  const tab = add(new THREE.PlaneGeometry(0.7, 1.05), new THREE.MeshStandardMaterial({ color: shirt.clone().multiplyScalar(.75), side: THREE.DoubleSide, roughness: .9 }), 0, 1.35, 0.42); tab.rotation.x = 0.08;
  const emb = add(new THREE.CircleGeometry(0.17, 16), new THREE.MeshBasicMaterial({ color: 0xF5C542 }), 0, 2.65, 0.53);
  // Tête
  const head = add(new THREE.SphereGeometry(0.42, 16, 12), mS, 0, 3.55, 0.02); head.scale.set(1, 1.08, 1);
  const hair = add(new THREE.SphereGeometry(0.45, 16, 10, 0, Math.PI * 2, 0, Math.PI * .55), M(o.hair || 0x3B2414), 0, 3.6, -0.02);
  add(new THREE.SphereGeometry(0.07, 8, 6), mS, 0, 3.5, 0.44);
  [-0.15, 0.15].forEach(x => add(new THREE.SphereGeometry(0.055, 8, 6), M(0x1A1A1A), x, 3.62, 0.38));
  // Épaulières
  [-1, 1].forEach(k => { const p = add(new THREE.SphereGeometry(0.4, 14, 10, 0, Math.PI * 2, 0, Math.PI * .55), mArmor, k * 0.78, 3.0, 0); p.scale.set(1.15, 1, 1.05); p.rotation.z = -k * 0.35;
    const sp = add(new THREE.ConeGeometry(0.09, 0.32, 8), mArmor, k * 0.95, 3.32, 0); sp.rotation.z = -k * 0.6; });
  // Bras
  const armL = new THREE.Group(), armR = new THREE.Group(); armL.position.set(-0.82, 2.95, 0); armR.position.set(0.82, 2.95, 0);
  [armL, armR].forEach(A => { add(new THREE.CylinderGeometry(0.2, 0.17, 0.95, 10), mShirt, 0, -0.45, 0, A); add(new THREE.CylinderGeometry(0.21, 0.19, 0.5, 10), mLeather, 0, -1.05, 0, A); add(new THREE.SphereGeometry(0.2, 10, 8), mS, 0, -1.38, 0, A); });
  g.add(legL, legR, armL, armR);
  // Cape
  if (o.cape) { const cg = new THREE.PlaneGeometry(1.4, 2.3, 4, 6); const cp = add(cg, new THREE.MeshStandardMaterial({ color: o.cape, side: THREE.DoubleSide, roughness: .9 }), 0, 2.05, -0.5); cp.rotation.x = 0.12; g.userData.cape = cp; }
  if (o.weapon) { const sw = new THREE.Group(); add(new THREE.BoxGeometry(0.08, 1.5, 0.18), MET(0xD8DDE2), 0, 0.75, 0, sw); add(new THREE.BoxGeometry(0.55, 0.1, 0.14), mArmor, 0, 0, 0, sw); add(new THREE.CylinderGeometry(.05, .05, .35, 6), mLeather, 0, -.2, 0, sw);
    sw.position.set(0.25, 2.6, -0.55); sw.rotation.z = 0.7; g.add(sw); }
  const tag = label([{ t: name, color: o.npc ? "#FFE08A" : "#C6FF33" }].concat(o.sub ? [{ t: o.sub, font: "500 32px Inter", color: "#ddd" }] : []), { h: o.sub ? 192 : 110 }, 1);
  tag.position.y = o.sub ? 5.1 : 4.8; g.add(tag);
  g.userData = Object.assign(g.userData, { legL, legR, armL, armR, body, head, tag, phase: 0, name });
  return g;
}
function animChar(g, dt, moving, speed, emote) {
  const u = g.userData; u.phase += dt * (moving ? 9 * (speed || 1) : 0);
  const s = moving ? Math.sin(u.phase) * 0.7 : 0;
  let aL = -s, aR = s, lL = s, lR = -s, bodyY = 0;
  if (!moving && emote === "salut") { aR = -2.6 + Math.sin(performance.now() / 120) * 0.35; }
  if (!moving && emote === "danse") { const t = performance.now() / 180; aL = -2.4 + Math.sin(t) * 0.6; aR = -2.4 - Math.sin(t) * 0.6; lL = Math.sin(t * 2) * 0.4; lR = -lL; bodyY = Math.abs(Math.sin(t * 2)) * 0.25; }
  if (!moving && emote === "assis") { lL = lR = -1.5; bodyY = -0.75; }
  const flipW = !moving && emote === "arbre" ? 1 : 0; u.flip = (u.flip || 0) + (flipW - (u.flip || 0)) * Math.min(1, dt * 6);
  if (!moving && emote === "arbre") { const t = performance.now() / 400; aL = aR = Math.PI; lL = Math.sin(t) * 0.12; lR = -Math.sin(t) * 0.12; }
  const lerp = (a, b) => a + (b - a) * Math.min(1, dt * 12);
  u.armL.rotation.x = lerp(u.armL.rotation.x, aL); u.armR.rotation.x = lerp(u.armR.rotation.x, aR);
  u.legL.rotation.x = lerp(u.legL.rotation.x, lL); u.legR.rotation.x = lerp(u.legR.rotation.x, lR);
  if (u.cape) u.cape.rotation.x = lerp(u.cape.rotation.x, moving ? 0.55 + Math.sin(u.phase * 2) * 0.08 : 0.12 + Math.sin(performance.now() / 700) * 0.04);
  if (!moving && !emote) { const br = Math.sin(performance.now() / 600 + u.phase) * 0.012; u.body.scale.y = 1.15 + br; }
  if (u.flip > 0.001) { g.rotation.order = "YXZ"; g.rotation.z = Math.PI * u.flip; g.position.y += 4.6 * u.flip; u.tag.position.y = (u.tagY0 = u.tagY0 || u.tag.position.y) * (1 - 2 * u.flip) - 0.6 * u.flip; }
  else if (u.tagY0) { g.rotation.z = 0; u.tag.position.y = u.tagY0; }
  g.children.forEach(c => { if (c !== u.tag && c !== u.legL && c !== u.legR) { if (c.userData.y0 == null) c.userData.y0 = c.position.y; c.position.y = lerp(c.position.y, c.userData.y0 + bodyY); } });
}

/* ---------- Joueur ---------- */
const P = { x: 0, z: 14, y: 0, vy: 0, ry: Math.PI, model: null, moving: false, grounded: true };
try { const s = JSON.parse(localStorage.getItem("hg-pos") || "null"); if (s && isFinite(s.x)) Object.assign(P, { x: s.x, z: s.z, ry: s.ry }); } catch (e) {}
const CAM = { yaw: P.ry, pitch: 0.38, dist: 13, want: 13 };

/* ---------- PNJ : un étal par client, le tableau des missions, la boîte aux lettres ---------- */
const NPC_GROUP = new THREE.Group(); scene.add(NPC_GROUP);
const MAILBOX = { x: 10, z: -38, name: "Boîte aux lettres", kind: "mail" };
const BOARD = { x: -10, z: -38, name: "Tableau des missions", kind: "board" };
{ const g = new THREE.Group(); const p = cyl(0.18, 0.18, 2.2, 0x333333, 8); p.position.y = 1.1; g.add(p);
  const b = box(1.6, 1.3, 1.1, 0x1B4FA8); b.position.y = 2.6; g.add(b); const t = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.6, 16, 1, false, 0, Math.PI), M(0x1B4FA8)); t.rotation.z = Math.PI / 2; t.position.y = 3.25; t.castShadow = true; g.add(t);
  const sl = box(0.9, 0.12, 0.05, 0x111111); sl.position.set(0, 2.9, 0.56); g.add(sl); const fl = box(0.12, 0.7, 0.08, 0xE33B2E); fl.position.set(0.86, 3.2, 0); g.add(fl);
  const tg = label([{ t: "Boîte aux lettres", color: "#FFE08A" }], { h: 110 }, 0.9); tg.position.y = 4.6; g.add(tg);
  g.position.set(MAILBOX.x, 0, MAILBOX.z); g.rotation.y = 0; scene.add(g); MAILBOX.obj = g; solid(MAILBOX.x, MAILBOX.z, 1.1); }
{ const g = new THREE.Group(); [-1.4, 1.4].forEach(x => { const p = cyl(0.15, 0.15, 3.6, 0x5A3E22, 6); p.position.set(x, 1.8, 0); g.add(p); });
  const b = box(3.6, 2.4, 0.2, 0x7A5634); b.position.y = 2.6; g.add(b);
  for (let i = 0; i < 5; i++) { const n = box(0.6, 0.7, 0.05, 0xF2E6C8); n.position.set(-1.2 + i * 0.6, 2.4 + (i % 2) * 0.6, 0.13); n.rotation.z = (rnd() - 0.5) * 0.3; g.add(n); }
  const tg = label([{ t: "Tableau des missions", color: "#FFE08A" }], { h: 110 }, 0.9); tg.position.y = 4.7; g.add(tg);
  g.position.set(BOARD.x, 0, BOARD.z); scene.add(g); BOARD.obj = g; solid(BOARD.x, BOARD.z, 1.6); }
const bang = () => { const s = label([{ t: "!", font: "900 110px Inter", color: "#FFD21F" }], { w: 128, h: 128 }, 0.5); s.scale.set(1.1, 1.1, 1); return s; };
BOARD.mark = bang(); BOARD.mark.position.set(BOARD.x, 5.6, BOARD.z); scene.add(BOARD.mark);

const STALL_COLORS = [0xD9483B, 0x2E86DE, 0xF5B82E, 0x27AE60, 0x8E44AD, 0xE67E22, 0x16A085, 0xC0392B];
function buildNpcs() {
  NPC_GROUP.clear(); G.npcs.forEach(n => { const i = COLL.indexOf(n.coll); if (i >= 0) COLL.splice(i, 1); }); G.npcs = [];
  const clients = [...new Set(G.quests.map(q => q.client).filter(Boolean))].sort();
  clients.forEach((c, i) => {
    const a = (i / Math.max(clients.length, 1)) * Math.PI * 2 + 0.3, x = Math.cos(a) * 21, z = Math.sin(a) * 21 + 4;
    const st = new THREE.Group(), col = STALL_COLORS[i % STALL_COLORS.length];
    const tb = box(4.2, 1.1, 1.6, 0x7A5634); tb.position.y = 0.55; st.add(tb);
    [-1.9, 1.9].forEach(px => { const p = cyl(0.1, 0.1, 3.6, 0x5A3E22, 6); p.position.set(px, 1.8, -0.6); st.add(p); });
    const aw = box(4.6, 0.15, 2.4, col); aw.position.set(0, 3.6, 0); aw.rotation.x = 0.18; st.add(aw);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 0.9), new THREE.MeshBasicMaterial({ map: textTex([{ t: c.toUpperCase(), font: "italic 72px 'Bebas Neue'" }], { w: 1024, h: 192, bg: "#14120E", color: "#F5C542", stroke: null }) }));
    sg.position.set(0, 1.15, 0.81); st.add(sg);
    const npc = makeChar(c, { npc: true, sub: "Client", shirt: "#" + col.toString(16).padStart(6, "0"), cape: col, hair: [0x3B2414, 0x8A5A2B, 0xD9B26A, 0x1A1A1A][i % 4] });
    npc.position.set(0, 0, -1.6); st.add(npc);
    st.position.set(x, 0, z); st.lookAt(0, 0, 4); NPC_GROUP.add(st);
    const mark = bang(); mark.position.set(x, 6.4, z); NPC_GROUP.add(mark);
    const n = { kind: "client", name: c, x, z, obj: st, model: npc, mark, coll: { x, z, r: 2.6 } }; COLL.push(n.coll); G.npcs.push(n);
  });
  // Un personnage de l'équipe sur le perron de l'agence : Gabriel donne les conseils
  const gab = makeChar("Gabriel", { npc: true, sub: "Seigneur du château", shirt: "#1A1A1A", cape: 0xC6FF33, metal: 0xF5C542, weapon: true }); gab.position.set(HQ.x - 5, 0, HQ.z + 24); gab.rotation.y = 0.2; NPC_GROUP.add(gab);
  G.npcs.push({ kind: "guide", name: "Gabriel", x: HQ.x - 5, z: HQ.z + 24, obj: gab, model: gab, coll: { x: HQ.x - 5, z: HQ.z + 24, r: 0.8 } }); COLL.push(G.npcs[G.npcs.length - 1].coll);
  G.npcs.push(Object.assign(BOARD, { coll: null }), Object.assign(MAILBOX, { coll: null }), Object.assign(CHALET, { coll: null, x: CHALET.x, z: CHALET.z + 9 }));
  refreshMarks();
}
function refreshMarks() {
  G.npcs.forEach(n => { if (n.kind === "client" && n.mark) n.mark.visible = G.quests.some(q => q.client === n.name); });
  BOARD.mark.visible = G.quests.some(q => !q.client);
}

/* ---------- Interface ---------- */
const log = (t, cls) => { const p = el("p", cls || "sys", ""); if (typeof t === "string") p.textContent = t; else p.append(...t); const L = $("#chat-log"); L.appendChild(p); while (L.children.length > 120) L.firstChild.remove(); L.scrollTop = L.scrollHeight; };
const float = (t, cls) => { const f = el("div", "float " + (cls || ""), t); $("#fx").appendChild(f); setTimeout(() => f.remove(), 1900); };
const banner = (h, p) => { const b = el("div", "banner"); b.append(el("h2", null, h)); if (p) b.append(el("p", null, p)); $("#fx").appendChild(b); setTimeout(() => b.remove(), 3500); };
let AC; const tone = (f, d, t0) => { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); const o = AC.createOscillator(), g = AC.createGain(); o.type = "triangle"; o.frequency.value = f; g.gain.setValueAtTime(0.0001, AC.currentTime + (t0 || 0)); g.gain.exponentialRampToValueAtTime(0.18, AC.currentTime + (t0 || 0) + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + (t0 || 0) + d); o.connect(g).connect(AC.destination); o.start(AC.currentTime + (t0 || 0)); o.stop(AC.currentTime + (t0 || 0) + d + 0.05); } catch (e) {} };
const chime = () => { tone(784, .25); tone(988, .25, .1); tone(1319, .5, .2); };
const levelSound = () => { [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, .5, i * .09)); };

function renderMe() {
  const m = G.me; if (!m) return;
  $("#pf-name").textContent = m.name; $("#pf-lvl").textContent = "Niveau " + m.lvl + "   " + m.gold + " pièces d’or";
  const av = $("#pf-av"); av.textContent = initials(m.name); av.style.background = avColor(m.name);
  const pct = Math.max(0, Math.min(100, (m.xp - m.prev) / Math.max(1, m.next - m.prev) * 100));
  $("#xp-fill").style.width = pct + "%"; $("#xp-tx").textContent = "Expérience " + (m.xp - m.prev) + " / " + (m.next - m.prev);
  if (P.model) { const t = P.model.userData.tag; t.material.map = textTex([{ t: m.name, color: "#C6FF33" }, { t: "Niveau " + m.lvl, font: "500 32px Inter", color: "#ddd" }], { h: 192 }); t.scale.set(4, 1.5, 1); t.position.y = 5.1; }
}
function renderTracker() {
  const L = $("#tr-list"); L.textContent = "";
  const acc = G.quests.filter(q => G.accepted.has(q.id));
  if (!acc.length) { const p = el("div", "tq"); p.append(el("span", null, G.quests.length ? "Aucune quête acceptée. Va voir les clients marqués d’un point d’exclamation." : "Aucune quête en cours. Bravo.")); L.appendChild(p); return; }
  acc.slice(0, 8).forEach(q => { const d = el("div", "tq"); d.append(el("b", null, q.title)); const late = q.date && q.date < today();
    d.append(el("span", late ? "late" : "", (q.client ? q.client : "Agence") + (q.date ? (late ? "   en retard, " : "   avant le ") + fmtD(q.date) : ""))); d.onclick = () => openQuest(q); L.appendChild(d); });
}
function renderMailFlag() { const n = G.mail.filter(m => !m.read).length; const b = $("#mm-mail"); b.hidden = !n; b.textContent = n > 1 ? n + " lettres" : "Courrier"; }

/* Barre d'action et menus */
const ICONS = {
  salut: '<path d="M7 12V6a1.5 1.5 0 0 1 3 0v5M10 11V4.5a1.5 1.5 0 0 1 3 0V11M13 11V5.5a1.5 1.5 0 0 1 3 0V13M16 9a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2.5-4a1.5 1.5 0 0 1 2.5-1.6L7 14"/>',
  danse: '<circle cx="9" cy="18" r="2.5"/><circle cx="18" cy="16" r="2.5"/><path d="M11.5 18V5l9-2v13"/>',
  assis: '<path d="M6 21v-6h11v6M6 15V5M6 11h9a2 2 0 0 1 2 2v2"/>',
  foyer: '<path d="M3 11l9-8 9 8M5 9.5V21h14V9.5M10 21v-6h4v6"/>',
  arbre: '<circle cx="12" cy="19" r="2"/><path d="M12 17V9M12 9l-4 4M12 9l4 4M10 3l2 6 2-6"/>',
  monture: '<path d="M4 18c1-4 3-6 7-6h4l3-4 2 1-1 4v5M8 18v3M16 18v3M11 12V9l-3-2"/>',
  app: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8"/>'
};
const ACTIONS = [
  ["1", "salut", "Saluer", () => emote("salut")],
  ["2", "danse", "Danser", () => emote("danse")],
  ["3", "assis", "S’asseoir", () => emote("assis")],
  ["4", "foyer", "Pierre de foyer : retour sur la place", hearth],
  ["5", "monture", "Monture : aller plus vite", () => { G.mount = !G.mount; log(G.mount ? "Tu montes en selle." : "Tu descends de ta monture."); renderBar(); }],
  ["6", "arbre", "Arbre droit", () => emote("arbre")],
  ["7", "app", "Ouvrir l’application", () => window.open("/gestion", "_blank")]
];
function renderBar() {
  const A = $("#abar"); A.textContent = "";
  ACTIONS.forEach(([k, ic, tip, fn]) => { const b = el("button", "ab" + ((ic === "monture" && G.mount) || G.emote === ic ? " on" : "")); b.type = "button";
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[ic] + "</svg>"; b.append(el("kbd", null, k), el("span", "ab-tip", tip + " (" + k + ")"));
    if (ic === "foyer" && G.hearthCd > 0) b.append(el("span", "cd", Math.ceil(G.hearthCd) + ""));
    b.onclick = () => { fn(); canvas.focus(); }; A.appendChild(b); });
  const MB = $("#menubar"); MB.textContent = "";
  [["Personnage (C)", charWin], ["Sacs (B)", bagWin], ["Quêtes (L)", logWin], ["Carte (M)", mapWin], ["Touches", keysWin], ["Menu (Échap)", menuWin]].forEach(([t, f]) => { const b = el("button", null, t); b.type = "button"; b.onclick = () => { f(); canvas.focus(); }; MB.appendChild(b); });
}
function emote(e) { G.emote = G.emote === e ? "" : e; if (G.emote) log(G.me.name + (e === "salut" ? " salue tout le monde." : e === "danse" ? " se met à danser." : e === "arbre" ? " fait l’arbre droit. Impressionnant." : " s’assoit.")); renderBar(); }
function hearth() { if (G.hearthCd > 0) return log("La pierre de foyer n’est pas encore prête.", "err"); P.x = 0; P.z = 14; P.ry = Math.PI; CAM.yaw = P.ry; G.hearthCd = 30; log("Tu utilises ta pierre de foyer. Retour sur la place du Hameau."); tone(440, .6); renderBar(); }

/* Fenêtres */
const WINS = {};
function win(id, title, build, o) {
  if (WINS[id]) { WINS[id].remove(); delete WINS[id]; if (!(o && o.reopen)) return null; }
  const w = el("div", "win"); w.dataset.id = id; if (o && o.width) w.style.width = o.width + "px";
  const h = el("div", "win-h"); h.append(el("h2", null, title)); const x = el("button", "win-x", "×"); x.type = "button"; x.setAttribute("aria-label", "Fermer"); x.onclick = () => closeWin(id); h.append(x);
  const b = el("div", "win-b"); w.append(h, b); build(b, w);
  const n = Object.keys(WINS).length; w.style.left = ((o && o.left) != null ? o.left : 300 + n * 30) + "px"; w.style.top = ((o && o.top) != null ? o.top : 110 + n * 26) + "px";
  let drag = null; h.onmousedown = e => { if (e.target === x) return; drag = { dx: e.clientX - w.offsetLeft, dy: e.clientY - w.offsetTop }; e.preventDefault(); };
  addEventListener("mousemove", e => { if (drag) { w.style.left = Math.max(0, e.clientX - drag.dx) + "px"; w.style.top = Math.max(0, e.clientY - drag.dy) + "px"; } });
  addEventListener("mouseup", () => drag = null);
  w.addEventListener("mousedown", e => e.stopPropagation());
  $("#win-layer").appendChild(w); WINS[id] = w; return w;
}
const closeWin = id => { if (WINS[id]) { WINS[id].remove(); delete WINS[id]; } canvas.focus(); };
const btn = (t, cls, fn) => { const b = el("button", "gbtn " + (cls || ""), t); b.type = "button"; b.onclick = fn; return b; };

function questItem(q, onClick) { const late = q.date && q.date < today(); const b = el("button", "qi" + (late ? " late" : "")); b.type = "button";
  const s = el("span"); s.append(el("b", null, q.title), el("small", null, (late ? "En retard : " : q.date ? "Avant le " : "") + (q.date ? fmtD(q.date) : "Sans échéance") + (G.accepted.has(q.id) ? "   acceptée" : "")));
  b.append(el("i", null, G.accepted.has(q.id) ? "?" : "!"), s); b.onclick = () => onClick(q); return b; }
function npcWin(n) {
  if (n.kind === "mail") return mailWin();
  if (n.kind === "chalet") return win("npc", "Le chalet", b => { b.append(el("p", null, "Le but : un chalet comme celui-ci, en haut de la montagne, dans moins d’un an."), el("p", "muted", "Chaque quête rendue rapproche l’agence du sommet. Bientôt, la progression du plan de chiffre d’affaires s’affichera ici, visible seulement par Gabriel et Matis."));
    const a = el("div", "acts"); a.append(btn("Admirer la vue", "", () => closeWin("npc"))); b.append(a); }, { reopen: true });
  if (n.kind === "guide") return win("npc", "Gabriel", b => { b.append(el("p", null, "Salut " + G.me.name + ". Ici, chaque tâche est une quête. Va voir les clients sur la place : ceux qui ont du travail pour toi portent un point d’exclamation jaune."),
    el("p", null, "Quand une tâche est faite, rends la quête au client : elle sera cochée dans l’application, et tu gagnes de l’expérience et de l’or. Les quêtes rendues à l’heure rapportent plus."),
    el("p", "muted", "Tu peux aussi écrire à l’équipe depuis la boîte aux lettres, devant l’agence."));
    const a = el("div", "acts"); a.append(btn("Voir les touches", "alt", () => { closeWin("npc"); keysWin(); }), btn("Au revoir", "", () => closeWin("npc"))); b.append(a); }, { reopen: true });
  const list = G.quests.filter(q => n.kind === "board" ? !q.client : q.client === n.name);
  win("npc", n.name, b => {
    b.append(el("p", null, list.length ? (n.kind === "board" ? "Des missions internes attendent quelqu’un de motivé." : "Bonjour ! J’ai besoin de toi pour ceci :") : "Rien pour toi pour l’instant. Reviens plus tard."));
    const L = el("div", "ql"); list.forEach(q => L.append(questItem(q, openQuest))); b.append(L);
    const a = el("div", "acts"); a.append(btn("Au revoir", "alt", () => closeWin("npc"))); b.append(a);
  }, { reopen: true });
}
function openQuest(q) {
  win("quest", q.title.length > 34 ? q.title.slice(0, 32) + "…" : q.title, b => {
    const late = q.date && q.date < today();
    b.append(el("h4", null, "Objectif"), el("p", null, q.title));
    if (q.note) b.append(el("p", "muted", q.note));
    b.append(el("p", late ? "" : "muted", (q.client ? "Pour " + q.client + ". " : "Mission interne. ") + (q.date ? (late ? "En retard depuis le " : "À rendre avant le ") + fmtD(q.date) + "." : "Sans échéance.")));
    b.append(el("h4", null, "Récompenses"));
    const r = el("div", "rew"); const x1 = el("b", null, (late ? 100 : 150) + " XP"); const g1 = el("b", "g"); g1.append(el("span", "coin"), (late ? 10 : 15) + " pièces d’or"); r.append(x1, g1); b.append(r);
    b.append(el("p", "muted", late ? "Rendue en retard : pas de bonus." : "Bonus si tu la rends à l’heure."));
    const a = el("div", "acts");
    if (!G.accepted.has(q.id)) a.append(btn("Accepter", "", () => { G.accepted.add(q.id); saveAcc(); log("Quête acceptée : " + q.title); tone(660, .2); renderTracker(); closeWin("quest"); }));
    a.append(btn("Rendre la quête (tâche faite)", "lemon", e => complete(q, e.currentTarget)));
    if (G.accepted.has(q.id)) a.append(btn("Abandonner", "alt", () => { G.accepted.delete(q.id); saveAcc(); log("Quête abandonnée : " + q.title); renderTracker(); closeWin("quest"); }));
    b.append(a);
  }, { reopen: true, left: innerWidth / 2 - 200, top: 120 });
}
async function complete(q, b) {
  if (b) b.disabled = true;
  try {
    const before = G.me; const r = await api("POST", "/api/g-game/quest/" + encodeURIComponent(q.id));
    G.me = r.me; G.quests = G.quests.filter(x => x.id !== q.id); G.accepted.delete(q.id); saveAcc();
    closeWin("quest"); if (WINS.npc) closeWin("npc");
    const dx = G.me.xp - before.xp, dg = G.me.gold - before.gold;
    log("Quête terminée : " + q.title); log("Tu gagnes " + dx + " points d’expérience.", "xp"); log("Tu reçois " + dg + " pièces d’or.");
    float("+" + dx + " XP"); setTimeout(() => float("+" + dg + " or", "gold"), 400); chime();
    if (G.me.lvl > before.lvl) { banner("Niveau " + G.me.lvl, "Tu passes au niveau " + G.me.lvl + " !"); levelSound(); lvlFx(); log("Félicitations, tu as atteint le niveau " + G.me.lvl + " !", "xp"); }
    renderMe(); renderTracker(); refreshMarks();
  } catch (e) { log("Impossible de rendre la quête : " + e.message, "err"); if (b) b.disabled = false; }
}
function lvlFx() { const r = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 8, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xFFE08A, transparent: true, opacity: .55, side: THREE.DoubleSide })); r.position.set(P.x, 4, P.z); scene.add(r);
  const t0 = performance.now(); const step = () => { const k = (performance.now() - t0) / 1600; r.scale.set(1 + k, 1, 1 + k); r.material.opacity = .55 * (1 - k); r.position.set(P.x, 4, P.z); if (k < 1) requestAnimationFrame(step); else scene.remove(r); }; step(); }

function mailWin(tab) {
  win("mail", "Boîte aux lettres", b => {
    const tabs = el("div", "tabs"); const body = el("div");
    const show = t => { [...tabs.children].forEach(x => x.setAttribute("aria-pressed", String(x.dataset.t === t))); body.textContent = ""; t === "in" ? inbox(body) : sendForm(body); };
    [["in", "Réception"], ["send", "Envoyer"]].forEach(([t, n]) => { const x = el("button", null, n); x.type = "button"; x.dataset.t = t; x.onclick = () => show(t); tabs.append(x); });
    b.append(tabs, body); show(tab || "in");
  }, { reopen: true, width: 420 });
}
function inbox(body) {
  if (!G.mail.length) return body.append(el("p", "muted", "Ta boîte est vide."));
  G.mail.forEach(m => { const it = el("button", "mi" + (m.read ? "" : " unread")); it.type = "button"; const s = el("span"); s.append(el("b", null, m.subject || "(Sans objet)"), el("small", null, "De " + m.from + "   " + new Date(m.at).toLocaleDateString("fr-FR")));
    it.append(s); if (m.gold && !m.taken) { const g = el("small"); g.append(el("span", "coin"), m.gold + ""); it.append(g); }
    it.onclick = () => readMail(m); body.append(it); });
}
function readMail(m) {
  if (!m.read) { m.read = true; api("POST", "/api/g-game/mail/" + m.id + "/read").catch(() => {}); renderMailFlag(); }
  win("letter", m.subject || "Lettre", b => {
    b.append(el("p", "muted", "De " + m.from + ", le " + new Date(m.at).toLocaleString("fr-FR", { dateStyle: "long", timeStyle: "short" })));
    const t = el("p"); t.style.whiteSpace = "pre-wrap"; t.style.userSelect = "text"; t.textContent = m.body || ""; b.append(t);
    const a = el("div", "acts");
    if (m.gold && !m.taken) a.append(btn("Prendre " + m.gold + " pièces d’or", "lemon", async () => { try { const r = await api("POST", "/api/g-game/mail/" + m.id + "/take"); G.me = r.me; m.taken = true; renderMe(); float("+" + m.gold + " or", "gold"); tone(1200, .2); closeWin("letter"); mailWin(); } catch (e) { log(e.message, "err"); } }));
    a.append(btn("Répondre", "", () => { closeWin("letter"); mailWin("send"); setTimeout(() => { const f = WINS.mail; if (!f) return; f.querySelector("select").value = m.from; f.querySelector("input[name=s]").value = "Re : " + (m.subject || ""); f.querySelector("textarea").focus(); }, 30); }));
    a.append(btn("Supprimer", "alt", async () => { try { await api("POST", "/api/g-game/mail/" + m.id + "/del"); G.mail = G.mail.filter(x => x !== m); closeWin("letter"); mailWin(); } catch (e) { log(e.message, "err"); } }));
    b.append(a);
  }, { reopen: true, left: innerWidth / 2 - 200, top: 140 });
}
function sendForm(body) {
  const f = el("form"); const fld = (lab, inp) => { const d = el("div", "field"); d.append(el("label", null, lab), inp); f.append(d); return inp; };
  const to = document.createElement("select"); G.team.filter(n => n !== G.me.name).forEach(n => { const o = el("option", null, n); o.value = n; to.append(o); }); fld("Destinataire", to);
  const s = document.createElement("input"); s.name = "s"; s.maxLength = 120; fld("Objet", s);
  const t = document.createElement("textarea"); t.maxLength = 4000; fld("Message", t);
  const g = document.createElement("input"); g.type = "number"; g.min = 0; g.step = 1; g.value = 0; fld("Joindre de l’or (tu en as " + G.me.gold + ")", g);
  const a = el("div", "acts"); const sb = el("button", "gbtn lemon", "Envoyer"); sb.type = "submit"; a.append(sb); f.append(a);
  f.onsubmit = async e => { e.preventDefault(); if (!t.value.trim() && !Number(g.value)) return; sb.disabled = true;
    try { await api("POST", "/api/g-game/mail", { to: to.value, subject: s.value, body: t.value, gold: Number(g.value) || 0 }); log("Lettre envoyée à " + to.value + "."); tone(880, .15); await loadGame(); closeWin("mail"); }
    catch (err) { log("Lettre non envoyée : " + err.message, "err"); sb.disabled = false; } };
  f.addEventListener("keydown", e => e.stopPropagation());
  body.append(f);
}
function logWin() { win("log", "Journal de quêtes", b => { if (!G.quests.length) return b.append(el("p", "muted", "Aucune quête en cours."));
  const groups = {}; G.quests.forEach(q => (groups[q.client || "Agence"] = groups[q.client || "Agence"] || []).push(q));
  Object.keys(groups).sort().forEach(k => { b.append(el("h4", null, k)); const L = el("div", "ql"); groups[k].forEach(q => L.append(questItem(q, openQuest))); b.append(L); }); }, { width: 420, left: 60, top: 110 }); }
function charWin() { win("char", G.me.name, b => { const s = el("div", "stats");
  [[G.me.lvl, "Niveau"], [G.me.xp, "Expérience totale"], [G.me.done, "Quêtes rendues"], [G.me.gold, "Pièces d’or"], [G.quests.length, "Quêtes en cours"], [G.quests.filter(q => q.date && q.date < today()).length, "En retard"]].forEach(([v, l]) => { const d = el("div"); d.append(el("b", null, String(v)), el("span", null, l)); s.append(d); });
  b.append(s, el("p", "muted", "Chaque tâche faite rapporte 100 XP et 10 pièces d’or, plus 50 XP et 5 pièces si elle est faite à l’heure.")); }, { left: 60, top: 110 }); }
function bagWin() { win("bag", "Sacs", b => { const p = el("p"); p.append(el("span", "coin"), G.me.gold + " pièces d’or"); b.append(p); const g = el("div", "bag"); for (let i = 0; i < 18; i++) g.append(el("div")); b.append(g, el("p", "muted", "Les objets arrivent bientôt.")); }, { left: innerWidth - 470, top: innerHeight - 460 }); }
function keysWin() { win("keys", "Touches", b => { const k = el("div", "keys");
  [["Z Q S D (ou W A S D)", "Avancer, tourner, reculer"], ["A et E (ou Q et E)", "Pas de côté"], ["Espace", "Sauter"], ["Clic gauche maintenu", "Tourner la caméra"], ["Clic droit maintenu", "Tourner la caméra et le personnage"], ["Deux boutons", "Avancer"], ["Verr Num", "Course automatique"], ["Molette", "Zoom"], ["Clic droit sur un PNJ ou F", "Parler, ouvrir"], ["Tab", "Cibler le plus proche"], ["Entrée", "Discussion"], ["1 à 7", "Barre d’action (6 : arbre droit)"], ["L, C, B, M", "Quêtes, personnage, sacs, carte"], ["Échap", "Fermer, menu"]].forEach(([a, c]) => { k.append(el("kbd", null, a), el("span", null, c)); });
  b.append(k); }, { width: 440, left: innerWidth / 2 - 220, top: 100 }); }
function menuWin() { win("menu", "Menu du jeu", b => { const l = el("div", "menu-l"); l.append(btn("Reprendre", "lemon", () => closeWin("menu")), btn("Touches", "alt", () => { closeWin("menu"); keysWin(); }), btn("Retour à l’application", "", () => location.href = "/gestion")); b.append(l); }, { width: 300, left: innerWidth / 2 - 150, top: innerHeight / 2 - 140 }); }
function mapWin() { win("map", "Carte du Hameau", b => { const c = document.createElement("canvas"); c.id = "wmap"; c.width = 640; c.height = 640; b.append(c); drawMap(c.getContext("2d"), 640, 0, 0, 640 / 220, true); }, { width: 680, left: innerWidth / 2 - 340, top: 60 }); }

/* Carte et mini carte */
function drawMap(x, W, cx, cz, k, full) {
  x.save(); x.clearRect(0, 0, W, W); x.fillStyle = "#3E6A2C"; x.fillRect(0, 0, W, W);
  const tp = (wx, wz) => [W / 2 + (wx - cx) * k, W / 2 + (wz - cz) * k];
  x.fillStyle = "#A89A7C"; [[0, 95, 7, 140], [0, -95, 7, 140], [95, 0, 140, 7], [-95, 0, 140, 7]].forEach(([a, c, w, h]) => { const [px, pz] = tp(a - w / 2, c - h / 2); x.fillRect(px, pz, w * k, h * k); });
  let [px, pz] = tp(0, 0); x.fillStyle = "#B9AE96"; x.beginPath(); x.arc(px, pz, 30 * k, 0, 7); x.fill(); x.fillStyle = "#4DA3D9"; x.beginPath(); x.arc(px, pz, 5 * k, 0, 7); x.fill();
  [px, pz] = tp(HQ.x - 23, HQ.z - 17); x.fillStyle = "#6E675C"; x.fillRect(px, pz, 46 * k, 34 * k); x.fillStyle = "#3E6A2C"; x.fillRect(px + 2.4 * k, pz + 2.4 * k, 41.2 * k, 29.2 * k); x.fillStyle = "#6E675C"; x.fillRect(px + 13 * k, pz + 3 * k, 20 * k, 14 * k); x.fillStyle = "#1F2B57"; [[0, 0], [46, 0], [0, 34], [46, 34]].forEach(([a, c]) => { x.beginPath(); x.arc(px + a * k, pz + c * k, 4 * k, 0, 7); x.fill(); });
  const dot = (wx, wz, c, r, t) => { const [a, b2] = tp(wx, wz); x.fillStyle = c; x.beginPath(); x.arc(a, b2, r, 0, 7); x.fill(); if (t && full) { x.font = "600 12px Inter"; x.fillStyle = "#fff"; x.textAlign = "center"; x.fillText(t, a, b2 - r - 4); } };
  G.npcs.forEach(n => dot(n.x, n.z, n.kind === "mail" ? "#5AC8FA" : (n.mark && n.mark.visible) || (n === BOARD && BOARD.mark.visible) ? "#FFD21F" : "#ccc", full ? 6 : 3.5, n.name));
  Object.values(G.others).forEach(o => dot(o.pos.x, o.pos.z, "#4CD9A0", full ? 6 : 3.5, o.name));
  if (full) { x.font = "italic 26px 'Bebas Neue'"; x.fillStyle = "#C6FF33"; x.textAlign = "center"; const [a, c] = tp(HQ.x, HQ.z - 21); x.fillText("CHÂTEAU GACOLET", a, c); }
  [px, pz] = tp(P.x, P.z); x.translate(px, pz); x.rotate(-P.ry + Math.PI); x.fillStyle = "#FFE08A"; x.strokeStyle = "#000"; x.lineWidth = 1.5; x.beginPath(); x.moveTo(0, -8); x.lineTo(5.5, 6); x.lineTo(0, 3); x.lineTo(-5.5, 6); x.closePath(); x.fill(); x.stroke();
  x.restore();
}
const mm = $("#mm").getContext("2d");
$("#mm-mail").onclick = () => log("Ta boîte aux lettres est devant l’agence, à droite du perron.");

/* ---------- Entrées (comme dans Warcraft) ---------- */
const K = {}; let LMB = false, RMB = false, downAt = null, autorun = false, chatting = false;
const isTyping = () => document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
canvas.tabIndex = 0;
addEventListener("keydown", e => {
  if (chatting) { if (e.key === "Escape") closeChat(); return; }
  if (isTyping()) return;
  const k = e.code; K[k] = true;
  if (k === "Enter" || k === "Slash") { e.preventDefault(); openChat(k === "Slash" ? "/" : ""); return; }
  if (k === "Escape") { const ids = Object.keys(WINS); if (ids.length) closeWin(ids[ids.length - 1]); else if (G.target) setTarget(null); else menuWin(); return; }
  if (k === "Tab") { e.preventDefault(); targetNearest(); return; }
  if (k === "NumLock") { autorun = !autorun; return; }
  const L = (e.key || "").toLowerCase();
  if (L === "f") { const n = G.target && G.target.kind ? G.target : nearestNpc(6); if (n && dist(n) < 7) npcWin(n); else if (n) log("Tu es trop loin.", "err"); return; }
  if (L === "l") return logWin(); if (L === "c") return charWin(); if (L === "b") return bagWin(); if (L === "m") return mapWin();
  if (k === "Space" && P.grounded) { P.vy = 9; P.grounded = false; G.emote = ""; e.preventDefault(); }
  const d = /^Digit([1-7])$/.exec(k); if (d) { ACTIONS[Number(d[1]) - 1][3](); }
  if (/^(KeyW|KeyS|KeyA|KeyQ|KeyD|KeyE|ArrowUp|ArrowDown)$/.test(k)) { if (/KeyW|KeyS|ArrowUp|ArrowDown/.test(k)) autorun = false; if (G.emote) { G.emote = ""; renderBar(); } }
});
addEventListener("keyup", e => { K[e.code] = false; });
addEventListener("blur", () => { for (const k in K) K[k] = false; LMB = RMB = false; });
canvas.addEventListener("contextmenu", e => e.preventDefault());
canvas.addEventListener("mousedown", e => { canvas.focus(); if (e.button === 0) LMB = true; if (e.button === 2) RMB = true; downAt = { x: e.clientX, y: e.clientY, moved: 0, b: e.button }; if (canvas.requestPointerLock) try { canvas.requestPointerLock(); } catch (err) {} });
addEventListener("mouseup", e => { if (e.button === 0) LMB = false; if (e.button === 2) RMB = false;
  if (!LMB && !RMB && document.pointerLockElement === canvas) document.exitPointerLock();
  if (downAt && downAt.moved < 5) pick(downAt.x, downAt.y, e.button); downAt = null; });
addEventListener("mousemove", e => { if (!(LMB || RMB)) return; if (downAt) downAt.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
  CAM.yaw -= e.movementX * 0.005; CAM.pitch = Math.max(-0.3, Math.min(1.35, CAM.pitch + e.movementY * 0.004)); if (RMB) P.ry = CAM.yaw; });
canvas.addEventListener("wheel", e => { e.preventDefault(); CAM.want = Math.max(2.5, Math.min(34, CAM.want * (e.deltaY > 0 ? 1.12 : 0.89))); }, { passive: false });

const ray = new THREE.Raycaster();
function pick(cx, cy, button) {
  const v = new THREE.Vector2(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(v, camera);
  const objs = G.npcs.map(n => n.obj).concat(Object.values(G.others).map(o => o.model));
  const hit = ray.intersectObjects(objs, true)[0];
  if (!hit) { if (button === 0) setTarget(null); return; }
  let o = hit.object; while (o && !objs.includes(o)) o = o.parent;
  const n = G.npcs.find(x => x.obj === o); const pl = Object.values(G.others).find(x => x.model === o);
  if (n) { setTarget(n); if (button === 2) { if (dist(n) < 7) npcWin(n); else log("Tu es trop loin. Approche-toi.", "err"); } }
  else if (pl) setTarget({ name: pl.name, player: pl });
}
const dist = n => Math.hypot(n.x - P.x, n.z - P.z);
const nearestNpc = max => { let best = null, bd = max || 1e9; G.npcs.forEach(n => { const d = dist(n); if (d < bd) { bd = d; best = n; } }); return best; };
function targetNearest() { const list = G.npcs.slice().sort((a, b) => dist(a) - dist(b)).filter(n => dist(n) < 60); if (!list.length) return; const i = list.indexOf(G.target); setTarget(list[(i + 1) % list.length]); }
function setTarget(t) { G.target = t; const f = $("#tframe"); if (!t) { f.hidden = true; return; } f.hidden = false; $("#tf-name").textContent = t.name;
  $("#tf-sub").textContent = t.player ? "Niveau " + (t.player.lvl || 1) + ", équipe" : t.kind === "client" ? "Client" : t.kind === "mail" ? "Courrier" : t.kind === "board" ? "Missions internes" : t.kind === "chalet" ? "Objectif de l’agence" : "Direction";
  const a = $("#tf-av"); a.textContent = initials(t.name); a.style.background = t.player ? avColor(t.name) : "#F5C542"; }

function openChat(pre) { chatting = true; const i = $("#chat-in"); i.hidden = false; i.value = pre || ""; i.focus(); for (const k in K) K[k] = false; }
function closeChat() { chatting = false; const i = $("#chat-in"); i.hidden = true; i.blur(); canvas.focus(); }
$("#chat-in").addEventListener("keydown", e => { e.stopPropagation(); if (e.key === "Escape") return closeChat(); if (e.key !== "Enter") return;
  const v = e.target.value.trim(); closeChat(); if (!v) return;
  if (v[0] === "/") { const c = v.slice(1).toLowerCase(); if (/^(salut|wave|bonjour)/.test(c)) return emote("salut"); if (/^(danse|dance)/.test(c)) return emote("danse"); if (/^(assis|sit)/.test(c)) return emote("assis"); if (/^(arbre|handstand)/.test(c)) return emote("arbre");
    if (/^(s|dire|say) /.test(c)) G.sayQ = v.replace(/^\/\S+\s+/, ""); else return log("Commandes : /dire, /salut, /danse, /assis, /arbre", "err"); }
  else G.sayQ = v; });

/* ---------- Joueurs de l'équipe ---------- */
function upsertOther(p) {
  let o = G.others[p.name];
  if (!o) { const m = makeChar(p.name, { sub: "Niveau " + (p.lvl || 1), cape: 0xC6FF33, weapon: true }); scene.add(m); o = G.others[p.name] = { name: p.name, model: m, pos: { x: p.x, z: p.z, y: p.y || 0, ry: p.ry }, tgt: p, lvl: p.lvl }; m.position.set(p.x, p.y || 0, p.z); log(p.name + " arrive dans le Hameau."); }
  o.tgt = p; o.seen = performance.now();
  if (o.lvl !== p.lvl) { o.lvl = p.lvl; const t = o.model.userData.tag; t.material.map = textTex([{ t: p.name, color: "#C6FF33" }, { t: "Niveau " + p.lvl, font: "500 32px Inter", color: "#ddd" }], { h: 192 }); }
}
function bubble(model, text) {
  const old = model.userData.bub; if (old) model.remove(old);
  const t = text.length > 46 ? text.slice(0, 44) + "…" : text;
  const s = label([{ t, font: "500 34px Inter", color: "#111" }], { w: 768, h: 96, bg: "rgba(255,255,255,.92)", stroke: null }, 1.1); s.position.y = 6.3; s.scale.set(7, 0.9, 1);
  model.add(s); model.userData.bub = s; setTimeout(() => { if (model.userData.bub === s) { model.remove(s); model.userData.bub = null; } }, 7000);
}
let syncing = false;
async function sync() {
  if (syncing) return; syncing = true;
  try {
    const say = G.sayQ; G.sayQ = "";
    const r = await api("POST", "/api/g-game/pos", { x: +P.x.toFixed(2), z: +P.z.toFixed(2), y: +P.y.toFixed(2), ry: +P.ry.toFixed(3), mv: P.moving, emo: G.emote, lvl: G.me ? G.me.lvl : 1, say, since: G.sid });
    (r.players || []).forEach(upsertOther);
    const live = new Set((r.players || []).map(p => p.name));
    Object.keys(G.others).forEach(n => { if (!live.has(n)) { scene.remove(G.others[n].model); delete G.others[n]; log(n + " quitte le Hameau."); } });
    (r.says || []).forEach(s => { const p = el("p", "say"); p.append(el("b", null, "[" + s.who + "] "), document.createTextNode("dit : " + s.text)); log([p.firstChild, p.lastChild], "say");
      if (s.who === G.me.name) bubble(P.model, s.text); else if (G.others[s.who]) bubble(G.others[s.who].model, s.text); });
    G.sid = r.sid || G.sid;
  } catch (e) { if (e.status === 401) gate("Ta session a expiré. Reconnecte-toi dans l’application."); }
  syncing = false;
}
async function loadGame() {
  const r = await api("GET", "/api/g-game");
  const firstMail = G.mail.length === 0 && G.me == null;
  const unreadBefore = new Set(G.mail.filter(m => !m.read).map(m => m.id));
  G.me = r.me; G.team = r.team || []; G.mail = r.mail || [];
  const oldIds = G.quests.map(q => q.id).join(); G.quests = r.quests || [];
  [...G.accepted].forEach(id => { if (!G.quests.some(q => q.id === id)) G.accepted.delete(id); }); saveAcc();
  if (oldIds !== G.quests.map(q => q.id).join() || !G.npcs.length) buildNpcs();
  if (!firstMail) G.mail.filter(m => !m.read && !unreadBefore.has(m.id)).forEach(m => { log("Nouvelle lettre de " + m.from + "."); tone(1040, .2); });
  renderMe(); renderTracker(); renderMailFlag();
}

/* ---------- Boucle ---------- */
const clock = new THREE.Clock(); let syncT = 0, loadT = 0, saveT = 0, hintN = null;
const fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
function step() {
  requestAnimationFrame(step);
  const dt = Math.min(0.05, clock.getDelta());
  // Déplacements
  const up = K.KeyW || K.ArrowUp || (LMB && RMB) || autorun, down = K.KeyS || K.ArrowDown;
  const turnL = K.KeyA || K.ArrowLeft, turnR = K.KeyD || K.ArrowRight;
  let strafe = 0;
  if (RMB) { if (turnL) strafe -= 1; if (turnR) strafe += 1; }
  else { if (turnL) P.ry += 2.6 * dt; if (turnR) P.ry -= 2.6 * dt; if ((turnL || turnR) && !LMB) CAM.yaw = P.ry - (P.ry - CAM.yaw) * Math.pow(0.02, dt); }
  if (K.KeyQ) strafe -= 1; if (K.KeyE) strafe += 1;
  if (!LMB && !RMB && (up || down || strafe)) CAM.yaw += (P.ry - CAM.yaw) * Math.min(1, dt * 4);
  let mvF = (up ? 1 : 0) - (down ? 1 : 0);
  const speed = (G.mount ? 13 : 7) * (mvF < 0 ? 0.55 : 1);
  P.moving = !!(mvF || strafe);
  if (P.moving) {
    const sx = Math.sin(P.ry), cz = Math.cos(P.ry);
    const vx = sx * mvF - cz * strafe, vz = cz * mvF + sx * strafe;
    const len = Math.hypot(vx, vz) || 1; P.x += vx / len * speed * dt; P.z += vz / len * speed * dt;
    if (G.emote) { G.emote = ""; renderBar(); }
  }
  // Collisions
  for (const c of COLL) { const dx = P.x - c.x, dz = P.z - c.z, d = Math.hypot(dx, dz), r = c.r + 0.6; if (d < r && d > 0.0001) { P.x = c.x + dx / d * r; P.z = c.z + dz / d * r; } }
  const lim = 305; P.x = Math.max(-lim, Math.min(lim, P.x)); P.z = Math.max(-lim, Math.min(lim, P.z));
  // Saut et gravité
  const gy = heightAt(P.x, P.z); P.vy -= 24 * dt; P.y += P.vy * dt; if (P.y <= gy) { P.y = gy; P.vy = 0; P.grounded = true; }
  P.model.position.set(P.x, P.y, P.z); P.model.rotation.y = P.ry;
  animChar(P.model, dt, P.moving && P.grounded, G.mount ? 1.5 : 1, G.emote);
  // Autres joueurs : glissement doux vers la dernière position reçue
  Object.values(G.others).forEach(o => { const t = o.tgt, k = Math.min(1, dt * 8); o.pos.x += (t.x - o.pos.x) * k; o.pos.z += (t.z - o.pos.z) * k; o.pos.y += ((t.y || 0) - o.pos.y) * k;
    let dr = t.ry - o.pos.ry; while (dr > Math.PI) dr -= Math.PI * 2; while (dr < -Math.PI) dr += Math.PI * 2; o.pos.ry += dr * k;
    o.model.position.set(o.pos.x, o.pos.y, o.pos.z); o.model.rotation.y = o.pos.ry; animChar(o.model, dt, !!t.mv, 1, t.emo); });
  // PNJ : petits mouvements et regard vers le joueur proche
  const now = performance.now() / 1000;
  G.npcs.forEach((n, i) => { if (n.mark) n.mark.position.y = 6.4 + Math.sin(now * 2 + i) * 0.18; if (n.model && n.kind !== "guide") animChar(n.model, dt, false, 1, ""); });
  BOARD.mark.position.y = 5.6 + Math.sin(now * 2) * 0.18;
  CLOUDS.forEach(c => { c.position.x += dt * 1.2; if (c.position.x > 260) c.position.x = -260; });
  FLAGS.forEach((f, i) => { const p = f.geometry.attributes.position; for (let k = 0; k < p.count; k++) { const x = p.getX(k) + 1.3; p.setZ(k, Math.sin(now * 4 + x * 2.2 + i) * 0.18 * x); } p.needsUpdate = true; });
  TORCHES.forEach((t, i) => t.scale.setScalar(0.85 + Math.sin(now * 13 + i * 2) * 0.12 + Math.sin(now * 7.3) * 0.06));
  if (window.__sky) window.__sky.position.set(P.x, 0, P.z);
  MIST.forEach(m => { const u = m.userData; u.a += u.sp * dt; m.position.x = MT.x + Math.cos(u.a) * u.r; m.position.z = MT.z + Math.sin(u.a) * u.r; m.position.y = u.y + Math.sin(now * .3 + u.a * 3) * 1.5; m.material.opacity = u.op * Math.max(0, Math.min(1, (m.position.distanceTo(camera.position) - 30) / 60)); });
  { const sm = window.__smoke; if (Math.random() < dt * 4) { const p = new THREE.Mesh(new THREE.SphereGeometry(.6, 8, 6), SMOKE_M.clone()); p.position.set(sm.x, sm.y, sm.z); p.userData.t = 0; scene.add(p); sm.parts.push(p); }
    sm.parts = sm.parts.filter(p => { p.userData.t += dt; p.position.y += dt * 2.2; p.position.x += dt * .8; p.scale.setScalar(1 + p.userData.t * .9); p.material.opacity = .5 * Math.max(0, 1 - p.userData.t / 5); if (p.userData.t > 5) { scene.remove(p); p.geometry.dispose(); return false; } return true; }); }
  // Caméra derrière le personnage
  CAM.dist += (CAM.want - CAM.dist) * Math.min(1, dt * 8);
  const head = new THREE.Vector3(P.x, P.y + 3.4, P.z);
  fwd.set(-Math.sin(CAM.yaw) * Math.cos(CAM.pitch), Math.sin(CAM.pitch), -Math.cos(CAM.yaw) * Math.cos(CAM.pitch));
  tmp.copy(head).addScaledVector(fwd, CAM.dist); const gc = heightAt(tmp.x, tmp.z) + 0.6; if (tmp.y < gc) tmp.y = gc;
  camera.position.copy(tmp); camera.lookAt(head);
  P.model.visible = CAM.dist > 3.2;
  sun.position.set(P.x + 60, 90, P.z + 40); sun.target.position.set(P.x, 0, P.z);
  // Indice d'interaction
  const nn = nearestNpc(6.5); if (nn !== hintN) { hintN = nn; const h = $("#hint"); if (nn) { h.innerHTML = ""; h.append(document.createTextNode("Clic droit ou "), el("kbd", null, "F"), document.createTextNode(" : " + (nn.kind === "mail" ? "ouvrir la boîte aux lettres" : nn.kind === "board" ? "lire le tableau" : nn.kind === "chalet" ? "entrer dans le chalet" : "parler à " + nn.name))); h.classList.add("on"); } else h.classList.remove("on"); }
  // Minuteries
  if (G.hearthCd > 0) { const before = Math.ceil(G.hearthCd); G.hearthCd -= dt; if (Math.ceil(G.hearthCd) !== before) renderBar(); }
  syncT += dt; if (syncT > 0.2) { syncT = 0; sync(); }
  loadT += dt; if (loadT > 30) { loadT = 0; loadGame().catch(() => {}); }
  saveT += dt; if (saveT > 3) { saveT = 0; try { localStorage.setItem("hg-pos", JSON.stringify({ x: P.x, z: P.z, ry: P.ry })); } catch (e) {} }
  drawMap(mm, 180, P.x, P.z, 1.1, false);
  $("#mm-clock").textContent = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  renderer.render(scene, camera);
}

/* ---------- Démarrage ---------- */
(async () => {
  try { await loadGame(); }
  catch (e) { return gate(e.status === 401 ? "Ta session a expiré. Reconnecte-toi dans l’application." : "Le Hameau ne répond pas : " + e.message); }
  P.model = makeChar(G.me.name, { sub: "Niveau " + G.me.lvl, cape: 0xC6FF33, weapon: true }); scene.add(P.model); renderMe();
  renderBar(); renderTracker();
  $("#loading").hidden = true; canvas.focus();
  log("Bienvenue dans le Hameau Gacolet, " + G.me.name + ".");
  log(G.quests.length ? "Tu as " + G.quests.length + " quête" + (G.quests.length > 1 ? "s" : "") + " qui t’attend" + (G.quests.length > 1 ? "ent" : "") + ". Cherche les points d’exclamation jaunes." : "Aucune quête pour l’instant. Profite de la place.");
  if (!localStorage.getItem("hg-seen")) { try { localStorage.setItem("hg-seen", "1"); } catch (e) {} setTimeout(keysWin, 600); }
  step();
})();
})();
