// Premier réglage depuis le navigateur (/installation), sans console ni fichier à créer à la main.
// Ne fonctionne que tant que la base et le mot de passe de l'espace agence ne sont pas réglés.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

module.exports = function setup(app, { db, wrap }) {
  const ENV = path.join(__dirname, "..", ".env");
  const needSetup = () => !process.env.DB_HOST || !process.env.ADMIN_PASSWORD;
  const quote = v => (!v.includes("'") ? `'${v}'` : !v.includes('"') ? `"${v}"` : null);

  app.get("/installation", (req, res) =>
    needSetup() ? res.sendFile(path.join(__dirname, "..", "public", "installation.html")) : res.redirect("/agence"));

  app.post("/api/setup", wrap(async (req, res) => {
    if (!needSetup()) return res.status(403).json({ error: "L'application est déjà réglée." });
    const b = req.body || {};
    const cfg = {
      DB_HOST: String(b.db_host || "").trim(), DB_PORT: "3306",
      DB_USER: String(b.db_user || "").trim(), DB_PASSWORD: String(b.db_password || ""),
      DB_NAME: String(b.db_name || "").trim(), ADMIN_PASSWORD: String(b.admin_password || ""),
      APP_SECRET: crypto.randomBytes(32).toString("hex"),
    };
    if (!cfg.DB_HOST || !cfg.DB_USER || !cfg.DB_PASSWORD || !cfg.DB_NAME) return res.status(400).json({ error: "Remplissez tous les champs de la base." });
    if (cfg.ADMIN_PASSWORD.length < 10) return res.status(400).json({ error: "Le mot de passe de l'espace agence doit faire au moins 10 caractères." });
    if (Object.values(cfg).some(v => /[\r\n]/.test(v) || quote(v) === null)) return res.status(400).json({ error: "Un mot de passe contient à la fois ' et \". Changez-le." });
    try {
      const mysql = require("mysql2/promise");
      const c = await mysql.createConnection({ host: cfg.DB_HOST, port: 3306, user: cfg.DB_USER, password: cfg.DB_PASSWORD, database: cfg.DB_NAME });
      await c.end();
    } catch (e) {
      return res.status(400).json({ error: "Connexion à la base refusée (" + (e.code || e.message) + "). Vérifiez l'utilisateur et le mot de passe." });
    }
    fs.writeFileSync(ENV, Object.entries(cfg).map(([k, v]) => `${k}=${quote(v)}`).join("\n") + "\n", { mode: 0o600 });
    Object.assign(process.env, cfg);
    await db.init();
    if (!(await db.one("SELECT id FROM clients LIMIT 1"))) { try { await require("../scripts/seed-demo").seed(); } catch (e) { console.error(e.message); } }
    res.json({ ok: true });
  }));
};
