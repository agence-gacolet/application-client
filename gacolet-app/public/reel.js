/* Hameau Gacolet : essai de rendu réaliste (façon Red Dead Redemption)
   Ciel en photo HDR, sols, rochers et plantes scannés de Poly Haven (CC0), arbres générés par EZ-Tree (MIT),
   herbe dense animée, brume au sol, rayons du soleil, occlusion ambiante, profondeur de champ et étalonnage cinéma. */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RGBELoader } from "three/addons/loaders/RGBELoader.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { Tree } from "ez-tree";

const $ = s => document.querySelector(s);
const say = t => { const l = $("#ld p"); if (l) l.textContent = t; };
const Q = new URLSearchParams(location.search), LOWQ = Q.has("leger");

// Brouillard au sol : dense dans les creux, léger en hauteur
THREE.ShaderChunk.fog_pars_vertex = THREE.ShaderChunk.fog_pars_vertex.replace("varying float vFogDepth;", "varying float vFogDepth; varying float vFogY;");
THREE.ShaderChunk.fog_vertex = THREE.ShaderChunk.fog_vertex.replace("vFogDepth = - mvPosition.z;", "vFogDepth = - mvPosition.z; vFogY = ( inverse( viewMatrix ) * mvPosition ).y;");
THREE.ShaderChunk.fog_pars_fragment = THREE.ShaderChunk.fog_pars_fragment.replace("varying float vFogDepth;", "varying float vFogDepth; varying float vFogY;");
THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment.replace("float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );", "float fogH = exp( - max( vFogY - 2.0, 0.0 ) * 0.06 ); float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth * ( 0.25 + 2.6 * fogH ) );");

/* ---------- Moteur ---------- */
const canvas = $("#gl");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, LOWQ ? 1 : 1.5)); renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.AgXToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0xC9B79A, 0.0105);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 1200);

/* ---------- Bruit et relief ---------- */
const hash = (x, z) => { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); };
const vnoise = (x, z) => { const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
const fbm = (x, z, o) => { let s = 0, a = .5, f = 1; for (let i = 0; i < (o || 5); i++) { s += a * vnoise(x * f, z * f); f *= 2.02; a *= .5; } return s; };
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const WORLD = 640;
// chemin de terre qui serpente à travers la forêt et passe par le campement
const pathX = z => Math.sin(z * .018) * 22 + Math.sin(z * .047 + 1.3) * 6;
const pathD = (x, z) => Math.abs(x - pathX(z));
const H0 = fbm(0, 0) * 34;
function height(x, z) { let h = fbm(x * .0065 + 3, z * .0065 - 7) * 34 + fbm(x * .03, z * .03, 3) * 3.2 + Math.pow(fbm(x * .004 - 9, z * .004 + 2, 3), 3) * 60;
  const d = Math.hypot(x, z), flat = sstep(14, 34, d); h = H0 + (h - H0) * flat; const pd = pathD(x, z); h -= (1 - sstep(1.2, 4.5, pd)) * .25; return h; }
const clearing = (x, z) => 1 - sstep(16, 26, Math.hypot(x, z));
const forest = (x, z) => sstep(.42, .6, fbm(x * .012 + 40, z * .012 - 10, 4)) * (1 - clearing(x, z)) * sstep(5, 11, pathD(x, z));

/* Carte des hauteurs pour l'herbe (hauteur sur 16 bits + densité) */
const HM = 512, hmData = new Uint8Array(HM * HM * 4); let hMin = 1e9, hMax = -1e9; const hs = [];
for (let j = 0; j < HM; j++) for (let i = 0; i < HM; i++) { const x = (i / (HM - 1) - .5) * WORLD, z = (j / (HM - 1) - .5) * WORLD, h = height(x, z); hs.push(h); hMin = Math.min(hMin, h); hMax = Math.max(hMax, h); }
for (let j = 0; j < HM; j++) for (let i = 0; i < HM; i++) { const k = j * HM + i, x = (i / (HM - 1) - .5) * WORLD, z = (j / (HM - 1) - .5) * WORLD, v = Math.round((hs[k] - hMin) / (hMax - hMin) * 65535);
  const dens = sstep(1.6, 4.5, pathD(x, z)) * (1 - clearing(x, z) * .55) * (1 - forest(x, z) * .55); hmData.set([v >> 8, v & 255, Math.round(dens * 255), 255], k * 4); }
const hmTex = new THREE.DataTexture(hmData, HM, HM, THREE.RGBAFormat, THREE.UnsignedByteType); hmTex.needsUpdate = true;

/* ---------- Chargement Poly Haven ---------- */
const PH = "https://api.polyhaven.com/files/";
const phInfo = id => fetch(PH + id).then(r => r.json());
const texL = new THREE.TextureLoader();
const loadTex = (url, srgb) => new Promise(ok => texL.load(url, t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); if (srgb) t.colorSpace = THREE.SRGBColorSpace; ok(t); }, undefined, () => ok(null)));
async function phTexture(id, res) { const f = await phInfo(id), r = res || "2k"; const [map, nor, rough] = await Promise.all([loadTex(f.Diffuse[r].jpg.url, true), loadTex(f.nor_gl[r].jpg.url), loadTex((f.Rough || f.rough)[r].jpg.url)]); return { map, nor, rough }; }
async function phModel(id, res) { const f = await phInfo(id), g = f.gltf[res || "1k"].gltf, inc = {}; Object.entries(g.include || {}).forEach(([k, v]) => inc[k] = v.url);
  const man = new THREE.LoadingManager(); man.setURLModifier(u => { const k = Object.keys(inc).find(p => u.endsWith(p)); return k ? inc[k] : u; });
  return new Promise((ok, ko) => new GLTFLoader(man).load(g.url, ok, undefined, ko)); }
async function phHdri(id) { const f = await phInfo(id); return new Promise((ok, ko) => new RGBELoader().load(f.hdri["2k"].hdr.url, ok, undefined, ko)); }

/* ---------- Lumière : le soleil est retrouvé dans la photo du ciel ---------- */
const sun = new THREE.DirectionalLight(0xFFE2B8, 3); sun.castShadow = true; sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 }); sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.04; scene.add(sun, sun.target);
const SUN = new THREE.Vector3(.4, .5, .3).normalize();
const pmrem = new THREE.PMREMGenerator(renderer);
const SKIES = { 1: ["kloofendal_48d_partly_cloudy_puresky", "Midi"], 2: ["belfast_sunset_puresky", "Fin d’après-midi"], 3: ["evening_road_01_puresky", "Crépuscule"] };
let skyEnv = null;
async function setSky(k) { say("Chargement du ciel…"); const t = await phHdri(SKIES[k][0]); t.mapping = THREE.EquirectangularReflectionMapping;
  const W = t.image.width, Hh = t.image.height, d = t.image.data, st = d.length / (W * Hh), get = i => t.type === THREE.HalfFloatType ? THREE.DataUtils.fromHalfFloat(d[i]) : d[i];
  let best = -1, bi = 0; for (let y = 0; y < Hh / 2; y += 2) for (let x = 0; x < W; x += 2) { const i = (y * W + x) * st, l = get(i) + get(i + 1) + get(i + 2); if (l > best) { best = l; bi = y * W + x; } }
  const u = (bi % W) / W, v = Math.floor(bi / W) / Hh, phi = (u - .5) * Math.PI * 2, th = v * Math.PI; SUN.set(Math.sin(th) * Math.cos(phi), Math.cos(th), -Math.sin(th) * Math.sin(phi)).normalize(); // équirectangulaire de three.js
  const sc = new THREE.Color(get(bi * st), get(bi * st + 1), get(bi * st + 2)); const m = Math.max(sc.r, sc.g, sc.b) || 1; sc.multiplyScalar(1 / m); sun.color.copy(sc).lerp(new THREE.Color(1, 1, 1), .25);
  const elev = Math.asin(SUN.y); sun.intensity = 1.2 + Math.min(1, elev / .5) * 2.6;
  // couleur de la brume : moyenne du ciel juste au-dessus de l'horizon
  const fy = Math.floor(Hh * .47), fc = new THREE.Color(0, 0, 0); let n = 0; for (let x = 0; x < W; x += 8) { const i = (fy * W + x) * st; fc.r += get(i); fc.g += get(i + 1); fc.b += get(i + 2); n++; } fc.multiplyScalar(1 / n);
  scene.fog.color.copy(fc).multiplyScalar(.85); scene.fog.density = elev < .25 ? .0125 : .0085;
  if (skyEnv) skyEnv.dispose(); skyEnv = pmrem.fromEquirectangular(t).texture; scene.environment = skyEnv; scene.environmentIntensity = .75; scene.background = t; scene.backgroundIntensity = 1;
  $("#tod").textContent = SKIES[k][1]; say(""); }

/* ---------- Terrain ---------- */
const terrain = new THREE.Mesh(new THREE.PlaneGeometry(WORLD, WORLD, 360, 360).rotateX(-Math.PI / 2));
{ const p = terrain.geometry.attributes.position, mk = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i); p.setY(i, height(x, z)); mk[i * 2] = 1 - sstep(1.4, 4.2, pathD(x, z)); mk[i * 2 + 1] = Math.max(clearing(x, z) * .8, forest(x, z)); }
  terrain.geometry.setAttribute("aMask", new THREE.BufferAttribute(mk, 2)); terrain.geometry.computeVertexNormals(); }
terrain.receiveShadow = true; scene.add(terrain);
async function buildTerrain() { say("Chargement des sols…");
  const [g, d, r, f] = await Promise.all([phTexture("aerial_grass_rock"), phTexture("brown_mud_leaves_01"), phTexture("aerial_rocks_02"), phTexture("forrest_ground_01")]);
  const mat = new THREE.MeshStandardMaterial({ map: g.map, normalMap: g.nor, roughnessMap: g.rough, roughness: 1, normalScale: new THREE.Vector2(1.2, 1.2) });
  mat.onBeforeCompile = s => { Object.assign(s.uniforms, { tD: { value: d.map }, tR: { value: r.map }, tF: { value: f.map }, tDn: { value: d.nor } });
    s.vertexShader = s.vertexShader.replace("#include <common>", "#include <common>\nattribute vec2 aMask; varying vec2 vMask; varying vec3 vWP; varying vec3 vWN;").replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvMask = aMask; vWP = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);");
    s.fragmentShader = s.fragmentShader.replace("#include <common>", `#include <common>
      uniform sampler2D tD; uniform sampler2D tR; uniform sampler2D tF; uniform sampler2D tDn; varying vec2 vMask; varying vec3 vWP; varying vec3 vWN;
      float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
      vec3 tile(sampler2D t, vec2 uv){ float n = vn(uv * .37); vec3 a = texture2D(t, uv).rgb, b = texture2D(t, uv * .41 + .3).rgb; return mix(a, b, smoothstep(.3, .7, n)); }`)
      .replace("#include <map_fragment>", `
      vec2 uv = vWP.xz * .11; float big = vn(vWP.xz * .02), slope = 1.0 - clamp(vWN.y, 0.0, 1.0);
      vec3 grass = tile(map, uv) * mix(vec3(1.0, .96, .82), vec3(.86, .98, .78), big);
      vec3 forestF = tile(tF, uv * 1.3);
      vec3 dirt = tile(tD, uv * 1.6);
      vec3 rock = tile(tR, vWP.xz * .045);
      vec3 col = mix(grass, forestF, smoothstep(.2, .8, vMask.y + (big - .5) * .3));
      col = mix(col, dirt, smoothstep(.15, .7, vMask.x + (vn(vWP.xz * .4) - .5) * .35));
      col = mix(col, rock, smoothstep(.28, .5, slope));
      diffuseColor.rgb *= col;`); };
  terrain.material = mat; }

/* ---------- Herbe : des dizaines de milliers de brins autour du joueur, qui suivent le relief et le vent ---------- */
const GR = LOWQ ? 28 : 40, GN = LOWQ ? 60000 : 140000;
const grassU = { uTime: { value: 0 }, uCam: { value: new THREE.Vector2() }, uR: { value: GR }, hMap: { value: hmTex }, hMin: { value: hMin }, hRange: { value: hMax - hMin }, hSize: { value: WORLD } };
{ const bg = new THREE.BufferGeometry(), segs = 4, pos = [], uvs = [], idx = [];
  for (let i = 0; i <= segs; i++) { const t = i / segs, w = .045 * (1 - t * .85); pos.push(-w, t, 0, w, t, 0); uvs.push(0, t, 1, t); if (i < segs) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  bg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); bg.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); bg.setIndex(idx); bg.computeVertexNormals();
  const ig = new THREE.InstancedBufferGeometry().copy(bg); ig.instanceCount = GN; const off = new Float32Array(GN * 4);
  for (let i = 0; i < GN; i++) { off[i * 4] = (Math.random() * 2 - 1) * GR; off[i * 4 + 1] = (Math.random() * 2 - 1) * GR; off[i * 4 + 2] = Math.random(); off[i * 4 + 3] = Math.random() * Math.PI * 2; }
  ig.setAttribute("aOff", new THREE.InstancedBufferAttribute(off, 4));
  const gm = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .85, side: THREE.DoubleSide });
  gm.onBeforeCompile = s => { Object.assign(s.uniforms, grassU);
    s.vertexShader = s.vertexShader.replace("#include <common>", `#include <common>
      attribute vec4 aOff; uniform float uTime; uniform vec2 uCam; uniform float uR; uniform sampler2D hMap; uniform float hMin; uniform float hRange; uniform float hSize; varying float vT; varying float vRnd; varying float vFade;
      float dec(vec4 t){ return (t.r * 255.0 * 256.0 + t.g * 255.0) / 65535.0; }
      vec2 hd(vec2 w){ vec2 p = (w / hSize + .5) * 511.0; vec2 i = floor(p), f = p - i; ivec2 a = ivec2(clamp(i, vec2(0.0), vec2(510.0)));
        vec4 t00 = texelFetch(hMap, a, 0), t10 = texelFetch(hMap, a + ivec2(1, 0), 0), t01 = texelFetch(hMap, a + ivec2(0, 1), 0), t11 = texelFetch(hMap, a + ivec2(1, 1), 0);
        float h = mix(mix(dec(t00), dec(t10), f.x), mix(dec(t01), dec(t11), f.x), f.y); float d = mix(mix(t00.b, t10.b, f.x), mix(t01.b, t11.b, f.x), f.y); return vec2(h * hRange + hMin, d); }`)
      .replace("#include <begin_vertex>", `
      vec2 wp = uCam + mod(aOff.xy - uCam + uR, 2.0 * uR) - uR; vec2 hdv = hd(wp); float dist = length(wp - uCam);
      float keep = step(aOff.z, hdv.y) * (1.0 - smoothstep(uR * .7, uR, dist)); vFade = keep; vT = position.y; vRnd = aOff.z;
      float hgt = (.45 + aOff.z * .55) * keep; float c = cos(aOff.w), s = sin(aOff.w);
      vec3 transformed = vec3(position.x * c, position.y * hgt, position.x * s);
      float wv = sin(uTime * 1.7 + wp.x * .35 + wp.y * .22) * .5 + sin(uTime * 3.1 + wp.x * .9) * .2;
      transformed.x += wv * .16 * position.y * position.y * hgt; transformed.z += wv * .07 * position.y * position.y * hgt + .08 * position.y * position.y * hgt;
      transformed += vec3(wp.x, hdv.x - .03, wp.y);`).replace("#include <beginnormal_vertex>", "vec3 objectNormal = vec3(0.0, 1.0, 0.0);");
    s.fragmentShader = s.fragmentShader.replace("#include <common>", "#include <common>\nvarying float vT; varying float vRnd; varying float vFade;").replace("#include <map_fragment>", `
      if (vFade < .01) discard; vec3 base = mix(vec3(.11, .14, .05), vec3(.20, .24, .09), vRnd), tip = mix(vec3(.56, .55, .26), vec3(.72, .63, .34), vRnd);
      diffuseColor.rgb = mix(base, tip, smoothstep(0.0, 1.0, vT)) * (.85 + vRnd * .3);`); };
  const grass = new THREE.Mesh(ig, gm); grass.frustumCulled = false; grass.receiveShadow = true; scene.add(grass); }

/* ---------- Placement ---------- */
const SOLID = [];
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function scatter(count, test, fn) { let n = 0, tries = 0; while (n < count && tries < count * 40) { tries++; const x = (rnd() - .5) * (WORLD - 40), z = (rnd() - .5) * (WORLD - 40); if (!test(x, z)) continue; fn(x, z, height(x, z)); n++; } }
const farFromSolid = (x, z, r) => !SOLID.some(s => Math.hypot(s.x - x, s.z - z) < s.r + r);
// pose les maillages d'un modèle en instances (un appel de dessin par maillage)
function instanceModel(gltf, list, shadow) { gltf.scene.updateMatrixWorld(true); const meshes = []; gltf.scene.traverse(o => { if (o.isMesh) meshes.push(o); });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  meshes.forEach(mesh => { const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, list.length);
    list.forEach((p, i) => { e.set(p.tx || 0, p.ry, p.tz || 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(p.x, p.y, p.z), q, new THREE.Vector3(p.s, p.s, p.s)); im.setMatrixAt(i, m4.multiply(mesh.matrixWorld)); });
    im.castShadow = shadow !== false; im.receiveShadow = true; scene.add(im); }); }

/* ---------- Arbres ---------- */
const TREES = [];
async function buildTrees() { say("Pousse des arbres…");
  const kinds = [["Oak Large", 101, 17], ["Oak Large", 202, 15], ["Ash Large", 7, 16], ["Pine Large", 3, 22], ["Pine Large", 44, 19], ["Aspen Large", 9, 15], ["Pine Medium", 5, 12], ["Oak Medium", 31, 11]], protos = [];
  for (const [p, s, hgt] of kinds) { const t = new Tree(); t.loadPreset(p); t.options.seed = s; t.generate(); t.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(t), k = hgt / Math.max(.1, b.max.y - b.min.y);
    t.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); protos.push({ t, k, pine: /Pine/.test(p) }); TREES.push(t); await new Promise(r => setTimeout(r, 0)); }
  scatter(LOWQ ? 160 : 300, (x, z) => forest(x, z) > .35 + rnd() * .4 && farFromSolid(x, z, 2.2) && pathD(x, z) > 6 && Math.hypot(x, z) > 24, (x, z, y) => {
    const pine = height(x, z) > H0 + 10 ? rnd() < .8 : rnd() < .3, cand = protos.filter(p => p.pine === pine), P = cand[Math.floor(rnd() * cand.length)] || protos[0];
    const c = P.t.clone(); const s = P.k * (.8 + rnd() * .45); c.scale.setScalar(s); c.position.set(x, y - .2, z); c.rotation.y = rnd() * 6.28; scene.add(c); SOLID.push({ x, z, r: .55 * s / P.k }); });
  // quelques arbres isolés dans les prairies
  scatter(28, (x, z) => forest(x, z) < .1 && pathD(x, z) > 8 && Math.hypot(x, z) > 30 && farFromSolid(x, z, 8), (x, z, y) => { const P = protos[Math.floor(rnd() * 3)], c = P.t.clone(), s = P.k * (1 + rnd() * .3); c.scale.setScalar(s); c.position.set(x, y - .2, z); c.rotation.y = rnd() * 6.28; scene.add(c); SOLID.push({ x, z, r: .7 }); }); }

/* ---------- Rochers, souches, fougères, buissons, campement ---------- */
async function buildProps() { say("Pose des rochers et des plantes…");
  const ids = ["boulder_01", "rock_moss_set_01", "rock_07", "tree_stump_01", "dead_tree_trunk", "fern_02", "shrub_02", "nettle_plant", "stone_fire_pit", "Barrel_01", "Lantern_01", "WoodenTable_01"], M = {};
  await Promise.all(ids.map(id => phModel(id).then(g => M[id] = g).catch(e => console.warn(id, e))));
  const L = {}; const add = (id, x, z, s, ry, sink) => ((L[id] = L[id] || []).push({ x, y: height(x, z) - (sink || 0), z, s, ry }));
  scatter(70, (x, z) => pathD(x, z) > 4 && Math.hypot(x, z) > 22 && farFromSolid(x, z, 3), (x, z) => { const s = .8 + rnd() * 2.2; add(rnd() < .5 ? "boulder_01" : "rock_07", x, z, s, rnd() * 6.3, s * .25); SOLID.push({ x, z, r: s * .8 }); });
  scatter(40, (x, z) => forest(x, z) > .3 && farFromSolid(x, z, 2), (x, z) => { add("rock_moss_set_01", x, z, 1 + rnd() * 1.5, rnd() * 6.3, .1); });
  scatter(30, (x, z) => forest(x, z) > .4 && farFromSolid(x, z, 2), (x, z) => { add("tree_stump_01", x, z, 1 + rnd() * .5, rnd() * 6.3, .05); SOLID.push({ x, z, r: .5 }); });
  scatter(18, (x, z) => forest(x, z) > .3 && farFromSolid(x, z, 4), (x, z) => { add("dead_tree_trunk", x, z, 1 + rnd() * .4, rnd() * 6.3, .1); });
  scatter(LOWQ ? 250 : 600, (x, z) => forest(x, z) > .25 && pathD(x, z) > 3, (x, z) => add(rnd() < .6 ? "fern_02" : "nettle_plant", x, z, .8 + rnd() * .8, rnd() * 6.3));
  scatter(LOWQ ? 120 : 260, (x, z) => pathD(x, z) > 3.5 && Math.hypot(x, z) > 20, (x, z) => add("shrub_02", x, z, .7 + rnd() * .9, rnd() * 6.3));
  // campement au centre de la clairière
  add("stone_fire_pit", 0, 0, 1, 0, .05); SOLID.push({ x: 0, z: 0, r: 1.1 });
  [[3.2, 1.6, .4], [-2.6, 2.4, 2.1], [.4, -3.1, 1.2]].forEach(([x, z, r]) => { add("tree_stump_01", x, z, .7, r, .05); SOLID.push({ x, z, r: .45 }); });
  add("dead_tree_trunk", -3.6, -1.5, .7, .8, .05);
  add("WoodenTable_01", 6.5, -4, 1, .5, 0); SOLID.push({ x: 6.5, z: -4, r: 1 }); add("Barrel_01", 8, -2.4, 1, 0, 0); add("Barrel_01", 8.6, -3.4, 1, 1, 0); SOLID.push({ x: 8.3, z: -2.9, r: .8 });
  Object.keys(L).forEach(id => { if (M[id]) instanceModel(M[id], L[id], !/fern|nettle|shrub/.test(id)); });
  if (M.Lantern_01) { const l = M.Lantern_01.scene; l.position.set(6.3, height(6.5, -4) + .78, -4.2); scene.add(l); const pl = new THREE.PointLight(0xFFB566, 4, 9, 2); pl.position.set(6.3, height(6.5, -4) + 1.05, -4.2); scene.add(pl); } }

/* ---------- Feu de camp ---------- */
const fireY = H0 + .35, fireL = new THREE.PointLight(0xFF8A3C, 30, 22, 1.8); fireL.position.set(0, fireY + .8, 0); fireL.castShadow = true; fireL.shadow.mapSize.set(512, 512); scene.add(fireL);
const flameTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(255,240,200,1)"); g.addColorStop(.3, "rgba(255,160,60,.8)"); g.addColorStop(1, "rgba(255,80,0,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const FLAMES = []; for (let i = 0; i < 26; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })); s.userData = { t: Math.random() }; scene.add(s); FLAMES.push(s); }
const smokeTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, "rgba(200,200,200,.5)"); g.addColorStop(1, "rgba(200,200,200,0)"); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const SMOKE = []; for (let i = 0; i < 30; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, depthWrite: false, transparent: true, opacity: .3, color: 0x9A9590 })); s.userData = { t: i / 30 }; scene.add(s); SMOKE.push(s); }
// poussières qui flottent dans la lumière
const DUST = new THREE.Points(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(Array.from({ length: 1500 }, () => (Math.random() - .5) * 30), 3)), new THREE.PointsMaterial({ color: 0xFFE6B0, size: .035, transparent: true, opacity: .55, depthWrite: false, blending: THREE.AdditiveBlending }));
scene.add(DUST);

/* ---------- Personnage ---------- */
const P = { x: 4, z: 9, y: H0, ry: Math.PI, model: null, mixer: null, act: {}, cur: "" };
async function buildHero() { say("Arrivée du cavalier…"); const g = await new Promise((ok, ko) => new GLTFLoader().load("/hameau/extra/knight.glb", ok, undefined, ko)); const m = g.scene;
  m.updateMatrixWorld(true); let top = -1e9, bot = 1e9; const v = new THREE.Vector3(); m.traverse(o => { if (o.isBone) { const y = o.getWorldPosition(v).y; top = Math.max(top, y); bot = Math.min(bot, y); } });
  const hh = top > bot ? (top - bot) * 1.06 : new THREE.Box3().setFromObject(m).getSize(v).y; const w = new THREE.Group(); m.scale.multiplyScalar(1.82 / hh); m.position.y -= bot * 1.82 / hh; w.add(m);
  m.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } }); scene.add(w); P.model = w;
  P.mixer = new THREE.AnimationMixer(m); g.animations.forEach(c => P.act[c.name] = P.mixer.clipAction(c)); play("Idle"); }
function play(n) { if (P.cur === n || !P.act[n]) return; const a = P.act[n], b = P.act[P.cur]; a.reset().play(); if (b) a.crossFadeFrom(b, .25, false); P.cur = n; }

/* ---------- Image : profondeur de champ, rayons du soleil, occlusion, éclat, étalonnage ---------- */
const crt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType }); crt.depthTexture = new THREE.DepthTexture(innerWidth, innerHeight);
const composer = new EffectComposer(renderer, crt); composer.renderTarget2.depthTexture = new THREE.DepthTexture(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
class CinePass extends ShaderPass { render(r, w, rd, dt, m) { this.uniforms.tDepth.value = rd.depthTexture; super.render(r, w, rd, dt, m); } }
const cine = new CinePass({ uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, cn: { value: .1 }, cf: { value: 1200 }, focus: { value: 4 }, sunUV: { value: new THREE.Vector2() }, sunOn: { value: 0 }, sunCol: { value: new THREE.Color() }, res: { value: new THREE.Vector2(innerWidth, innerHeight) } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform sampler2D tDepth; uniform float cn; uniform float cf; uniform float focus; uniform vec2 sunUV; uniform float sunOn; uniform vec3 sunCol; uniform vec2 res; varying vec2 vUv;
    float lin(float d){ float z = d * 2.0 - 1.0; return 2.0 * cn * cf / (cf + cn - z * (cf - cn)); }
    void main(){ vec4 c = texture2D(tDiffuse, vUv); float dr = texture2D(tDepth, vUv).x, z = dr > .99999 ? 3000.0 : lin(dr);
      float coc = max(smoothstep(focus * 3.0, focus * 18.0, z) * .85, smoothstep(focus * .5, focus * .2, z));
      if (coc > .02) { vec3 acc = c.rgb; float wt = 1.0; for (int i = 0; i < 16; i++) { float a = float(i) * 2.39996, rr = sqrt(float(i) + .5) / 4.0; acc += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * rr * coc * 5.0 / res).rgb; wt += 1.0; } c.rgb = acc / wt; }
      if (sunOn > 0.0) { vec2 st = (sunUV - vUv) / 48.0, uv = vUv; float il = 1.0, s = 0.0; for (int i = 0; i < 48; i++) { uv += st; if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) break; float sky = step(.99999, texture2D(tDepth, uv).x); float b = max(0.0, dot(texture2D(tDiffuse, uv).rgb, vec3(.3, .59, .11)) - .8); s += sky * b * il; il *= .97; }
        float fall = 1.0 - smoothstep(0.0, 1.3, length((vUv - sunUV) * vec2(res.x / res.y, 1.0))); c.rgb += sunCol * (s / 48.0) * 1.1 * sunOn * fall; }
      gl_FragColor = c; }` });
composer.addPass(cine);
let gtao = null; if (!LOWQ) try { gtao = new GTAOPass(scene, camera, innerWidth, innerHeight); gtao.updateGtaoMaterial({ radius: 1.4, distanceExponent: 1.5, thickness: 2, scale: 1.3, samples: 16 }); gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 }); gtao.blendIntensity = .9; composer.addPass(gtao); } catch (e) { console.warn("occlusion", e); }
composer.addPass(new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .18, .6, .9));
composer.addPass(new OutputPass());
// étalonnage façon western : noirs légèrement relevés et chauds, lumières dorées, couleurs un peu éteintes, grain et vignette
const grade = new ShaderPass({ uniforms: { tDiffuse: { value: null }, time: { value: 0 } }, vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform float time; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = dot(c, vec3(.299, .587, .114));
      c = mix(vec3(l), c, .88); c = c * c * (3.0 - 2.0 * c) * .35 + c * .65; c = mix(c, c * vec3(1.06, 1.0, .88), smoothstep(.45, 1.0, l)); c = mix(vec3(.035, .03, .022) + c * .96, c, smoothstep(0.0, .25, l));
      vec2 q = vUv - .5; c *= 1.0 - dot(q, q) * .75; c += (fract(sin(dot(vUv * 1.7 + fract(time * 1.3), vec2(12.9898, 78.233))) * 43758.5453) - .5) * .028; gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }` });
composer.addPass(grade);

/* ---------- Commandes : ZQSD ou flèches, Maj pour courir, souris pour regarder ---------- */
const K = {}; addEventListener("keydown", e => { K[e.code] = true; if (SKIES[e.key]) setSky(e.key); }); addEventListener("keyup", e => K[e.code] = false);
const CAM = { yaw: Math.PI, pitch: .12, dist: 3.4 };
canvas.addEventListener("click", () => canvas.requestPointerLock && canvas.requestPointerLock());
addEventListener("mousemove", e => { if (document.pointerLockElement !== canvas) return; CAM.yaw -= e.movementX * .0025; CAM.pitch = Math.max(-.35, Math.min(.9, CAM.pitch + e.movementY * .0022)); });
addEventListener("wheel", e => { CAM.dist = Math.max(1.8, Math.min(9, CAM.dist + e.deltaY * .004)); });
addEventListener("resize", () => { renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); if (gtao) gtao.setSize(innerWidth, innerHeight); });

/* ---------- Boucle ---------- */
const clock = new THREE.Clock(), tmp = new THREE.Vector3(), tgt = new THREE.Vector3();
function step() { requestAnimationFrame(step); const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
  if (P.model) { const f = (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0), s = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0), mv = f || s, run = K.ShiftLeft || K.ShiftRight;
    if (mv) { const a = Math.atan2(s, f), dir = CAM.yaw - a, sp = run ? 5.2 : 1.6;
      const hx = Math.sin(dir) * sp * dt, hz = Math.cos(dir) * sp * dt; let X = P.x + hx, Z = P.z + hz;
      SOLID.forEach(o => { const dx = X - o.x, dz = Z - o.z, d = Math.hypot(dx, dz), r = o.r + .35; if (d < r && d > 0) { X = o.x + dx / d * r; Z = o.z + dz / d * r; } });
      if (Math.abs(X) < WORLD / 2 - 25 && Math.abs(Z) < WORLD / 2 - 25) { P.x = X; P.z = Z; } let dr = dir - P.ry; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); P.ry += dr * Math.min(1, dt * 8); play(run ? "Run" : "Walk"); }
    else play("Idle");
    P.y += (height(P.x, P.z) - P.y) * Math.min(1, dt * 15); P.model.position.set(P.x, P.y, P.z); P.model.rotation.y = P.ry; P.mixer.update(dt); }
  // caméra par-dessus l'épaule
  const head = tgt.set(P.x, P.y + 1.62, P.z), cp = Math.cos(CAM.pitch); tmp.set(Math.sin(CAM.yaw) * cp, Math.sin(CAM.pitch), Math.cos(CAM.yaw) * cp).multiplyScalar(-CAM.dist);
  const right = new THREE.Vector3(Math.cos(CAM.yaw), 0, -Math.sin(CAM.yaw)).multiplyScalar(-.55); camera.position.copy(head).add(tmp).add(right); const gy = height(camera.position.x, camera.position.z) + .4; if (camera.position.y < gy) camera.position.y = gy;
  camera.lookAt(head.x + right.x * .8, head.y, head.z + right.z * .8);
  // soleil et ombres qui suivent le joueur
  sun.position.copy(SUN).multiplyScalar(150).add(tgt.set(P.x, P.y, P.z)); sun.target.position.set(P.x, P.y, P.z);
  grassU.uTime.value = t; grassU.uCam.value.set(P.x, P.z); TREES.forEach(tr => tr.update(t));
  // feu
  const fl = .8 + Math.sin(t * 13) * .1 + Math.sin(t * 7.7) * .08 + Math.random() * .06; fireL.intensity = 26 * fl;
  FLAMES.forEach((s, i) => { const u = s.userData; u.t += dt * (1.3 + (i % 5) * .2); if (u.t > 1) u.t -= 1; const a = i * 2.4; s.position.set(Math.cos(a) * .25 * (1 - u.t), fireY + u.t * 1.1, Math.sin(a) * .25 * (1 - u.t)); s.scale.setScalar(.65 * (1 - u.t * .7)); s.material.opacity = (1 - u.t) * .9; });
  SMOKE.forEach((s, i) => { const u = s.userData; u.t += dt * .07; if (u.t > 1) u.t -= 1; s.position.set(Math.sin(u.t * 6 + i) * .4 + u.t * 2, fireY + 1.2 + u.t * 9, Math.cos(u.t * 5 + i) * .4); s.scale.setScalar(.8 + u.t * 4); s.material.opacity = .22 * (1 - u.t) * Math.min(1, u.t * 6); });
  DUST.position.set(Math.round(P.x / 30) * 30, P.y, Math.round(P.z / 30) * 30); DUST.rotation.y = t * .01;
  // réglages d'image
  cine.uniforms.focus.value = camera.position.distanceTo(tgt.set(P.x, P.y + 1.4, P.z)); cine.uniforms.res.value.set(innerWidth, innerHeight);
  const sp = tmp.copy(SUN).multiplyScalar(500).add(camera.position), inF = camera.getWorldDirection(new THREE.Vector3()).dot(SUN) > 0; sp.project(camera);
  cine.uniforms.sunUV.value.set(sp.x * .5 + .5, sp.y * .5 + .5); cine.uniforms.sunOn.value = inF ? 1 : 0; cine.uniforms.sunCol.value.copy(sun.color).multiplyScalar(.9);
  grade.uniforms.time.value = t;
  composer.render(); }

/* ---------- Démarrage ---------- */
(async () => {
  try { await setSky(2); await buildTerrain(); await buildHero(); await buildProps(); await buildTrees(); }
  catch (e) { say("Le chargement a échoué : " + (e.message || e)); console.error(e); return; }
  $("#ld").classList.add("off"); setTimeout(() => $("#ld").remove(), 1200); step();
})();
