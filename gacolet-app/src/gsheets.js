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
  // Tous les noms de clients connus : fiches Campagne, fiches du Tableau clients, codes clients
  async function knownClients() {
    const names = []; for (const col of ["campaigns", "clients"]) for (const r of await db.all("SELECT data FROM docs WHERE col = ? AND deleted = 0", [col])) { try { const d = JSON.parse(r.data); const n = d.client || d.name; if (n) names.push(String(n)); } catch (e) {} }
    try { (await db.all("SELECT name FROM clients")).forEach(r => names.push(r.name)); } catch (e) {}
    return [...new Set(names)];
  }
  async function guessClient(name) {
    const camp = await knownClients();
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
    return store(f, client, (v.valueRanges || []).map(r => ({ tab: String(r.range || "").split("!")[0].replace(/^'|'$/g, "").replace(/''/g, "'"), values: r.values })));
  }
  // ---------- Onglet « AppliGacolet » de chaque tableau (rempli chaque matin par Make) : une ligne par campagne Meta ----------
  // Colonnes lues : Mis à jour le, Campagne, Statut, Budget journalier (€), Début, Dépensé à ce jour (€), Contacts Meta, Compte publicitaire.
  // Tient à jour la fiche Campagne du client relié au tableau (créée s'il n'en a pas).
  const APPLI = /^appli\s*(gacolet)?$/i;
  const lab = s => normName(s);
  // « 227,82 », « 1,102.04 », « 9 454 », « 40.00 » : le dernier séparateur est la virgule décimale s'il est suivi de 1 ou 2 chiffres
  const num = v => { let x = String(v == null ? "" : v).replace(/[\s\u00a0\u202f€%]/g, ""); if (!x) return null;
    const i = Math.max(x.lastIndexOf(","), x.lastIndexOf(".")); if (i >= 0 && x.length - i - 1 <= 2) x = x.slice(0, i).replace(/[.,]/g, "") + "." + x.slice(i + 1); else x = x.replace(/[.,]/g, "");
    const n = Number(x); return isFinite(n) ? n : null; };
  const day = v => { const m = String(v || "").match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/); if (m) return (m[3].length === 2 ? "20" + m[3] : m[3]) + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0"); return /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : ""; };
  function readAppli(values) {
    const rows = (values || []).filter(r => Array.isArray(r)), hi = rows.findIndex(r => r.some(x => lab(x) === "campagne")); if (hi < 0) return null;
    const H = rows[hi].map(lab), col = (...keys) => { for (const k of keys) { const i = H.findIndex(h => h === k || h.startsWith(k)); if (i >= 0) return i; } return -1; };
    const C = { at: col("misajourle"), name: col("campagne"), st: col("statut"), bud: col("budgetjournalier", "budget"), start: col("debut"), spent: col("depense"), leads: col("contactsmeta", "contacts"), acc: col("comptepublicitaire", "compte") };
    const v = (r, i) => i < 0 ? "" : String(r[i] == null ? "" : r[i]).trim();
    const camps = rows.slice(hi + 1).filter(r => v(r, C.name)).map(r => ({ name: v(r, C.name), status: v(r, C.st), active: /cours|actif|active|live|diffus/.test(lab(v(r, C.st))), daily: num(v(r, C.bud)), start: day(v(r, C.start)), spent: num(v(r, C.spent)), leads: num(v(r, C.leads)), account: v(r, C.acc), at: v(r, C.at) }));
    return camps.length ? camps : null;
  }
  // Un même tableau pour plusieurs fiches d'un client, ex. « Locamex (particuliers) » et « Locamex (piscinistes) » :
  // chaque campagne va à la fiche dont le mot entre parenthèses figure dans son nom (6 premières lettres, sans accents ni casse),
  // sinon à la fiche à laquelle le tableau est relié.
  async function applyAppli(client, camps, file) {
    if (!client || !camps) return;
    const base = String(client).split(" (")[0], names = new Set();
    for (const r of await db.all("SELECT data FROM docs WHERE col = 'campaigns' AND deleted = 0")) { try { const n = JSON.parse(r.data).client; if (n && normName(String(n).split(" (")[0]) === normName(base) && /\(([^)]+)\)/.test(n)) names.add(n); } catch (e) {} }
    if (names.size > 1) { const q = n => normName(n.match(/\(([^)]+)\)/)[1]).slice(0, 6), byName = c => [...names].find(n => normName(c.name).includes(q(n))) || client;
      for (const n of names) { const mine = camps.filter(c => byName(c) === n); if (mine.length) await applyOne(n, mine, file); } return; }
    return applyOne(client, camps, file);
  }
  async function applyOne(client, camps, file) {
    const list = []; for (const r of await db.all("SELECT id, data FROM docs WHERE col = 'campaigns' AND deleted = 0")) { try { const d = JSON.parse(r.data); if (normName(d.client) === normName(client)) list.push(Object.assign({ id: r.id }, d)); } catch (e) {} }
    const RK = { "En cours": 0, "À lancer": 1 }; list.sort((x, y) => (RK[x.status] ?? 2) - (RK[y.status] ?? 2) || String(y.launchedAt || "").localeCompare(String(x.launchedAt || "")));
    const cur = list[0], act = camps.filter(c => c.active), sum = (a, k) => a.reduce((t, c) => t + (c[k] || 0), 0);
    const starts = act.map(c => c.start).filter(Boolean).sort();
    const meta = { at: new Date().toISOString(), source: "tableau", file, readAt: camps[0].at || "", account: (camps.find(c => c.account) || {}).account || "",
      live: act.map(c => c.name), campaigns: camps.map(c => ({ name: c.name, status: c.status, daily: c.daily, start: c.start, spent: c.spent, leads: c.leads })),
      spentToDate: Math.round(sum(act, "spent") * 100) / 100, leadsToDate: sum(act, "leads"), daily: Math.round(sum(act, "daily") * 100) / 100, since: starts[0] || "" };
    const next = Object.assign({}, cur || { client, createdAt: new Date().toISOString(), createdBy: "Tableau de suivi" }, { meta });
    delete next.id;
    // le statut et la date de lancement de la fiche ne bougent que si le tableau dit qu'une campagne tourne ; le budget de la fiche (contrat) n'est jamais touché
    if (act.length) next.status = "En cours"; else if (!next.status) next.status = "À lancer";
    if (!next.launchedAt && starts[0]) next.launchedAt = starts[0];
    const same = (x, y) => JSON.stringify(Object.assign({}, x, { id: undefined, meta: Object.assign({}, x.meta, { at: "" }) })) === JSON.stringify(Object.assign({}, y, { id: undefined, meta: Object.assign({}, y.meta, { at: "" }) }));
    if (cur && cur.meta && same(cur, next)) return;
    await put("campaigns", cur ? cur.id : "cp" + Date.now().toString(36) + crypto.randomBytes(3).toString("hex"), next);
  }
  // Recopie des onglets d'un fichier (lus par le compte de service ou envoyés par le script Google de l'agence)
  async function store(f, client, tabs) {
    const ap = (tabs || []).find(t => APPLI.test(String(t.tab || "").trim())); if (ap){ try { await applyAppli(client, readAppli(ap.values), f.name); } catch (e) { console.error("Onglet APPLI", e.message); } }
    let n = 0;
    for (const r of tabs || []) {
      const tab = String(r.tab || "").trim().slice(0, 60); if (!tab || SKIP.test(tab)) continue;
      let rows = (Array.isArray(r.values) ? r.values : []).map(row => (Array.isArray(row) ? row : []).map(x => x == null ? "" : String(x).slice(0, 4000)));
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
  // Mode « script Google » : un script Apps Script du compte de l'agence lit le dossier des tableaux et poste ici toutes les 10 minutes.
  // Corps : { files: [{ id, name, url, modified, tabs: [{ tab, values }] | null }] } (tabs null = fichier inchangé, seulement listé).
  // Réponse : stored = fichiers recopiés ; again = fichiers à renvoyer en entier au prochain passage (client changé, « Relire maintenant »).
  async function pushKey() { const c = await cfg(); if (!c.pushKey) { c.pushKey = crypto.randomBytes(24).toString("hex"); await put("_msources", "cfg", c); } return c.pushKey; }
  async function push(body) {
    const c = await cfg(), out = { stored: [], waiting: [], again: [], tabs: 0, errors: [] };
    for (const f of (body && Array.isArray(body.files) ? body.files : []).slice(0, 200)) {
      const id = String(f.id || ""); if (!/^[\w-]{10,80}$/.test(id)) continue;
      const e = c.files[id] || (c.files[id] = { name: String(f.name || id), client: await guessClient(f.name), off: false, modified: "" });
      e.name = String(f.name || e.name).slice(0, 200); e.seen = new Date().toISOString();
      if (e.off){ out.waiting.push(id); continue; }
      // Nouveau tableau pas encore relié : il attend qu'on le choisisse dans Paramètres > Codes clients
      if (!e.client){ out.waiting.push(id); continue; }
      if (!Array.isArray(f.tabs)){ if (e.resend) out.again.push(id); continue; }
      try { out.tabs += await store({ id, name: e.name, webViewLink: /^https:\/\/docs\.google\.com\//.test(f.url || "") ? String(f.url) : "" }, e.client, f.tabs);
        e.modified = String(f.modified || ""); e.syncedAt = new Date().toISOString(); e.error = ""; e.resend = false; out.stored.push(id); }
      catch (err) { e.error = String(err.message || err).slice(0, 200); out.errors.push(e.name + " : " + e.error); }
    }
    c.lastRun = new Date().toISOString(); c.lastPush = c.lastRun; c.lastError = out.errors.join(" ; ").slice(0, 500);
    await put("_msources", "cfg", c); if (out.tabs) bump();
    return out;
  }
  setInterval(() => { if (sa()) run(false).catch(() => {}); }, 10 * 60 * 1000).unref();
  setTimeout(() => { if (sa()) run(false).catch(() => {}); }, 20000).unref();
  return { run, cfg, sa, list, push, pushKey };
};
