// Connecteur Claude « Gacolet » (MCP distant, adresse <appli>/mcp).
// Ajouté une fois pour l'organisation Claude (Paramètres d'administration > Connecteurs) ; chaque personne clique sur
// « Se connecter » et entre SES identifiants de l'appli (OAuth). Claude agit ensuite avec CE compte et ses droits :
// tout passe par les routes habituelles de l'appli (/api/g/...), donc les mêmes règles d'accès qu'à l'écran.
// Le code et les réglages de l'appli ne sont pas accessibles par ici.
const crypto = require("crypto");

const MOTS = [["50", /\bmeta\b|campagne|publicit|formulaire|\bpub\b|\bads?\b/i],
  ["60", /\bsite\b|seo|h[ée]bergement|domaine|fiche google|r[ée]f[ée]rencement|elementor/i],
  ["30", /logo|flyer|carte|visuel|charte|impression|imprim/i],
  ["40", /publication|carrousel|story|stories|l[ée]gende|calendrier|metricool|mod[ée]ration|description/i],
  ["20", /tournage|montage|monter|rush|r[ée]el|vid[ée]o|photo|sous-titre|d[ée]rush|export|edit\b/i],
  ["10", /strat[ée]gie|ligne [ée]ditoriale|audit/i]];
const poleDe = t => (MOTS.find(([, r]) => r.test(t)) || ["00"])[0];
const COLS_LIBRES = ["events", "tasks", "commercial", "campaigns", "rushes", "publications", "clients", "cevents", "keydates", "posts", "edtodo", "meta", "messages", "formations", "idees", "pilotage", "ca", "finance", "strategies", "shoots"];

module.exports = function mcp({ app, wrap, db, ensure, who, checkPw, makeToken, sign, eq }) {
  const base = req => (String(req.get("x-forwarded-proto") || req.protocol).split(",")[0].trim()) + "://" + req.get("host");
  const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
  const seal = (kind, o) => kind + "." + b64(o) + "." + sign(kind + "." + b64(o));
  function open(kind, s) {
    const [k, p, g] = String(s || "").split(".");
    if (k !== kind || !p || !g || !eq(g, sign(k + "." + p))) return null;
    try { const o = JSON.parse(Buffer.from(p, "base64url").toString()); return o && (!o.e || o.e > Date.now()) ? o : null; } catch (e) { return null; }
  }
  // Adresses de retour acceptées : Claude (claude.ai, claude.com, anthropic.com) et les outils locaux (Claude Code).
  const okRedirect = u => { try { const x = new URL(u); return (x.protocol === "https:" && /(^|\.)(claude\.ai|claude\.com|anthropic\.com)$/.test(x.hostname)) || (x.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(x.hostname)); } catch (e) { return false; } };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---------- Découverte OAuth ----------
  app.get("/.well-known/oauth-protected-resource*", (req, res) => res.json({ resource: base(req) + "/mcp", authorization_servers: [base(req)], bearer_methods_supported: ["header"], resource_name: "Appli Gacolet" }));
  app.get("/.well-known/oauth-authorization-server*", (req, res) => { const b = base(req); res.json({ issuer: b, authorization_endpoint: b + "/oauth/authorize", token_endpoint: b + "/oauth/token", registration_endpoint: b + "/oauth/register",
    response_types_supported: ["code"], grant_types_supported: ["authorization_code", "refresh_token"], code_challenge_methods_supported: ["S256"], token_endpoint_auth_methods_supported: ["none"], scopes_supported: ["gacolet"] }); });
  // Inscription d'un client (sans base : l'identifiant porte lui-même les adresses de retour, signées)
  app.post("/oauth/register", (req, res) => {
    const uris = Array.isArray((req.body || {}).redirect_uris) ? req.body.redirect_uris.map(String) : [];
    if (!uris.length || !uris.every(okRedirect)) return res.status(400).json({ error: "invalid_redirect_uri" });
    res.status(201).json({ client_id: seal("c1", { r: uris.slice(0, 5) }), client_id_issued_at: Math.floor(Date.now() / 1000), redirect_uris: uris, grant_types: ["authorization_code", "refresh_token"], response_types: ["code"], token_endpoint_auth_method: "none", client_name: String((req.body || {}).client_name || "Claude").slice(0, 80) });
  });
  const clientOk = (cid, uri) => { const c = open("c1", cid); return !!(c && Array.isArray(c.r) && c.r.includes(uri)); };

  // ---------- Page de connexion (identifiants de l'appli) ----------
  function page(res, q, err) {
    const hid = ["client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope"].map(k => `<input type="hidden" name="${k}" value="${esc(q[k])}">`).join("");
    res.set("Content-Type", "text/html; charset=utf-8").send(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connexion Gacolet</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1D1D1B;color:#fff;font:16px/1.4 -apple-system,system-ui,sans-serif}form{width:min(360px,calc(100vw - 32px));background:#2a2a28;border-radius:16px;padding:28px;box-sizing:border-box}
h1{margin:0 0 6px;font-size:22px}p{margin:0 0 20px;color:#bbb;font-size:14px}label{display:block;font-size:13px;color:#bbb;margin:12px 0 6px}input[type=text],input[type=password]{width:100%;box-sizing:border-box;padding:12px;border-radius:10px;border:1px solid #444;background:#1D1D1B;color:#fff;font-size:16px}
button{margin-top:20px;width:100%;padding:13px;border:0;border-radius:10px;background:#C6FF33;color:#1D1D1B;font-weight:700;font-size:16px;cursor:pointer}.err{color:#ff8a80;margin-top:12px;font-size:14px}</style></head><body>
<form method="post" action="/oauth/authorize">${hid}<h1>Relier Claude à Gacolet</h1><p>Claude pourra agir dans l’appli avec ton compte et tes accès, rien de plus.</p>
<label>Identifiant</label><input type="text" name="username" autocomplete="username" autocapitalize="none" required autofocus>
<label>Mot de passe</label><input type="password" name="password" autocomplete="current-password" required>
<button type="submit">Autoriser</button>${err ? `<div class="err">${esc(err)}</div>` : ""}</form></body></html>`);
  }
  const checkQ = q => { if (!okRedirect(q.redirect_uri) || !clientOk(q.client_id, q.redirect_uri)) return "Adresse de retour refusée."; if (!q.code_challenge || (q.code_challenge_method || "S256") !== "S256") return "Demande incomplète (PKCE)."; return ""; };
  app.get("/oauth/authorize", (req, res) => { const q = req.query || {}; const no = checkQ(q); if (no) return res.status(400).send(esc(no)); page(res, q, ""); });
  const tries = new Map();
  app.post("/oauth/authorize", require("express").urlencoded({ extended: false }), wrap(async (req, res) => {
    await ensure(); const q = req.body || {}; const no = checkQ(q); if (no) return res.status(400).send(esc(no));
    const ip = req.ip || "x", t = tries.get(ip) || { n: 0, at: Date.now() };
    if (Date.now() - t.at > 10 * 60000) { t.n = 0; t.at = Date.now(); }
    if (t.n >= 10) return page(res, q, "Trop d’essais. Réessaie dans quelques minutes.");
    const username = String(q.username || "").trim().toLowerCase();
    const u = username ? await db.one("SELECT * FROM gusers WHERE username = ?", [username]) : null;
    if (!u || Number(u.disabled) || !u.pass || !checkPw(String(q.password || ""), u.pass)) { t.n++; tries.set(ip, t); return page(res, q, "Identifiant ou mot de passe incorrect."); }
    tries.delete(ip);
    const code = seal("k1", { i: u.id, v: Number(u.pv) || 0, c: String(q.code_challenge), r: String(q.redirect_uri), n: crypto.randomBytes(8).toString("hex"), e: Date.now() + 5 * 60000 });
    const to = new URL(q.redirect_uri); to.searchParams.set("code", code); if (q.state) to.searchParams.set("state", q.state);
    res.redirect(302, to.toString());
  }));

  // ---------- Jetons ----------
  const used = new Map();
  app.post("/oauth/token", require("express").urlencoded({ extended: false }), wrap(async (req, res) => {
    await ensure(); const b = req.body || {};
    const fail = (e, d) => res.status(400).json({ error: e, error_description: d });
    let uid, pv;
    if (b.grant_type === "authorization_code") {
      const c = open("k1", b.code); if (!c) return fail("invalid_grant", "Code expiré ou invalide.");
      if (used.has(c.n)) return fail("invalid_grant", "Code déjà utilisé."); used.set(c.n, c.e); for (const [k, e] of used) if (e < Date.now()) used.delete(k);
      if (c.r !== String(b.redirect_uri || "")) return fail("invalid_grant", "Adresse de retour différente.");
      const h = crypto.createHash("sha256").update(String(b.code_verifier || "")).digest("base64url"); if (!eq(h, c.c)) return fail("invalid_grant", "Vérification PKCE échouée.");
      uid = c.i; pv = c.v;
    } else if (b.grant_type === "refresh_token") {
      const r = open("r1", b.refresh_token); if (!r) return fail("invalid_grant", "Reconnecte le connecteur.");
      uid = r.i; pv = r.v;
    } else return fail("unsupported_grant_type", "");
    const u = await db.one("SELECT * FROM gusers WHERE id = ?", [uid]);
    if (!u || Number(u.disabled) || !u.pass || Number(u.pv) !== pv) return fail("invalid_grant", "Compte suspendu ou mot de passe changé : reconnecte le connecteur.");
    res.set("Cache-Control", "no-store").json({ access_token: makeToken(u), token_type: "Bearer", expires_in: 180 * 86400, refresh_token: seal("r1", { i: u.id, v: Number(u.pv) || 0, e: Date.now() + 365 * 864e5 }), scope: "gacolet" });
  }));

  // ---------- Outils ----------
  const PORT = Number(process.env.PORT || 3000);
  async function api(req, meth, path, body) {
    const r = await fetch("http://127.0.0.1:" + PORT + path, { method: meth, headers: { "Content-Type": "application/json", Authorization: req.get("authorization") }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || ("Erreur " + r.status));
    return j;
  }
  const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const S = (v, n) => String(v == null ? "" : v).trim().slice(0, n);
  const date = (v, champ) => { const d = S(v, 10); if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error(champ + " : format AAAA-MM-JJ attendu."); return d; };
  const signe = (u, d) => { const t = new Date().toISOString(); return Object.assign(d, { createdAt: t, createdBy: u.name, updatedAt: t, updatedBy: u.name }); };

  const TOOLS = [
    { name: "qui_suis_je", description: "Le compte Gacolet connecté (nom, accès) et l'équipe (prénoms à utiliser dans « qui »).", inputSchema: { type: "object", properties: {} },
      run: async req => { const r = await api(req, "GET", "/api/g-me"); return { moi: { nom: r.user.name, acces_complet: r.user.role === "owner", pages: r.user.views }, equipe: (r.team || []).map(t => t.name), aujourdhui: today() }; } },
    { name: "lister", description: "Lit des éléments de l'appli que le compte a le droit de voir. Collections utiles : tasks (tâches), events (agenda), clients, shoots (feuilles de tournage), commercial, campaigns, publications, idees, strategies. Filtre texte facultatif sur tout le contenu.",
      inputSchema: { type: "object", properties: { collection: { type: "string", enum: COLS_LIBRES }, recherche: { type: "string", description: "texte à chercher (sans accents ni majuscules requis)" }, qui: { type: "string", description: "prénom (tâches : responsable ; agenda : participant)" }, avec_terminees: { type: "boolean", description: "tâches faites / événements passés compris (défaut : non)" }, limite: { type: "number", description: "défaut 100, max 500" } }, required: ["collection"] },
      run: async (req, a) => {
        const r = await api(req, "GET", "/api/g/changes"), col = a.collection, n = Math.min(Number(a.limite) || 100, 500);
        const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase(), q = norm(a.recherche), t = today();
        let out = (r.docs || []).filter(d => d.col === col && !d.deleted).map(d => Object.assign({ id: d.id }, d.data));
        if (!a.avec_terminees && col === "tasks") out = out.filter(d => !d.done);
        if (!a.avec_terminees && col === "events") out = out.filter(d => (d.date || "") >= t);
        if (a.qui) out = out.filter(d => col === "events" ? (d.who || []).includes(a.qui) : d.who === a.qui || d.owner === a.qui);
        if (q) out = out.filter(d => norm(JSON.stringify(d)).includes(q));
        out.sort((x, y) => String(x.date || x.updatedAt || "").localeCompare(String(y.date || y.updatedAt || "")));
        return { total: out.length, elements: out.slice(0, n) };
      } },
    { name: "ajouter_tache", description: "Crée une tâche dans l'appli. Pas de note de suivi (« Demandé par… ») : une note seulement si la personne la dicte. Un compte sans accès complet ne peut créer que ses propres tâches.",
      inputSchema: { type: "object", properties: { qui: { type: "string", description: "prénom du responsable (voir qui_suis_je)" }, titre: { type: "string" }, client: { type: "string", description: "nom du client tel qu'il est dans l'appli, ou « Agence Gacolet »" }, date: { type: "string", description: "date de rendu AAAA-MM-JJ" }, pole: { type: "string", enum: ["00", "10", "20", "30", "40", "50", "60"], description: "deviné d'après le titre si absent" }, date_publication: { type: "string", description: "AAAA-MM-JJ, reportée dans le calendrier éditorial du client" }, note: { type: "string" } }, required: ["qui", "titre"] },
      run: async (req, a) => {
        const titre = S(a.titre, 300); if (!titre) throw new Error("Titre vide.");
        const d = signe(req.mcpUser, { who: S(a.qui, 80), pole: a.pole || poleDe(titre), client: S(a.client, 120), title: titre[0].toUpperCase() + titre.slice(1), date: date(a.date, "date"), done: false, doneAt: "", postDate: date(a.date_publication, "date_publication"), note: S(a.note, 4000) });
        if (d.postDate && !d.client) throw new Error("date_publication demande un client.");
        const r = await api(req, "POST", "/api/g/tasks", { data: d }); return { ok: true, id: r.id, tache: d };
      } },
    { name: "ajouter_evenement", description: "Crée un événement dans l'agenda de l'appli (visible par toute l'équipe).",
      inputSchema: { type: "object", properties: { date: { type: "string", description: "AAAA-MM-JJ" }, type: { type: "string", enum: ["Tournage", "Éditorial", "Maroudeur", "Rendez-vous"] }, titre: { type: "string" }, client: { type: "string" }, heure: { type: "string", description: "HH:MM" }, qui: { type: "array", items: { type: "string" }, description: "prénoms des participants" }, lieu: { type: "string" }, note: { type: "string" }, statut: { type: "string", enum: ["Prévu", "Fait", "Annulé"] } }, required: ["date", "type"] },
      run: async (req, a) => {
        const h = S(a.heure, 5); if (h && !/^\d{1,2}:\d{2}$/.test(h)) throw new Error("heure : format HH:MM attendu.");
        const d = signe(req.mcpUser, { client: S(a.client, 120), type: a.type, title: S(a.titre, 300) || a.type, date: date(a.date, "date"), time: h, who: (a.qui || []).map(x => S(x, 80)).filter(Boolean), status: a.statut || "Prévu", place: S(a.lieu, 300), note: S(a.note, 4000), files: [] });
        if (!d.date) throw new Error("Date obligatoire.");
        const r = await api(req, "POST", "/api/g/events", { data: d }); return { ok: true, id: r.id, evenement: d };
      } },
    { name: "modifier", description: "Modifie des champs d'un élément existant (id donné par « lister »). Tâches : who, title, client, date, done (true/false), pole, postDate, note. Agenda : date, time, type, title, client, who (liste), place, note, status.",
      inputSchema: { type: "object", properties: { collection: { type: "string", enum: COLS_LIBRES }, id: { type: "string" }, champs: { type: "object", description: "seulement les champs à changer" } }, required: ["collection", "id", "champs"] },
      run: async (req, a) => {
        const ch = Object.assign({}, a.champs || {}); ["createdAt", "createdBy"].forEach(k => delete ch[k]);
        if (a.collection === "tasks" && "done" in ch) ch.doneAt = ch.done ? new Date().toISOString() : "";
        Object.assign(ch, { updatedAt: new Date().toISOString(), updatedBy: req.mcpUser.name });
        await api(req, "PATCH", "/api/g/" + encodeURIComponent(a.collection) + "/" + encodeURIComponent(a.id), { data: ch }); return { ok: true };
      } },
    { name: "creer", description: "Crée un élément dans une autre collection (prospect commercial, idée, publication…) avec les champs donnés. Pour les tâches et l'agenda, préférer ajouter_tache / ajouter_evenement.",
      inputSchema: { type: "object", properties: { collection: { type: "string", enum: COLS_LIBRES }, donnees: { type: "object" } }, required: ["collection", "donnees"] },
      run: async (req, a) => { const r = await api(req, "POST", "/api/g/" + encodeURIComponent(a.collection), { data: signe(req.mcpUser, Object.assign({}, a.donnees || {})) }); return { ok: true, id: r.id }; } },
    { name: "supprimer", description: "Met un élément à la corbeille de l'appli (restaurable 30 jours). Toujours confirmer avec la personne avant.",
      inputSchema: { type: "object", properties: { collection: { type: "string", enum: COLS_LIBRES }, id: { type: "string" } }, required: ["collection", "id"] },
      run: async (req, a) => { await api(req, "DELETE", "/api/g/" + encodeURIComponent(a.collection) + "/" + encodeURIComponent(a.id)); return { ok: true }; } }
  ];

  // Garde la date de la dernière connexion de Claude (étape « Relier Claude » des Premiers pas)
  async function marque(u) {
    const r = await db.one("SELECT info FROM gusers WHERE id = ?", [u.id]); if (!r) return;
    let info = {}; try { info = JSON.parse(r.info || "{}"); } catch (e) {}
    const t = new Date().toISOString(); if (info.claude && t.slice(0, 10) === String(info.claude).slice(0, 10)) return;
    info.claude = t; await db.run("UPDATE gusers SET info = ? WHERE id = ?", [JSON.stringify(info), u.id]);
  }

  // ---------- Point d'entrée MCP (JSON-RPC, transport HTTP) ----------
  const unauth = (req, res) => res.status(401).set("WWW-Authenticate", `Bearer resource_metadata="${base(req)}/.well-known/oauth-protected-resource"`).json({ error: "Connexion requise." });
  app.get("/mcp", (req, res) => res.status(405).set("Allow", "POST").end());
  app.delete("/mcp", (req, res) => res.status(204).end());
  app.post("/mcp", wrap(async (req, res) => {
    await ensure(); const u = await who(req); if (!u || u.secours) return unauth(req, res);
    req.mcpUser = u;
    const one = async m => {
      const id = m && m.id, ok = result => ({ jsonrpc: "2.0", id, result }), ko = (code, message) => ({ jsonrpc: "2.0", id, error: { code, message } });
      if (!m || m.jsonrpc !== "2.0" || typeof m.method !== "string") return ko(-32600, "Requête invalide");
      if (id === undefined || id === null) return null; // notification
      if (m.method === "initialize") { marque(u).catch(() => {}); return ok({ protocolVersion: (m.params && m.params.protocolVersion) || "2025-06-18", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "gacolet", title: "Appli Gacolet", version: "1.0.0" }, instructions: "Appli de l'Agence Gacolet. Tu agis avec le compte de la personne connectée (qui_suis_je). Dates au format AAAA-MM-JJ, heure de Paris. Pas de note de suivi sur les tâches sauf si la personne la dicte. Confirmer avant toute suppression." }); }
      if (m.method === "ping") return ok({});
      if (m.method === "tools/list") return ok({ tools: TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      if (m.method === "tools/call") {
        const t = TOOLS.find(x => x.name === (m.params || {}).name); if (!t) return ko(-32602, "Outil inconnu");
        try { const r = await t.run(req, (m.params || {}).arguments || {}); return ok({ content: [{ type: "text", text: JSON.stringify(r, null, 1) }], structuredContent: r }); }
        catch (e) { return ok({ content: [{ type: "text", text: "Refusé : " + (e.message || e) }], isError: true }); }
      }
      return ko(-32601, "Méthode inconnue : " + m.method);
    };
    const body = req.body;
    if (Array.isArray(body)) { const out = (await Promise.all(body.map(one))).filter(Boolean); return out.length ? res.json(out) : res.status(202).end(); }
    const r = await one(body); if (!r) return res.status(202).end();
    res.json(r);
  }));
};
