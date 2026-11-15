// Gestion interne de l'agence : stockage générique « collection / document » (tâches, agenda, commercial...).
// Même logique que l'ancien gestionnaire : chaque document est un objet JSON rangé dans une collection.
// Comptes : un siège par personne, avec un rôle (propriétaire, membre, commercial) qui limite ce que le serveur renvoie et accepte.
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");

const COLLS = ["events", "tasks", "commercial", "campaigns", "rushes", "publications", "clients", "cevents", "keydates", "posts", "edtodo", "meta", "messages", "formations", "msheets", "idees", "pilotage", "ca", "finance", "strategies", "shoots", "vrooms"];
const ROLES = ["owner", "member", "commercial"];
const ACCESS = {
  member: {
    read: ["tasks", "events", "messages", "formations", "clients", "meta"],
    write: ["tasks", "messages", "formations"],
  },
  commercial: {
    read: ["tasks", "events", "messages", "formations", "clients", "meta"],
    write: ["tasks", "messages", "formations"],
  },
};
/* Pages : chaque page donne accès aux données dont elle a besoin. Les rôles ont des pages par défaut,
   modifiables par les propriétaires (interrupteurs dans Paramètres), plus des pages données à une personne, pour toujours ou pour un temps. */
const VIEW_COLLS = { agenda: ["events", "tasks", "cevents", "keydates", "posts"], taches: ["tasks"], messagerie: ["messages"], vocal: ["vrooms"], focus: [], formation: ["formations"],
  commercial: ["commercial"], clients: ["clients", "cevents", "keydates"], montage: ["rushes"], tournage: ["shoots", "rushes", "events", "clients"], publications: ["publications", "posts", "edtodo"],
  campagnes: ["campaigns", "meta", "msheets"], fiches: ["clients"], idees: ["idees"], strategie: ["strategies", "clients"] };
const DEFAULT_VIEWS = { member: ["agenda", "taches", "messagerie", "vocal", "focus", "formation"],
  commercial: ["agenda", "taches", "messagerie", "vocal", "focus", "commercial", "clients", "montage", "publications", "idees", "campagnes", "formation"] };
const SEED = [["Gabriel", "gabriel"], ["Matis", "matis"], ["Clara", "clara"]];
// Le chiffre d'affaires et le plan chalet ne sont visibles que par Matis et Gabriel, quel que soit le rôle
const DUO = ["Matis", "Gabriel"], DUO_COLS = ["ca", "finance"];

module.exports = function (app, { db, wrap, root }) {
  const okCol = c => COLLS.includes(c);
  const SECRET = process.env.APP_SECRET || "dev-secret";
  const legacyKey = () => crypto.createHmac("sha256", SECRET).update(process.env.ADMIN_PASSWORD || "").digest("hex");

  // Crée les tables si besoin, puis les trois comptes propriétaires (sans mot de passe) au premier démarrage.
  let ready = null;
  const ensure = () => ready || (ready = (async () => {
    setTimeout(async () => { try { for (const r of await db.all("SELECT id, data FROM docs WHERE col = '_reads'")) LIVE.reads.set(r.id, Object.assign(JSON.parse(r.data || "{}"), LIVE.reads.get(r.id) || {})); } catch (e) {} }, 0);
    await db.run("CREATE TABLE IF NOT EXISTS docs (col VARCHAR(40) NOT NULL, id VARCHAR(120) NOT NULL, data MEDIUMTEXT NOT NULL, deleted INT NOT NULL DEFAULT 0, updated_at VARCHAR(30) NOT NULL, PRIMARY KEY (col, id))");
    await db.run("CREATE TABLE IF NOT EXISTS gusers (id VARCHAR(40) NOT NULL PRIMARY KEY, username VARCHAR(60) NOT NULL, name VARCHAR(80) NOT NULL, role VARCHAR(20) NOT NULL, pass VARCHAR(200) NOT NULL DEFAULT '', pv INT NOT NULL DEFAULT 0, disabled INT NOT NULL DEFAULT 0, info VARCHAR(2000) NOT NULL DEFAULT '', created_at VARCHAR(30) NOT NULL)");
    if (!(await db.one("SELECT id FROM gusers LIMIT 1"))) {
      for (const [name, username] of SEED) await db.run("INSERT INTO gusers (id, username, name, role, pass, pv, disabled, created_at) VALUES (?,?,?,?,'',0,0,?)", [newId(), username, name, "owner", stamp()]);
    }
    if (!(await db.one("SELECT id FROM docs WHERE col = 'meta' AND id = 'seed-prospects-reseaux'"))) {
      const t = new Date().toISOString(), day = t.slice(0, 10), have = (await db.all("SELECT data FROM docs WHERE col = 'commercial' AND deleted = 0")).map(r => { try { return String(JSON.parse(r.data).company || "").toLowerCase(); } catch (e) { return ""; } });
      for (const company of ["Carla Cota Design", "Mazet des délices", "EVA Nîmes"]) { if (have.includes(company.toLowerCase())) continue;
        await db.run("INSERT INTO docs (col, id, data, deleted, updated_at) VALUES ('commercial',?,?,0,?)", [newId(), JSON.stringify({ company, kind: "Prospect", source: "Réseaux sociaux", stage: "à contacter", nextAction: "Premier contact", nextDate: day, order: 999, createdAt: t, updatedAt: t, createdBy: "Tableau Veleda" }), t]); }
      await db.run("INSERT INTO docs (col, id, data, deleted, updated_at) VALUES ('meta','seed-prospects-reseaux',?,0,?)", [JSON.stringify({ done: t }), t]);
    }
    const seedDoc = async (col, id, data) => { if (await db.one("SELECT id FROM docs WHERE col = ? AND id = ?", [col, id])) return; const t = new Date().toISOString(); await db.run("INSERT INTO docs (col, id, data, deleted, updated_at) VALUES (?,?,?,0,?)", [col, id, JSON.stringify(Object.assign({ createdAt: t, updatedAt: t, createdBy: "Plan chalet" }, data)), t]); };
    if (!(await db.one("SELECT id FROM docs WHERE col = 'meta' AND id = 'seed-finance-chalet'"))) {
      // Plan chalet : fichier GACOLET_Chalet_PlanJourParJour_gsheet_v01_20261011 (onglets À lire, Objectifs mensuels, Suivi, Portes, Hypothèses)
      const months = ["2026-10","2026-11","2026-12","2027-01","2027-02","2027-03","2027-04","2027-05","2027-06","2027-07","2027-08","2027-09"];
      const caObj = [6023, 8794, 10774, 12839, 14389, 15939, 17489, 19039, 20589, 22139, 23689, 25239], caMin = [6000, 8000, 9300, 10300, 11300, 12300, 12900, 13900, 14800, 15400, 16400, 17400];
      const gSave = [1252, 3600, 3800, 4900, 4900, 5900, 6700, 6800, 7600, 7500, 8400, 9100], gTreso = [2900, 6500, 10300, 15200, 20100, 26000, 32700, 39500, 47100, 54600, 63000, 72100];
      const pSave = [779, 1300, 1800, 2300, 3100, 3500, 3900, 4300, 5200, 5500, 6000, 5700], pTreso = [800, 2100, 3900, 6200, 9300, 12800, 16700, 21000, 26200, 31700, 37700, 43400];
      const apport = [0, 0, 0, 5700, 11800, 18800, 26700, 35400, 47700, 58800, 70800, 82100], apportMin = [0, 0, 0, 800, 7100, 12200, 17600, 23600, 32900, 40600, 48700, 57500], signs = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23];
      await seedDoc("ca", "plan-chalet", { source: "GACOLET_Chalet_PlanJourParJour_gsheet_v01_20261011", deadline: "2027-10-21", compromis: "2027-07-02", price: 150000, cashNeeded: 53116, apportGoal: 82100, apportMin: 57500,
        months: months.map((m, i) => ({ month: m, caObj: caObj[i], caMin: caMin[i], gSave: gSave[i], gTreso: gTreso[i], pSave: pSave[i], pTreso: pTreso[i], apport: apport[i], apportMin: apportMin[i], signs: signs[i] })),
        week: { start: "2026-10-12", calls: 100, convs: 30, rdvP: 5, rdvT: 4, props: 3, signs: 1 }, day: { calls: 20, rdvP: 1 },
        signRule: "1 Meta et 1 Croissance signées par mois, Meta à 450 € d’honoraires. Minimum : 1 Meta et 1 Plus par mois.",
        gates: [
          { n: 1, date: "2026-12-31", goal: "CA de décembre d’au moins 10 800 € HT ; trésorerie de Gacolet d’au moins 10 300 € et de Paul Audio d’au moins 3 900 €.", min: "CA de 9 300 €, trésoreries de 9 000 € (Gacolet) et 3 100 € (Paul Audio)", ok: "On continue ; l’avance renforcera l’apport.", mid: "Parades R2 pendant 4 semaines, bilan au 1er dimanche de février.", low: "Parades R2 et préparation du plan C (R1) en janvier." },
          { n: 2, date: "2027-03-31", goal: "Bilans 2026 de Gacolet et de Paul Audio approuvés ; apport à 50/50 disponible d’au moins 18 800 €.", min: "Apport de 12 200 €, CA de 12 300 €", ok: "Chalet visé 150 000 €, le surplus porte l’apport à 25 ou 30 %.", mid: "Chalet visé 150 000 € à 20 % d’apport ; parades R2.", low: "Plan C activé : aide d’un proche (prêt déclaré ou caution), ou chalet de 100 000 à 115 000 €." },
          { n: 3, date: "2027-05-31", goal: "Accord de principe bancaire écrit ; SCI immatriculée ; apport à 50/50 disponible d’au moins 35 400 €.", min: "Apport de 23 600 €, ou aucune banque favorable", ok: "Offre d’achat le lendemain, banque informée de l’apport renforcé.", mid: "Offre plafonnée au calcul de l’onglet Hypothèses.", low: "2e tournée bancaire (banques mutualistes de la zone du chalet) ; plan C." },
          { n: 4, date: "2027-07-02", goal: "Compromis signé ; conditions suspensives correctes ; dépôt de garantie versé.", min: "Aucune offre acceptée au 20/06/2027", ok: "Demande de prêt déposée sous 10 jours.", mid: "Compromis au plus tard le 16/07/2027.", low: "Offre sur le bien de repli sous 48 h." },
          { n: 5, date: "2027-10-08", goal: "Acte authentique signé, apports égaux des deux sociétés versés.", min: "Acte non daté au 15/09/2027", ok: "Mise en location.", mid: "Prorogation écrite du compromis avec le vendeur.", low: "Limite absolue : 21/10/2027. Appel quotidien au notaire et à la banque." } ] });
      await seedDoc("ca", "m-2026-10", { month: "2026-10", real: 6453 });
      // Prélèvements mensuels : portefeuille d'agence.md (prix HT au 30/10/2026). Jour de prélèvement à confirmer.
      const subs = [["La Vie La Construction", "Tarif historique", 598], ["Locamex", "Standard", 500], ["Meyer-Pic", "Standard", 500], ["France Étanchéité", "Standard", 500], ["KR Thermolaquage", "Standard", 500], ["Paillotte Bassamoise", "Abonnement", 500],
        ["Bonobo", "Abonnement", 400], ["Delta Sud Formation", "Abonnement", 375], ["Gaufrement Bon", "Abonnement", 250], ["Sport Défense", "Abonnement", 200], ["Domaine Pagezi", "Essai", 200], ["AR Climatisation", "Vidéo 4 (dès le 01/11)", 200], ["Hugo Maître Nageur", "Vidéo 8", 350], ["Flora Design", "Vidéo 4", 200]];
      for (const [client, label, amount] of subs) await seedDoc("finance", "pr-" + client.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), { kind: "prelevement", client, label, amount, day: 5, active: true, paid: {} });
      await seedDoc("finance", "pr-sos-pare-brise-codognan", { kind: "prelevement", client: "SOS Pare-Brise Codognan", label: "Meta, au prorata de 10 contacts qualifiés", amount: 450, day: 5, active: true, variable: true, paid: {} });
      await seedDoc("finance", "pr-total-habitat-360", { kind: "prelevement", client: "Total Habitat 360", label: "Meta, au prorata des contacts qualifiés", amount: 450, day: 5, active: true, variable: true, start: "2026-11", paid: {} });
      await seedDoc("finance", "pj-hugo", { kind: "projet", client: "Hugo Maître Nageur", title: "Projet Hugo Maître Nageur", total: 0, payments: [], due: [] });
      await db.run("INSERT INTO docs (col, id, data, deleted, updated_at) VALUES ('meta','seed-finance-chalet',?,0,?)", [JSON.stringify({ done: new Date().toISOString() }), new Date().toISOString()]);
    }
  })().catch(e => { ready = null; throw e; }));
  app.use(["/api/g", "/api/g-"], (req, res, next) => ensure().then(() => next(), e => res.status(500).json({ error: "Base indisponible.", detail: String(e.message || e).slice(0, 300) })));
  const okId = id => /^[\w.-]{1,120}$/.test(String(id || ""));
  const stamp = () => new Date().toISOString();
  const STARTED = new Date().toISOString();
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
  const pub = u => { let info = {}; try { info = JSON.parse(u.info || "{}"); } catch (e) {} return { id: u.id, username: u.username, name: u.name, role: u.role, disabled: !!Number(u.disabled), hasPassword: !!u.pass, email: info.email || "", tel: info.tel || "", poste: info.poste || "" }; };

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
    req.user.views = await effViews(req.user);
    if (req.user.preview && req.method !== "GET") return res.status(403).json({ error: "Aperçu en lecture seule : rien n’est modifié." });
    next();
  }).catch(e => res.status(500).json({ error: "Base indisponible.", detail: String(e.message || e).slice(0, 300) }));
  // Réglage des pages : { roles: { member: [...], commercial: [...] }, people: { "<nom>": { "<page>": <fin en ms, 0 = toujours> } } }
  let ACC = null;
  const accCfg = async () => { if (!ACC) { const r = await db.one("SELECT data FROM docs WHERE col = ? AND id = ? AND deleted = 0", ["cfg", "access"]); ACC = r ? JSON.parse(r.data || "{}") : {}; } return ACC; };
  async function effViews(u) {
    if (u.role === "owner") return Object.keys(VIEW_COLLS).concat(["accueil", "parametres"]);
    const c = await accCfg(), base = (c.roles && Array.isArray(c.roles[u.role])) ? c.roles[u.role] : (DEFAULT_VIEWS[u.role] || DEFAULT_VIEWS.member);
    const extra = ((c.people || {})[u.name]) || {}, now = Date.now();
    // « * » : les pages de la personne sont réglées prénom par prénom, sans pages par défaut.
    return [...new Set(["accueil", "parametres"].concat(extra["*"] ? [] : base, Object.keys(extra).filter(k => k !== "*" && (!extra[k] || extra[k] > now))))].filter(v => v === "accueil" || v === "parametres" || VIEW_COLLS[v]);
  }
  const ownerOnly = (req, res, next) => req.user && req.user.role === "owner" ? next() : res.status(403).json({ error: "Réservé aux personnes qui ont l’accès complet." });

  // ---------- Droits par rôle ----------
  const viewColls = u => (u.views || []).flatMap(v => VIEW_COLLS[v] || []);
  const canRead = (u, col) => DUO_COLS.includes(col) ? DUO.includes(u.name) : u.role === "owner" || (ACCESS[u.role] && ACCESS[u.role].read.includes(col)) || viewColls(u).includes(col);
  const canWriteCol = (u, col) => DUO_COLS.includes(col) ? DUO.includes(u.name) : u.role === "owner" || (ACCESS[u.role] && ACCESS[u.role].write.includes(col)) || viewColls(u).includes(col);
  function visible(u, col, d) {
    if (!canRead(u, col)) return false;
    if (col === "messages" && String(d.ch || "").startsWith("dm:")) return String(d.ch).slice(3).split("|").includes(u.name);
    if (col === "messages" && String(d.ch || "").startsWith("cdm:")) return String(d.ch).split("|")[1] === u.name;
    if (col === "vrooms") return (d.members || []).includes(u.name); // salon vocal privé : seulement ses participants, accès complet compris
    if (u.role === "owner") return true;
    if (col === "tasks") return d.who === u.name;
    if (col === "commercial") return (d.owner || "Gabriel") === u.name; // chaque commercial ne voit que ses lignes
    return true;
  }
  // before : document actuel (ou null), after : document voulu (ou null pour une suppression), keys : champs modifiés
  function allowed(u, col, before, after, keys) {
    if (DUO_COLS.includes(col)) return DUO.includes(u.name) ? "" : "Réservé à Matis et Gabriel.";
    if (col === "messages") {
      if (before && before.who !== u.name && !(u.role === "owner" && !after)) return "Tu ne peux retirer que tes propres messages.";
      if (after && after.who !== u.name) return "Message refusé.";
      if (after && String(after.ch || "").startsWith("dm:") && !String(after.ch).slice(3).split("|").includes(u.name)) return "Conversation privée.";
      if (before && !after && String(before.ch || "").startsWith("dm:") && before.who !== u.name) return "Conversation privée.";
      if (after && String(after.ch || "").startsWith("cdm:") && String(after.ch).split("|")[1] !== u.name) return "Conversation privée.";
      return "";
    }
    if (col === "vrooms") {
      if (before && !(before.members || []).includes(u.name)) return "Salon privé.";
      if (after && (!(after.members || []).includes(u.name) || !/^sx[a-z]{6,18}$/.test(String(after.room || "")))) return "Salon refusé.";
      if (!before && after && after.by !== u.name) return "Salon refusé.";
      return "";
    }
    if (u.role === "owner") return "";
    if (!canWriteCol(u, col)) return "Tes accès ne permettent pas de modifier cette partie.";
    if (col === "tasks") {
      if ((before && before.who !== u.name) || (after && after.who !== u.name)) return "Tu ne peux gérer que tes propres tâches.";
    }
    if (col === "commercial") {
      if ((before && (before.owner || "Gabriel") !== u.name) || (after && (after.owner || "Gabriel") !== u.name)) return "Tu ne peux gérer que tes propres prospects.";
    }
    if (col === "formations") {
      if (!before || !after || !keys || keys.some(k => k !== "seenBy")) return "Les formations se modifient avec l’accès complet.";
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
    if (u && Number(u.disabled)) return res.status(401).json({ error: "Ce compte est suspendu. Vois avec Gabriel ou Matis." });
    if (u && !u.pass) return res.status(401).json({ error: "Ce compte n’a pas encore de mot de passe. Gabriel ou Matis doit le définir dans Paramètres." });
    res.status(401).json({ error: "Identifiant ou mot de passe incorrect." });
  }));
  const infoOf = u => { try { return JSON.parse(u.info || "{}"); } catch (e) { return {}; } };
  app.get("/api/g-access", auth, ownerOnly, wrap(async (req, res) => {
    const c = await accCfg(); res.json({ roles: Object.assign({}, DEFAULT_VIEWS, c.roles || {}), people: c.people || {}, pages: Object.keys(VIEW_COLLS) });
  }));
  app.put("/api/g-access", auth, ownerOnly, wrap(async (req, res) => {
    const b = req.body || {}, ok = v => Object.prototype.hasOwnProperty.call(VIEW_COLLS, v);
    const roles = {}; ["member", "commercial"].forEach(r => { if (Array.isArray((b.roles || {})[r])) roles[r] = [...new Set(b.roles[r].filter(ok))]; });
    const people = {}; Object.entries(b.people || {}).forEach(([n, m]) => { const o = {}; Object.entries(m || {}).forEach(([v, t]) => { if (ok(v)) o[v] = Number(t) || 0; else if (v === "*") o[v] = 1; }); if (Object.keys(o).length) people[String(n).slice(0, 80)] = o; });
    ACC = { roles, people }; await put("cfg", "access", ACC);
    res.json({ ok: true });
  }));
  app.get("/api/g-me", auth, wrap(async (req, res) => {
    const team = (await db.all("SELECT name, role, info FROM gusers WHERE disabled = 0 ORDER BY created_at")).map(r => { const i = infoOf(r); return { name: r.name, role: r.role, avatar: i.avatar || "", email: i.email || "", tel: i.tel || "", poste: i.poste || "" }; });
    const row = req.user.secours ? null : await db.one("SELECT * FROM gusers WHERE id = ?", [req.user.id]);
    res.json({ user: Object.assign({}, req.user, row ? { info: infoOf(row) } : {}), team });
  }));
  app.patch("/api/g-me", auth, wrap(async (req, res) => {
    if (req.user.secours) return res.status(400).json({ error: "Connecte-toi avec ton compte pour modifier tes coordonnées." });
    const u = await db.one("SELECT * FROM gusers WHERE id = ?", [req.user.id]);
    const b = req.body || {}, info = infoOf(u);
    if (b.email != null) { const e = String(b.email).trim().slice(0, 160); if (e && !/^\S+@\S+\.\S+$/.test(e)) return res.status(400).json({ error: "Adresse de courriel invalide." }); info.email = e; }
    if (b.tel != null) info.tel = String(b.tel).trim().slice(0, 40);
    if (b.poste != null) info.poste = String(b.poste).replace(/\s+/g, " ").trim().slice(0, 60);
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
    const poste = String(b.poste || "").replace(/\s+/g, " ").trim().slice(0, 60);
    await db.run("INSERT INTO gusers (id, username, name, role, pass, pv, disabled, info, created_at) VALUES (?,?,?,?,?,0,0,?,?)", [id, username, name, role, pw ? hashPw(pw) : "", poste ? JSON.stringify({ poste }) : "", stamp()]);
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
    let infoS = u.info || "";
    if (b.poste != null) { const info = infoOf(u); info.poste = String(b.poste).replace(/\s+/g, " ").trim().slice(0, 60); infoS = JSON.stringify(info); }
    await db.run("UPDATE gusers SET username = ?, role = ?, disabled = ?, pass = ?, pv = ?, info = ? WHERE id = ?", [username, role, disabled, pass, pv, infoS, u.id]);
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

  // Mode test : l’agence utilise l’espace d’un client comme lui, actions comprises, sous le nom « Test Agence ».
  const TEST_MAIL = "test@agence.interne";
  app.post("/api/g-test-client", auth, ownerOnly, wrap(async (req, res) => {
    const c = await db.one("SELECT * FROM clients WHERE id = ? AND active = 1", [Number(req.body && req.body.clientId)]);
    if (!c) return res.status(404).json({ error: "Client introuvable." });
    let u = await db.one("SELECT * FROM users WHERE client_id = ? AND email = ?", [c.id, TEST_MAIL]);
    if (!u) {
      const token = crypto.randomBytes(24).toString("hex");
      await db.run("INSERT INTO users (client_id, prenom, nom, entreprise, email, tel, activite, zone, reseaux, objectif, clientele, dispo, token, created_at) VALUES (?,?,?,?,?,'','','','','','','',?,?)",
        [c.id, "Test", "Agence", c.name, TEST_MAIL, token, stamp()]);
      u = await db.one("SELECT * FROM users WHERE client_id = ? AND email = ?", [c.id, TEST_MAIL]);
    }
    res.json({ url: "/?apercu=" + u.token + "&test=1" });
  }));

  // ---------- Meta : suivi des contacts par client (tables de l’espace client) ----------
  const metaRole = (req, res, next) => req.user && (req.user.role === "owner" || (req.user.views || []).includes("campagnes")) ? next() : res.status(403).json({ error: "Accès non ouvert pour ton prénom." });
  app.get("/api/g-meta", auth, metaRole, wrap(async (req, res) => {
    const cl = (await db.all("SELECT id, name, modules, contacts_goal, qualified_definition, active FROM clients ORDER BY name")).filter(c => c.active && String(c.modules || "").split(",").includes("meta"));
    const ids = cl.map(c => c.id);
    const leads = ids.length ? await db.all("SELECT id, client_id, date, title, detail, qualified, created_at FROM leads WHERE client_id IN (" + ids.map(() => "?").join(",") + ") ORDER BY date DESC, id DESC LIMIT 2000", ids) : [];
    res.json({ clients: cl.map(c => ({ id: c.id, name: c.name, goal: Number(c.contacts_goal) || 0, qualifiedDef: c.qualified_definition || "" })), leads });
  }));
  app.post("/api/g-meta/lead", auth, metaRole, wrap(async (req, res) => {
    const b = req.body || {}, cid = Number(b.clientId), date = String(b.date || "").slice(0, 10), title = String(b.title || "").trim().slice(0, 200);
    if (!cid || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !title) return res.status(400).json({ error: "Client, date et contact sont obligatoires." });
    const c = await db.one("SELECT id, modules FROM clients WHERE id = ?", [cid]);
    if (!c) return res.status(404).json({ error: "Client introuvable." });
    const r = await db.run("INSERT INTO leads (client_id, date, title, detail, created_at) VALUES (?,?,?,?,?)", [cid, date, title, String(b.detail || "").slice(0, 2000), new Date().toISOString()]);
    res.json({ ok: true, id: r.id });
  }));
  app.patch("/api/g-meta/lead/:id", auth, metaRole, wrap(async (req, res) => {
    const q = req.body && req.body.qualified; const v = q === 1 || q === 0 ? q : null;
    await db.run("UPDATE leads SET qualified = ?, qualified_at = ? WHERE id = ?", [v, new Date().toISOString(), Number(req.params.id)]);
    res.json({ ok: true });
  }));
  app.delete("/api/g-meta/lead/:id", auth, metaRole, wrap(async (req, res) => {
    await db.run("DELETE FROM leads WHERE id = ?", [Number(req.params.id)]);
    res.json({ ok: true });
  }));

  // ---------- Codes clients (espace client) : réservé aux propriétaires ----------
  const ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const rnd = n => Array.from(crypto.randomBytes(n), b => ALPHA[b % ALPHA.length]).join("");
  const SUFFIX = { com: "RS", meta: "MT", "com,meta": "RM" };
  const newCode = async m => { let code; for (let i = 0; i < 30; i++){ code = "GAC-" + rnd(4) + "-" + (SUFFIX[m] || "RS"); if (!await db.one("SELECT id FROM clients WHERE code = ?", [code])) return code; } throw new Error("Code impossible à générer, réessaie."); };
  const modsOf = arr => ["com", "meta"].filter(x => (arr || []).includes(x)).join(",") || "com";
  app.get("/api/g-codes", auth, ownerOnly, wrap(async (req, res) => {
    const cl = await db.all("SELECT id, code, name, formula, modules, contacts_goal, qualified_definition, active, created_at FROM clients ORDER BY name");
    const us = await db.all("SELECT id, client_id, prenom, nom, email, created_at FROM users WHERE token NOT LIKE 'retire-%' ORDER BY id");
    res.json({ clients: cl.map(c => ({ ...c, people: us.filter(u => u.client_id === c.id) })) });
  }));
  app.post("/api/g-codes", auth, ownerOnly, wrap(async (req, res) => {
    const b = req.body || {}, name = String(b.name || "").trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: "Nom du client obligatoire." });
    const m = modsOf(b.modules), code = await newCode(m);
    await db.run("INSERT INTO clients (code, name, formula, modules, metricool_blog_id, contacts_goal, qualified_definition, drive_url, active, created_at) VALUES (?,?,?,?,?,?,?,?,1,?)",
      [code, name, String(b.formula || "").slice(0, 120), m, "", Number(b.goal) || 0, String(b.qualifiedDef || "").slice(0, 2000), "", new Date().toISOString()]);
    res.json({ ok: true, code });
  }));
  app.patch("/api/g-codes/:id", auth, ownerOnly, wrap(async (req, res) => {
    const id = Number(req.params.id), b = req.body || {};
    const c = await db.one("SELECT * FROM clients WHERE id = ?", [id]); if (!c) return res.status(404).json({ error: "Client introuvable." });
    if (b.renew){ const code = await newCode(c.modules); await db.run("UPDATE clients SET code = ? WHERE id = ?", [code, id]); return res.json({ ok: true, code }); }
    const m = b.modules ? modsOf(b.modules) : c.modules;
    await db.run("UPDATE clients SET name = ?, formula = ?, modules = ?, contacts_goal = ?, qualified_definition = ?, active = ? WHERE id = ?",
      [b.name != null ? String(b.name).trim().slice(0, 120) || c.name : c.name, b.formula != null ? String(b.formula).slice(0, 120) : c.formula, m,
       b.goal != null ? Number(b.goal) || 0 : c.contacts_goal, b.qualifiedDef != null ? String(b.qualifiedDef).slice(0, 2000) : c.qualified_definition, b.active != null ? (b.active ? 1 : 0) : c.active, id]);
    if (m !== c.modules){ const code = c.code.replace(/-\w{2}$/, "-" + (SUFFIX[m] || "RS")); if (!await db.one("SELECT id FROM clients WHERE code = ? AND id <> ?", [code, id])) await db.run("UPDATE clients SET code = ? WHERE id = ?", [code, id]); }
    res.json({ ok: true });
  }));
  app.delete("/api/g-codes/user/:id", auth, ownerOnly, wrap(async (req, res) => {
    // On coupe l’accès sans effacer l’historique (validations, demandes) : le jeton est remplacé.
    await db.run("UPDATE users SET token = ? WHERE id = ?", ["retire-" + crypto.randomBytes(20).toString("hex"), Number(req.params.id)]);
    res.json({ ok: true });
  }));

  // ---------- Copie des tableaux de suivi Meta (Google Sheets), envoyée par Make ----------
  // Make lit chaque fichier (onglets choisis) et poste les valeurs ici. Les tableaux Sheets et les courriels restent en place :
  // l’application en garde une copie à jour, consultable et triable. Clé dans la variable MAKE_KEY du serveur.
  app.post("/api/hook/sheets", wrap(async (req, res) => {
    const key = process.env.MAKE_KEY || "";
    const got = String(req.query.key || req.get("x-make-key") || "");
    if (!key) return res.status(503).json({ error: "MAKE_KEY n’est pas défini sur le serveur." });
    if (got.length !== key.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(key))) return res.status(401).json({ error: "Clé refusée." });
    await ensure();
    const b = req.body || {}, file = String(b.file || "").trim().slice(0, 80), client = String(b.client || "").trim().slice(0, 120);
    if (!file || !client) return res.status(400).json({ error: "file et client sont obligatoires." });
    let ranges = b.valueRanges || (b.data && b.data.valueRanges) || (b.body && b.body.valueRanges) || [];
    if (typeof ranges === "string") { try { ranges = JSON.parse(ranges); } catch (e) { ranges = []; } }
    if (!Array.isArray(ranges) && Array.isArray(b.values)) ranges = [{ range: b.tab || "Contacts", values: b.values }];
    const out = [];
    for (const r of ranges) {
      const tab = String(r.range || "").split("!")[0].replace(/^'|'$/g, "").replace(/''/g, "'").trim().slice(0, 60);
      let rows = (Array.isArray(r.values) ? r.values : []).map(row => (Array.isArray(row) ? row : []).map(v => v == null ? "" : String(v).slice(0, 4000)));
      while (rows.length && rows[rows.length - 1].every(v => v === "")) rows.pop();
      const width = rows.reduce((m, row) => { let w = row.length; while (w && row[w - 1] === "") w--; return Math.max(m, w); }, 0);
      rows = rows.map(row => { const x = row.slice(0, width); while (x.length < width) x.push(""); return x; });
      if (!tab) continue;
      const id = (file + "__" + tab).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w.-]+/g, "_").slice(0, 110);
      const url = /^https:\/\/docs\.google\.com\//.test(String(b.url || "")) ? String(b.url).slice(0, 300) : "";
      const data = JSON.stringify({ file, client, tab, url, rows, syncedAt: new Date().toISOString() });
      if (data.length > 1500000) { out.push({ tab, error: "trop gros" }); continue; }
      const t = stamp();
      const u = await db.run("UPDATE docs SET data = ?, deleted = 0, updated_at = ? WHERE col = ? AND id = ?", [data, t, "msheets", id]);
      if (!u.changes) await db.run("INSERT INTO docs (col, id, data, deleted, updated_at) VALUES (?,?,?,0,?)", ["msheets", id, data, t]);
      out.push({ tab, rows: rows.length });
    }
    res.json({ ok: true, file, tabs: out });
  }));

  // ---------- Salons vocaux intégrés (WebRTC, de pair à pair) ----------
  // Le serveur ne fait que relayer les messages de mise en relation (offres, réponses, candidats réseau) par interrogation longue.
  // Le son, la vidéo et le partage d’écran passent directement entre les navigateurs.
  // Invités (prospects) : un lien signé donne accès à un seul salon, sans compte, jusqu’à sa date de fin ou sa suppression.
  const RTC = new Map(); // salon -> Map(pid -> { name, uid, q: [], wait: null, seen })
  const okRoom = r => /^[a-z]{3,20}$/.test(String(r || ""));
  const roomOf = r => { if (!RTC.has(r)) RTC.set(r, new Map()); return RTC.get(r); };
  const deliver = (p, ev) => { p.q.push(ev); if (p.wait) { const w = p.wait; p.wait = null; w(); } };
  const dropPeer = (room, pid) => { const m = RTC.get(room); if (!m || !m.has(pid)) return; const p = m.get(pid); m.delete(pid); if (p.wait) { const w = p.wait; p.wait = null; w(); } m.forEach(o => deliver(o, { type: "leave", pid })); if (!m.size) RTC.delete(room); };
  setInterval(() => { const lim = Date.now() - 45000; RTC.forEach((m, room) => m.forEach((p, pid) => { if (p.seen < lim) dropPeer(room, pid); })); }, 10000).unref();
  const peerOf = (req, room, pid) => { const m = RTC.get(room); const p = m && m.get(String(pid || "")); return p && p.uid === req.user.id ? p : null; };
  const letters = n => Array.from(crypto.randomBytes(n), b => "abcdefghijklmnopqrstuvwxyz"[b % 26]).join("");
  const inviteTok = d => { const p = Buffer.from(JSON.stringify(d)).toString("base64url"); return "g1." + p + "." + sign("g1" + p); };
  const gauth = (req, res, next) => ensure().then(async () => {
    const ct = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "");
    if (!req.get("x-gc-guest") && !req.query.i && ct && !ct.startsWith("retire-")) {
      const u = await db.one("SELECT * FROM users WHERE token = ?", [ct]);
      const c = u && await db.one("SELECT * FROM clients WHERE id = ? AND active = 1", [u.client_id]);
      if (!c) return res.status(401).json({ error: "Session expirée. Rouvrez votre espace client." });
      if (u.email === PREVIEW_MAIL && req.method !== "GET") return res.status(403).json({ error: "Aperçu de l’agence : lecture seule." });
      const cap = x => { x = String(x || "").trim(); return x.charAt(0).toUpperCase() + x.slice(1); };
      const room = "visio" + String(c.id).split("").map(x => "abcdefghij"[Number(x)]).join(""), name = (cap(u.prenom) + " " + cap(u.nom)).trim() || c.name;
      req.inv = { room, label: "Visio mensuelle, " + c.name, by: "l’agence", name };
      req.user = { id: "c:" + c.id + ":" + u.id, name, guest: true, client: true, room }; return next();
    }
    const [v, p, sg] = String(req.get("x-gc-guest") || req.query.i || "").split(".");
    if (v !== "g1" || !p || !sg || !eq(sg, sign("g1" + p))) return res.status(401).json({ error: "Lien d’invitation invalide." });
    let d; try { d = JSON.parse(Buffer.from(p, "base64url").toString()); } catch (e) { return res.status(401).json({ error: "Lien d’invitation invalide." }); }
    const inv = await current("rtcinv", d.r);
    if (!inv || inv.exp < Date.now()) return res.status(410).json({ error: "Ce lien a expiré. Demandez-en un nouveau à l’agence." });
    req.inv = inv; req.user = { id: "g:" + d.r, name: "", guest: true, room: d.r }; next();
  }).catch(e => res.status(500).json({ error: "Base indisponible.", detail: String(e.message || e).slice(0, 200) }));
  const staffOnly = (req, res, next) => req.user && (req.user.role === "owner" || (req.user.views || []).includes("commercial")) ? next() : res.status(403).json({ error: "Accès non ouvert pour ton prénom." });
  const guestRoom = (req, res, next) => { if (req.user.guest) { const r = String((req.body && req.body.room) || req.query.room || ""); if (r !== req.user.room) return res.status(403).json({ error: "Salon non autorisé." }); } next(); };
  const hJoin = (req, res) => {
    const room = String((req.body || {}).room || ""); if (!okRoom(room)) return res.status(400).json({ error: "Salon inconnu." });
    const name = req.user.client ? req.user.name : req.user.guest ? (String((req.body || {}).name || "").replace(/\s+/g, " ").trim().slice(0, 40) || "Invité") + " (invité)" : req.user.name;
    const m = roomOf(room), pid = newId();
    const peers = [...m.entries()].map(([id, p]) => ({ pid: id, name: p.name }));
    m.forEach(o => deliver(o, { type: "join", pid, name }));
    m.set(pid, { name, uid: req.user.id, q: [], wait: null, seen: Date.now() });
    res.json({ pid, peers, name });
  };
  const hPoll = (req, res) => {
    const room = String(req.query.room || ""), p = peerOf(req, room, req.query.pid);
    if (!p) return res.json({ gone: true, events: [] });
    p.seen = Date.now();
    const send = () => { if (res.headersSent) return; p.seen = Date.now(); const ev = p.q.splice(0); res.json({ events: ev }); };
    if (p.q.length) return send();
    const w = () => { clearTimeout(t); send(); };
    const t = setTimeout(() => { if (p.wait === w) p.wait = null; send(); }, 25000);
    p.wait = w;
    res.on("close", () => { clearTimeout(t); if (p.wait === w) p.wait = null; });
  };
  const hSignal = (req, res) => {
    const b = req.body || {}, room = String(b.room || ""), p = peerOf(req, room, b.pid);
    if (!p) return res.status(410).json({ error: "Plus dans le salon." });
    p.seen = Date.now();
    const to = RTC.get(room).get(String(b.to || "")); if (to) deliver(to, { type: "signal", from: String(b.pid), data: b.data });
    res.json({ ok: true });
  };
  const hChat = (req, res) => {
    const b = req.body || {}, room = String(b.room || ""), p = peerOf(req, room, b.pid);
    if (!p) return res.status(410).json({ error: "Plus dans le salon." });
    const text = String(b.text || "").trim().slice(0, 2000); if (!text) return res.json({ ok: true });
    const ev = { type: "chat", from: String(b.pid), name: p.name, text, at: new Date().toISOString() };
    RTC.get(room).forEach((o, id) => { if (id !== String(b.pid)) deliver(o, ev); });
    res.json({ ok: true, at: ev.at });
  };
  const hLeave = (req, res) => { const b = req.body || {}, room = String(b.room || ""); if (peerOf(req, room, b.pid)) dropPeer(room, String(b.pid)); res.json({ ok: true }); };
  // Salons privés (« sx… ») : seuls leurs participants les voient et peuvent y entrer
  async function privRooms(u) { const ok = new Set(); for (const r of await db.all("SELECT data FROM docs WHERE col = 'vrooms' AND deleted = 0")) { try { const d = JSON.parse(r.data || "{}"); if ((d.members || []).includes(u.name)) ok.add(d.room); } catch (e) {} } return ok; }
  app.get("/api/rtc/state", auth, wrap(async (req, res) => {
    const mine = [...RTC.keys()].some(r => r.startsWith("sx")) ? await privRooms(req.user) : new Set();
    const rooms = {}; RTC.forEach((m, room) => { if (room.startsWith("sx") && !mine.has(room)) return; rooms[room] = [...new Set([...m.values()].map(p => p.name))]; });
    res.json({ rooms });
  }));
  app.post("/api/rtc/join", auth, wrap(async (req, res) => {
    const room = String((req.body || {}).room || "");
    if (room.startsWith("sx") && !(await privRooms(req.user)).has(room)) return res.status(403).json({ error: "Salon privé : tu n’y participes pas." });
    hJoin(req, res);
  }));
  app.get("/api/rtc/poll", auth, hPoll);
  app.post("/api/rtc/signal", auth, hSignal);
  app.post("/api/rtc/chat", auth, hChat);
  app.post("/api/rtc/leave", auth, hLeave);
  // Salon focus : qui travaille en ce moment, depuis quand, sur quoi. En mémoire, oublié après une minute sans signe de vie.
  const FOCUS = new Map();
  const focusList = () => { const lim = Date.now() - 60000; FOCUS.forEach((v, k) => { if (v.seen < lim) FOCUS.delete(k); }); return [...FOCUS.entries()].map(([name, v]) => ({ name, since: v.since, task: v.task, tool: v.tool, pause: v.pause })); };
  app.get("/api/focus", auth, (req, res) => res.json({ people: focusList() }));
  app.post("/api/focus", auth, (req, res) => {
    if (req.user.preview) return res.status(403).json({ error: "Aperçu en lecture seule." });
    const b = req.body || {}, name = req.user.name;
    if (b.on === false) FOCUS.delete(name);
    else { const cur = FOCUS.get(name); FOCUS.set(name, { since: cur ? cur.since : Date.now(), task: String(b.task != null ? b.task : (cur ? cur.task : "")).trim().slice(0, 120), tool: String(b.tool != null ? b.tool : (cur ? cur.tool : "")).trim().slice(0, 40), pause: !!b.pause, seen: Date.now() }); }
    res.json({ people: focusList() });
  });
  // Invitations
  app.get("/api/rtc/invites", auth, staffOnly, wrap(async (req, res) => {
    const rows = await db.all("SELECT data FROM docs WHERE col = ? AND deleted = 0", ["rtcinv"]);
    const now = Date.now(); res.json({ invites: rows.map(r => JSON.parse(r.data)).filter(x => x.exp > now).sort((a, b) => (b.at || "").localeCompare(a.at || "")).map(x => ({ room: x.room, label: x.label, by: x.by, at: x.at, exp: x.exp, link: "/visio?i=" + x.tok })) });
  }));
  app.post("/api/rtc/invites", auth, staffOnly, wrap(async (req, res) => {
    const label = String((req.body || {}).label || "").trim().slice(0, 80) || "Rendez-vous";
    const days = Math.min(Math.max(Number((req.body || {}).days) || 7, 1), 60);
    const room = "inv" + letters(12), exp = Date.now() + days * 864e5, tok = inviteTok({ r: room, e: exp });
    await put("rtcinv", room, { room, label, by: req.user.name, at: new Date().toISOString(), exp, tok });
    res.json({ room, label, exp, link: "/visio?i=" + tok });
  }));
  app.delete("/api/rtc/invites/:room", auth, staffOnly, wrap(async (req, res) => {
    const room = String(req.params.room || ""); if (!/^inv[a-z]{12}$/.test(room)) return res.status(400).json({ error: "Invitation inconnue." });
    await db.run("UPDATE docs SET deleted = 1, updated_at = ? WHERE col = ? AND id = ?", [stamp(), "rtcinv", room]);
    const m = RTC.get(room); if (m) [...m.keys()].forEach(pid => dropPeer(room, pid));
    res.json({ ok: true });
  }));
  // Côté invité (page /visio, sans compte)
  app.get("/api/rtc/g/info", gauth, (req, res) => res.json({ room: req.inv.room, label: req.inv.label, by: req.inv.by, name: req.inv.name || "", client: !!req.user.client }));
  app.post("/api/rtc/g/join", gauth, guestRoom, hJoin);
  app.get("/api/rtc/g/poll", gauth, guestRoom, hPoll);
  app.post("/api/rtc/g/signal", gauth, guestRoom, hSignal);
  app.post("/api/rtc/g/chat", gauth, guestRoom, hChat);
  app.post("/api/rtc/g/leave", gauth, guestRoom, hLeave);
  app.get(["/visio", "/visio/"], (req, res) => res.sendFile(path.join(root, "public", "visio.html")));

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

  // ---------- Temps réel : la page attend le prochain changement (attente longue), comme une messagerie ----------
  // « en train d’écrire » et « vu » restent en mémoire : ils n’ont de sens que sur le moment.
  const LIVE = { v: 1, waiters: new Set(), typing: new Map(), reads: new Map() };
  function bump() { LIVE.v++; const w = [...LIVE.waiters]; LIVE.waiters.clear(); w.forEach(f => f()); }
  const waitBump = (v, ms) => LIVE.v !== v ? Promise.resolve() : new Promise(ok => { const f = () => { clearTimeout(t); ok(); }; const t = setTimeout(() => { LIVE.waiters.delete(f); ok(); }, ms); LIVE.waiters.add(f); });
  function liveFor(u) {
    const now = Date.now(), typing = {};
    LIVE.typing.forEach((m, ch) => { m.forEach((ts, n) => { if (now - ts > 6000) m.delete(n); else if (n !== u.name && visible(u, "messages", { ch })) (typing[ch] = typing[ch] || []).push(n); }); });
    const reads = {}; LIVE.reads.forEach((m, n) => { if (n === u.name) return; Object.keys(m).forEach(ch => { if (visible(u, "messages", { ch })) (reads[ch] = reads[ch] || {})[n] = m[ch]; }); });
    return { v: LIVE.v, typing, reads, mine: LIVE.reads.get(u.name) || {} };
  }
  app.post("/api/g-typing", auth, wrap(async (req, res) => {
    const ch = String((req.body || {}).ch || "").slice(0, 200); if (!ch || req.user.preview) return res.json({ ok: true });
    if (!LIVE.typing.has(ch)) LIVE.typing.set(ch, new Map());
    const m = LIVE.typing.get(ch), had = m.has(req.user.name);
    if ((req.body || {}).stop) { m.delete(req.user.name); bump(); return res.json({ ok: true }); }
    m.set(req.user.name, Date.now()); if (!had) bump(); res.json({ ok: true });
  }));
  app.post("/api/g-seen", auth, wrap(async (req, res) => {
    const b = req.body || {}, ch = String(b.ch || "").slice(0, 200), at = String(b.at || "").slice(0, 40); if (!ch || !at || req.user.preview) return res.json({ ok: true });
    const m = LIVE.reads.get(req.user.name) || {}; if ((m[ch] || "") < at) { m[ch] = at; LIVE.reads.set(req.user.name, m); bump();
      // gardé en base : le « lu » suit la personne sur tous ses appareils et survit au redémarrage du serveur
      await db.run("DELETE FROM docs WHERE col = ? AND id = ?", ["_reads", req.user.name]);
      await db.run("INSERT INTO docs (col, id, data, deleted, updated_at) VALUES (?,?,?,0,?)", ["_reads", req.user.name, JSON.stringify(m), stamp()]); }
    res.json({ ok: true });
  }));
  // Réaction sur un message (n’importe qui peut réagir, sans pouvoir modifier le texte des autres)
  const REACTS = ["👍","❤️","😂","😮","🙏","🔥"];
  app.post("/api/g-react", auth, wrap(async (req, res) => {
    const b = req.body || {}, id = String(b.id || ""), e = String(b.e || "");
    if (!okId(id) || !REACTS.includes(e) || req.user.preview) return res.status(400).json({ error: "Demande invalide." });
    const cur = await current("messages", id); if (!cur || !visible(req.user, "messages", cur)) return res.status(404).json({ error: "Message introuvable." });
    const re = Object.assign({}, cur.re || {}), who = req.user.name;
    Object.keys(re).forEach(k => { re[k] = (re[k] || []).filter(n => n !== who); if (!re[k].length) delete re[k]; });
    if (!((cur.re || {})[e] || []).includes(who)) re[e] = (re[e] || []).concat(who);
    await put("messages", id, Object.assign({}, cur, { re })); res.json({ ok: true, re });
  }));

  // ---------- Données ----------
  // Tout ce qui a changé depuis « since » (premier appel : tout), filtré selon le rôle.
  // Avec wait=1, la réponse attend le prochain changement (25 s au plus) : les messages arrivent tout de suite.
  app.get("/api/g/changes", auth, wrap(async (req, res) => {
    if (req.query.wait === "1" && req.query.since) await waitBump(Number(req.query.v) || 0, 25000);
    const since = String(req.query.since || "");
    const now = stamp(), u = req.user;
    const rows = since
      ? await db.all("SELECT col, id, data, deleted, updated_at FROM docs WHERE updated_at >= ?", [since])
      : await db.all("SELECT col, id, data, deleted, updated_at FROM docs WHERE deleted = 0");
    const docs = [];
    for (const r of rows) {
      if (r.col.startsWith("_")) continue;
      if (!canRead(u, r.col) || r.col === "game" || r.col === "gmail") continue;
      if (Number(r.deleted)) { docs.push({ col: r.col, id: r.id, deleted: true, data: null }); continue; }
      const d = JSON.parse(r.data || "{}");
      if (r.col === "clients" && u.role !== "owner") { const keep = {}; ["name", "color", "title", "calendar", "leadWeeks", "recap", "logo"].forEach(k => { if (d[k] != null) keep[k] = d[k]; }); docs.push({ col: r.col, id: r.id, deleted: false, data: keep }); continue; }
      if (visible(u, r.col, d)) docs.push({ col: r.col, id: r.id, deleted: false, data: d });
      else if (since) docs.push({ col: r.col, id: r.id, deleted: true, data: null }); // n'est plus visible (réattribué...)
    }
    res.json({ now, full: !since, docs, live: liveFor(u) });
  }));

  async function put(col, id, data) {
    const s = JSON.stringify(data || {});
    if (s.length > 200000) throw Object.assign(new Error("Document trop gros."), { status: 400 });
    const t = stamp();
    const r = await db.run("UPDATE docs SET data = ?, deleted = 0, updated_at = ? WHERE col = ? AND id = ?", [s, t, col, id]);
    if (!r.changes) await db.run("INSERT INTO docs (col, id, data, deleted, updated_at) VALUES (?,?,?,0,?)", [col, id, s, t]);
    bump();
  }
  const current = async (col, id) => { const r = await db.one("SELECT data FROM docs WHERE col = ? AND id = ? AND deleted = 0", [col, id]); return r ? JSON.parse(r.data || "{}") : null; };
  const refuse = (res, msg) => res.status(403).json({ error: msg });

  // ---------- Tableaux de suivi Meta lus directement dans Google Sheets (compte de service), toutes les 10 minutes ----------
  const putBig = async (col, id, data) => { const s = JSON.stringify(data || {}); if (s.length > 1500000) return; const t = stamp();
    const r = await db.run("UPDATE docs SET data = ?, deleted = 0, updated_at = ? WHERE col = ? AND id = ?", [s, t, col, id]);
    if (!r.changes) await db.run("INSERT INTO docs (col, id, data, deleted, updated_at) VALUES (?,?,?,0,?)", [col, id, s, t]); };
  const GS = require("./gsheets")({ db, put: putBig, current, stamp, bump: () => bump() });
  app.get("/api/g-gsheets", auth, ownerOnly, wrap(async (req, res) => { const k = GS.sa(), key = await GS.pushKey(), cfg = await GS.cfg(); delete cfg.pushKey;
    res.json({ configured: !!k || !!cfg.lastPush, email: k ? k.client_email : "", pushKey: key, cfg }); }));
  // Réception du script Google de l'agence (clé générée par l'appli, montrée dans Paramètres > Liaisons)
  // Jumelage : pendant 15 min après « Jumeler » (Paramètres > Liaisons), le premier appel sans clé reçoit la clé et la garde dans le script
  let pairUntil = 0;
  app.post("/api/g-gsheets/pair", auth, ownerOnly, wrap(async (req, res) => { pairUntil = Date.now() + 15 * 60000; res.json({ ok: true, until: new Date(pairUntil).toISOString() }); }));
  app.post("/api/hook/gsheet", wrap(async (req, res) => {
    await ensure(); const key = await GS.pushKey(), got = String(req.get("x-gacolet-key") || req.query.key || "");
    if (!got && Date.now() < pairUntil) { pairUntil = 0; return res.json({ pairKey: key }); }
    if (got.length !== key.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(key))) return res.status(401).json({ error: "Clé refusée." });
    res.json(await GS.push(req.body));
  }));
  app.put("/api/g-keys/gsheets", auth, ownerOnly, wrap(async (req, res) => {
    let k; try { k = JSON.parse(String((req.body || {}).json || "")); } catch (e) { return res.status(400).json({ error: "Ce n’est pas un fichier de clé JSON valide." }); }
    if (!k || k.type !== "service_account" || !k.client_email || !/BEGIN PRIVATE KEY/.test(k.private_key || "")) return res.status(400).json({ error: "Il faut la clé JSON d’un compte de service Google (type « service_account »)." });
    const ENV = path.join(root, ".env"); let txt = ""; try { txt = fs.readFileSync(ENV, "utf8"); } catch (e) {}
    const b64 = Buffer.from(JSON.stringify(k)).toString("base64");
    txt = txt.split("\n").filter(l => l && !/^GSHEETS_SA_B64=/.test(l)).join("\n") + "\nGSHEETS_SA_B64='" + b64 + "'\n";
    fs.writeFileSync(ENV, txt.replace(/^\n+/, ""), { mode: 0o600 }); process.env.GSHEETS_SA_B64 = b64;
    const out = await GS.run(true); res.json({ ok: true, email: k.client_email, out });
  }));
  app.post("/api/g-gsheets/run", auth, ownerOnly, wrap(async (req, res) => {
    if (GS.sa()) return res.json(await GS.run(true));
    const c = await GS.cfg(); Object.values(c.files || {}).forEach(e => { e.resend = true; }); await putBig("_msources", "cfg", c);
    res.json({ files: 0, errors: [], queued: true });
  }));
  app.put("/api/g-gsheets/file/:id", auth, ownerOnly, wrap(async (req, res) => {
    const id = String(req.params.id); if (!/^[\w-]{10,80}$/.test(id)) return res.status(400).json({ error: "Demande invalide." });
    const c = await GS.cfg(), e = c.files[id]; if (!e) return res.status(404).json({ error: "Fichier inconnu." });
    const b = req.body || {}; if (b.client != null) e.client = String(b.client).trim().slice(0, 120); if (b.off != null) e.off = !!b.off; e.modified = ""; e.resend = true;
    if (e.off || !e.client) { for (const r of await db.all("SELECT id FROM docs WHERE col = 'msheets' AND deleted = 0 AND id LIKE ?", ["gs_" + id + "%"])) await db.run("UPDATE docs SET deleted = 1, data = '{}', updated_at = ? WHERE col = 'msheets' AND id = ?", [stamp(), r.id]); bump(); }
    await putBig("_msources", "cfg", c); res.json({ ok: true, out: e.off || !e.client || !GS.sa() ? null : await GS.run(false) });
  }));

  // Tâche avec une date de publication (postDate) : le post apparaît tout seul dans le calendrier éditorial du client
  // (agenda, type Éditorial, filtre Client). Un post par tâche (id « post-<id de la tâche> ») ; date retirée ou tâche supprimée = post annulé.
  const isoDay = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || ""));
  const postTitle = t => { const x = String(t || "").trim().replace(/^(monter|faire|pr[ée]parer|cr[ée]er|r[ée]aliser|tourner|[ée]crire|r[ée]diger|exporter|finir|terminer|finaliser)\s+(le |la |les |l[’']|un |une |des |du )?/i, "");
    return "Publication : " + ((x.charAt(0).toUpperCase() + x.slice(1)) || "à préciser"); };
  async function syncPost(taskId, t, by) {
    const evId = "post-" + taskId;
    if (!okId(evId)) return;
    const ev = await current("events", evId), now = stamp();
    if (t && isoDay(t.postDate) && String(t.client || "").trim()) {
      const keep = ev || {};
      await put("events", evId, Object.assign({}, keep, {
        client: String(t.client).trim(), type: "Éditorial", title: postTitle(t.title), date: t.postDate,
        time: keep.time || "", who: t.who && t.who !== "À attribuer" ? [t.who] : (keep.who || []),
        status: keep.status && keep.status !== "Annulé" ? keep.status : "Prévu", place: keep.place || "",
        note: keep.note || ("Date de publication fixée dans la tâche" + (t.date ? " (à rendre le " + t.date.split("-").reverse().join("/") + ")" : "") + "."),
        files: keep.files || [], fromTask: taskId,
        createdAt: keep.createdAt || now, createdBy: keep.createdBy || by || "", updatedAt: now, updatedBy: by || "" }));
    } else if (ev && ev.status !== "Annulé") {
      await put("events", evId, Object.assign({}, ev, { status: "Annulé", updatedAt: now, updatedBy: by || "" }));
    }
  }
  // Et dans l'autre sens : le post déplacé dans l'agenda remet sa date dans la tâche.
  async function syncTaskDate(ev, by) {
    if (!ev || !ev.fromTask || !isoDay(ev.date) || ev.status === "Annulé") return;
    const t = await current("tasks", ev.fromTask);
    if (t && t.postDate !== ev.date) await put("tasks", ev.fromTask, Object.assign({}, t, { postDate: ev.date, updatedAt: stamp(), updatedBy: by || "" }));
  }
  const afterTask = (col, id, d, u) => (col === "tasks" ? syncPost(id, d, u && u.name) : col === "events" ? syncTaskDate(d, u && u.name) : Promise.resolve()).catch(e => console.error("syncPost", e));

  // Créer ou remplacer
  app.put("/api/g/:col/:id", auth, wrap(async (req, res) => {
    const { col, id } = req.params;
    if (!okCol(col) || !okId(id)) return res.status(400).json({ error: "Demande invalide." });
    const data = (req.body && req.body.data) || {};
    const before = await current(col, id);
    const no = allowed(req.user, col, before, data, null); if (no) return refuse(res, no);
    await put(col, id, data);
    await afterTask(col, id, data, req.user);
    res.json({ ok: true, id });
    if (col === "messages" && !before) pushMsg(data).catch(() => {});
  }));
  app.post("/api/g/:col", auth, wrap(async (req, res) => {
    const col = req.params.col;
    if (!okCol(col)) return res.status(400).json({ error: "Demande invalide." });
    const data = (req.body && req.body.data) || {};
    const no = allowed(req.user, col, null, data, null); if (no) return refuse(res, no);
    const id = newId();
    await put(col, id, data);
    await afterTask(col, id, data, req.user);
    res.json({ ok: true, id });
    if (col === "messages") pushMsg(data).catch(() => {});
  }));
  // ---------- Listes d’appels du Commercial (annuaire public ou Google Maps) ----------
  // Recherche d'entreprises dans l'annuaire public de l'État (recherche-entreprises.api.gouv.fr, gratuit, sans clé) :
  // activité (codes NAF), zone (départements ou codes postaux), taille ; les entreprises déjà dans l'appli sont écartées.
  const nk = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  // Recherche Google Maps (Places API, clé GOOGLE_PLACES_KEY) : nom, adresse, téléphone, site, note Google ; 60 résultats au plus par recherche
  async function placesSearch(text, want, known) {
    const key = process.env.GOOGLE_PLACES_KEY; if (!key) throw Object.assign(new Error("Clé Google Maps absente : ajoute-la dans Paramètres > Liaisons."), { status: 400 });
    const out = [], seen = new Set(); let token = "";
    for (let i = 0; i < 3 && out.length < want; i++) {
      const body = { textQuery: text, languageCode: "fr", regionCode: "FR", pageSize: 20 }; if (token) body.pageToken = token;
      const r = await fetch("https://places.googleapis.com/v1/places:searchText", { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.rating,places.userRatingCount,places.businessStatus,nextPageToken" }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error("Google Maps refuse la recherche : " + ((j.error && j.error.message) || r.status)), { status: 502 });
      for (const p of j.places || []) { if (p.businessStatus && p.businessStatus !== "OPERATIONAL") continue;
        const name = ((p.displayName && p.displayName.text) || "").trim(), k = nk(name); if (!name || known.has(k) || seen.has(k)) continue; seen.add(k);
        const addr = p.formattedAddress || "", city = (addr.match(/\d{5}\s+([^,]+)/) || [])[1] || "";
        out.push({ company: name, phone: p.nationalPhoneNumber || "", city, address: addr.replace(/,\s*France$/, ""), web: p.websiteUri || "", rating: p.rating ? String(p.rating).replace(".", ",") + " (" + (p.userRatingCount || 0) + " avis)" : "" });
        if (out.length >= want) break; }
      token = j.nextPageToken || ""; if (!token) break;
    }
    return out;
  }
  app.get("/api/g-callsearch", auth, wrap(async (req, res) => {
    const no = allowed(req.user, "commercial", null, { kind: "Appel", owner: req.user.name }, null); if (no) return refuse(res, no);
    // Recherche unique « au mieux » : Google Maps si la clé est là (téléphones, sites, avis), sinon l'annuaire de l'État.
    // « where » accepte des villes ou des départements, traduits pour chaque source (geo.api.gouv.fr).
    if (req.query.where != null && !req.query.src) {
      const parts = String(req.query.where || "").split(/[,;]+/).map(x => x.trim()).filter(Boolean).slice(0, 6);
      if (!parts.length) return res.status(400).json({ error: "Indique où chercher : une ville ou un département." });
      const geo = async u => { try { const r = await fetch("https://geo.api.gouv.fr/" + u); return r.ok ? r.json() : null; } catch (e) { return null; } };
      if (process.env.GOOGLE_PLACES_KEY) {
        const names = []; for (const x of parts) { if (/^(\d{2}|2[AB])$/i.test(x)) { const d = await geo("departements/" + x.toUpperCase()); names.push(d && d.nom ? d.nom : x); } else if (/^\d{5}$/.test(x)) { const c = await geo("communes?codePostal=" + x + "&fields=nom&limit=1"); names.push(c && c[0] ? c[0].nom : x); } else names.push(x); }
        req.query.src = "google"; req.query.where = names.join(","); req.query.what = String(req.query.what || req.query.label || "").trim();
      } else {
        const zone = []; for (const x of parts) { if (/^(\d{2}|2[AB]|\d{5})$/i.test(x)) zone.push(x); else { const c = await geo("communes?nom=" + encodeURIComponent(x) + "&fields=codesPostaux&boost=population&limit=1"); if (c && c[0]) zone.push(...(c[0].codesPostaux || []).slice(0, 6)); } }
        if (!zone.length) return res.status(400).json({ error: "Je ne trouve pas « " + parts.join(", ") + " »." });
        req.query.zone = zone.join(","); req.query.size = req.query.size || "1";
      }
    }
    if (req.query.src === "google") {
      const what = String(req.query.what || "").trim().slice(0, 80), where = String(req.query.where || "").split(/[,;]+/).map(x => x.trim()).filter(Boolean).slice(0, 5);
      if (!what || !where.length) return res.status(400).json({ error: "Indique quoi chercher et où (une ou plusieurs villes)." });
      const want = Math.max(1, Math.min(150, Number(req.query.n) || 30));
      const known = new Set((await db.all("SELECT data FROM docs WHERE col IN ('commercial','clients') AND deleted = 0")).map(r => { try { const d = JSON.parse(r.data); return nk(d.company || d.name); } catch (e) { return ""; } }).filter(Boolean));
      try { let rows = []; for (const w of where) { if (rows.length >= want) break; const got = await placesSearch(what + " " + w, want - rows.length, known); got.forEach(x => known.add(nk(x.company))); rows = rows.concat(got); }
        return res.json({ total: rows.length, rows, src: "google" }); }
      catch (e) { return res.status(e.status || 500).json({ error: e.message }); }
    }
    const naf = String(req.query.naf || "").split(",").map(x => x.trim()).filter(x => /^\d{2}\.\d{2}[A-Z]$/.test(x)).slice(0, 12).join(",");
    const q = String(req.query.q || "").trim().slice(0, 60), zone = String(req.query.zone || "").split(/[\s,;]+/).filter(Boolean).slice(0, 10);
    const deps = zone.filter(z => /^(\d{2}|2[AB]|97\d)$/i.test(z)), cps = zone.filter(z => /^\d{5}$/.test(z));
    const want = Math.max(1, Math.min(150, Number(req.query.n) || 30)), size = String(req.query.size || "");
    if (!naf && !q) return res.status(400).json({ error: "Choisis un domaine ou un mot-clé." });
    if (!deps.length && !cps.length) return res.status(400).json({ error: "Indique la zone : un département (30) ou des codes postaux (30000, 30900)." });
    const sizes = { "1": "01,02,03,11,12,21,22,31,32", "3": "02,03,11,12,21,22,31,32", "10": "11,12,21,22,31,32", "0": "" }[size] || "";
    const known = new Set((await db.all("SELECT data FROM docs WHERE col IN ('commercial','clients') AND deleted = 0")).map(r => { try { const d = JSON.parse(r.data); return nk(d.company || d.name); } catch (e) { return ""; } }).filter(Boolean));
    const out = [], seen = new Set(); let page = 1, pages = 1, total = 0;
    while (out.length < want && page <= pages && page <= 12) {
      const p = new URLSearchParams({ per_page: "25", page: String(page), etat_administratif: "A" });
      if (naf) p.set("activite_principale", naf); if (q) p.set("q", q); if (deps.length) p.set("departement", deps.join(",")); if (cps.length) p.set("code_postal", cps.join(","));
      if (sizes) { p.set("tranche_effectif_salarie", sizes); p.set("caractere_employeur", "O"); }
      const r = await fetch("https://recherche-entreprises.api.gouv.fr/search?" + p, { headers: { Accept: "application/json" } });
      if (r.status === 429) { await new Promise(ok => setTimeout(ok, 1200)); continue; }
      if (!r.ok) return res.status(502).json({ error: "L’annuaire des entreprises ne répond pas (" + r.status + "). Réessaie dans un instant." });
      const j = await r.json(); pages = j.total_pages || 1; total = j.total_results || 0; page++;
      for (const e of j.results || []) {
        const nafs = naf ? naf.split(",") : null;
        const et = (e.matching_etablissements || []).find(x => x.etat_administratif === "A" && (!nafs || nafs.includes(x.activite_principale)) && (!deps.length || deps.some(d => String(x.code_postal || "").startsWith(d))) && (!cps.length || cps.includes(String(x.code_postal || "")))) || null;
        if (!et) continue;
        if ((e.nombre_etablissements_ouverts || 1) > 5) continue; // les chaînes et grands groupes ne sont pas la cible
        const ens = (et.liste_enseignes || []).find(x => x && !/code interne|^\W*\d+\W*$/i.test(x));
        const name = (ens || e.nom_raison_sociale || e.nom_complet || "").replace(/\s+/g, " ").trim(), key = nk(name);
        if (!name || known.has(key) || seen.has(key)) continue; seen.add(key);
        const pp = (e.dirigeants || []).filter(d => d.type_dirigeant === "personne physique" && !/commissaire|suppl/i.test(d.qualite || ""));
        const dir = pp.find(d => /g[ée]rant|pr[ée]sident|directeur|exploitant/i.test(d.qualite || "")) || pp[0];
        const cap = t => String(t || "").toLowerCase().replace(/(^|[\s'-])\S/g, m => m.toUpperCase());
        out.push({ company: cap(name), city: cap(et.libelle_commune), address: cap(et.adresse), cp: et.code_postal || "", contact: dir ? cap(String(dir.prenoms || "").split(" ")[0] + " " + (dir.nom || "")) + (dir.qualite ? " (" + dir.qualite + ")" : "") : "",
          activity: et.activite_principale || e.activite_principale || "", siren: e.siren || "", staff: e.tranche_effectif_salarie || "", since: e.date_creation || "" });
        if (out.length >= want) break;
      }
    }
    res.json({ total, rows: out });
  }));
  // Créer une liste (lignes « Appel » du Commercial), changer son commercial, la renommer ou la supprimer, en une fois
  app.post("/api/g-calllist", auth, wrap(async (req, res) => {
    const b = req.body || {}, name = String(b.name || "").trim().slice(0, 80), full = req.user.role === "owner";
    const owner = full ? String(b.owner || req.user.name).trim().slice(0, 40) : req.user.name;
    const no = allowed(req.user, "commercial", null, { kind: "Appel", owner }, null); if (no) return refuse(res, no);
    if (!name) return res.status(400).json({ error: "Donne un nom à la liste." });
    const mine = async () => (await db.all("SELECT id, data FROM docs WHERE col = 'commercial' AND deleted = 0")).map(r => { let d = {}; try { d = JSON.parse(r.data); } catch (e) {} return { id: r.id, d }; })
      .filter(x => x.d.kind === "Appel" && x.d.list === name && (full || x.d.owner === req.user.name));
    const act = String(b.action || "create");
    if (act === "create") {
      const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 300); let n = 0; const st = String(b.stamp || "").slice(0, 40);
      const S2 = (v, k) => String(v == null ? "" : v).trim().slice(0, k);
      for (const r of rows) { const company = S2(r.company, 120); if (!company) continue;
        // Numéro manquant (liste de l'annuaire) : cherché sur Google Maps quand la clé est là
        if (!r.phone && process.env.GOOGLE_PLACES_KEY) { try { const g = await placesSearch(company + " " + (r.address || r.city || ""), 1, new Set()); if (g[0] && g[0].phone) { r.phone = g[0].phone; r.web = r.web || g[0].web; r.rating = r.rating || g[0].rating; } } catch (e) {} }
        await put("commercial", newId(), { kind: "Appel", list: name, owner, company, phone: S2(r.phone, 40), web: S2(r.web, 200), rating: S2(r.rating, 40), city: S2(r.city, 80), address: S2(r.address, 200), contact: S2(r.contact, 120), activity: S2(r.activity, 20), siren: S2(r.siren, 12), notes: S2(r.notes, 1000), target: S2(b.target, 300), callStatus: "", createdAt: stamp(), createdBy: req.user.name, order: 999 }); n++; }
      bump(); return res.json({ ok: true, n });
    }
    const list = await mine(); if (!list.length) return res.status(404).json({ error: "Liste vide ou introuvable." });
    for (const x of list) {
      if (act === "delete") await db.run("UPDATE docs SET deleted = 1, data = '{}', updated_at = ? WHERE col = 'commercial' AND id = ?", [stamp(), x.id]);
      else if (act === "owner") await put("commercial", x.id, Object.assign(x.d, { owner }));
      else if (act === "rename") { const nn = String(b.to || "").trim().slice(0, 80); if (!nn) return res.status(400).json({ error: "Nouveau nom vide." }); await put("commercial", x.id, Object.assign(x.d, { list: nn })); }
    }
    bump(); res.json({ ok: true, n: list.length });
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
    await afterTask(col, id, next, req.user);
    res.json({ ok: true });
  }));
  app.delete("/api/g/:col/:id", auth, wrap(async (req, res) => {
    const { col, id } = req.params;
    if (!okCol(col) || !okId(id)) return res.status(400).json({ error: "Demande invalide." });
    const cur = await current(col, id);
    if (cur) { const no = allowed(req.user, col, cur, null, null); if (no) return refuse(res, no); }
    // Corbeille : le contenu est gardé 30 jours pour pouvoir le restaurer (sauf les messages, effacés pour de bon)
    if (col === "messages") await db.run("UPDATE docs SET deleted = 1, data = '{}', updated_at = ? WHERE col = ? AND id = ?", [stamp(), col, id]);
    else await db.run("UPDATE docs SET deleted = 1, updated_at = ? WHERE col = ? AND id = ?", [stamp(), col, id]);
    if (cur) await afterTask(col, id, null, req.user);
    res.json({ ok: true }); bump();
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
  // Envois en cours : une mise en ligne attend qu'ils soient finis avant de redémarrer le serveur (un dépôt ne doit jamais être coupé)
  let UPLOADS = 0;
  app.use("/api/g-upload", (req, res, next) => { UPLOADS++; let d = false; const end = () => { if (!d) { d = true; UPLOADS--; } }; res.on("finish", end); res.on("close", end); next(); });
  global.gcUploads = () => UPLOADS;
  app.post("/api/g-upload", auth, up.single("file"), (req, res) => {
    const f = req.file;
    if (!f) return res.status(400).json({ error: "Aucun fichier reçu." });
    res.json({ id: f.filename, url: "/f/" + f.filename, contentType: f.mimetype, sizeBytes: f.size });
  });
  // Envoi en morceaux (8 Mo) : chaque morceau est ajouté au fichier en cours ; un envoi coupé reprend là où il s'était arrêté
  const rawBody = require("express").raw({ type: () => true, limit: "12mb" });
  const partOf = id => path.join(DIR, id + ".part");
  app.get("/api/g-upload-chunk/:id", auth, (req, res) => {
    const id = String(req.params.id); if (!/^[a-f0-9]{32}$/.test(id)) return res.status(400).json({ error: "Envoi inconnu." });
    let size = 0; try { size = fs.statSync(partOf(id)).size; } catch (e) {} res.json({ size });
  });
  app.post("/api/g-upload-chunk/:id", auth, (req, res, next) => { UPLOADS++; let d = false; const end = () => { if (!d) { d = true; UPLOADS--; } }; res.on("finish", end); res.on("close", end); next(); }, rawBody, (req, res) => {
    const id = String(req.params.id), off = Number(req.query.off), total = Number(req.query.total);
    const ext = String(req.query.ext || "").toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 8), type = String(req.query.type || "").slice(0, 100);
    if (!/^[a-f0-9]{32}$/.test(id) || !Number.isInteger(off) || off < 0 || !Number.isInteger(total) || total <= 0 || total > 2 * 1024 * 1024 * 1024 || !Buffer.isBuffer(req.body)) return res.status(400).json({ error: "Morceau invalide." });
    const f = partOf(id); let size = 0; try { size = fs.statSync(f).size; } catch (e) {}
    if (off > size) return res.status(409).json({ error: "Morceau manquant.", size });
    if (off < size) fs.truncateSync(f, off);
    fs.appendFileSync(f, req.body); size = off + req.body.length;
    if (size < total) return res.json({ size });
    if (size > total) { fs.unlinkSync(f); return res.status(400).json({ error: "Taille incorrecte, recommence l’envoi." }); }
    const name = id + (ext && ext !== "." ? ext : ""); fs.renameSync(f, path.join(DIR, name));
    res.json({ size, id: name, url: "/f/" + name, contentType: type, sizeBytes: size });
  });
  // Morceaux abandonnés depuis plus de 2 jours : supprimés
  setInterval(() => { try { const lim = Date.now() - 2 * 86400000; fs.readdirSync(DIR).filter(n => n.endsWith(".part")).forEach(n => { const p = path.join(DIR, n); if (fs.statSync(p).mtimeMs < lim) fs.unlinkSync(p); }); } catch (e) {} }, 6 * 3600000).unref();
  app.get("/f/:name", (req, res) => {
    const n = path.basename(req.params.name);
    if (!/^[a-f0-9]{32}(\.[a-z0-9]{1,7})?$/.test(n)) return res.status(404).end();
    res.sendFile(path.join(DIR, n), err => { if (err && !res.headersSent) res.status(404).end(); });
  });

  // ---------- Espace client : accueil, validations, groupe de discussion avec l’agence, idées et médias ----------
  // Le client se connecte avec son code (jeton de la table users). Il ne voit que le groupe « cg:<id du client> »
  // et ses propres idées. Les échanges internes de l’équipe sur ce client (« c:<nom> ») restent invisibles pour lui.
  const cauth = (req, res, next) => (async () => {
    await ensure();
    const t = String(req.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const u = t && !t.startsWith("retire-") ? await db.one("SELECT * FROM users WHERE token = ?", [t]) : null;
    if (!u) return res.status(401).json({ error: "Session expirée. Saisissez à nouveau votre code." });
    const c = await db.one("SELECT * FROM clients WHERE id = ? AND active = 1", [u.client_id]);
    if (!c) return res.status(401).json({ error: "Compte désactivé. Contactez l’agence." });
    if (u.email === PREVIEW_MAIL && req.method !== "GET") return res.status(403).json({ error: "Aperçu de l’agence : lecture seule, rien n’est envoyé." });
    req.cu = u; req.cl = c; const cap = x => { x = String(x || "").trim(); return x.charAt(0).toUpperCase() + x.slice(1); };
    req.cname = (cap(u.prenom) + " " + cap(u.nom)).trim() || c.name; next();
  })().catch(e => { console.error(e); res.status(500).json({ error: "Erreur du serveur." }); });
  const cgOf = c => "cg:" + c.id;
  const visioRoom = id => "visio" + String(id).split("").map(x => "abcdefghij"[Number(x)]).join("");
  async function clientChOk(c, ch) {
    ch = String(ch || "");
    if (ch === "cg:" + c.id || ch === "tg:cg:" + c.id) return true;
    const m = ch.match(/^cdm:(\d+)\|(.{1,80})$/);
    return !!(m && Number(m[1]) === c.id && await db.one("SELECT id FROM gusers WHERE name = ? AND disabled = 0", [m[2]]));
  }
  const cleanFiles = a => (Array.isArray(a) ? a : []).slice(0, 10).filter(f => f && /^\/f\/[a-f0-9]{32}(\.[a-z0-9]{1,7})?$/.test(String(f.url || "")))
    .map(f => ({ url: String(f.url), name: String(f.name || "").slice(0, 160), type: String(f.type || "").slice(0, 80), size: Number(f.size) || 0 }));
  async function docsLike(col, needle) {
    const rows = await db.all("SELECT id, data FROM docs WHERE col = ? AND deleted = 0 AND data LIKE ?", [col, "%" + needle + "%"]);
    return rows.map(r => { let d = {}; try { d = JSON.parse(r.data || "{}"); } catch (e) {} return Object.assign({ id: r.id }, d); });
  }
  app.get("/api/c/feed", cauth, wrap(async (req, res) => {
    const c = req.cl, ch = cgOf(c);
    const mine = m => m.ch === ch || m.ch === "tg:" + ch || String(m.ch || "").startsWith("cdm:" + c.id + "|");
    const raw = [].concat(await docsLike("messages", '"ch":"' + ch + '"'), await docsLike("messages", '"ch":"tg:' + ch + '"'), await docsLike("messages", '"ch":"cdm:' + c.id + '|'));
    const messages = raw.filter(mine).filter((m, i, a) => a.findIndex(x => x.id === m.id) === i).sort((a, b) => String(a.at || "").localeCompare(String(b.at || ""))).slice(-1500);
    const idees = (await docsLike("idees", '"cid":' + c.id)).filter(i => Number(i.cid) === c.id).sort((a, b) => String(b.at || "").localeCompare(String(a.at || "")));
    const team = (await db.all("SELECT name, role, info FROM gusers WHERE disabled = 0 ORDER BY created_at")).map(r => { const i = infoOf(r); return { name: r.name, role: r.role, avatar: i.avatar || "", poste: i.poste || "" }; });
    const vr = visioRoom(c.id), here = RTC.has(vr) ? [...new Set([...RTC.get(vr).values()].map(p => p.name))] : [];
    const bill = await current("billing", "c" + c.id), billing = bill ? { plan: bill.plan || null, docs: bill.docs || [] } : { plan: null, docs: [] };
    const shoots = (await docsLike("shoots", '"sentAt":"')).filter(s => s.sentAt && sameName(s.client, c.name)).map(shootForClient).sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    const bilans = (await db.all("SELECT data FROM docs WHERE col = '_bilans' AND deleted = 0 AND id LIKE ?", ["c" + c.id + "-%"])).map(r => { try { const d = JSON.parse(r.data || "{}"); return d.sent && Number(d.cid) === c.id ? { m: d.month, at: d.sent.at } : null; } catch (e) { return null; } }).filter(Boolean).sort((a, b) => b.m.localeCompare(a.m));
    res.json({ bilans, visio: { room: vr, here }, me: { name: req.cname, prenom: req.cname.split(" ")[0], entreprise: req.cu.entreprise }, client: { name: c.name, id: c.id }, preview: req.cu.email === PREVIEW_MAIL, messages, idees, team, billing, shoots });
  }));
  app.get("/api/c/bilan/:m", cauth, wrap(async (req, res) => { const m = String(req.params.m); if (!okMonth(m)) return res.status(400).json({ error: "Demande invalide." });
    const d = await current("_bilans", bilanId(req.cl.id, m)); if (!d || !d.sent || Number(d.cid) !== req.cl.id) return res.status(404).json({ error: "Bilan introuvable." });
    res.json({ m, at: d.sent.at, html: d.sent.html }); }));
  // ---------- Feuilles de tournage envoyées au client : il valide, demande des changements ou refuse, comme une publication ----------
  const normName = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const sameName = (a, b) => !!normName(a) && normName(a) === normName(b);
  const shootForClient = s => {
    const it = v => ({ kind: v.kind, title: v.title || "", line: v.line || "", links: v.kind === "photo" ? "" : (v.links || ""), files: v.kind === "photo" ? [] : cleanFiles(v.files) });
    return { id: s.id, date: s.date || "", time: s.time || "", duration: s.duration || "", place: s.place || "", onCamera: s.onCamera || "", num: s.num || "",
      videos: (s.videos || []).map(it), photos: (s.photos || []).map(it), broll: s.broll || "", rules: s.rules || "",
      sentAt: s.sentAt, status: ["ok", "mod", "no"].includes(s.clientStatus) ? s.clientStatus : "wait", note: s.clientNote || "", decidedBy: s.clientBy || "", decidedAt: s.clientAt || "" };
  };
  app.post("/api/c/shoot", cauth, wrap(async (req, res) => {
    if (req.cu.email === PREVIEW_MAIL) return res.status(403).json({ error: "Aperçu en lecture seule." });
    const b = req.body || {}, id = String(b.id || ""), status = String(b.status || ""), note = String(b.note || "").trim().slice(0, 4000);
    if (!okId(id) || !["ok", "mod", "no"].includes(status)) return res.status(400).json({ error: "Demande invalide." });
    if (status !== "ok" && !note) return res.status(400).json({ error: "Expliquez ce qu’il faut changer." });
    const cur = await current("shoots", id);
    if (!cur || !cur.sentAt || !sameName(cur.client, req.cl.name)) return res.status(404).json({ error: "Feuille introuvable." });
    const at = new Date().toISOString();
    await put("shoots", id, Object.assign({}, cur, { clientStatus: status, clientNote: status === "ok" ? "" : note, clientBy: req.cname, clientAt: at, updatedAt: at, updatedBy: req.cname }));
    const when = cur.date ? " du " + cur.date.split("-").reverse().join("/") : "";
    const text = (status === "ok" ? "Feuille de tournage" + when + " validée." : status === "mod" ? "Changements demandés sur la feuille de tournage" + when + " :\n" + note : "Feuille de tournage" + when + " refusée :\n" + note);
    const msg = { ch: cgOf(req.cl), text, who: req.cname, ext: 1, at };
    await put("messages", newId(), msg); pushMsg(msg, req.cl).catch(() => {});
    res.json({ ok: true });
  }));
  // ---------- Bilan mensuel d'un client : calculé à partir de ce que l'appli sait déjà, complété par l'agence. INTERNE : sert à Gabriel pour faire le point avec le client, jamais affiché dans l'espace client ----------
  const { fetchMonth } = require("./metricool");
  const okMonth = m => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(m || ""));
  const prevMonth = m => { const [y, mo] = m.split("-").map(Number), d = new Date(y, mo - 2, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
  async function bilanData(cid, month, noPrev) {
    // « b<id> » : client sans espace client, calculé directement à partir de sa marque Metricool
    let c; if (/^b\d+$/.test(String(cid))) { const pp = PUB_PLAN.find(x => x[1] === String(cid).slice(1)); if (!pp) return null; c = { id: cid, name: pp[0], modules: "com", metricool_blog_id: pp[1] }; }
    else c = await db.one("SELECT * FROM clients WHERE id = ?", [cid]); if (!c) return null;
    const mods = String(c.modules || "com").split(",");
    let posts = [], postsError = "";
    if (mods.includes("com") && c.metricool_blog_id) { try { posts = await fetchMonth(c.metricool_blog_id, month); } catch (e) { postsError = "Planning Metricool indisponible."; } }
    else if (mods.includes("com")) postsError = "Pas de compte Metricool relié à ce client.";
    const nets = {}; posts.forEach(p => String(p.net || "").split(", ").filter(Boolean).forEach(n => { nets[n] = (nets[n] || 0) + 1; }));
    const types = {}; posts.forEach(p => { types[p.type] = (types[p.type] || 0) + 1; });
    const decs = await db.all("SELECT post_id, status FROM decisions WHERE client_id = ? AND post_date LIKE ? ORDER BY id", [cid, month + "%"]);
    const lastDec = {}; decs.forEach(d => { lastDec[d.post_id] = d.status; });
    const vals = Object.values(lastDec);
    let meta = null;
    if (mods.includes("meta")) {
      const ls = await db.all("SELECT date, title, qualified FROM leads WHERE client_id = ? AND date LIKE ? ORDER BY date", [cid, month + "%"]);
      meta = { total: ls.length, qualified: ls.filter(l => Number(l.qualified) === 1).length, rejected: ls.filter(l => Number(l.qualified) === 0).length, goal: Number(c.contacts_goal) || 0, def: c.qualified_definition || "",
        byWeek: [1, 2, 3, 4, 5].map(w => ls.filter(l => Math.min(5, Math.ceil(Number(l.date.slice(8, 10)) / 7)) === w).length) };
    }
    const shoots = (await docsLike("shoots", '"date":"' + month)).filter(s => sameName(s.client, c.name));
    const vids = shoots.flatMap(s => (s.videos || []).filter(v => v.status === "fait"));
    const stats = (await db.all("SELECT module, data, source FROM stats WHERE client_id = ? AND period = ?", [cid, month])).map(s => { let d = {}; try { d = JSON.parse(s.data || "{}"); } catch (e) {} return { module: s.module, data: d, source: s.source }; });
    let prev = null, fiche = {};
    if (!noPrev) { const pv = await bilanData(cid, prevMonth(month), true); prev = { month: pv.month, posts: pv.posts.count, types: pv.posts.types, meta: pv.meta ? { total: pv.meta.total, qualified: pv.meta.qualified } : null, videos: pv.shoots.videos };
      const f = (await db.all("SELECT data FROM docs WHERE col = 'clients' AND deleted = 0")).map(r => { try { return JSON.parse(r.data || "{}"); } catch (e) { return {}; } }).find(x => sameName(x.name, c.name)) || {};
      fiche = { formula: f.formula || c.formula || "", perMonth: f.perMonth || "" }; }
    return { client: { id: c.id, name: c.name, modules: mods }, month, prev, fiche,
      posts: { count: posts.length, published: posts.filter(p => p.published || p.date < new Date().toISOString().slice(0, 10)).length, nets, types, list: posts.slice(0, 40).map(p => ({ date: p.date, type: p.type, net: p.net, title: p.title, url: p.url })), error: postsError },
      validations: { ok: vals.filter(v => v === "ok").length, mod: vals.filter(v => v === "mod").length },
      meta, shoots: { count: shoots.length, videos: vids.length, dates: shoots.map(s => s.date).sort() }, stats };
  }
  const bilanId = (cid, m) => "c" + cid + "-" + m;
  const bilanCid = p => /^b\d+$/.test(String(p)) ? String(p) : Number(p);
  // Liste des bilans : les clients qui ont un espace client, puis toutes les marques Metricool qui n'en ont pas
  app.get("/api/g-bilan-clients", auth, ownerOnly, wrap(async (req, res) => {
    const rows = await db.all("SELECT id, name, metricool_blog_id FROM clients"), out = rows.map(r => ({ id: r.id, name: r.name, space: true, blog: r.metricool_blog_id || "" }));
    PUB_PLAN.filter(x => x[1] && !rows.some(r => String(r.metricool_blog_id || "") === x[1] || sameName(r.name, x[0]))).forEach(x => out.push({ id: "b" + x[1], name: x[0], space: false, blog: x[1] }));
    res.json({ clients: out });
  }));
  app.get("/api/g-bilan/:cid", auth, ownerOnly, wrap(async (req, res) => {
    const cid = bilanCid(req.params.cid), m = String(req.query.m || ""); if (!cid || !okMonth(m)) return res.status(400).json({ error: "Demande invalide." });
    const data = await bilanData(cid, m); if (!data) return res.status(404).json({ error: "Client introuvable." });
    res.json({ data, saved: await current("_bilans", bilanId(cid, m)) });
  }));
  app.get("/api/g-bilans", auth, ownerOnly, wrap(async (req, res) => {
    const m = String(req.query.m || ""); if (!okMonth(m)) return res.status(400).json({ error: "Demande invalide." });
    const rows = await db.all("SELECT id, data FROM docs WHERE col = '_bilans' AND deleted = 0 AND id LIKE ?", ["%-" + m]);
    res.json({ bilans: rows.map(r => { let d = {}; try { d = JSON.parse(r.data || "{}"); } catch (e) {} return { cid: d.cid, savedAt: d.savedAt || "", savedBy: d.savedBy || "", sentAt: (d.sent && d.sent.at) || "" }; }) });
  }));
  app.put("/api/g-bilan/:cid", auth, ownerOnly, wrap(async (req, res) => {
    const cid = bilanCid(req.params.cid), b = req.body || {}, m = String(b.m || ""); if (!cid || !okMonth(m)) return res.status(400).json({ error: "Demande invalide." });
    const data = await bilanData(cid, m); if (!data) return res.status(404).json({ error: "Client introuvable." });
    const s = (v, n) => String(v == null ? "" : v).trim().slice(0, n), num = v => { const x = Number(String(v == null ? "" : v).replace(",", ".")); return isFinite(x) && x >= 0 ? Math.round(x) : null; };
    // Ce que l'agence ajoute au bilan : uniquement des champs texte connus, longueur bornée
    const KEYS = ["chiffres", "topLabel", "topNum", "topTxt", "prevu", "remarques", "budget", "okPhrase", "okList", "koPhrase", "koList", "decisions", "besoins", "resumeTitre", "resumeTxt", "strategie"];
    const extra = {}; KEYS.forEach(k => { extra[k] = s(b.extra && b.extra[k], 4000); });
    const doc = { cid, month: m, data, extra, savedAt: new Date().toISOString(), savedBy: req.user.name, };
    // « Envoyer » : le bilan (les diapositives telles qu'affichées) part dans l'espace du client, onglet Bilans ; un nouvel envoi remplace le précédent
    const prev = await current("_bilans", bilanId(cid, m)); if (prev && prev.sent) doc.sent = prev.sent;
    if (b.send && typeof cid === "string") return res.status(400).json({ error: "Ce client n’a pas d’espace client : imprime le bilan ou fais-en un PDF." });
    if (b.send) { const html = String(b.html || "").slice(0, 800000).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/javascript:/gi, "");
      if (!/class="bs-deck"/.test(html)) return res.status(400).json({ error: "Bilan vide." });
      doc.sent = { at: new Date().toISOString(), by: req.user.name, html }; }
    await put("_bilans", bilanId(cid, m), doc);
    res.json({ ok: true, saved: doc });
  }));

  // ---------- Notifications push de l’équipe : le message s’affiche en entier, comme sur WhatsApp ----------
  const PUSH = require("./push")(db);
  app.get("/api/g-push/key", auth, wrap(async (req, res) => res.json({ key: await PUSH.key() })));
  app.post("/api/g-push", auth, wrap(async (req, res) => { if (req.user.preview) return res.status(403).json({ error: "Aperçu." }); await PUSH.save("g", req.user.name, (req.body || {}).sub); res.json({ ok: true }); }));
  app.post("/api/g-push/off", auth, wrap(async (req, res) => { await PUSH.remove((req.body || {}).endpoint || ""); res.json({ ok: true }); }));
  app.post("/api/g-push/test", auth, wrap(async (req, res) => res.json({ sent: await PUSH.send("g", [req.user.name], { title: "Agence Gacolet", body: "Les notifications marchent sur cet appareil.", url: "/gestion#parametres", tag: "test" }) })));
  async function pushMsg(d, cl) {
    const ch = String(d.ch || ""), who = String(d.who || "Quelqu’un");
    const team = (await db.all("SELECT name FROM gusers WHERE disabled = 0")).map(r => r.name);
    const cname = async id => { const c = await db.one("SELECT name FROM clients WHERE id = ?", [Number(id)]); return c ? c.name : "Client"; };
    let to = team.filter(n => n !== who), title = "", dm = false;
    const base = ch.replace(/^tg:/, ""), shoot = ch.startsWith("tg:");
    if (ch.startsWith("dm:")) { to = ch.slice(3).split("|").filter(n => n !== who); title = who; dm = true; }
    else if (ch.startsWith("cdm:")) { const [x, name] = ch.slice(4).split("|"); to = [name].filter(n => n !== who); title = (cl ? cl.name : await cname(x)) + ", privé"; }
    else if (base.startsWith("cg:")) title = (cl ? cl.name : await cname(base.slice(3))) + (shoot ? ", tournage" : "");
    else if (base.startsWith("c:")) title = base.slice(2) + (shoot ? ", tournage" : ", interne");
    else title = shoot ? "Tournages" : "Équipe";
    const f = Array.isArray(d.files) ? d.files : [];
    const what = d.audio ? "Message vocal" : String(d.text || "").trim() || (f.length > 1 ? f.length + " fichiers" : f.length ? (/^image\//.test(f[0].type || "") ? "Photo" : /^video\//.test(f[0].type || "") ? "Vidéo" : "Fichier") : "Nouveau message");
    const body = (dm ? "" : who + " : ") + what.slice(0, 300);
    await PUSH.send("g", to, { title, body, url: "/gestion#messagerie", ch, tag: "ch-" + ch });
  }

  // ---------- Prélèvements, contrats et factures : le propriétaire saisit, le client consulte ----------
  const cleanBill = b => {
    const s = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
    const num = v => { const n = Number(String(v == null ? "" : v).replace(",", ".").replace(/[^0-9.]/g, "")); return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0; };
    const day = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || "")) ? String(v) : "";
    const link = v => { const u = s(v, 500); return /^\/f\/[a-f0-9]{32}(\.[a-z0-9]{1,7})?$/.test(u) || /^https:\/\/[^\s"<>]+$/.test(u) ? u : ""; };
    const p = b.plan || {};
    const plan = num(p.amount) ? { amount: num(p.amount), tax: p.tax === "HT" ? "HT" : "TTC", day: Math.min(28, Math.max(1, Math.round(Number(p.day)) || 5)), label: s(p.label, 120), method: s(p.method, 60) || "Prélèvement SEPA", start: day(p.start), end: day(p.end), next: day(p.next) } : null;
    const docs = (Array.isArray(b.docs) ? b.docs : []).slice(0, 400).map(d => ({ id: okId(d.id) ? String(d.id) : newId(), kind: d.kind === "contrat" ? "contrat" : "facture", title: s(d.title, 160), num: s(d.num, 40), date: day(d.date), amount: num(d.amount), status: ["payee", "attente", "retard"].includes(d.status) ? d.status : "payee", url: link(d.url), name: s(d.name, 160) })).filter(d => d.title || d.url);
    return { plan, docs };
  };
  app.get("/api/g-billing/:cid", auth, ownerOnly, wrap(async (req, res) => {
    const cid = Number(req.params.cid); if (!cid) return res.status(400).json({ error: "Demande invalide." });
    res.json(await current("billing", "c" + cid) || { plan: null, docs: [] });
  }));
  app.put("/api/g-billing/:cid", auth, ownerOnly, wrap(async (req, res) => {
    const cid = Number(req.params.cid);
    if (!cid || !await db.one("SELECT id FROM clients WHERE id = ?", [cid])) return res.status(404).json({ error: "Client introuvable." });
    const data = Object.assign(cleanBill(req.body || {}), { updatedAt: new Date().toISOString(), updatedBy: req.user.name });
    await put("billing", "c" + cid, data); res.json(data);
  }));
  app.post("/api/c/msg", cauth, wrap(async (req, res) => {
    const b = req.body || {}, text = String(b.text || "").trim().slice(0, 4000), files = cleanFiles(b.files);
    if (!text && !files.length) return res.status(400).json({ error: "Message vide." });
    const ch = b.ch ? String(b.ch) : cgOf(req.cl);
    if (!await clientChOk(req.cl, ch)) return res.status(403).json({ error: "Conversation inconnue." });
    const id = newId();
    const msg = Object.assign({ ch, text, who: req.cname, ext: 1, at: new Date().toISOString() }, files.length ? { files } : {});
    await put("messages", id, msg);
    res.json({ ok: true, id });
    pushMsg(msg, req.cl).catch(() => {});
  }));
  app.delete("/api/c/msg/:id", cauth, wrap(async (req, res) => {
    const id = String(req.params.id); if (!okId(id)) return res.status(400).json({ error: "Demande invalide." });
    const cur = await current("messages", id);
    if (!cur || !await clientChOk(req.cl, cur.ch) || cur.who !== req.cname || !cur.ext) return res.status(403).json({ error: "Vous ne pouvez retirer que vos propres messages." });
    await db.run("UPDATE docs SET deleted = 1, data = '{}', updated_at = ? WHERE col = ? AND id = ?", [stamp(), "messages", id]);
    res.json({ ok: true });
  }));
  app.post("/api/c/idee", cauth, wrap(async (req, res) => {
    const b = req.body || {}, text = String(b.text || "").trim().slice(0, 4000), files = cleanFiles(b.files);
    const kind = ["Idée", "Photos", "Vidéos", "Inspiration"].includes(b.kind) ? b.kind : "Idée";
    if (!text && !files.length) return res.status(400).json({ error: "Écrivez une idée ou ajoutez une photo ou une vidéo." });
    const id = newId();
    await put("idees", id, { cid: req.cl.id, client: req.cl.name, who: req.cname, kind, text, files, at: new Date().toISOString(), seen: [] });
    res.json({ ok: true, id });
  }));
  app.delete("/api/c/idee/:id", cauth, wrap(async (req, res) => {
    const id = String(req.params.id); if (!okId(id)) return res.status(400).json({ error: "Demande invalide." });
    const cur = await current("idees", id);
    if (!cur || Number(cur.cid) !== req.cl.id || cur.who !== req.cname) return res.status(403).json({ error: "Vous ne pouvez retirer que vos propres envois." });
    await db.run("UPDATE docs SET deleted = 1, data = '{}', updated_at = ? WHERE col = ? AND id = ?", [stamp(), "idees", id]);
    res.json({ ok: true });
  }));
  app.post("/api/c/upload", cauth, up.single("file"), (req, res) => {
    const f = req.file;
    if (!f) return res.status(400).json({ error: "Aucun fichier reçu." });
    res.json({ url: "/f/" + f.filename, name: String(f.originalname || "").slice(0, 160), type: f.mimetype, size: f.size });
  });
  // Liste des groupes clients pour la messagerie de l’équipe
  app.get("/api/g-cgroups", auth, wrap(async (req, res) => {
    const cl = await db.all("SELECT id, name FROM clients WHERE active = 1 ORDER BY name");
    const us = await db.all("SELECT client_id, prenom, nom FROM users WHERE token NOT LIKE 'retire-%' AND email <> ? AND email <> ?", [PREVIEW_MAIL, "test@agence.interne"]);
    res.json({ groups: cl.map(c => ({ ch: "cg:" + c.id, id: c.id, room: visioRoom(c.id), name: c.name, people: us.filter(u => u.client_id === c.id).map(u => (u.prenom + " " + u.nom).trim()) })) });
  }));


  // ---------- Jeu de l’agence : les tâches deviennent des quêtes ----------
  // Positions et paroles en mémoire (éphémères) ; profil (or, sac) et courrier rangés en base, dans des collections réservées au jeu.
  const gLevel = xp => Math.floor(Math.sqrt(xp / 100)) + 1;
  async function gProfile(u) {
    const rows = await db.all("SELECT data FROM docs WHERE col = 'tasks' AND deleted = 0");
    const mine = rows.map(r => JSON.parse(r.data || "{}")).filter(d => d.who === u.name);
    const done = mine.filter(d => d.done);
    const onTime = done.filter(d => !d.date || !d.doneAt || String(d.doneAt) <= String(d.date)).length;
    const xp = done.length * 100 + onTime * 50;
    const p = (await current("game", "p:" + u.id)) || { gold: 0, bag: [] };
    return { name: u.name, xp, lvl: gLevel(xp), next: Math.pow(gLevel(xp), 2) * 100, prev: Math.pow(gLevel(xp) - 1, 2) * 100,
      gold: done.length * 10 + onTime * 5 + (Number(p.gold) || 0), bag: p.bag || [], done: done.length };
  }
  // La com de Gabriel : réels et stories Instagram publiés chaque jour, lus dans Metricool (marque GABRIEL)
  let comCache = null;
  // Publications des clients réseaux, lues en direct dans Metricool (planificateur) : statiques et vidéos Paul Audio du mois, publiées et programmées
  const PUB_PLAN = [["AR Climatisation", "6347688", 0, 4], ["Bonobo", "6377343", 6, 2], ["Delta Sud Formation", "6072162", 4, 4], ["Flora Design", "6845665", 0, 4],
    ["France Étanchéité", "6077200", 4, 4], ["Gaufrement Bon", "6000998", 4, 4], ["La Vie La Construction", "6000767", 8, 4], ["Le Petit Mas", "7628911", 0, 4],
    ["Locamex", "6000991", 8, 4], ["Meyer-Pic", "6636223", 4, 4], ["Only Clean", "7446043", 4, 4], ["Paillotte Bassamoise", "6245450", 8, 4], ["Sport Défense", "6225588", 4, 4], ["Insolent", "", 0, 4]];
  const pubCache = new Map();
  // Dépôt de productions (descriptions Claude + programmation Metricool)
  const persistKey = (name, val) => { const ENV = path.join(root, ".env"); let txt = ""; try { txt = fs.readFileSync(ENV, "utf8"); } catch (e) {}
    txt = txt.split("\n").filter(l => l && !l.startsWith(name + "=")).join("\n") + "\n" + name + "='" + val + "'\n"; fs.writeFileSync(ENV, txt.replace(/^\n+/, ""), { mode: 0o600 }); process.env[name] = val; };
  require("./production")({ app, auth, wrap, db, current, put, pubPlan: PUB_PLAN, persistKey, upDir: DIR, macAuth: (req, res, next) => deployAuth(req, res, next) });
  require("./metaads")({ app, auth, ownerOnly, wrap, db, put, current, persistKey });
  app.get("/api/g-pubs", auth, wrap(async (req, res) => {
    const mk = /^\d{4}-\d{2}$/.test(String(req.query.month || "")) ? req.query.month : new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }).slice(0, 7);
    const plan = PUB_PLAN.map(([client, blogId, stat, video]) => ({ client, blogId, stat, video }));
    const token = process.env.METRICOOL_USER_TOKEN; if (!token) return res.json({ ok: false, reason: "no-token", month: mk, plan });
    const hit = pubCache.get(mk); if (hit && Date.now() - hit.at < 3 * 60000 && !req.query.fresh) return res.json(hit.data);
    const [y, m] = mk.split("-").map(Number), last = new Date(y, m, 0).getDate(), userId = process.env.METRICOOL_USER_ID || "4634230", today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
    const one = async c => { const out = Object.assign({}, c, { statDone: 0, statSched: 0, vidDone: 0, vidSched: 0, next: "", err: "", items: [] }); if (!c.blogId) { out.err = "pas de marque Metricool"; return out; }
      try { const q = new URLSearchParams({ blogId: c.blogId, userId, start: mk + "-01T00:00:00", end: mk + "-" + String(last).padStart(2, "0") + "T23:59:59", timezone: "Europe/Paris" });
        const r = await fetch("https://app.metricool.com/api/v2/scheduler/posts?" + q, { headers: { "X-Mc-Auth": token, Accept: "application/json" } }); if (!r.ok) { out.err = "Metricool " + r.status; return out; }
        const j = await r.json(), arr = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : [];
        // Une même publication est souvent créée une fois par réseau dans Metricool : on ne compte que le réseau principal (Instagram, sinon Facebook)
        const posts = arr.filter(p => !p.draft && !((p.instagramData || {}).type === "STORY" || (p.facebookData || {}).type === "STORY"));
        const nets = p => (Array.isArray(p.providers) ? p.providers : []).map(x => x.network), main = posts.some(p => nets(p).includes("instagram")) ? "instagram" : posts.some(p => nets(p).includes("facebook")) ? "facebook" : "";
        const isPA = p => (Array.isArray(p.brandTags) ? p.brandTags : []).some(t => /^(pa|paul ?audio)$/i.test(String((t && (t.name || t.label || t.tag)) || t).trim())), tagged = posts.some(isPA);
        posts.forEach(p => { const prov = (Array.isArray(p.providers) ? p.providers : []).find(x => !main || x.network === main); if (!prov) return;
          const ig = p.instagramData || {}, fb = p.facebookData || {}, t = main === "facebook" ? fb.type : ig.type;
          const vid = t === "REEL" || t === "TRIAL_REEL" || (!t && Array.isArray(p.media) && p.media.some(u => /\.(mp4|mov|webm)(\?|$)/i.test(u)));
          const done = prov.status === "PUBLISHED", d = ((p.publicationDate && p.publicationDate.dateTime) || "").slice(0, 10);
          // Étiquette Metricool « Paul Audio » (ou « PA ») : si le client en utilise, seules les vidéos étiquetées comptent comme vidéos Paul Audio
          if (vid) done ? out.vidDone++ : out.vidSched++; else done ? out.statDone++ : out.statSched++;
          // Détail pour la fiche récap du client (Publications) : date, type, état Metricool, début du texte, lien publié
          out.items.push({ d: (p.publicationDate && p.publicationDate.dateTime) || "", vid, st: done ? "done" : /ERROR|FAIL/i.test(prov.status || "") ? "err" : "sched", net: prov.network || main,
            text: String(p.text || "").replace(/\s+/g, " ").trim().slice(0, 140), url: prov.publicUrl || prov.link || "", img: (Array.isArray(p.media) ? p.media : []).find(u => /\.(jpe?g|png|webp)(\?|$)/i.test(u)) || "" });
          if (!done && d >= today && (!out.next || d < out.next)) out.next = d; });
      } catch (e) { out.err = "Metricool injoignable"; }
      return out; };
    const rows = await Promise.all(plan.map(one));
    // Décisions du client dans son espace (validée, modification demandée, refusée), dernière par publication
    for (const r of rows) { try { const c = r.blogId ? await db.one("SELECT id FROM clients WHERE metricool_blog_id = ?", [r.blogId]) : null; if (!c) continue;
      const ds = await db.all("SELECT d.post_id, d.post_title, d.post_date, d.status, d.note, d.created_at, u.prenom FROM decisions d LEFT JOIN users u ON u.id = d.user_id WHERE d.client_id = ? AND d.post_date LIKE ? ORDER BY d.id", [c.id, mk + "%"]);
      const last = {}; ds.forEach(d => { last[d.post_id] = { title: d.post_title || "", date: String(d.post_date || "").trim(), status: d.status, note: d.note || "", by: d.prenom || "", at: d.created_at || "" }; }); r.decisions = Object.values(last);
    } catch (e) {} }
    const data = { ok: true, at: Date.now(), month: mk, rows }; pubCache.set(mk, { at: Date.now(), data }); res.json(data);
  }));
  app.get("/api/g-com", auth, wrap(async (req, res) => {
    if (req.user.role !== "owner") return res.status(403).json({ error: "Réservé aux personnes qui ont l’accès complet." });
    const token = process.env.METRICOOL_USER_TOKEN; if (!token) return res.json({ ok: false, reason: "no-token" });
    if (comCache && Date.now() - comCache.at < 10 * 60000) return res.json(comCache.data);
    const blogId = process.env.METRICOOL_GAB_BLOG_ID || "6875110", userId = process.env.METRICOOL_GAB_USER_ID || process.env.METRICOOL_USER_ID || "4634230";
    const day = d => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }), now = new Date(), from = new Date(now.getTime() - 7 * 864e5);
    const q = new URLSearchParams({ from: day(from) + "T00:00:00", to: day(now) + "T23:59:59", timezone: "Europe/Paris", blogId, userId });
    const get = async path => { try { const r = await fetch("https://app.metricool.com/api" + path + "?" + q, { headers: { "X-Mc-Auth": token, Accept: "application/json" } }); if (!r.ok) return null; const j = await r.json(); return Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : []; } catch (e) { return null; } };
    const dateOf = x => { const v = (x.publishedAt && (x.publishedAt.dateTime || x.publishedAt)) || x.publicationDate && x.publicationDate.dateTime || x.published || x.date || x.timestamp || x.created || ""; if (typeof v === "number") return day(new Date(v > 1e12 ? v : v * 1000)); return String(v).slice(0, 10); };
    const [reels, stories] = await Promise.all([get("/v2/analytics/reels/instagram"), get("/v2/analytics/stories/instagram")]);
    if (!reels && !stories) return res.json({ ok: false, reason: "api" });
    const days = {}; const add = (arr, k) => (arr || []).forEach(x => { const d = dateOf(x); if (!d) return; (days[d] = days[d] || { reels: 0, stories: 0 })[k]++; });
    add(reels, "reels"); add(stories, "stories");
    const data = { ok: true, at: Date.now(), days }; comCache = { at: Date.now(), data }; res.json(data);
  }));
  // Liaisons : clé API Metricool collée par un propriétaire dans Paramètres, gardée dans le fichier .env du serveur (jamais renvoyée au navigateur)
  app.get("/api/g-keys", auth, ownerOnly, (req, res) => res.json({ metricool: !!process.env.METRICOOL_USER_TOKEN, places: !!process.env.GOOGLE_PLACES_KEY }));
  app.get("/api/g-places", auth, (req, res) => res.json({ ok: !!process.env.GOOGLE_PLACES_KEY }));
  app.put("/api/g-keys/places", auth, ownerOnly, wrap(async (req, res) => {
    const k = String((req.body || {}).key || "").trim(); if (!/^AIza[\w-]{30,45}$/.test(k)) return res.status(400).json({ error: "Une clé Google commence par « AIza »." });
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": k, "X-Goog-FieldMask": "places.displayName" }, body: JSON.stringify({ textQuery: "boulangerie Nîmes", pageSize: 1 }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); return res.status(400).json({ error: "Google refuse la clé : " + ((j.error && j.error.message) || r.status) }); }
    const ENV = path.join(root, ".env"); let txt = ""; try { txt = fs.readFileSync(ENV, "utf8"); } catch (e) {}
    txt = txt.split("\n").filter(l => l && !/^GOOGLE_PLACES_KEY=/.test(l)).join("\n") + "\nGOOGLE_PLACES_KEY='" + k + "'\n";
    fs.writeFileSync(ENV, txt.replace(/^\n+/, ""), { mode: 0o600 }); process.env.GOOGLE_PLACES_KEY = k; res.json({ ok: true });
  }));
  app.put("/api/g-keys/metricool", auth, ownerOnly, wrap(async (req, res) => {
    const tok = String((req.body || {}).token || "").trim();
    if (!/^[A-Za-z0-9_\-.]{10,300}$/.test(tok)) return res.status(400).json({ error: "Cette clé ne ressemble pas à une clé Metricool." });
    try { const q = new URLSearchParams({ blogId: "6874994", userId: process.env.METRICOOL_USER_ID || "4634230", start: "2026-11-01T00:00:00", end: "2026-11-02T23:59:59", timezone: "Europe/Paris" });
      const r = await fetch("https://app.metricool.com/api/v2/scheduler/posts?" + q, { headers: { "X-Mc-Auth": tok, Accept: "application/json" } });
      if (r.status === 401 || r.status === 403) return res.status(400).json({ error: "Metricool refuse cette clé (" + r.status + "). Vérifie qu'elle est complète." });
    } catch (e) { /* Metricool injoignable : on enregistre quand même */ }
    const ENV = path.join(root, ".env"); let txt = ""; try { txt = fs.readFileSync(ENV, "utf8"); } catch (e) {}
    txt = txt.split("\n").filter(l => l && !/^METRICOOL_USER_TOKEN=/.test(l)).join("\n") + "\nMETRICOOL_USER_TOKEN='" + tok + "'\n";
    fs.writeFileSync(ENV, txt.replace(/^\n+/, ""), { mode: 0o600 }); process.env.METRICOOL_USER_TOKEN = tok; pubCache.clear(); comCache = null;
    res.json({ ok: true });
  }));
  app.get("/api/g-game", auth, wrap(async (req, res) => {
    const u = req.user, me = await gProfile(u);
    const allT = (await db.all("SELECT id, data FROM docs WHERE col = 'tasks' AND deleted = 0")).map(r => { try { return Object.assign({ id: r.id }, JSON.parse(r.data || "{}")); } catch (e) { return { id: r.id }; } });
    const tasks = allT.filter(d => d.who === u.name && !d.done).map(d => ({ id: d.id, title: d.title || "Tâche", client: d.client || "", date: d.date || "", note: String(d.note || d.notes || "").slice(0, 400), prio: d.prio || "" }));
    const mail = (await db.all("SELECT id, data FROM docs WHERE col = 'gmail' AND deleted = 0")).map(r => Object.assign({ id: r.id }, JSON.parse(r.data || "{}")))
      .filter(m => m.to === u.name).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 60);
    const team = (await db.all("SELECT name FROM gusers WHERE disabled = 0")).map(x => x.name);
    // État réel de chaque client, affiché au-dessus de son étal dans le jeu (sans aucun chiffre d'affaires)
    const nk = v => String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim(), clients = {}, C = n => clients[nk(n)] = clients[nk(n)] || { tasks: 0, who: [], rush: 0, next: "", planned: 0, published: 0, waiting: 0 };
    const rows = async col => (await db.all("SELECT data FROM docs WHERE col = ? AND deleted = 0", [col])).map(r => { try { return JSON.parse(r.data || "{}"); } catch (e) { return {}; } });
    allT.filter(d => !d.done && d.client).forEach(d => { const c = C(d.client); c.tasks++; if (d.who && !c.who.includes(d.who)) c.who.push(d.who); });
    (await rows("rushes")).forEach(d => { if (d.client && d.kind !== "reel" && d.status !== "Monté" && d.status !== "Posté") C(d.client).rush++; });
    (await rows("publications")).forEach(d => { if (!d.client) return; const c = C(d.client); c.next = String(d.next || "").slice(0, 40); c.planned = Number(d.planned) || 0; c.published = Number(d.published) || 0; c.waiting = Number(d.waiting) || 0; });
    const since = new Date(Date.now() - 3 * 864e5).toISOString().slice(0, 10), recent = allT.filter(d => d.who === u.name && d.done && String(d.doneAt || "") >= since).map(d => ({ id: d.id, title: d.title || "Tâche" }));
    res.json({ me, quests: tasks, mail, team, clients, recent });
  }));
  // Positions et paroles rangées en base : tous les processus du serveur voient la même chose (sinon les joueurs clignotent)
  let gReady = null;
  const gEnsure = () => gReady || (gReady = (async () => {
    await db.run("CREATE TABLE IF NOT EXISTS game_pos (name VARCHAR(80) NOT NULL PRIMARY KEY, data TEXT NOT NULL, t BIGINT NOT NULL)");
    await db.run("CREATE TABLE IF NOT EXISTS game_say (id BIGINT NOT NULL PRIMARY KEY, who VARCHAR(80) NOT NULL, text TEXT NOT NULL, at BIGINT NOT NULL)");
  })().catch(e => { gReady = null; throw e; }));
  app.post("/api/g-game/pos", auth, wrap(async (req, res) => {
    await gEnsure();
    const b = req.body || {}, n = req.user.name, now = Date.now(), num = v => Math.max(-500, Math.min(500, Number(v) || 0));
    const me = { name: n, x: num(b.x), z: num(b.z), y: Math.max(-20, Math.min(250, Number(b.y) || 0)), ry: Number(b.ry) || 0, mv: b.mv ? 1 : 0, emo: String(b.emo || "").slice(0, 12), cls: String(b.cls || "").replace(/[^\w]/g, "").slice(0, 20), lvl: Number(b.lvl) || 1, t: now, ride: ["car", "horse", "pass"].includes(b.ride) ? b.ride : "", rp: Number(b.rp) || 0, rr: Number(b.rr) || 0, sp: Number(b.sp) || 0, drv: String(b.drv || "").slice(0, 80), hp: b.hp == null ? 100 : Math.max(0, Math.min(100, Number(b.hp) || 0)), atk: Number(b.atk) || 0, arm: b.arm ? 1 : 0 };
    // Une seule partie par personne : si le jeu est ouvert dans deux onglets, le plus récent prend la main
    me.ss = Number(b.ss) || 0;
    const prev = await db.one("SELECT data, t FROM game_pos WHERE name = ?", [n]);
    if (prev) { let pd = {}; try { pd = JSON.parse(prev.data); } catch (e) {} if ((pd.ss || 0) > me.ss && now - Number(prev.t) < 5000) return res.json({ kicked: true }); }
    const js = JSON.stringify(me);
    const u = await db.run("UPDATE game_pos SET data = ?, t = ? WHERE name = ?", [js, now, n]);
    if (!u.changes) await db.run("INSERT INTO game_pos (name, data, t) VALUES (?,?,?)", [n, js, now]).catch(() => db.run("UPDATE game_pos SET data = ?, t = ? WHERE name = ?", [js, now, n]));
    if (b.say) { const id = now * 100 + Math.floor(Math.random() * 100); await db.run("INSERT INTO game_say (id, who, text, at) VALUES (?,?,?,?)", [id, n, String(b.say).replace(/^§+/, "").slice(0, 200), now]); if (Math.random() < 0.05) await db.run("DELETE FROM game_say WHERE at < ?", [now - 600000]); }
    // Combat : coups portés et défaites, relayés comme des paroles spéciales que les joueurs lisent
    for (const ev of (Array.isArray(b.ev) ? b.ev.slice(0, 6) : [])) { if (typeof ev === "string" && /^§(hit|ko)§[^§]{1,80}(§\d{1,2})?$/.test(ev)) { const id = now * 100 + Math.floor(Math.random() * 100); await db.run("INSERT INTO game_say (id, who, text, at) VALUES (?,?,?,?)", [id, n, ev, now]).catch(() => {}); } }
    const since = Number(b.since) || 0;
    const players = (await db.all("SELECT data FROM game_pos WHERE t > ? AND name <> ?", [now - 15000, n])).map(r => JSON.parse(r.data));
    const says = (await db.all("SELECT id, who, text, at FROM game_say WHERE id > ? AND at > ? ORDER BY id", [since, now - 60000])).map(r => ({ id: Number(r.id), who: r.who, text: r.text, at: Number(r.at) }));
    const sid = says.length ? says[says.length - 1].id : Math.max(since, (now - 60000) * 100);
    res.json({ players, says, sid, now: Date.now() });
  }));
  app.post("/api/g-game/quest/:id", auth, wrap(async (req, res) => {
    const id = req.params.id; if (!okId(id)) return res.status(400).json({ error: "Demande invalide." });
    const cur = await current("tasks", id);
    if (!cur || cur.who !== req.user.name) return res.status(404).json({ error: "Quête introuvable." });
    if (!cur.done) await put("tasks", id, Object.assign({}, cur, { done: true, doneAt: stamp().slice(0, 10) }));
    res.json({ ok: true, me: await gProfile(req.user) });
  }));
  app.post("/api/g-game/mail", auth, wrap(async (req, res) => {
    const b = req.body || {}, u = req.user, to = String(b.to || "").slice(0, 80);
    if (!(await db.one("SELECT id FROM gusers WHERE name = ? AND disabled = 0", [to]))) return res.status(400).json({ error: "Destinataire inconnu." });
    const gold = Math.max(0, Math.floor(Number(b.gold) || 0));
    if (gold){ const me = await gProfile(u); if (me.gold < gold) return res.status(400).json({ error: "Pas assez d’or." });
      const p = (await current("game", "p:" + u.id)) || { gold: 0, bag: [] }; p.gold = (Number(p.gold) || 0) - gold; await put("game", "p:" + u.id, p); }
    await put("gmail", newId(), { from: u.name, to, subject: String(b.subject || "").slice(0, 120), body: String(b.body || "").slice(0, 4000), gold, at: stamp(), read: false, taken: false });
    res.json({ ok: true });
  }));
  app.post("/api/g-game/mail/:id/:act", auth, wrap(async (req, res) => {
    const { id, act } = req.params; if (!okId(id)) return res.status(400).json({ error: "Demande invalide." });
    const m = await current("gmail", id); if (!m || m.to !== req.user.name) return res.status(404).json({ error: "Lettre introuvable." });
    if (act === "read") { m.read = true; await put("gmail", id, m); }
    else if (act === "take" && m.gold && !m.taken) { const tu = await db.one("SELECT id FROM gusers WHERE name = ?", [req.user.name]); const p = (await current("game", "p:" + tu.id)) || { gold: 0, bag: [] }; p.gold = (Number(p.gold) || 0) + m.gold; await put("game", "p:" + tu.id, p); m.taken = true; m.read = true; await put("gmail", id, m); }
    else if (act === "del") await db.run("UPDATE docs SET deleted = 1, data = '{}', updated_at = ? WHERE col = 'gmail' AND id = ?", [stamp(), id]);
    res.json({ ok: true, me: await gProfile(req.user) });
  }));
  app.get(["/jeu", "/jeu/"], (req, res) => res.sendFile(path.join(root, "public", "jeu.html")));
  app.get(["/gestion", "/gestion/"], (req, res) => res.sendFile(path.join(root, "public", "gestion.html")));

  // ---------- Corbeille : ce qui a été supprimé dans les 30 derniers jours, restaurable en un clic (accès complet) ----------
  const titleOf = (col, d) => String(d.title || d.company || d.name || d.subject || d.label || d.content || d.text || (d.client ? (col === "shoots" ? "Tournage " : "") + d.client : "") || "Sans titre").slice(0, 120);
  app.get("/api/g-corbeille", auth, ownerOnly, wrap(async (req, res) => {
    const lim = new Date(Date.now() - 30 * 864e5).toISOString();
    const rows = await db.all("SELECT col, id, data, updated_at FROM docs WHERE deleted = 1 AND updated_at >= ? AND data <> '{}' ORDER BY updated_at DESC LIMIT 300", [lim]);
    res.json({ items: rows.filter(r => okCol(r.col) && r.col !== "messages" && !DUO_COLS.includes(r.col)).map(r => { let d = {}; try { d = JSON.parse(r.data || "{}"); } catch (e) {} return { col: r.col, id: r.id, title: titleOf(r.col, d), client: d.client || "", who: d.who || d.owner || "", at: r.updated_at }; }) });
  }));
  app.post("/api/g-corbeille/:col/:id", auth, ownerOnly, wrap(async (req, res) => {
    const { col, id } = req.params; if (!okCol(col) || !okId(id) || col === "messages") return res.status(400).json({ error: "Demande invalide." });
    const r = await db.one("SELECT data FROM docs WHERE col = ? AND id = ? AND deleted = 1", [col, id]);
    if (!r || r.data === "{}") return res.status(404).json({ error: "Rien à restaurer : l’élément n’est plus dans la corbeille." });
    await db.run("UPDATE docs SET deleted = 0, updated_at = ? WHERE col = ? AND id = ?", [stamp(), col, id]);
    let d = {}; try { d = JSON.parse(r.data); } catch (e) {}
    await afterTask(col, id, d, req.user); res.json({ ok: true }); bump();
  }));

  // ---------- Sauvegarde (copie hors Infomaniak, téléchargée chaque jour par 80_APPLICATION/sauvegarde.py sur le Mac) ----------
  // Accès complet seulement. Toute la base, sauf les jetons de session des clients (inutiles pour restaurer).
  app.get("/api/g-backup", auth, ownerOnly, wrap(async (req, res) => {
    const names = process.env.DB_HOST
      ? (await db.all("SHOW TABLES")).map(r => Object.values(r)[0])
      : (await db.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")).map(r => r.name);
    const tables = {};
    for (const t of names) {
      if (!/^[a-z0-9_]+$/i.test(t)) continue;
      const rows = await db.all("SELECT * FROM `" + t + "`");
      tables[t] = t === "users" ? rows.map(r => Object.assign({}, r, { token: "" })) : rows;
    }
    const files = [];
    const walk = (dir, rel) => { let l = []; try { l = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
      for (const e of l) { const p = path.join(dir, e.name), r = rel ? rel + "/" + e.name : e.name;
        if (e.isDirectory()) walk(p, r); else if (e.isFile()) files.push({ path: r, size: fs.statSync(p).size }); } };
    walk(path.join(root, "uploads"), "");
    res.json({ app: "gacolet", date: new Date().toISOString(), tables, files });
  }));
  app.get("/api/g-backup/file", auth, ownerOnly, (req, res) => {
    const base = path.join(root, "uploads"), p = path.resolve(base, String(req.query.p || ""));
    if (!p.startsWith(base + path.sep)) return res.status(400).end();
    res.sendFile(p, err => { if (err && !res.headersSent) res.status(404).end(); });
  });

  // ---------- Mise à jour de l’appli depuis GitHub, sans passer par le Manager Infomaniak (Matis ou la clé du Mac) ----------
  // Même chose que le bouton Build : git pull, copie de gacolet-app à la racine, npm install si besoin.
  // Les écrans (public/) sont à jour tout de suite. Si le code du serveur a changé, il faut « Redémarrer » dans le Manager :
  // l'appli ne s'arrête JAMAIS d'elle-même (essai du 15/11/2026 : Infomaniak ne la relance pas, page de maintenance).
  const { execFile } = require("child_process");
  const run = (cmd, args) => new Promise(ok => execFile(cmd, args, { cwd: root, timeout: 180000, maxBuffer: 4e6 }, (err, out, er) => ok({ code: err ? (err.code || 1) : 0, out: String(out || "") + String(er || "") })));
  // Accès : Matis connecté, ou la clé de mise en ligne gardée dans le trousseau du Mac de Matis (en-tête X-Deploy-Key)
  const deployKeyOk = req => { const k = String(req.get("x-deploy-key") || ""), want = process.env.DEPLOY_KEY || ""; return want.length >= 32 && k.length === want.length && crypto.timingSafeEqual(Buffer.from(k), Buffer.from(want)); };
  const deployAuth = (req, res, next) => deployKeyOk(req) ? (req.user = { name: "Matis (Mac)", role: "owner" }, next()) : auth(req, res, () => onlyMatis(req, res, next));
  const onlyMatis = (req, res, next) => req.user && req.user.role === "owner" && req.user.name === "Matis" ? next() : res.status(403).json({ error: "Réservé à Matis." });
  // Enregistre la clé de mise en ligne dans le .env du serveur (accès complet, une fois)
  app.put("/api/g-keys/deploy", auth, ownerOnly, wrap(async (req, res) => {
    const k = String((req.body || {}).key || "").trim(); if (!/^[A-Za-z0-9_-]{32,128}$/.test(k)) return res.status(400).json({ error: "Clé invalide." });
    const ENV = path.join(root, ".env"); let txt = ""; try { txt = fs.readFileSync(ENV, "utf8"); } catch (e) {}
    txt = txt.split("\n").filter(l => l && !/^DEPLOY_KEY=/.test(l)).join("\n") + "\nDEPLOY_KEY='" + k + "'\n";
    fs.writeFileSync(ENV, txt.replace(/^\n+/, ""), { mode: 0o600 }); process.env.DEPLOY_KEY = k; res.json({ ok: true });
  }));
  app.get("/api/g-deploy", deployAuth, wrap(async (req, res) => { const h = await run("git", ["rev-parse", "--short", "HEAD"]); res.json({ version: h.out.trim(), started: STARTED }); }));
  app.post("/api/g-deploy", deployAuth, wrap(async (req, res) => {
    const before = (await run("git", ["rev-parse", "HEAD"])).out.trim(), log = [];
    const pull = await run("git", ["pull", "--ff-only"]); log.push("$ git pull\n" + pull.out);
    if (pull.code) return res.status(500).json({ ok: false, log: log.join("\n") });
    const after = (await run("git", ["rev-parse", "HEAD"])).out.trim();
    const changed = before === after ? [] : (await run("git", ["diff", "--name-only", before, after])).out.split("\n").filter(Boolean);
    if (changed.length) { const cp = await run("cp", ["-R", "gacolet-app/.", "./"]); log.push("$ cp -R gacolet-app/. ./\n" + cp.out); if (cp.code) return res.status(500).json({ ok: false, log: log.join("\n") }); }
    if (changed.some(f => /package(-lock)?\.json$/.test(f))) { const ni = await run("npm", ["install", "--omit=dev"]); log.push("$ npm install\n" + ni.out.slice(-2000)); }
    const restart = changed.some(f => /^gacolet-app\/(src\/|server\.js|package)/.test(f));
    // Sous le gardien (supervisor.js) : le serveur s'arrête après la réponse et repart tout seul avec le nouveau code
    const auto = restart && !!process.env.GACOLET_SUPERVISED;
    const busy = global.gcUploads ? global.gcUploads() : 0;
    res.json({ ok: true, from: before.slice(0, 7), to: after.slice(0, 7), changed, restart, auto, uploads: busy, log: log.join("\n") + (auto && busy ? "\nRedémarrage reporté : " + busy + " envoi(s) de fichier en cours, il se fera dès qu'ils sont finis." : "") });
    // Jamais de redémarrage pendant un envoi de fichier : on attend la fin (20 min au plus)
    if (auto) { const t0 = Date.now(); const go = () => (global.gcUploads && global.gcUploads() > 0 && Date.now() - t0 < 20 * 60000) ? setTimeout(go, 2000) : process.exit(75); setTimeout(go, 600); }
  }));
};
