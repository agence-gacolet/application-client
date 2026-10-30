// Gestion interne de l'agence : stockage générique « collection / document » (tâches, agenda, commercial...).
// Même logique que l'ancien gestionnaire : chaque document est un objet JSON rangé dans une collection.
// Comptes : un siège par personne, avec un rôle (propriétaire, membre, commercial) qui limite ce que le serveur renvoie et accepte.
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");

const COLLS = ["events", "tasks", "commercial", "campaigns", "rushes", "publications", "clients", "cevents", "keydates", "posts", "edtodo", "meta", "messages", "formations"];
const ROLES = ["owner", "member", "commercial"];
const ACCESS = {
  member: {
    read: ["tasks", "events", "messages", "formations", "clients", "meta"],
    write: ["tasks", "messages", "formations"],
  },
  commercial: {
    read: ["tasks", "events", "messages", "formations", "clients", "meta", "commercial", "campaigns", "rushes", "publications", "cevents", "keydates", "posts", "edtodo"],
    write: ["tasks", "messages", "formations", "commercial", "campaigns", "rushes", "publications", "cevents", "keydates", "posts", "edtodo"],
  },
};
const SEED = [["Gabriel", "gabriel"], ["Matis", "matis"], ["Clara", "clara"]];

module.exports = function (app, { db, wrap, root }) {
  const okCol = c => COLLS.includes(c);
  const SECRET = process.env.APP_SECRET || "dev-secret";
  const legacyKey = () => crypto.createHmac("sha256", SECRET).update(process.env.ADMIN_PASSWORD || "").digest("hex");

  // Crée les tables si besoin, puis les trois comptes propriétaires (sans mot de passe) au premier démarrage.
  let ready = null;
  const ensure = () => ready || (ready = (async () => {
    await db.run("CREATE TABLE IF NOT EXISTS docs (col VARCHAR(40) NOT NULL, id VARCHAR(120) NOT NULL, data MEDIUMTEXT NOT NULL, deleted INT NOT NULL DEFAULT 0, updated_at VARCHAR(30) NOT NULL, PRIMARY KEY (col, id))");
    await db.run("CREATE TABLE IF NOT EXISTS gusers (id VARCHAR(40) NOT NULL PRIMARY KEY, username VARCHAR(60) NOT NULL, name VARCHAR(80) NOT NULL, role VARCHAR(20) NOT NULL, pass VARCHAR(200) NOT NULL DEFAULT '', pv INT NOT NULL DEFAULT 0, disabled INT NOT NULL DEFAULT 0, info VARCHAR(2000) NOT NULL DEFAULT '', created_at VARCHAR(30) NOT NULL)");
    if (!(await db.one("SELECT id FROM gusers LIMIT 1"))) {
      for (const [name, username] of SEED) await db.run("INSERT INTO gusers (id, username, name, role, pass, pv, disabled, created_at) VALUES (?,?,?,?,'',0,0,?)", [newId(), username, name, "owner", stamp()]);
    }
  })().catch(e => { ready = null; throw e; }));
  app.use(["/api/g", "/api/g-"], (req, res, next) => ensure().then(() => next(), e => res.status(500).json({ error: "Base indisponible.", detail: String(e.message || e).slice(0, 300) })));
  const okId = id => /^[\w.-]{1,120}$/.test(String(id || ""));
  const stamp = () => new Date().toISOString();
  const newId = () => Date.now().toString(36) + crypto.randomBytes(4).toString("hex");

  // ---------- Mots de passe et jetons ----------
  const hashPw = pw => { const salt = crypto.randomBytes(16).toString("hex"); return "s1$" + salt + "$" + crypto.scryptSync(pw, salt, 32).toString("hex"); };
  const checkPw = (pw, stored) => {
    const [v, salt, h] = String(stored || "").split("$");
    if (v !== "s1" || !salt || !h) return false;
    const a = crypto.scryptSync(String(pw), salt, 32), b = Buffer.from(h, "hex");
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const sign = s => crypto.createHmac("sha256", SECRET).update(s).digest("base64url");
  const makeToken = u => { const p = Buffer.from(JSON.stringify({ i: u.id, v: Number(u.pv) || 0, e: Date.now() + 180 * 864e5 })).toString("base64url"); return "u1." + p + "." + sign(p); };
  const eq = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const pub = u => { let info = {}; try { info = JSON.parse(u.info || "{}"); } catch (e) {} return { id: u.id, username: u.username, name: u.name, role: u.role, disabled: !!Number(u.disabled), hasPassword: !!u.pass, email: info.email || "", tel: info.tel || "" }; };

  async function who(req) {
    const k = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!k) return null;
    if (process.env.ADMIN_PASSWORD && eq(k, legacyKey())) {
      // Accès de secours (mot de passe de l'agence) : droits de propriétaire.
      let want = ""; try { want = decodeURIComponent(String(req.get("x-gc-me") || "")).replace(/^"|"$/g, "").slice(0, 80); } catch (e) {}
      const u = want ? await db.one("SELECT * FROM gusers WHERE name = ? AND disabled = 0", [want]) : null;
      return { id: "secours", name: u ? u.name : "Gabriel", role: "owner", secours: true };
    }
    const [v, p, s] = k.split(".");
    if (v !== "u1" || !p || !s || !eq(s, sign(p))) return null;
    let d; try { d = JSON.parse(Buffer.from(p, "base64url").toString()); } catch (e) { return null; }
    if (!d || d.e < Date.now()) return null;
    const u = await db.one("SELECT * FROM gusers WHERE id = ?", [d.i]);
    if (!u || Number(u.disabled) || Number(u.pv) !== d.v || !u.pass) return null;
    return { id: u.id, name: u.name, role: ROLES.includes(u.role) ? u.role : "member", username: u.username };
  }
  // Aperçu : un propriétaire voit l'application comme un autre siège, en lecture seule (en-tête X-GC-As).
  async function withPreview(req, u) {
    const as = String(req.get("x-gc-as") || "");
    if (!as || u.role !== "owner") return u;
    const t = await db.one("SELECT * FROM gusers WHERE id = ?", [as]);
    if (!t) return u;
    return { id: t.id, name: t.name, role: ROLES.includes(t.role) ? t.role : "member", username: t.username, preview: true, by: u.name };
  }
  const auth = (req, res, next) => ensure().then(() => who(req)).then(async u => {
    if (!u) return res.status(401).json({ error: "Connexion requise." });
    req.user = await withPreview(req, u);
    if (req.user.preview && req.method !== "GET") return res.status(403).json({ error: "Aperçu en lecture seule : rien n’est modifié." });
    next();
  }).catch(e => res.status(500).json({ error: "Base indisponible.", detail: String(e.message || e).slice(0, 300) }));
  const ownerOnly = (req, res, next) => req.user && req.user.role === "owner" ? next() : res.status(403).json({ error: "Réservé aux propriétaires." });

  // ---------- Droits par rôle ----------
  const canRead = (u, col) => u.role === "owner" || (ACCESS[u.role] && ACCESS[u.role].read.includes(col));
  const canWriteCol = (u, col) => u.role === "owner" || (ACCESS[u.role] && ACCESS[u.role].write.includes(col));
  function visible(u, col, d) {
    if (!canRead(u, col)) return false;
    if (col === "messages" && String(d.ch || "").startsWith("dm:")) return String(d.ch).slice(3).split("|").includes(u.name);
    if (u.role === "owner") return true;
    if (col === "tasks") return d.who === u.name;
    if (col === "events") return Array.isArray(d.who) && d.who.includes(u.name);
    return true;
  }
  // before : document actuel (ou null), after : document voulu (ou null pour une suppression), keys : champs modifiés
  function allowed(u, col, before, after, keys) {
    if (col === "messages") {
      if (before && before.who !== u.name && !(u.role === "owner" && !after)) return "Tu ne peux retirer que tes propres messages.";
      if (after && after.who !== u.name) return "Message refusé.";
      if (after && String(after.ch || "").startsWith("dm:") && !String(after.ch).slice(3).split("|").includes(u.name)) return "Conversation privée.";
      if (before && !after && String(before.ch || "").startsWith("dm:") && before.who !== u.name) return "Conversation privée.";
      return "";
    }
    if (u.role === "owner") return "";
    if (!canWriteCol(u, col)) return "Ton rôle ne permet pas de modifier cette partie.";
    if (col === "tasks") {
      if ((before && before.who !== u.name) || (after && after.who !== u.name)) return "Tu ne peux gérer que tes propres tâches.";
    }
    if (col === "formations") {
      if (!before || !after || !keys || keys.some(k => k !== "seenBy")) return "Seuls les propriétaires modifient les formations.";
    }
    return "";
  }

  // ---------- Connexion ----------
  const tries = new Map();
  app.post("/api/g-login", wrap(async (req, res) => {
    await ensure();
    const ip = req.ip || "x", t = tries.get(ip) || { n: 0, at: Date.now() };
    if (Date.now() - t.at > 10 * 60000) { t.n = 0; t.at = Date.now(); }
    if (t.n >= 10) return res.status(429).json({ error: "Trop d’essais. Réessaie dans quelques minutes." });
    const username = String((req.body && req.body.username) || "").trim().toLowerCase(), pw = String((req.body && req.body.password) || "");
    const u = username ? await db.one("SELECT * FROM gusers WHERE username = ?", [username]) : null;
    if (u && !Number(u.disabled) && u.pass && checkPw(pw, u.pass)) { tries.delete(ip); return res.json({ key: makeToken(u) }); }
    if (process.env.ADMIN_PASSWORD && pw === process.env.ADMIN_PASSWORD) { tries.delete(ip); return res.json({ key: legacyKey(), secours: true }); }
    t.n++; tries.set(ip, t);
    if (u && Number(u.disabled)) return res.status(401).json({ error: "Ce compte est suspendu. Vois avec un propriétaire." });
    if (u && !u.pass) return res.status(401).json({ error: "Ce compte n’a pas encore de mot de passe. Un propriétaire doit le définir dans Paramètres." });
    res.status(401).json({ error: "Identifiant ou mot de passe incorrect." });
  }));
  const infoOf = u => { try { return JSON.parse(u.info || "{}"); } catch (e) { return {}; } };
  app.get("/api/g-me", auth, wrap(async (req, res) => {
    const team = (await db.all("SELECT name, role, info FROM gusers WHERE disabled = 0 ORDER BY created_at")).map(r => { const i = infoOf(r); return { name: r.name, role: r.role, avatar: i.avatar || "", email: i.email || "", tel: i.tel || "" }; });
    const row = req.user.secours ? null : await db.one("SELECT * FROM gusers WHERE id = ?", [req.user.id]);
    res.json({ user: Object.assign({}, req.user, row ? { info: infoOf(row) } : {}), team });
  }));
  app.patch("/api/g-me", auth, wrap(async (req, res) => {
    if (req.user.secours) return res.status(400).json({ error: "Connecte-toi avec ton compte pour modifier tes coordonnées." });
    const u = await db.one("SELECT * FROM gusers WHERE id = ?", [req.user.id]);
    const b = req.body || {}, info = infoOf(u);
    if (b.email != null) { const e = String(b.email).trim().slice(0, 160); if (e && !/^\S+@\S+\.\S+$/.test(e)) return res.status(400).json({ error: "Adresse de courriel invalide." }); info.email = e; }
    if (b.tel != null) info.tel = String(b.tel).trim().slice(0, 40);
    if (b.avatar != null) { const a = String(b.avatar); if (a && !/^\/f\/[a-f0-9]{32}\.(jpe?g|png|webp|gif)$/.test(a)) return res.status(400).json({ error: "Photo invalide." }); info.avatar = a; }
    await db.run("UPDATE gusers SET info = ? WHERE id = ?", [JSON.stringify(info), u.id]);
    res.json({ ok: true, info });
  }));
  app.post("/api/g-me/password", auth, wrap(async (req, res) => {
    if (req.user.secours) return res.status(400).json({ error: "Connecte-toi avec ton compte pour changer ton mot de passe." });
    const u = await db.one("SELECT * FROM gusers WHERE id = ?", [req.user.id]);
    const cur = String(req.body.current || ""), next = String(req.body.next || "");
    if (!checkPw(cur, u.pass)) return res.status(400).json({ error: "Mot de passe actuel incorrect." });
    if (next.length < 8) return res.status(400).json({ error: "Le nouveau mot de passe doit faire au moins 8 caractères." });
    const pv = Number(u.pv) + 1;
    await db.run("UPDATE gusers SET pass = ?, pv = ? WHERE id = ?", [hashPw(next), pv, u.id]);
    res.json({ ok: true, key: makeToken(Object.assign({}, u, { pv })) });
  }));

  // ---------- Sièges (propriétaires) ----------
  const cleanName = s => String(s || "").trim().replace(/\s+/g, " ").slice(0, 60);
  const cleanUser = s => String(s || "").trim().toLowerCase();
  const okUser = s => /^[a-z0-9][a-z0-9._-]{1,39}$/.test(s);
  app.get("/api/g-users", auth, ownerOnly, wrap(async (req, res) => {
    res.json({ users: (await db.all("SELECT * FROM gusers ORDER BY created_at")).map(pub) });
  }));
  app.post("/api/g-users", auth, ownerOnly, wrap(async (req, res) => {
    const b = req.body || {}, name = cleanName(b.name), username = cleanUser(b.username), role = String(b.role || "member"), pw = String(b.password || "");
    if (!name) return res.status(400).json({ error: "Indique le prénom." });
    if (!okUser(username)) return res.status(400).json({ error: "Identifiant : lettres, chiffres, point ou tiret, 2 caractères au moins, sans espace." });
    if (!ROLES.includes(role)) return res.status(400).json({ error: "Rôle inconnu." });
    if (pw && pw.length < 8) return res.status(400).json({ error: "Le mot de passe doit faire au moins 8 caractères." });
    if (await db.one("SELECT id FROM gusers WHERE username = ?", [username])) return res.status(400).json({ error: "Cet identifiant est déjà pris." });
    if (await db.one("SELECT id FROM gusers WHERE name = ?", [name])) return res.status(400).json({ error: "Ce prénom est déjà utilisé : ajoute l’initiale du nom." });
    const id = newId();
    await db.run("INSERT INTO gusers (id, username, name, role, pass, pv, disabled, created_at) VALUES (?,?,?,?,?,0,0,?)", [id, username, name, role, pw ? hashPw(pw) : "", stamp()]);
    res.json({ ok: true, id });
  }));
  app.patch("/api/g-users/:id", auth, ownerOnly, wrap(async (req, res) => {
    const u = await db.one("SELECT * FROM gusers WHERE id = ?", [req.params.id]);
    if (!u) return res.status(404).json({ error: "Compte introuvable." });
    const b = req.body || {};
    const role = b.role != null ? String(b.role) : u.role;
    const disabled = b.disabled != null ? (b.disabled ? 1 : 0) : Number(u.disabled);
    if (!ROLES.includes(role)) return res.status(400).json({ error: "Rôle inconnu." });
    if (u.role === "owner" && (role !== "owner" || disabled)) {
      const n = (await db.all("SELECT id FROM gusers WHERE role = 'owner' AND disabled = 0 AND id <> ?", [u.id])).length;
      if (!n) return res.status(400).json({ error: "Il faut garder au moins un propriétaire actif." });
    }
    let username = u.username;
    if (b.username != null) {
      username = cleanUser(b.username);
      if (!okUser(username)) return res.status(400).json({ error: "Identifiant : lettres, chiffres, point ou tiret, sans espace." });
      if (await db.one("SELECT id FROM gusers WHERE username = ? AND id <> ?", [username, u.id])) return res.status(400).json({ error: "Cet identifiant est déjà pris." });
    }
    let pass = u.pass, pv = Number(u.pv);
    if (b.password != null) {
      const pw = String(b.password);
      if (pw.length < 8) return res.status(400).json({ error: "Le mot de passe doit faire au moins 8 caractères." });
      pass = hashPw(pw); pv++;
    }
    if (disabled !== Number(u.disabled) || role !== u.role) pv++;
    await db.run("UPDATE gusers SET username = ?, role = ?, disabled = ?, pass = ?, pv = ? WHERE id = ?", [username, role, disabled, pass, pv, u.id]);
    res.json({ ok: true });
  }));
  app.delete("/api/g-users/:id", auth, ownerOnly, wrap(async (req, res) => {
    const u = await db.one("SELECT * FROM gusers WHERE id = ?", [req.params.id]);
    if (!u) return res.json({ ok: true });
    if (u.id === req.user.id) return res.status(400).json({ error: "Tu ne peux pas retirer ton propre siège." });
    if (u.role === "owner") {
      const n = (await db.all("SELECT id FROM gusers WHERE role = 'owner' AND disabled = 0 AND id <> ?", [u.id])).length;
      if (!n) return res.status(400).json({ error: "Il faut garder au moins un propriétaire actif." });
    }
    await db.run("DELETE FROM gusers WHERE id = ?", [u.id]);
    res.json({ ok: true });
  }));

  // ---------- Aperçu de l'espace client (propriétaires) ----------
  const PREVIEW_MAIL = "apercu@agence.interne";
  app.get("/api/g-preview-clients", auth, ownerOnly, wrap(async (req, res) => {
    res.json({ clients: await db.all("SELECT id, name FROM clients WHERE active = 1 ORDER BY name") });
  }));
  app.post("/api/g-preview-client", auth, ownerOnly, wrap(async (req, res) => {
    const c = await db.one("SELECT * FROM clients WHERE id = ? AND active = 1", [Number(req.body && req.body.clientId)]);
    if (!c) return res.status(404).json({ error: "Client introuvable." });
    let u = await db.one("SELECT * FROM users WHERE client_id = ? AND email = ?", [c.id, PREVIEW_MAIL]);
    if (!u) {
      const token = crypto.randomBytes(24).toString("hex");
      await db.run("INSERT INTO users (client_id, prenom, nom, entreprise, email, tel, activite, zone, reseaux, objectif, clientele, dispo, token, created_at) VALUES (?,?,?,?,?,'','','','','','','',?,?)",
        [c.id, "équipe", "Gacolet", c.name, PREVIEW_MAIL, token, stamp()]);
      u = await db.one("SELECT * FROM users WHERE client_id = ? AND email = ?", [c.id, PREVIEW_MAIL]);
    }
    res.json({ url: "/?apercu=" + u.token });
  }));

  // ---------- GIF (GIPHY) ----------
  app.get("/api/g-gifs", auth, wrap(async (req, res) => {
    const key = process.env.GIPHY_KEY;
    if (!key) return res.status(503).json({ error: "Les GIF ne sont pas encore activés : il manque la clé GIPHY sur le serveur." });
    const q = String(req.query.q || "").trim().slice(0, 60);
    const url = q ? "https://api.giphy.com/v1/gifs/search?api_key=" + encodeURIComponent(key) + "&q=" + encodeURIComponent(q) + "&limit=24&rating=pg-13&lang=fr"
                  : "https://api.giphy.com/v1/gifs/trending?api_key=" + encodeURIComponent(key) + "&limit=24&rating=pg-13";
    const r = await fetch(url); if (!r.ok) return res.status(502).json({ error: "GIPHY ne répond pas pour l’instant." });
    const j = await r.json();
    res.json({ gifs: (j.data || []).map(g => ({ id: g.id, title: g.title || "", url: g.images && g.images.fixed_height ? g.images.fixed_height.url : "", small: g.images && g.images.fixed_height_small ? g.images.fixed_height_small.url : "" })).filter(g => g.url) });
  }));

  // ---------- Données ----------
  // Tout ce qui a changé depuis « since » (premier appel : tout), filtré selon le rôle.
  app.get("/api/g/changes", auth, wrap(async (req, res) => {
    const since = String(req.query.since || "");
    const now = stamp(), u = req.user;
    const rows = since
      ? await db.all("SELECT col, id, data, deleted, updated_at FROM docs WHERE updated_at >= ?", [since])
      : await db.all("SELECT col, id, data, deleted, updated_at FROM docs WHERE deleted = 0");
    const docs = [];
    for (const r of rows) {
      if (!canRead(u, r.col)) continue;
      if (Number(r.deleted)) { docs.push({ col: r.col, id: r.id, deleted: true, data: null }); continue; }
      const d = JSON.parse(r.data || "{}");
      if (r.col === "clients" && u.role !== "owner") { const keep = {}; ["name", "color", "title", "calendar", "leadWeeks", "recap"].forEach(k => { if (d[k] != null) keep[k] = d[k]; }); docs.push({ col: r.col, id: r.id, deleted: false, data: keep }); continue; }
      if (visible(u, r.col, d)) docs.push({ col: r.col, id: r.id, deleted: false, data: d });
      else if (since) docs.push({ col: r.col, id: r.id, deleted: true, data: null }); // n'est plus visible (réattribué...)
    }
    res.json({ now, full: !since, docs });
  }));

  async function put(col, id, data) {
    const s = JSON.stringify(data || {});
    if (s.length > 200000) throw Object.assign(new Error("Document trop gros."), { status: 400 });
    const t = stamp();
    const r = await db.run("UPDATE docs SET data = ?, deleted = 0, updated_at = ? WHERE col = ? AND id = ?", [s, t, col, id]);
    if (!r.changes) await db.run("INSERT INTO docs (col, id, data, deleted, updated_at) VALUES (?,?,?,0,?)", [col, id, s, t]);
  }
  const current = async (col, id) => { const r = await db.one("SELECT data FROM docs WHERE col = ? AND id = ? AND deleted = 0", [col, id]); return r ? JSON.parse(r.data || "{}") : null; };
  const refuse = (res, msg) => res.status(403).json({ error: msg });

  // Créer ou remplacer
  app.put("/api/g/:col/:id", auth, wrap(async (req, res) => {
    const { col, id } = req.params;
    if (!okCol(col) || !okId(id)) return res.status(400).json({ error: "Demande invalide." });
    const data = (req.body && req.body.data) || {};
    const no = allowed(req.user, col, await current(col, id), data, null); if (no) return refuse(res, no);
    await put(col, id, data);
    res.json({ ok: true, id });
  }));
  app.post("/api/g/:col", auth, wrap(async (req, res) => {
    const col = req.params.col;
    if (!okCol(col)) return res.status(400).json({ error: "Demande invalide." });
    const data = (req.body && req.body.data) || {};
    const no = allowed(req.user, col, null, data, null); if (no) return refuse(res, no);
    const id = newId();
    await put(col, id, data);
    res.json({ ok: true, id });
  }));
  // Modifier quelques champs
  app.patch("/api/g/:col/:id", auth, wrap(async (req, res) => {
    const { col, id } = req.params;
    if (!okCol(col) || !okId(id)) return res.status(400).json({ error: "Demande invalide." });
    const cur = await current(col, id);
    if (!cur) return res.status(404).json({ error: "Élément introuvable : il a peut-être été supprimé." });
    const patch = (req.body && req.body.data) || {};
    const next = Object.assign({}, cur, patch);
    const no = allowed(req.user, col, cur, next, Object.keys(patch)); if (no) return refuse(res, no);
    await put(col, id, next);
    res.json({ ok: true });
  }));
  app.delete("/api/g/:col/:id", auth, wrap(async (req, res) => {
    const { col, id } = req.params;
    if (!okCol(col) || !okId(id)) return res.status(400).json({ error: "Demande invalide." });
    const cur = await current(col, id);
    if (cur) { const no = allowed(req.user, col, cur, null, null); if (no) return refuse(res, no); }
    await db.run("UPDATE docs SET deleted = 1, data = '{}', updated_at = ? WHERE col = ? AND id = ?", [stamp(), col, id]);
    res.json({ ok: true });
  }));

  // Reprise des données de l'ancien gestionnaire (une fois). N'écrase pas ce qui existe déjà.
  app.post("/api/g-import", auth, ownerOnly, wrap(async (req, res) => {
    const body = req.body || {}; let n = 0, skipped = 0;
    for (const col of Object.keys(body)) {
      if (!okCol(col)) continue;
      for (const id of Object.keys(body[col] || {})) {
        if (!okId(id)) continue;
        if (await db.one("SELECT id FROM docs WHERE col = ? AND id = ?", [col, id])) { skipped++; continue; }
        await put(col, id, body[col][id]); n++;
      }
    }
    res.json({ ok: true, imported: n, skipped });
  }));

  // Pièces jointes (rushs, devis, visuels, vocaux...). Adresse impossible à deviner, servie telle quelle.
  const DIR = path.join(root, "uploads", "gestion");
  fs.mkdirSync(DIR, { recursive: true });
  const up = multer({
    storage: multer.diskStorage({
      destination: DIR,
      filename: (req, f, cb) => cb(null, crypto.randomBytes(16).toString("hex") + path.extname(f.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 8)),
    }),
    limits: { fileSize: 300 * 1024 * 1024, files: 1 },
  });
  app.post("/api/g-upload", auth, up.single("file"), (req, res) => {
    const f = req.file;
    if (!f) return res.status(400).json({ error: "Aucun fichier reçu." });
    res.json({ id: f.filename, url: "/f/" + f.filename, contentType: f.mimetype, sizeBytes: f.size });
  });
  app.get("/f/:name", (req, res) => {
    const n = path.basename(req.params.name);
    if (!/^[a-f0-9]{32}(\.[a-z0-9]{1,7})?$/.test(n)) return res.status(404).end();
    res.sendFile(path.join(DIR, n), err => { if (err && !res.headersSent) res.status(404).end(); });
  });

  app.get(["/gestion", "/gestion/"], (req, res) => res.sendFile(path.join(root, "public", "gestion.html")));
};
