// Accès base de données.
// En ligne (Infomaniak) : MariaDB via mysql2, si DB_HOST est renseigné.
// En local : SQLite intégré à Node (fichier data/dev.sqlite), pour tester sans serveur de base.
const fs = require("fs");
const path = require("path");

let impl;

async function init() {
  if (process.env.DB_HOST) {
    const mysql = require("mysql2/promise");
    const pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      charset: "utf8mb4",
      connectionLimit: 5,
      dateStrings: true,
    });
    const schema = fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8");
    for (const stmt of schema.split(";").map(s => s.trim()).filter(Boolean)) await pool.query(stmt);
    impl = {
      all: async (sql, p = []) => (await pool.query(sql, p))[0],
      run: async (sql, p = []) => { const [r] = await pool.query(sql, p); return { id: r.insertId, changes: r.affectedRows }; },
    };
    console.log("Base : MariaDB", process.env.DB_HOST);
  } else {
    const { DatabaseSync } = require("node:sqlite");
    const dir = path.join(__dirname, "..", "data");
    fs.mkdirSync(dir, { recursive: true });
    const db = new DatabaseSync(path.join(dir, "dev.sqlite"));
    const schema = fs.readFileSync(path.join(__dirname, "..", "schema.sql"), "utf8")
      .replace(/INT AUTO_INCREMENT PRIMARY KEY/g, "INTEGER PRIMARY KEY AUTOINCREMENT")
      .replace(/ENGINE=\w+[^;]*/g, "");
    db.exec(schema);
    impl = {
      all: async (sql, p = []) => db.prepare(sql).all(...p),
      run: async (sql, p = []) => { const r = db.prepare(sql).run(...p); return { id: Number(r.lastInsertRowid), changes: r.changes }; },
    };
    console.log("Base : SQLite de test (data/dev.sqlite)");
  }
}

const all = (sql, p) => impl.all(sql, p);
const one = async (sql, p) => (await impl.all(sql, p))[0] || null;
const run = (sql, p) => impl.run(sql, p);

module.exports = { init, all, one, run };
