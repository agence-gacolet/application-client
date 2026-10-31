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
const hm = d => d.getHours()+" h "+pad(d.getMinutes());
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
const LOGO = '<svg viewBox="140 158 561 281" aria-hidden="true"><path transform="matrix(1,0,0,-1,700.5803,436.46803)" d="M0 0-147.532-1.615-193.477 45.57-273.888 22.275-261.335 93.466-366.182 35.258-183.556 179.076Z"/></svg>';
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
const S = { view: "accueil", d: null, f: null, pf: "wait", modOpen: null, kind: "Idée", draft: "", idDraft: "", pend: { chat: [], idee: [] } };
const posts = () => (S.d && S.d.posts) || [];
const waiting = () => posts().filter(p => p.status === "wait").length;
const has = m => S.d && S.d.client && (S.d.client.modules || []).includes(m);
const myName = () => (S.f && S.f.me.name) || "";
const seenAt = () => ls.get("gc-seen-chat") || "";
const unread = () => S.f ? S.f.messages.filter(m => !m.ext && (m.at || "") > seenAt()).length : 0;

/* ---------- Navigation ---------- */
const VIEWS = [["accueil","Accueil"],["valider","À valider"],["messagerie","Messagerie"],["idees","Mes idées"]];
const ICONS = {
  accueil:'<path d="M4 11.2 12 4.8l8 6.4V20h-5.6v-5.2H9.6V20H4z"/>',
  valider:'<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M8.5 12.3l2.4 2.4 4.6-4.9"/>',
  messagerie:'<path d="M4.5 6.5A2 2 0 0 1 6.5 4.5h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4.5 3.5v-3.5h0a2 2 0 0 1-1-1.7z"/>',
  idees:'<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>'
};
const ico = k => { const s = document.createElementNS("http://www.w3.org/2000/svg","svg"); s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("aria-hidden","true"); s.classList.add("ico"); s.innerHTML = ICONS[k] || ""; return s; };
function renderTabs(){
  const badge = { valider: waiting(), messagerie: S.view === "messagerie" ? 0 : unread() };
  const link = ([k, l]) => { const a = el("a"); a.href = "#"+k; a.appendChild(ico(k)); a.appendChild(el("span","lb",l)); if (k === S.view) a.setAttribute("aria-current","page"); if (badge[k]) a.appendChild(el("span","n",String(badge[k]))); return a; };
  const n = $("#tabs"); n.textContent = ""; n.appendChild(el("span","navlab","Mon espace")); VIEWS.forEach(v => n.appendChild(link(v)));
  const m = $("#mtabs"); m.textContent = ""; VIEWS.forEach(v => m.appendChild(link(v)));
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
async function decide(p, status, note){
  try { await api("/api/decision", { body: { postId: p.id, status, note, title: p.title, date: p.date + " " + (p.time || "") } });
    p.status = status; p.note = note || ""; p.decidedBy = myName(); p.decidedAt = new Date().toISOString(); S.modOpen = null;
    toast(status === "ok" ? "Validée. L’agence la programme." : "Demande envoyée à l’agence."); render();
  } catch(e){ toast(e.message); }
}
function mediaStrip(p){
  const box = el("div","cl-media"); const strip = el("div","cl-strip");
  p.media.forEach((m, i) => { let n; if (m.video){ n = document.createElement("video"); n.src = m.url; n.controls = true; n.playsInline = true; n.preload = i === 0 ? "metadata" : "none"; }
    else { n = document.createElement("img"); n.src = m.url; n.alt = (p.type || "Visuel") + " " + (i + 1); n.loading = "lazy"; } strip.appendChild(n); });
  box.appendChild(strip);
  if (p.media.length > 1){ const c = el("span","cl-count","1 / " + p.media.length); box.appendChild(c); strip.addEventListener("scroll", () => { c.textContent = (Math.round(strip.scrollLeft / strip.clientWidth) + 1) + " / " + p.media.length; }, { passive: true }); }
  return box;
}
function vValider(root){
  const n = { wait: waiting(), mod: posts().filter(p => p.status === "mod").length, ok: posts().filter(p => p.status === "ok").length };
  root.appendChild(head(["À", "valider"], "Validez ou demandez une modification. Rien n’est publié sans votre accord.",
    [segm([["wait","À valider" + (n.wait ? " " + n.wait : "")],["mod","Modifications"],["ok","Validées"]], S.pf, v => { S.pf = v; render(); })]));
  if (!has("com")){ root.appendChild(el("p","empty","Vos contenus à valider apparaîtront ici. L’agence vous prévient dès qu’un contenu est prêt.")); return; }
  if (S.d.postsError) root.appendChild(el("p","status",S.d.postsError));
  const list = posts().filter(p => p.status === S.pf);
  if (!list.length){ root.appendChild(el("p","empty", S.pf === "wait" ? "Rien en attente. On vous prévient dès que la suite est prête." : "Rien ici pour l’instant.")); return; }
  const g = el("div","cl-posts");
  list.forEach(p => {
    const c = el("article","cl-post");
    if ((p.media || []).length) c.appendChild(mediaStrip(p));
    const b = el("div","cl-pb");
    const meta = el("div","cl-pmeta"); meta.append(el("span","pill" + (p.status === "wait" ? " l3" : ""), { wait: "À valider", ok: "Validée", mod: "Modification demandée" }[p.status]), el("span",null, fmtDL(p.date) + (p.time ? ", " + p.time.replace(":"," h ") : "")), el("span",null,p.net || ""));
    b.appendChild(meta);
    if (p.title) b.appendChild(el("h3","cl-pt",p.title));
    if (p.text) b.appendChild(el("p","cl-cap",p.text));
    if (p.note) b.appendChild(el("p","cl-note","Votre demande : " + p.note));
    if (p.status !== "wait" && p.decidedBy) b.appendChild(el("p","muted cl-by",(p.status === "ok" ? "Validée" : "Modification demandée") + " par " + p.decidedBy + " le " + fmtD(p.decidedAt)));
    if (p.status !== "ok" && !p.published && !(S.f && S.f.preview)){
      const a = el("div","cl-acts");
      a.append(btn("Valider","lemon", () => decide(p, "ok")), btn(S.modOpen === p.id ? "Fermer" : "Demander une modification","", () => { S.modOpen = S.modOpen === p.id ? null : p.id; render(); setTimeout(() => { const t = document.getElementById("mod-" + p.id); if (t) t.focus(); }, 0); }));
      b.appendChild(a);
      if (S.modOpen === p.id){
        const box = el("div","cl-modbox"); const ta = el("textarea"); ta.id = "mod-" + p.id; ta.rows = 3; ta.placeholder = "Ce qu’il faut changer, par exemple la fin du texte ou la photo de couverture";
        box.append(ta, btn("Envoyer à l’agence","lemon", () => { if (!ta.value.trim()){ toast("Écrivez ce qu’il faut changer."); return; } decide(p, "mod", ta.value.trim()); }));
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

/* ---------- Messagerie : un seul groupe, le client et l’agence ---------- */
function vMessagerie(root){
  const me = myName(), msgs = (S.f && S.f.messages) || [];
  if (msgs.length){ const last = msgs[msgs.length - 1].at || ""; if (last > seenAt()) ls.set("gc-seen-chat", last); }
  const wrap = el("div","wa solo show-conv cl-wa");
  const main = el("section","wa-conv");
  const hd = el("header","wa-head"); const ht = el("div","wa-htx");
  ht.append(el("b",null,"Agence Gacolet"), el("small",null,"Votre groupe avec l’équipe : " + ((S.f && S.f.team) || []).map(t => t.name).join(", ")));
  hd.append(avatarEl("Agence Gacolet", 40, { logo: true }), ht); main.appendChild(hd);
  const list = el("div","wa-msgs"); list.id = "chat-list";
  if (!msgs.length) list.appendChild(el("p","wa-empty","Écrivez à l’agence : une question, une précision, un retour. L’équipe répond ici."));
  let prev = null;
  msgs.forEach(m => {
    const md = new Date(m.at || 0), d = iso(md);
    if (!prev || iso(new Date(prev.at || 0)) !== d){ const dl = fmtDL(d); list.appendChild(el("div","wa-day", d === today() ? "Aujourd’hui" : d === addDays(today(), -1) ? "Hier" : dl.charAt(0).toUpperCase() + dl.slice(1))); prev = null; }
    const mine = !!m.ext && m.who === me, grouped = prev && prev.who === m.who && (Date.parse(m.at) - Date.parse(prev.at)) < 5*60000;
    const line = el("div","wa-line" + (mine ? " mine" : "") + (grouped ? " cont" : ""));
    if (!mine) line.appendChild(grouped ? el("span","av-sp") : avatarEl(m.who, 30));
    const bub = el("div","wa-bub");
    if (!mine && !grouped){ const nm = el("b","wa-name",m.who || ""); const t = ((S.f && S.f.team) || []).find(x => x.name === m.who); nm.style.color = avColor(m.who); bub.appendChild(nm); if (t && t.poste) nm.appendChild(el("span","cl-poste"," " + t.poste)); }
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
  const ta = el("textarea"); ta.id = "chat-input"; ta.rows = 1; ta.placeholder = "Écrire à l’agence"; ta.value = S.draft;
  const go2 = el("button","wa-send"); go2.type = "submit"; go2.setAttribute("aria-label","Envoyer"); go2.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-4 16-4-6.5z"/><path d="M12 13.5 20 4"/></svg>';
  ta.oninput = () => { S.draft = ta.value; ta.style.height = "auto"; ta.style.height = Math.min(140, ta.scrollHeight) + "px"; };
  const send = async () => {
    if (S.f.preview){ toast("Aperçu de l’agence : rien n’est envoyé."); return; }
    if (busy("chat")){ toast("Attendez la fin de l’envoi des fichiers."); return; }
    const t = ta.value.trim(), files = readyFiles("chat"); if (!t && !files.length) return;
    S.draft = ""; S.pend.chat = []; go2.disabled = true;
    try { await api("/api/c/msg", { body: { text: t, files } }); await loadFeed(); } catch(e){ S.draft = t; toast(e.message); render(); }
  };
  ta.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !window.matchMedia("(max-width:640px)").matches){ e.preventDefault(); send(); } };
  form.onsubmit = e => { e.preventDefault(); send(); };
  bar.append(fi, clip, ta, go2); form.appendChild(bar);
  main.ondragover = e => { e.preventDefault(); main.classList.add("drop"); };
  main.ondragleave = () => main.classList.remove("drop");
  main.ondrop = e => { e.preventDefault(); main.classList.remove("drop"); if (e.dataTransfer.files.length) addFiles("chat", e.dataTransfer.files); };
  main.appendChild(form); wrap.appendChild(main); root.appendChild(wrap);
  list.querySelectorAll("img,video").forEach(x => x.addEventListener(x.tagName === "IMG" ? "load" : "loadedmetadata", () => { list.scrollTop = list.scrollHeight; }, { once: true }));
  requestAnimationFrame(() => { list.scrollTop = list.scrollHeight; if (ta.value){ ta.style.height = "auto"; ta.style.height = Math.min(140, ta.scrollHeight) + "px"; } });
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

/* ---------- Rendu ---------- */
const R = { accueil: vAccueil, valider: vValider, messagerie: vMessagerie, idees: vIdees };
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

async function loadFeed(){ const f = await api("/api/c/feed"); const before = S.f ? JSON.stringify([S.f.messages.map(m => m.id + m.at), S.f.idees.map(i => i.id + (i.seen || []).length)]) : ""; S.f = f;
  const after = JSON.stringify([f.messages.map(m => m.id + m.at), f.idees.map(i => i.id + (i.seen || []).length)]);
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
if (APERCU){ const b = el("div","cl-apercu","Aperçu de l’agence : vous voyez l’espace de ce client, en lecture seule."); document.body.appendChild(b); }
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
start();
})();
