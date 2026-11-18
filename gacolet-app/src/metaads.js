// Liaison Meta (gestionnaire de publicités) : l'appli lit elle-même l'état des campagnes de chaque client.
// Jeton : utilisateur système du Business Manager de l'agence (droit ads_read), collé dans Paramètres > Liaisons, gardé dans .env.
// Toutes les heures (et à la demande), chaque fiche « Campagne » de l'appli est rapprochée de son compte publicitaire :
// une campagne Meta active = « En cours », des campagnes mais aucune active = « Arrêtée », aucune campagne = statut laissé tel quel.
const GRAPH = process.env.META_GRAPH || "https://graph.facebook.com/v23.0/";
const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const LEAD_TYPES = ["lead", "onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead", "onsite_conversion.messaging_conversation_started_7d"];

module.exports = function metaads({ app, auth, ownerOnly, wrap, db, put, current, persistKey }) {
  const state = { at: "", error: "", accounts: [], unmatched: [] };
  const docsOf = async col => (await db.all("SELECT id, data FROM docs WHERE col = ? AND deleted = 0", [col])).map(r => { try { return Object.assign({ id: r.id }, JSON.parse(r.data || "{}")); } catch (e) { return { id: r.id }; } });

  async function graph(pathq, token) {
    const tok = token || process.env.META_TOKEN; if (!tok) throw Object.assign(new Error("Meta n’est pas encore relié (Paramètres > Liaisons)."), { status: 400 });
    let url = GRAPH + pathq + (pathq.includes("?") ? "&" : "?") + "access_token=" + encodeURIComponent(tok), out = [];
    for (let page = 0; page < 10 && url; page++) {
      const r = await fetch(url), j = await r.json().catch(() => ({}));
      if (!r.ok || j.error) throw Object.assign(new Error("Meta : " + ((j.error && j.error.message) || r.status)), { status: 400 });
      if (!Array.isArray(j.data)) return j;
      out = out.concat(j.data); url = j.paging && j.paging.next || "";
    }
    return out;
  }

  // Compte publicitaire d'une fiche : celui choisi à la main, sinon celui dont le nom contient le nom du client (ou l'inverse)
  const pick = (c, accounts) => {
    if (c.adAccount) return accounts.find(a => a.id === c.adAccount) || null;
    const n = norm(String(c.client || "").replace(/\(.*\)/, "")); if (n.length < 3) return null;
    const hits = accounts.filter(a => { const an = norm(a.name); return an.includes(n) || (an.length >= 4 && n.includes(an)); });
    return hits.length === 1 ? hits[0] : null;
  };

  async function sync() {
    if (!process.env.META_TOKEN) return state;
    try {
      const accounts = (await graph("me/adaccounts?fields=name,account_id,account_status&limit=200")).map(a => ({ id: a.id, name: a.name || a.id, status: a.account_status }));
      const camps = await docsOf("campaigns"), used = new Set(), now = Date.now();
      // Plusieurs fiches pour un même compte (ancienne campagne arrêtée + nouvelle) : seule la plus récente suit l'état de Meta
      const RK = { "En cours": 0, "À lancer": 1 }, byAcc = new Map();
      camps.forEach(c => { const acc = pick(c, accounts); if (acc) { if (!byAcc.has(acc.id)) byAcc.set(acc.id, []); byAcc.get(acc.id).push(c); } });
      const primary = new Set([...byAcc.values()].map(l => l.sort((x, y) => (RK[x.status] ?? 2) - (RK[y.status] ?? 2) || String(y.launchedAt || "").localeCompare(String(x.launchedAt || "")))[0].id));
      for (const c of camps) {
        const acc = pick(c, accounts); if (!acc || !primary.has(c.id)) continue; used.add(acc.id);
        const list = await graph(acc.id + "/campaigns?fields=name,effective_status,start_time,stop_time&limit=200");
        const live = list.filter(x => x.effective_status === "ACTIVE" && (!x.stop_time || Date.parse(x.stop_time) > now));
        let spend = 0, leads = 0;
        try { const ins = await graph(acc.id + "/insights?date_preset=this_month&fields=spend,actions");
          const row = Array.isArray(ins) ? ins[0] : null;
          if (row) { spend = Number(row.spend) || 0; leads = (row.actions || []).filter(a => LEAD_TYPES.includes(a.action_type)).reduce((s, a) => s + (Number(a.value) || 0), 0); } } catch (e) {}
        const starts = list.map(x => x.start_time).filter(Boolean).sort();
        const status = live.length ? "En cours" : list.length ? "Arrêtée" : c.status;
        const meta = { at: new Date().toISOString(), account: acc.name, accountId: acc.id, live: live.map(x => x.name).slice(0, 8), total: list.length, spend: Math.round(spend * 100) / 100, leads };
        const cur = await current("campaigns", c.id); if (!cur) continue;
        const was = JSON.stringify([cur.status, cur.meta && Object.assign({}, cur.meta, { at: "" })]);
        const next = Object.assign({}, cur, { status, meta, adAccount: cur.adAccount || "" });
        if (!next.launchedAt && starts[0]) next.launchedAt = starts[0].slice(0, 10);
        if (was !== JSON.stringify([next.status, Object.assign({}, meta, { at: "" })]) || !cur.launchedAt && next.launchedAt) await put("campaigns", c.id, next);
      }
      state.accounts = accounts; state.unmatched = accounts.filter(a => !used.has(a.id)).map(a => a.name);
      state.at = new Date().toISOString(); state.error = "";
    } catch (e) { state.error = e.message; }
    return state;
  }
  setTimeout(sync, 20000).unref();
  setInterval(sync, 60 * 60000).unref();

  app.get("/api/g-metaads", auth, wrap(async (req, res) => res.json({ configured: !!process.env.META_TOKEN, at: state.at, error: state.error, accounts: state.accounts.map(a => ({ id: a.id, name: a.name })), unmatched: state.unmatched })));
  app.post("/api/g-metaads/sync", auth, wrap(async (req, res) => { const s = await sync(); if (s.error) return res.status(400).json({ error: s.error }); res.json({ at: s.at, accounts: s.accounts.length, unmatched: s.unmatched }); }));
  app.put("/api/g-keys/meta", auth, ownerOnly, wrap(async (req, res) => {
    const tok = String((req.body || {}).token || "").trim(); if (!/^[A-Za-z0-9]{40,600}$/.test(tok)) return res.status(400).json({ error: "Ce jeton ne ressemble pas à un jeton Meta (il commence souvent par « EAA »)." });
    const accs = await graph("me/adaccounts?fields=name&limit=200", tok);
    persistKey("META_TOKEN", tok); const s = await sync();
    res.json({ ok: true, accounts: accs.length, unmatched: s.unmatched });
  }));
};
