// Application client Agence Gacolet : serveur.
// Sert l'application installable (public/), l'API des clients (/api) et l'espace agence (/agence, /api/admin).
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const multer = require("multer");
const db = require("./src/db");
const { fetchScheduled } = require("./src/metricool");

const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "200kb" }));

const UPLOADS = path.join(__dirname, "uploads");
fs.mkdirSync(UPLOADS, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, f, cb) => cb(null, Date.now() + "-" + crypto.randomBytes(4).toString("hex") + path.extname(f.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "")),
  }),
  limits: { fileSize: 200 * 1024 * 1024, files: 10 },
  fileFilter: (req, f, cb) => cb(null, /^(image|video)\//.test(f.mimetype)),
});

const now = () => new Date().toISOString();
const clean = (v, max = 500) => String(v == null ? "" : v).trim().slice(0, max);
const wrap = fn => (req, res) => fn(req, res).catch(e => { console.error(e); res.status(500).json({ error: "Erreur du serveur. Réessayez dans un instant." }); });
const mods = c => String(c.modules || "com").split(",").filter(Boolean);

// ---------- Codes clients ----------
const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sans 0, O, 1, I
const rnd = n => Array.from(crypto.randomBytes(n), b => ALPHA[b % ALPHA.length]).join("");
const SUFFIX = { com: "RS", meta: "MT", "com,meta": "RM" };
const normCode = s => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^GAC(\w{4})(\w{2})$/, "GAC-$1-$2");

// ---------- Session client ----------
const auth = (req, res, next) => (async () => {
  const t = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const u = t && await db.one("SELECT * FROM users WHERE token = ?", [t]);
  if (!u) return res.status(401).json({ error: "Session expirée. Saisissez à nouveau votre code." });
  const c = await db.one("SELECT * FROM clients WHERE id = ? AND active = 1", [u.client_id]);
  if (!c) return res.status(401).json({ error: "Compte désactivé. Contactez l'agence." });
  req.user = u; req.client = c; next();
})().catch(e => { console.error(e); res.status(500).json({ error: "Erreur du serveur." }); });
const mw = fn => fn;

function publicClient(c) {
  return { name: c.name, formula: c.formula, modules: mods(c), contactsGoal: c.contacts_goal, qualifiedDefinition: c.qualified_definition || "", driveUrl: c.drive_url };
}

// Vérifier un code avant l'inscription
app.post("/api/code", wrap(async (req, res) => {
  const code = normCode(req.body.code);
  if (!/^GAC-\w{4}-\w{2}$/.test(code)) return res.status(400).json({ error: "Le code a la forme GAC-XXXX-XX. Vérifiez le courriel de l'agence." });
  const c = await db.one("SELECT * FROM clients WHERE code = ? AND active = 1", [code]);
  if (!c) return res.status(404).json({ error: "Ce code n'est pas reconnu. Vérifiez-le ou écrivez à l'agence." });
  res.json({ code, client: publicClient(c) });
}));

// Inscription : identité et questionnaire
app.post("/api/register", wrap(async (req, res) => {
  const b = req.body || {};
  const c = await db.one("SELECT * FROM clients WHERE code = ? AND active = 1", [normCode(b.code)]);
  if (!c) return res.status(404).json({ error: "Code non reconnu." });
  if (!clean(b.prenom) || !clean(b.nom) || !clean(b.entreprise) || !/^\S+@\S+\.\S+$/.test(clean(b.email))) return res.status(400).json({ error: "Prénom, nom, entreprise et courriel sont obligatoires." });
  const token = crypto.randomBytes(24).toString("hex");
  await db.run(`INSERT INTO users (client_id, prenom, nom, entreprise, email, tel, activite, zone, reseaux, objectif, clientele, dispo, token, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [c.id, clean(b.prenom, 80), clean(b.nom, 80), clean(b.entreprise, 120), clean(b.email, 160), clean(b.tel, 40),
    clean(b.activite, 1000), clean(b.zone, 500), (Array.isArray(b.reseaux) ? b.reseaux : []).map(x => clean(x, 30)).join(", "), clean(b.objectif, 120),
    clean(b.clientele, 1000), clean(b.dispo, 1000), token, now()]);
  res.json({ token });
}));

// Tout ce que l'application affiche, en un appel
app.get("/api/me", mw(auth), wrap(async (req, res) => {
  const c = req.client, u = req.user, m = mods(c);
  const today = now().slice(0, 10), month = today.slice(0, 7);

  let posts = [], postsError = null;
  if (m.includes("com") && c.metricool_blog_id) {
    try { posts = await fetchScheduled(c.metricool_blog_id); }
    catch (e) { console.error(e); postsError = "Le planning est momentanément indisponible."; }
  }
  const decs = await db.all("SELECT d.*, u.prenom, u.nom FROM decisions d JOIN users u ON u.id = d.user_id WHERE d.client_id = ? ORDER BY d.id", [c.id]);
  const last = {}; decs.forEach(d => { last[d.post_id] = d; });
  posts = posts.map(p => {
    const d = last[p.id];
    return { ...p, status: d ? d.status : p.published ? "ok" : "wait", note: d ? d.note || "" : "", decidedBy: d ? d.prenom + " " + d.nom : "", decidedAt: d ? d.created_at : "" };
  });

  const leads = m.includes("meta") ? await db.all("SELECT * FROM leads WHERE client_id = ? ORDER BY date DESC, id DESC LIMIT 100", [c.id]) : [];
  const stats = await db.all("SELECT * FROM stats WHERE client_id = ? ORDER BY period", [c.id]);
  res.json({
    me: { prenom: u.prenom, nom: u.nom, entreprise: u.entreprise },
    client: publicClient(c),
    today,
    posts, postsError,
    events: await db.all("SELECT * FROM events WHERE client_id = ? AND date >= ? ORDER BY date", [c.id, today]),
    deliverables: await db.all("SELECT * FROM deliverables WHERE client_id = ? ORDER BY date DESC LIMIT 30", [c.id]),
    requests: await db.all("SELECT id, type, message, files, status, created_at FROM requests WHERE client_id = ? ORDER BY id DESC LIMIT 30", [c.id]),
    leads: leads.map(l => ({ id: l.id, date: l.date, title: l.title, detail: l.detail, qualified: l.qualified })),
    month,
    stats: stats.map(s => ({ period: s.period, module: s.module, data: JSON.parse(s.data || "{}"), source: s.source })),
  });
}));

// Valider ou demander une modification
app.post("/api/decision", mw(auth), wrap(async (req, res) => {
  const { postId, status, note, title, date } = req.body || {};
  if (!/^mc\d+$/.test(String(postId)) || !["ok", "mod"].includes(status)) return res.status(400).json({ error: "Demande invalide." });
  if (status === "mod" && !clean(note)) return res.status(400).json({ error: "Écrivez ce qu'il faut changer." });
  await db.run("INSERT INTO decisions (client_id, post_id, post_title, post_date, status, note, user_id, created_at) VALUES (?,?,?,?,?,?,?,?)",
    [req.client.id, postId, clean(title, 200), clean(date, 30), status, clean(note, 2000), req.user.id, now()]);
  res.json({ ok: true });
}));

// Qualifier un contact Meta
app.post("/api/lead/:id", mw(auth), wrap(async (req, res) => {
  const q = req.body.qualified === true ? 1 : req.body.qualified === false ? 0 : null;
  const r = await db.run("UPDATE leads SET qualified = ?, qualified_by = ?, qualified_at = ? WHERE id = ? AND client_id = ?", [q, req.user.id, now(), Number(req.params.id), req.client.id]);
  if (!r.changes) return res.status(404).json({ error: "Contact introuvable." });
  res.json({ ok: true });
}));

// Envoyer une demande (avec photos ou vidéos)
app.post("/api/request", mw(auth), upload.array("files", 10), wrap(async (req, res) => {
  const msg = clean(req.body.message, 4000);
  if (!msg) return res.status(400).json({ error: "Écrivez votre demande avant d'envoyer." });
  const files = (req.files || []).map(f => f.filename).join(",");
  await db.run("INSERT INTO requests (client_id, user_id, type, message, files, status, created_at) VALUES (?,?,?,?,?,?,?)",
    [req.client.id, req.user.id, clean(req.body.type, 60) || "Autre demande", msg, files, "Envoyée", now()]);
  res.json({ ok: true });
}));

// ---------- Espace agence ----------
const adminKey = () => crypto.createHmac("sha256", process.env.APP_SECRET || "dev-secret").update(process.env.ADMIN_PASSWORD || "").digest("hex");
const admin = (req, res, next) => {
  if (!process.env.ADMIN_PASSWORD) return res.status(503).json({ error: "ADMIN_PASSWORD n'est pas défini sur le serveur." });
  const k = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!k || k.length !== adminKey().length || !crypto.timingSafeEqual(Buffer.from(k), Buffer.from(adminKey()))) return res.status(401).json({ error: "Connexion requise." });
  next();
};
app.post("/api/admin/login", (req, res) => {
  if (!process.env.ADMIN_PASSWORD || String(req.body.password || "") !== process.env.ADMIN_PASSWORD) return res.status(401).json({ error: "Mot de passe incorrect." });
  res.json({ key: adminKey() });
});

app.get("/api/admin/overview", admin, wrap(async (req, res) => {
  const clients = await db.all("SELECT * FROM clients ORDER BY name");
  res.json({
    clients: clients.map(c => ({ ...c, modules: mods(c) })),
    users: await db.all("SELECT id, client_id, prenom, nom, entreprise, email, tel, activite, zone, reseaux, objectif, clientele, dispo, created_at FROM users ORDER BY id DESC"),
    decisions: await db.all("SELECT d.*, u.prenom, u.nom FROM decisions d JOIN users u ON u.id = d.user_id ORDER BY d.id DESC LIMIT 200"),
    requests: await db.all("SELECT r.*, u.prenom, u.nom FROM requests r JOIN users u ON u.id = r.user_id ORDER BY r.id DESC LIMIT 200"),
    leads: await db.all("SELECT * FROM leads ORDER BY date DESC, id DESC LIMIT 300"),
    events: await db.all("SELECT * FROM events ORDER BY date DESC LIMIT 300"),
    deliverables: await db.all("SELECT * FROM deliverables ORDER BY date DESC LIMIT 300"),
    stats: await db.all("SELECT * FROM stats ORDER BY period DESC LIMIT 300"),
  });
}));

app.post("/api/admin/client", admin, wrap(async (req, res) => {
  const b = req.body || {};
  const m = ["com", "meta"].filter(x => (b.modules || []).includes(x)).join(",") || "com";
  const fields = [clean(b.name, 120), clean(b.formula, 120), m, clean(b.metricool_blog_id, 20).replace(/\D/g, ""), Number(b.contacts_goal) || 0, clean(b.qualified_definition, 2000), clean(b.drive_url, 500)];
  if (!fields[0]) return res.status(400).json({ error: "Nom du client obligatoire." });
  if (b.id) {
    await db.run("UPDATE clients SET name=?, formula=?, modules=?, metricool_blog_id=?, contacts_goal=?, qualified_definition=?, drive_url=?, active=? WHERE id=?", [...fields, b.active === false ? 0 : 1, Number(b.id)]);
    return res.json({ ok: true });
  }
  let code;
  for (let i = 0; i < 20; i++) { code = `GAC-${rnd(4)}-${SUFFIX[m]}`; if (!await db.one("SELECT id FROM clients WHERE code = ?", [code])) break; }
  await db.run("INSERT INTO clients (code, name, formula, modules, metricool_blog_id, contacts_goal, qualified_definition, drive_url, active, created_at) VALUES (?,?,?,?,?,?,?,?,1,?)", [code, ...fields, now()]);
  res.json({ ok: true, code });
}));

const ADMIN_TABLES = {
  leads: ["client_id", "date", "title", "detail"],
  events: ["client_id", "date", "kind", "title", "detail"],
  deliverables: ["client_id", "date", "title", "detail", "url"],
  stats: ["client_id", "period", "module", "data", "source"],
};
app.post("/api/admin/:table", admin, wrap(async (req, res) => {
  const cols = ADMIN_TABLES[req.params.table];
  if (!cols) return res.status(404).json({ error: "Inconnu." });
  const b = req.body || {};
  if (req.params.table === "stats") { try { JSON.parse(b.data); } catch (e) { return res.status(400).json({ error: "Chiffres illisibles." }); } }
  const vals = cols.map(k => k === "client_id" ? Number(b[k]) : clean(b[k], 2000));
  if (!vals[0] || !vals[1]) return res.status(400).json({ error: "Client et date obligatoires." });
  const extra = req.params.table === "leads" ? ", created_at" : "";
  const r = await db.run(`INSERT INTO ${req.params.table} (${cols.join(",")}${extra}) VALUES (${cols.map(() => "?").join(",")}${extra ? ",?" : ""})`, extra ? [...vals, now()] : vals);
  res.json({ ok: true, id: r.id });
}));
app.delete("/api/admin/:table/:id", admin, wrap(async (req, res) => {
  if (!ADMIN_TABLES[req.params.table]) return res.status(404).json({ error: "Inconnu." });
  await db.run(`DELETE FROM ${req.params.table} WHERE id = ?`, [Number(req.params.id)]);
  res.json({ ok: true });
}));
app.post("/api/admin/request/:id", admin, wrap(async (req, res) => {
  await db.run("UPDATE requests SET status = ? WHERE id = ?", [clean(req.body.status, 30) || "Prise en compte", Number(req.params.id)]);
  res.json({ ok: true });
}));
app.get("/api/admin/file/:name", admin, (req, res) => {
  const f = path.basename(req.params.name);
  res.download(path.join(UPLOADS, f), f, err => { if (err && !res.headersSent) res.status(404).end(); });
});

// ---------- Fichiers de l'application ----------
app.get("/agence", (req, res) => res.sendFile(path.join(__dirname, "public", "agence.html")));
app.use(express.static(path.join(__dirname, "public"), { maxAge: "1h", setHeaders: (res, p) => { if (/sw\.js$|\.html$/.test(p)) res.setHeader("Cache-Control", "no-cache"); } }));
app.get("*", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

db.init().then(() => {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, () => console.log("Application Gacolet sur le port " + port));
}).catch(e => { console.error("Base de données inaccessible :", e.message); process.exit(1); });
