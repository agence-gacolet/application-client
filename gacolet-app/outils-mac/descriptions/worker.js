// Descriptions du Dépôt, écrites sur le Mac mini de l'agence, en continu.
// Toutes les 15 secondes : lit la file du serveur, prend une demande (les autres Mac ne la voient plus),
// transcrit la vidéo sur place (mlx-whisper), fait écrire trois descriptions par Claude Code (abonnement, rien de plus à payer),
// puis renvoie le tout au serveur. Lancé par launchd (fr.gacolet.descriptions), relancé tout seul s'il s'arrête.
// Clé : trousseau macOS, service « gacolet-desc » (la même que dans l'appli, Paramètres > Liaisons > Clé du Mac mini).
const { execFile } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");

const BASE = process.env.GACOLET_URL || "https://14rw5njp1ep.preview.hosting-ik.com";
const HERE = __dirname, EVERY = 15000;
const log = (...a) => console.log(new Date().toISOString().slice(0, 19).replace("T", " "), ...a);
const run = (cmd, args, opt = {}) => new Promise((ok, ko) => execFile(cmd, args, Object.assign({ maxBuffer: 64 * 1024 * 1024 }, opt), (e, out, err) => e ? ko(Object.assign(e, { out, err })) : ok(out)));

let KEY = "";
async function key() { if (!KEY) KEY = (await run("security", ["find-generic-password", "-s", "gacolet-desc", "-w"])).trim(); return KEY; }
async function api(method, p, body) {
  const r = await fetch(BASE + p, { method, headers: { "x-desc-key": await key(), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (e) {}
  if (!r.ok) throw new Error(method + " " + p + " : " + r.status + " " + (j.error || t.slice(0, 120)));
  return j;
}

async function download(url, dest) {
  const r = await fetch(url); if (!r.ok) throw new Error("Fichier introuvable (" + r.status + ").");
  const w = fs.createWriteStream(dest); const rd = r.body.getReader();
  for (;;) { const { done, value } = await rd.read(); if (done) break; if (!w.write(Buffer.from(value))) await new Promise(ok => w.once("drain", ok)); }
  await new Promise(ok => w.end(ok));
}

async function transcribe(video, dir) {
  const wav = path.join(dir, "son.wav");
  await run("ffmpeg", ["-loglevel", "error", "-y", "-i", video, "-vn", "-ar", "16000", "-ac", "1", wav], { timeout: 180000 });
  return (await run("python3", [path.join(HERE, "transcrire.py"), wav], { timeout: 600000 })).trim();
}

function prompt(it, rules, transcript, image) {
  return [
    "Tu écris les descriptions des publications Instagram et Facebook de l'Agence Gacolet pour ses clients (entreprises locales du Gard).",
    rules,
    "",
    "Client : " + it.client,
    "Formule : " + (it.fiche.formula || ""), "Réseaux : " + (it.fiche.networks || ""), "À retenir : " + (it.fiche.remember || ""),
    "", "Stratégie (extrait) :", it.strategie || "pas de fiche stratégie", "",
    "Production à publier : " + it.kind + ".",
    it.subject ? "De quoi elle parle, d'après l'équipe : " + it.subject : "",
    transcript ? "Ce qui est dit dans la vidéo (transcription automatique, peut contenir des erreurs de noms) :\n" + transcript : "La vidéo n'a pas de paroles (ou ce n'est pas une vidéo).",
    image ? "Regarde aussi l'image " + image + " (lis-la avec l'outil Read) pour voir ce qui est montré." : "",
    "",
    "Réponds uniquement par un objet JSON, sans texte autour : {\"propositions\": [\"…\", \"…\", \"…\"]} avec trois descriptions complètes aux angles différents.",
  ].filter(x => x !== "").join("\n");
}

async function claude(text, dir) {
  const out = await run("claude", ["-p", text, "--output-format", "json", "--allowedTools", "Read"], { cwd: dir, timeout: 300000 });
  const res = String((JSON.parse(out) || {}).result || "");
  const m = res.match(/\{[\s\S]*"propositions"[\s\S]*\}/); if (!m) throw new Error("Réponse de Claude illisible.");
  const props = (JSON.parse(m[0]).propositions || []).map(x => String(x).trim()).filter(Boolean).slice(0, 3);
  if (!props.length) throw new Error("Claude n'a rien proposé.");
  return props;
}

async function handle(it, rules) {
  const t0 = Date.now(), dir = fs.mkdtempSync(path.join(os.tmpdir(), "gacolet-desc-"));
  try {
    await api("POST", "/api/g-prod/queue/" + it.id + "/claim");
    log("prise", it.id, it.client, it.file);
    let transcript = "", image = "";
    if (it.media) {
      const ext = (it.media.match(/\.[a-z0-9]{1,7}$/i) || [".bin"])[0].toLowerCase(), f = path.join(dir, "media" + ext);
      await download(it.media, f);
      if (/vid/.test(it.kind)) {
        transcript = await transcribe(f, dir).catch(e => { log("transcription impossible", e.message); return ""; });
        image = "image.jpg"; await run("ffmpeg", ["-loglevel", "error", "-y", "-ss", "1", "-i", f, "-frames:v", "1", "-vf", "scale=720:-2", path.join(dir, image)], { timeout: 60000 }).catch(() => { image = ""; });
      } else { image = "image.jpg"; await run("ffmpeg", ["-loglevel", "error", "-y", "-i", f, "-vf", "scale='min(1280,iw)':-2", path.join(dir, image)], { timeout: 60000 }).catch(() => { image = path.basename(f); }); }
    }
    const props = await claude(prompt(it, rules, transcript, image), dir);
    await api("POST", "/api/g-prod/queue/" + it.id, { propositions: props, transcript });
    log("faite", it.id, Math.round((Date.now() - t0) / 1000) + " s");
  } catch (e) {
    if (/Déjà prise|409/.test(e.message)) return;
    log("échec", it.id, e.message, e.err ? String(e.err).slice(0, 300) : "");
    await api("POST", "/api/g-prod/queue/" + it.id, { error: "Le Mac n'a pas pu écrire les descriptions : " + e.message.slice(0, 200) }).catch(() => {});
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

async function tick() {
  try { const q = await api("GET", "/api/g-prod/queue"); for (const it of q.items || []) await handle(it, q.rules || ""); }
  catch (e) { log("file illisible :", e.message); }
  setTimeout(tick, EVERY);
}
log("démarrage, serveur", BASE); tick();
