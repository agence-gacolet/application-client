// Gestion interne de l'agence : stockage générique « collection / document » (tâches, agenda, commercial...).
// Même logique que l'ancien gestionnaire : chaque document est un objet JSON rangé dans une collection.
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");

const COLLS = ["events", "tasks", "commercial", "campaigns", "rushes", "publications", "clients", "cevents", "keydates", "posts", "edtodo", "meta"];

module.exports = function (app, { db, wrap, admin, root }) {
  const okCol = c => COLLS.includes(c);
  const okId = id => /^[\w.-]{1,120}$/.test(String(id || ""));
  const stamp = () => new Date().toISOString();
  const newId = () => Date.now().toString(36) + crypto.randomBytes(4).toString("hex");

  // Tout ce qui a changé depuis « since » (premier appel : tout).
  app.get("/api/g/changes", admin, wrap(async (req, res) => {
    const since = String(req.query.since || "");
    const now = stamp();
    const rows = since
      ? await db.all("SELECT col, id, data, deleted, updated_at FROM docs WHERE updated_at >= ?", [since])
      : await db.all("SELECT col, id, data, deleted, updated_at FROM docs WHERE deleted = 0");
    res.json({ now, full: !since, docs: rows.map(r => ({ col: r.col, id: r.id, deleted: !!Number(r.deleted), data: r.deleted ? null : JSON.parse(r.data || "{}") })) });
  }));

  async function put(col, id, data) {
    const s = JSON.stringify(data || {});
    if (s.length > 200000) throw Object.assign(new Error("Document trop gros."), { status: 400 });
    const t = stamp();
    const r = await db.run("UPDATE docs SET data = ?, deleted = 0, updated_at = ? WHERE col = ? AND id = ?", [s, t, col, id]);
    if (!r.changes) await db.run("INSERT INTO docs (col, id, data, deleted, updated_at) VALUES (?,?,?,0,?)", [col, id, s, t]);
  }

  // Créer ou remplacer
  app.put("/api/g/:col/:id", admin, wrap(async (req, res) => {
    const { col, id } = req.params;
    if (!okCol(col) || !okId(id)) return res.status(400).json({ error: "Demande invalide." });
    await put(col, id, req.body && req.body.data);
    res.json({ ok: true, id });
  }));
  app.post("/api/g/:col", admin, wrap(async (req, res) => {
    if (!okCol(req.params.col)) return res.status(400).json({ error: "Demande invalide." });
    const id = newId();
    await put(req.params.col, id, req.body && req.body.data);
    res.json({ ok: true, id });
  }));
  // Modifier quelques champs
  app.patch("/api/g/:col/:id", admin, wrap(async (req, res) => {
    const { col, id } = req.params;
    if (!okCol(col) || !okId(id)) return res.status(400).json({ error: "Demande invalide." });
    const cur = await db.one("SELECT data FROM docs WHERE col = ? AND id = ? AND deleted = 0", [col, id]);
    if (!cur) return res.status(404).json({ error: "Élément introuvable : il a peut-être été supprimé." });
    await put(col, id, Object.assign(JSON.parse(cur.data || "{}"), (req.body && req.body.data) || {}));
    res.json({ ok: true });
  }));
  app.delete("/api/g/:col/:id", admin, wrap(async (req, res) => {
    const { col, id } = req.params;
    if (!okCol(col) || !okId(id)) return res.status(400).json({ error: "Demande invalide." });
    await db.run("UPDATE docs SET deleted = 1, data = '{}', updated_at = ? WHERE col = ? AND id = ?", [stamp(), col, id]);
    res.json({ ok: true });
  }));

  // Reprise des données de l'ancien gestionnaire (une fois). N'écrase pas ce qui existe déjà.
  app.post("/api/g-import", admin, wrap(async (req, res) => {
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

  // Pièces jointes (rushs, devis, visuels...). Adresse impossible à deviner, servie telle quelle.
  const DIR = path.join(root, "uploads", "gestion");
  fs.mkdirSync(DIR, { recursive: true });
  const up = multer({
    storage: multer.diskStorage({
      destination: DIR,
      filename: (req, f, cb) => cb(null, crypto.randomBytes(16).toString("hex") + path.extname(f.originalname).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 8)),
    }),
    limits: { fileSize: 300 * 1024 * 1024, files: 1 },
  });
  app.post("/api/g-upload", admin, up.single("file"), (req, res) => {
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
