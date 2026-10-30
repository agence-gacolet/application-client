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
    net: provs.map(x => NET[x.network] || x.network).join(" · "),
    type: story ? "Story" : ig.type === "TRIAL_REEL" ? "Réel test" : fb.type === "REEL" || ig.type === "REEL" ? "Réel" : "Publication",
    label: p.draft ? "Brouillon" : published ? "Publiée" : "Programmée",
    title: yt.title || first || (story ? "Story" : "Publication"),
    text: String(p.text || "").replace(/\n+#[^\n]*$/, "").trim(),
    media: media.map(u => ({ url: u, video: /\.(mp4|mov|webm)(\?|$)/i.test(u) })),
    published,
    url: igUrl,
  };
}

module.exports = { fetchScheduled };
