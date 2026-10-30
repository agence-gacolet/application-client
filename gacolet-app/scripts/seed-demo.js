// Crée les trois clients de test (codes de la démo) s'ils n'existent pas encore.
// Usage : node scripts/seed-demo.js  (mêmes variables d'environnement que le serveur)
const db = require("../src/db");
const DEMO = [
  { code: "GAC-7Q4K-RS", name: "Test réseaux", formula: "Formule Standard", modules: "com", blog: "6875110", goal: 0 },
  { code: "GAC-9M2P-MT", name: "Test Meta", formula: "Campagnes Facebook et Instagram", modules: "meta", blog: "", goal: 10 },
  { code: "GAC-3X8L-RM", name: "Test réseaux et Meta", formula: "Standard et campagnes Meta", modules: "com,meta", blog: "6875110", goal: 10 },
];
const DEF = "une demande reçue via les publicités, avec un projet et un numéro joignable, hors doublons et hors démarchage.";
async function seed() {
  for (const c of DEMO) {
    if (await db.one("SELECT id FROM clients WHERE code = ?", [c.code])) { console.log("Déjà là :", c.code); continue; }
    const r = await db.run("INSERT INTO clients (code, name, formula, modules, metricool_blog_id, contacts_goal, qualified_definition, drive_url, active, created_at) VALUES (?,?,?,?,?,?,?,?,1,?)",
      [c.code, c.name, c.formula, c.modules, c.blog, c.goal, c.goal ? DEF : "", "", new Date().toISOString()]);
    if (c.modules.includes("meta")) {
      const m = new Date().toISOString().slice(0, 8);
      for (const [d, t, s] of [["03", "Demande de devis · Nîmes", "Contact de test"], ["06", "Demande de devis · Beaucaire", "Contact de test"], ["09", "Appel · Vauvert", "Contact de test"]])
        await db.run("INSERT INTO leads (client_id, date, title, detail, created_at) VALUES (?,?,?,?,?)", [r.id, m + d, t, s, new Date().toISOString()]);
    }
    console.log("Créé :", c.code, c.name);
  }
}
module.exports = { seed };
if (require.main === module) db.init().then(seed).then(() => process.exit(0));
