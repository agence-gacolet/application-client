// Lecture directe des tableaux de suivi Meta (Google Sheets) par le serveur, sans Make.
// Un compte de service Google (clé JSON collée dans Paramètres > Liaisons) lit les fichiers partagés avec lui
// (le dossier des tableaux de suivi du Drive de l'agence, en lecture seule). Toutes les 10 minutes, chaque fichier
// modifié est recopié dans l'appli (collection msheets, un document par onglet), exactement comme le faisait Make.
const crypto = require("crypto");
const SKIP = /^(mode d|communes?$|listes?$|param)/i;
module.exports = function gsheets({ db, put, current, stamp, bump }) {
  const sa = () => { try { return JSON.parse(Buffer.from(process.env.GSHEETS_SA_B64 || "", "base64").toString("utf8")); } catch (e) { return null; } };
  let tok = null;
  async function token() {
    if (tok && tok.exp > Date.now() + 60000) return tok.v;
    const k = sa(); if (!k || !k.client_email || !k.private_key) throw new Error("Compte de service Google absent.");
    const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url"), now = Math.floor(Date.now() / 1000);
    const unsigned = b64({ alg: "RS256", typ: "JWT" }) + "." + b64({ iss: k.client_email, scope: "https://www.googleapis.com/auth/spreadsheets.readonly https://www.googleapis.com/auth/drive.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 });
    const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(k.private_key).toString("base64url");
    const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: unsigned + "." + sig }) });
    const j = await r.json(); if (!r.ok) throw new Error("Google refuse la clé : " + (j.error_description || j.error || r.status));
    tok = { v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 }; return tok.v;
  }
  const g = async url => { const r = await fetch(url, { headers: { Authorization: "Bearer " + await token() } }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error((j.error && j.error.message) || "Google " + r.status); return j; };
  const normName = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  // Réglages : quel fichier va à quel client (deviné d'après le nom, modifiable dans Paramètres > Liaisons)
  async function cfg() { return (await current("_msources", "cfg")) || { files: {}, lastRun: "", lastError: "" }; }
  async function guessClient(name) {
    const camp = (await db.all("SELECT data FROM docs WHERE col = 'campaigns' AND deleted = 0")).map(r => { try { return JSON.parse(r.data).client || ""; } catch (e) { return ""; } }).filter(Boolean);
    const pre = normName(String(name).split("_Leads")[0].split("_")[0]);
    return camp.find(c => normName(c) === pre) || camp.find(c => pre.length >= 4 && (normName(c).includes(pre) || pre.includes(normName(c)))) || "";
  }
  async function list() {
    const q = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
    const j = await g("https://www.googleapis.com/drive/v3/files?pageSize=200&fields=files(id,name,modifiedTime,webViewLink)&q=" + q);
    return j.files || [];
  }
  async function syncFile(f, client) {
    const meta = await g("https://sheets.googleapis.com/v4/spreadsheets/" + f.id + "?fields=sheets.properties.title");
    const tabs = (meta.sheets || []).map(s => s.properties.title).filter(t => !SKIP.test(t));
    if (!tabs.length) return 0;
    const qs = tabs.map(t => "ranges=" + encodeURIComponent("'" + t.replace(/'/g, "''") + "'")).join("&");
    const v = await g("https://sheets.googleapis.com/v4/spreadsheets/" + f.id + "/values:batchGet?majorDimension=ROWS&valueRenderOption=FORMATTED_VALUE&" + qs);
    let n = 0;
    for (const r of v.valueRanges || []) {
      const tab = String(r.range || "").split("!")[0].replace(/^'|'$/g, "").replace(/''/g, "'").trim().slice(0, 60);
      let rows = (r.values || []).map(row => row.map(x => x == null ? "" : String(x).slice(0, 4000)));
      // ligne d'en-tête : la première qui contient « Reçu le » ou au moins 3 cellules courtes (le tableau « Contacts » commence parfois plus bas)
      const hi = rows.findIndex(row => row.some(x => /^re[çc]u le$/i.test(x.trim())));
      if (hi > 0) rows = rows.slice(hi);
      while (rows.length && rows[rows.length - 1].every(x => x === "")) rows.pop();
      const width = rows.reduce((m, row) => { let w = row.length; while (w && row[w - 1] === "") w--; return Math.max(m, w); }, 0);
      rows = rows.map(row => { const x = row.slice(0, width); while (x.length < width) x.push(""); return x; });
      const id = ("gs_" + f.id + "__" + tab).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.-]+/g, "_").slice(0, 110);
      const data = { file: f.name, client, tab, url: f.webViewLink || ("https://docs.google.com/spreadsheets/d/" + f.id), rows, syncedAt: new Date().toISOString(), source: "sheets" };
      if (JSON.stringify(data).length > 1500000) continue;
      await put("msheets", id, data); n++;
    }
    return n;
  }
  let running = null;
  async function run(force) {
    if (running) return running;
    running = (async () => {
      const c = await cfg(), out = { files: 0, tabs: 0, errors: [] };
      try {
        const files = await list();
        for (const f of files) {
          const e = c.files[f.id] || (c.files[f.id] = { name: f.name, client: await guessClient(f.name), off: false, modified: "" });
          e.name = f.name;
          if (e.off || !e.client) continue;
          if (!force && e.modified === f.modifiedTime) continue;
          try { out.tabs += await syncFile(f, e.client); e.modified = f.modifiedTime; e.syncedAt = new Date().toISOString(); e.error = ""; out.files++; }
          catch (err) { e.error = String(err.message || err).slice(0, 200); out.errors.push(f.name + " : " + e.error); }
        }
        c.lastError = out.errors.join(" ; ").slice(0, 500);
      } catch (err) { c.lastError = String(err.message || err).slice(0, 300); out.errors.push(c.lastError); }
      c.lastRun = new Date().toISOString(); await put("_msources", "cfg", c); if (out.tabs) bump();
      return out;
    })();
    try { return await running; } finally { running = null; }
  }
  setInterval(() => { if (sa()) run(false).catch(() => {}); }, 10 * 60 * 1000).unref();
  setTimeout(() => { if (sa()) run(false).catch(() => {}); }, 20000).unref();
  return { run, cfg, sa, list };
};
