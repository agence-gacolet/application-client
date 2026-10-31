/* Espace client Agence Gacolet : accueil, validations, groupe de discussion avec l’agence, idées et médias.
   Même graphisme que l’espace de l’équipe (gestion.css). */
(function(){
"use strict";
const $ = s => document.querySelector(s);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null && text !== "") n.textContent = text; return n; };
const ls = { get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }, set(k,v){ try { localStorage.setItem(k,v); } catch(e){} }, del(k){ try { localStorage.removeItem(k); } catch(e){} } };
const pad = n => String(n).padStart(2,"0");
const iso = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const today = () => iso(new Date());
const addDays = (s, n) => { const [y,m,d] = s.split("-").map(Number); const x = new Date(y, m-1, d+n); return iso(x); };
const MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const MSHORT = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
const DAYS = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
const fmtDL = s => { const [y,m,d] = String(s).slice(0,10).split("-").map(Number); const x = new Date(y, m-1, d); return DAYS[x.getDay()]+" "+d+" "+MONTHS[m-1]; };
const fmtD = s => { const [y,m,d] = String(s).slice(0,10).split("-").map(Number); return d+" "+MSHORT[m-1]; };
const hm = d => d.getHours() + " h" + (d.getMinutes() ? " " + pad(d.getMinutes()) : "");
const fmtTime = t => { if (!t) return ""; const [h, mi] = String(t).split(":"); return Number(h) + " h" + (mi && mi !== "00" ? " " + mi : ""); };
const waTime = at => { const d = new Date(at || 0), k = iso(d); if (k === today()) return hm(d); if (k === addDays(today(), -1)) return "Hier"; return fmtD(k); };
const fmtSize = n => !n ? "" : n < 1024*1024 ? Math.max(1, Math.round(n/1024))+" ko" : (n/1024/1024).toFixed(1).replace(".",",")+" Mo";
const isImg = f => /^image\//.test(f.type || "") || /\.(jpe?g|png|gif|webp|heic)$/i.test(f.name || f.url || "");
const isVid = f => /^video\//.test(f.type || "") || /\.(mp4|mov|webm|m4v)$/i.test(f.name || f.url || "");
let toastT; function toast(msg){ let t = $(".toast"); if (!t){ t = el("div","toast"); t.setAttribute("role","status"); document.body.appendChild(t); } t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2600); }
function btn(label, cls, fn){ const b = el("button","btn "+(cls||""), label); b.type = "button"; b.onclick = fn; return b; }
function segm(options, value, onPick){ const s = el("div","seg"); s.setAttribute("role","group"); options.forEach(([v,l]) => { const b = el("button",null,l); b.type = "button"; b.setAttribute("aria-pressed", String(v === value)); b.onclick = () => onPick(v); s.appendChild(b); }); return s; }
function head(title, sub, tools){
  const h = el("header","head"); const l = el("div"); if (sub) l.appendChild(el("p","sub",sub));
  const h1 = el("h1"); if (Array.isArray(title)){ h1.append(document.createTextNode(title[0]+" ")); h1.appendChild(el("span","yr",title[1])); } else h1.textContent = title;
  l.appendChild(h1); h.appendChild(l);
  if (tools){ const t = el("div","tools"); tools.forEach(x => x && t.appendChild(x)); h.appendChild(t); }
  return h;
}
function openModal(build){ const m = $("#modal"); m.textContent = ""; m.className = "modal"; build(m); $("#overlay").classList.add("open"); }
function closeModal(){ $("#overlay").classList.remove("open"); }
$("#overlay").addEventListener("click", e => { if (e.target.id === "overlay") closeModal(); });
function confirmBox(title, text, okLabel, fn){
  openModal(m => { m.classList.add("sheet"); const t = el("h3",null,title); t.id = "mtitle"; m.appendChild(t); if (text) m.appendChild(el("p","muted",text));
    const a = el("div","actions"); a.append(btn("Annuler","", closeModal), btn(okLabel,"lemon", () => { closeModal(); fn(); })); m.appendChild(a); });
}

/* ---------- Avatars ---------- */
const AV_COLORS = ["#C6FF33","#5AC8FA","#FF9F5A","#C49BFF","#4CD9A0","#FF6B8B","#F5D04C","#7AA7FF"];
function avColor(s){ let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; }
function initials(s){ const w = String(s || "?").replace(/\(.*?\)/g, " ").replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/); return ((w[0] || "?")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase(); }
const LOGO = '<svg viewBox="140 158 561 281" aria-hidden="true"><path transform="matrix(1,0,0,-1,700.5803,436.46803)" d="M0 0-147.532-1.615-193.477 45.57-273.888 22.275-261.335 93.466-366.182 35.258-183.556 179.076Z"/><path transform="matrix(1,0,0,-1,232.1747,348.0155)" d="M0 0V0L-91.997-90.068 179.263 118.781 271.552 107.27 190.836 189.479 31.32 30.024"/></svg>';
function avatarEl(name, size, opts){
  opts = opts || {};
  const a = el("span","av"); a.style.width = a.style.height = size + "px"; a.style.fontSize = Math.round(size * .38) + "px";
  if (opts.logo){ a.classList.add("av-logo"); a.innerHTML = LOGO; return a; }
  const t = ((S.f && S.f.team) || []).find(x => x.name === name);
  if (t && t.avatar){ const i = document.createElement("img"); i.src = t.avatar; i.alt = ""; i.loading = "lazy"; a.appendChild(i); return a; }
  a.textContent = initials(name); a.style.background = avColor(name); return a;
}

/* ---------- API ---------- */
const APERCU = (() => { try { return new URLSearchParams(location.search).get("apercu") || ""; } catch(e){ return ""; } })();
let TOKEN = APERCU || ls.get("gc-token");
async function api(path, opt = {}){
  const headers = Object.assign({}, opt.headers || {});
  if (TOKEN) headers.Authorization = "Bearer " + TOKEN;
  let body = opt.body;
  if (body && !(body instanceof FormData)){ headers["Content-Type"] = "application/json"; body = JSON.stringify(body); }
  const r = await fetch(path, { method: opt.method || (body ? "POST" : "GET"), headers, body });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && TOKEN && !APERCU){ TOKEN = null; ls.del("gc-token"); start(); throw new Error(j.error || "Session expirée."); }
  if (!r.ok) throw new Error(j.error || "Une erreur est survenue.");
  return j;
}
function uploadFile(file, onProgress){
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest(); x.open("POST", "/api/c/upload"); if (TOKEN) x.setRequestHeader("Authorization", "Bearer " + TOKEN);
    x.upload.onprogress = e => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch(e){} x.status === 200 ? res(j) : rej(new Error(j.error || "Envoi impossible.")); };
    x.onerror = () => rej(new Error("Envoi impossible : vérifiez la connexion."));
    const fd = new FormData(); fd.append("file", file); x.send(fd);
  });
}

/* ---------- État ---------- */
const S = { view: "accueil", d: null, f: null, mmode: "main", mch: "grp", conv: false, pf: "wait", modOpen: null, kind: "Idée", draft: "", idDraft: "", pend: { chat: [], idee: [] } };
const posts = () => (S.d && S.d.posts) || [];
const waiting = () => posts().filter(p => p.status === "wait").length;
const has = m => S.d && S.d.client && (S.d.client.modules || []).includes(m);
const myName = () => (S.f && S.f.me.name) || "";
const unread = () => S.f ? [...new Set(S.f.messages.map(m => m.ch))].reduce((n, k) => n + unreadIn(k), 0) : 0;

/* ---------- Navigation ---------- */
const VIEWS = [["accueil","Accueil"],["valider","À valider"],["stats","Statistiques"],["meta","Meta"],["messagerie","Messagerie"],["visio","Visio"],["idees","Mes idées"],["prel","Prélèvements"]];
const MOBILE = ["accueil","valider","messagerie","stats"];
const ICONS = {
  accueil:'<path d="M4 11.2 12 4.8l8 6.4V20h-5.6v-5.2H9.6V20H4z"/>',
  valider:'<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12.3l2.4 2.4 4.6-4.9"/>',
  messagerie:'<path d="M4.5 6.5A2 2 0 0 1 6.5 4.5h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4.5 3.5v-3.5h0a2 2 0 0 1-1-1.7z"/>',
  visio:'<rect x="3" y="6.5" width="13" height="11" rx="2"/><path d="m16 10.5 5-3v9l-5-3"/>',
  stats:'<path d="M4 20V11M10 20V5M16 20v-6M22 20H2"/>',
  prel:'<rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/>',
  meta:'<path d="M4 10v4l3 .4L15 19V5L7 9.6z"/><path d="M18.2 9.4a3.6 3.6 0 0 1 0 5.2"/>',
  plus:'<path d="M5 7h14M5 12h14M5 17h14"/>',
  idees:'<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>'
};
const ico = k => { const s = document.createElementNS("http://www.w3.org/2000/svg","svg"); s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("aria-hidden","true"); s.classList.add("ico"); s.innerHTML = ICONS[k] || ""; return s; };
function renderTabs(){
  const badge = { valider: waiting(), messagerie: S.view === "messagerie" ? 0 : unread(), prel: billDue().length };
  const link = ([k, l]) => { const a = el("a"); a.href = "#"+k; a.appendChild(ico(k)); a.appendChild(el("span","lb",l)); if (k === S.view) a.setAttribute("aria-current","page"); if (badge[k]) a.appendChild(el("span","n",String(badge[k]))); return a; };
  const lockMark = a => { a.appendChild(el("span","lk-dot","Découvrir")); return a; };
  const link2 = v => { const a = link(v); if ((v[0] === "meta" && !has("meta")) || ((v[0] === "stats" || v[0] === "valider") && !has("com"))) { a.classList.add("lk-nav"); lockMark(a); } return a; };
  const n = $("#tabs"); n.textContent = ""; n.appendChild(el("span","navlab","Mon espace")); VIEWS.forEach(v => n.appendChild(link2(v)));
  const m = $("#mtabs"); m.textContent = ""; VIEWS.filter(v => MOBILE.includes(v[0])).forEach(v => m.appendChild(link2(v)));
  const more = el("button","morebtn"); more.type = "button"; more.appendChild(ico("plus")); more.appendChild(el("span","lb","Plus")); if (!MOBILE.includes(S.view)) more.setAttribute("aria-current","page");
  more.onclick = () => openModal(md => { md.classList.add("sheet"); const t = el("h3",null,"Menu"); t.id = "mtitle"; md.appendChild(t); const l = el("nav","morelist");
    VIEWS.filter(v => !MOBILE.includes(v[0])).forEach(v => { const a = link2(v); a.onclick = () => closeModal(); l.appendChild(a); }); md.appendChild(l);
    const o = el("div","actions"); o.appendChild(btn("Se déconnecter","sm", () => { closeModal(); $("#logout").click(); })); md.appendChild(o); });
  m.appendChild(more);
  $("#mbar-title").textContent = (VIEWS.find(v => v[0] === S.view) || ["",""])[1];
  $("#acct-name").textContent = myName(); $("#acct-role").textContent = (S.f && S.f.client.name) || "";
  const tot = badge.valider + unread(); try { if (navigator.setAppBadge) { tot ? navigator.setAppBadge(tot) : navigator.clearAppBadge(); } } catch(e){}
}
function go(v){ if (location.hash !== "#"+v) location.hash = v; else render(); }

/* ---------- Accueil ---------- */
function vAccueil(root){
  const now = new Date(), hr = now.getHours(), wd = now.getDay(), weekend = wd === 0 || wd === 6;
  const prenom = (S.f && S.f.me.prenom) || "";
  const hello = hr < 5 ? "Bonne nuit" : hr < 12 ? "Bonjour" : hr < 18 ? "Bon après-midi" : "Bonsoir";
  const w = waiting(), u = unread();
  let say = "Bienvenue dans l’espace " + ((S.f && S.f.client.name) || "de votre entreprise") + ".";
  if (w) say += w > 1 ? " " + w + " publications attendent votre accord." : " Une publication attend votre accord.";
  else if (u) say += u > 1 ? " L’agence vous a écrit " + u + " messages." : " L’agence vous a écrit.";
  else say += weekend ? " Tout est calé, bon week-end." : " Tout est à jour, l’agence s’occupe du reste.";
  const W = el("section","welcome2");
  const mark = el("div","w2-mug cl-mark"); mark.innerHTML = LOGO; mark.setAttribute("aria-hidden","true"); W.appendChild(mark);
  const dl = fmtDL(today()); W.appendChild(el("p","w2-date", dl.charAt(0).toUpperCase() + dl.slice(1)));
  const h1 = el("h1","w2-h"); h1.append(document.createTextNode(hello + " "), el("span", null, prenom)); W.appendChild(h1);
  W.appendChild(el("p","w2-say", say));
  const ideas = (S.f && S.f.idees.length) || 0;
  const tiles = [[w, w > 1 ? "publications à valider" : "publication à valider", "valider", "Tout est validé"], [u, u > 1 ? "nouveaux messages" : "nouveau message", "messagerie", "Rien de nouveau"], [ideas, ideas > 1 ? "idées partagées" : "idée partagée", "idees", "Partager une idée"]];
  W.appendChild(el("h2","w2-lab","En bref"));
  const s = el("div","w2-tiles");
  tiles.forEach(([n, l, v, z], i) => { const t = el("button","w2-tile" + (n ? "" : " zero")); t.type = "button"; t.style.animationDelay = (0.45 + i*0.08) + "s"; t.append(el("b",null,String(n)), el("span",null,l)); if (!n) t.appendChild(el("i",null,z)); t.onclick = () => go(v); s.appendChild(t); });
  W.appendChild(s);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (!standalone){ const ios = /iphone|ipad|ipod/i.test(navigator.userAgent); W.appendChild(el("p","cl-install", ios ? "Astuce : dans Safari, bouton Partager puis « Sur l’écran d’accueil » pour garder l’application à portée de main." : "Astuce : installez l’application depuis le menu du navigateur pour la garder à portée de main.")); }
  root.appendChild(W);
}

/* ---------- À valider ---------- */
const ST_LABEL = { wait: "À valider", ok: "Validée", mod: "Modification demandée", no: "Refusée" };
async function decide(p, status, note){
  if (S.f && S.f.preview){ toast("Aperçu en lecture seule : rien n’est envoyé. Pour agir vraiment, ouvrez le mode test depuis Paramètres, bouton « Tester pour de vrai »."); return; }
  try { await api("/api/decision", { body: { postId: p.id, status, note, title: p.title, date: p.date + " " + (p.time || "") } });
    p.status = status; p.note = note || ""; p.decidedBy = myName(); p.decidedAt = new Date().toISOString(); S.modOpen = null;
    if (status !== "ok"){ const t = (status === "mod" ? "Modification demandée sur « " : "Publication refusée : « ") + (p.title || "Publication") + " » (" + fmtDL(p.date) + (p.time ? ", " + fmtTime(p.time) : "") + ")" + (note ? "\n" + (status === "mod" ? "À changer : " : "Raison : ") + note : "");
      api("/api/c/msg", { body: { text: t } }).catch(() => {}); }
    toast(status === "ok" ? "Validée. L’agence la programme." : status === "mod" ? "Demande envoyée à l’agence." : "Refus envoyé à l’agence."); render();
  } catch(e){ toast(e.message); }
}
const isTall = p => /story|réel/i.test(p.type || "");
function typeLabel(p){ const n = (p.media || []).length; if (/story/i.test(p.type || "")) return n > 1 ? "Story, " + n + " écrans" : "Story"; if (/réel/i.test(p.type || "")) return p.type; return n > 1 ? "Carrousel, " + n + " visuels" : p.type || "Publication"; }
/* Défilement : flèches, points, glisser au doigt, flèches du clavier */
function slider(p, opts){
  opts = opts || {};
  const box = el("div","cl-media" + (isTall(p) ? " tall" : "") + (opts.full ? " full" : "")); const strip = el("div","cl-strip"); strip.tabIndex = 0; strip.setAttribute("aria-label", typeLabel(p));
  p.media.forEach((m, i) => { let n; if (m.video){ n = document.createElement("video"); n.src = m.url; n.controls = true; n.playsInline = true; n.preload = i === 0 ? "metadata" : "none"; }
    else { n = document.createElement("img"); n.src = m.url; n.alt = (p.type || "Visuel") + " " + (i + 1); n.loading = "lazy"; if (opts.onOpen){ n.onclick = () => opts.onOpen(cur()); n.classList.add("zoomable"); } } strip.appendChild(n); });
  box.appendChild(strip);
  if (!opts.full) box.appendChild(el("span","cl-type",typeLabel(p)));
  const cur = () => Math.round(strip.scrollLeft / Math.max(1, strip.clientWidth));
  const total = p.media.length;
  const goTo = i => { i = Math.max(0, Math.min(total - 1, i)); strip.scrollTo({ left: i * strip.clientWidth, behavior: "smooth" }); };
  if (total > 1){
    const c = el("span","cl-count","1 / " + total); box.appendChild(c);
    const prev = el("button","cl-nav prev"); prev.type = "button"; prev.setAttribute("aria-label","Visuel précédent"); prev.innerHTML = '<svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg>';
    const next = el("button","cl-nav next"); next.type = "button"; next.setAttribute("aria-label","Visuel suivant"); next.innerHTML = '<svg viewBox="0 0 24 24"><path d="m9 5 7 7-7 7"/></svg>';
    prev.onclick = e => { e.stopPropagation(); goTo(cur() - 1); }; next.onclick = e => { e.stopPropagation(); goTo(cur() + 1); };
    const dots = el("div","cl-dots"); const ds = p.media.map((_, i) => { const d = el("button"); d.type = "button"; d.setAttribute("aria-label","Visuel " + (i + 1)); d.onclick = e => { e.stopPropagation(); goTo(i); }; dots.appendChild(d); return d; });
    const upd = () => { const i = cur(); c.textContent = (i + 1) + " / " + total; prev.disabled = i === 0; next.disabled = i === total - 1; ds.forEach((d, k) => d.setAttribute("aria-current", String(k === i))); };
    strip.addEventListener("scroll", () => { upd(); if (!opts.full) (S.sl = S.sl || {})[p.id] = cur(); }, { passive: true });
    const keep = !opts.full && S.sl && S.sl[p.id]; if (keep) requestAnimationFrame(() => { strip.scrollLeft = keep * strip.clientWidth; });
    strip.addEventListener("keydown", e => { if (e.key === "ArrowRight"){ e.preventDefault(); goTo(cur() + 1); } if (e.key === "ArrowLeft"){ e.preventDefault(); goTo(cur() - 1); } });
    box.append(prev, next, dots); upd(); box._goTo = goTo;
  }
  if (opts.onOpen){ const z = el("button","cl-zoom"); z.type = "button"; z.setAttribute("aria-label","Voir en grand"); z.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>'; z.onclick = () => opts.onOpen(cur()); box.appendChild(z); }
  return box;
}
/* Plein écran, comme sur le téléphone : on fait défiler, puis on décide */
function openViewer(p, start){
  const ov = el("div","cl-view"); ov.setAttribute("role","dialog"); ov.setAttribute("aria-modal","true"); ov.setAttribute("aria-label", p.title || "Publication");
  const top = el("div","cl-vtop"); const tt = el("div"); tt.append(el("b",null,typeLabel(p)), el("span",null, fmtDL(p.date) + (p.time ? ", " + fmtTime(p.time) : "") + (p.net ? ", " + p.net : "")));
  const x = el("button","cl-vx"); x.type = "button"; x.setAttribute("aria-label","Fermer"); x.innerHTML = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  top.append(tt, x); ov.appendChild(top);
  const sl = slider(p, { full: true }); ov.appendChild(sl);
  const bot = el("div","cl-vbot");
  if (p.text){ const cap = el("p","cl-vcap",p.text); bot.appendChild(cap); }
  if (canDecide(p)){ const a = el("div","cl-acts");
    a.append(btn("Valider","lemon", () => { close(); decide(p, "ok"); }), btn("Demander une modification","", () => { close(); openBox(p, "mod"); }));
    bot.appendChild(a); }
  else bot.appendChild(el("p","cl-vst", ST_LABEL[p.status] + (p.decidedBy ? " par " + p.decidedBy : "")));
  ov.appendChild(bot);
  const key = e => { if (e.key === "Escape") close(); };
  function close(){ document.removeEventListener("keydown", key); ov.remove(); document.body.classList.remove("cl-noscroll"); }
  x.onclick = close; document.addEventListener("keydown", key);
  document.body.appendChild(ov); document.body.classList.add("cl-noscroll");
  const strip = sl.querySelector(".cl-strip"); setTimeout(() => { strip.scrollTo({ left: (start || 0) * strip.clientWidth }); strip.focus({ preventScroll: true }); }, 30);
}
const canDecide = p => p.status !== "ok" && !p.published;
function openBox(p, kind){ S.modOpen = p.id; S.modKind = kind; render(); setTimeout(() => { const t = document.getElementById("mod-" + p.id); if (t){ t.scrollIntoView({ block: "center", behavior: "smooth" }); t.focus(); } }, 0); }
function vValider(root){
  const cnt = s => posts().filter(p => p.status === s).length;
  const n = { wait: waiting(), mod: cnt("mod") + cnt("no") };
  root.appendChild(head(["À", "valider"], "Faites défiler chaque contenu, puis validez ou expliquez ce qu’il faut changer. Rien n’est publié sans votre accord.",
    [segm([["wait","À valider" + (n.wait ? " " + n.wait : "")],["mod","Modifications" + (n.mod ? " " + n.mod : "")],["ok","Validées"]], S.pf, v => { S.pf = v; render(); })]));
  if (!has("com")){ locked(root, "com", valPreview); return; }
  if (S.d.postsError) root.appendChild(el("p","status",S.d.postsError));
  if (S.pf === "no") S.pf = "mod";
  const list = posts().filter(p => p.status === S.pf || (S.pf === "mod" && p.status === "no"));
  if (!list.length){ root.appendChild(el("p","empty", S.pf === "wait" ? "Rien en attente. On vous prévient dès que la suite est prête." : "Rien ici pour l’instant.")); return; }
  const g = el("div","cl-posts");
  list.forEach(p => {
    const c = el("article","cl-post");
    if ((p.media || []).length) c.appendChild(slider(p, { onOpen: i => openViewer(p, i) }));
    const b = el("div","cl-pb");
    const meta = el("div","cl-pmeta"); meta.append(el("span","pill" + (p.status === "wait" ? " l3" : p.status === "no" ? " no" : ""), ST_LABEL[p.status] || ""), el("span",null, fmtDL(p.date) + (p.time ? ", " + fmtTime(p.time) : "")), el("span",null,p.net || ""));
    b.appendChild(meta);
    if (p.title) b.appendChild(el("h3","cl-pt",p.title));
    if (p.text) b.appendChild(el("p","cl-cap",p.text));
    if (p.note) b.appendChild(el("p","cl-note" + (p.status === "no" ? " no" : ""), (p.status === "no" ? "Votre raison : " : "Votre demande : ") + p.note));
    if (p.status !== "wait" && p.decidedBy) b.appendChild(el("p","muted cl-by",ST_LABEL[p.status] + " par " + p.decidedBy + " le " + fmtD(p.decidedAt)));
    if (canDecide(p)){
      const open = S.modOpen === p.id, kind = "mod";
      const a = el("div","cl-acts");
      a.append(btn("Valider","lemon", () => decide(p, "ok")),
        btn(open ? "Fermer" : "Demander une modification","", () => { if (open){ S.modOpen = null; render(); } else openBox(p, "mod"); }));
      b.appendChild(a);
      if (open){
        const box = el("div","cl-modbox" + (kind === "no" ? " no" : "")); const ta = el("textarea"); ta.id = "mod-" + p.id; ta.rows = 3;
        ta.placeholder = "Ce qui ne vous convient pas et ce qu’il faut changer, par exemple le texte du deuxième visuel ou la musique";
        box.append(el("b",null,"Qu’est-ce qui ne vous convient pas ?"), ta, btn("Envoyer à l’agence","lemon", () => {
          if (!ta.value.trim()){ toast("Expliquez ce qui ne vous convient pas, l’agence en a besoin pour corriger."); ta.focus(); return; } decide(p, "mod", ta.value.trim()); }));
        b.appendChild(box);
      }
    }
    c.appendChild(b); g.appendChild(c);
  });
  root.appendChild(g);
}

/* ---------- Pièces jointes ---------- */
function attachEl(f){
  if (isImg(f)){ const a = el("a","wa-img"); a.href = f.url; a.target = "_blank"; a.rel = "noopener"; const i = document.createElement("img"); i.src = f.url; i.alt = f.name || "Photo"; i.loading = "lazy"; a.appendChild(i); return a; }
  if (isVid(f)){ const v = document.createElement("video"); v.className = "wa-vid"; v.src = f.url; v.controls = true; v.preload = "metadata"; v.playsInline = true; return v; }
  const a = el("a","wa-file"); a.href = f.url; a.target = "_blank"; a.rel = "noopener"; a.setAttribute("download", f.name || "");
  const ic = el("span","wa-fic", (String(f.name || "").split(".").pop() || "").slice(0, 4).toUpperCase() || "FICHIER");
  const tx = el("span","wa-ftx"); tx.append(el("b",null,f.name || "Fichier"), el("small",null,(f.size ? fmtSize(f.size) + ", " : "") + "Télécharger"));
  a.append(ic, tx); return a;
}
function addFiles(slot, list){
  [...list].forEach(file => {
    if (file.size > 300 * 1024 * 1024){ toast(file.name + " dépasse 300 Mo."); return; }
    const it = { name: file.name, type: file.type, size: file.size, pct: 0, local: isImg(file) ? URL.createObjectURL(file) : "" };
    S.pend[slot].push(it); render();
    uploadFile(file, p => { it.pct = p; const b = document.querySelector('[data-up="' + slot + S.pend[slot].indexOf(it) + '"]'); if (b) b.textContent = Math.round(p * 100) + " %"; })
      .then(r => { it.url = r.url; render(); })
      .catch(e => { toast(e.message); S.pend[slot] = S.pend[slot].filter(x => x !== it); render(); });
  });
}
function pendBox(slot){
  if (!S.pend[slot].length) return null;
  const pv = el("div","wa-pend");
  S.pend[slot].forEach((f, i) => { const c = el("span","wa-chip" + (f.url ? "" : " busy"));
    if (f.local){ const im = document.createElement("img"); im.src = f.local; c.appendChild(im); }
    c.appendChild(el("span",null,f.name)); if (!f.url){ const p = el("b",null,Math.round(f.pct * 100) + " %"); p.dataset.up = slot + i; c.appendChild(p); }
    const x = el("button",null,"Retirer"); x.type = "button"; x.onclick = () => { S.pend[slot] = S.pend[slot].filter(y => y !== f); render(); }; c.appendChild(x); pv.appendChild(c); });
  return pv;
}
const readyFiles = slot => S.pend[slot].filter(f => f.url).map(f => ({ url: f.url, name: f.name, type: f.type, size: f.size }));
const busy = slot => S.pend[slot].some(f => !f.url);

/* ---------- Messagerie : groupe principal, tournages et messages privés avec chaque membre ---------- */
function chKey(kind){ const id = S.f.client.id; return kind === "grp" ? (S.mmode === "shoot" ? "tg:cg:" : "cg:") + id : "cdm:" + id + "|" + kind.slice(3); }
function seenMap(){ try { return JSON.parse(ls.get("gc-seen2") || "{}"); } catch(e){ return {}; } }
function markSeen(ch){ const m = seenMap(), last = ((S.f && S.f.messages) || []).filter(x => x.ch === ch).map(x => x.at || "").sort().pop() || ""; if (last && last > (m[ch] || "")){ m[ch] = last; ls.set("gc-seen2", JSON.stringify(m)); } }
function unreadIn(ch){ const s = seenMap()[ch] || ""; return ((S.f && S.f.messages) || []).filter(m => m.ch === ch && !m.ext && (m.at || "") > s).length; }
function vMessagerie(root){
  const me = myName(), id = S.f.client.id, team = S.f.team || [];
  if (S.mch !== "grp" && !(S.mmode === "main" && team.some(t => "dm:" + t.name === S.mch))) S.mch = "grp";
  const ch = chKey(S.mch);
  const phone = window.matchMedia("(max-width:900px)").matches;
  if (S.conv || !phone) markSeen(ch);
  const all = (S.f && S.f.messages) || [], msgs = all.filter(m => m.ch === ch);
  const lastOf = k => all.filter(m => m.ch === k).pop();
  const wrap = el("div","wa cl-wa " + (S.conv ? "show-conv" : "show-list"));
  /* Liste */
  const side = el("nav","wa-list");
  const top = el("div","wa-top"); const tl = el("div","wa-tl"); tl.appendChild(el("h1",null,"Messagerie"));
  const sg = segm([["main","Principal"],["shoot","Tournage"]], S.mmode, v => { S.mmode = v; S.mch = "grp"; S.conv = false; render(); });
  [...sg.querySelectorAll("button")].forEach((b, i) => { const n = i ? unreadIn("tg:cg:" + id) : unreadIn("cg:" + id) + team.reduce((a, t) => a + unreadIn("cdm:" + id + "|" + t.name), 0); if (n) b.appendChild(el("span","cnt",String(n))); });
  /* Message privé : uniquement sur demande, avec le bouton + */
  if (S.mmode === "main" && team.length){ const plus = el("button","wa-new"); plus.type = "button"; plus.setAttribute("aria-label","Nouveau message privé"); plus.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
    plus.onclick = () => openModal(md => { md.classList.add("sheet"); const t = el("h3",null,"Message privé"); t.id = "mtitle"; md.appendChild(t); md.appendChild(el("p","muted","Choisissez la personne de l’agence à qui écrire. Elle seule verra la conversation."));
      const l = el("nav","morelist wa-pick"); team.forEach(p => { const a = el("button","wa-pick-row"); a.type = "button"; const tx = el("span"); tx.append(el("b",null,p.name), el("small",null,p.poste || "")); a.append(avatarEl(p.name, 36), tx); a.onclick = () => { closeModal(); S.mch = "dm:" + p.name; S.conv = true; render(); }; l.appendChild(a); }); md.appendChild(l);
      const o = el("div","actions"); o.appendChild(btn("Annuler","", closeModal)); md.appendChild(o); });
    tl.appendChild(plus); }
  top.append(tl, sg); side.appendChild(top);
  const row = (kind, label, sub, av) => {
    const k = chKey(kind), lm = lastOf(k), un = k === ch && (S.conv || !phone) ? 0 : unreadIn(k);
    const b = el("button","wa-row" + (un ? " unread" : "")); b.type = "button"; b.setAttribute("aria-pressed", String(k === ch));
    const tx = el("span","wa-rtx"); const t1 = el("span","wa-rtop"); t1.append(el("b",null,label), el("small",null, lm ? waTime(lm.at) : ""));
    const t2 = el("span","wa-rbot"); t2.append(el("span",null, lm ? (lm.ext && lm.who === me ? "Vous : " : kind === "grp" ? lm.who + " : " : "") + (lm.text || (lm.files ? "Pièce jointe" : lm.audio ? "Message vocal" : "")) : sub)); if (un) t2.appendChild(el("span","cnt",String(un)));
    tx.append(t1, t2); b.append(av, tx); b.onclick = () => { S.mch = kind; S.conv = true; render(); }; side.appendChild(b);
  };
  side.appendChild(el("span","wa-lab", S.mmode === "shoot" ? "Tournages" : "Groupe"));
  row("grp", S.mmode === "shoot" ? "Tournages avec l’agence" : "Agence Gacolet", S.mmode === "shoot" ? "Dates, lieux, préparation des tournages" : "Toute l’équipe", avatarEl("Agence Gacolet", 44, { logo: true }));
  const privs = S.mmode === "main" ? team.filter(t => lastOf(chKey("dm:" + t.name)) || S.mch === "dm:" + t.name) : [];
  if (privs.length){ side.appendChild(el("span","wa-lab","Privé")); privs.forEach(t => row("dm:" + t.name, t.name, t.poste || "Message privé", avatarEl(t.name, 44))); }
  /* Conversation */
  const main = el("section","wa-conv");
  const hd = el("header","wa-head");
  const back = el("button","wa-back"); back.type = "button"; back.setAttribute("aria-label","Retour aux conversations"); back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>'; back.onclick = () => { S.conv = false; render(); };
  const ht = el("div","wa-htx"); const isDm = S.mch !== "grp", other = isDm ? S.mch.slice(3) : "";
  const tm = team.find(t => t.name === other);
  ht.append(el("b",null, isDm ? other : S.mmode === "shoot" ? "Tournages avec l’agence" : "Agence Gacolet"), el("small",null, isDm ? (tm && tm.poste ? tm.poste + ", " : "") + "conversation privée" : (S.mmode === "shoot" ? "Organisation des tournages avec " : "Votre groupe avec ") + team.map(t => t.name).join(", ")));
  hd.append(back, isDm ? avatarEl(other, 40) : avatarEl("Agence Gacolet", 40, { logo: true }), ht); main.appendChild(hd);
  const list = el("div","wa-msgs"); list.id = "chat-list";
  if (!msgs.length) list.appendChild(el("p","wa-empty", isDm ? "Écrivez à " + other + " : seul " + other + " verra ces messages." : S.mmode === "shoot" ? "Tout ce qui concerne les tournages : dates, lieux, matériel, personnes à filmer." : "Écrivez à l’agence : une question, une précision, un retour. L’équipe répond ici."));
  let prev = null;
  msgs.forEach(m => {
    const md = new Date(m.at || 0), d = iso(md);
    if (!prev || iso(new Date(prev.at || 0)) !== d){ const dl = fmtDL(d); list.appendChild(el("div","wa-day", d === today() ? "Aujourd’hui" : d === addDays(today(), -1) ? "Hier" : dl.charAt(0).toUpperCase() + dl.slice(1))); prev = null; }
    const mine = !!m.ext && m.who === me, grouped = prev && prev.who === m.who && (Date.parse(m.at) - Date.parse(prev.at)) < 5*60000;
    const line = el("div","wa-line" + (mine ? " mine" : "") + (grouped ? " cont" : ""));
    if (!mine) line.appendChild(grouped ? el("span","av-sp") : avatarEl(m.who, 30));
    const bub = el("div","wa-bub");
    if (!mine && !grouped && !isDm){ const nm = el("b","wa-name",m.who || ""); const t = team.find(x => x.name === m.who); nm.style.color = avColor(m.who); bub.appendChild(nm); if (t && t.poste) nm.appendChild(el("span","cl-poste"," " + t.poste)); }
    (m.files || []).forEach(f => bub.appendChild(attachEl(f)));
    if (m.audio) { const au = document.createElement("audio"); au.controls = true; au.src = m.audio; au.preload = "none"; bub.appendChild(au); }
    if (m.text) bub.appendChild(el("div","wa-txt",m.text));
    bub.appendChild(el("span","wa-time",hm(md)));
    const col = el("div","wa-col"); col.appendChild(bub); line.appendChild(col);
    if (mine && !S.f.preview){ const x = el("button","wa-dots"); x.type = "button"; x.title = "Retirer ce message"; x.setAttribute("aria-label", x.title);
      x.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
      x.onclick = () => confirmBox("Retirer ce message ?", "Il disparaît aussi pour l’agence.", "Retirer", async () => { try { await api("/api/c/msg/" + m.id, { method: "DELETE" }); await loadFeed(); } catch(e){ toast(e.message); } });
      line.appendChild(x); }
    list.appendChild(line); prev = m;
  });
  main.appendChild(list);
  const form = el("form","wa-form");
  const pb = pendBox("chat"); if (pb) form.appendChild(pb);
  const bar = el("div","wa-bar");
  const fi = el("input"); fi.type = "file"; fi.multiple = true; fi.hidden = true; fi.accept = "image/*,video/*,.pdf"; fi.onchange = () => { addFiles("chat", fi.files); fi.value = ""; };
  const clip = el("button","wa-ic"); clip.type = "button"; clip.title = "Joindre une photo, une vidéo ou un fichier"; clip.setAttribute("aria-label", clip.title);
  clip.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5 12.4 19a5 5 0 0 1-7.1-7.1l8-8a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3"/></svg>'; clip.onclick = () => fi.click();
  const ta = el("textarea"); ta.id = "chat-input"; ta.rows = 1; ta.placeholder = isDm ? "Écrire à " + other : "Écrire à l’agence"; ta.value = S.draft;
  const go2 = el("button","wa-send"); go2.type = "submit"; go2.setAttribute("aria-label","Envoyer"); go2.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-4 16-4-6.5z"/><path d="M12 13.5 20 4"/></svg>';
  ta.oninput = () => { S.draft = ta.value; ta.style.height = "auto"; ta.style.height = Math.min(140, ta.scrollHeight) + "px"; };
  const send = async () => {
    if (S.f.preview){ toast("Aperçu de l’agence : rien n’est envoyé."); return; }
    if (busy("chat")){ toast("Attendez la fin de l’envoi des fichiers."); return; }
    const t = ta.value.trim(), files = readyFiles("chat"); if (!t && !files.length) return;
    S.draft = ""; S.pend.chat = []; go2.disabled = true;
    try { await api("/api/c/msg", { body: { ch, text: t, files } }); await loadFeed(); } catch(e){ S.draft = t; toast(e.message); render(); }
  };
  ta.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !window.matchMedia("(max-width:640px)").matches){ e.preventDefault(); send(); } };
  form.onsubmit = e => { e.preventDefault(); send(); };
  bar.append(fi, clip, ta, go2); form.appendChild(bar);
  main.ondragover = e => { e.preventDefault(); main.classList.add("drop"); };
  main.ondragleave = () => main.classList.remove("drop");
  main.ondrop = e => { e.preventDefault(); main.classList.remove("drop"); if (e.dataTransfer.files.length) addFiles("chat", e.dataTransfer.files); };
  main.appendChild(form); wrap.append(side, main); root.appendChild(wrap);
  list.querySelectorAll("img,video").forEach(x => x.addEventListener(x.tagName === "IMG" ? "load" : "loadedmetadata", () => { list.scrollTop = list.scrollHeight; }, { once: true }));
  requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; if (ta.value){ ta.style.height = "auto"; ta.style.height = Math.min(140, ta.scrollHeight) + "px"; } });
}

/* ---------- Visio mensuelle avec l’agence ---------- */
function vVisio(root){
  const v0 = S.f.visio || { here: [] }, v = { here: (v0.here || []).filter(n => n !== myName()) }, owner = (S.f.team || []).find(t => t.role === "owner") || { name: "l’agence" };
  root.appendChild(head(["Visio", "mensuelle"], "Votre point du mois avec " + owner.name + " : résultats, prochains contenus, vos questions."));
  const c = el("section","cl-visio" + (v.here.length ? " live" : ""));
  const ic = el("span","cl-vic"); ic.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6.5" width="13" height="11" rx="2"/><path d="m16 10.5 5-3v9l-5-3"/></svg>'; c.appendChild(ic);
  const tx = el("div","cl-vtx");
  tx.append(el("h2",null, v.here.length ? v.here.join(", ") + (v.here.length > 1 ? " vous attendent" : " vous attend") : "Votre salle de visio"),
    el("p","muted", v.here.length ? "La visio a commencé, rejoignez la salle." : "Le jour du rendez-vous, entrez dans la salle : micro, caméra et partage d’écran, sans rien installer."));
  const ev = ((S.d && S.d.events) || [])[0];
  if (ev) tx.appendChild(el("p","cl-next","Prochain rendez-vous : " + fmtDL(ev.date) + (ev.title ? ", " + ev.title : "")));
  c.appendChild(tx);
  const b = btn("Rejoindre la visio","lemon", () => { location.href = "/visio" + (APERCU ? "?c=" + encodeURIComponent(APERCU) : ""); }); c.appendChild(b);
  root.appendChild(c);
  root.appendChild(el("p","status","Le navigateur demande l’accès au micro la première fois. La caméra reste coupée tant que vous ne l’activez pas."));
}

/* ---------- Mes idées : idées, photos, vidéos pour les prochains contenus ---------- */
const KINDS = [["Idée","Idée"],["Photos","Photos"],["Vidéos","Vidéos"],["Inspiration","Inspiration"]];
function vIdees(root){
  root.appendChild(head(["Mes", "idées"], "Une idée de publication, des photos d’un chantier, une vidéo prise sur le vif : déposez tout ici, l’équipe s’en sert pour vos prochains contenus."));
  const card = el("form","cl-drop");
  card.appendChild(segm(KINDS, S.kind, v => { S.kind = v; render(); }));
  const ta = el("textarea"); ta.rows = 3; ta.id = "idee-input"; ta.value = S.idDraft;
  ta.placeholder = { "Idée": "Votre idée en quelques mots", "Photos": "Ce que montrent les photos, où et quand", "Vidéos": "Ce que montre la vidéo, ce que vous aimeriez en faire", "Inspiration": "Collez un lien ou décrivez ce qui vous plaît" }[S.kind];
  ta.oninput = () => { S.idDraft = ta.value; };
  card.appendChild(ta);
  const pb = pendBox("idee"); if (pb) card.appendChild(pb);
  const fi = el("input"); fi.type = "file"; fi.multiple = true; fi.hidden = true; fi.accept = "image/*,video/*"; fi.onchange = () => { addFiles("idee", fi.files); fi.value = ""; };
  const zone = el("button","cl-zone"); zone.type = "button";
  zone.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V5M7.5 9.5 12 5l4.5 4.5M5 15v3.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15"/></svg>';
  zone.appendChild(el("span",null,"Ajouter des photos ou des vidéos")); zone.appendChild(el("small",null,"Ou glissez-les ici, jusqu’à 300 Mo par fichier"));
  zone.onclick = () => fi.click();
  card.ondragover = e => { e.preventDefault(); card.classList.add("drop"); };
  card.ondragleave = () => card.classList.remove("drop");
  card.ondrop = e => { e.preventDefault(); card.classList.remove("drop"); if (e.dataTransfer.files.length) addFiles("idee", e.dataTransfer.files); };
  const sb = el("button","btn lemon","Envoyer à l’agence"); sb.type = "submit";
  card.append(fi, zone, sb);
  card.onsubmit = async e => { e.preventDefault();
    if (S.f.preview){ toast("Aperçu de l’agence : rien n’est envoyé."); return; }
    if (busy("idee")){ toast("Attendez la fin de l’envoi des fichiers."); return; }
    const text = ta.value.trim(), files = readyFiles("idee"); if (!text && !files.length){ toast("Écrivez une idée ou ajoutez une photo ou une vidéo."); return; }
    sb.disabled = true;
    try { await api("/api/c/idee", { body: { kind: S.kind, text, files } }); S.idDraft = ""; S.pend.idee = []; toast("Envoyé. Merci, l’équipe regarde ça."); await loadFeed(); }
    catch(x){ toast(x.message); sb.disabled = false; } };
  root.appendChild(card);
  const all = (S.f && S.f.idees) || [];
  root.appendChild(el("h2","cl-h2", all.length ? "Déjà partagé" : ""));
  if (!all.length){ root.appendChild(el("p","empty","Rien de partagé pour l’instant.")); return; }
  const g = el("div","id-grid");
  all.forEach(i => {
    const c = el("article","id-card");
    const h = el("header","id-h"); h.append(avatarEl(i.who, 34)); const t = el("div","id-ht"); t.append(el("b",null,i.who), el("small",null,waTime(i.at))); h.append(t, el("span","pill",i.kind || "Idée")); c.appendChild(h);
    if (i.text) c.appendChild(el("p","id-tx",i.text));
    if ((i.files || []).length){ const m = el("div","id-media"); i.files.forEach(x => m.appendChild(attachEl(x))); c.appendChild(m); }
    const a = el("div","id-acts"); a.appendChild(el("span","muted", (i.seen || []).length ? "Vu par l’agence" : "Envoyé"));
    if (i.who === myName() && !S.f.preview) a.appendChild(btn("Retirer","sm", () => confirmBox("Retirer cet envoi ?", "L’agence ne le verra plus.", "Retirer", async () => { try { await api("/api/c/idee/" + i.id, { method: "DELETE" }); await loadFeed(); } catch(e){ toast(e.message); } })));
    c.appendChild(a); g.appendChild(c);
  });
  root.appendChild(g);
}

/* ---------- Offres : ce que le client a, et ce qu’il peut découvrir ---------- */
const OFFERS = {
  com: { name: "Gestion des réseaux sociaux", pitch: "L’agence filme, monte et publie pour vous chaque mois. Vous validez ici chaque contenu avant sa sortie, et vous suivez vos vues, vos abonnés et les demandes reçues.", ask: "Bonjour Gabriel, je voudrais en savoir plus sur la gestion des réseaux sociaux." },
  meta: { name: "Publicité Meta", pitch: "Des publicités Facebook et Instagram qui vous amènent des contacts. Chaque demande arrive ici, vous la triez en un clic, et vous voyez combien coûte chaque contact.", ask: "Bonjour Gabriel, je voudrais en savoir plus sur la publicité Meta." }
};
const PITCH_VIDEO = ""; /* lien YouTube de la vidéo de présentation de Gabriel, à coller quand elle sera tournée */
function askGabriel(mod){
  const owner = ((S.f && S.f.team) || []).find(t => t.role === "owner" && /gab/i.test(t.name)) || ((S.f && S.f.team) || []).find(t => t.role === "owner");
  S.mmode = "main"; S.mch = owner ? "dm:" + owner.name : "grp"; S.conv = true; S.draft = OFFERS[mod].ask; go("messagerie");
}
/* Aperçu flouté d’un service non souscrit, avec l’invitation à découvrir */
function locked(root, mod, preview){
  const o = OFFERS[mod], w = el("section","lk");
  const pv = el("div","lk-pv"); pv.setAttribute("aria-hidden","true"); preview(pv); w.appendChild(pv);
  const card = el("div","lk-card");
  card.appendChild(el("span","lk-tag","À découvrir"));
  card.appendChild(el("h2",null,o.name));
  card.appendChild(el("p",null,o.pitch));
  if (PITCH_VIDEO){ const v = el("div","lk-vid"); const i = document.createElement("iframe"); i.src = PITCH_VIDEO; i.allow = "encrypted-media; fullscreen"; i.allowFullscreen = true; i.title = "Présentation par Gabriel"; v.appendChild(i); card.appendChild(v); }
  else card.appendChild(el("p","lk-soon","Une vidéo de présentation par Gabriel arrive bientôt ici."));
  const a = el("div","lk-acts"); a.append(btn("J’en parle à Gabriel","lemon", () => askGabriel(mod))); card.appendChild(a);
  w.appendChild(card); root.appendChild(w);
}
const fmtN = n => Number(n || 0).toLocaleString("fr-FR");
const perL = p => { const [y, m] = String(p).split("-").map(Number); return MONTHS[m - 1] + " " + y; };
const perS = p => { const [y, m] = String(p).split("-").map(Number); return MSHORT[m - 1]; };
function kpis(list){ const k = el("div","st-kpis"); list.filter(x => x[0] !== "" && x[0] != null).forEach(([n, l, e]) => { const x = el("div","st-kpi"); x.append(el("b",null,String(n)), el("span",null,l)); if (e) x.appendChild(el("em",null,e)); k.appendChild(x); }); return k; }
function barChart(data, label){
  const box = el("div","st-chart"); box.appendChild(el("h3",null,label));
  if (data.length < 2){ box.appendChild(el("p","muted","Le graphique apparaît dès le deuxième mois.")); return box; }
  const W = 560, H = 200, pb = 24, pt = 22, max = Math.max(1, ...data.map(d => d[1])) * 1.15, bw = Math.min(56, W / data.length - 14), gap = (W - bw * data.length) / Math.max(1, data.length - 1);
  let s = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + label + '">';
  data.forEach(([m, v], i) => { const x = i * (bw + gap), h = Math.max(2, (v / max) * (H - pb - pt)), y = H - pb - h, last = i === data.length - 1;
    s += '<rect x="' + x + '" y="' + y + '" width="' + bw + '" height="' + h + '" rx="6" fill="' + (last ? "#C6FF33" : "#33332F") + '"/>';
    s += '<text x="' + (x + bw / 2) + '" y="' + (y - 7) + '" text-anchor="middle" font-size="12" font-weight="700" fill="' + (last ? "#C6FF33" : "#A9A79F") + '">' + fmtN(v) + '</text>';
    s += '<text x="' + (x + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="12" fill="#77756E">' + m + '</text>'; });
  box.insertAdjacentHTML("beforeend", s + '</svg>'); return box;
}
const SAMPLE_COM = [["2026-05",{vues:8200,abonnes:64,publications:8,prevues:8,demandes:5}],["2026-06",{vues:11900,abonnes:91,publications:8,prevues:8,demandes:7}],["2026-07",{vues:15400,abonnes:120,publications:9,prevues:8,demandes:11}],["2026-08",{vues:21800,abonnes:168,publications:8,prevues:8,demandes:14}]];
function comStats(root, sample){
  const st = sample ? SAMPLE_COM.map(([period, data]) => ({ period, data })) : ((S.d && S.d.stats) || []).filter(s => s.module === "com");
  const s = st[st.length - 1];
  if (!s){ root.appendChild(el("p","empty","Vos premiers chiffres arrivent avec le bilan du mois.")); return; }
  const d = s.data, p = st[st.length - 2], dv = p && p.data.vues ? Math.round(((d.vues || 0) - p.data.vues) / p.data.vues * 100) : null;
  const hero = el("div","st-hero"); hero.append(el("span",null,"Demandes reçues grâce à vos réseaux"), el("b",null,fmtN(d.demandes)), el("em",null,"messages et appels, " + perL(s.period))); root.appendChild(hero);
  root.appendChild(kpis([[d.vues != null ? fmtN(d.vues) : "", "vues des vidéos", dv != null ? (dv >= 0 ? "+" : "") + dv + " % sur un mois" : ""],[d.abonnes != null ? "+" + fmtN(d.abonnes) : "", "nouveaux abonnés"],[d.publications != null ? d.publications : "", "publications", d.prevues ? "sur " + d.prevues + " prévues" : ""]]));
  root.appendChild(barChart(st.slice(-6).map(x => [perS(x.period), x.data.vues || 0]), "Vues des vidéos par mois"));
  if (!sample) root.appendChild(el("p","st-src","Source : " + (s.source || "Metricool") + ", " + perL(s.period) + "."));
}
function vStats(root){
  root.appendChild(head("Statistiques", "Ce que vos réseaux vous rapportent, mois après mois."));
  if (!has("com")){ locked(root, "com", pv => comStats(pv, true)); return; }
  comStats(root, false);
}
const SAMPLE_LEADS = [["2026-10-28","Demande de devis rénovation","Maison 120 m², Nîmes"],["2026-10-27","Rappel souhaité","Disponible après 18 h"],["2026-10-25","Devis salle de bain","Budget 8 000 €"],["2026-10-24","Question tarif","Uzès"]];
function metaBody(root, sample){
  const month = (S.d && S.d.month) || today().slice(0, 7);
  const leads = sample ? SAMPLE_LEADS.map(([date, title, detail], i) => ({ id: i, date, title, detail, qualified: i < 2 ? 1 : null })) : ((S.d && S.d.leads) || []).filter(l => String(l.date).slice(0, 7) === month);
  const q = leads.filter(l => l.qualified === 1).length, goal = sample ? 20 : (S.d.client.contactsGoal || 0);
  const hero = el("div","st-hero"); const top = el("div","st-row"); top.append(el("span",null,"Contacts qualifiés"), el("span",null, goal ? "Objectif : " + goal : ""));
  hero.append(top, el("b",null, String(sample ? 14 : q)), el("em",null,"selon la définition de votre contrat, " + perL(month)));
  if (goal){ const g = el("div","st-gauge"); const i = el("i"); i.style.width = Math.min(100, Math.round((sample ? 14 : q) / goal * 100)) + "%"; g.appendChild(i); hero.appendChild(g); }
  root.appendChild(hero);
  const st = sample ? { data: { depense: 420, budget: 450, touchees: 18300, annonces: 3 } } : ((S.d && S.d.stats) || []).filter(s => s.module === "meta" && s.period === month)[0];
  if (st){ const d = st.data; root.appendChild(kpis([[d.depense != null ? fmtN(d.depense) + " €" : "", "dépensés chez Meta", d.budget ? "sur " + fmtN(d.budget) + " € prévus" : ""],[d.depense && (sample ? 14 : q) ? (d.depense / (sample ? 14 : q)).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " €" : "", "par contact qualifié"],[d.touchees != null ? fmtN(d.touchees) : "", "personnes touchées"],[d.annonces, "annonces actives"]])); }
  root.appendChild(el("h2","cl-h2","Vos contacts"));
  const list = el("div","st-leads");
  if (!leads.length) list.appendChild(el("p","empty","Aucun contact ce mois-ci pour l’instant."));
  leads.forEach(c => { const r = el("div","st-lead"); const tx = el("div"); tx.append(el("b",null,c.title), el("small",null, fmtD(c.date) + (c.detail ? ", " + c.detail : "")));
    const a = el("div","st-la");
    [[true,"Qualifié"],[false,"Pas qualifié"]].forEach(([v, lab]) => { const b = el("button","st-q" + (v ? " yes" : " no"), lab); b.type = "button"; b.setAttribute("aria-pressed", String(c.qualified === (v ? 1 : 0)));
      if (!sample) b.onclick = async () => { if (S.f && S.f.preview){ toast("Aperçu de l’agence : rien n’est envoyé."); return; } const nv = c.qualified === (v ? 1 : 0) ? null : v; try { await api("/api/lead/" + c.id, { body: { qualified: nv } }); c.qualified = nv == null ? null : nv ? 1 : 0; render(); } catch(e){ toast(e.message); } };
      a.appendChild(b); });
    r.append(tx, a); list.appendChild(r); });
  root.appendChild(list);
  if (!sample){
    if (S.d.client.qualifiedDefinition) root.appendChild(el("p","st-src","Contact qualifié : " + S.d.client.qualifiedDefinition));
    root.appendChild(el("p","st-src","Le budget publicitaire est payé par vous, directement à Meta. Contacts reçus via vos publicités, " + perL(month) + "."));
  }
}
function vMeta(root){
  root.appendChild(head(["Publicité", "Meta"], "Vos contacts reçus grâce à la publicité Facebook et Instagram."));
  if (!has("meta")){ locked(root, "meta", pv => metaBody(pv, true)); return; }
  metaBody(root, false);
}
function valPreview(pv){
  const g = el("div","cl-posts");
  for (let i = 0; i < 3; i++){ const c = el("article","cl-post"); const m = el("div","lk-media"); c.appendChild(m); const b = el("div","cl-pb"); b.append(el("span","pill l3","À valider"), el("h3","cl-pt",["Le chantier de la semaine","Avant, après","Trois conseils d’entretien"][i]), el("p","cl-cap","Texte de la publication, prêt à être validé.")); c.appendChild(b); g.appendChild(c); }
  pv.appendChild(g);
}

/* ---------- Prélèvements, contrats et factures ---------- */
const BILL_ST = { payee: "Payée", attente: "À régler", retard: "En retard" };
const billOf = () => (S.f && S.f.billing) || { plan: null, docs: [] };
const billDue = () => billOf().docs.filter(d => d.kind === "facture" && d.status !== "payee");
const eur = n => Number(n || 0).toLocaleString("fr-FR", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 }) + " €";
const longD = s => { const [y, m, d] = String(s).split("-").map(Number); return (d === 1 ? "1er" : d) + " " + MONTHS[m - 1] + " " + y; };
/* Prochaine date de prélèvement : la date forcée par l’agence si elle est à venir, sinon le jour fixe du mois */
function nextDebit(p){
  if (!p) return "";
  const t = today(); if (p.next && p.next >= t) return p.next;
  const pad = n => String(n).padStart(2, "0");
  let [y, m] = t.split("-").map(Number);
  for (let i = 0; i < 14; i++){ const d = y + "-" + pad(m) + "-" + pad(p.day || 5);
    if (d >= t && (!p.start || d >= p.start)){ return p.end && d > p.end ? "" : d; }
    m++; if (m > 12){ m = 1; y++; } }
  return "";
}
function askAgency(text){
  const owner = ((S.f && S.f.team) || []).find(t => t.role === "owner" && /gab/i.test(t.name)) || ((S.f && S.f.team) || []).find(t => t.role === "owner");
  S.mmode = "main"; S.mch = owner ? "dm:" + owner.name : "grp"; S.conv = true; S.draft = text; go("messagerie");
}
function docRow(d){
  const r = el(d.url ? "a" : "div","bl-row" + (d.status === "retard" ? " late" : "")); if (d.url){ r.href = d.url; r.target = "_blank"; r.rel = "noopener"; }
  const ic = el("span","bl-ic"); ic.innerHTML = d.kind === "contrat" ? '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>';
  const tx = el("div","bl-tx"); tx.appendChild(el("b",null, d.title || (d.kind === "contrat" ? "Contrat" : "Facture") + (d.num ? " " + d.num : "")));
  const sub = [d.kind === "contrat" ? (d.date ? "Signé le " + longD(d.date) : "") : [d.num && d.title ? "N° " + d.num : "", d.date ? longD(d.date) : ""].filter(Boolean).join(", ")].filter(Boolean).join("");
  if (sub) tx.appendChild(el("small",null,sub));
  r.append(ic, tx);
  const end = el("div","bl-end");
  if (d.kind === "facture"){ if (d.amount) end.appendChild(el("b","bl-amt",eur(d.amount))); end.appendChild(el("span","bl-st " + d.status, BILL_ST[d.status] || "")); }
  if (d.url) end.appendChild(el("span","bl-open", d.kind === "contrat" ? "Ouvrir" : "PDF"));
  r.appendChild(end); return r;
}
function vPrel(root){
  root.appendChild(head(["Mes", "prélèvements"], "Votre abonnement, vos contrats et vos factures, au même endroit."));
  const b = billOf(), p = b.plan, nx = nextDebit(p);
  const contrats = b.docs.filter(d => d.kind === "contrat").sort((x, y) => (y.date || "").localeCompare(x.date || ""));
  const factures = b.docs.filter(d => d.kind === "facture").sort((x, y) => (y.date || "").localeCompare(x.date || ""));
  if (!p && !b.docs.length){
    const e = el("div","bl-empty"); e.append(el("b",null,"Rien à afficher pour l’instant"), el("p",null,"Votre échéancier, votre contrat et vos factures apparaîtront ici dès que l’agence les aura ajoutés."));
    e.appendChild(btn("Poser une question à l’agence","", () => askAgency("Bonjour, j’ai une question sur ma facturation."))); root.appendChild(e); return;
  }
  if (p){
    const hero = el("div","st-hero bl-hero");
    hero.appendChild(el("span",null, nx ? "Prochain prélèvement" : "Abonnement"));
    if (nx){ const [y, m, d] = nx.split("-").map(Number); const days = Math.round((new Date(y, m - 1, d) - new Date(today() + "T00:00:00")) / 864e5);
      hero.appendChild(el("b",null, (d === 1 ? "1er" : d) + " " + MONTHS[m - 1]));
      hero.appendChild(el("em",null, eur(p.amount) + " " + p.tax + (days === 0 ? ", aujourd’hui" : days === 1 ? ", demain" : ", dans " + days + " jours"))); }
    else { hero.appendChild(el("b",null, eur(p.amount))); hero.appendChild(el("em",null, p.end && p.end < today() ? "Engagement terminé le " + longD(p.end) : "Aucun prélèvement prévu pour l’instant")); }
    root.appendChild(hero);
    root.appendChild(kpis([[eur(p.amount) + " " + p.tax, p.label || "par mois"],["Le " + p.day, "de chaque mois", p.method],[p.end ? longD(p.end) : "", "fin d’engagement", p.start ? "depuis le " + longD(p.start) : ""]]));
  }
  const due = billDue();
  if (due.length){ const w = el("p","bl-warn", due.length === 1 ? "Une facture est en attente de règlement." : due.length + " factures sont en attente de règlement."); root.appendChild(w); }
  if (contrats.length){ root.appendChild(el("h2","cl-h2","Contrats")); const l = el("div","bl-list"); contrats.forEach(d => l.appendChild(docRow(d))); root.appendChild(l); }
  root.appendChild(el("h2","cl-h2","Factures"));
  if (factures.length){ const l = el("div","bl-list"); factures.forEach(d => l.appendChild(docRow(d))); root.appendChild(l); }
  else root.appendChild(el("p","empty","Vos factures apparaîtront ici."));
  const q = el("div","bl-help"); q.append(el("span",null,"Une question sur un prélèvement ou une facture ?"), btn("Écrire à l’agence","sm", () => askAgency("Bonjour, j’ai une question sur ma facturation."))); root.appendChild(q);
}

/* ---------- Rendu ---------- */
const R = { accueil: vAccueil, valider: vValider, stats: vStats, meta: vMeta, messagerie: vMessagerie, visio: vVisio, idees: vIdees, prel: vPrel };
function fromHash(){ const h = location.hash.replace("#",""); S.view = R[h] ? h : "accueil"; }
function render(){
  if (!S.d || !S.f) return;
  const root = $("#app"), fid = document.activeElement && document.activeElement.id, caret = fid && document.activeElement.selectionStart;
  const keepY = window.scrollY;
  renderTabs(); root.textContent = ""; document.body.classList.toggle("chat-full", S.view === "messagerie");
  R[S.view](root);
  window.scrollTo(0, keepY);
  if (fid){ const n = document.getElementById(fid); if (n){ n.focus({ preventScroll: true }); try { if (caret != null) n.setSelectionRange(caret, caret); } catch(e){} } }
}
window.addEventListener("hashchange", () => { fromHash(); S.modOpen = null; render(); window.scrollTo(0,0); });

async function loadFeed(){ const f = await api("/api/c/feed"); const before = S.f ? JSON.stringify([S.f.messages.map(m => m.id + m.at), S.f.idees.map(i => i.id + (i.seen || []).length), (S.f.visio || {}).here]) : ""; S.f = f;
  const after = JSON.stringify([f.messages.map(m => m.id + m.at), f.idees.map(i => i.id + (i.seen || []).length), (f.visio || {}).here]);
  const typing = document.activeElement && /^(TEXTAREA|INPUT)$/.test(document.activeElement.tagName) && S.view !== "messagerie";
  if (before !== after && !typing) render(); }
async function load(){
  try { const [d, f] = await Promise.all([api("/api/me"), api("/api/c/feed")]); S.d = d; S.f = f; fromHash(); $("#shell").hidden = false; $("#login").hidden = true; render(); }
  catch(e){ if (TOKEN){ const r = $("#app"); $("#shell").hidden = false; r.textContent = ""; const b = el("div","empty"); b.append(el("p",null,e.message), btn("Réessayer","lemon", () => load())); r.appendChild(b); } }
}
let poll = 0;
function startPoll(){ clearInterval(poll); poll = setInterval(() => { if (document.visibilityState === "visible" && TOKEN && S.f) loadFeed().catch(() => {}); }, 8000); }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && TOKEN && S.d) { api("/api/me").then(d => { S.d = d; render(); }).catch(() => {}); loadFeed().catch(() => {}); } });
$("#logout").onclick = () => confirmBox("Se déconnecter ?", "Il faudra saisir à nouveau votre code sur cet appareil.", "Se déconnecter", () => { TOKEN = null; ls.del("gc-token"); start(); });

/* ---------- Inscription avec le code de l’agence ---------- */
function onboard(){
  $("#shell").hidden = true; const box = $("#login"); box.hidden = false;
  let step = 0, info = null;
  const d = Object.assign({ code:"", prenom:"", nom:"", entreprise:"", email:"", tel:"", activite:"", zone:"", reseaux:[], objectif:"", clientele:"", dispo:"" }, JSON.parse(ls.get("gc-draft") || "{}"));
  const keep = () => ls.set("gc-draft", JSON.stringify(d));
  const field = (label, k, o = {}) => { const id = "onb-" + k; const l = el("label",null,label); l.htmlFor = id; const i = el(o.area ? "textarea" : "input"); i.id = id; if (!o.area) i.type = o.type || "text"; else i.rows = 3; i.value = d[k] || ""; if (o.ph) i.placeholder = o.ph; if (o.ac) i.autocomplete = o.ac; i.oninput = () => { d[k] = i.value; keep(); }; return [l, i]; };
  const chips = (label, k, opts, multi) => { const w = el("div","cl-chipf"); w.appendChild(el("label",null,label)); const c = el("div","cl-chips");
    opts.forEach(o => { const b = el("button",null,o); b.type = "button"; const on = () => multi ? d[k].includes(o) : d[k] === o; b.setAttribute("aria-pressed", String(on()));
      b.onclick = () => { if (multi) d[k] = on() ? d[k].filter(x => x !== o) : d[k].concat(o); else d[k] = o; keep(); c.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(multi ? d[k].includes(x.textContent) : d[k] === x.textContent))); }; c.appendChild(b); });
    w.appendChild(c); return w; };
  function draw(){
    box.textContent = ""; const f = el("form","login-card cl-onb"); f.noValidate = true;
    const lg = el("span","logo lg"); lg.append(el("span",null,"AGENCE"), el("span",null,"GACOLET")); f.appendChild(lg);
    const st = el("div","cl-steps"); for (let i = 0; i < 4; i++) st.appendChild(el("i", i <= step ? "on" : null)); f.appendChild(st);
    const er = el("p","err"); er.setAttribute("role","alert");
    const sb = el("button","btn solid", step === 2 ? "Terminer" : "Continuer"); sb.type = "submit";
    let check = async () => "";
    if (step === 0){
      f.append(el("h1",null,"Bienvenue"), el("p",null,"Entrez le code reçu par courriel de l’agence. Il relie l’application à votre compte."));
      const [l, i] = field("Votre code client","code",{ ph:"GAC-XXXX-XX", ac:"one-time-code" }); i.autocapitalize = "characters"; i.spellcheck = false; i.classList.add("cl-code"); f.append(l, i);
      check = async () => { const r = await api("/api/code", { body: { code: d.code } }); d.code = r.code; info = r.client; keep(); };
    } else if (step === 1){
      if (!d.entreprise && info) d.entreprise = info.name;
      f.append(el("h1",null,"Vous êtes"), el("p",null, info ? "Compte " + info.name + ". Pour savoir à qui l’on parle." : "Pour savoir à qui l’on parle."));
      const g = el("div","cl-g2"); const a = el("div"), b = el("div"); a.append(...field("Prénom","prenom",{ ac:"given-name" })); b.append(...field("Nom","nom",{ ac:"family-name" })); g.append(a, b); f.appendChild(g);
      f.append(...field("Entreprise","entreprise",{ ac:"organization" }), ...field("Courriel","email",{ type:"email", ac:"email" }), ...field("Téléphone, facultatif","tel",{ type:"tel", ac:"tel" }));
      check = async () => { if (!d.prenom.trim() || !d.nom.trim()) return "Indiquez votre prénom et votre nom."; if (!d.entreprise.trim()) return "Indiquez le nom de votre entreprise."; if (!/^\S+@\S+\.\S+$/.test(d.email.trim())) return "Indiquez une adresse courriel valide."; };
    } else if (step === 2){
      f.append(el("h1",null,"Votre métier"), el("p",null,"Quelques questions pour préparer vos contenus. Deux minutes, pas plus."));
      f.append(...field("Votre activité","activite",{ ph:"Ex. menuiserie sur mesure, portes et escaliers" }), ...field("Ville et zone d’intervention","zone",{ ph:"Ex. Nîmes et 30 km autour" }),
        chips("Réseaux déjà utilisés","reseaux",["Instagram","Facebook","TikTok","LinkedIn","Fiche Google","Aucun"],true),
        chips("Objectif principal","objectif",["Plus de demandes de devis","Recruter","Faire connaître la marque","Remplir l’agenda"],false),
        ...field("Vos clients types","clientele",{ ph:"Ex. particuliers propriétaires, 35 à 60 ans" }), ...field("Meilleurs moments pour tourner chez vous","dispo",{ area:true, ph:"Ex. mardi et jeudi matin, à l’atelier ou sur chantier" }));
      check = async () => { if (!d.activite.trim()) return "Décrivez votre activité en quelques mots."; if (!d.objectif) return "Choisissez votre objectif principal.";
        const r = await api("/api/register", { body: d }); TOKEN = r.token; ls.set("gc-token", TOKEN); ls.del("gc-draft"); };
    } else {
      f.append(el("h1",null,"C’est prêt"), el("p",null,"Merci " + d.prenom.trim() + ". L’agence a bien reçu vos informations."));
      sb.textContent = "Ouvrir mon espace"; check = async () => { location.hash = "accueil"; start(); return "stop"; };
    }
    f.append(er, sb);
    f.onsubmit = async e => { e.preventDefault(); er.textContent = ""; sb.disabled = true;
      try { const msg = await check(); if (msg === "stop") return; if (msg){ er.textContent = msg; return; } step++; draw(); } catch(x){ er.textContent = x.message; } finally { sb.disabled = false; } };
    box.appendChild(f); const f1 = f.querySelector("input,textarea"); if (f1) f1.focus({ preventScroll: true });
  }
  draw();
}

function start(){
  S.d = S.f = null; $("#app").textContent = "";
  if (!TOKEN) return onboard();
  $("#login").hidden = true; $("#shell").hidden = false;
  load(); startPoll();
}
const TEST = (() => { try { return new URLSearchParams(location.search).get("test") === "1"; } catch(e){ return false; } })();
if (APERCU){ const b = el("div","cl-apercu", TEST ? "Mode test : tout fonctionne vraiment, les actions sont signées Test Agence." : "Aperçu de l’agence : vous voyez l’espace de ce client, en lecture seule."); document.body.appendChild(b); document.body.classList.add("has-apercu"); }
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
start();
})();
