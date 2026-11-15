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
const CACHE_MS = 5 * 60 * 1000;
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
  const media = (Array.isArray(p.media) ? p.media : []).filter(u => /^https:\/\/static\.metricool\.com\//.test(u));
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
  };
}

// Publications d'un mois passé (bilan mensuel) : du premier au dernier jour du mois « AAAA-MM »
async function fetchMonth(blogId, month) {
  const key = blogId + ":m:" + month, hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.posts;
  let raw;
  if (!process.env.METRICOOL_USER_TOKEN) raw = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "demo", "metricool-sample.json"), "utf8"));
  else {
    const [y, m] = month.split("-").map(Number), last = new Date(y, m, 0).getDate();
    const q = new URLSearchParams({ blogId, userId: process.env.METRICOOL_USER_ID || "", start: month + "-01T00:00:00", end: month + "-" + String(last).padStart(2, "0") + "T23:59:59", timezone: "Europe/Paris" });
    const res = await fetch(BASE + PATH_SCHEDULED + "?" + q, { headers: { "X-Mc-Auth": process.env.METRICOOL_USER_TOKEN, Accept: "application/json" } });
    if (!res.ok) throw new Error("Metricool " + res.status);
    raw = await res.json();
  }
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw.data) ? raw.data : [];
  const posts = arr.map(mapPost).filter(p => p.date.slice(0, 7) === month && p.label !== "Brouillon").sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  cache.set(key, { at: Date.now(), posts });
  return posts;
}

module.exports = { publishDraft, fetchScheduled, fetchMonth };

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

