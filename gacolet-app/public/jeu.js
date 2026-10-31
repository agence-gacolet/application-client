/* Hameau Gacolet : le jeu de l'agence, façon Warcraft.
   Les tâches de chacun deviennent des quêtes données par les clients ; les rendre valide la tâche dans l'application.
   Commandes comme dans Warcraft : ZQSD ou WASD, souris (clic gauche maintenu : caméra, clic droit maintenu : caméra et personnage), etc. */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { Sky } from "three/addons/objects/Sky.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
(async function () {
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

/* ---------- État ---------- */
const G = { me: null, quests: [], mail: [], team: [], others: {}, sid: 0, target: null, accepted: new Set(), npcs: [], interact: null, emote: "", mount: false, hearthCd: 0, sayQ: "" };
try { JSON.parse(localStorage.getItem("hg-acc") || "[]").forEach(id => G.accepted.add(id)); } catch (e) {}
G.rdy = new Set(); try { JSON.parse(localStorage.getItem("hg-ready") || "[]").forEach(id => G.rdy.add(id)); } catch (e) {}
const saveAcc = () => { try { localStorage.setItem("hg-acc", JSON.stringify([...G.accepted])); localStorage.setItem("hg-ready", JSON.stringify([...G.rdy])); } catch (e) {} };

/* ---------- Moteur ---------- */
const canvas = $("#gl");
/* Qualité graphique : automatique au premier lancement (moyenne), puis baisse toute seule si l'ordinateur rame.
   Réglable dans le menu (Échap). */
let Q = ""; try { Q = localStorage.getItem("hg-q") || ""; } catch (e) {}
const LITE = /lite/.test(location.search);
if (LITE) Q = "basse";
const AUTO = !Q; if (!Q) Q = "moyenne";
const LOW = Q === "basse", MID = Q === "moyenne", HIGH = Q === "haute";
const QK = LOW ? 0.12 : MID ? 0.4 : 1;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !LOW, powerPreference: "high-performance", preserveDrawingBuffer: LITE });
renderer.setPixelRatio(LOW ? 0.85 : MID ? Math.min(devicePixelRatio, 1.25) : Math.min(devicePixelRatio, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.72;
renderer.shadowMap.enabled = !LITE && !LOW; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xA9C2DA, 0.0021);
/* Ciel réaliste (diffusion atmosphérique) et lumière d'ambiance tirée du ciel */
const SUN_DIR = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(57), THREE.MathUtils.degToRad(205));
function makeSky() { const k = new Sky(); k.scale.setScalar(4500); const u = k.material.uniforms; u.turbidity.value = 5.5; u.rayleigh.value = 1.4; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.82; u.sunPosition.value.copy(SUN_DIR); return k; }
const sky = makeSky(); scene.add(sky);
{ const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene(); es.add(makeSky()); scene.environment = pm.fromScene(es, 0.02).texture; scene.environmentIntensity = 0.55; }
const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 2200);
const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.55, 0.92); if (HIGH) composer.addPass(bloom); composer.addPass(new OutputPass());
const grade = new ShaderPass({ uniforms: { tDiffuse: { value: null }, sat: { value: 1.32 }, con: { value: 1.08 } }, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: "uniform sampler2D tDiffuse; uniform float sat; uniform float con; varying vec2 vUv; void main(){ vec4 c = texture2D(tDiffuse, vUv); float l = dot(c.rgb, vec3(0.299, 0.587, 0.114)); vec3 r = mix(vec3(l), c.rgb, sat); r = (r - 0.5) * con + 0.5 + 0.015; gl_FragColor = vec4(clamp(r, 0.0, 1.0), c.a); }" });
composer.addPass(grade);
function resize() { renderer.setSize(innerWidth, innerHeight, false); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener("resize", resize); resize();

scene.add(new THREE.HemisphereLight(0xD6E6FF, 0x5B6B3A, 0.55));
const sun = new THREE.DirectionalLight(0xFFE6C4, 2.7);
sun.position.copy(SUN_DIR).multiplyScalar(150); sun.castShadow = true;
sun.shadow.mapSize.set(HIGH ? 4096 : 2048, HIGH ? 4096 : 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6;
Object.assign(sun.shadow.camera, { left: -90, right: 90, top: 90, bottom: -90, near: 10, far: 400 });
scene.add(sun); scene.add(sun.target);
const WIND = { value: 0 };

/* ---------- Chargement des modèles (personnages KayKit, nature Quaternius, licences CC0) ---------- */
const manager = new THREE.LoadingManager(); manager.onProgress = (u, a, b) => { const p = document.querySelector("#loading p"); if (p) p.textContent = "Chargement du monde… " + Math.round(a / b * 100) + " %"; };
const gl = new GLTFLoader(manager), load = u => new Promise((ok, ko) => gl.load(u, ok, undefined, ko));
const texL = new THREE.TextureLoader(manager);
const A = { chars: {}, hair: {}, clips: [], nat: {}, h: {} };
const OUTFITS = ["Male_Ranger", "Male_Peasant", "Female_Ranger", "Female_Peasant"];
const HAIRS = ["Hair_SimpleParted", "Hair_Long", "Hair_Buns", "Hair_Beard", "Hair_Buzzed", "Head_Male", "Head_Female"];
const NAT = ["CommonTree_1", "CommonTree_2", "CommonTree_3", "CommonTree_4", "CommonTree_5", "Pine_1", "Pine_2", "Pine_3", "Pine_4", "Pine_5", "TwistedTree_1", "TwistedTree_2", "Bush_Common", "Bush_Common_Flowers", "Rock_Medium_1", "Rock_Medium_2", "Rock_Medium_3", "Grass_Common_Tall", "Grass_Wispy_Tall", "Grass_Common_Short", "Flower_3_Group", "Flower_4_Group", "Fern_1", "Plant_1_Big", "Clover_1", "Mushroom_Common"];
try {
  await Promise.all([
    ...OUTFITS.map(c => load("/hameau/heroes/" + c + ".glb").then(g => A.chars[c] = g)),
    ...HAIRS.map(c => load("/hameau/heroes/" + c + ".glb").then(g => A.hair[c] = g)),
    load("/hameau/heroes/anims.glb").then(g => A.clips.push(...g.animations)),
    load("/hameau/extra/knight.glb").then(g => A.knight = g),
    load("/hameau/extra/horse.glb").then(g => A.horse = g),
    load("/hameau/extra/range_rover_sport.glb").then(g => A.car = g),
    ...NAT.map(n => load("/hameau/nature/" + n + ".gltf").then(g => A.nat[n] = g.scene)),
    new Promise(ok => { A.rockTex = texL.load("/hameau/nature/Rocks_Diffuse.webp", ok, undefined, ok); }),
    // Textures réalistes Poly Haven (CC0) et ciel en photo HDR
    ...["leafy_grass", "rocky_terrain_02", "brown_mud_leaves_01", "cobblestone_floor_04", "castle_wall_varriation", "medieval_blocks_02"].flatMap(n => ["diff", "nor"].map(k => new Promise(ok => { const t = texL.load("/hameau/tex/" + n + "_" + k + ".jpg", ok, undefined, ok); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (k === "diff") t.colorSpace = THREE.SRGBColorSpace; (A.tx = A.tx || {})[n + "_" + k] = t; }))),
    new Promise(ok => new RGBELoader(manager).load("/hameau/tex/sky_2k.hdr", t => { A.hdr = t; ok(); }, undefined, () => ok()))
  ]);
} catch (e) { return gate("Le monde n’a pas pu se charger. Recharge la page. (" + (e.message || e) + ")"); }
try { A.kclips = retargetToKnight(); } catch (e) { console.warn("reciblage", e); A.kclips = []; }
A.rockTex.colorSpace = THREE.SRGBColorSpace; A.rockTex.wrapS = A.rockTex.wrapT = THREE.RepeatWrapping;
const TX = A.tx || {}; if (TX.rocky_terrain_02_diff) A.rockTex = TX.rocky_terrain_02_diff;
if (A.hdr) { A.hdr.mapping = THREE.EquirectangularReflectionMapping; scene.remove(sky); scene.background = A.hdr; scene.backgroundIntensity = 0.9; scene.backgroundBlurriness = 0.0;
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromEquirectangular(A.hdr).texture; scene.environmentIntensity = 0.8; scene.fog.color.set(0xB4C6D6); }

/* Vent : fait onduler l'herbe et les feuillages */
function addWind(mat, amp) {
  if (!mat || mat.userData.wind) return; mat.userData.wind = 1;
  mat.onBeforeCompile = sh => { sh.uniforms.uTime = WIND;
    sh.vertexShader = "uniform float uTime;\n" + sh.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      #else
        vec3 ip = vec3(0.0);
      #endif
      float hh = max(position.y, 0.0);
      transformed.x += sin(uTime * 1.7 + ip.x * 0.31 + ip.z * 0.17) * ${amp.toFixed(4)} * hh;
      transformed.z += cos(uTime * 1.25 + ip.z * 0.27) * ${(amp * 0.6).toFixed(4)} * hh;`); };
}
/* Pose un modèle en milliers d'exemplaires avec un seul appel de dessin par morceau */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function instance(name, list, o) {
  o = o || {}; const src = A.nat[name]; if (!src || !list.length) return; src.updateMatrixWorld(true);
  src.traverse(m => { if (!m.isMesh) return;
    const im = new THREE.InstancedMesh(m.geometry, m.material, list.length);
    list.forEach((p, i) => { _q.setFromAxisAngle(_v.set(0, 1, 0), p.r); _m.compose(_s.set(p.x, p.y, p.z), _q, new THREE.Vector3(p.s, p.s, p.s)); im.setMatrixAt(i, _m.multiply(m.matrixWorld)); });
    im.castShadow = !!o.shadow; im.receiveShadow = true; im.frustumCulled = false;
    const mats = [].concat(m.material); mats.forEach(mt => { if (o.wind && (/Leaves|Leaf|Grass|Flowers/i.test(mt.name) || o.allWind)) addWind(mt, o.wind); if (o.double) mt.side = THREE.DoubleSide; mt.envMapIntensity = 0.6; });
    scene.add(im); });
}

const M = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, metalness: 0 });
const MET = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.75 });
function paintTex(w, h, fn, rep) { const c = document.createElement("canvas"); c.width = w; c.height = h; fn(c.getContext("2d"), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; if (rep) t.repeat.set(rep[0], rep[1]); t.anisotropy = 8; return t; }
let tseed = 3; const trnd = () => (tseed = (tseed * 16807) % 2147483647) / 2147483647;
const GRASS = paintTex(512, 512, (x, w, h) => { x.fillStyle = "#5C8A2E"; x.fillRect(0, 0, w, h);
  const blob = (cx, cy, r, c) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, c); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); };
  for (let i = 0; i < 90; i++) { const c = ["rgba(122,160,52,.45)", "rgba(70,112,36,.45)", "rgba(150,170,70,.35)", "rgba(52,90,30,.4)"][i % 4]; const px = trnd() * w, py = trnd() * h, r = 30 + trnd() * 90; for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) blob(px + dx, py + dy, r, c); }
  for (let i = 0; i < 9000; i++) { const g = 100 + trnd() * 80; x.fillStyle = "rgba(" + (60 + trnd() * 50 | 0) + "," + (g | 0) + "," + (30 + trnd() * 25 | 0) + "," + (0.25 + trnd() * 0.3) + ")"; x.fillRect(trnd() * w, trnd() * h, 1 + trnd() * 2, 2 + trnd() * 5); } }, [1, 1]);
const STONE = TX.castle_wall_varriation_diff ? (TX.castle_wall_varriation_diff.repeat.set(3, 1.5), TX.castle_wall_varriation_diff) : paintTex(256, 256, (x, w, h) => { x.fillStyle = "#6E675C"; x.fillRect(0, 0, w, h); const bh = 32;
  for (let row = 0; row < h / bh; row++) { const off = row % 2 ? 0 : 32; for (let col = -1; col < w / 64 + 1; col++) { const v = 95 + trnd() * 45; x.fillStyle = "rgb(" + (v + 8 | 0) + "," + (v | 0) + "," + (v - 12 | 0) + ")"; x.fillRect(col * 64 + off + 2, row * bh + 2, 60, bh - 4);
    x.fillStyle = "rgba(255,255,255,.08)"; x.fillRect(col * 64 + off + 2, row * bh + 2, 60, 3); x.fillStyle = "rgba(0,0,0,.18)"; x.fillRect(col * 64 + off + 2, row * bh + bh - 6, 60, 4); } } });
const COBBLE = TX.cobblestone_floor_04_diff ? (TX.cobblestone_floor_04_diff.repeat.set(14, 14), TX.cobblestone_floor_04_diff) : paintTex(256, 256, (x, w, h) => { x.fillStyle = "#5E574C"; x.fillRect(0, 0, w, h); for (let i = 0; i < 260; i++) { const v = 95 + trnd() * 45; x.fillStyle = "rgb(" + (v | 0) + "," + (v - 6 | 0) + "," + (v - 18 | 0) + ")"; x.beginPath(); x.ellipse(trnd() * w, trnd() * h, 8 + trnd() * 10, 6 + trnd() * 8, trnd() * 3, 0, 7); x.fill(); } }, [16, 16]);
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
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4; return tx;
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
/* Piste de terre : une grande boucle autour du Hameau, avec des bosses naturelles et des ornières */
const TRAIL_PTS = [[0, 62], [35, 102], [85, 124], [140, 104], [176, 52], [182, -10], [152, -72], [104, -108], [42, -122], [-28, -116], [-92, -92], [-140, -32], [-150, 38], [-112, 94], [-56, 108], [-18, 84]];
const TRAIL = []; { const P = TRAIL_PTS.map(p => new THREE.Vector3(p[0], 0, p[1])); const cv = new THREE.CatmullRomCurve3(P, true, "catmullrom", 0.5); const n = 900, L = cv.getLength();
  for (let i = 0; i <= n; i++) { const v = cv.getPointAt(i / n); TRAIL.push({ x: v.x, z: v.z, s: L * i / n }); } }
const TB = new Map(), TCELL = 24; for (let i = 0; i < TRAIL.length - 1; i++) { const a = TRAIL[i], b = TRAIL[i + 1]; const cx0 = Math.floor(Math.min(a.x, b.x) / TCELL) - 1, cx1 = Math.floor(Math.max(a.x, b.x) / TCELL) + 1, cz0 = Math.floor(Math.min(a.z, b.z) / TCELL) - 1, cz1 = Math.floor(Math.max(a.z, b.z) / TCELL) + 1;
  for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) { const k = cx + "," + cz; if (!TB.has(k)) TB.set(k, []); TB.get(k).push(i); } }
// distance à la piste (et position le long de la piste) : sert au relief, à la texture et à la végétation
function trailInfo(x, z) { const L = TB.get(Math.floor(x / TCELL) + "," + Math.floor(z / TCELL)); if (!L) return null; let bd = 1e9, bs = 0;
  for (const i of L) { const a = TRAIL[i], b = TRAIL[i + 1], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1; let t = ((x - a.x) * dx + (z - a.z) * dz) / l2; t = Math.max(0, Math.min(1, t)); const px = a.x + dx * t, pz = a.z + dz * t, d = Math.hypot(x - px, z - pz); if (d < bd) { bd = d; bs = a.s + (b.s - a.s) * t; } }
  return { d: bd, s: bs }; }
const TRAIL_W = 6.5;
function trailBump(x, z) { const t = trailInfo(x, z); if (!t || t.d > TRAIL_W + 3) return 0; const f = 1 - THREE.MathUtils.smoothstep(t.d, TRAIL_W - 1.5, TRAIL_W + 3);
  const b = Math.pow(Math.sin(t.s * 0.045), 2) * 1.0 + Math.pow(Math.sin(t.s * 0.017 + 1.3), 2) * 1.2 + Math.sin(t.s * 0.31 + x * 0.05) * 0.08;
  const rut = -0.35 * Math.max(0, 1 - Math.abs(Math.abs(t.d) - 2.2) / 0.9); return f * (b - 0.9 + rut); }
const baseHeight = (x, z) => { const d = Math.hypot(x, z); const hill = d > 80 ? (Math.sin(x * 0.05) + Math.cos(-z * 0.04)) * Math.min(6, (d - 80) * 0.04) : 0; return Math.max(hill, mountainH(x, z) + (mountainH(x, z) > 0 ? hill * 0.3 : 0)); };
const QUARTERS = [
  { id: "taverne", name: "Taverne du Sanglier", sub: "Restaurants et métiers de bouche", x: -60, z: 38 },
  { id: "forge", name: "Forge des Bâtisseurs", sub: "Bâtiment et artisans", x: -66, z: -30 },
  { id: "relais", name: "Relais des Charrons", sub: "Automobile et matériel", x: 62, z: 46 },
  { id: "arene", name: "Arène d’entraînement", sub: "Sport et bien-être", x: 104, z: -22 },
  { id: "guildes", name: "Maison des Guildes", sub: "Services, formation et création", x: -106, z: -22 }];
QUARTERS.forEach(q => { q.ry = Math.atan2(-q.x, -q.z); q.c = Math.cos(q.ry); q.s = Math.sin(q.ry); });
// Terrain aplani autour de chaque quartier
QUARTERS.forEach(q => { q.h0 = baseHeight(q.x, q.z); });
const heightAt = (x, z) => { let h = baseHeight(x, z); for (const q of QUARTERS) { const d = Math.hypot(x - q.x, z - q.z); if (d < 32) { const w = d < 24 ? 1 : 1 - (d - 24) / 8; h = h * (1 - w) + q.h0 * w; } } return h + trailBump(x, z); };
const GRASS_R = TX.leafy_grass_diff || GRASS;
const groundMat = new THREE.MeshStandardMaterial({ map: GRASS_R, roughness: 1, envMapIntensity: 0.4 });
if (TX.leafy_grass_nor) { groundMat.normalMap = TX.leafy_grass_nor; TX.leafy_grass_nor.repeat.set(220, 220); groundMat.normalScale.set(0.6, 0.6); }
groundMat.onBeforeCompile = sh => { sh.uniforms.tRock = { value: A.rockTex }; sh.uniforms.tDirt = { value: TX.brown_mud_leaves_01_diff || DIRT }; sh.uniforms.tPaint = { value: GRASS };
  sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute float aTrail; varying float vTrail; varying vec3 vWP; varying vec3 vWN;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal); vTrail = aTrail;");
  sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform sampler2D tRock; uniform sampler2D tDirt; uniform sampler2D tPaint; varying float vTrail; varying vec3 vWP; varying vec3 vWN;").replace("#include <map_fragment>", `
    vec3 g1 = texture2D(map, vWP.xz * 0.16).rgb, g1b = texture2D(map, vWP.xz * 0.037 + 0.21).rgb, g2 = texture2D(tPaint, vWP.xz * 0.0071 + 0.37).rgb;
    vec3 grass = mix(mix(g1, g1b, 0.45) * vec3(0.95, 1.18, 0.72), g2 * 1.05, 0.45) * (0.8 + g2.g * 0.4);
    vec3 rock = mix(texture2D(tRock, vWP.xz * 0.05).rgb, texture2D(tRock, vWP.xz * 0.011).rgb, 0.4);
    float slope = 1.0 - clamp(vWN.y, 0.0, 1.0);
    float rk = clamp(smoothstep(0.22, 0.42, slope) + smoothstep(30.0, 55.0, vWP.y) * 0.85, 0.0, 1.0);
    vec3 col = mix(grass, rock, rk);
    float sn = smoothstep(70.0, 86.0, vWP.y + g2.g * 8.0) * (1.0 - smoothstep(0.55, 0.8, slope) * 0.6);
    col = mix(col, vec3(0.92, 0.95, 1.0), sn);
    vec3 dirt = texture2D(tDirt, vWP.xz * 0.12).rgb * (0.85 + g2.r * 0.3);
    float tm = smoothstep(0.15, 0.75, vTrail + (g1.g - 0.5) * 0.35);
    col = mix(col, dirt, tm);
    diffuseColor.rgb *= col;`); };
const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900, 330, 330), groundMat);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
{ const p = ground.geometry.attributes.position, tr = new Float32Array(p.count); for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = -p.getY(i); p.setZ(i, heightAt(x, z)); const t = trailInfo(x, z); tr[i] = t ? 1 - THREE.MathUtils.smoothstep(t.d, TRAIL_W - 2, TRAIL_W + 1.5) : 0;
    const rd = Math.hypot(x, z) > 29 ? Math.max(Math.abs(z) < 165 ? 1 - THREE.MathUtils.smoothstep(Math.abs(x), 2.6, 5.2) : 0, Math.abs(x) < 165 ? 1 - THREE.MathUtils.smoothstep(Math.abs(z), 2.6, 5.2) : 0) : 0; tr[i] = Math.max(tr[i], rd); }
  ground.geometry.setAttribute("aTrail", new THREE.BufferAttribute(tr, 1)); ground.geometry.computeVertexNormals(); }
scene.add(ground);

// Place pavée et chemins
const plaza = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ map: COBBLE, normalMap: TX.cobblestone_floor_04_nor ? (TX.cobblestone_floor_04_nor.repeat.set(14, 14), TX.cobblestone_floor_04_nor) : null, roughness: .9 })); plaza.rotation.x = -Math.PI / 2; plaza.position.y = 0.03; plaza.receiveShadow = true; scene.add(plaza);
const ring = new THREE.Mesh(new THREE.RingGeometry(29.4, 30.4, 64), M(0x8C826C)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; scene.add(ring);
// (les chemins droits sont maintenant peints dans le sol, voir aTrail)

// Fontaine
{ const bm = new THREE.MeshStandardMaterial({ map: TX.medieval_blocks_02_diff || null, normalMap: TX.medieval_blocks_02_nor || null, color: TX.medieval_blocks_02_diff ? 0xFFFFFF : 0x9A9384, roughness: .9 });
  if (TX.medieval_blocks_02_diff) { TX.medieval_blocks_02_diff.repeat.set(4, 1); TX.medieval_blocks_02_nor.repeat.set(4, 1); }
  const lathe = (pts, mat, y) => { const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), 48); const m = new THREE.Mesh(g, mat); m.position.y = y || 0; m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
  lathe([[0, 0], [5.6, 0], [5.8, 0.15], [5.8, 1.1], [5.4, 1.3], [5.0, 1.25], [4.9, 0.4], [0, 0.4]], bm);
  lathe([[0, 0], [0.9, 0], [0.7, 0.4], [0.55, 2.2], [0.75, 2.6], [2.2, 2.75], [2.3, 3.0], [1.9, 3.15], [0.5, 3.1], [0.4, 3.9], [0.9, 4.1], [1.1, 4.3], [0.8, 4.45], [0.2, 4.6], [0, 4.6]], bm, 0.4);
  const water = new THREE.MeshStandardMaterial({ color: 0x2F6F86, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.85, envMapIntensity: 1.3 });
  const w = new THREE.Mesh(new THREE.CircleGeometry(4.95, 48), water); w.rotation.x = -Math.PI / 2; w.position.y = 1.05; scene.add(w); window.__water = w;
  const w2 = new THREE.Mesh(new THREE.CircleGeometry(2.05, 32), water); w2.rotation.x = -Math.PI / 2; w2.position.y = 3.55; scene.add(w2);
  // filets d'eau qui retombent du bassin haut
  const jm = new THREE.MeshStandardMaterial({ color: 0xBFE6F2, transparent: true, opacity: 0.45, roughness: 0.1 }); window.__jets = [];
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, j = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 2.2, 6, 1, true), jm); j.position.set(Math.cos(a) * 2.25, 2.35, Math.sin(a) * 2.25); scene.add(j); window.__jets.push(j); }
  solid(0, 0, 5.9); }

const stone0N = () => TX.castle_wall_varriation_nor || null;
// Le château de l'agence
// Épée tenue en main droite : placée à chaque image d'après la position de la main
const SWORD_M = { blade: new THREE.MeshStandardMaterial({ color: 0xC9CED4, metalness: .95, roughness: .22 }), steel: new THREE.MeshStandardMaterial({ color: 0x55575B, metalness: .9, roughness: .4 }), grip: new THREE.MeshStandardMaterial({ color: 0x3A2414, roughness: .85 }) };
function makeSword() { const s = new THREE.Group(), L = 1.75;
  const bl = new THREE.Mesh(new THREE.BoxGeometry(0.11, L, 0.025), SWORD_M.blade); bl.position.y = L / 2 + 0.05; s.add(bl);
  const fu = new THREE.Mesh(new THREE.BoxGeometry(0.03, L * .7, 0.03), SWORD_M.steel); fu.position.y = L * .38 + 0.05; s.add(fu);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.078, 0.2, 4), SWORD_M.blade); tip.scale.z = .3; tip.rotation.y = Math.PI / 4; tip.position.y = L + 0.15; s.add(tip);
  const gd = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.05, 0.06), SWORD_M.steel); gd.position.y = 0.025; s.add(gd);
  const gr = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.34, 8), SWORD_M.grip); gr.position.y = -0.17; s.add(gr);
  const pm = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 10), SWORD_M.steel); pm.rotation.x = Math.PI / 2; pm.position.y = -0.36; s.add(pm);
  s.traverse(o => { if (o.isMesh) o.castShadow = true; }); return s; }
/* ---------- Mobilier façon taverne de Hurlevent : bois massif, ferrures, bougies ---------- */
const FM = { wood: new THREE.MeshStandardMaterial({ map: paintTex(256, 256, (x, w, h) => { x.fillStyle = "#6E4424"; x.fillRect(0, 0, w, h); for (let i = 0; i < 90; i++) { x.strokeStyle = "rgba(" + (40 + trnd() * 40 | 0) + "," + (22 + trnd() * 20 | 0) + ",8," + (0.25 + trnd() * 0.3) + ")"; x.lineWidth = 1 + trnd() * 3; const y = trnd() * h; x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(w * .3, y + trnd() * 10 - 5, w * .7, y + trnd() * 10 - 5, w, y); x.stroke(); } }, [1, 1]), roughness: .85 }),
  dark: M(0x3B2412), iron: MET(0x3A3633), gold: MET(0xC9A13B), red: M(0x8E1B1B), blue: M(0x23407A), glow: new THREE.MeshBasicMaterial({ color: 0xFFD27A }), flame: new THREE.MeshBasicMaterial({ color: 0xFFB13B }),
  floor: new THREE.MeshStandardMaterial({ map: paintTex(256, 256, (x, w, h) => { for (let r = 0; r < 8; r++) { const v = 95 + trnd() * 35; x.fillStyle = "rgb(" + (v * .8 | 0) + "," + (v * .52 | 0) + "," + (v * .3 | 0) + ")"; x.fillRect(0, r * 32, w, 32); x.fillStyle = "rgba(20,10,0,.6)"; x.fillRect(0, r * 32 + 30, w, 2); const k = trnd() * w; x.fillRect(k, r * 32, 2, 32); } }, [6, 3]), roughness: .9 }) };
const fbox = (w, h, d, m, x, y, z, p) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = b.receiveShadow = true; if (p) p.add(b); return b; };
function fTable(w, d) { const g = new THREE.Group(); fbox(w, .32, d, FM.wood, 0, 1.66, 0, g); fbox(w - .3, .22, d - .3, FM.dark, 0, 1.4, 0, g);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => { fbox(.42, 1.5, .42, FM.dark, a * (w / 2 - .35), .75, b * (d / 2 - .35), g); fbox(.5, .14, .5, FM.iron, a * (w / 2 - .35), 1.56, b * (d / 2 - .35), g); fbox(.56, .2, .56, FM.dark, a * (w / 2 - .35), .1, b * (d / 2 - .35), g); });
  [-1, 1].forEach(a => fbox(.1, .36, d + .04, FM.iron, a * (w / 2 - .5), 1.66, 0, g)); return g; }
function fChair(ry) { const g = new THREE.Group(); fbox(1.15, .22, 1.1, FM.wood, 0, 1.05, 0, g); fbox(1.1, .1, 1.05, FM.red, 0, 1.2, 0.02, g);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => fbox(.18, 1.05, .18, FM.dark, a * .45, .52, b * .42, g));
  fbox(1.15, 1.5, .18, FM.wood, 0, 1.95, -.48, g); fbox(.14, 1.7, .22, FM.dark, -.56, 1.9, -.48, g); fbox(.14, 1.7, .22, FM.dark, .56, 1.9, -.48, g);
  [-.56, .56].forEach(x => { const k = new THREE.Mesh(new THREE.SphereGeometry(.13, 8, 6), FM.gold); k.position.set(x, 2.82, -.48); g.add(k); }); g.rotation.y = ry || 0; return g; }
function fCandle(p, x, y, z) { const c = new THREE.Mesh(new THREE.CylinderGeometry(.08, .09, .4, 8), new THREE.MeshStandardMaterial({ color: 0xF2E6C8, roughness: .6 })); c.position.set(x, y + .2, z); p.add(c);
  const f = new THREE.Mesh(new THREE.SphereGeometry(.07, 6, 5), FM.flame); f.scale.y = 1.8; f.position.set(x, y + .5, z); p.add(f); TORCHES.push(f); }
function fShelf(n) { const g = new THREE.Group(); fbox(3, 4.8, .9, FM.dark, 0, 2.4, 0, g); const cols = [0x8E1B1B, 0x23407A, 0x2F5D2B, 0x7A5A1E, 0x4A2A5E, 0x6B4A2A];
  for (let r = 0; r < 4; r++) { fbox(2.7, .1, .8, FM.wood, 0, .5 + r * 1.1, .06, g); let x = -1.25; while (x < 1.15) { const bw = .12 + trnd() * .14, bh = .6 + trnd() * .3; fbox(bw, bh, .55, M(cols[(trnd() * cols.length) | 0]), x + bw / 2, .55 + r * 1.1 + bh / 2, .12, g); x += bw + .02; } }
  return g; }
function fRug(w, d, c1, c2) { const t = paintTex(256, 256, (x, W, H) => { x.fillStyle = c1; x.fillRect(0, 0, W, H); x.strokeStyle = c2; x.lineWidth = 10; x.strokeRect(14, 14, W - 28, H - 28); x.lineWidth = 3; x.strokeRect(30, 30, W - 60, H - 60);
    x.fillStyle = c2; x.translate(W / 2, H / 2); x.rotate(Math.PI / 4); x.fillRect(-40, -40, 80, 80); x.fillStyle = c1; x.fillRect(-24, -24, 48, 48); });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t, roughness: 1 })); m.rotation.x = -Math.PI / 2; m.position.y = .06; m.receiveShadow = true; return m; }
function fBanner(c, txt) { const g = new THREE.Group(); fbox(2.6, .14, .14, FM.dark, 0, 0, 0, g);
  const b = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 4), new THREE.MeshStandardMaterial({ map: textTex([{ t: txt, font: "italic 150px 'Bebas Neue'" }], { w: 128, h: 256, bg: c, color: "#C6FF33", stroke: null }), roughness: .9, side: THREE.DoubleSide })); b.position.set(0, -2.05, .03); g.add(b);
  const tri = new THREE.Mesh(new THREE.ConeGeometry(1.1, .8, 3), M(0x1A1A18)); tri.rotation.set(Math.PI, 0, 0); tri.scale.z = .05; tri.position.set(0, -4.4, .03); g.add(tri); return g; }
function fFire() { const g = new THREE.Group(); fbox(5, 4.6, 1.4, M(0x6A655E), 0, 2.3, 0, g); fbox(5.6, .4, 1.8, FM.dark, 0, 4.4, .15, g); fbox(2.8, 2.2, .3, new THREE.MeshBasicMaterial({ color: 0x120A05 }), 0, 1.3, .62, g);
  for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(.28, 1 + trnd() * .5, 6), FM.flame); f.position.set(-0.75 + i * .5, .75, .5); g.add(f); TORCHES.push(f); }
  fbox(2, .25, .4, FM.wood, 0, .3, .5, g); return g; }
function fChandelier() { const g = new THREE.Group(); const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, .09, 6, 20), FM.iron); ring.rotation.x = Math.PI / 2; g.add(ring);
  fbox(.06, 1.6, .06, FM.iron, 0, .8, 0, g); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; fCandle(g, Math.cos(a) * 1.4, 0, Math.sin(a) * 1.4); } return g; }
function fPainting(w, h) { const g = new THREE.Group(); fbox(w + .4, h + .4, .15, FM.gold, 0, 0, 0, g);
  const t = paintTex(256, 192, (x, W, H) => { const sk = x.createLinearGradient(0, 0, 0, H); sk.addColorStop(0, "#9CC4E8"); sk.addColorStop(1, "#E8E2D0"); x.fillStyle = sk; x.fillRect(0, 0, W, H);
    x.fillStyle = "#6E7F8E"; x.beginPath(); x.moveTo(0, H * .8); x.lineTo(W * .35, H * .22); x.lineTo(W * .6, H * .55); x.lineTo(W * .8, H * .3); x.lineTo(W, H * .7); x.lineTo(W, H); x.lineTo(0, H); x.fill();
    x.fillStyle = "#F4F6F8"; x.beginPath(); x.moveTo(W * .29, H * .32); x.lineTo(W * .35, H * .22); x.lineTo(W * .42, H * .33); x.fill(); x.fillStyle = "#3E6A2C"; x.fillRect(0, H * .8, W, H * .2);
    x.fillStyle = "#6B3E1E"; x.fillRect(W * .45, H * .62, W * .14, H * .12); x.fillStyle = "#3A2210"; x.beginPath(); x.moveTo(W * .43, H * .63); x.lineTo(W * .52, H * .53); x.lineTo(W * .61, H * .63); x.fill(); x.fillStyle = "#FFD27A"; x.fillRect(W * .5, H * .66, W * .03, H * .04); });
  const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: t, roughness: .8 })); p.position.z = .08; g.add(p); return g; }
function fPlaque(txt, w) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w || 5, 1), new THREE.MeshStandardMaterial({ map: textTex([{ t: txt, font: "400 64px 'MedievalSharp', Georgia" }], { w: 640, h: 128, bg: "#3B2412", color: "#F5D27A", stroke: null }), roughness: .8 })); return p; }
function fDesk(name) { const g = fTable(3.4, 1.9); fbox(.9, .05, 1.2, M(0xE9D7AE), -.5, 1.84, .1, g); fbox(.7, .05, .9, M(0xDCC79A), .2, 1.85, -.2, g);
  const ink = new THREE.Mesh(new THREE.CylinderGeometry(.12, .14, .22, 8), M(0x1A1A2A)); ink.position.set(1.05, 1.93, -.4); g.add(ink); const q = new THREE.Mesh(new THREE.CylinderGeometry(.015, .03, .9, 4), M(0xF2F2F2)); q.position.set(1.1, 2.3, -.35); q.rotation.z = -.4; g.add(q);
  for (let i = 0; i < 3; i++) fbox(.75, .16, .55, M([0x8E1B1B, 0x23407A, 0x2F5D2B][i]), 1.15, 1.9 + i * .16, .45, g); fCandle(g, -1.35, 1.82, -.6);
  if (name) { const pl = fPlaque(name, 1.6); pl.scale.set(1, .55, 1); pl.position.set(0, 2.05, .97); g.add(pl); } return g; }
function fChest() { const g = new THREE.Group(); fbox(2, 1.1, 1.2, FM.wood, 0, .55, 0, g); const lid = new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, 2, 10, 1, false, 0, Math.PI), FM.wood); lid.rotation.z = Math.PI / 2; lid.position.y = 1.1; lid.castShadow = true; g.add(lid);
  [-.7, 0, .7].forEach(x => fbox(.12, 1.2, 1.26, FM.iron, x, .6, 0, g)); fbox(.3, .35, .1, FM.gold, 0, .9, .62, g); return g; }
function fBarrel() { const b = new THREE.Mesh(new THREE.CylinderGeometry(.75, .75, 1.9, 12), FM.wood); b.position.y = .95; b.castShadow = true; const g = new THREE.Group(); g.add(b);
  [.25, 1.65].forEach(y => { const r = new THREE.Mesh(new THREE.TorusGeometry(.8, .06, 4, 16), FM.iron); r.rotation.x = Math.PI / 2; r.position.y = y; g.add(r); }); return g; }
function fRack() { const g = new THREE.Group(); fbox(3, .25, .5, FM.dark, 0, .3, 0, g); fbox(3, .2, .3, FM.dark, 0, 3, 0, g); [-1.4, 1.4].forEach(x => fbox(.25, 3.2, .25, FM.dark, x, 1.6, 0, g));
  [-.8, 0, .8].forEach(x => { const s = makeSword(); s.position.set(x, .9, .15); s.scale.setScalar(.9); g.add(s); }); return g; }
function fPlant() { const g = new THREE.Group(); const p = new THREE.Mesh(new THREE.CylinderGeometry(.5, .38, .8, 10), M(0x8A4A2A)); p.position.y = .4; g.add(p);
  for (let i = 0; i < 7; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(.35, 6, 5), M(0x3E7A2C)); l.position.set(Math.cos(i) * .3, 1 + trnd() * .7, Math.sin(i * 1.7) * .3); l.scale.set(1, 1.4, .5); g.add(l); } return g; }
const HQ = { x: 0, z: -66 };
{ const g = new THREE.Group(), stone = new THREE.MeshStandardMaterial({ map: STONE, normalMap: TX.castle_wall_varriation_nor ? (TX.castle_wall_varriation_nor.repeat.set(3, 1.5), TX.castle_wall_varriation_nor) : null, roughness: .95 }), stoneD = new THREE.MeshStandardMaterial({ map: STONE, normalMap: stone0N(), color: 0xC8C0B0, roughness: .95 });
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
  // Donjon creux : le rez-de-chaussée abrite les bureaux de l'agence (salle de réunion au centre, Clara à gauche, Matis et Gabriel à droite)
  { const KW = 32, KZ0 = -15, KZ1 = 1, KH = 7;
    fbox(KW, 20 - KH, KZ1 - KZ0, stone, 0, KH + (20 - KH) / 2, (KZ0 + KZ1) / 2, g);
    fbox(KW, KH, 1, stone, 0, KH / 2, KZ0 + .5, g); fbox(1, KH, KZ1 - KZ0, stone, -KW / 2 + .5, KH / 2, (KZ0 + KZ1) / 2, g); fbox(1, KH, KZ1 - KZ0, stone, KW / 2 - .5, KH / 2, (KZ0 + KZ1) / 2, g);
    fbox(KW / 2 - 2.2, KH, 1, stone, -(KW / 4 + 1.1), KH / 2, .5, g); fbox(KW / 2 - 2.2, KH, 1, stone, KW / 4 + 1.1, KH / 2, .5, g); fbox(4.4, KH - 5, 1, stoneD, 0, 5 + (KH - 5) / 2, .5, g);
    [-6, 6].forEach(x => { fbox(1, KH, 8, stone, x, KH / 2, -10, g); fbox(1, KH, 3, stone, x, KH / 2, -1.5, g); fbox(1, KH - 5, 3, stone, x, 5 + (KH - 5) / 2, -4.5, g); });
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(KW - 2, KZ1 - KZ0 - 1), FM.floor); fl.rotation.x = -Math.PI / 2; fl.position.set(0, .04, (KZ0 + KZ1) / 2 - .5); fl.receiveShadow = true; g.add(fl);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(KW - 2, KZ1 - KZ0 - 1), M(0x4A2E18)); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, KH - .02, (KZ0 + KZ1) / 2 - .5); g.add(ceil);
    for (let x = -14; x <= 14; x += 3.5) fbox(.45, .5, KZ1 - KZ0 - 1, FM.dark, x, KH - .3, (KZ0 + KZ1) / 2 - .5, g);
    // portes ouvertes en bois clouté
    [-1, 1].forEach(s => { const d = fbox(2.1, 5, .2, FM.wood, s * 2.9, 2.5, 1.9, g); d.rotation.y = s * 1.2; });
    const kpl = fPlaque("Agence Gacolet", 5); kpl.position.set(0, 6, 1.03); g.add(kpl);
    // Salle de réunion
    const T = fTable(3.4, 8.4); T.position.set(0, 0, -7.6); g.add(T);
    const map = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3), new THREE.MeshStandardMaterial({ map: paintTex(192, 256, (x, w, h) => { x.fillStyle = "#E2CC98"; x.fillRect(0, 0, w, h); x.strokeStyle = "#7A5A2A"; x.lineWidth = 3; x.strokeRect(8, 8, w - 16, h - 16); x.strokeStyle = "#9A7B52"; x.lineWidth = 5; x.beginPath(); x.arc(w / 2, h / 2, 60, 0, 7); x.stroke(); x.fillStyle = "#4DA3D9"; x.beginPath(); x.arc(w / 2, h / 2, 12, 0, 7); x.fill(); x.fillStyle = "#6E675C"; x.fillRect(w / 2 - 22, 30, 44, 34); x.fillStyle = "#8E1B1B"; x.font = "bold 22px Georgia"; x.fillText("X", w * .75, h * .8); }), roughness: .9 }));
    map.rotation.x = -Math.PI / 2; map.rotation.z = .1; map.position.set(0, 1.84, -7.2); g.add(map);
    [-10.4, -7.6, -4.8].forEach(z => { const a = fChair(Math.PI / 2); a.position.set(-2.4, 0, z); g.add(a); const b = fChair(-Math.PI / 2); b.position.set(2.4, 0, z); g.add(b); });
    const hc = fChair(0); hc.position.set(0, 0, -12.6); hc.scale.set(1.15, 1.2, 1.15); g.add(hc);
    const fr = fFire(); fr.position.set(0, 0, -13.75); g.add(fr); g.add(Object.assign(fRug(6.5, 11, "#7A1717", "#C9A13B"), {}));  g.children[g.children.length - 1].position.set(0, .06, -7.4);
    [-3.6, 3.6].forEach(x => { const b = fBanner("#14120E", "G"); b.position.set(x, 6.2, -13.9); g.add(b); });
    const ch = fChandelier(); ch.position.set(0, 5.4, -7.6); g.add(ch);
    [-5.2, 5.2].forEach(x => { const br = fBarrel(); br.position.set(x * .88, 0, -.9); br.scale.setScalar(.8); g.add(br); });
    // Bureau de Clara
    const dC = fDesk("Clara"); dC.position.set(-11, 0, -10.6); g.add(dC); const cC = fChair(0); cC.position.set(-11, 0, -12.3); g.add(cC);
    const sh1 = fShelf(); sh1.position.set(-15, 0, -7); sh1.rotation.y = Math.PI / 2; g.add(sh1); const sh2 = fShelf(); sh2.position.set(-15, 0, -3.4); sh2.rotation.y = Math.PI / 2; g.add(sh2);
    const rC = fRug(5.5, 6.5, "#23407A", "#C9A13B"); rC.position.set(-11, .06, -8.5); g.add(rC); const pC = fPlant(); pC.position.set(-7.3, 0, -13.2); g.add(pC); const kC = fChest(); kC.position.set(-11, 0, -1.2); g.add(kC);
    const fC = fPainting(3, 2); fC.position.set(-11, 4.3, -13.9); g.add(fC);
    const plC = fPlaque("Bureau de Clara", 4.6); plC.position.set(-5.44, 5.95, -4.5); plC.rotation.y = Math.PI / 2; plC.scale.set(.8, .8, 1); g.add(plC);
    // Bureau de Matis et Gabriel
    [["Matis", 8.6], ["Gabriel", 12.9]].forEach(([n, x]) => { const d = fDesk(n); d.position.set(x, 0, -10.6); g.add(d); const c = fChair(0); c.position.set(x, 0, -12.3); g.add(c); });
    const sh3 = fShelf(); sh3.position.set(15, 0, -6); sh3.rotation.y = -Math.PI / 2; g.add(sh3); const rk = fRack(); rk.position.set(15.3, 0, -2.4); rk.rotation.y = -Math.PI / 2; g.add(rk);
    const rM = fRug(7.5, 6.5, "#7A1717", "#C9A13B"); rM.position.set(10.8, .06, -8.5); g.add(rM); const pM = fPlant(); pM.position.set(7.3, 0, -1.2); g.add(pM);
    const ptg = fPainting(4.2, 2.6); ptg.position.set(10.8, 4.4, -13.9); g.add(ptg); const ptl = fPlaque("Objectif : le chalet", 3.6); ptl.scale.set(.7, .5, 1); ptl.position.set(10.8, 2.75, -13.88); g.add(ptl);
    const plM = fPlaque("Matis et Gabriel", 4.6); plM.position.set(5.44, 5.95, -4.5); plM.rotation.y = -Math.PI / 2; plM.scale.set(.8, .8, 1); g.add(plM);
    const plR = fPlaque("Salle de réunion", 4.6); plR.position.set(0, 6.2, -.02); plR.rotation.y = Math.PI; plR.scale.set(.8, .8, 1); g.add(plR);
    [[-11, -7], [0, -7], [10.8, -7]].forEach(([x, z]) => { const c = fChandelier(); c.scale.setScalar(.7); c.position.set(x, 5.8, z); if (x) g.add(c); });
    // Fenêtres de l'étage
    [-11, -3.7, 3.7, 11].forEach(x => { const wdw = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3), new THREE.MeshBasicMaterial({ color: 0xFFD27A })); wdw.position.set(x, 13, KZ1 + .02); g.add(wdw); });
  }
  const kr = new THREE.Mesh(new THREE.ConeGeometry(23, 10, 4), roofM); kr.rotation.y = Math.PI / 4; kr.scale.set(1, 1, .49); kr.position.set(0, 25, -7); kr.castShadow = true; g.add(kr);
  { const n0 = g.children.length; tower(0, -7, 4.5, 14, true); for (let i = n0; i < g.children.length; i++) g.children[i].position.y += 20; }
  // Bannières de l'agence sur la façade
  [-14, 14].forEach(x => { const b = new THREE.Mesh(new THREE.PlaneGeometry(3, 7), new THREE.MeshStandardMaterial({ map: textTex([{ t: "G", font: "italic 160px 'Bebas Neue'" }], { w: 128, h: 300, bg: "#0E0E0D", color: "#C6FF33", stroke: null }), roughness: .9 }));
    b.position.set(x, 6.8, D / 2 + 1.25); g.add(b); });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.2), new THREE.MeshBasicMaterial({ map: textTex([{ t: "AGENCE GACOLET", font: "italic 92px 'Bebas Neue'" }], { w: 1024, h: 192, bg: "#0E0E0D", color: "#C6FF33", stroke: null }) }));
  sign.position.set(0, H + 1.6, D / 2 + 1.35); g.add(sign);
  // Torches de part et d'autre de la porte
  [-5.6, 5.6].forEach(x => { const f = new THREE.Mesh(new THREE.SphereGeometry(.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xFFA733 })); f.position.set(x, 6, D / 2 + 1.6); g.add(f); TORCHES.push(f);
    const l = new THREE.PointLight(0xFFA040, 30, 22, 1.4); l.position.copy(f.position); g.add(l); });
  g.position.set(HQ.x, 0, HQ.z); scene.add(g);
  // Collisions : murs (porte ouverte), tours, donjon
  const seg = (x1, z1, x2, z2, r) => { const n = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / r); for (let i = 0; i <= n; i++) solid(HQ.x + x1 + (x2 - x1) * i / n, HQ.z + z1 + (z2 - z1) * i / n, r); };
  seg(-W / 2, -D / 2, W / 2, -D / 2, 1.4); seg(-W / 2, -D / 2, -W / 2, D / 2, 1.4); seg(W / 2, -D / 2, W / 2, D / 2, 1.4);
  seg(-W / 2, D / 2, -4.6, D / 2, 1.4); seg(4.6, D / 2, W / 2, D / 2, 1.4);
  seg(-16, -15, 16, -15, .8); seg(-16, -15, -16, 1, .8); seg(16, -15, 16, 1, .8); seg(-16, 1, -2.7, 1, .8); seg(2.7, 1, 16, 1, .8);
  [-6, 6].forEach(x => { seg(x, -14.5, x, -6.6, .45); seg(x, -2.4, x, .8, .45); }); seg(0, -11.2, 0, -4, 1.6); solid(HQ.x, HQ.z - 13.4, 2.2); [-11, 8.6, 12.9].forEach(x => solid(HQ.x + x, HQ.z - 10.6, 1.5));
  [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]].forEach(([x, z]) => solid(HQ.x + x, HQ.z + z, 4.3)); [-6.5, 6.5].forEach(x => solid(HQ.x + x, HQ.z + D / 2 + .5, 2.6)); }

// Quartiers des clients, regroupés par métier, chacun autour d'un bâtiment à son image
const QM = { plaster: new THREE.MeshStandardMaterial({ map: paintTex(256, 256, (x, w, h) => { x.fillStyle = "#E6D6B0"; x.fillRect(0, 0, w, h); for (let i = 0; i < 1500; i++) { const v = trnd(); x.fillStyle = "rgba(" + (110 + v * 60 | 0) + "," + (90 + v * 50 | 0) + ",60," + (0.04 + trnd() * 0.08) + ")"; x.fillRect(trnd() * w, trnd() * h, 2 + trnd() * 12, 2 + trnd() * 6); } }, [2, 1]), roughness: .95 }),
  stone: new THREE.MeshStandardMaterial({ map: STONE, roughness: .95 }), plank: FM.wood,
  shingle: paintTex(128, 128, (x, w, h) => { x.fillStyle = "#cfcfcf"; x.fillRect(0, 0, w, h); for (let r = 0; r < 8; r++) for (let c = 0; c < 6; c++) { const v = 150 + trnd() * 90; x.fillStyle = "rgb(" + (v | 0) + "," + (v | 0) + "," + (v | 0) + ")"; x.fillRect(c * 22 + (r % 2) * 11 - 11, r * 16, 20, 14); x.fillStyle = "rgba(0,0,0,.35)"; x.fillRect(c * 22 + (r % 2) * 11 - 11, r * 16 + 13, 22, 3); } }, [.22, .22]) };
const roofMat = c => new THREE.MeshStandardMaterial({ map: QM.shingle, color: c, roughness: .75 });
function prism(w, d, h, mat) { const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false }); geo.translate(0, 0, -w / 2); const m = new THREE.Mesh(geo, mat); m.rotation.y = Math.PI / 2; m.castShadow = m.receiveShadow = true; return m; }
function house(o) { const g = new THREE.Group(), w = o.w, d = o.d, h1 = o.h1 || 5, h2 = o.h2 || 0, rh = o.rh || 6, top = h1 + h2;
  fbox(w + .8, 1.6, d + .8, M(0x5E5A52), 0, 0, 0, g); fbox(w, h1, d, o.wall || QM.stone, 0, h1 / 2, 0, g);
  if (h2) { const W2 = w + .9, D2 = d + .9; fbox(W2, h2, D2, QM.plaster, 0, h1 + h2 / 2, 0, g);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => fbox(.4, h2 + .1, .4, FM.dark, a * W2 / 2, h1 + h2 / 2, b * D2 / 2, g));
    [h1 + .15, top - .15].forEach(y => { fbox(W2 + .1, .35, .4, FM.dark, 0, y, D2 / 2, g); fbox(W2 + .1, .35, .4, FM.dark, 0, y, -D2 / 2, g); fbox(.4, .35, D2 + .1, FM.dark, W2 / 2, y, 0, g); fbox(.4, .35, D2 + .1, FM.dark, -W2 / 2, y, 0, g); });
    for (let x = -W2 / 2 + W2 / 4; x < W2 / 2; x += W2 / 4) { fbox(.32, h2, .35, FM.dark, x, h1 + h2 / 2, D2 / 2 + .02, g); fbox(.32, h2, .35, FM.dark, x, h1 + h2 / 2, -D2 / 2 - .02, g); }
    [-1, 1].forEach(s => { const b = fbox(.3, Math.hypot(W2 / 4, h2) - .2, .34, FM.dark, s * W2 * .37, h1 + h2 / 2, D2 / 2 + .04, g); b.rotation.z = s * Math.atan2(W2 / 4, h2); }); }
  const R = prism(w + 2.4, d + 2.2, rh, roofMat(o.roof || 0xB8432E)); R.position.y = top; g.add(R);
  const gb = prism(w + .9, d + .9, rh - .5, h2 ? QM.plaster : (o.wall || QM.stone)); gb.position.y = top; gb.scale.set(1, 1, .96); g.add(gb);
  fbox(.5, .5, w + 2.6, FM.dark, 0, top + rh + .1, 0, g).rotation.y = Math.PI / 2;
  if (o.chimney !== false) fbox(1.4, rh + 2.4, 1.4, QM.stone, w * .3, top + (rh + 2.4) / 2 - .4, -d * .18, g);
  const dw = o.door || 2.6, dh = Math.min(h1 - .6, o.doorH || 3.8); fbox(dw + .7, dh + .5, .3, QM.stone, 0, (dh + .5) / 2, d / 2 + .05, g); fbox(dw, dh, .3, FM.wood, 0, dh / 2, d / 2 + .15, g);
  [.3, .7].forEach(k => fbox(dw + .05, .14, .34, FM.iron, 0, dh * k, d / 2 + .16, g)); const kn = new THREE.Mesh(new THREE.TorusGeometry(.18, .04, 6, 12), FM.gold); kn.position.set(dw * .3, dh * .5, d / 2 + .34); g.add(kn);
  const win = (x, y, z, ry) => { const f = fbox(1.5, 1.9, .2, FM.dark, x, y, z, g); f.rotation.y = ry; const p = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 1.55), FM.glow); p.position.set(x + Math.sin(ry) * .12, y, z + Math.cos(ry) * .12); p.rotation.y = ry; g.add(p);
    const c1 = fbox(.08, 1.6, .06, FM.dark, x + Math.sin(ry) * .14, y, z + Math.cos(ry) * .14, g); c1.rotation.y = ry; const c2 = fbox(1.2, .08, .06, FM.dark, x + Math.sin(ry) * .14, y, z + Math.cos(ry) * .14, g); c2.rotation.y = ry; };
  [-w * .3, w * .3].forEach(x => win(x, h1 * .55, d / 2 + .02, 0)); if (h2) [-w * .32, 0, w * .32].forEach(x => win(x, h1 + h2 / 2, d / 2 + .47, 0));
  [-d * .2, d * .2].forEach(z => { win(w / 2 + .02, h1 * .55, z, Math.PI / 2); win(-w / 2 - .02, h1 * .55, z, -Math.PI / 2); });
  return g; }
function hangSign(txt, sub) { const g = new THREE.Group(); fbox(.3, .3, 3, FM.dark, 0, 0, 1.4, g); [-.8, .8].forEach(x => { const c = fbox(.05, 1, .05, FM.iron, x, -.5, 2.4, g); });
  const t = textTex([{ t: txt, font: "400 70px 'MedievalSharp', Georgia" }].concat(sub ? [{ t: sub, font: "500 34px Georgia", color: "#E9D7AE" }] : []), { w: 768, h: sub ? 256 : 160, bg: "#3B2412", color: "#F5D27A", stroke: null });
  const p = new THREE.Mesh(new THREE.BoxGeometry(3.6, sub ? 1.3 : .8, .14), [FM.dark, FM.dark, FM.dark, FM.dark, new THREE.MeshStandardMaterial({ map: t }), new THREE.MeshStandardMaterial({ map: t })]); p.position.set(0, sub ? -1.6 : -1.3, 2.4); p.rotation.y = Math.PI / 2; g.add(p); return g; }
function signPost(txt, sub) { const g = new THREE.Group(); [-2.1, 2.1].forEach(x => { fbox(.4, 4.6, .4, FM.dark, x, 2.3, 0, g); const c = new THREE.Mesh(new THREE.ConeGeometry(.32, .6, 4), FM.dark); c.position.set(x, 4.9, 0); g.add(c); });
  const t = textTex([{ t: txt, font: "400 76px 'MedievalSharp', Georgia" }, { t: sub, font: "italic 500 36px Georgia", color: "#E9D7AE" }], { w: 1024, h: 256, bg: "#3B2412", color: "#F5D27A", stroke: null });
  const p = new THREE.Mesh(new THREE.BoxGeometry(5, 1.35, .2), [FM.dark, FM.dark, FM.dark, FM.dark, new THREE.MeshStandardMaterial({ map: t }), new THREE.MeshStandardMaterial({ map: t })]); p.position.y = 3.6; p.castShadow = true; g.add(p);
  [-2.5, 2.5].forEach(x => fbox(.1, 1.45, .26, FM.iron, x, 3.6, 0, g)); return g; }
const qWorld = (q, lx, lz) => [q.x + lx * q.c + lz * q.s, q.z - lx * q.s + lz * q.c];
const SECTOR = { "le petit mas": "taverne", "paillotte bassamoise": "taverne", "gaufrement bon": "taverne", "domaine pagezi": "taverne",
  "france etancheite": "forge", "meyer-pic": "forge", "la vie la construction": "forge", "total habitat 360": "forge", "ar climatisation": "forge", "kr thermolaquage": "forge",
  "sos pare-brise codognan": "relais", "sos pare-brise vendargues": "relais", "locamex": "relais",
  "sport defense": "arene", "hugo maitre nageur": "arene", "the new me montpellier": "arene",
  "delta sud formation": "guildes", "only clean": "guildes", "flora design": "guildes", "insolent": "guildes", "bonobo": "guildes" };
const ALL_CLIENTS = ["AR Climatisation", "Bonobo", "Delta Sud Formation", "Domaine Pagezi", "Flora Design", "France Étanchéité", "Gaufrement Bon", "Hugo Maître Nageur", "Insolent", "KR Thermolaquage", "La Vie La Construction", "Le Petit Mas", "Locamex", "Meyer-Pic", "Only Clean", "Paillotte Bassamoise", "SOS Pare-Brise Codognan", "SOS Pare-Brise Vendargues", "Sport Défense", "The New Me Montpellier", "Total Habitat 360"];
const normName = n => String(n || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const quarterOf = c => QUARTERS.find(q => q.id === (SECTOR[normName(c)] || "guildes"));
const DUMMIES = [];
function rectSolid(q, lx, lz, w, d) { const r = Math.min(w, d) / 2, n = Math.max(1, Math.round(Math.max(w, d) / r)); for (let i = 0; i < n; i++) { const k = n === 1 ? 0 : i / (n - 1) - .5; const [x, z] = qWorld(q, lx + (w >= d ? k * (w - 2 * r) : 0), lz + (w >= d ? 0 : k * (d - 2 * r))); solid(x, z, r + .3); } }
QUARTERS.forEach(q => { const g = new THREE.Group(), y0 = heightAt(q.x, q.z); g.position.set(q.x, y0, q.z); g.rotation.y = q.ry; scene.add(g); q.y = y0;
  const sp = signPost(q.name, q.sub); sp.position.set(-11, 0, 10); sp.rotation.y = .5; g.add(sp); { const [x, z] = qWorld(q, -11, 10); solid(x, z, .8); }
  const add = (o, x, z, ry) => { o.position.set(x, 0, z); o.rotation.y = ry || 0; g.add(o); return o; };
  if (q.id === "taverne") { const h = house({ w: 17, d: 11, h1: 5, h2: 4.6, rh: 6.5, roof: 0xB8432E }); add(h, 0, -6); rectSolid(q, 0, -6, 18, 12);
    const hs = hangSign("Taverne", "du Sanglier"); hs.position.set(6.5, 6.6, -.5 + .1); g.add(hs);
    [[-11, 1], [-11, -5], [11, 1], [11, -5]].forEach(([x, z]) => { const t = fTable(2.8, 1.8); add(t, x, z); [-1.5, 1.5].forEach(dz => { const b = fbox(2.8, .3, .7, FM.wood, x, 1.05, z + dz, g); fbox(.3, 1, .5, FM.dark, x - 1.1, .5, z + dz, g); fbox(.3, 1, .5, FM.dark, x + 1.1, .5, z + dz, g); });
      const mug = new THREE.Mesh(new THREE.CylinderGeometry(.18, .16, .4, 8), FM.wood); mug.position.set(x + .5, 2.02, z); g.add(mug); rectSolid(q, x, z, 3, 3.4); });
    [[-6.5, .4], [-5.2, .9], [5.4, .6]].forEach(([x, z]) => add(fBarrel(), x, z)); [[-8.5, 4], [8.5, 4]].forEach(([x, z]) => { fbox(.3, 4.2, .3, FM.dark, x, 2.1, z, g); const l = new THREE.Mesh(new THREE.BoxGeometry(.5, .7, .5), FM.glow); l.position.set(x, 4.5, z); g.add(l); TORCHES.push(l); }); }
  if (q.id === "forge") { const h = house({ w: 14, d: 10, h1: 6.5, rh: 5.5, roof: 0x5E6B7A }); add(h, -3, -6); rectSolid(q, -3, -6, 15, 11);
    const hs = hangSign("Forge", "des Bâtisseurs"); hs.position.set(3.8, 5.6, -.9); g.add(hs);
    [[6, -1.5], [12, -1.5], [6, -10], [12, -10]].forEach(([x, z]) => fbox(.45, 5, .45, FM.dark, x, 2.5, z, g)); const lr = fbox(7.4, .3, 10, roofMat(0x5E6B7A), 9, 5.3, -5.7, g); lr.rotation.z = -.18;
    fbox(2.4, 3, 2.4, QM.stone, 10.5, 1.5, -8, g); const fo = fbox(1.2, .9, .2, new THREE.MeshBasicMaterial({ color: 0xFF7A1F }), 10.5, 1.2, -6.75, g); TORCHES.push(fo); fbox(1, 6, 1, QM.stone, 10.5, 5.5, -8.4, g);
    fbox(1.4, .5, .7, FM.iron, 8, 1.6, -4, g); fbox(.7, 1.2, .5, FM.iron, 8, .7, -4, g); const hm = fbox(.18, .9, .18, FM.wood, 8.4, 2.1, -4, g); hm.rotation.z = 1.2; fbox(.4, .3, .3, FM.iron, 8.05, 2.25, -4, g);
    add(fBarrel(), 6.5, -8.5); add(fRack(), 12.4, -4.5, -Math.PI / 2); rectSolid(q, 9, -5.7, 7, 10);
    for (let i = 0; i < 6; i++) fbox(1.6, .5, .9, QM.stone, -11 + (i % 3) * 1.7, .25 + Math.floor(i / 3) * .5, -1 - (i % 2) * .2, g); }
  if (q.id === "relais") { const h = house({ w: 18, d: 12, h1: 7.5, rh: 7, roof: 0x8A5A2E, wall: QM.plank, door: 5.2, doorH: 5.6 }); add(h, 0, -7); rectSolid(q, 0, -7, 19, 13);
    const hs = hangSign("Relais", "des Charrons"); hs.position.set(-5.5, 6.8, -1 + .1); g.add(hs);
    [[-11, -2], [-11.5, -5], [11, -3]].forEach(([x, z], i) => { const hb = fbox(2.2, 1.3, 1.4, M(0xD9B95A), x, .65 + (i === 1 ? 1.3 : 0), z, g); if (i === 1) hb.position.z = -2; });
    [[9.5, 1.5], [12.5, 1]].forEach(([x, z], i) => { const wh = new THREE.Mesh(new THREE.TorusGeometry(1.2, .14, 6, 16), FM.wood); wh.position.set(x, 1.25, z); wh.rotation.set(0, .4, .1 * i); wh.castShadow = true; g.add(wh); for (let k = 0; k < 4; k++) { const s = fbox(.1, 2.3, .1, FM.wood, x, 1.25, z, g); s.rotation.set(0, .4, k * Math.PI / 4); } });
    const cart = new THREE.Group(); fbox(3.2, .3, 2, FM.wood, 0, 1.4, 0, cart); [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([a, b]) => { const w0 = new THREE.Mesh(new THREE.TorusGeometry(.6, .1, 5, 12), FM.dark); w0.position.set(a * 1, .7, b * 1.05); cart.add(w0); }); fbox(3.2, .7, .15, FM.wood, 0, 1.9, 1, cart); fbox(3.2, .7, .15, FM.wood, 0, 1.9, -1, cart); add(cart, -12, 4, .6); rectSolid(q, -12, 4, 3.4, 2.4); }
  if (q.id === "arene") { const R = 12, cz = -5, n = 44; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; if (Math.abs(Math.sin(a / 2)) < .14) continue; const x = Math.sin(a) * R, z = cz + Math.cos(a) * R, hh = 3.4 + (i % 2) * .5;
      fbox(.7, hh, .7, FM.wood, x, hh / 2, z, g); const tp = new THREE.Mesh(new THREE.ConeGeometry(.42, .9, 5), FM.wood); tp.position.set(x, hh + .45, z); g.add(tp); if (i % 2 === 0) { const [wx, wz] = qWorld(q, x, z); solid(wx, wz, .9); } }
    fbox(2 * R, .4, .4, FM.dark, 0, 2.6, cz - R, g);
    [-2.6, 2.6].forEach(x => { fbox(.6, 7, .6, FM.dark, x, 3.5, cz + R, g); const b = fBanner("#23407A", "G"); b.position.set(x, 6.4, cz + R + .4); g.add(b); });
    const arch = textTex([{ t: "Arène", font: "400 80px 'MedievalSharp', Georgia" }], { w: 512, h: 128, bg: "#3B2412", color: "#F5D27A", stroke: null }); const ap = new THREE.Mesh(new THREE.BoxGeometry(5.8, 1.2, .25), [FM.dark, FM.dark, FM.dark, FM.dark, new THREE.MeshStandardMaterial({ map: arch }), new THREE.MeshStandardMaterial({ map: arch })]); ap.position.set(0, 6.9, cz + R); g.add(ap);
    [[-5, -9], [0, -11], [5, -9]].forEach(([x, z]) => { const d = new THREE.Group(); fbox(.3, 3, .3, FM.wood, 0, 1.5, 0, d); fbox(2.4, .3, .3, FM.wood, 0, 2.6, 0, d); const body = new THREE.Mesh(new THREE.CylinderGeometry(.75, .65, 1.8, 10), M(0xC8A86A)); body.position.y = 2.4; body.castShadow = true; d.add(body);
      const hd = new THREE.Mesh(new THREE.SphereGeometry(.5, 10, 8), M(0xC8A86A)); hd.position.y = 3.65; d.add(hd); [1.7, 3.1].forEach(y => { const r = new THREE.Mesh(new THREE.TorusGeometry(.72, .06, 4, 14), M(0x6B4A2A)); r.rotation.x = Math.PI / 2; r.position.y = y; d.add(r); });
      add(d, x, z); const [wx, wz] = qWorld(q, x, z); DUMMIES.push({ obj: d, x: wx, z: wz, shake: 0 }); solid(wx, wz, .8); });
    add(fRack(), -9, -2, Math.PI / 2); add(fRack(), 9, -2, -Math.PI / 2); }
  if (q.id === "guildes") { const h = house({ w: 14, d: 12, h1: 6, h2: 5, rh: 7, roof: 0x3E5FB0 }); add(h, 0, -7); rectSolid(q, 0, -7, 15, 13);
    const tw = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.3, 19, 16), QM.stone); tw.position.set(-8.6, 9.5, -9); tw.castShadow = true; g.add(tw); const tr = new THREE.Mesh(new THREE.ConeGeometry(4, 7, 16), roofMat(0x3E5FB0)); tr.position.set(-8.6, 22.5, -9); tr.castShadow = true; g.add(tr);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(.4, 8, 6), FM.gold); tip.position.set(-8.6, 26.2, -9); g.add(tip); { const [x, z] = qWorld(q, -8.6, -9); solid(x, z, 3.6); }
    [[-4, "#8E1B1B"], [4, "#23407A"]].forEach(([x, c]) => { const b = fBanner(c, "G"); b.position.set(x, 10.6, -.4); g.add(b); });
    const hs = hangSign("Guildes", "Services et savoirs"); hs.position.set(5.5, 5.4, -.9); g.add(hs);
    [[6, 1], [-5, 1.2]].forEach(([x, z]) => add(fChest(), x, z, .3)); }
});
// Forêt : feuillus en plaine, sapins sur la montagne, quelques arbres tordus
const onTrail = (x, z, m) => { const t = trailInfo(x, z); return t && t.d < TRAIL_W + (m || 0); };
const blocked = (x, z, m) => onTrail(x, z, 2 + (m || 0)) || QUARTERS.some(q => Math.hypot(x - q.x, z - q.z) < 27 + (m || 0)) || (Math.hypot(x - 62, z + 40) < 20) || Math.hypot(x, z) < 34 + (m || 0) || (Math.abs(x - HQ.x) < 30 + (m || 0) && Math.abs(z - HQ.z) < 26 + (m || 0)) || (Math.abs(x) < 5 + (m || 0) && Math.abs(z) < 170) || (Math.abs(z) < 5 + (m || 0) && Math.abs(x) < 170);
const PL = {}; const put = (n, x, z, s, extraY) => (PL[n] = PL[n] || []).push({ x, z, y: heightAt(x, z) + (extraY || 0), s, r: rnd() * Math.PI * 2 });
for (let i = 0; i < Math.round(420 * (LOW ? 0.35 : MID ? 0.7 : 1)); i++) { const a = rnd() * Math.PI * 2, d = 42 + Math.pow(rnd(), .8) * 330, x = Math.cos(a) * d, z = Math.sin(a) * d;
  if (blocked(x, z, 3)) continue; const mh = mountainH(x, z); if (mh > 68) continue;
  const pine = mh > 6 || rnd() < .25, s = 1.7 + rnd() * 1.1, n = pine ? "Pine_" + (1 + Math.floor(rnd() * 5)) : rnd() < .05 ? "TwistedTree_" + (1 + Math.floor(rnd() * 2)) : "CommonTree_" + (1 + Math.floor(rnd() * 5));
  put(n, x, z, /Twisted/.test(n) ? s * .55 : s, -0.2); solid(x, z, /Twisted/.test(n) ? 1.6 : 0.9); }
// Rochers : gros blocs en plaine et falaises sur la montagne
for (let i = 0; i < 130; i++) { const a = rnd() * Math.PI * 2, d = 45 + rnd() * 320, x = Math.cos(a) * d, z = Math.sin(a) * d; if (blocked(x, z, 2)) continue;
  const big = rnd() < .35 || mountainH(x, z) > 10, s = big ? 3 + rnd() * 5 : 0.8 + rnd() * 1.4; put("Rock_Medium_" + (1 + Math.floor(rnd() * 3)), x, z, s, -s * 0.35); if (s > 1.4) solid(x, z, s * 1.2); }
for (let i = 0; i < 60; i++) { const a = rnd() * Math.PI * 2, r = 25 + rnd() * 55, x = MT.x + Math.cos(a) * r, z = MT.z + Math.sin(a) * r, s = 4 + rnd() * 6; put("Rock_Medium_" + (1 + Math.floor(rnd() * 3)), x, z, s, -s * .4); solid(x, z, s * 1.1); }
// Buissons, fougères, fleurs, champignons
for (let i = 0; i < Math.round(520 * (LOW ? 0.25 : MID ? 0.6 : 1)); i++) { const a = rnd() * Math.PI * 2, d = 33 + Math.pow(rnd(), 1.2) * 240, x = Math.cos(a) * d, z = Math.sin(a) * d; if (blocked(x, z) || mountainH(x, z) > 40) continue;
  const k = rnd(); put(k < .3 ? (k < .12 ? "Bush_Common_Flowers" : "Bush_Common") : k < .45 ? "Fern_1" : k < .6 ? "Plant_1_Big" : k < .85 ? (k < .72 ? "Flower_3_Group" : "Flower_4_Group") : k < .95 ? "Clover_1" : "Mushroom_Common", x, z, k < .3 ? 1.5 + rnd() : k < .45 ? .45 + rnd() * .25 : 1 + rnd() * .6); }
// Herbe haute : des milliers de touffes autour du village
{ const near = Math.round(9000 * QK), far = Math.round(7000 * QK * (HIGH ? 1 : 0.5));
  for (let i = 0; i < near + far; i++) { const fr = i >= near, a = rnd() * Math.PI * 2, d = fr ? 120 + rnd() * 200 : 30.5 + Math.pow(rnd(), .7) * 100, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (onTrail(x, z, -1.5) || Math.hypot(x, z) < 31 || (Math.abs(x) < 3.6 && Math.abs(z) < 170) || (Math.abs(z) < 3.6 && Math.abs(x) < 170) || (Math.abs(x - HQ.x) < 26 && Math.abs(z - HQ.z) < 20) || mountainH(x, z) > 32) continue;
    const k = rnd(); put(k < .45 ? "Grass_Common_Tall" : k < .8 ? "Grass_Wispy_Tall" : "Grass_Common_Short", x, z, 1.1 + rnd() * .9, -0.05); } }
Object.keys(PL).forEach(n => instance(n, PL[n], { shadow: /Tree|Pine|Rock|Bush/.test(n), wind: /Grass/.test(n) ? 0.07 : /Tree|Pine/.test(n) ? 0.006 : 0.03, allWind: /Grass|Fern|Plant|Clover|Flower/.test(n), double: /Grass/.test(n) }));

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
  const lamp = new THREE.PointLight(0xFFB050, 60, 40, 1.4); lamp.position.set(0, 4, 7); g.add(lamp);
  // sapins enneigés autour
  [[-9, -4], [9, -5], [-8, 6], [10, 5], [-3, -9], [5, -9]].forEach(([x, z]) => { const t = new THREE.Group(); for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(2.2 - i * .6, 2.8, 8), new THREE.MeshStandardMaterial({ color: i % 2 ? 0x2B5A33 : 0xEEF4FA, roughness: .9, flatShading: true })); c.position.y = 1.6 + i * 1.5; c.castShadow = true; t.add(c); } t.position.set(x, 0, z); g.add(t); solid(CHALET.x + x, CHALET.z + z, 1.2); });
  const tg = label([{ t: "Le chalet", color: "#FFE08A", font: "italic 70px 'Bebas Neue'" }, { t: "Notre objectif : moins d’un an", font: "500 30px Inter", color: "#fff" }], { h: 192 }, 2.2); tg.position.y = 17; g.add(tg);
  g.position.set(CHALET.x, MT.h, CHALET.z); g.rotation.y = 0.35; scene.add(g); CHALET.obj = g;
  for (let x = -5; x <= 5; x += 2.5) solid(CHALET.x + x, CHALET.z, 4.2);
  window.__smoke = { x: CHALET.x + 2.8 * Math.cos(.35) - 1.5 * Math.sin(.35), y: MT.h + 13, z: CHALET.z - 2.8 * Math.sin(.35) - 1.5 * Math.cos(.35), parts: [] }; }
// Brume qui flotte autour de la montagne
const MIST = []; { const tex = paintTex(256, 256, (x, w, h) => { for (let i = 0; i < 14; i++) { const cx = 40 + trnd() * 176, cy = 70 + trnd() * 116, r = 30 + trnd() * 60; const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = gr; x.fillRect(0, 0, w, h); } });
  for (let i = 0; i < 26; i++) { const a = rnd() * Math.PI * 2, lvl = rnd(), r = MT.r * (1 - lvl * .6) * (.75 + rnd() * .5), y = 10 + lvl * (MT.h * 0.7);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: .55 + rnd() * .3, depthWrite: false, fog: false })); const s = 50 + rnd() * 60; sp.scale.set(s, s * .45, 1);
    sp.position.set(MT.x + Math.cos(a) * r, y, MT.z + Math.sin(a) * r); sp.userData = { a, r, y, sp: (rnd() - .5) * .05, op: sp.material.opacity }; scene.add(sp); MIST.push(sp); } }
// Fumée de la cheminée
const SMOKE_M = new THREE.MeshBasicMaterial({ color: 0xDDDDDD, transparent: true, opacity: .5, depthWrite: false });

// (anciens rochers remplacés par les modèles)
if (0) for (let i = 0; i < 40; i++) { const a = rnd() * Math.PI * 2, d = 70 + rnd() * 180, x = Math.cos(a) * d, z = Math.sin(a) * d; if (Math.abs(x) < 6 || Math.abs(z) < 6) continue;
  const r = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + rnd() * 2), M(0x8A8A82)); r.position.set(x, heightAt(x, z) + 0.5, z); r.rotation.set(rnd(), rnd(), rnd()); r.castShadow = true; scene.add(r); solid(x, z, 1.8); }
// Lampadaires autour de la place
const LAMPS = [];
for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8, x = Math.cos(a) * 31.5, z = Math.sin(a) * 31.5;
  const p = cyl(0.15, 0.2, 5, 0x222222, 8); p.position.set(x, 2.5, z); scene.add(p);
  const l = new THREE.Mesh(new THREE.SphereGeometry(0.45, 12, 8), new THREE.MeshBasicMaterial({ color: 0xFFE2A0 })); l.position.set(x, 5.2, z); scene.add(l); LAMPS.push(l); solid(x, z, 0.5); }
// Nuages
const CLOUDS = [];
{ const ct = paintTex(256, 128, (x, w, h) => { for (let i = 0; i < 22; i++) { const cx = 30 + trnd() * 196, cy = 50 + trnd() * 50, r = 18 + trnd() * 34; const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, "rgba(255,255,255,.75)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = g; x.fillRect(0, 0, w, h); } });
  for (let i = 0; i < 26; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ct, transparent: true, depthWrite: false, fog: false, opacity: .85 })); const s = 120 + rnd() * 160; sp.scale.set(s, s * .4, 1); sp.position.set(-700 + rnd() * 1400, 170 + rnd() * 90, -700 + rnd() * 1400); scene.add(sp); CLOUDS.push(sp); } }

/* Transfert des animations universelles sur le squelette du chevalier :
   on compare les deux squelettes au repos, puis on recopie chaque rotation image par image. */
function retargetToKnight() {
  if (!A.knight || !A.chars.Male_Ranger) return [];
  const src = SkeletonUtils.clone(A.chars.Male_Ranger.scene), tgt = SkeletonUtils.clone(A.knight.scene);
  const sm = []; src.traverse(c => { if (c.isSkinnedMesh) sm.push(c); }); const tm = []; tgt.traverse(c => { if (c.isSkinnedMesh) tm.push(c); });
  if (!sm.length || !tm.length) return [];
  const sk = sm[0].skeleton, tk = tm[0].skeleton; sk.pose(); tk.pose(); src.updateMatrixWorld(true); tgt.updateMatrixWorld(true);
  const base = n => n.replace(/_\d+$/, "");
  const MAP = { pelvis: "Hips", spine_01: "Spine", spine_02: "Spine01", spine_03: "Spine02", neck_01: "neck", Head: "Head", clavicle_l: "LeftShoulder", upperarm_l: "LeftArm", lowerarm_l: "LeftForeArm", hand_l: "LeftHand", clavicle_r: "RightShoulder", upperarm_r: "RightArm", lowerarm_r: "RightForeArm", hand_r: "RightHand", thigh_l: "LeftUpLeg", calf_l: "LeftLeg", foot_l: "LeftFoot", ball_l: "LeftToeBase", thigh_r: "RightUpLeg", calf_r: "RightLeg", foot_r: "RightFoot", ball_r: "RightToeBase" };
  const tBy = {}; tk.bones.forEach(b => tBy[base(b.name)] = b);
  const pairs = []; sk.bones.forEach(b => { const t = tBy[MAP[b.name]]; if (t) pairs.push({ s: b, t }); });
  const rel = (root, o) => root.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(o.getWorldQuaternion(new THREE.Quaternion()));
  pairs.forEach(p => { p.off = rel(src, p.s).invert().multiply(rel(tgt, p.t)); p.rest = p.t.quaternion.clone(); });
  // ordre parent avant enfant
  const depth = o => { let d = 0; while (o.parent) { d++; o = o.parent; } return d; }; pairs.sort((a, b) => depth(a.t) - depth(b.t));
  const hipS = sk.bones.find(b => b.name === "pelvis"), hipT = tBy.Hips, hs0 = hipS.position.clone(), ht0 = hipT ? hipT.position.clone() : null;
  const sH = new THREE.Box3().setFromObject(src), tH = new THREE.Box3().setFromObject(tgt), ratio = (tH.max.y - tH.min.y) / Math.max(0.01, sH.max.y - sH.min.y);
  const out = [], mixer = new THREE.AnimationMixer(src);
  ["Dance_Loop", "Sitting_Idle_Loop", "Idle_Talking_Loop", "Jump_Loop", "Spell_Simple_Idle_Loop"].forEach(cn => {
    const clip = A.clips.find(c => c.name === cn); if (!clip) return; mixer.stopAllAction(); const act = mixer.clipAction(clip); act.play();
    const fps = 24, n = Math.max(2, Math.ceil(clip.duration * fps)), times = [], qv = pairs.map(() => []), hv = [];
    for (let i = 0; i <= n; i++) { const t = Math.min(clip.duration, i / fps); mixer.setTime(t); src.updateMatrixWorld(true); times.push(t);
      pairs.forEach(p => { p.t.quaternion.copy(p.rest); }); tgt.updateMatrixWorld(true);
      pairs.forEach((p, k) => { const wq = rel(src, p.s).multiply(p.off); const pq = rel(tgt, p.t.parent); p.t.quaternion.copy(pq.invert().multiply(wq)); p.t.updateMatrixWorld(true); qv[k].push(...p.t.quaternion.toArray()); });
      if (ht0) { const d = hipS.position.clone().sub(hs0); hv.push(ht0.x, ht0.y + d.y * ratio * 0, ht0.z); } }
    const tracks = pairs.map((p, k) => new THREE.QuaternionKeyframeTrack(p.t.name + ".quaternion", times, qv[k]));
    out.push(new THREE.AnimationClip(cn, clip.duration, tracks)); });
  return out;
}

/* ---------- Personnages : héros aux proportions adultes (tenues de rôdeur et de paysan, animations réalistes) ---------- */
const LOOKS = { Gabriel: { o: "Knight", hair: [] }, Matis: { o: "Knight", hair: [] }, Clara: { o: "Female_Ranger", hair: ["Head_Female"] } };
const NPC_LOOKS = [{ o: "Male_Peasant", hair: ["Head_Male", "Hair_SimpleParted"] }, { o: "Female_Peasant", hair: ["Head_Female", "Hair_Buns"] }, { o: "Male_Peasant", hair: ["Head_Male", "Hair_Beard", "Hair_Buzzed"] }, { o: "Female_Peasant", hair: ["Head_Female", "Hair_Long"] }, { o: "Male_Peasant", hair: ["Head_Male", "Hair_Long"] }];
const lookOf = name => { if (LOOKS[name]) return LOOKS[name]; let h = 0; for (const c of String(name)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return [{ o: "Knight", hair: [] }, { o: "Female_Ranger", hair: ["Head_Female"] }, { o: "Knight", hair: [] }][h % 3]; };
const HIT = new THREE.MeshBasicMaterial({ visible: false });
const HERO_H = 4.3;
function makeChar(name, o) {
  o = o || {}; const look = o.look || lookOf(name), g = new THREE.Group();
  const isK = look.o === "Knight" && A.knight;
  const m = SkeletonUtils.clone(isK ? A.knight.scene : A.chars[look.o].scene);
  // cheveux, barbe, sourcils : rattachés au squelette du personnage
  look.hair.forEach(hn => { const hs = A.hair[hn]; if (!hs) return; const hc = SkeletonUtils.clone(hs.scene);
    hc.traverse(c => { if (!c.isSkinnedMesh) return; const bones = c.skeleton.bones.map(b => m.getObjectByName(b.name) || b); const sm = c.clone(); sm.bind(new THREE.Skeleton(bones, c.skeleton.boneInverses), c.bindMatrix); m.add(sm); }); });
  if (!A.h[look.o]) { m.updateMatrixWorld(true); let top = -1e9, bot = 1e9; const v = new THREE.Vector3();
    m.traverse(o => { if (o.isBone) { const y = o.getWorldPosition(v).y; top = Math.max(top, y); bot = Math.min(bot, y); } });
    A.h[look.o] = top > bot ? (top - bot) * 1.06 : Math.max(0.1, new THREE.Box3().setFromObject(m).getSize(v).y); A.y0 = A.y0 || {}; A.y0[look.o] = bot; }
  m.scale.multiplyScalar(HERO_H / A.h[look.o]); if (A.y0 && A.y0[look.o] != null && Math.abs(A.y0[look.o]) > 0.05 * A.h[look.o]) m.position.y -= A.y0[look.o] * HERO_H / A.h[look.o];
  m.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; c.frustumCulled = false; [].concat(c.material).forEach(mt => { mt.envMapIntensity = 0.75; if (/Hair|Eyebrow/i.test(mt.name)) { mt.alphaTest = 0.4; mt.transparent = false; mt.side = THREE.DoubleSide; } if (/Eyes/i.test(mt.name)) { mt.transparent = false; } }); } });
  g.add(m);
  const hit = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 4.6, 8), HIT); hit.position.y = 2.3; g.add(hit);
  m.traverse(o => { if (o.isBone) { o.userData.rq = o.quaternion.clone(); o.userData.rp = o.position.clone(); } });
  const mixer = new THREE.AnimationMixer(m), actions = {};
  if (isK) { const KA = { Idle_Loop: "Idle", Walk_Loop: "Walk", Jog_Fwd_Loop: "Run", Sprint_Loop: "Run" };
    A.knight.animations.forEach(c => { Object.keys(KA).forEach(k => { if (KA[k] === c.name) actions[k] = mixer.clipAction(c); }); });
    (A.kclips || []).forEach(c => { if (!actions[c.name]) actions[c.name] = mixer.clipAction(c); });
    if (actions.Sprint_Loop) actions.Sprint_Loop.timeScale = 1.3; }
  else A.clips.forEach(c => { actions[c.name] = mixer.clipAction(c); });
  const tag = label([{ t: name, color: o.npc ? "#FFE08A" : "#C6FF33" }].concat(o.sub ? [{ t: o.sub, font: "500 32px Inter", color: "#ddd" }] : []), { h: o.sub ? 192 : 110 }, 1);
  tag.position.y = o.sub ? 5.5 : 5.2; g.add(tag);
  g.userData = { mixer, actions, cur: "", tag, name, body: m, cls: look.o };
  if (!o.npc) { const sw = makeSword(); g.add(sw); g.userData.sword = sw; }
  playAnim(g, "Idle_Loop", 0); mixer.update(Math.random() * 3);
  return g;
}
function playAnim(g, name, fade) {
  const u = g.userData; if (!u.actions[name]) name = "Idle_Loop"; const a = u.actions[name]; if (!a || u.cur === name) return;
  const b = u.actions[u.cur]; a.reset(); a.enabled = true; a.setEffectiveWeight(1); a.play(); if (b) a.crossFadeFrom(b, fade == null ? 0.22 : fade, false); u.cur = name;
}
function limbs(g) { const u = g.userData; if (u.bones) return u.bones; const bn = re => { let r = null; u.body.traverse(o => { if (!r && o.isBone && re.test(o.name)) r = o; }); return r; };
  return u.bones = { hips: bn(/^(Hips|pelvis)/i), head: bn(/^Head/), ul: bn(/^(LeftArm|upperarm_l)/i), ur: bn(/^(RightArm|upperarm_r)/i), ll: bn(/^(LeftForeArm|lowerarm_l)/i), lr: bn(/^(RightForeArm|lowerarm_r)/i), hl: bn(/^(LeftHand|hand_l)/i), hr: bn(/^(RightHand|hand_r)/i),
    tl: bn(/^(LeftUpLeg|thigh_l)/i), tr: bn(/^(RightUpLeg|thigh_r)/i), kl: bn(/^(LeftLeg|calf_l)/i), kr: bn(/^(RightLeg|calf_r)/i), fl: bn(/^(LeftFoot|foot_l)/i), fr: bn(/^(RightFoot|foot_r)/i) }; }
function axes(g) { g.updateMatrixWorld(true); const q = g.getWorldQuaternion(new THREE.Quaternion());
  return { up: new THREE.Vector3(0, 1, 0).applyQuaternion(q), side: new THREE.Vector3(1, 0, 0).applyQuaternion(q), fwd: new THREE.Vector3(0, 0, 1).applyQuaternion(q) }; }
function aimBone(bone, child, dir, w) { bone.updateMatrixWorld(true); const cur = child.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(new THREE.Vector3())).normalize();
  const tq = new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize()), uw = bone.getWorldQuaternion(new THREE.Quaternion()), pw = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.slerp(pw.invert().multiply(tq.multiply(uw)), w); bone.updateMatrixWorld(true); }
function animChar(g, dt, moving, speed, emote, air) {
  const u = g.userData; if (!u.mixer) return;
  let want = "Idle_Loop";
  if (air) want = "Jump_Loop"; else if (moving) want = speed < 0.7 ? "Walk_Loop" : speed > 1.2 ? "Sprint_Loop" : "Jog_Fwd_Loop";
  else if (emote === "salut") want = "Idle_Talking_Loop"; else if (emote === "danse") want = "Dance_Loop"; else if (emote === "assis" || emote === "cheval") want = "Sitting_Idle_Loop"; else if (emote === "sort") want = "Spell_Simple_Idle_Loop";
  playAnim(g, want);
  if (u.actions.Walk_Loop) u.actions.Walk_Loop.timeScale = speed < 0 ? -1 : 1;
  u.mixer.update(dt);
  // Arbre droit : le héros se retourne sur les mains
  const flipW = !moving && !air && emote === "arbre" ? 1 : 0; u.flip = (u.flip || 0) + (flipW - (u.flip || 0)) * Math.min(1, dt * 6);
  if (u.flip > 0.001) {
    g.rotation.order = "YXZ"; g.rotation.z = Math.PI * u.flip; const baseY = g.position.y; g.position.y += 4.6 * u.flip;
    u.tag.position.y = (u.tagY0 = u.tagY0 || u.tag.position.y) * (1 - 2 * u.flip) - 1.6 * u.flip;
    // pose complète : dos droit, bras tendus vers le sol, jambes tendues vers le ciel, mains posées
    if (u.flip > 0.3) {
      const w = Math.min(1, (u.flip - 0.3) / 0.4), B = limbs(g);
      if (B.ul && B.ur && B.hl && B.hr && B.ll && B.lr) {
        const { up, side } = axes(g), hp = (B.hips || u.body).getWorldPosition(new THREE.Vector3());
        if (B.hips && B.head) aimBone(B.hips, B.head, up, w);
        const sgn = b => Math.sign(b.getWorldPosition(new THREE.Vector3()).sub(hp).dot(side)) || 1;
        [[B.ul, B.ll, B.hl], [B.ur, B.lr, B.hr]].forEach(([a, l, h]) => { const d = up.clone().addScaledVector(side, 0.18 * sgn(a)); aimBone(a, l, d, w); aimBone(l, h, d, w); });
        [[B.tl, B.kl, B.fl], [B.tr, B.kr, B.fr]].forEach(([a, l, f]) => { if (!a || !l || !f) return; const d = up.clone().negate().addScaledVector(side, 0.12 * sgn(a)); aimBone(a, l, d, w); aimBone(l, f, d, w); });
        g.updateMatrixWorld(true);
        const yl = B.hl.getWorldPosition(new THREE.Vector3()).y, yr = B.hr.getWorldPosition(new THREE.Vector3()).y;
        g.position.y -= (Math.min(yl, yr) - baseY - 0.12) * w;
      }
    }
  }
  else if (u.tagY0) { g.rotation.z = 0; u.tag.position.y = u.tagY0; }
  // À cheval : jambes de part et d'autre du cheval, mains sur les rênes
  if (emote === "cheval") { const B = limbs(g);
    if (B.tl && B.kl && B.fl && B.tr && B.kr && B.fr) { const { up, side, fwd } = axes(g), hp = (B.hips || u.body).getWorldPosition(new THREE.Vector3()), dn = up.clone().negate();
      const sgn = b => Math.sign(b.getWorldPosition(new THREE.Vector3()).sub(hp).dot(side)) || 1;
      if (B.hips && B.head) aimBone(B.hips, B.head, up.clone().addScaledVector(fwd, 0.12), 1);
      [[B.tl, B.kl, B.fl], [B.tr, B.kr, B.fr]].forEach(([a, l, f]) => { const s2 = sgn(a); aimBone(a, l, dn.clone().multiplyScalar(0.55).addScaledVector(side, 0.55 * s2).addScaledVector(fwd, 0.45), 1); aimBone(l, f, dn.clone().addScaledVector(side, 0.12 * s2).addScaledVector(fwd, -0.15), 1); });
      if (B.ul && B.ll && B.hl && B.ur && B.lr && B.hr) [[B.ul, B.ll, B.hl], [B.ur, B.lr, B.hr]].forEach(([a, l, h]) => { const s2 = sgn(a); aimBone(a, l, dn.clone().multiplyScalar(0.8).addScaledVector(fwd, 0.45).addScaledVector(side, 0.12 * s2), 1); aimBone(l, h, fwd.clone().addScaledVector(dn, 0.25).addScaledVector(side, -0.15 * s2), 1); });
    } }
  // Coup d'épée : bras armé au-dessus de l'épaule, puis frappe vers l'avant
  if (u.swing != null) { u.swing += dt; const p = u.swing / 0.5;
    if (p >= 1) u.swing = null;
    else { const B = limbs(g); if (B.ur && B.lr && B.hr) { const { up, side, fwd } = axes(g), hp = (B.hips || u.body).getWorldPosition(new THREE.Vector3()), sr = Math.sign(B.ur.getWorldPosition(new THREE.Vector3()).sub(hp).dot(side)) || 1;
      const a = up.clone().addScaledVector(side, 0.45 * sr).addScaledVector(fwd, -0.25), b = fwd.clone().addScaledVector(up, -0.55).addScaledVector(side, -0.45 * sr);
      const d = p < 0.3 ? a : p < 0.6 ? a.clone().lerp(b, (p - 0.3) / 0.3) : b, w = p < 0.15 ? p / 0.15 : p > 0.75 ? (1 - p) / 0.25 : 1;
      aimBone(B.ur, B.lr, d, w); aimBone(B.lr, B.hr, d, w); } } }
  // Mort : le héros tombe à la renverse
  const dieW = emote === "mort" ? 1 : 0; u.die = (u.die || 0) + (dieW - (u.die || 0)) * Math.min(1, dt * 5);
  if (u.die > 0.001) { g.rotation.order = "YXZ"; g.rotation.x = -Math.PI / 2 * u.die; g.position.y += 0.45 * u.die; u.dieOn = true; } else if (u.dieOn) { g.rotation.x = 0; u.dieOn = false; }
  placeSword(g, emote);
}
const _sq1 = new THREE.Quaternion(), _sq2 = new THREE.Quaternion(), _SY = new THREE.Vector3(0, 1, 0);
function placeSword(g, emote) { const u = g.userData, s = u.sword; if (!s) return;
  const hide = !u.armed || u.flip > 0.05 || u.die > 0.3 || emote === "assis" || emote === "danse" || emote === "cheval" || !g.visible; s.visible = !hide; if (hide) return;
  const B = limbs(g); if (!B.hr || !B.lr) { s.visible = false; return; }
  const { up, fwd } = axes(g), h = B.hr.getWorldPosition(new THREE.Vector3()), arm = h.clone().sub(B.lr.getWorldPosition(new THREE.Vector3())).normalize();
  const dir = u.swing != null ? arm.clone().addScaledVector(fwd, .5) : arm.clone().multiplyScalar(.35).add(fwd).addScaledVector(up, .35); dir.normalize();
  const pos = h.addScaledVector(arm, .14); g.worldToLocal(pos); s.position.copy(pos);
  _sq1.setFromUnitVectors(_SY, dir); g.getWorldQuaternion(_sq2).invert(); s.quaternion.copy(_sq2.multiply(_sq1)); }

/* ---------- Joueur ---------- */
const P = { x: 0, z: 14, y: 0, vy: 0, ry: Math.PI, model: null, moving: false, grounded: true }; if (/lite/.test(location.search)) window.__T = { G, P };
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
const MARK_TEX = {}; const markTex = k => MARK_TEX[k] || (MARK_TEX[k] = textTex([{ t: k === "new" ? "!" : "?", font: "900 116px Georgia", color: k === "grey" ? "#9A9A9A" : "#FFD21F" }], { w: 128, h: 128, stroke: "rgba(40,20,0,.95)" }));
const bang = () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex("new"), transparent: true })); s.scale.set(1.5, 1.5, 1); return s; };
const setMark = (m, k) => { if (!m) return; m.visible = !!k; if (k && m.material.map !== markTex(k)) { m.material.map = markTex(k); m.material.needsUpdate = true; } };
BOARD.mark = bang(); BOARD.mark.position.set(BOARD.x, 5.6, BOARD.z); scene.add(BOARD.mark);

const STALL_COLORS = [0xD9483B, 0x2E86DE, 0xF5B82E, 0x27AE60, 0x8E44AD, 0xE67E22, 0x16A085, 0xC0392B];
function buildNpcs() {
  NPC_GROUP.clear(); G.npcs.forEach(n => { const i = COLL.indexOf(n.coll); if (i >= 0) COLL.splice(i, 1); }); G.npcs = [];
  const qc = [...new Set(G.quests.map(q => q.client).filter(Boolean))], clients = ALL_CLIENTS.concat(qc.filter(c => !ALL_CLIENTS.some(a => normName(a) === normName(c))));
  const byQ = {}; clients.forEach(c => { const q = quarterOf(c); (byQ[q.id] = byQ[q.id] || []).push(c); }); let li = 0;
  QUARTERS.forEach(q => { const list = (byQ[q.id] || []).sort(), n = list.length, span = Math.min(24, (n - 1) * 4.4);
    list.forEach((c, i) => { const k = n === 1 ? 0 : i / (n - 1) - .5, lx = k * span, lz = (q.id === "arene" ? 10.5 : 5.2) - Math.abs(k) * 2.4, [x, z] = qWorld(q, lx, lz), y = heightAt(x, z);
      const st = new THREE.Group(); const npc = makeChar(c, { npc: true, sub: "Client", look: NPC_LOOKS[li++ % NPC_LOOKS.length] }); st.add(npc);
      const lec = new THREE.Group(); fbox(.25, 1.6, .25, FM.dark, 0, .8, 0, lec); const t = textTex([{ t: c, font: "400 46px 'MedievalSharp', Georgia" }], { w: 512, h: 128, bg: "#3B2412", color: "#F5D27A", stroke: null });
      const pl = new THREE.Mesh(new THREE.BoxGeometry(1.9, .55, .1), [FM.dark, FM.dark, FM.dark, FM.dark, new THREE.MeshStandardMaterial({ map: t }), new THREE.MeshStandardMaterial({ map: t })]); pl.position.y = 1.75; pl.rotation.x = -.35; lec.add(pl); lec.position.set(1.3, 0, .9); st.add(lec);
      st.position.set(x, y, z); st.rotation.y = q.ry - k * .5; NPC_GROUP.add(st);
      const mark = bang(); mark.position.set(x, y + 6.4, z); NPC_GROUP.add(mark);
      const nn = { kind: "client", name: c, x, z, obj: st, model: npc, mark, my: y + 6.4, quarter: q.id, coll: { x, z, r: .9 } }; COLL.push(nn.coll); G.npcs.push(nn); }); });
  // Un personnage de l'équipe sur le perron de l'agence : Gabriel donne les conseils
  const gab = makeChar("Gabriel", { npc: true, sub: "Seigneur du château" }); gab.position.set(HQ.x - 5, 0, HQ.z + 24); gab.rotation.y = 0.2; NPC_GROUP.add(gab);
  G.npcs.push({ kind: "guide", name: "Gabriel", x: HQ.x - 5, z: HQ.z + 24, obj: gab, model: gab, coll: { x: HQ.x - 5, z: HQ.z + 24, r: 0.8 } }); COLL.push(G.npcs[G.npcs.length - 1].coll);
  G.npcs.push(Object.assign(BOARD, { coll: null }), Object.assign(MAILBOX, { coll: null }), Object.assign(CHALET, { coll: null, x: MT.x, z: MT.z + 9 }));
  refreshMarks();
}
function markFor(list) { if (list.some(q => G.rdy.has(q.id))) return "ready"; if (list.some(q => !G.accepted.has(q.id))) return "new"; if (list.length) return "grey"; return ""; }
function refreshMarks() {
  G.npcs.forEach(n => { if (n.kind === "client") setMark(n.mark, markFor(G.quests.filter(q => q.client === n.name))); });
  setMark(BOARD.mark, markFor(G.quests.filter(q => !q.client)));
}

/* ---------- Montures et véhicules : chevaux (modèle « Horse » de Henry S, CC BY) et 4x4 (« Range Rover Sport (2018) » de Weitstern, CC BY) ---------- */
// Les modèles animés ont une boîte englobante fausse au repos : on mesure plutôt avec leurs os
function boxOf(obj) { obj.updateMatrixWorld(true); let bones = 0; const b = new THREE.Box3(), v = new THREE.Vector3(); obj.traverse(o => { if (o.isBone) { b.expandByPoint(o.getWorldPosition(v)); bones++; } }); return bones > 3 ? b : new THREE.Box3().setFromObject(obj); }
function normalize(obj, axis, size) { const b = boxOf(obj), d = b.getSize(new THREE.Vector3()); const k = size / (axis === "y" ? d.y : Math.max(d.x, d.z)); obj.scale.multiplyScalar(k);
  const b2 = boxOf(obj), c = b2.getCenter(new THREE.Vector3()); obj.position.x -= c.x; obj.position.z -= c.z; obj.position.y -= b2.min.y; }
// Rampes du parc à cascades (on peut aussi marcher dessus)
const RAMPS = [];
function rampH(x, z) { let best = 0; for (const r of RAMPS) { const c = Math.cos(r.yaw), sn = Math.sin(r.yaw), dx = x - r.x, dz = z - r.z, u = dx * sn + dz * c, v = dx * c - dz * sn;
  if (u >= 0 && u <= r.len && Math.abs(v) <= r.w / 2) best = Math.max(best, r.h * u / r.len); } return best; }
const groundAt = (x, z) => { const g = heightAt(x, z); return g + rampH(x, z); };
{ const wood = new THREE.MeshStandardMaterial({ map: paintTex(256, 256, (x, w, h) => { for (let r = 0; r < 8; r++) { const v = 120 + trnd() * 40; x.fillStyle = "rgb(" + (v + 30 | 0) + "," + (v | 0) + "," + (v * .55 | 0) + ")"; x.fillRect(0, r * 32, w, 32); x.fillStyle = "rgba(0,0,0,.35)"; x.fillRect(0, r * 32 + 29, w, 3); } }, [2, 4]), roughness: .9 });
  RAMPS.forEach(r => { const g = new THREE.BufferGeometry(), L = r.len, W = r.w / 2, H = r.h;
    const P = [-W, 0, 0, W, 0, 0, -W, 0, L, W, 0, L, -W, H, L, W, H, L];
    const idx = [0, 2, 4, 1, 5, 3, 0, 4, 1, 1, 4, 5, 2, 3, 4, 3, 5, 4, 0, 1, 2, 1, 3, 2];
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3)); g.setIndex(idx); g.computeVertexNormals();
    const uv = [0, 0, 1, 0, 0, 1, 1, 1, 0, 1, 1, 1]; g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    const m = new THREE.Mesh(g, wood); m.castShadow = m.receiveShadow = true; m.position.set(r.x, heightAt(r.x, r.z), r.z); m.rotation.y = r.yaw; scene.add(m); });
  const sign = label([{ t: "Piste du Hameau", color: "#FFE08A", font: "italic 70px 'Bebas Neue'" }, { t: "Une boucle de terre autour du village", font: "500 30px Inter", color: "#fff" }], { h: 192 }, 2); sign.position.set(-10, heightAt(-10, 74) + 8, 74); scene.add(sign); }

const RIDES = [];
// 4x4
function makeCar() { const g = new THREE.Group(), m = A.car.scene.clone(true); m.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; [].concat(c.material).forEach(mt => { mt.envMapIntensity = 1.2; }); } });
  const box = new THREE.Box3().setFromObject(m), d = box.getSize(new THREE.Vector3()); if (d.x > d.z) m.rotation.y = -Math.PI / 2; const w = new THREE.Group(); w.add(m); normalize(w, "len", 11.5); g.add(w); return g; }
if (A.car) { const car = { kind: "car", name: "Range Rover Sport", x: 4, z: 66, y: 0, yaw: 0.75, speed: 0, vy: 0, pitch: 0, roll: 0, sp: 0, sr: 0, air: 0, vx: 0, vz: 0, obj: makeCar() };
  car.obj.position.set(car.x, heightAt(car.x, car.z), car.z); car.obj.rotation.y = car.yaw; scene.add(car.obj); RIDES.push(car); }
// Chevaux dans un enclos à l'est du château
const HORSE_C = { x: 62, z: -40 };
function makeHorse() { const g = new THREE.Group(), m = SkeletonUtils.clone(A.horse.scene); m.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; c.frustumCulled = false; } });
  const w = new THREE.Group(); w.add(m); normalize(w, "y", 5.4); g.add(w); const mixer = new THREE.AnimationMixer(m), act = {};
  A.horse.animations.forEach(c => { act[c.name.replace("Skeleton|", "").replace("1 Ilde", "Idle").replace("6 Eat", "Eat")] = mixer.clipAction(c); });
  g.userData = { mixer, act, cur: "" }; return g; }
// Position de la selle : on suit l'os du dos du cheval
const _sv = new THREE.Vector3();
function saddleOf(obj) { const u = obj.userData; if (!u.spine) { obj.traverse(o => { if (!u.spine && o.isBone && /Spine_02/.test(o.name)) u.spine = o; }); } if (!u.spine) return obj.position.clone().setY(obj.position.y + 3.2); obj.updateMatrixWorld(true); return u.spine.getWorldPosition(_sv).clone(); }
function horseAnim(h, name, dt) { const u = h.obj.userData; if (u.cur !== name && u.act[name]) { const a = u.act[name], b = u.act[u.cur]; a.reset().play(); if (b) a.crossFadeFrom(b, .3, false); u.cur = name; } u.mixer.update(dt); }
if (A.horse) { for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2, h = { kind: "horse", name: "Cheval", x: HORSE_C.x + Math.cos(a) * 7, z: HORSE_C.z + Math.sin(a) * 7, y: 0, yaw: rnd() * 6, speed: 0, vy: 0, obj: makeHorse(), wander: { t: 0, tx: 0, tz: 0, mode: "Idle" } };
  h.obj.position.set(h.x, heightAt(h.x, h.z), h.z); scene.add(h.obj); RIDES.push(h); }
  // enclos
  const post = new THREE.MeshStandardMaterial({ color: 0x6B4A2B, roughness: .9 }); const n = 28;
  for (let i = 0; i < n; i++) { if (i === 7) continue; const a = i / n * Math.PI * 2, x = HORSE_C.x + Math.cos(a) * 16, z = HORSE_C.z + Math.sin(a) * 16, y = heightAt(x, z);
    const p = new THREE.Mesh(new THREE.CylinderGeometry(.18, .2, 2.4, 6), post); p.position.set(x, y + 1.2, z); p.castShadow = true; scene.add(p);
    const a2 = (i + 1) / n * Math.PI * 2, x2 = HORSE_C.x + Math.cos(a2) * 16, z2 = HORSE_C.z + Math.sin(a2) * 16, L = Math.hypot(x2 - x, z2 - z);
    [1.0, 1.9].forEach(hh => { const r = new THREE.Mesh(new THREE.BoxGeometry(.14, .16, L), post); r.position.set((x + x2) / 2, y + hh, (z + z2) / 2); r.lookAt(x2, y + hh, z2); r.castShadow = true; scene.add(r); }); } }
const nearestRide = max => { let best = null, bd = max; RIDES.forEach(r => { if (r.rider || !r.obj.visible) return; const d = Math.hypot(r.x - P.x, r.z - P.z); if (d < bd) { bd = d; best = r; } }); return best; };
function mount(r) { if (G.ride) return; G.ride = r; r.rider = G.me.name; G.emote = ""; r.speed = 0; CAM.want = r.kind === "car" ? 22 : 15;
  log(r.kind === "car" ? "Tu prends le volant. Z pour accélérer, S pour freiner, Q et D pour tourner, Espace pour déraper. La piste de terre fait le tour du Hameau. F pour descendre." : "Tu montes à cheval. Z pour galoper, Maj + Z pour marcher, Q et D pour tourner, Espace pour sauter. F pour descendre."); renderBar(); }
function dismount() { const r = G.ride; if (!r) return; r.rider = null; G.ride = null; const sx = Math.cos(r.yaw), sz = -Math.sin(r.yaw);
  P.x = r.x + sx * (r.kind === "car" ? 4.5 : 2.5); P.z = r.z + sz * (r.kind === "car" ? 4.5 : 2.5); P.y = groundAt(P.x, P.z); P.ry = r.yaw; CAM.want = 13;
  if (r.kind === "car") { r.pitch = 0; r.roll = 0; } P.model.rotation.set(0, P.ry, 0); log(r.kind === "car" ? "Tu descends du 4x4." : "Tu descends de cheval."); renderBar(); }
// Conduite du 4x4 : arcade, avec suspension sur le relief, dérapage et sauts
const STUNT = { air: 0, rolls: 0, flips: 0 };
function driveCar(c, dt, up, down, left, right) {
  const air = c.y > groundAt(c.x, c.z) + 0.35;
  if (!air) {
    const fwdV = Math.abs(c.speed), acc = up ? 13 * (1 - Math.min(0.75, fwdV / 60)) : down ? (c.speed > 1 ? -30 : -8) : 0; c.speed += acc * dt; c.speed -= c.speed * (up || down ? 0.12 : 0.45) * dt;
    c.speed = Math.max(-12, Math.min(46, c.speed));
    const st = (left ? 1 : 0) - (right ? 1 : 0), grip = K.Space ? 1.0 : 3.6; c.steer = (c.steer || 0) + (st - (c.steer || 0)) * Math.min(1, dt * 3.5);
    c.yaw += c.steer * dt * 1.25 * Math.sign(c.speed || 1) * Math.min(1, fwdV / 9) * (1 - Math.min(0.45, fwdV / 100)) * (K.Space ? 1.5 : 1);
    const fx = Math.sin(c.yaw) * c.speed, fz = Math.cos(c.yaw) * c.speed; c.vx += (fx - c.vx) * Math.min(1, grip * dt); c.vz += (fz - c.vz) * Math.min(1, grip * dt);
    if (K.Space && Math.abs(c.speed) > 8) c.speed *= (1 - 0.6 * dt);
  } else { // en l'air : figures
    if (left) c.sr += 5 * dt; if (right) c.sr -= 5 * dt; if (up) c.sp += 4.5 * dt; if (down) c.sp -= 4.5 * dt; }
  const ox = c.x, oz = c.z; c.x += c.vx * dt; c.z += c.vz * dt;
  for (const k of COLL) { const dx = c.x - k.x, dz = c.z - k.z, d = Math.hypot(dx, dz), r = k.r + 2.6; if (d < r && d > 0.001) { c.x = k.x + dx / d * r; c.z = k.z + dz / d * r; if (Math.abs(c.speed) > 12) float("Bam !"); c.speed *= -0.25; c.vx *= -0.3; c.vz *= -0.3; } }
  const lim = 300; c.x = Math.max(-lim, Math.min(lim, c.x)); c.z = Math.max(-lim, Math.min(lim, c.z));
  // hauteur et inclinaison selon le sol sous les 4 roues
  const fwdX = Math.sin(c.yaw), fwdZ = Math.cos(c.yaw), rX = Math.cos(c.yaw), rZ = -Math.sin(c.yaw);
  const hF = groundAt(c.x + fwdX * 4, c.z + fwdZ * 4), hB = groundAt(c.x - fwdX * 4, c.z - fwdZ * 4), hL = groundAt(c.x - rX * 2, c.z - rZ * 2), hR = groundAt(c.x + rX * 2, c.z + rZ * 2);
  const gh = Math.max((hF + hB) / 2, groundAt(c.x, c.z)), prevG = c.lastG == null ? gh : c.lastG; c.lastG = gh;
  c.vy -= 42 * dt; c.y += c.vy * dt;
  if (c.y <= gh) {
    if (air || STUNT.air > 0.4) { const badR = Math.abs(Math.atan2(Math.sin(c.roll), Math.cos(c.roll))) > 1.0, badP = Math.abs(Math.atan2(Math.sin(c.pitch), Math.cos(c.pitch))) > 1.1;
      if (STUNT.air > 0.5) { if (badR || badP) { float("Crash !"); c.speed *= 0.2; c.vx *= 0.2; c.vz *= 0.2; }
        else { const t = []; if (STUNT.rolls) t.push(STUNT.rolls + (STUNT.rolls > 1 ? " tonneaux" : " tonneau")); if (STUNT.flips) t.push(STUNT.flips + (STUNT.flips > 1 ? " saltos" : " salto")); float((t.length ? t.join(" + ") + " ! " : "Saut ! ") + STUNT.air.toFixed(1) + " s", "gold"); if (t.length) tone(990, .3); } }
      STUNT.air = 0; STUNT.rolls = 0; STUNT.flips = 0; c.sp = 0; c.sr = 0; c.roll = 0; c.pitch = Math.atan2(hB - hF, 8); }
    c.y = gh; c.vy = Math.max(0, (gh - prevG) / Math.max(dt, 0.001)) * 0.35;
    c.pitch += (Math.atan2(hB - hF, 8) - c.pitch + (c.lastAcc || 0) * 0.004) * Math.min(1, dt * 4.5); c.roll += (Math.atan2(hL - hR, 4) - c.roll - (c.steer || 0) * Math.min(1, Math.abs(c.speed) / 40) * 0.06) * Math.min(1, dt * 4.5);
  } else { STUNT.air += dt; const pr = c.roll, pp = c.pitch; c.roll += c.sr * dt; c.pitch += c.sp * dt; c.sr *= (1 - .4 * dt); c.sp *= (1 - .4 * dt);
    if (Math.floor(Math.abs(c.roll) / (Math.PI * 2) + .25) > Math.floor(Math.abs(pr) / (Math.PI * 2) + .25)) STUNT.rolls++;
    if (Math.floor(Math.abs(c.pitch) / (Math.PI * 2) + .25) > Math.floor(Math.abs(pp) / (Math.PI * 2) + .25)) STUNT.flips++; }
  c.obj.position.set(c.x, c.y, c.z); c.obj.rotation.order = "YXZ"; c.obj.rotation.set(-c.pitch, c.yaw, c.roll);
  P.x = c.x; P.z = c.z; P.y = c.y; P.ry = c.yaw; P.moving = Math.abs(c.speed) > 1;
}
function rideHorse(h, dt, up, down, left, right) {
  const walk = K.ShiftLeft || K.ShiftRight, target = up ? (walk ? 7 : 20) : down ? -3 : 0; h.speed += (target - h.speed) * Math.min(1, dt * 2.2);
  if (left) h.yaw += dt * 2.2; if (right) h.yaw -= dt * 2.2;
  h.x += Math.sin(h.yaw) * h.speed * dt; h.z += Math.cos(h.yaw) * h.speed * dt;
  for (const k of COLL) { const dx = h.x - k.x, dz = h.z - k.z, d = Math.hypot(dx, dz), r = k.r + 1.4; if (d < r && d > 0.001) { h.x = k.x + dx / d * r; h.z = k.z + dz / d * r; } }
  const gh = groundAt(h.x, h.z); if (K.Space && h.y <= gh + 0.05) h.vy = 11; h.vy -= 28 * dt; h.y += h.vy * dt; if (h.y < gh) { h.y = gh; h.vy = 0; }
  h.obj.position.set(h.x, h.y, h.z); h.obj.rotation.y = h.yaw;
  horseAnim(h, h.y > gh + .3 ? "Jump_Run" : Math.abs(h.speed) > 11 ? "Gallop" : Math.abs(h.speed) > 0.8 ? "Walk" : "Idle", dt);
  const u = h.obj.userData; if (u.act.Walk) u.act.Walk.timeScale = h.speed < 0 ? -1 : Math.max(.6, Math.abs(h.speed) / 6);
  P.x = h.x; P.z = h.z; P.y = h.y; P.ry = h.yaw; P.moving = Math.abs(h.speed) > 0.8;
}
function wanderHorse(h, dt) { const w = h.wander; w.t -= dt;
  if (w.t <= 0) { w.mode = rnd() < .45 ? "Walk" : rnd() < .5 ? "Eat" : "Idle"; w.t = 4 + rnd() * 6; const a = rnd() * Math.PI * 2, r = rnd() * 11; w.tx = HORSE_C.x + Math.cos(a) * r; w.tz = HORSE_C.z + Math.sin(a) * r; }
  if (w.mode === "Walk") { const dx = w.tx - h.x, dz = w.tz - h.z, d = Math.hypot(dx, dz); if (d < 1) w.mode = "Idle"; else { const ty = Math.atan2(dx, dz); let dy = ty - h.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; h.yaw += dy * Math.min(1, dt * 1.5); h.x += Math.sin(h.yaw) * 2.5 * dt; h.z += Math.cos(h.yaw) * 2.5 * dt; } }
  h.y = groundAt(h.x, h.z); h.obj.position.set(h.x, h.y, h.z); h.obj.rotation.y = h.yaw; horseAnim(h, w.mode, dt); if (h.obj.userData.act.Walk) h.obj.userData.act.Walk.timeScale = .7; }
// Montures des autres joueurs (affichées sous eux)
function otherRide(o, t, dt) {
  if (t.ride === "pass") { if (o.rideObj) { scene.remove(o.rideObj.obj); o.rideObj = null; } o.rideKind = "pass"; o.model.visible = false; return; }
  if (t.ride !== (o.rideKind || "")) { if (o.rideKind === "car" && o.rideObj) { const c = RIDES.find(r => r.kind === "car"); if (c && c !== G.ride) { const p = o.rideObj.obj.position; c.x = p.x; c.z = p.z; c.y = p.y; c.yaw = o.rideObj.obj.rotation.y; c.obj.position.copy(p); c.obj.rotation.set(0, c.yaw, 0); } }
    if (o.rideObj) { scene.remove(o.rideObj.obj); o.rideObj = null; } o.rideKind = t.ride || "";
    if (t.ride === "car" && A.car) { o.rideObj = { obj: makeCar() }; scene.add(o.rideObj.obj); } else if (t.ride === "horse" && A.horse) { o.rideObj = { obj: makeHorse() }; scene.add(o.rideObj.obj); } }
  if (!o.rideObj) return;
  if (t.ride === "car") { o.rideObj.obj.position.set(t.x, t.y, t.z); o.rideObj.obj.rotation.order = "YXZ"; o.rideObj.obj.rotation.set(-(t.rp || 0), t.ry, t.rr || 0); o.model.visible = false; }
  else { o.rideObj.obj.position.set(t.x, t.y, t.z); o.rideObj.obj.rotation.y = t.ry; horseAnim(o.rideObj, t.sp > 11 ? "Gallop" : t.sp > 0.8 ? "Walk" : "Idle", dt); const sd = saddleOf(o.rideObj.obj); o.model.position.set(sd.x - Math.sin(t.ry) * 0.45, sd.y - HERO_H * 0.47, sd.z - Math.cos(t.ry) * 0.45); o.model.visible = true; }
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
  acc.slice(0, 8).forEach(q => { const rd = G.rdy.has(q.id), d = el("div", "tq" + (rd ? " rdy" : "")); d.append(el("b", null, q.title)); const late = q.date && q.date < today();
    d.append(el("span", rd ? "ok" : late ? "late" : "", rd ? "Prête à rendre : " + (q.client || "tableau des missions") : "- " + (q.client ? q.client : "Agence") + " : 0/1" + (q.date ? (late ? ", en retard" : ", avant le " + fmtD(q.date).replace(/^\S+ /, "")) : ""))); d.onclick = () => openQuest(q); L.appendChild(d); });
}
function renderMailFlag() { const n = G.mail.filter(m => !m.read).length; const b = $("#mm-mail"); b.hidden = !n; b.textContent = n > 1 ? n + " lettres" : "Courrier"; }

/* Barre d'action et menus */
const ICONS = {
  coup: '<path d="M4 20L14 10M12 4l8 8M15 3l6 6M3 13c3 0 5 2 5 5"/>',
  epee: '<path d="M14.5 3.5L20.5 3.5 20.5 9.5 10 20 4 14z"/><path d="M4 14l-1.5 1.5 6 6L10 20M6.5 17.5L3 21"/>',
  salut: '<path d="M7 12V6a1.5 1.5 0 0 1 3 0v5M10 11V4.5a1.5 1.5 0 0 1 3 0V11M13 11V5.5a1.5 1.5 0 0 1 3 0V13M16 9a1.5 1.5 0 0 1 3 0v5a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2.5-4a1.5 1.5 0 0 1 2.5-1.6L7 14"/>',
  danse: '<circle cx="9" cy="18" r="2.5"/><circle cx="18" cy="16" r="2.5"/><path d="M11.5 18V5l9-2v13"/>',
  assis: '<path d="M6 21v-6h11v6M6 15V5M6 11h9a2 2 0 0 1 2 2v2"/>',
  foyer: '<path d="M3 11l9-8 9 8M5 9.5V21h14V9.5M10 21v-6h4v6"/>',
  arbre: '<circle cx="12" cy="19" r="2"/><path d="M12 17V9M12 9l-4 4M12 9l4 4M10 3l2 6 2-6"/>',
  monture: '<path d="M4 18c1-4 3-6 7-6h4l3-4 2 1-1 4v5M8 18v3M16 18v3M11 12V9l-3-2"/>',
  app: '<rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8"/>'
};
const ACTIONS = [
  ["1", "epee", "Épée : prendre ou ranger", () => toggleSword()],
  ["2", "coup", "Coup d’épée", () => attack()],
  ["3", "salut", "Saluer", () => emote("salut")],
  ["4", "danse", "Danser", () => emote("danse")],
  ["5", "assis", "S’asseoir", () => emote("assis")],
  ["6", "foyer", "Pierre de foyer : retour sur la place", hearth],
  ["7", "monture", "Monture : aller plus vite", () => { G.mount = !G.mount; log(G.mount ? "Tu montes en selle." : "Tu descends de ta monture."); renderBar(); }],
  ["8", "arbre", "Arbre droit", () => emote("arbre")],
  ["9", "app", "Ouvrir l’application", () => window.open("/gestion", "_blank")]
];
function renderBar() {
  const A = $("#abar"); A.textContent = "";
  ACTIONS.forEach(([k, ic, tip, fn]) => { const b = el("button", "ab" + ((ic === "monture" && G.mount) || (ic === "epee" && G.armed) || G.emote === ic ? " on" : "")); b.type = "button";
    b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[ic] + "</svg>"; b.append(el("kbd", null, k), el("span", "ab-tip", tip + " (" + k + ")"));
    if (ic === "foyer" && G.hearthCd > 0) b.append(el("span", "cd", Math.ceil(G.hearthCd) + ""));
    b.onclick = () => { fn(); canvas.focus(); }; A.appendChild(b); });
  const MB = $("#menubar"); MB.textContent = "";
  [["Personnage (C)", charWin], ["Sacs (B)", bagWin], ["Quêtes (L)", logWin], ["Carte (M)", mapWin], ["Touches", keysWin], ["Menu (Échap)", menuWin]].forEach(([t, f]) => { const b = el("button", null, t); b.type = "button"; b.onclick = () => { f(); canvas.focus(); }; MB.appendChild(b); });
}
function emote(e) { if (G.dead) return; G.emote = G.emote === e ? "" : e; if (G.emote) log(G.me.name + (e === "salut" ? " salue tout le monde." : e === "danse" ? " se met à danser." : e === "arbre" ? " fait l’arbre droit. Impressionnant." : " s’assoit.")); renderBar(); }
G.armed = (() => { try { return localStorage.getItem("hg-arm") === "1"; } catch (e) { return false; } })(); G.hp = 100; G.dead = false; G.atk = 0; G.evQ = []; let atkCd = 0, lastHit = -99; const POPS = [];
function toggleSword(on) { G.armed = on == null ? !G.armed : on; try { localStorage.setItem("hg-arm", G.armed ? "1" : "0"); } catch (e) {} if (P.model) P.model.userData.armed = G.armed;
  log(G.armed ? "Tu prends ton épée en main." : "Tu ranges ton épée dans ton sac."); tone(G.armed ? 660 : 440, .1); renderBar(); if (WINS.bag) bagWin(); }
function attack() {
  if (G.dead) return; if (!G.armed) return log("Prends d’abord ton épée (touche 1 ou dans ton sac, touche B).", "err"); if (G.ride || G.pass) return log("Descends d’abord pour te battre.", "err"); if (atkCd > 0) return;
  atkCd = 0.75; G.atk++; if (G.emote) { G.emote = ""; renderBar(); } P.model.userData.swing = 0; tone(220, .08);
  setTimeout(() => { if (G.dead) return; const fx = Math.sin(P.ry), fz = Math.cos(P.ry); let any = false;
    const inFront = (x, z) => { const dx = x - P.x, dz = z - P.z, d = Math.hypot(dx, dz); return d < 4.4 && d > 0.01 && (dx * fx + dz * fz) / d > 0.3; };
    Object.values(G.others).forEach(o => { const t = o.pos; if (t.ride || t.emo === "mort" || !inFront(t.x, t.z)) return; G.evQ.push("§hit§" + o.name + "§" + (12 + Math.floor(Math.random() * 9))); any = true; });
    DUMMIES.forEach(dm => { if (inFront(dm.x, dm.z)) { dmgPop(dm.obj, 12 + Math.floor(Math.random() * 9), 4.6, "#FFD21F"); dm.shake = 0.5; any = true; } });
    tone(any ? 140 : 330, any ? .12 : .05); }, 230);
}
function dmgPop(obj, n, h, col) { const s = label([{ t: "-" + n, font: "900 70px Inter", color: col || "#FF3B30" }], { w: 256, h: 96, stroke: "#000" }, 1); s.scale.set(2.4, 0.9, 1);
  obj.updateMatrixWorld(); const p = obj.getWorldPosition(new THREE.Vector3()); s.position.set(p.x + (Math.random() - .5) * 0.8, p.y + (h || 5.6), p.z); scene.add(s); POPS.push({ s, t: 0 }); }
function renderHp() { const b = $("#pframe .bar.hp i"); if (b) b.style.width = Math.round(G.hp) + "%"; }
function takeDamage(dmg, from) { if (G.dead) return; G.hp = Math.max(0, G.hp - dmg); lastHit = clock.elapsedTime; dmgPop(P.model, dmg); renderHp();
  const f = el("div", "hurt"); $("#fx").appendChild(f); setTimeout(() => f.remove(), 450); tone(160, .1);
  if (G.hp <= 0) { G.dead = true; G.emote = "mort"; G.evQ.push("§ko§" + from); log("Tu as été vaincu par " + from + ". Tu reviens à la vie dans 6 secondes.", "err"); tone(110, .8); renderBar();
    setTimeout(() => { G.dead = false; G.hp = 100; G.emote = ""; P.x = 0; P.z = 14; P.y = groundAt(0, 14); P.ry = Math.PI; CAM.yaw = P.ry; renderHp(); renderBar(); log("Tu reviens à la vie sur la place du Hameau."); }, 6000); } }
// 4x4 à deux : on monte côté passager dans le 4x4 d'un autre joueur
const nearOtherCar = max => Object.values(G.others).find(o => o.rideKind === "car" && o.rideObj && Math.hypot(o.rideObj.obj.position.x - P.x, o.rideObj.obj.position.z - P.z) < max);
function leavePass() { const o = G.others[G.pass], yaw = o && o.rideObj ? o.rideObj.obj.rotation.y : P.ry; G.pass = null;
  P.x -= Math.cos(yaw) * 4.5; P.z += Math.sin(yaw) * 4.5; P.y = groundAt(P.x, P.z); CAM.want = 13; P.model.visible = true; log("Tu descends du 4x4."); renderBar(); }
function hearth() { if (G.hearthCd > 0) return log("La pierre de foyer n’est pas encore prête.", "err"); P.x = 0; P.z = 14; P.ry = Math.PI; CAM.yaw = P.ry; G.hearthCd = 30; log("Tu utilises ta pierre de foyer. Retour sur la place du Hameau."); tone(440, .6); renderBar(); }

/* Fenêtres */
const WINS = {};
function win(id, title, build, o) {
  if (WINS[id]) { WINS[id].remove(); delete WINS[id]; if (!(o && o.reopen)) return null; }
  const w = el("div", "win" + (o && o.cls ? " " + o.cls : "")); w.dataset.id = id; if (o && o.width) w.style.width = o.width + "px";
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

const QHASH = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
function questStory(q) { const me = G.me ? G.me.name : "voyageur", c = q.client, h = QHASH(q.id), t = q.title.charAt(0).toLowerCase() + q.title.slice(1);
  const open = c ? [`Les affaires de ${c} ne peuvent plus attendre. On dit que tu es de ceux qui tiennent parole, ${me}.`, `${me}. Je n’ai pas le temps pour les politesses : ${c} a besoin de quelqu’un de fiable, et c’est toi qu’on m’a désigné.`, `Écoute-moi bien, ${me}. Chez ${c}, chaque jour qui passe nous coûte. J’ai une tâche que je ne confierais pas à n’importe qui.`]
    : [`Un ordre du château, ${me}. Il ne sera pas répété.`, `Le tableau des missions ne ment jamais, ${me}. Celle-ci t’est destinée.`];
  const mid = [`Il faut ${t}.`, `Ta mission : ${t}.`, `Voici ce que j’attends de toi : ${t}.`];
  const end = q.date && q.date < today() ? "L’échéance est déjà passée. Chaque heure compte, maintenant." : q.date ? `Reviens me voir avant ${fmtD(q.date)}. Tu ne le regretteras pas.` : "Fais-le bien. Le reste suivra.";
  return { intro: open[h % open.length], body: mid[(h >> 3) % mid.length] + " " + end }; }
function questItem(q, onClick) { const late = q.date && q.date < today(); const b = el("button", "qi" + (late ? " late" : "")); b.type = "button";
  const s = el("span"); s.append(el("b", null, q.title), el("small", null, (late ? "En retard : " : q.date ? "Avant le " : "") + (q.date ? fmtD(q.date) : "Sans échéance") + (G.accepted.has(q.id) ? "   acceptée" : "")));
  const st = G.rdy.has(q.id) ? "ready" : G.accepted.has(q.id) ? "grey" : "new"; const ic = el("i", "qm " + st, st === "new" ? "!" : "?"); b.append(ic, s); b.onclick = () => onClick(q); return b; }
function npcWin(n) {
  if (n.kind === "mail") return mailWin();
  if (n.kind === "chalet") return win("npc", "Le chalet", b => { b.append(el("p", null, "Le but : un chalet comme celui-ci, en haut de la montagne, dans moins d’un an."), el("p", "muted", "Chaque quête rendue rapproche l’agence du sommet. Bientôt, la progression du plan de chiffre d’affaires s’affichera ici, visible seulement par Gabriel et Matis."));
    const a = el("div", "acts"); a.append(btn("Admirer la vue", "", () => closeWin("npc"))); b.append(a); }, { reopen: true });
  if (n.kind === "guide") return win("npc", "Gabriel", b => { b.append(el("p", null, "Salut " + G.me.name + ". Ici, chaque tâche est une quête. Va voir les clients sur la place : ceux qui ont du travail pour toi portent un point d’exclamation jaune."),
    el("p", null, "Quand une tâche est faite, rends la quête au client : elle sera cochée dans l’application, et tu gagnes de l’expérience et de l’or. Les quêtes rendues à l’heure rapportent plus."),
    el("p", "muted", "Tu peux aussi écrire à l’équipe depuis la boîte aux lettres, devant l’agence."));
    const a = el("div", "acts"); a.append(btn("Voir les touches", "alt", () => { closeWin("npc"); keysWin(); }), btn("Au revoir", "", () => closeWin("npc"))); b.append(a); }, { reopen: true });
  const list = G.quests.filter(q => n.kind === "board" ? !q.client : q.client === n.name).sort((a, b) => (G.rdy.has(b.id) - G.rdy.has(a.id)) || (G.accepted.has(a.id) - G.accepted.has(b.id)));
  win("npc", n.name, b0 => { const b = el("div", "parch"); b0.append(b);
    b.append(el("p", "ptx", list.some(q => G.rdy.has(q.id)) ? "Alors, " + G.me.name + ", c’est fait ? Montre-moi ça." : list.length ? (n.kind === "board" ? "Des missions internes attendent quelqu’un de motivé." : "Salutations, " + G.me.name + ". J’ai du travail pour toi.") : "Rien pour toi pour l’instant. Reviens plus tard."));
    const L = el("div", "ql gossip"); list.forEach(q => L.append(questItem(q, openQuest))); b.append(L);
    const a = el("div", "pacts"); a.append(el("span"), btn("Au revoir", "pbtn", () => closeWin("npc"))); b0.append(a);
  }, { reopen: true, width: 400, cls: "pwin" });
}
function openQuest(q) {
  const late = q.date && q.date < today(), xp = late ? 100 : 150, gold = late ? 10 : 15, acc = G.accepted.has(q.id), ready = G.rdy.has(q.id), st = questStory(q);
  win("quest", "", b => {
    const pr = el("div", "parch");
    pr.append(el("h3", "pt", q.title));
    pr.append(el("p", "ptx", (ready ? "Revenir voir " : "Aider ") + (q.client || "le château") + (ready ? " pour rendre la quête." : " : " + q.title.charAt(0).toLowerCase() + q.title.slice(1) + ".")));
    const ob = el("p", "pobj" + (ready ? " done" : "")); ob.textContent = (ready ? "1/1 " : "0/1 ") + q.title + (ready ? " (Terminé)" : ""); pr.append(ob);
    if (q.date) pr.append(el("p", "ptx" + (late ? " late" : " soft"), (late ? "En retard depuis " : "À rendre avant ") + fmtD(q.date) + "."));
    pr.append(el("h4", null, ready ? "Achèvement" : "Description"));
    if (ready) pr.append(el("p", "ptx", "Bien joué, " + G.me.name + ". Je savais que l’on pouvait compter sur toi. Voici ce qui t’est dû."));
    else { pr.append(el("p", "ptx", st.intro), el("p", "ptx", st.body)); if (q.note) pr.append(el("p", "ptx soft", q.note)); }
    pr.append(el("h4", null, "Récompenses"));
    const r1 = el("div", "prow"); r1.append(el("span", null, "Vous recevrez :"), el("b", "pnum", String(gold)), el("span", "coin-g")); pr.append(r1);
    const r2 = el("div", "prow"); r2.append(el("span", null, "Expérience :"), el("b", "pnum", String(xp))); pr.append(r2);
    b.append(pr);
    const a = el("div", "pacts");
    if (ready) a.append(btn("Terminer la quête", "pbtn", e => { G.rdy.delete(q.id); complete(q, e.currentTarget); }), btn("Plus tard", "pbtn", () => closeWin("quest")));
    else if (!acc) a.append(btn("Accepter", "pbtn", () => { G.accepted.add(q.id); saveAcc(); log("Quête acceptée : " + q.title); tone(523, .12); tone(784, .2, .1); renderTracker(); refreshMarks(); closeWin("quest"); }), btn("Refuser", "pbtn", () => closeWin("quest")));
    else a.append(btn("Abandonner", "pbtn", () => { G.accepted.delete(q.id); saveAcc(); log("Quête abandonnée : " + q.title); renderTracker(); refreshMarks(); closeWin("quest"); }), btn("Objectif accompli", "pbtn", () => { G.rdy.add(q.id); saveAcc(); log("Objectif accompli : " + q.title + ". Retourne voir " + (q.client || "le tableau des missions") + "."); tone(880, .15); renderTracker(); refreshMarks(); closeWin("quest"); }));
    b.append(a);
  }, { reopen: true, width: 400, left: innerWidth / 2 - 200, top: 60, cls: "pwin" });
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
function bagWin() { win("bag", "Sacs", b => { const p = el("p"); p.append(el("span", "coin"), G.me.gold + " pièces d’or"); b.append(p); const g = el("div", "bag"); for (let i = 0; i < 18; i++) g.append(el("div")); b.append(g);
  const it = g.firstChild; it.className = "bag-it" + (G.armed ? " used" : ""); it.title = "Épée longue"; it.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS.epee + "</svg>"; it.onclick = () => toggleSword();
  b.append(el("p", "muted", G.armed ? "Épée longue : en main. Clique dessus pour la ranger." : "Épée longue : rangée. Clique dessus pour la prendre en main.")); }, { left: innerWidth - 470, top: innerHeight - 460 }); }
function keysWin() { win("keys", "Touches", b => { const k = el("div", "keys");
  [["Z Q S D (ou W A S D)", "Avancer, tourner, reculer"], ["A et E (ou Q et E)", "Pas de côté"], ["Espace", "Sauter"], ["Clic gauche maintenu", "Tourner la caméra"], ["Clic droit maintenu", "Tourner la caméra et le personnage"], ["Deux boutons", "Avancer"], ["Verr Num", "Course automatique"], ["Molette", "Zoom"], ["Clic droit sur un PNJ ou F", "Parler, ouvrir"], ["Tab", "Cibler le plus proche"], ["Entrée", "Discussion"], ["1", "Prendre ou ranger l’épée"], ["2", "Coup d’épée (devant toi, sur un joueur proche)"], ["3 à 9", "Barre d’action (8 : arbre droit)"], ["L, C, B, M", "Quêtes, personnage, sacs, carte"], ["Échap", "Fermer, menu"]].forEach(([a, c]) => { k.append(el("kbd", null, a), el("span", null, c)); });
  b.append(k); }, { width: 440, left: innerWidth / 2 - 220, top: 100 }); }
function menuWin() { win("menu", "Menu du jeu", b => { const l = el("div", "menu-l"); l.append(btn("Reprendre", "lemon", () => closeWin("menu")), btn("Touches", "alt", () => { closeWin("menu"); keysWin(); }), btn("Retour à l’application", "", () => location.href = "/gestion")); b.append(l);
  b.append(el("h4", null, "Qualité graphique")); const qt = el("div", "tabs");
  [["basse", "Basse"], ["moyenne", "Moyenne"], ["haute", "Haute"]].forEach(([k, n]) => { const x = el("button", null, n); x.type = "button"; x.setAttribute("aria-pressed", String(Q === k)); x.onclick = () => { try { localStorage.setItem("hg-q", k); } catch (e) {} location.reload(); }; qt.append(x); });
  b.append(qt, el("p", "muted", "Basse pour les ordinateurs légers. Le jeu se recharge."));
  b.append(el("h4", null, "Crédits"), el("p", "muted", "Chevalier : « Knight with Cape » par HI3D.cc. Cheval : « Horse » par Henry S. 4x4 : « Range Rover Sport (2018) » par Weitstern. Licence CC BY 4.0, Sketchfab. Personnages, animations et nature : Quaternius et Kay Lousberg, licence CC0.")); }, { width: 300, left: innerWidth / 2 - 150, top: innerHeight / 2 - 140 }); }
function mapWin() { win("map", "Carte du Hameau", b => { const c = document.createElement("canvas"); c.id = "wmap"; c.width = 640; c.height = 640; b.append(c); drawMap(c.getContext("2d"), 640, 0, 0, 640 / 220, true); }, { width: 680, left: innerWidth / 2 - 340, top: 60 }); }

/* Carte et mini carte */
function drawMap(x, W, cx, cz, k, full) {
  x.save(); x.clearRect(0, 0, W, W); x.fillStyle = "#3E6A2C"; x.fillRect(0, 0, W, W);
  const tp = (wx, wz) => [W / 2 + (wx - cx) * k, W / 2 + (wz - cz) * k];
  x.fillStyle = "#A89A7C"; [[0, 95, 7, 140], [0, -95, 7, 140], [95, 0, 140, 7], [-95, 0, 140, 7]].forEach(([a, c, w, h]) => { const [px, pz] = tp(a - w / 2, c - h / 2); x.fillRect(px, pz, w * k, h * k); });
  x.strokeStyle = "#9A7B52"; x.lineWidth = Math.max(2, 9 * k); x.lineJoin = "round"; x.beginPath(); TRAIL.forEach((p, i) => { const [a2, b2] = tp(p.x, p.z); i ? x.lineTo(a2, b2) : x.moveTo(a2, b2); }); x.stroke();
  let [px, pz] = tp(0, 0); x.fillStyle = "#B9AE96"; x.beginPath(); x.arc(px, pz, 30 * k, 0, 7); x.fill(); x.fillStyle = "#4DA3D9"; x.beginPath(); x.arc(px, pz, 5 * k, 0, 7); x.fill();
  [px, pz] = tp(HQ.x - 23, HQ.z - 17); x.fillStyle = "#6E675C"; x.fillRect(px, pz, 46 * k, 34 * k); x.fillStyle = "#3E6A2C"; x.fillRect(px + 2.4 * k, pz + 2.4 * k, 41.2 * k, 29.2 * k); x.fillStyle = "#6E675C"; x.fillRect(px + 13 * k, pz + 3 * k, 20 * k, 14 * k); x.fillStyle = "#1F2B57"; [[0, 0], [46, 0], [0, 34], [46, 34]].forEach(([a, c]) => { x.beginPath(); x.arc(px + a * k, pz + c * k, 4 * k, 0, 7); x.fill(); });
  QUARTERS.forEach(q => { const [a, b2] = tp(q.x, q.z); x.fillStyle = "#8A6A44"; x.fillRect(a - 9 * k, b2 - 9 * k, 18 * k, 18 * k); if (full) { x.font = "italic 18px 'Bebas Neue'"; x.fillStyle = "#F5D27A"; x.textAlign = "center"; x.fillText(q.name.toUpperCase(), a, b2 - 14 * k - 18); } });
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
  if (L === "f" && G.pass) { leavePass(); return; }
  if (L === "f" && G.ride) { dismount(); return; }
  if (L === "f" && !G.dead) { const oc = nearOtherCar(9.5); if (oc) { G.pass = oc.name; G.emote = ""; CAM.want = 22; log("Tu montes à côté de " + oc.name + ". F pour descendre."); renderBar(); return; } }
  if (L === "f") { const rd = nearestRide(7), nn0 = nearestNpc(9); if (rd && (!nn0 || dist(nn0) > Math.hypot(rd.x - P.x, rd.z - P.z))) { mount(rd); return; } }
  if (L === "f") { const n = G.target && G.target.kind ? G.target : nearestNpc(9); if (n && dist(n) < 10) npcWin(n); else if (n) log("Tu es trop loin.", "err"); return; }
  if (L === "l") return logWin(); if (L === "c") return charWin(); if (L === "b") return bagWin(); if (L === "m") return mapWin();
  if (k === "Space" && P.grounded && !G.dead && !G.pass) { P.vy = 9; P.grounded = false; G.emote = ""; e.preventDefault(); }
  const d = /^Digit([1-9])$/.exec(k); if (d) { ACTIONS[Number(d[1]) - 1][3](); }
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
// Curseur « parler » au survol d'un personnage, d'une monture ou d'un objet utilisable
let hoverT = 0; canvas.addEventListener("mousemove", e => { if (LMB || RMB || !P.model) return; const t = performance.now(); if (t - hoverT < 90) return; hoverT = t;
  ray.setFromCamera(new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1), camera);
  const objs = G.npcs.filter(n => dist(n) < 60).map(n => n.obj).concat(RIDES.map(r => r.obj)).filter(Boolean); canvas.classList.toggle("talk", !!ray.intersectObjects(objs, true)[0]); });
canvas.addEventListener("wheel", e => { e.preventDefault(); CAM.want = Math.max(2.5, Math.min(34, CAM.want * (e.deltaY > 0 ? 1.12 : 0.89))); }, { passive: false });

const ray = new THREE.Raycaster();
function pick(cx, cy, button) {
  const v = new THREE.Vector2(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1); ray.setFromCamera(v, camera);
  const objs = G.npcs.filter(n => dist(n) < 60).map(n => n.obj).filter(Boolean).concat(Object.values(G.others).map(o => o.model)).concat(RIDES.map(r => r.obj));
  const hit = ray.intersectObjects(objs, true)[0];
  if (hit && button === 2 && !G.ride) { let o0 = hit.object; while (o0 && !RIDES.some(r => r.obj === o0)) o0 = o0.parent; const rd = o0 && RIDES.find(r => r.obj === o0); if (rd) { if (Math.hypot(rd.x - P.x, rd.z - P.z) < 9 && !rd.rider) mount(rd); else log("Tu es trop loin.", "err"); return; } }
  if (!hit) { if (button === 0) setTarget(null); return; }
  let o = hit.object; while (o && !objs.includes(o)) o = o.parent;
  const n = G.npcs.find(x => x.obj === o); const pl = Object.values(G.others).find(x => x.model === o);
  if (n) { setTarget(n); if (button === 2) { if (dist(n) < 10) npcWin(n); else log("Tu es trop loin. Approche-toi.", "err"); } }
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
/* Synchro : chaque position reçue est horodatée par le serveur ; on affiche les autres avec 250 ms de retard
   en interpolant entre deux positions connues, ce qui donne un mouvement fluide même si le réseau hoquette. */
const DELAY = 250;
function upsertOther(p) {
  let o = G.others[p.name];
  if (!o) { const m = makeChar(p.name, { sub: "Niveau " + (p.lvl || 1) }); scene.add(m);
    o = G.others[p.name] = { name: p.name, model: m, snaps: [], pos: { x: p.x, z: p.z, y: p.y || 0, ry: p.ry, mv: 0, emo: "" }, lvl: p.lvl, miss: 0 }; m.position.set(p.x, p.y || 0, p.z);
    if (G.ready) log(p.name + " arrive dans le Hameau."); }
  o.miss = 0; const last = o.snaps[o.snaps.length - 1];
  if (!last || p.t > last.t) { o.snaps.push({ t: p.t, x: p.x, z: p.z, y: p.y || 0, ry: p.ry, mv: p.mv, emo: p.emo, ride: p.ride || "", rp: p.rp || 0, rr: p.rr || 0, sp: p.sp || 0, atk: p.atk || 0, arm: p.arm ? 1 : 0, hp: p.hp == null ? 100 : p.hp, drv: p.drv || "" }); if (o.snaps.length > 30) o.snaps.shift(); }
  if (o.lvl !== p.lvl) { o.lvl = p.lvl; const t = o.model.userData.tag; t.material.map = textTex([{ t: p.name, color: "#C6FF33" }, { t: "Niveau " + p.lvl, font: "500 32px Inter", color: "#ddd" }], { h: 192 }); }
}
const angLerp = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * k; };
function otherAt(o) {
  const S = o.snaps; if (!S.length) return o.pos; const rt = Date.now() + (G.off || 0) - DELAY;
  if (rt <= S[0].t) return Object.assign(o.pos, S[0]);
  for (let i = S.length - 1; i > 0; i--) { const a = S[i - 1], b = S[i]; if (rt >= a.t && rt <= b.t) { const k = (rt - a.t) / Math.max(1, b.t - a.t);
    return Object.assign(o.pos, { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, y: a.y + (b.y - a.y) * k, ry: angLerp(a.ry, b.ry, k), mv: k < .5 ? a.mv : b.mv, emo: b.emo, ride: b.ride, rp: a.rp + (b.rp - a.rp) * k, rr: a.rr + (b.rr - a.rr) * k, sp: b.sp }); } }
  const L = S[S.length - 1], P2 = S[S.length - 2], over = Math.min(rt - L.t, 300);
  if (P2 && L.mv && L.t > P2.t) { const v = over / (L.t - P2.t); return Object.assign(o.pos, { x: L.x + (L.x - P2.x) * v, z: L.z + (L.z - P2.z) * v, y: L.y, ry: L.ry, mv: L.mv, emo: L.emo, ride: L.ride, rp: L.rp, rr: L.rr, sp: L.sp }); }
  return Object.assign(o.pos, L);
}
function bubble(model, text) {
  const old = model.userData.bub; if (old) model.remove(old);
  const t = text.length > 46 ? text.slice(0, 44) + "…" : text;
  const s = label([{ t, font: "500 34px Inter", color: "#111" }], { w: 768, h: 96, bg: "rgba(255,255,255,.92)", stroke: null }, 1.1); s.position.y = 6.3; s.scale.set(7, 0.9, 1);
  model.add(s); model.userData.bub = s; setTimeout(() => { if (model.userData.bub === s) { model.remove(s); model.userData.bub = null; } }, 7000);
}
let syncing = false; G.ss = Date.now(); G.pax = new Set();
async function sync() {
  if (syncing) return; syncing = true;
  try {
    const say = G.sayQ; G.sayQ = "";
    const t0 = Date.now();
    const r = await api("POST", "/api/g-game/pos", { x: +P.x.toFixed(2), z: +P.z.toFixed(2), y: +P.y.toFixed(2), ry: +P.ry.toFixed(3), mv: P.moving ? 1 : 0, emo: G.emote, arm: G.armed ? 1 : 0, hp: Math.round(G.hp), atk: G.atk, ev: G.evQ.splice(0), drv: G.pass || "", cls: P.model ? P.model.userData.cls : "", lvl: G.me ? G.me.lvl : 1, say, since: G.sid, ss: G.ss, ride: G.pass ? "pass" : G.ride ? G.ride.kind : "", rp: G.ride ? +(G.ride.pitch || 0).toFixed(3) : 0, rr: G.ride ? +(G.ride.roll || 0).toFixed(3) : 0, sp: G.ride ? +Math.abs(G.ride.speed).toFixed(1) : 0 });
    if (r.kicked) { G.kicked = true; return gate("Tu joues déjà dans un autre onglet ou sur un autre appareil. Ferme celui-ci pour éviter les bugs de position."); }
    const t1 = Date.now(); if (r.now) { const off = r.now - (t0 + t1) / 2, rtt = t1 - t0; if (G.off == null || rtt < (G.rtt || 1e9) * 1.5) { G.off = G.off == null ? off : G.off * 0.8 + off * 0.2; G.rtt = G.rtt == null ? rtt : G.rtt * 0.8 + rtt * 0.2; } }
    (r.players || []).forEach(upsertOther);
    const live = new Set((r.players || []).map(p => p.name));
    // Un joueur ne disparaît qu'après plusieurs réponses sans lui (évite les clignotements)
    Object.keys(G.others).forEach(n => { if (!live.has(n) && ++G.others[n].miss > 25) { scene.remove(G.others[n].model); delete G.others[n]; log(n + " quitte le Hameau."); } });
    const fresh = !!G.synced; G.synced = true;
    (r.players || []).forEach(p => { if (p.ride === "pass" && p.drv === G.me.name) { if (!G.pax.has(p.name)) { G.pax.add(p.name); log(p.name + " monte avec toi."); } } else if (G.pax.has(p.name)) { G.pax.delete(p.name); log(p.name + " descend du 4x4."); } });
    (r.says || []).forEach(s => { if (s.text[0] === "§") { if (!fresh) return; const [, kind, a, n] = s.text.split("§"), dmg = +n || 0;
        if (kind === "hit") { if (a === G.me.name) { if (s.who !== G.me.name) { log(s.who + " te frappe : " + dmg + " points de dégâts.", "err"); takeDamage(dmg, s.who); } } else if (G.others[a]) dmgPop(G.others[a].model, dmg, 5.6, "#FFD21F"); }
        else if (kind === "ko") log(a + " a vaincu " + s.who + " en duel.", "say");
        return; }
      const p = el("p", "say"); p.append(el("b", null, "[" + s.who + "] "), document.createTextNode("dit : " + s.text)); log([p.firstChild, p.lastChild], "say");
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
  [...G.accepted].forEach(id => { if (!G.quests.some(q => q.id === id)) G.accepted.delete(id); }); [...G.rdy].forEach(id => { if (!G.quests.some(q => q.id === id)) G.rdy.delete(id); }); saveAcc(); if (typeof refreshMarks === "function" && G.npcs.length) refreshMarks();
  if (oldIds !== G.quests.map(q => q.id).join() || !G.npcs.length) buildNpcs();
  if (!firstMail) G.mail.filter(m => !m.read && !unreadBefore.has(m.id)).forEach(m => { log("Nouvelle lettre de " + m.from + "."); tone(1040, .2); });
  renderMe(); renderTracker(); renderMailFlag();
}

/* ---------- Boucle ---------- */
const clock = new THREE.Clock(); let syncT = 0, loadT = 0, saveT = 0, hintN = null;
const fwd = new THREE.Vector3(), tmp = new THREE.Vector3();
let perfN = 0, perfT = 0, perfDone = false;
function perfCheck(dt) {
  if (perfDone || !AUTO) return; perfT += dt; perfN++;
  if (perfT > 6) { perfDone = true; const fps = perfN / perfT;
    try { localStorage.setItem("hg-q", fps < 28 ? "basse" : fps < 50 ? "moyenne" : "haute"); } catch (e) {}
    if (fps < 28) { log("Ton ordinateur est un peu juste : je passe en qualité basse.", "sys"); setTimeout(() => location.reload(), 1500); }
    else if (fps >= 50) log("Ton ordinateur est costaud : qualité haute au prochain lancement (réglable avec Échap).", "sys"); }
}
function step() {
  requestAnimationFrame(step);
  const dt = Math.min(0.05, clock.getDelta()); if (clock.elapsedTime > 3) perfCheck(dt);
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
  RIDES.forEach(r => { if (r.kind === "horse" && r !== G.ride) wanderHorse(r, dt); });
  if (G.pass) { const o = G.others[G.pass];
    if (!o || o.rideKind !== "car" || !o.rideObj) { log("Le conducteur est descendu."); leavePass(); }
    else { const c = o.rideObj.obj.position; P.x = c.x; P.y = c.y; P.z = c.z; P.ry = o.rideObj.obj.rotation.y; P.moving = false; P.model.position.set(P.x, P.y, P.z); P.model.visible = false; if (!LMB && !RMB) CAM.yaw += (P.ry - CAM.yaw) * Math.min(1, dt * 3); } }
  else if (G.ride) {
    if (G.ride.kind === "car") { driveCar(G.ride, dt, up || (LMB && RMB), down, K.KeyA || K.ArrowLeft, K.KeyD || K.ArrowRight); P.model.visible = false; }
    else { rideHorse(G.ride, dt, up || (LMB && RMB), down, K.KeyA || K.ArrowLeft, K.KeyD || K.ArrowRight); }
    if (!LMB && !RMB) CAM.yaw += (P.ry - CAM.yaw) * Math.min(1, dt * 3);
    P.model.rotation.set(0, P.ry, 0);
    if (G.ride.kind !== "car") { const sd = saddleOf(G.ride.obj); P.model.position.set(sd.x - Math.sin(G.ride.yaw) * 0.45, sd.y - HERO_H * 0.47, sd.z - Math.cos(G.ride.yaw) * 0.45); animChar(P.model, dt, false, 1, "cheval", false); }
    else P.model.position.set(P.x, P.y, P.z);
  } else {
  if (G.dead) { mvF = 0; strafe = 0; }
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
  const gy = groundAt(P.x, P.z); P.vy -= 24 * dt; P.y += P.vy * dt; if (P.y <= gy) { P.y = gy; P.vy = 0; P.grounded = true; }
  P.model.position.set(P.x, P.y, P.z); P.model.rotation.y = P.ry;
  animChar(P.model, dt, P.moving, mvF < 0 ? -0.5 : (G.mount ? 1.5 : 1), G.emote, !P.grounded && P.y - groundAt(P.x, P.z) > 0.25);
  }
  // Autres joueurs : glissement doux vers la dernière position reçue
  Object.values(G.others).forEach(o => { const t = otherAt(o), Ls = o.snaps[o.snaps.length - 1] || {};
    if (o.lastAtk != null && Ls.atk !== o.lastAtk && !t.ride) o.model.userData.swing = 0; o.lastAtk = Ls.atk; o.hp = Ls.hp == null ? 100 : Ls.hp; o.model.userData.armed = !!Ls.arm;
    o.model.position.set(t.x, t.y, t.z); o.model.rotation.y = t.ry; o.model.visible = true; animChar(o.model, dt, !!t.mv && !t.ride, 1, t.ride === "horse" ? "cheval" : t.ride ? "" : t.emo, !t.ride && t.y - groundAt(t.x, t.z) > 0.4); otherRide(o, t, dt); });
  // PNJ : petits mouvements et regard vers le joueur proche
  const now = performance.now() / 1000;
  G.npcs.forEach((n, i) => { if (n.mark) n.mark.position.y = (n.my || 6.4) + Math.sin(now * 2 + i) * 0.18; if (n.model) { const d = dist(n); n.model.visible = d < 170; if (d < 75) animChar(n.model, dt, false, 1, ""); } });
  BOARD.mark.position.y = 5.6 + Math.sin(now * 2) * 0.18;
  CLOUDS.forEach(c => { c.position.x += dt * 2.2; if (c.position.x > 700) c.position.x = -700; });
  FLAGS.forEach((f, i) => { const p = f.geometry.attributes.position; for (let k = 0; k < p.count; k++) { const x = p.getX(k) + 1.3; p.setZ(k, Math.sin(now * 4 + x * 2.2 + i) * 0.18 * x); } p.needsUpdate = true; });
  TORCHES.forEach((t, i) => t.scale.setScalar(0.85 + Math.sin(now * 13 + i * 2) * 0.12 + Math.sin(now * 7.3) * 0.06));
  WIND.value = now; if (window.__jets) window.__jets.forEach((j, i) => { j.scale.x = j.scale.z = 0.9 + Math.sin(now * 9 + i) * 0.15; });
  MIST.forEach(m => { const u = m.userData; u.a += u.sp * dt; m.position.x = MT.x + Math.cos(u.a) * u.r; m.position.z = MT.z + Math.sin(u.a) * u.r; m.position.y = u.y + Math.sin(now * .3 + u.a * 3) * 1.5; m.material.opacity = u.op * Math.max(0, Math.min(1, (m.position.distanceTo(camera.position) - 60) / 90)); });
  { const sm = window.__smoke; if (Math.random() < dt * 4) { const p = new THREE.Mesh(new THREE.SphereGeometry(.6, 8, 6), SMOKE_M.clone()); p.position.set(sm.x, sm.y, sm.z); p.userData.t = 0; scene.add(p); sm.parts.push(p); }
    sm.parts = sm.parts.filter(p => { p.userData.t += dt; p.position.y += dt * 2.2; p.position.x += dt * .8; p.scale.setScalar(1 + p.userData.t * .9); p.material.opacity = .5 * Math.max(0, 1 - p.userData.t / 5); if (p.userData.t > 5) { scene.remove(p); p.geometry.dispose(); return false; } return true; }); }
  // Caméra derrière le personnage
  CAM.dist += (CAM.want - CAM.dist) * Math.min(1, dt * 8);
  const head = new THREE.Vector3(P.x, P.y + (G.ride && G.ride.kind === "car" ? 3.2 : 3.4), P.z);
  fwd.set(-Math.sin(CAM.yaw) * Math.cos(CAM.pitch), Math.sin(CAM.pitch), -Math.cos(CAM.yaw) * Math.cos(CAM.pitch));
  const inKeep = Math.abs(P.x - HQ.x) < 15.6 && P.z - HQ.z > -14.6 && P.z - HQ.z < .6; tmp.copy(head).addScaledVector(fwd, inKeep ? Math.min(CAM.dist, 7.5) : CAM.dist); const gc = heightAt(tmp.x, tmp.z) + 0.6; if (tmp.y < gc) tmp.y = gc;
  { const lx = P.x - HQ.x; if (inKeep) { const [a, b] = lx < -6 ? [-15, -6.8] : lx > 6 ? [6.8, 15] : [-5.2, 5.2];
    tmp.x = HQ.x + Math.max(a, Math.min(b, tmp.x - HQ.x)); tmp.z = HQ.z + Math.max(-14, Math.min(-.4, tmp.z - HQ.z)); tmp.y = Math.min(tmp.y, P.y + 6.2); } }
  camera.position.copy(tmp); camera.lookAt(head);
  if (G.pass) P.model.visible = false; else if (!G.ride || G.ride.kind !== "car") P.model.visible = CAM.dist > 3.2;
  sun.position.copy(SUN_DIR).multiplyScalar(150).add(_v.set(P.x, P.y, P.z)); sun.target.position.set(P.x, P.y, P.z);
  // Indice d'interaction
  const rdH = !G.ride && !G.pass && nearestRide(7), ocH = !G.ride && !G.pass && nearOtherCar(9.5);
  if (G.pass || ocH) { const key = G.pass ? "pass-off" : "pass-on"; if (hintN !== key) { hintN = key; const h = $("#hint"); h.innerHTML = ""; h.append(el("kbd", null, "F"), document.createTextNode(G.pass ? " : descendre du 4x4" : " : monter côté passager")); } }
  else if (G.ride || rdH) { const key = G.ride ? "ride-off" : "ride-" + rdH.kind; if (hintN !== key) { hintN = key; const h = $("#hint"); h.innerHTML = ""; h.append(el("kbd", null, "F"), document.createTextNode(G.ride ? (G.ride.kind === "car" ? " : descendre du 4x4" : " : descendre de cheval") : rdH.kind === "car" ? " : monter dans le Range Rover" : " : monter à cheval")); h.classList.add("on"); } }
  else { const nn = nearestNpc(9); if (nn !== hintN) { hintN = nn; const h = $("#hint"); if (nn) { h.innerHTML = ""; h.append(document.createTextNode("Clic droit ou "), el("kbd", null, "F"), document.createTextNode(" : " + (nn.kind === "mail" ? "ouvrir la boîte aux lettres" : nn.kind === "board" ? "lire le tableau" : nn.kind === "chalet" ? "entrer dans le chalet" : "parler à " + nn.name))); h.classList.add("on"); } else h.classList.remove("on"); } }
  // Combat : recharge, régénération hors combat, chiffres de dégâts, cible
  if (atkCd > 0) atkCd -= dt;
  if (!G.dead && G.hp < 100 && clock.elapsedTime - lastHit > 8) { G.hp = Math.min(100, G.hp + 6 * dt); renderHp(); }
  for (let i = POPS.length - 1; i >= 0; i--) { const p = POPS[i]; p.t += dt; p.s.position.y += dt * 2.4; p.s.material.opacity = Math.max(0, 1 - p.t / 1.2); if (p.t > 1.2) { scene.remove(p.s); p.s.material.map.dispose(); p.s.material.dispose(); POPS.splice(i, 1); } }
  DUMMIES.forEach(d => { if (d.shake > 0) { d.shake -= dt; d.obj.rotation.z = Math.sin(d.shake * 40) * d.shake * 0.25; } });
  if (G.target && G.target.player) { const b = $("#tframe .bar.hp i"); if (b) b.style.width = (G.target.player.hp == null ? 100 : G.target.player.hp) + "%"; }
  { const c = RIDES.find(r => r.kind === "car"); if (c && c !== G.ride) c.obj.visible = !Object.values(G.others).some(o => o.rideKind === "car" && o.rideObj); }
  // Minuteries
  if (G.hearthCd > 0) { const before = Math.ceil(G.hearthCd); G.hearthCd -= dt; if (Math.ceil(G.hearthCd) !== before) renderBar(); }
  syncT += dt; if (syncT > 0.1 && !G.kicked) { syncT = 0; sync(); }
  loadT += dt; if (loadT > 30) { loadT = 0; loadGame().catch(() => {}); }
  saveT += dt; if (saveT > 3) { saveT = 0; try { localStorage.setItem("hg-pos", JSON.stringify({ x: P.x, z: P.z, ry: P.ry })); } catch (e) {} }
  drawMap(mm, 180, P.x, P.z, 1.1, false);
  $("#mm-clock").textContent = new Date().toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  composer.render();
}

/* ---------- Démarrage ---------- */
(async () => {
  try { await loadGame(); }
  catch (e) { return gate(e.status === 401 ? "Ta session a expiré. Reconnecte-toi dans l’application." : "Le Hameau ne répond pas : " + e.message); }
  P.model = makeChar(G.me.name, { sub: "Niveau " + G.me.lvl }); scene.add(P.model); P.model.userData.armed = G.armed; renderMe();
  renderBar(); renderTracker();
  $("#loading").hidden = true; canvas.focus();
  log("Bienvenue dans le Hameau Gacolet, " + G.me.name + ".");
  log(G.quests.length ? "Tu as " + G.quests.length + " quête" + (G.quests.length > 1 ? "s" : "") + " qui t’attend" + (G.quests.length > 1 ? "ent" : "") + ". Cherche les points d’exclamation jaunes." : "Aucune quête pour l’instant. Profite de la place.");
  if (!localStorage.getItem("hg-seen")) { try { localStorage.setItem("hg-seen", "1"); } catch (e) {} setTimeout(keysWin, 600); }
  G.ready = true;
  step();
})();
})();
