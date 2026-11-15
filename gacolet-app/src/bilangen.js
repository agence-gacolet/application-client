// Bouton « Générer le bilan » (Tableau clients > Bilans) : l'appli remplit seule le bilan du mois d'un client,
// sur le modèle des bilans faits à la main (Paillote Bassamoise, octobre 2026 ; Locamex, point du 10/11/2026).
// Chiffres : statistiques Metricool (abonnés, vues, interactions, meilleure publication) et, pour les clients dont
// l'agence gère la fiche Google, le nombre d'avis relevé sur Google Maps. Tout chiffre écrit garde sa source et sa période.
// Ton : on met en avant les progrès ; une baisse devient une piste pour le mois suivant. Pas de prénom, pas de superlatif
// non sourcé, pas de double tiret. Rien n'est enregistré ici : l'agence relit, corrige, puis « Enregistrer ».
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
// Fiches Google gérées par l'agence (fiches clients, 00_COMMUN/clients) : nom du client dans l'appli → recherche Google Maps
const GOOGLE_FICHES = {
  "Locamex": "Locamex Montpellier Détection et réparation fuite piscines",
  "Flora Design": "Flora Design fleuriste",
};

module.exports = function ({ app, auth, ownerOnly, wrap, db, put, bilanData, normName, perOf }) {
  const fmt = n => n == null ? "" : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const dd = s => String(s || "").slice(8, 10) + "/" + String(s || "").slice(5, 7);
  const monthEnd = m => { const [y, mo] = m.split("-").map(Number); return m + "-" + String(new Date(y, mo, 0).getDate()).padStart(2, "0"); };
  const prevMonth = m => { const [y, mo] = m.split("-").map(Number), d = new Date(y, mo - 2, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
  const nextMonth = m => { const [y, mo] = m.split("-").map(Number), d = new Date(y, mo, 1); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
  const moName = m => MONTHS[Number(m.slice(5, 7)) - 1];
  const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  const pct = (a, b) => a ? Math.round(100 * (b - a) / a) : null;
  // Titre lisible d'une publication : première ligne du texte, sans émoji, sans mot-dièse, sans tiret long
  const titleOf = t => { let s = String(t || "").split("\n").map(x => x.trim()).find(x => x && !x.startsWith("#")) || "";
    s = s.replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍]/gu, "").replace(/#\S+/g, "").replace(/\s[–—]\s/g, " : ").replace(/[–—]/g, " ").replace(/\s+/g, " ").trim().replace(/[!?.:;,\s]+$/, "");
    return s.length > 70 ? s.slice(0, 68).replace(/\s+\S*$/, "") + "…" : s; };

  async function mcGet(pth, q) {
    const tok = process.env.METRICOOL_USER_TOKEN; if (!tok) return null;
    const p = new URLSearchParams(Object.assign({ userId: process.env.METRICOOL_USER_ID || "4634230", timezone: "Europe/Paris" }, q));
    try { const r = await fetch("https://app.metricool.com/api" + pth + "?" + p, { headers: { "X-Mc-Auth": tok, Accept: "application/json" } }); if (!r.ok) return null;
      const j = await r.json(); return Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : null; } catch (e) { return null; }
  }
  // Statistiques Metricool d'une marque pour un mois : publications du fil et réels publiés dans le mois
  async function monthStats(blog, P) {
    const q = { blogId: blog, from: P.from + "T00:00:00", to: P.to + "T23:59:59" };
    const [igp, igr, fbp, fbr] = await Promise.all([mcGet("/v2/analytics/posts/instagram", q), mcGet("/v2/analytics/reels/instagram", q), mcGet("/v2/analytics/posts/facebook", q), mcGet("/v2/analytics/reels/facebook", q)]);
    const N = v => Number(v) || 0, items = [];
    const ig = igp || igr ? { views: 0, inter: 0, n: 0, reels: 0, reelViews: 0 } : null;
    (igp || []).forEach(p => { const v = N(p.views || p.impressionsTotal); ig.views += v; ig.inter += N(p.likes) + N(p.comments) + N(p.shares) + N(p.saved); ig.n++;
      items.push({ net: "Instagram", kind: /CAROUSEL/i.test(p.type || "") ? "Carrousel" : "Publication", date: ((p.publishedAt || {}).dateTime || "").slice(0, 10), views: v, inter: N(p.likes) + N(p.comments) + N(p.shares) + N(p.saved), title: titleOf(p.content) }); });
    (igr || []).forEach(p => { const v = N(p.views); ig.views += v; ig.inter += N(p.likes) + N(p.comments) + N(p.shares) + N(p.saved); ig.n++; ig.reels++; ig.reelViews += v;
      items.push({ net: "Instagram", kind: "Réel", date: ((p.publishedAt || {}).dateTime || "").slice(0, 10), views: v, inter: N(p.likes) + N(p.comments) + N(p.shares) + N(p.saved), title: titleOf(p.content) }); });
    const fb = fbp || fbr ? { views: 0, inter: 0, n: 0 } : null;
    (fbp || []).forEach(p => { const v = N(p.impressions); fb.views += v; fb.inter += N(p.reactions) + N(p.comments) + N(p.shares); fb.n++;
      items.push({ net: "Facebook", kind: "Publication", date: ((p.created || {}).dateTime || "").slice(0, 10), views: v, inter: N(p.reactions) + N(p.comments) + N(p.shares), title: titleOf(p.text) }); });
    (fbr || []).forEach(p => { const v = N(p.blueReelsPlayCount); fb.views += v; fb.inter += N(p.postVideoReactions) + N(p.postVideoSocialActions); fb.n++;
      items.push({ net: "Facebook", kind: "Réel", date: ((p.created || {}).dateTime || "").slice(0, 10), views: v, inter: N(p.postVideoReactions), title: titleOf(p.description) }); });
    items.sort((a, b) => b.views - a.views);
    return { ig: ig && ig.n ? ig : null, fb: fb && fb.n ? fb : null, top: items[0] && items[0].views ? items[0] : null, items };
  }
  // Abonnés en fin de mois (dernière valeur relevée par Metricool avant la fin du mois)
  async function followers(blog, P, PP) {
    const q = { blogId: blog, from: PP.from + "T00:00:00", to: P.to + "T23:59:59", subject: "account" };
    const [ig, fb] = await Promise.all([mcGet("/v2/analytics/timelines", Object.assign({ metric: "followers", network: "instagram" }, q)), mcGet("/v2/analytics/timelines", Object.assign({ metric: "pageFollows", network: "facebook" }, q))]);
    const at = (arr, R) => { const vals = ((arr && arr[0] && arr[0].values) || []).filter(v => String(v.dateTime).slice(0, 10) >= R.from && String(v.dateTime).slice(0, 10) <= R.to && v.value != null).sort((a, b) => String(a.dateTime).localeCompare(String(b.dateTime))); return vals.length ? { v: Number(vals[vals.length - 1].value), d: String(vals[vals.length - 1].dateTime).slice(0, 10) } : null; };
    return { ig: { now: at(ig, P), before: at(ig, PP) }, fb: { now: at(fb, P), before: at(fb, PP) } };
  }

  // ---------- Avis Google (fiches gérées par l'agence) : nombre total relevé sur Google Maps, gardé chaque jour pour mesurer les avis gagnés sur un mois ----------
  const ficheOf = name => { const k = Object.keys(GOOGLE_FICHES).find(x => normName(x) === normName(name)); return k ? { key: normName(k), query: GOOGLE_FICHES[k] } : null; };
  async function googleNow(f) {
    const key = process.env.GOOGLE_PLACES_KEY; if (!key) return null;
    try { const r = await fetch("https://places.googleapis.com/v1/places:searchText", { method: "POST", headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.displayName,places.rating,places.userRatingCount,places.reviews" }, body: JSON.stringify({ textQuery: f.query, languageCode: "fr", regionCode: "FR", pageSize: 1 }) });
      const j = await r.json().catch(() => ({})), p = (j.places || [])[0]; if (!r.ok || !p) return null;
      const snap = { count: Number(p.userRatingCount) || 0, rating: p.rating || null, name: (p.displayName && p.displayName.text) || "", day: today(), reviews: (p.reviews || []).map(x => String(x.publishTime || "").slice(0, 10)).filter(Boolean) };
      await put("_gavis", f.key + "-" + snap.day, snap); return snap; } catch (e) { return null; }
  }
  async function snapsOf(f) { return (await db.all("SELECT data FROM docs WHERE col = '_gavis' AND deleted = 0 AND id LIKE ?", [f.key + "-%"])).map(r => { try { return JSON.parse(r.data); } catch (e) { return null; } }).filter(Boolean).sort((a, b) => a.day.localeCompare(b.day)); }
  async function googleReviews(name, P, PP) {
    const f = ficheOf(name); if (!f) return null;
    const now = await googleNow(f), snaps = await snapsOf(f), last = (lim) => snaps.filter(s => s.day <= lim).pop() || null;
    const open = P.to >= today(), end = open ? last(today()) : last(P.to), start = last(PP.to);
    const shown = now ? now.reviews.filter(d => d >= P.from && d <= P.to).length : 0;
    return { start, end: end && end.day >= P.from ? end : (open ? now : null), now, shown };
  }
  // Relevé quotidien des fiches gérées (deux recherches par jour au plus), pour avoir les avis gagnés de chaque mois
  async function dailyGoogle() { if (!process.env.GOOGLE_PLACES_KEY) return; const d = today();
    for (const k of Object.keys(GOOGLE_FICHES)) { const f = { key: normName(k), query: GOOGLE_FICHES[k] }; const has = await db.one("SELECT id FROM docs WHERE col = '_gavis' AND id = ?", [f.key + "-" + d]); if (!has) await googleNow(f); } }
  setTimeout(() => dailyGoogle().catch(() => {}), 60000).unref(); setInterval(() => dailyGoogle().catch(() => {}), 6 * 3600000).unref();

  // ---------- Le bilan rédigé ----------
  async function generate(cid, m) {
    const d = await bilanData(cid, m); if (!d) return null;
    const P = d.period, PP = perOf(P.prev), inP = PP.inL, nxN = P.nextName, blog = /^b\d+$/.test(String(cid)) ? String(cid).slice(1) : (await db.one("SELECT metricool_blog_id FROM clients WHERE id = ?", [cid]) || {}).metricool_blog_id;
    const [S, SP, F, G] = blog ? await Promise.all([monthStats(blog, P), monthStats(blog, PP), followers(blog, P, PP), googleReviews(d.client.name, P, PP)]) : [null, null, null, await googleReviews(d.client.name, P, PP)];
    const posts = d.posts.count, reels = (d.posts.types["Réel"] || 0) + (d.posts.types["Réel test"] || 0), pv = d.prev || {}, pposts = pv.posts, preels = pv.types ? (pv.types["Réel"] || 0) + (pv.types["Réel test"] || 0) : null;
    const vidPct = posts ? Math.round(100 * reels / posts) : 0, srcs = new Set(["Metricool (planning)"]);
    const ok = [], ko = [], rows = [], warn = [], themes = { ok: [], ko: [] };
    const gain = (label, a, b, sub, unitWord) => { if (a == null || b == null) return; rows.push([label, a, b, sub]); };
    // Abonnés
    if (F && F.ig.now) { srcs.add("Metricool (Instagram)"); gain("Abonnés Instagram", F.ig.before && F.ig.before.v, F.ig.now.v, "fin de période");
      if (F.ig.before) { const g = F.ig.now.v - F.ig.before.v; if (g > 0) { ok.push(["Abonnés Instagram : +" + fmt(g) + " (" + fmt(F.ig.now.v) + " au " + dd(F.ig.now.d) + ").", g]); themes.ok.push("communauté"); } } }
    if (F && F.fb.now) { srcs.add("Metricool (Facebook)"); gain("Abonnés Facebook", F.fb.before && F.fb.before.v, F.fb.now.v, "fin de période");
      if (F.fb.before) { const g = F.fb.now.v - F.fb.before.v; if (g > 0) { ok.push(["Abonnés Facebook : +" + fmt(g) + " (" + fmt(F.fb.now.v) + " au " + dd(F.fb.now.d) + ").", g]); themes.ok.push("communauté"); } } }
    // Vues et interactions
    const cmp = (label, a, b, sub, theme) => { if (b == null) return; rows.push([label, a, b, sub]); if (a == null || !a) return; const e = pct(a, b);
      if (e >= 5) { ok.push([label + " : " + fmt(b) + " contre " + fmt(a) + " (+" + e + " %).", 50 + e]); themes.ok.push(theme); }
      else if (e <= -10) { ko.push([label + " : " + fmt(b) + " contre " + fmt(a) + " (" + e + " %).", -e]); themes.ko.push(theme); } };
    if (S && S.ig) { cmp("Vues Instagram", SP && SP.ig ? SP.ig.views : null, S.ig.views, "publications de la période", "vues Instagram"); cmp("Interactions Instagram", SP && SP.ig ? SP.ig.inter : null, S.ig.inter, "j’aime, commentaires, partages, enregistrements", "interactions"); }
    if (S && S.fb) cmp("Vues Facebook", SP && SP.fb ? SP.fb.views : null, S.fb.views, "publications de la période", "Facebook");
    // Avis Google
    let gNote = "";
    if (G && !G.now && !(G.start && G.end)) { rows.push(["Avis Google", null, null, "à compléter : avis reçus sur la période"]); warn.push("Avis Google non comptés : ajoute la clé Google Maps dans Paramètres > Liaisons, ou complète la ligne « Avis Google » à la main."); }
    if (G && (G.now || (G.start && G.end))) { srcs.add("Google Maps (fiche « " + ((G.now || G.end).name || d.client.name) + " »)");
      if (G.start && G.end) { rows.push(["Avis Google", G.start.count, G.end.count, "total sur la fiche"]); const g = G.end.count - G.start.count; if (g > 0) { ok.push(["Avis Google : +" + g + " sur la période, " + G.end.count + " au total" + (G.end.rating ? " (note " + String(G.end.rating).replace(".", ",") + " sur 5)" : "") + ".", 40 + g]); themes.ok.push("avis"); } }
      else if (G.now) { rows.push(["Avis Google", null, G.now.count, "total relevé le " + dd(G.now.day)]);
        gNote = G.shown ? "Avis Google : au moins " + G.shown + " publié" + (G.shown > 1 ? "s" : "") + " " + P.inL + " ; " + G.now.count + " au total le " + dd(G.now.day) + (G.now.rating ? ", note " + String(G.now.rating).replace(".", ",") + " sur 5" : "") + "."
          : "Avis Google : " + G.now.count + " au total le " + dd(G.now.day) + (G.now.rating ? ", note " + String(G.now.rating).replace(".", ",") + " sur 5" : "") + " ; relevé chaque jour à partir de maintenant pour compter les avis du mois.";
        if (G.shown) { ok.push([gNote, 30 + G.shown]); themes.ok.push("avis"); } } }
    // Publications et vidéo (planning Metricool)
    if (pposts != null && posts > pposts) ok.push(["Publications : " + posts + " contre " + pposts + " " + inP + ".", 20 + posts - pposts]);
    else if (pposts != null && posts < pposts && pposts - posts >= 2) ko.push(["Publications : " + posts + " contre " + pposts + " " + inP + ".", 5 + pposts - posts]);
    if (preels != null && reels > preels) { ok.push(["Réels : " + reels + " contre " + preels + " " + inP + ".", 25 + reels - preels]); themes.ok.push("vidéo"); }
    else if (preels != null && reels < preels) { ko.push(["Réels : " + reels + " contre " + preels + " " + inP + ".", 10 + preels - reels]); themes.ko.push("vidéo"); }
    if (S && S.ig && S.ig.reels && SP && SP.ig && SP.ig.reels) { const a = SP.ig.reelViews / SP.ig.reels, b = S.ig.reelViews / S.ig.reels, e = pct(a, b);
      if (e >= 10) { ok.push(["Réels Instagram : " + fmt(b) + " vues en moyenne, contre " + fmt(a) + " " + inP + ".", 45 + e]); themes.ok.push("réels"); }
      else if (e <= -15) { ko.push(["Réels Instagram : " + fmt(b) + " vues en moyenne, contre " + fmt(a) + " " + inP + ".", -e]); themes.ko.push("réels"); } }
    if (d.meta) { if (pv.meta && d.meta.total > pv.meta.total) ok.push(["Demandes Meta : " + d.meta.total + " contre " + pv.meta.total + " " + inP + ".", 60]); else if (pv.meta && d.meta.total < pv.meta.total) ko.push(["Demandes Meta : " + d.meta.total + " contre " + pv.meta.total + " " + inP + ".", 30]); }
    // Meilleures publications
    const top = S && S.top, second = S && S.items.filter(i => i !== top && i.views && i.net === (top || {}).net)[0];
    if (top) ok.unshift([top.kind + " du " + dd(top.date) + (top.title ? " (« " + top.title + " »)" : "") + " : " + fmt(top.views) + " vues" + (top.inter ? " et " + fmt(top.inter) + " interactions" : "") + " sur " + top.net + ".", 999]);
    if (second && second.views >= 0.5 * top.views) ok.push([second.kind + " du " + dd(second.date) + (second.title ? " (« " + second.title + " »)" : "") + " : " + fmt(second.views) + " vues.", 70]);
    ok.sort((a, b) => b[1] - a[1]); ko.sort((a, b) => b[1] - a[1]);
    // Phrases
    const has = (arr, t) => arr.includes(t), x = {};
    const okBits = [];
    if (top) okBits.push(top.kind === "Réel" ? "les réels" : top.kind === "Carrousel" ? "les carrousels" : "les publications du fil");
    if (has(themes.ok, "communauté")) okBits.push("une communauté qui grandit");
    if (has(themes.ok, "avis")) okBits.push("les avis Google");
    if (has(themes.ok, "Facebook") && !okBits.length) okBits.push("Facebook");
    x.okPhrase = okBits.length ? (okBits.slice(0, 2).join(" et ").replace(/^./, c => c.toUpperCase()) + " portent la période.") : (posts ? "Le rythme de publication est tenu : " + posts + " publications " + P.inL + "." : "");
    if (top && okBits[0] && okBits[0] !== "les publications du fil" && top.title) x.okPhrase = x.okPhrase.replace(" portent la période.", " portent la période, avec « " + top.title + " » en tête.");
    x.okList = ok.slice(0, 5).map(o => o[0]).join("\n");
    if (ko.length) {
      const k0 = themes.ko[0] || "";
      x.koPhrase = (k0 === "vues Instagram" ? "Des vues Instagram à relancer" : k0 === "interactions" ? "Des interactions à relancer" : k0 === "réels" || k0 === "vidéo" ? "Plus de vidéo à remettre au planning" : k0 === "Facebook" ? "Facebook à relancer" : "Un rythme à retrouver")
        + " : c’est la priorité de la suite.";
      x.koList = ko.slice(0, 4).map(o => o[0]).join("\n");
    } else { x.koPhrase = ""; x.koList = ""; }
    // Chiffres du mois (Publications et Réels sont déjà comptés par l'appli)
    x.chiffres = rows.map(([l, a, b, s]) => [l, a == null ? "" : Math.round(a), b == null ? "" : Math.round(b), s].join(" ; ")).join("\n");
    if (top) { x.topLabel = top.kind + " du " + dd(top.date); x.topNum = fmt(top.views); x.topTxt = "vues" + (top.title ? " pour « " + top.title + " »" : "") + ", la publication la plus vue de la période sur " + top.net; }
    else if (F && F.ig.now && F.ig.before && F.ig.now.v > F.ig.before.v) { x.topLabel = "Abonnés Instagram"; x.topNum = "+" + fmt(F.ig.now.v - F.ig.before.v); x.topTxt = "nouveaux abonnés " + P.inL + ", " + fmt(F.ig.now.v) + " au total"; }
    else { x.topLabel = "Sur la période"; x.topNum = String(posts); x.topTxt = "publications sur la période"; }
    // Ce qui a été livré
    const pm = String((d.fiche && d.fiche.perMonth) || "").trim(), pmN = (pm.match(/^\s*(\d+)/) || [])[1];
    x.prevu = pm ? (pmN ? pmN + " publications par mois" : "À préciser") + "\n" + (pmN ? pm.replace(/^\s*\d+\s*/, "").replace(/^\(([^)]*)\)/, "$1").replace(/^[\s+,;]+/, "") : pm) : "";
    const notes = []; if (d.posts.stories) notes.push(d.posts.stories + " stor" + (d.posts.stories > 1 ? "ies" : "y") + " en plus du fil");
    if (pmN && posts >= Number(pmN)) notes.push(posts + " publications pour " + pmN + " prévues");
    if (d.shoots.count) notes.push(d.shoots.videos + " vidéo" + (d.shoots.videos > 1 ? "s" : "") + " tournée" + (d.shoots.videos > 1 ? "s" : "") + " sur " + d.shoots.count + " visite" + (d.shoots.count > 1 ? "s" : ""));
    if (gNote && !G.shown) notes.push(gNote.replace(/\.$/, ""));
    x.remarques = notes.length ? notes.join(" ; ").replace(/^./, c => c.toUpperCase()) + "." : "";
    // Le mois prochain
    const dec = [], need = ["Validation du calendrier de " + nxN + " sous 3 jours ouvrés"];
    const planned = Number((pm.match(/(\d+)\s*(?:réels|vidéos)/i) || [])[1]) || 0;
    if (planned > reels) { dec.push("Plus de vidéo : " + planned + " réels en " + nxN + ", comme prévu dans la formule (" + reels + " " + P.inL + ")."); need.push("Un créneau de tournage en " + nxN); }
    else if (!planned && (vidPct < 60 || has(themes.ko, "vidéo") || has(themes.ko, "réels"))) { const target = Math.max(reels + 1, Math.ceil(0.6 * Math.max(posts, Number(pmN) || 0))); dec.push("Plus de vidéo : au moins " + target + " réels en " + nxN + ", pour passer de " + vidPct + " % à près de 60 % de vidéo."); need.push("Un créneau de tournage en " + nxN); }
    if (top && top.title) dec.push("Dans la lignée du " + top.kind.toLowerCase() + " du " + dd(top.date) + " : reprendre le sujet « " + top.title + " » sous un autre angle.");
    if (has(themes.ko, "interactions") || has(themes.ko, "vues Instagram")) dec.push("Engagement : une question ou un appel à commenter dans chaque description, et des réponses aux commentaires dans la journée.");
    if (G) { dec.push("Avis Google : demander un avis après chaque intervention, avec le lien direct vers la fiche."); need.push("Le lien d’avis Google envoyé à chaque client satisfait"); }
    if (pmN && posts < Number(pmN)) dec.push("Régularité : " + pmN + " publications en " + nxN + ", à jours fixes chaque semaine.");
    if (d.meta) dec.push("Demandes Meta : noter chaque rappel dans le tableau pour qualifier les demandes ensemble.");
    if (dec.length < 2 && posts) dec.push("Rythme : garder " + Math.round(posts * 7 / P.days * 10) / 10 + " publications par semaine, comme " + P.inL + ".");
    x.decisions = dec.slice(0, 4).join("\n").replace(/(\d)\.(\d)/g, "$1,$2");
    need.push("Vos actualités et dates importantes de " + nxN);
    x.besoins = need.join("\n");
    // En résumé
    const t1 = has(themes.ok, "communauté") ? "Une communauté qui grandit," : top ? (top.kind === "Réel" ? "Les réels en tête," : "Une publication qui porte le mois,") : "Un mois tenu,";
    const t2 = ko.length ? (has(themes.ko, "vues Instagram") ? "des vues à relancer," : has(themes.ko, "interactions") ? "des interactions à relancer," : has(themes.ko, "vidéo") || has(themes.ko, "réels") ? "des réels à ajouter," : has(themes.ko, "Facebook") ? "Facebook à relancer," : "un rythme à retrouver,") : (has(themes.ok, "avis") ? "des avis qui arrivent," : "un rythme tenu,");
    const t3 = dec[0] ? dec[0].split(":")[0].trim().toLowerCase() + " en " + nxN : "on continue en " + nxN;
    x.resumeTitre = [t1, t2, t3].join("\n");
    x.resumeTxt = (x.okPhrase || "") + (dec[0] ? " Pour " + nxN + ", on propose : " + dec[0].split(":").slice(1).join(":").trim().replace(/\.$/, "").replace(" en " + nxN, "").replace(/^./, c => c.toLowerCase()) + "." : "");
    x.source = "Source : " + Array.from(srcs).join(", ") + ", du " + P.range + ", comparé " + (P.isMonth ? "à " + PP.name + " " + PP.from.slice(0, 4) : "à la période du " + PP.range) + ". Vues et interactions des publications de chaque période.";
    // Garde-fou des règles de l'agence : pas de double tiret, pas de tiret long
    Object.keys(x).forEach(k => { x[k] = String(x[k] || "").replace(/\s?--\s?/g, " : ").replace(/\s[–—]\s/g, " : ").replace(/[–—]/g, " "); });
    return { extra: x, warn };
  }
  app.post("/api/g-bilan/:cid/genere", auth, ownerOnly, wrap(async (req, res) => {
    const raw = String(req.params.cid), cid = /^b\d+$/.test(raw) ? raw : Number(raw), m = String((req.body || {}).m || req.query.m || "");
    if (!cid || !perOf(m)) return res.status(400).json({ error: "Demande invalide." });
    if (!process.env.METRICOOL_USER_TOKEN) return res.status(400).json({ error: "Clé Metricool absente : Paramètres > Liaisons." });
    const g = await generate(cid, m); if (!g) return res.status(404).json({ error: "Client introuvable." });
    res.json({ extra: g.extra, warn: g.warn });
  }));
};
