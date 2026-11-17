// Dépôt de productions : vidéos et visuels déposés dans Publications, descriptions proposées par Claude
// d'après la fiche et la stratégie du client, dates choisies selon son rythme, puis programmation dans Metricool.
// Clé Claude : ANTHROPIC_API_KEY (Paramètres > Liaisons). Clé Metricool : METRICOOL_USER_TOKEN (déjà en place).
const Anthropic = require("@anthropic-ai/sdk");

module.exports = function production({ app, auth, wrap, db, current, put, pubPlan, persistKey, macAuth, upDir }) {
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const docsOf = async col => (await db.all("SELECT id, data FROM docs WHERE col = ? AND deleted = 0", [col])).map(r => { try { return Object.assign({ id: r.id }, JSON.parse(r.data || "{}")); } catch (e) { return null; } }).filter(Boolean);
  // Marques hors Publications (pas d'objectif mensuel) : l'agence et Gabriel
  const EXTRA = [["Agence Gacolet", "6874994", 0, 0], ["Gabriel", "6875110", 0, 0]];
  const blogOf = name => { const x = EXTRA.find(([n]) => norm(n) === norm(name)); if (x) return x[1]; const p = pubPlan.find(([n]) => norm(n) === norm(name)) || pubPlan.find(([n]) => norm(name).includes(norm(n)) || norm(n).includes(norm(name))); return p && p[1] ? p[1] : ""; };
  // Sinon : la marque enregistrée sur le code client (Paramètres > Codes clients), même nom que la fiche
  const blogFor = async name => { const b = blogOf(name); if (b) return b; const c = (await db.all("SELECT name, metricool_blog_id FROM clients WHERE metricool_blog_id <> ''")).find(x => norm(x.name) === norm(name)); return c ? String(c.metricool_blog_id) : ""; };
  const mc = async (method, path, q, body) => {
    const tok = process.env.METRICOOL_USER_TOKEN; if (!tok) throw Object.assign(new Error("La clé Metricool n’est pas sur le serveur."), { status: 400 });
    const qs = new URLSearchParams(Object.assign({ userId: process.env.METRICOOL_USER_ID || "4634230" }, q));
    const r = await fetch("https://app.metricool.com/api" + path + "?" + qs, { method, headers: { "X-Mc-Auth": tok, Accept: "application/json", "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch (e) {}
    if (!r.ok) throw Object.assign(new Error("Metricool refuse (" + r.status + ") : " + String((j && (j.message || j.error)) || t).slice(0, 200)), { status: 502 });
    return j;
  };
  async function clientContext(name) {
    const fiche = (await docsOf("clients")).find(c => norm(c.name) === norm(name)) || {};
    const strat = (await docsOf("strategies")).find(s => norm(s.client) === norm(name));
    return { fiche, strat: strat ? String(strat.raw || "").slice(0, 9000) : "" };
  }

  // Heure habituelle du client : lue dans sa fiche (« publiés à 18 h », « lundi à 10 h »), sinon 18 h
  const usualHour = f => { const m = String([f.perMonth, f.remember].join(" ")).match(/(\d{1,2})\s*h\s*(\d{2})?/); return m ? String(m[1]).padStart(2, "0") + ":" + (m[2] || "00") : "18:00"; };
  const perMonth = f => { const m = String(f.perMonth || "").match(/\d+/); return m ? Math.max(1, Math.min(31, Number(m[0]))) : 8; };

  // Créneaux proposés : à la suite des publications déjà programmées, au rythme de la formule (posts par mois), jamais deux le même jour
  app.get("/api/g-prod/slots", auth, wrap(async (req, res) => {
    // Date conseillée : selon ce qui est déjà publié ou programmé ce mois-ci, ce qui manque pour la formule (posts par mois),
    // les jours de publication écrits dans la fiche ou la stratégie (« mardi 12 h », « le lundi »), jamais deux le même jour
    const name = String(req.query.client || ""), n = Math.max(1, Math.min(20, Number(req.query.n) || 1));
    // Gabriel : 10 publications par jour sur une grille d'horaires fixe ; on prend les prochains créneaux libres
    if (norm(name) === "gabriel") {
      const GRID = ["08:30","09:30","10:15","11:00","12:00","13:30","15:00","16:30","18:00","19:30"], used = new Set(), blogG = await blogFor(name);
      const d0 = new Date(), d1 = new Date(); d1.setDate(d1.getDate() + 20); const isoD = x => x.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
      if (process.env.METRICOOL_USER_TOKEN) { try { const j = await mc("GET", "/v2/scheduler/posts", { blogId: blogG, start: isoD(d0) + "T00:00:00", end: isoD(d1) + "T23:59:59", timezone: "Europe/Paris" });
        (Array.isArray(j) ? j : (j && j.data) || []).forEach(p => { const dt = String((p.publicationDate && p.publicationDate.dateTime) || ""); if (dt) used.add(dt.slice(0, 16)); }); } catch (e) {} }
      const nowP = new Date().toLocaleString("sv-SE", { timeZone: "Europe/Paris" }).slice(0, 16).replace(" ", "T"), out = [];
      for (let k = 0; k < 20 && out.length < n; k++) { const d = new Date(); d.setDate(d.getDate() + k); const day = isoD(d);
        for (const t of GRID) { const key = day + "T" + t; if (key <= nowP || used.has(key)) continue; out.push({ date: day, time: t }); used.add(key); if (out.length >= n) break; } }
      return res.json({ slots: out, blog: true, hour: "", perMonth: 300 });
    }
    const { fiche, strat } = await clientContext(name), blog = await blogFor(name), hour = usualHour(fiche), plan = perMonth(fiche);
    const DAYS = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"], rythme = (String(strat).match(/##\s*Rythme[\s\S]*?(?=\n##\s|$)/i) || [""])[0] + " " + (fiche.perMonth || "");
    const pref = DAYS.map((d, k) => new RegExp("\\b" + d + "s?\\b", "i").test(rythme) ? k : -1).filter(k => k >= 0);
    const hm = String(rythme).match(/(\d{1,2})\s*h\s*(\d{2})?/); const H = hm ? String(hm[1]).padStart(2, "0") + ":" + (hm[2] || "00") : hour;
    const taken = new Map(), iso = x => x.toISOString().slice(0, 10), now = new Date(), m0 = new Date(now.getFullYear(), now.getMonth(), 1, 12);
    if (blog && process.env.METRICOOL_USER_TOKEN) {
      const to = new Date(); to.setDate(to.getDate() + 75);
      try { const j = await mc("GET", "/v2/scheduler/posts", { blogId: blog, start: iso(m0) + "T00:00:00", end: iso(to) + "T23:59:59", timezone: "Europe/Paris" });
        (Array.isArray(j) ? j : (j && j.data) || []).filter(p => !p.draft && !((p.instagramData || {}).type === "STORY")).forEach(p => { const day = String((p.publicationDate && p.publicationDate.dateTime) || "").slice(0, 10); if (day) taken.set(day, (taken.get(day) || 0) + 1); }); } catch (e) {}
    }
    const out = []; const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1); tomorrow.setHours(12);
    const monthOf = d => iso(d).slice(0, 7), countIn = mk => [...taken.entries()].filter(([d]) => d.startsWith(mk)).reduce((a, [, c]) => a + c, 0);
    let cur = new Date(tomorrow), guard = 0;
    while (out.length < n && guard++ < 400) {
      const mk = monthOf(cur), done = countIn(mk) + out.filter(o => o.date.startsWith(mk)).length;
      if (done >= plan) { cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1, 12); continue; }   // mois déjà complet : on passe au suivant
      const last = new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 12), daysLeft = Math.max(1, Math.round((last - cur) / 864e5) + 1), gap = Math.max(1, Math.floor(daysLeft / (plan - done)));
      // premier jour libre à partir de cur, de préférence un jour prévu par la stratégie
      let pick = null; for (let k = 0; k < Math.min(gap + 6, daysLeft) && !pick; k++){ const d = new Date(cur); d.setDate(cur.getDate() + k); const day = iso(d); if (taken.has(day) || out.some(o => o.date === day)) continue; if (!pref.length || pref.includes(d.getDay())) pick = d; }
      if (!pick) { for (let k = 0; k < daysLeft && !pick; k++){ const d = new Date(cur); d.setDate(cur.getDate() + k); const day = iso(d); if (!taken.has(day) && !out.some(o => o.date === day)) pick = d; } }
      if (!pick) { cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1, 12); continue; }
      out.push({ date: iso(pick), time: H, why: (plan - done) + " publication" + (plan - done > 1 ? "s" : "") + " sur " + plan + " encore à faire en " + ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"][Number(mk.slice(5, 7)) - 1] + (pref.length ? ", jour prévu par la stratégie" : "") });
      cur = new Date(pick); cur.setDate(pick.getDate() + gap);
    }
    res.json({ slots: out, blog: !!blog, hour: H, perMonth: plan, days: pref.map(k => DAYS[k]), thisMonth: countIn(monthOf(now)) });
  }));

  // Sans clé Claude : la demande part dans une file (_descq) ; Claude Code, sur le Mac de l'agence, la relève chaque minute (tâche planifiée « gacolet-descriptions »)
  // avec l'abonnement Claude (rien à payer en plus), puis renvoie les trois propositions.
  const RULES = "Règles : français, au ton du client, deux émojis au plus, pas de tiret long, pas de formule toute faite ni de marque d'écriture automatique, pas de superlatif non sourcé, pas de prénom de l'équipe de l'agence, aucun chiffre sans source. Disposition habituelle de l'agence, à respecter exactement, blocs séparés par une ligne vide : 1) une accroche d'une ligne, sans émoji ; ligne vide ; 2) un paragraphe de 2 à 4 phrases qui reprend ce que dit la vidéo (tutoiement si le client tutoie) ; ligne vide ; 3) une ligne d'invitation à agir signée par le client (ex. « Maître nageur à Lunel, je réponds à tes questions : écris-moi en message privé. »), avec au plus un émoji, à la fin de la ligne ; ligne vide ; 4) une ligne de 4 à 6 mots-dièse écrits avec une majuscule à chaque mot (#StageDeNatation), le premier au nom du client (ex. #HugoMaitreNageur), sans accents. Trois descriptions aux angles différents.";
  app.get("/api/g-prod/describe/:id", auth, wrap(async (req, res) => { const q = await current("_descq", String(req.params.id)); if (!q) return res.status(404).json({ error: "Demande introuvable." }); res.json({ status: q.status, propositions: q.propositions || [], transcript: q.transcript || "", error: q.error || "" }); }));
  app.get("/api/g-prod/queue", macAuth, wrap(async (req, res) => {
    const base = (req.get("x-forwarded-proto") || req.protocol) + "://" + req.get("host");
    if (req.get("x-desc-key")) workerSeen = Date.now();
    // Demande prise par un Mac mais sans réponse depuis 10 minutes : de nouveau disponible
    const list = (await docsOf("_descq")).filter(q => q.status === "wait" || (q.status === "run" && Date.now() - Date.parse(q.runAt || 0) > 600000)).sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(0, 10);
    const out = []; for (const q of list) { const { fiche, strat } = await clientContext(q.client); out.push({ id: q.id, client: q.client, kind: q.kind, subject: q.subject || "", media: q.url ? base + q.url : "", file: q.file || "", fiche: { formula: fiche.formula || "", networks: fiche.networks || "", remember: fiche.remember || "" }, strategie: strat.slice(0, 6000) }); }
    res.json({ rules: RULES, items: out });
  }));
  let workerSeen = 0;
  // Un Mac prend une demande : les autres ne la voient plus (pas de travail en double)
  app.post("/api/g-prod/queue/:id/claim", macAuth, wrap(async (req, res) => {
    const id = String(req.params.id), q = await current("_descq", id); if (!q) return res.status(404).json({ error: "Demande introuvable." });
    if (q.status === "done" || (q.status === "run" && Date.now() - Date.parse(q.runAt || 0) < 600000)) return res.status(409).json({ error: "Déjà prise." });
    await put("_descq", id, Object.assign(q, { status: "run", runAt: new Date().toISOString(), runBy: (req.user && req.user.name) || "" })); res.json({ ok: true });
  }));
  app.post("/api/g-prod/queue/:id", macAuth, wrap(async (req, res) => {
    const id = String(req.params.id), q = await current("_descq", id); if (!q) return res.status(404).json({ error: "Demande introuvable." });
    if ((req.body || {}).error) { await put("_descq", id, Object.assign(q, { status: "error", error: String(req.body.error).slice(0, 300) })); return res.json({ ok: true }); }
    const props = (Array.isArray((req.body || {}).propositions) ? req.body.propositions : []).map(x => String(x).trim().slice(0, 2200)).filter(Boolean).slice(0, 3);
    if (!props.length) return res.status(400).json({ error: "Aucune proposition." });
    await put("_descq", id, Object.assign(q, { status: "done", propositions: props, transcript: String((req.body || {}).transcript || "").trim().slice(0, 12000), doneAt: new Date().toISOString() })); res.json({ ok: true });
  }));
  // Trois propositions de description, au ton du client, d'après sa fiche et sa stratégie
  app.post("/api/g-prod/describe", auth, wrap(async (req, res) => {
    const b = req.body || {}, name = String(b.client || "").slice(0, 120), subject = String(b.subject || "").slice(0, 1500), kind = b.kind === "video" ? "vidéo (réel)" : "visuel";
    const url = /^\/f\/[a-f0-9]{32}(\.[a-z0-9]{1,7})?$/.test(String(b.url || "")) ? String(b.url) : "", file = String(b.file || "").slice(0, 200);
    if (!name || (!subject && !url)) return res.status(400).json({ error: "Indique le client et le fichier." });
    // Sans texte de sujet, Claude Code sur le Mac regarde le fichier lui-même (transcription de la vidéo, ou l'image) : on passe toujours par la file
    if (!process.env.ANTHROPIC_API_KEY || !subject) { const id = "q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await put("_descq", id, { client: name, subject, url, file, kind, status: "wait", at: new Date().toISOString(), by: (req.user && req.user.name) || "" }); return res.json({ queued: id }); }
    const { fiche, strat } = await clientContext(name);
    const system = "Tu écris les descriptions des publications Instagram et Facebook de l'Agence Gacolet pour ses clients (entreprises locales du Gard). "
      + "Règles : français, au ton du client, deux émojis au plus, pas de tiret long, pas de formule toute faite ni de marque d'écriture automatique, pas de superlatif non sourcé, pas de prénom de l'équipe de l'agence, "
      + "aucun chiffre sans source. Disposition habituelle de l'agence, à respecter exactement, blocs séparés par une ligne vide : 1) une accroche d'une ligne, sans émoji ; ligne vide ; 2) un paragraphe de 2 à 4 phrases qui reprend ce que dit la vidéo (tutoiement si le client tutoie) ; ligne vide ; 3) une ligne d'invitation à agir signée par le client (ex. « Maître nageur à Lunel, je réponds à tes questions : écris-moi en message privé. »), avec au plus un émoji, à la fin de la ligne ; ligne vide ; 4) une ligne de 4 à 6 mots-dièse écrits avec une majuscule à chaque mot (#StageDeNatation), le premier au nom du client (ex. #HugoMaitreNageur), sans accents.";
    const ctx = "Client : " + name + "\nFormule : " + (fiche.formula || "") + "\nRéseaux : " + (fiche.networks || "") + "\nÀ retenir : " + (fiche.remember || "") + "\n\nStratégie (extrait) :\n" + (strat || "pas de fiche stratégie");
    const client = new Anthropic();
    const r = await client.beta.messages.create({
      model: "claude-opus-5-5", max_tokens: 4000, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
      system, output_config: { effort: "low", format: { type: "json_schema", schema: { type: "object", properties: { propositions: { type: "array", items: { type: "string" } } }, required: ["propositions"], additionalProperties: false } } },
      messages: [{ role: "user", content: ctx + "\n\nProduction à publier : " + kind + ". De quoi elle parle : " + subject + "\n\nÉcris trois descriptions différentes (angles distincts)." }],
    });
    if (r.stop_reason === "refusal") return res.status(422).json({ error: "Claude a refusé cette demande." });
    const txt = (r.content || []).filter(x => x.type === "text").map(x => x.text).join("");
    let props = []; try { props = JSON.parse(txt).propositions || []; } catch (e) { props = [txt]; }
    res.json({ propositions: props.slice(0, 3).map(x => String(x).trim()).filter(Boolean) });
  }));

  // Dépôts en cours, gardés sur le serveur (et plus dans le navigateur) : les mêmes sur tous les appareils, rien ne disparaît en fermant une fenêtre
  const DKEYS = ["client","name","kind","url","date","time","reco","text","props","transcript","wait","asked","err","pct","up","upAt","by","at"];
  const draftId = id => /^d[a-z0-9]{6,30}$/.test(String(id)) ? String(id) : "";
  app.get("/api/g-prod/drafts", auth, wrap(async (req, res) => {
    const list = await docsOf("_depot");
    for (const d of list) if (d.wait) { const q = await current("_descq", d.wait); if (!q) continue;
      if (q.status === "done") { Object.assign(d, { props: q.propositions || [], transcript: q.transcript || "", wait: "" }); if (!d.text && d.props[0]) d.text = d.props[0]; const x = Object.assign({}, d); delete x.id; await put("_depot", d.id, x); }
      else if (q.status === "error") { Object.assign(d, { wait: "", err: q.error || "Claude n’a pas pu écrire les descriptions." }); const x = Object.assign({}, d); delete x.id; await put("_depot", d.id, x); } }
    res.json({ items: list.sort((a, b) => String(a.at).localeCompare(String(b.at))) });
  }));
  app.put("/api/g-prod/drafts/:id", auth, wrap(async (req, res) => {
    const id = draftId(req.params.id); if (!id) return res.status(400).json({ error: "Dépôt inconnu." });
    const b = req.body || {}, cur = (await current("_depot", id)) || { at: new Date().toISOString(), by: (req.user && req.user.name) || "" }, d = Object.assign({}, cur);
    DKEYS.forEach(k => { if (k in b && k !== "at" && k !== "by") d[k] = b[k]; });
    // Les descriptions reçues par le serveur ne sont jamais effacées par un appareil qui ne les a pas encore
    if (cur.props && !(b.props && b.props.length)) { d.props = cur.props; d.transcript = cur.transcript; d.wait = cur.wait || ""; if (!d.text) d.text = cur.text || ""; }
    if (cur.url && !b.url) d.url = cur.url;
    if (!d.client || !d.name) return res.status(400).json({ error: "Dépôt incomplet." });
    await put("_depot", id, d); res.json({ ok: true, item: Object.assign({ id }, d) });
  }));
  app.delete("/api/g-prod/drafts/:id", auth, wrap(async (req, res) => {
    const id = draftId(req.params.id); if (!id) return res.status(400).json({ error: "Dépôt inconnu." });
    await db.run("UPDATE docs SET deleted = 1, updated_at = ? WHERE col = '_depot' AND id = ?", [new Date().toISOString(), id]); res.json({ ok: true });
  }));

  // Programmation dans Metricool (Instagram et Facebook) ; le média est servi par l'appli à une adresse publique impossible à deviner
  app.post("/api/g-prod/schedule", auth, wrap(async (req, res) => {
    const b = req.body || {}, name = String(b.client || ""), blog = await blogFor(name);
    if (!blog) return res.status(400).json({ error: "Pas de marque Metricool connue pour " + name + "." });
    const base = (req.get("x-forwarded-proto") || req.protocol) + "://" + req.get("host"), out = [];
    // Mode : « draft » = brouillon Metricool ; « review » = brouillon soumis au client dans son espace (À valider), programmé tout seul quand il valide ; « publish » = programmé
    const mode = ["draft", "review", "publish"].includes(b.mode) ? b.mode : "review";
    for (const it of (Array.isArray(b.items) ? b.items : []).slice(0, 20)) {
      const url = String(it.url || ""); if (!/^\/f\/[a-f0-9]{32}(\.[a-z0-9]{1,7})?$/.test(url)) { out.push({ ok: false, id: it.id || "", error: "Fichier invalide." }); continue; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(it.date || "") || !/^\d{2}:\d{2}$/.test(it.time || "")) { out.push({ ok: false, id: it.id || "", error: "Date ou heure invalide." }); continue; }
      const video = it.kind === "video", nets = (Array.isArray(it.networks) && it.networks.length ? it.networks : ["instagram", "facebook"]).filter(x => ["instagram", "facebook"].includes(x));
      const info = { publicationDate: { dateTime: it.date + "T" + it.time + ":00", timezone: "Europe/Paris" }, text: String(it.text || "").slice(0, 2200), providers: nets.map(network => ({ network })),
        media: [base + url], autoPublish: true, draft: mode !== "publish", shortener: false, descendants: [], firstCommentText: "", hasNotReadNotes: false, mediaAltText: [], smartLinkData: { ids: [] } };
      if (nets.includes("instagram")) info.instagramData = { type: video ? "REEL" : "POST", showReelOnFeed: true };
      if (nets.includes("facebook")) info.facebookData = { type: video ? "REEL" : "POST" };
      try { const r = await mc("POST", "/v2/scheduler/posts", { blogId: blog }, info); const id = r && (r.id || (r.data && r.data.id));
        // Miniature préparée tout de suite : la carte du client s'affiche sans attendre
        if (id && app.locals.warmThumbs) { try { app.locals.warmThumbs([{ media: [{ url, video }] }]); } catch (e) {} }
        if (mode === "review" && id) { await put("_prodrev", "mc" + id, { blog, client: name, at: new Date().toISOString() }); try { require("./metricool").forget(blog); } catch (e) {} }
        if (id) { await put("_purge", url.slice(3).replace(/\W/g, "_"), { file: url.slice(3), blog, post: String(id), date: it.date, at: new Date().toISOString() }); setTimeout(purgeFiles, 30000).unref(); }
        const did = draftId(it.id); if (did) await db.run("UPDATE docs SET deleted = 1, updated_at = ? WHERE col = '_depot' AND id = ?", [new Date().toISOString(), did]);
        out.push({ ok: true, id: it.id || "", date: it.date, time: it.time, mode }); }
      catch (e) { out.push({ ok: false, id: it.id || "", error: e.message }); }
    }
    res.json({ results: out });
  }));

  // Le serveur n'est qu'un intermédiaire : dès que Metricool a sa propre copie du média (static.metricool.com), on supprime la nôtre
  const fsP = require("fs"), pathP = require("path");
  async function purgeFiles() {
    if (!upDir || !process.env.METRICOOL_USER_TOKEN) return;
    for (const q of (await docsOf("_purge")).filter(q => !q.done)) {
      const f = pathP.join(upDir, pathP.basename(q.file || "")), age = Date.now() - Date.parse(q.at || 0);
      let post = null;
      try { const j = await mc("GET", "/v2/scheduler/posts", { blogId: q.blog, start: q.date + "T00:00:00", end: q.date + "T23:59:59", timezone: "Europe/Paris", extendedRange: true });
        post = ((j && j.data) || []).find(x => String(x.id) === q.post) || null; } catch (e) { continue; }
      const copied = post && (post.media || []).length && post.media.every(u => /^https:\/\/static\.metricool\.com\//.test(u));
      const gone = !post && age > 3 * 86400000;   // publication supprimée dans Metricool : le fichier ne sert plus
      if (!copied && !gone) continue;
      try { fsP.unlinkSync(f); } catch (e) {}
      await put("_purge", q.id, Object.assign({}, q, { id: undefined, done: true, doneAt: new Date().toISOString(), why: copied ? "copie Metricool" : "publication introuvable" }));
    }
  }
  // Fichiers déposés mais jamais programmés : supprimés du serveur 30 jours après le dépôt (seulement ceux du Dépôt, repérés par leur demande de description)
  async function purgeStale() {
    if (!upDir) return; const lim = Date.now() - 30 * 86400000, done = new Set((await docsOf("_purge")).map(q => q.file));
    for (const q of await docsOf("_descq")) {
      const fn = String(q.url || "").replace(/^\/f\//, ""); if (!fn || q.purged || done.has(fn) || Date.parse(q.at || 0) > lim) continue;
      try { fsP.unlinkSync(pathP.join(upDir, pathP.basename(fn))); } catch (e) {}
      await put("_descq", q.id, Object.assign({}, q, { id: undefined, purged: new Date().toISOString() }));
    }
  }
  setInterval(() => purgeStale().catch(() => {}), 6 * 3600000).unref();
  setInterval(() => purgeFiles().catch(() => {}), 120000).unref();
  setTimeout(() => purgeFiles().catch(() => {}), 20000).unref();

  // Clé Claude (propositions de description)
  // Bouton « Supprimer » du Dépôt : efface du serveur un fichier déposé et pas encore envoyé à Metricool
  app.post("/api/g-prod/delete", auth, wrap(async (req, res) => {
    const fn = pathP.basename(String((req.body || {}).url || "").replace(/^\/f\//, ""));
    if (!/^[a-f0-9]{32}(\.[a-z0-9]{1,7})?$/.test(fn)) return res.status(400).json({ error: "Fichier inconnu." });
    if ((await docsOf("_purge")).some(q => q.file === fn && !q.done)) return res.status(409).json({ error: "Ce fichier est déjà programmé dans Metricool : supprime la publication là-bas." });
    if (upDir) { try { fsP.unlinkSync(pathP.join(upDir, fn)); } catch (e) {} }
    res.json({ ok: true });
  }));
  app.get("/api/g-prod/status", auth, (req, res) => res.json({ claude: !!process.env.ANTHROPIC_API_KEY, queue: true, metricool: !!process.env.METRICOOL_USER_TOKEN, worker: !!process.env.DESC_KEY, workerSeen: workerSeen ? new Date(workerSeen).toISOString() : "" }));
  app.put("/api/g-keys/anthropic", auth, wrap(async (req, res) => {
    if (req.user.role !== "owner") return res.status(403).json({ error: "Réservé à l’accès complet." });
    const k = String((req.body || {}).key || "").trim(); if (!/^sk-ant-[\w-]{20,}$/.test(k)) return res.status(400).json({ error: "Une clé Claude commence par « sk-ant- »." });
    try { const c = new Anthropic({ apiKey: k }); await c.models.list({ limit: 1 }); } catch (e) { return res.status(400).json({ error: "Anthropic refuse la clé : " + String(e.message || e).slice(0, 150) }); }
    persistKey("ANTHROPIC_API_KEY", k); res.json({ ok: true });
  }));
};
