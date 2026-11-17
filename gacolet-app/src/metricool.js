// Lecture du planning Metricool par le serveur, avec la clé de l'agence.
// Le client n'a besoin d'aucun compte Metricool.
//
// À VÉRIFIER dès que la clé API est disponible : chemin exact et noms des paramètres
// (documentation : https://app.metricool.com/resources/apidocs/index.html).
// Tout est réuni ici pour n'avoir qu'un endroit à corriger.
const fs = require("fs");
const path = require("path");

const BASE = "https://app.metricool.com/api";
const PATH_SCHEDULED = "/v2/scheduler/posts";
const CACHE_MS = 15 * 1000; // 15 s : ce qui est ajouté ou supprimé dans Metricool se voit presque tout de suite chez le client
const cache = new Map();

const NET = { instagram: "Instagram", facebook: "Facebook", youtube: "YouTube", tiktok: "TikTok", linkedin: "LinkedIn", gmb: "Fiche Google" };

function isoDay(d, end) {
  const p = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${end ? "23:59:59" : "00:00:00"}`;
}

async function fetchScheduled(blogId, days = 14) {
  const key = blogId + ":" + days;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.posts;

  let raw;
  if (!process.env.METRICOOL_USER_TOKEN) {
    // Mode test sans clé : exemple tiré du planning réel de la marque GABRIEL (30/10/2026).
    raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "demo", "metricool-sample.json"), "utf8"));
  } else {
    const from = new Date(), to = new Date(); to.setDate(to.getDate() + days);
    const q = new URLSearchParams({
      blogId, userId: process.env.METRICOOL_USER_ID || "",
      start: isoDay(from), end: isoDay(to, true), timezone: "Europe/Paris",
    });
    const res = await fetch(BASE + PATH_SCHEDULED + "?" + q, {
      headers: { "X-Mc-Auth": process.env.METRICOOL_USER_TOKEN, Accept: "application/json" },
    });
    if (!res.ok) throw new Error("Metricool " + res.status);
    raw = await res.json();
  }
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw.data) ? raw.data : [];
  const posts = arr.map(mapPost).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  cache.set(key, { at: Date.now(), posts });
  return posts;
}

function mapPost(p) {
  const dt = (p.publicationDate && p.publicationDate.dateTime) || "";
  const ig = p.instagramData || {}, fb = p.facebookData || {}, yt = p.youtubeData || {};
  const story = ig.type === "STORY" || fb.type === "STORY";
  const provs = Array.isArray(p.providers) ? p.providers : [];
  const published = provs.length > 0 && provs.every(x => x.status === "PUBLISHED");
  const igUrl = (provs.find(x => x.network === "instagram" && /^https:\/\/(www\.)?instagram\.com\//.test(x.publicUrl || "")) || {}).publicUrl || "";
  const first = String(p.text || "").split("\n").find(l => l.trim() && !l.trim().startsWith("#")) || "";
  // Médias : copie Metricool, ou fichier encore sur notre serveur (brouillon envoyé en validation : Metricool ne le copie qu'à la programmation),
  // servi alors directement par l'appli, sans attendre Metricool
  const own = u => { const m = String(u).match(/^https:\/\/[^/]+(\/f\/[a-f0-9]{32}(?:\.[a-z0-9]{1,7})?)$/); return m ? m[1] : ""; };
  const media = (Array.isArray(p.media) ? p.media : []).map(u => /^https:\/\/static\.metricool\.com\//.test(u) ? u : own(u)).filter(Boolean);
  const rawText = String(p.text || "").trim();
  return {
    id: "mc" + p.id,
    date: dt.slice(0, 10),
    time: dt.slice(11, 16),
    net: provs.map(x => NET[x.network] || x.network).join(", "),
    type: story ? "Story" : ig.type === "TRIAL_REEL" ? "Réel test" : fb.type === "REEL" || ig.type === "REEL" ? "Réel" : "Publication",
    label: p.draft ? "Brouillon" : published ? "Publiée" : "Programmée",
    title: yt.title || first || (story ? "Story" : "Publication"),
    text: String(p.text || "").replace(/\n+#[^\n]*$/, "").trim(),
    media: media.map(u => ({ url: u, video: /\.(mp4|mov|webm)(\?|$)/i.test(u) })),
    published,
    url: igUrl,
    review: reviewOf(p),
    // Prête à montrer au client : avec son visuel ou sa vidéo, et sa description si c'est un brouillon déposé par l'agence
    ready: media.length > 0 && (media.length === (Array.isArray(p.media) ? p.media.length : 0)) && (!p.draft || !!rawText),
  };
}

// Publications d'un mois passé (bilan mensuel) : du premier au dernier jour du mois « AAAA-MM »
async function fetchMonth(blogId, month) {
  // « month » : « AAAA-MM », ou [début, fin] en « AAAA-MM-JJ » pour une période libre
  const rng = Array.isArray(month) ? month : null, key = blogId + ":m:" + (rng ? rng.join("_") : month), hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.posts;
  let raw;
  if (!process.env.METRICOOL_USER_TOKEN) raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "demo", "metricool-sample.json"), "utf8"));
  else {
    let a, b; if (rng) { a = rng[0]; b = rng[1]; } else { const [y, m] = month.split("-").map(Number); a = month + "-01"; b = month + "-" + String(new Date(y, m, 0).getDate()).padStart(2, "0"); }
    const q = new URLSearchParams({ blogId, userId: process.env.METRICOOL_USER_ID || "", start: a + "T00:00:00", end: b + "T23:59:59", timezone: "Europe/Paris" });
    const res = await fetch(BASE + PATH_SCHEDULED + "?" + q, { headers: { "X-Mc-Auth": process.env.METRICOOL_USER_TOKEN, Accept: "application/json" } });
    if (!res.ok) throw new Error("Metricool " + res.status);
    raw = await res.json();
  }
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw.data) ? raw.data : [];
  const posts = arr.map(mapPost).filter(p => (rng ? p.date >= rng[0] && p.date <= rng[1] : p.date.slice(0, 7) === month) && p.label !== "Brouillon").sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  cache.set(key, { at: Date.now(), posts });
  return posts;
}

// Oublie le planning gardé en mémoire d'une marque (dépôt d'une publication à valider)
function forget(blogId) { for (const k of [...cache.keys()]) if (k.startsWith(String(blogId) + ":")) cache.delete(k); }
module.exports = { publishDraft, fetchScheduled, fetchMonth, forget, reviewDecision };

// Publication envoyée « en vérification » dans Metricool : identifiants nécessaires pour l'approuver ou la refuser
function reviewOf(p) {
  const a = p.postApprovalData; if (!a || a.approvalStatus !== "pending") return null;
  const ids = (a.approvalEvents || []).filter(e => !e.deleted && e.status === "pending").map(e => e.reviewerId);
  return ids.length ? { uuid: String(p.uuid || (a.approvalEvents[0] || {}).postUuid || ""), reviewers: ids } : null;
}

// Décision du client dans son espace, reportée dans Metricool : « ok » approuve, « mod » refuse avec la note
async function reviewDecision(blogId, mcId, review, status, note) {
  const tok = process.env.METRICOOL_USER_TOKEN; if (!tok || !blogId || !review || !review.uuid) return false;
  const id = String(mcId).replace(/^mc/, ""), q = new URLSearchParams({ blogId, userId: process.env.METRICOOL_USER_ID || "" });
  let ok = true;
  for (const reviewerId of review.reviewers) {
    const body = { postUuid: review.uuid, reviewerId, status: status === "ok" ? "approved" : "rejected" };
    if (status !== "ok" && note) body.noteContent = String(note).slice(0, 2000);
    const r = await fetch(BASE + "/v2/scheduler/posts/" + id + "/approvals?" + q, { method: "PUT", headers: { "X-Mc-Auth": tok, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!r.ok) { ok = false; console.error("Metricool approbation", id, r.status, (await r.text()).slice(0, 300)); }
  }
  forget(blogId); return ok;
}

// Brouillon soumis au client puis validé dans son espace : il passe en publication programmée (même contenu, draft à false)
async function publishDraft(blogId, mcId, day) {
  const tok = process.env.METRICOOL_USER_TOKEN; if (!tok || !blogId) return false;
  const id = String(mcId).replace(/^mc/, ""), d0 = new Date((day || new Date().toISOString().slice(0, 10)) + "T12:00:00"), d1 = new Date(d0);
  d0.setDate(d0.getDate() - 2); d1.setDate(d1.getDate() + 2);
  const q = new URLSearchParams({ blogId, userId: process.env.METRICOOL_USER_ID || "", start: isoDay(d0), end: isoDay(d1, true), timezone: "Europe/Paris" });
  const r = await fetch(BASE + PATH_SCHEDULED + "?" + q, { headers: { "X-Mc-Auth": tok, Accept: "application/json" } }); if (!r.ok) return false;
  const j = await r.json(), arr = Array.isArray(j) ? j : Array.isArray(j.data) ? j.data : [], p = arr.find(x => String(x.id) === id);
  if (!p || !p.draft) return false;
  const body = Object.assign({}, p, { draft: false });
  const u = await fetch(BASE + PATH_SCHEDULED + "/" + id + "?" + new URLSearchParams({ blogId, userId: process.env.METRICOOL_USER_ID || "" }), { method: "PUT", headers: { "X-Mc-Auth": tok, Accept: "application/json", "Content-Type": "application/json" }, body: JSON.stringify(body) });
  cache.clear(); return u.ok;
}

