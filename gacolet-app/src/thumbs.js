// Miniatures légères des visuels et images d'aperçu des vidéos (Matis, 17/11/2026).
// GET /api/thumb?u=<adresse Metricool>&w=480 : image WebP réduite, gardée sur le disque et en cache dans le téléphone.
// Images : sharp. Vidéos : une image prise à 1 s par ffmpeg (@ffmpeg-installer). Si l'un des deux manque sur le serveur,
// on redirige vers le fichier d'origine : l'appli marche comme avant, juste moins vite.
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { spawn } = require("child_process");

module.exports = function (app, { root }) {
  const DIR = path.join(root, "cache", "thumbs");
  fs.mkdirSync(DIR, { recursive: true });
  let sharp = null, ffmpeg = null;
  try { sharp = require("sharp"); } catch (e) { console.log("Miniatures : sharp absent, fichiers d'origine servis."); }
  /* @ffmpeg-installer : le programme arrive tout fait selon le système, sans script d'installation (npm bloque ces scripts sur le serveur) */
  for (const get of [() => require("@ffmpeg-installer/ffmpeg").path, () => require("ffmpeg-static")]) { try { const f = get(); if (f && fs.existsSync(f)) { ffmpeg = f; break; } } catch (e) {} }
  if (!ffmpeg) console.log("Miniatures : ffmpeg absent, pas d'image d'aperçu pour les vidéos.");

  // Fichiers de Metricool, ou fichiers déposés sur ce serveur (/f/…), lus alors sur le disque
  const LOCAL = /^\/f\/([a-f0-9]{32}(?:\.[a-z0-9]{1,7})?)$/, UPL = path.join(root, "uploads", "gestion");
  const OK_URL = u => /^https:\/\/static\.metricool\.com\/[^\s"<>]+$/.test(u) || LOCAL.test(u);
  const localFile = u => { const m = String(u).match(LOCAL); return m ? path.join(UPL, m[1]) : ""; };
  const isVideo = u => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u);
  const WIDTHS = [240, 480, 720, 1080, 1440];
  const fileOf = (u, w) => path.join(DIR, crypto.createHash("sha1").update(u).digest("hex") + "-" + w + ".webp");

  // File d'attente : 2 préparations à la fois au maximum, et une seule par fichier
  const pending = new Map(); let running = 0; const queue = [];
  const next = () => { while (running < 2 && queue.length){ const job = queue.shift(); running++; job().finally(() => { running--; next(); }); } };
  const enqueue = fn => new Promise((res, rej) => { queue.push(() => fn().then(res, rej)); next(); });

  /* ffmpeg (version autonome) plante s'il va lui-même sur internet : on télécharge d'abord le début de la vidéo, puis ffmpeg lit le fichier local */
  function runFrame(file, at){
    return new Promise((res, rej) => {
      const p = spawn(ffmpeg, ["-v", "error", "-ss", String(at), "-i", file, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"]);
      const out = [], err = []; p.stdout.on("data", d => out.push(d)); p.stderr.on("data", d => err.push(d));
      const t = setTimeout(() => p.kill("SIGKILL"), 25000);
      p.on("close", (code, sig) => { clearTimeout(t); const b = Buffer.concat(out); b.length ? res(b) : rej(new Error("ffmpeg " + (sig || code) + " " + Buffer.concat(err).toString().slice(0, 120))); });
      p.on("error", e => { clearTimeout(t); rej(e); });
    });
  }
  async function download(u, file, range){
    const r = await fetch(u, range ? { headers: { Range: "bytes=0-" + range } } : {}); if (!r.ok) throw new Error("téléchargement " + r.status);
    fs.writeFileSync(file, Buffer.from(await r.arrayBuffer()));
  }
  async function frameOf(u){
    const tmp = path.join(DIR, crypto.randomBytes(6).toString("hex") + path.extname(u.split("?")[0]).slice(0, 6));
    try {
      try { await download(u, tmp, 8 * 1024 * 1024 - 1); return await runFrame(tmp, 1); } // le début suffit le plus souvent
      catch (e) { await download(u, tmp); try { return await runFrame(tmp, 1); } catch (e2) { return await runFrame(tmp, 0); } } // sinon le fichier entier
    } finally { try { fs.unlinkSync(tmp); } catch (e) {} }
  }
  async function build(u, w){
    const f = fileOf(u, w); if (fs.existsSync(f)) return f;
    const key = f; if (pending.has(key)) return pending.get(key);
    const job = enqueue(async () => {
      let src;
      const lf = localFile(u);
      if (lf){ if (!fs.existsSync(lf)) throw new Error("fichier absent"); if (isVideo(u)){ if (!ffmpeg) throw new Error("ffmpeg absent"); src = await runFrame(lf, 1).catch(() => runFrame(lf, 0)); } else src = fs.readFileSync(lf); }
      else if (isVideo(u)){ if (!ffmpeg) throw new Error("ffmpeg absent"); src = await frameOf(u); }
      else { const r = await fetch(u); if (!r.ok) throw new Error("téléchargement " + r.status); src = Buffer.from(await r.arrayBuffer()); }
      const out = await sharp(src).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 74 }).toBuffer();
      const tmp = f + ".tmp"; fs.writeFileSync(tmp, out); fs.renameSync(tmp, f); return f;
    }).finally(() => pending.delete(key));
    pending.set(key, job); return job;
  }

  app.get("/api/thumb", async (req, res) => {
    const u = String(req.query.u || ""), w = WIDTHS.find(x => x >= (Number(req.query.w) || 480)) || 1440;
    if (!OK_URL(u)) return res.status(400).end();
    const fallback = () => isVideo(u) ? res.status(404).end() : res.redirect(302, u);
    if (!sharp) return fallback();
    try { const f = await build(u, w); res.setHeader("Cache-Control", "public, max-age=31536000, immutable"); res.type("image/webp"); fs.createReadStream(f).pipe(res); }
    catch (e) { console.error("Miniature :", e.message); res.setHeader("X-Thumb-Error", String(e.message || e).replace(/[^\x20-\x7e]/g, "?").slice(0, 200)); fallback(); }
  });
  // État des outils (diagnostic, sans donnée sensible)
  app.get("/api/thumb-etat", (req, res) => {
    let info = { sharp: !!sharp, ffmpeg: ffmpeg || null, existe: !!(ffmpeg && fs.existsSync(ffmpeg)) };
    if (!ffmpeg){ try { info.installer = require.resolve("@ffmpeg-installer/ffmpeg"); } catch (e) { info.installer = "absent : " + e.message.slice(0, 120); }
      try { const dir = path.dirname(require.resolve("@ffmpeg-installer/ffmpeg/package.json")); info.paquets = fs.readdirSync(path.dirname(dir)); } catch (e) {} info.plateforme = process.platform + "-" + process.arch; return res.json(info); }
    const p = spawn(ffmpeg, ["-version"]); let out = ""; p.stdout.on("data", d => out += d); p.stderr.on("data", d => out += d);
    p.on("close", code => res.json(Object.assign(info, { code, sortie: out.slice(0, 160) }))); p.on("error", e => res.json(Object.assign(info, { erreur: e.message })));
  });

  // Préparation en arrière-plan dès que les publications sont lues (le client trouve les miniatures prêtes)
  app.locals.warmThumbs = posts => { if (!sharp) return;
    (posts || []).forEach(p => (p.media || []).forEach((m, i) => { if (!OK_URL(m.url)) return; if (m.video && !ffmpeg) return;
      build(m.url, 480).catch(() => {}); if (m.video) build(m.url, 1080).catch(() => {}); else if (i === 0) build(m.url, 1440).catch(() => {}); })); };
};
