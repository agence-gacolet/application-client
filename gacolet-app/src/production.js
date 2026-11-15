// Dépôt de productions : vidéos et visuels déposés dans Publications, descriptions proposées par Claude
// d'après la fiche et la stratégie du client, dates choisies selon son rythme, puis programmation dans Metricool.
// Clé Claude : ANTHROPIC_API_KEY (Paramètres > Liaisons). Clé Metricool : METRICOOL_USER_TOKEN (déjà en place).
const Anthropic = require("@anthropic-ai/sdk");

module.exports = function production({ app, auth, wrap, db, current, put, pubPlan, persistKey, macAuth }) {
  const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, " ").trim();
  const docsOf = async col => (await db.all("SELECT id, data FROM docs WHERE col = ? AND deleted = 0", [col])).map(r => { try { return Object.assign({ id: r.id }, JSON.parse(r.data || "{}")); } catch (e) { return null; } }).filter(Boolean);
  const blogOf = name => { const p = pubPlan.find(([n]) => norm(n) === norm(name)) || pubPlan.find(([n]) => norm(name).includes(norm(n)) || norm(n).includes(norm(name))); return p && p[1] ? p[1] : ""; };
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
    const { fiche, strat } = await clientContext(name), blog = blogOf(name), hour = usualHour(fiche), plan = perMonth(fiche);
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
      out.push({ date: iso(pick), time: H, why: (plan - done) + " publication" + (plan - done > 1 ? "s" : "") + " encore à faire en " + mk });
      cur = new Date(pick); cur.setDate(pick.getDate() + gap);
    }
    res.json({ slots: out, blog: !!blog, hour: H, perMonth: plan, days: pref.map(k => DAYS[k]), thisMonth: countIn(monthOf(now)) });
  }));

  // Sans clé Claude : la demande part dans une file (_descq) ; Claude Code, sur le Mac de l'agence, la traite toutes les 10 minutes
  // avec l'abonnement Claude (rien à payer en plus), puis renvoie les trois propositions.
  const RULES = "Règles : français, au ton du client, deux émojis au plus, pas de tiret long, pas de formule toute faite ni de marque d'écriture automatique, pas de superlatif non sourcé, pas de prénom de l'équipe de l'agence, aucun chiffre sans source. 3 à 6 lignes, une accroche courte en première ligne, une invitation à agir à la fin quand c'est naturel, 3 à 6 mots-dièse locaux et métier à la fin. Trois descriptions aux angles différents.";
  app.get("/api/g-prod/describe/:id", auth, wrap(async (req, res) => { const q = await current("_descq", String(req.params.id)); if (!q) return res.status(404).json({ error: "Demande introuvable." }); res.json({ status: q.status, propositions: q.propositions || [], error: q.error || "" }); }));
  app.get("/api/g-prod/queue", macAuth, wrap(async (req, res) => {
    const list = (await docsOf("_descq")).filter(q => q.status === "wait").sort((a, b) => String(a.at).localeCompare(String(b.at))).slice(0, 10);
    const out = []; for (const q of list) { const { fiche, strat } = await clientContext(q.client); out.push({ id: q.id, client: q.client, kind: q.kind, subject: q.subject, fiche: { formula: fiche.formula || "", networks: fiche.networks || "", remember: fiche.remember || "" }, strategie: strat.slice(0, 6000) }); }
    res.json({ rules: RULES, items: out });
  }));
  app.post("/api/g-prod/queue/:id", macAuth, wrap(async (req, res) => {
    const id = String(req.params.id), q = await current("_descq", id); if (!q) return res.status(404).json({ error: "Demande introuvable." });
    const props = (Array.isArray((req.body || {}).propositions) ? req.body.propositions : []).map(x => String(x).trim().slice(0, 2200)).filter(Boolean).slice(0, 3);
    if (!props.length) return res.status(400).json({ error: "Aucune proposition." });
    await put("_descq", id, Object.assign(q, { status: "done", propositions: props, doneAt: new Date().toISOString() })); res.json({ ok: true });
  }));
  // Trois propositions de description, au ton du client, d'après sa fiche et sa stratégie
  app.post("/api/g-prod/describe", auth, wrap(async (req, res) => {
    const b = req.body || {}, name = String(b.client || "").slice(0, 120), subject = String(b.subject || "").slice(0, 1500), kind = b.kind === "video" ? "vidéo (réel)" : "visuel";
    if (!name || !subject) return res.status(400).json({ error: "Indique le client et de quoi parle la production." });
    if (!process.env.ANTHROPIC_API_KEY) { const id = "q" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      await put("_descq", id, { client: name, subject, kind, status: "wait", at: new Date().toISOString(), by: (req.user && req.user.name) || "" }); return res.json({ queued: id }); }
    const { fiche, strat } = await clientContext(name);
    const system = "Tu écris les descriptions des publications Instagram et Facebook de l'Agence Gacolet pour ses clients (entreprises locales du Gard). "
      + "Règles : français, au ton du client, deux émojis au plus, pas de tiret long, pas de formule toute faite ni de marque d'écriture automatique, pas de superlatif non sourcé, pas de prénom de l'équipe de l'agence, "
      + "aucun chiffre sans source. 3 à 6 lignes, une accroche courte en première ligne, une invitation à agir à la fin quand c'est naturel, 3 à 6 mots-dièse locaux et métier à la fin.";
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

  // Programmation dans Metricool (Instagram et Facebook) ; le média est servi par l'appli à une adresse publique impossible à deviner
  app.post("/api/g-prod/schedule", auth, wrap(async (req, res) => {
    const b = req.body || {}, name = String(b.client || ""), blog = blogOf(name);
    if (!blog) return res.status(400).json({ error: "Pas de marque Metricool connue pour " + name + "." });
    const base = (req.get("x-forwarded-proto") || req.protocol) + "://" + req.get("host"), out = [];
    // Mode : « draft » = brouillon Metricool ; « review » = brouillon soumis au client dans son espace (À valider), programmé tout seul quand il valide ; « publish » = programmé
    const mode = ["draft", "review", "publish"].includes(b.mode) ? b.mode : "review";
    for (const it of (Array.isArray(b.items) ? b.items : []).slice(0, 20)) {
      const url = String(it.url || ""); if (!/^\/f\/[a-f0-9]{32}(\.[a-z0-9]{1,7})?$/.test(url)) { out.push({ ok: false, error: "Fichier invalide." }); continue; }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(it.date || "") || !/^\d{2}:\d{2}$/.test(it.time || "")) { out.push({ ok: false, error: "Date ou heure invalide." }); continue; }
      const video = it.kind === "video", nets = (Array.isArray(it.networks) && it.networks.length ? it.networks : ["instagram", "facebook"]).filter(x => ["instagram", "facebook"].includes(x));
      const info = { publicationDate: { dateTime: it.date + "T" + it.time + ":00", timezone: "Europe/Paris" }, text: String(it.text || "").slice(0, 2200), providers: nets.map(network => ({ network })),
        media: [base + url], autoPublish: true, draft: mode !== "publish", shortener: false, descendants: [], firstCommentText: "", hasNotReadNotes: false, mediaAltText: [], smartLinkData: { ids: [] } };
      if (nets.includes("instagram")) info.instagramData = { type: video ? "REEL" : "POST", showReelOnFeed: true };
      if (nets.includes("facebook")) info.facebookData = { type: video ? "REEL" : "POST" };
      try { const r = await mc("POST", "/v2/scheduler/posts", { blogId: blog }, info); const id = r && (r.id || (r.data && r.data.id));
        if (mode === "review" && id) await put("_prodrev", "mc" + id, { blog, client: name, at: new Date().toISOString() });
        out.push({ ok: true, date: it.date, time: it.time, mode }); }
      catch (e) { out.push({ ok: false, error: e.message }); }
    }
    res.json({ results: out });
  }));

  // Clé Claude (propositions de description)
  app.get("/api/g-prod/status", auth, (req, res) => res.json({ claude: !!process.env.ANTHROPIC_API_KEY, queue: true, metricool: !!process.env.METRICOOL_USER_TOKEN }));
  app.put("/api/g-keys/anthropic", auth, wrap(async (req, res) => {
    if (req.user.role !== "owner") return res.status(403).json({ error: "Réservé à l’accès complet." });
    const k = String((req.body || {}).key || "").trim(); if (!/^sk-ant-[\w-]{20,}$/.test(k)) return res.status(400).json({ error: "Une clé Claude commence par « sk-ant- »." });
    try { const c = new Anthropic({ apiKey: k }); await c.models.list({ limit: 1 }); } catch (e) { return res.status(400).json({ error: "Anthropic refuse la clé : " + String(e.message || e).slice(0, 150) }); }
    persistKey("ANTHROPIC_API_KEY", k); res.json({ ok: true });
  }));
};
