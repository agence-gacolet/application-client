// Miniatures légères des visuels et images d'aperçu des vidéos (Matis, 17/11/2026).
// GET /api/thumb?u=<adresse Metricool>&w=480 : image WebP réduite, gardée sur le disque et en cache dans le téléphone.
// Images : sharp. Vidéos : une image prise à 1 s par ffmpeg (ffmpeg-static). Si l'un des deux manque sur le serveur,
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
  try { ffmpeg = require("ffmpeg-static"); if (ffmpeg && !fs.existsSync(ffmpeg)) ffmpeg = null; } catch (e) { ffmpeg = null; }
  if (!ffmpeg) console.log("Miniatures : ffmpeg absent, pas d'image d'aperçu pour les vidéos.");

  const OK_URL = u => /^https:\/\/static\.metricool\.com\/[^\s"<>]+$/.test(u);
  const isVideo = u => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u);
  const WIDTHS = [240, 480, 720, 1080, 1440];
  const fileOf = (u, w) => path.join(DIR, crypto.createHash("sha1").update(u).digest("hex") + "-" + w + ".webp");

  // File d'attente : 2 préparations à la fois au maximum, et une seule par fichier
  const pending = new Map(); let running = 0; const queue = [];
  const next = () => { while (running < 2 && queue.length){ const job = queue.shift(); running++; job().finally(() => { running--; next(); }); } };
  const enqueue = fn => new Promise((res, rej) => { queue.push(() => fn().then(res, rej)); next(); });

  function frameOf(u){
    return new Promise((res, rej) => {
      const p = spawn(ffmpeg, ["-v", "error", "-ss", "1", "-i", u, "-frames:v", "1", "-f", "image2pipe", "-vcodec", "png", "pipe:1"]);
      const out = []; p.stdout.on("data", d => out.push(d));
      const t = setTimeout(() => p.kill("SIGKILL"), 25000);
      p.on("close", code => { clearTimeout(t); const b = Buffer.concat(out); b.length ? res(b) : rej(new Error("ffmpeg " + code)); });
      p.on("error", e => { clearTimeout(t); rej(e); });
    });
  }
  async function build(u, w){
    const f = fileOf(u, w); if (fs.existsSync(f)) return f;
    const key = f; if (pending.has(key)) return pending.get(key);
    const job = enqueue(async () => {
      let src;
      if (isVideo(u)){ if (!ffmpeg) throw new Error("ffmpeg absent"); src = await frameOf(u); }
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
    catch (e) { console.error("Miniature :", e.message); fallback(); }
  });

  // Préparation en arrière-plan dès que les publications sont lues (le client trouve les miniatures prêtes)
  app.locals.warmThumbs = posts => { if (!sharp) return;
    (posts || []).forEach(p => (p.media || []).forEach((m, i) => { if (!OK_URL(m.url)) return; if (m.video && !ffmpeg) return;
      build(m.url, 480).catch(() => {}); if (m.video) build(m.url, 1080).catch(() => {}); else if (i === 0) build(m.url, 1440).catch(() => {}); })); };
};
