/* Application client Agence Gacolet. Noir, citron réservé aux actions, Bebas italique et Inter. */
(function(){
"use strict";
const $ = s => document.querySelector(s);
const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
const ls = { get(k){ try { return localStorage.getItem(k); } catch(e){ return null; } }, set(k,v){ try { localStorage.setItem(k,v); } catch(e){} }, del(k){ try { localStorage.removeItem(k); } catch(e){} } };
const MOIS = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
const MOIS_L = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const JOURS = ["dim.","lun.","mar.","mer.","jeu.","ven.","sam."];
const JOURS_L = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
const fd = s => { const [y,m,d] = String(s).slice(0,10).split("-").map(Number); const dt = new Date(y,m-1,d); return {d, m:MOIS[m-1], j:JOURS[dt.getDay()], y}; };
const hm = t => t ? t.replace(":"," h ") : "";
const SERVICE = {com:"Réseaux sociaux", meta:"Publicité Facebook et Instagram"};

/* ---------- API ---------- */
const APERCU = (() => { try { return new URLSearchParams(location.search).get("apercu") || ""; } catch(e){ return ""; } })();
let TOKEN = APERCU || ls.get("gc-token");
if (APERCU) document.addEventListener("DOMContentLoaded", () => { const b = el("div", null, "Aperçu de l’agence : vous voyez l’espace de ce client. Lecture seule."); b.style.cssText = "position:fixed;left:0;right:0;top:0;z-index:999;padding:8px 16px;background:#C6FF33;color:#0E0E0D;font:600 13px Inter,system-ui,sans-serif;text-align:center"; document.body.appendChild(b); });
async function api(path, opt = {}){
  const headers = Object.assign({}, opt.headers || {});
  if (TOKEN) headers.Authorization = "Bearer " + TOKEN;
  let body = opt.body;
  if (body && !(body instanceof FormData)){ headers["Content-Type"] = "application/json"; body = JSON.stringify(body); }
  const r = await fetch(path, {method: opt.method || (body ? "POST" : "GET"), headers, body});
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && TOKEN){ TOKEN = null; if (!APERCU) ls.del("gc-token"); start(); throw new Error(j.error || "Session expirée."); }
  if (!r.ok) throw new Error(j.error || "Une erreur est survenue.");
  return j;
}

/* ---------- État ---------- */
const S = { view:"accueil", d:null, pf:"wait", modOpen:null, rType:null, resTab:null, busy:false };
const has = m => S.d && S.d.client.modules.includes(m);
const posts = () => (S.d && S.d.posts) || [];
const waiting = () => posts().filter(p => p.status === "wait").length;
const monthLeads = () => (S.d.leads || []).filter(l => l.date.slice(0,7) === S.d.month);
const qualified = () => monthLeads().filter(l => l.qualified === 1).length;

let tt; function toast(m){ let t = $(".toast"); if (!t){ t = el("div","toast"); t.setAttribute("role","status"); document.body.appendChild(t); } t.textContent = m; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => t.hidden = true, 2600); }
function title(words){ const h = el("h1"); words.forEach(([w,c],i) => { if (i) h.appendChild(document.createElement("br")); h.appendChild(el("span",c||null,w)); }); return h; }

/* ---------- Inscription ---------- */
function onboard(){
  $(".top").hidden = true; $(".tabs").hidden = true;
  let step = 0, info = null;
  const d = Object.assign({code:"", prenom:"", nom:"", entreprise:"", email:"", tel:"", activite:"", zone:"", reseaux:[], objectif:"", clientele:"", dispo:""}, JSON.parse(ls.get("gc-draft") || "{}"));
  const keep = () => ls.set("gc-draft", JSON.stringify(d));
  const box = el("div","onb"); box.setAttribute("role","dialog"); box.setAttribute("aria-modal","true"); box.setAttribute("aria-label","Inscription");
  document.body.appendChild(box);
  const field = (label, k, opt = {}) => { const l = el("label",null,label); const i = el(opt.area ? "textarea" : "input"); i.id = "onb-"+k; if (!opt.area) i.type = opt.type || "text"; else i.rows = 3; i.value = d[k] || ""; if (opt.ph) i.placeholder = opt.ph; if (opt.ac) i.autocomplete = opt.ac; i.oninput = () => { d[k] = i.value; keep(); }; l.htmlFor = i.id; l.appendChild(i); if (opt.hint) l.appendChild(el("span","hint",opt.hint)); return l; };
  const chips = (label, k, opts, multi) => { const w = el("div"); const t = el("div",null,label); t.style.cssText = "font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--gris);margin-bottom:8px"; w.appendChild(t); const c = el("div","chips");
    opts.forEach(o => { const b = el("button",null,o); b.type = "button"; const on = () => multi ? d[k].includes(o) : d[k] === o; b.setAttribute("aria-pressed", String(on()));
      b.onclick = () => { if (multi) d[k] = on() ? d[k].filter(x => x !== o) : d[k].concat(o); else d[k] = o; keep(); c.querySelectorAll("button").forEach(x => { const v = x.textContent; x.setAttribute("aria-pressed", String(multi ? d[k].includes(v) : d[k] === v)); }); }; c.appendChild(b); });
    w.appendChild(c); return w; };
  function draw(){
    box.textContent = ""; const w = el("div","wrap");
    const st = el("div","steps"); for (let i = 0; i < 4; i++) st.appendChild(el("i", i <= step ? "on" : null)); w.appendChild(st);
    const logo = el("span","logo"); logo.append("AGENCE", document.createElement("br"), "GACOLET"); w.appendChild(logo);
    const er = el("p","err"); er.setAttribute("role","alert");
    const form = (label, check) => { const f = el("form","form"); f.noValidate = true; const b = el("button","btn go full",label); b.type = "submit";
      f.onsubmit = async e => { e.preventDefault(); er.textContent = ""; b.disabled = true; try { const msg = await check(); if (msg){ er.textContent = msg; return; } step++; draw(); box.scrollTo(0,0); } catch(x){ er.textContent = x.message; } finally { b.disabled = false; } };
      return {f, b}; };
    if (step === 0){
      w.appendChild(title([["Bien",""],["venue","c"]]));
      w.appendChild(el("p","lead","Entrez le code reçu par courriel de l'agence. Il relie l'application à votre compte."));
      const {f, b} = form("Continuer", async () => { const r = await api("/api/code", {body:{code:d.code}}); d.code = r.code; info = r.client; keep(); });
      const l = field("Votre code client","code",{ph:"GAC-XXXX-XX", ac:"one-time-code"}); const inp = l.querySelector("input"); inp.className = "code"; inp.autocapitalize = "characters"; inp.spellcheck = false;
      f.append(l, er, b); w.appendChild(f);
    } else if (step === 1){
      w.appendChild(title([["Vous",""],["êtes","o"]]));
      w.appendChild(el("p","lead", info ? "Compte "+info.name+". Pour savoir à qui l'on parle." : "Pour savoir à qui l'on parle."));
      const {f, b} = form("Continuer", () => { if (!d.prenom.trim() || !d.nom.trim()) return "Indiquez votre prénom et votre nom."; if (!d.entreprise.trim()) return "Indiquez le nom de votre entreprise."; if (!/^\S+@\S+\.\S+$/.test(d.email.trim())) return "Indiquez une adresse courriel valide."; });
      if (!d.entreprise && info) d.entreprise = info.name;
      const g = el("div","grid2"); g.append(field("Prénom","prenom",{ac:"given-name"}), field("Nom","nom",{ac:"family-name"}));
      f.append(g, field("Entreprise","entreprise",{ac:"organization"}), field("Courriel","email",{type:"email", ac:"email"}), field("Téléphone","tel",{type:"tel", ac:"tel", hint:"Facultatif, pour vous joindre vite"}), er, b); w.appendChild(f);
    } else if (step === 2){
      w.appendChild(title([["Votre",""],["métier","c"]]));
      w.appendChild(el("p","lead","Quelques questions pour préparer vos contenus. Deux minutes, pas plus."));
      const {f, b} = form("Terminer", async () => { if (!d.activite.trim()) return "Décrivez votre activité en quelques mots."; if (!d.objectif) return "Choisissez votre objectif principal.";
        const r = await api("/api/register", {body:d}); TOKEN = r.token; ls.set("gc-token", TOKEN); ls.del("gc-draft"); });
      f.append(field("Votre activité","activite",{ph:"Ex. menuiserie sur mesure, portes et escaliers"}), field("Ville et zone d'intervention","zone",{ph:"Ex. Nîmes et 30 km autour"}),
        chips("Réseaux que vous utilisez déjà","reseaux",["Instagram","Facebook","TikTok","LinkedIn","Fiche Google","Aucun"],true),
        chips("Votre objectif principal","objectif",["Plus de demandes de devis","Recruter","Faire connaître la marque","Remplir l'agenda"],false),
        field("Vos clients types","clientele",{ph:"Ex. particuliers propriétaires, 35 à 60 ans"}),
        field("Meilleurs moments pour tourner chez vous","dispo",{area:true, ph:"Ex. mardi et jeudi matin, à l'atelier ou sur chantier"}), er, b); w.appendChild(f);
    } else {
      const ok = el("div","ok-mark","✓"); ok.setAttribute("aria-hidden","true"); w.appendChild(ok);
      w.appendChild(title([["C'est",""],["prêt","c"]]));
      w.appendChild(el("p","lead","Merci "+d.prenom.trim()+". L'agence a bien reçu vos informations."));
      w.appendChild(installHint());
      const b = el("button","btn go full","Ouvrir l'application"); b.onclick = () => { box.remove(); location.hash = "accueil"; load(); };
      w.appendChild(b);
    }
    box.appendChild(w);
    const f1 = box.querySelector("input,textarea"); if (f1) f1.focus({preventScroll:true});
  }
  draw();
}

function installHint(){
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (standalone) return document.createDocumentFragment();
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const p = el("p","install");
  p.append(el("b",null,"Ajoutez l'application à l'écran d'accueil. "), document.createTextNode(ios ? "Dans Safari : bouton Partager, puis « Sur l'écran d'accueil »." : "Dans le menu du navigateur : « Installer l'application » ou « Ajouter à l'écran d'accueil »."));
  return p;
}

/* ---------- Barre et en-tête ---------- */
const ICONS = {
  accueil:'<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  publications:'<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  planning:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  resultats:'<path d="M4 20V11M10 20V5M16 20v-6M22 20H2"/>',
  demandes:'<path d="M4 5h16v11H9l-5 4z"/>'
};
const VIEWS = [["accueil","Accueil"],["publications","Valider"],["planning","Planning"],["resultats","Résultats"],["demandes","Demandes"]];
function header(){ $(".top").hidden = false; $(".tabs").hidden = false; $("#cname").textContent = S.d.me.entreprise || S.d.client.name; $("#cform").textContent = S.d.client.formula; }
function tabs(){
  const n = $("#tabs"); n.textContent = "";
  VIEWS.forEach(([k,l]) => { const a = el("a"); a.href = "#"+k; a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">'+ICONS[k]+'</svg>'; a.appendChild(el("span",null,l));
    if (k === S.view) a.setAttribute("aria-current","page");
    if (k === "publications" && waiting()) a.appendChild(el("span","b",String(waiting())));
    n.appendChild(a); });
}

/* ---------- Accueil ---------- */
function vAccueil(r){
  const t = new Date(); r.appendChild(el("p","eyebrow", JOURS_L[t.getDay()]+" "+t.getDate()+" "+MOIS_L[t.getMonth()]));
  r.appendChild(title([["Bonjour",""],[S.d.me.prenom,"o"]]));
  const off = el("div","offer"); S.d.client.modules.forEach(m => off.appendChild(el("span","pill wait",SERVICE[m]))); r.appendChild(off);
  r.appendChild(el("p","lead","Voici ce qui vous attend avec l'agence."));
  const w = waiting(), goal = S.d.client.contactsGoal;
  const big = el("button","big"); const m = el("div");
  if (has("meta") && !has("com")){
    big.onclick = () => nav("resultats");
    m.append(el("b",null,"Contacts qualifiés"), el("span",null, goal ? "Objectif du mois : "+goal : "Ce mois-ci"));
    m.appendChild(document.createElement("br")); m.appendChild(el("span","go","Voir la campagne →")); big.append(m, el("span","n",String(qualified())));
  } else {
    big.onclick = () => nav("publications");
    m.append(el("b",null, w ? "À valider" : "Tout est validé"), el("span",null, w ? "Votre accord avant la publication" : "Merci, l'agence s'occupe du reste"));
    m.appendChild(document.createElement("br")); m.appendChild(el("span","go","Voir →")); big.append(m, el("span","n",String(w)));
  }
  r.appendChild(big);
  const duo = el("div","duo");
  const toQualify = monthLeads().filter(l => l.qualified == null).length;
  const second = has("meta") && has("com") ? [qualified(),"Contacts qualifiés", goal ? "Objectif : "+goal : "Ce mois-ci","resultats"]
    : has("meta") ? [toQualify,"À trier","Contacts à qualifier","resultats"]
    : [S.d.deliverables.length,"Livrés","Vos fichiers","planning"];
  [second,[S.d.requests.length,"Demandes","Envoyer une idée","demandes"]].forEach(([n,b,s,v]) => { const x = el("button","mini"); x.append(el("span","n",String(n)), el("b",null,b), el("span",null,s)); x.onclick = () => nav(v); duo.appendChild(x); });
  r.appendChild(duo);
  const a = S.d.events[0];
  if (a){
    r.appendChild(el("h2",null,"Prochain rendez-vous"));
    const d = fd(a.date); const nx = el("div","next");
    const cal = el("div","cal"); cal.append(el("span",null,d.m), el("b",null,String(d.d)));
    const tx = el("div"); tx.append(el("p",null,a.title), el("small",null,d.j+(a.detail ? " · "+a.detail : ""))); nx.append(cal, tx); r.appendChild(nx);
  }
  r.appendChild(installHint());
  const lo = el("button","logout","Se déconnecter de cet appareil"); lo.onclick = () => { if (confirmLogout()){ TOKEN = null; ls.del("gc-token"); start(); } }; r.appendChild(lo);
}
function confirmLogout(){ return window.confirm ? window.confirm("Se déconnecter ? Il faudra saisir à nouveau votre code.") : true; }

/* ---------- Valider ---------- */
function mediaBlock(p){
  const box = el("div","media");
  const strip = el("div","strip");
  p.media.forEach((m, i) => {
    let n;
    if (m.video){ n = el("video"); n.src = m.url; n.controls = true; n.playsInline = true; n.preload = i === 0 ? "metadata" : "none"; n.setAttribute("playsinline",""); }
    else { n = el("img"); n.src = m.url; n.alt = p.type+" "+(i+1)+" sur "+p.media.length; n.loading = "lazy"; }
    strip.appendChild(n);
  });
  box.appendChild(strip);
  const tag = el("div","tag"); tag.append(el("span",null,p.type), el("span",null,p.label)); box.appendChild(tag);
  if (p.media.length > 1){ const c = el("span","count","1 / "+p.media.length); box.appendChild(c);
    strip.addEventListener("scroll", () => { c.textContent = (Math.round(strip.scrollLeft / strip.clientWidth) + 1)+" / "+p.media.length; }, {passive:true}); }
  return box;
}
async function decide(p, status, note){
  try { await api("/api/decision", {body:{postId:p.id, status, note, title:p.title, date:p.date+" "+p.time}});
    p.status = status; p.note = note || ""; p.decidedBy = S.d.me.prenom+" "+S.d.me.nom; p.decidedAt = new Date().toISOString(); S.modOpen = null;
    toast(status === "ok" ? "Validée. L'agence la programme." : "Demande envoyée. Réponse sous 48 h."); render();
  } catch(e){ toast(e.message); }
}
function vPublications(r){
  r.appendChild(el("p","eyebrow","14 prochains jours"));
  r.appendChild(title([["À",""],["valider","c"]]));
  r.appendChild(el("p","lead","Validez ou demandez une modification. Rien n'est publié sans votre accord écrit."));
  if (!has("com")){ r.appendChild(el("p","empty","Vos publicités à valider apparaîtront ici. L'agence vous prévient dès qu'une annonce est prête.")); return; }
  if (S.d.postsError) r.appendChild(el("p","note",S.d.postsError));
  const seg = el("div","seg");
  [["wait","À valider · "+waiting()],["mod","Modifs"],["ok","Validées"]].forEach(([v,l]) => { const b = el("button",null,l); b.setAttribute("aria-pressed", String(S.pf === v)); b.onclick = () => { S.pf = v; render(); }; seg.appendChild(b); });
  r.appendChild(seg);
  const list = posts().filter(p => p.status === S.pf);
  if (!list.length) r.appendChild(el("p","empty", S.pf === "wait" ? "Rien en attente. On vous prévient dès que la suite est prête." : "Rien ici pour l'instant."));
  list.forEach(p => {
    const c = el("article","post");
    if (p.media.length) c.appendChild(mediaBlock(p));
    const b = el("div","pbody"); const d = fd(p.date);
    const m = el("div","meta"); m.append(el("span","pill "+p.status, {wait:"À valider",ok:"Validée",mod:"Modif demandée"}[p.status]), el("span",null,d.j+" "+d.d+" "+d.m+(p.time ? ", "+hm(p.time) : "")), el("span",null,p.net)); b.appendChild(m);
    b.appendChild(el("p","ptitle",p.title));
    if (p.text) b.appendChild(el("p","cap",p.text));
    if (p.url){ const lk = el("a",null,"Voir sur Instagram ↗"); lk.href = p.url; lk.target = "_blank"; lk.rel = "noopener"; lk.style.cssText = "display:inline-block;margin-bottom:12px;font-size:12px;font-weight:800;color:var(--citron);text-decoration:none"; b.appendChild(lk); }
    if (p.note) b.appendChild(el("div","note","Demande : "+p.note));
    if (p.status !== "wait" && p.decidedBy){ const dd = fd(p.decidedAt); b.appendChild(el("p","by",(p.status === "ok" ? "Validée" : "Modification demandée")+" par "+p.decidedBy+" le "+dd.d+" "+dd.m)); }
    if (p.status !== "ok" && !p.published){
      const acts = el("div","acts");
      const ok = el("button","btn go","Valider"); ok.onclick = () => decide(p, "ok");
      const mo = el("button","btn","Modifier"); mo.setAttribute("aria-expanded", String(S.modOpen === p.id)); mo.onclick = () => { S.modOpen = S.modOpen === p.id ? null : p.id; render(); setTimeout(() => { const t = document.getElementById("mod-"+p.id); if (t) t.focus(); }, 0); };
      acts.append(ok, mo); b.appendChild(acts);
      if (S.modOpen === p.id){
        const box = el("div","modbox"); const lab = el("label",null,"Que faut-il changer ?"); const ta = el("textarea"); ta.id = "mod-"+p.id; ta.rows = 3; ta.placeholder = "Ex. changer la fin, préciser la ville"; lab.htmlFor = ta.id; lab.appendChild(ta);
        const er = el("p","err"); const send = el("button","btn go full","Envoyer à l'agence");
        send.onclick = () => { if (!ta.value.trim()){ er.textContent = "Écrivez ce qu'il faut changer."; return; } decide(p, "mod", ta.value.trim()); };
        box.append(lab, er, send); b.appendChild(box);
      }
    }
    c.appendChild(b); r.appendChild(c);
  });
}

/* ---------- Planning ---------- */
function row(item, right){ const x = el("div","row"+(item.kind === "tour" ? " tour" : "")); const d = fd(item.date); const dd = el("span","d", String(d.d)); dd.appendChild(el("small",null,d.m)); const m = el("div"); m.append(el("b",null,item.t), el("span",null,item.s || "")); x.append(dd, m, right || el("span")); return x; }
function vPlanning(r){
  r.appendChild(el("p","eyebrow","Votre agenda"));
  r.appendChild(title([["Plan",""],["ning","o"]]));
  r.appendChild(el("p","lead","Tournages, échéances et tout ce qui a été livré."));
  const ag = S.d.events, lv = S.d.deliverables;
  const h = el("h2",null,"À venir"); h.appendChild(el("small",null,ag.length+" date"+(ag.length>1?"s":""))); r.appendChild(h);
  const l = el("div","list"); ag.forEach(a => l.appendChild(row({date:a.date, kind:a.kind, t:a.title, s:a.detail}, a.kind === "tour" ? el("span","pill wait","Tournage") : null)));
  if (!ag.length) l.appendChild(el("p","empty","Aucune date pour l'instant.")); r.appendChild(l);
  const h2 = el("h2",null,"Livré"); h2.appendChild(el("small",null,lv.length+" fichier"+(lv.length>1?"s":""))); r.appendChild(h2);
  const l2 = el("div","list"); lv.forEach(a => { let lk = null; if (/^https:\/\//.test(a.url)){ lk = el("a","lk","Ouvrir"); lk.href = a.url; lk.target = "_blank"; lk.rel = "noopener"; } l2.appendChild(row({date:a.date, t:a.title, s:a.detail}, lk)); });
  if (!lv.length) l2.appendChild(el("p","empty","Vos fichiers livrés apparaîtront ici.")); r.appendChild(l2);
  if (S.d.client.driveUrl && /^https:\/\//.test(S.d.client.driveUrl)){ const a = el("a","btn full","Ouvrir le dossier partagé"); a.href = S.d.client.driveUrl; a.target = "_blank"; a.rel = "noopener"; a.style.cssText = "display:block;text-align:center;text-decoration:none;margin-top:16px"; r.appendChild(a); }
}

/* ---------- Résultats ---------- */
function bars(data, label){
  if (data.length < 2) return document.createDocumentFragment();
  const W = 320, H = 170, pl = 6, pb = 22, pt = 20, max = Math.max(1, ...data.map(d => d[1]))*1.15, bw = Math.min(44, (W-pl*2)/data.length - 8), gap = (W - pl*2 - bw*data.length)/(data.length-1);
  let svg = '<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="'+label+'">';
  [0,.5,1].forEach(f => { const y = H-pb-f*(H-pb-pt); svg += '<line x1="0" x2="'+W+'" y1="'+y+'" y2="'+y+'" stroke="#2E2E2B" stroke-width="1" stroke-dasharray="2 4"/>'; });
  data.forEach(([m,v],i) => { const x = pl+i*(bw+gap), h = (v/max)*(H-pb-pt), y = H-pb-h, last = i === data.length-1;
    svg += '<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+h+'" rx="6" fill="'+(last?"#C6FF33":"#33332F")+'"/>';
    svg += '<text class="val" x="'+(x+bw/2)+'" y="'+(y-6)+'" text-anchor="middle"'+(last?' style="fill:#C6FF33"':'')+'>'+Number(v).toLocaleString("fr-FR")+'</text>';
    svg += '<text class="lbl" x="'+(x+bw/2)+'" y="'+(H-6)+'" text-anchor="middle">'+m+'</text>'; });
  const c = el("div","chart"); c.appendChild(el("h3",null,label)); c.insertAdjacentHTML("beforeend", svg+'</svg>'); return c;
}
function kpiGrid(list){ const k = el("div","kpis"); list.filter(x => x[0] != null && x[0] !== "").forEach(([n,l,e]) => { const x = el("div","kpi"); x.append(el("b",null,String(n)), el("span",null,l)); if (e) x.appendChild(el("em",null,e)); k.appendChild(x); }); return k; }
const perLabel = p => { const [y,m] = p.split("-").map(Number); return MOIS[m-1]; };
const perLong = p => { const [y,m] = p.split("-").map(Number); return MOIS_L[m-1]+" "+y; };
const fmt = n => Number(n).toLocaleString("fr-FR");
function resCom(r){
  const st = S.d.stats.filter(s => s.module === "com"); const s = st[st.length-1];
  if (!s){ r.appendChild(el("p","empty","Vos premiers chiffres arrivent avec le bilan du mois.")); return; }
  const d = s.data;
  const hk = el("div","hero-k"); hk.append(el("span",null,"Demandes reçues via vos réseaux"), el("b",null,fmt(d.demandes || 0)), el("em",null,"messages et appels, "+perLong(s.period))); r.appendChild(hk);
  r.appendChild(kpiGrid([[d.vues != null ? fmt(d.vues) : "", "vues des vidéos"],[d.publications, "publications", d.prevues ? "sur "+d.prevues+" prévues" : ""],[d.abonnes != null ? fmt(d.abonnes) : "", "nouveaux abonnés"]]));
  r.appendChild(el("p","src","Source : "+(s.source || "Metricool")+" · "+perLong(s.period)));
  r.appendChild(bars(st.slice(-6).map(x => [perLabel(x.period), x.data.vues || 0]), "Vues des vidéos par mois"));
}
function resMeta(r){
  const goal = S.d.client.contactsGoal, q = qualified();
  const hk = el("div","hero-k"); const r2 = el("div","row2"); r2.append(el("span",null,"Contacts qualifiés"), el("span",null, goal ? "Objectif : "+goal : ""));
  hk.append(r2, el("b",null,String(q)), el("em",null,"selon la définition de votre contrat, "+perLong(S.d.month)));
  if (goal){ const g = el("div","gauge"); const gi = el("i"); gi.style.width = Math.min(100, Math.round(q/goal*100))+"%"; g.appendChild(gi); hk.appendChild(g); }
  r.appendChild(hk);
  const st = S.d.stats.filter(s => s.module === "meta" && s.period === S.d.month)[0];
  if (st){ const d = st.data;
    r.appendChild(kpiGrid([[d.depense != null ? fmt(d.depense)+" €" : "", "dépensés chez Meta", d.budget ? "sur "+fmt(d.budget)+" € prévus" : ""],[d.depense && q ? (d.depense/q).toLocaleString("fr-FR",{maximumFractionDigits:2})+" €" : "", "par contact qualifié"],[d.touchees != null ? fmt(d.touchees) : "", "personnes touchées"],[d.annonces, "annonces actives"]]));
    r.appendChild(el("p","src","Source : "+(st.source || "Gestionnaire de publicités Meta")+" · "+perLong(st.period)));
  }
  r.appendChild(el("p","paid","Le budget publicitaire est payé par vous, directement à Meta, sur votre propre compte."));
  const h = el("h2",null,"Vos contacts"); h.appendChild(el("small",null,"à trier : qualifié ou non")); r.appendChild(h);
  const l = el("div","list");
  monthLeads().forEach(c => {
    const acts = el("div","lead-acts");
    [["yes",true,"Qualifié"],["no",false,"Non"]].forEach(([cl,v,lab]) => { const b = el("button",cl,lab); b.setAttribute("aria-pressed", String(c.qualified === (v ? 1 : 0)));
      b.onclick = async () => { const nv = c.qualified === (v ? 1 : 0) ? null : v; try { await api("/api/lead/"+c.id, {body:{qualified:nv}}); c.qualified = nv == null ? null : nv ? 1 : 0; render(); } catch(e){ toast(e.message); } }; acts.appendChild(b); });
    l.appendChild(row({date:c.date, t:c.title, s:c.detail}, acts));
  });
  if (!monthLeads().length) l.appendChild(el("p","empty","Aucun contact ce mois-ci pour l'instant."));
  r.appendChild(l);
  if (S.d.client.qualifiedDefinition) r.appendChild(el("p","def","Contact qualifié : "+S.d.client.qualifiedDefinition));
  r.appendChild(el("p","src","Source : contacts reçus via vos publicités et triés par vous · "+perLong(S.d.month)));
}
function vResultats(r){
  r.appendChild(el("p","eyebrow",perLong(S.d.month)));
  r.appendChild(title([["Résul",""],["tats","c"]]));
  const mods = S.d.client.modules;
  if (mods.length > 1){
    if (!mods.includes(S.resTab)) S.resTab = mods[0];
    const seg = el("div","seg"); mods.forEach(m => { const b = el("button",null, m === "com" ? "Réseaux sociaux" : "Publicité Meta"); b.setAttribute("aria-pressed", String(S.resTab === m)); b.onclick = () => { S.resTab = m; render(); }; seg.appendChild(b); }); r.appendChild(seg);
  }
  const m = mods.length > 1 ? S.resTab : mods[0];
  if (m === "meta") resMeta(r); else resCom(r);
}

/* ---------- Demandes ---------- */
function vDemandes(r){
  r.appendChild(el("p","eyebrow","Réponse sous 24 h ouvrées"));
  r.appendChild(title([["Deman",""],["des","o"]]));
  r.appendChild(el("p","lead","Une idée, un événement, des photos de chantier : envoyez-les ici."));
  const types = has("meta") && !has("com") ? ["Promotion à lancer","Changer une annonce","Photos ou vidéos","Autre demande"] : ["Idée de publication","Événement à annoncer","Photos ou vidéos","Autre demande"];
  if (!types.includes(S.rType)) S.rType = types[0];
  const f = el("form","form"); f.noValidate = true;
  const tl = el("div"); const tlab = el("div",null,"Type de demande"); tlab.style.cssText = "font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--gris);margin-bottom:8px"; tl.appendChild(tlab);
  const ch = el("div","chips"); types.forEach(t => { const b = el("button",null,t); b.type = "button"; b.setAttribute("aria-pressed", String(S.rType === t)); b.onclick = () => { S.rType = t; ch.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", String(x.textContent === t))); }; ch.appendChild(b); }); tl.appendChild(ch); f.appendChild(tl);
  const lab = el("label",null,"Votre message"); const ta = el("textarea"); ta.id = "req-msg"; ta.rows = 4; ta.placeholder = has("com") ? "Ex. Nouveau chantier la semaine prochaine, on peut venir filmer ?" : "Ex. Promotion tout le mois de décembre"; lab.htmlFor = ta.id; lab.appendChild(ta); f.appendChild(lab);
  const fl = el("label","drop"); const fi = el("input"); fi.type = "file"; fi.id = "req-files"; fi.multiple = true; fi.accept = "image/*,video/*"; fl.htmlFor = fi.id;
  const fs = el("small",null,"Facultatif"); fl.append(el("span",null,"+ Ajouter des photos ou vidéos"), fs, fi);
  fi.onchange = () => { const n = fi.files.length; fs.textContent = n ? n+" fichier"+(n>1?"s":"")+" prêt"+(n>1?"s":"") : "Facultatif"; };
  f.appendChild(fl);
  const er = el("p","err"); f.appendChild(er);
  const sb = el("button","btn go full","Envoyer à l'agence"); sb.type = "submit"; f.appendChild(sb);
  f.onsubmit = async e => { e.preventDefault(); er.textContent = ""; if (!ta.value.trim()){ er.textContent = "Écrivez votre demande avant d'envoyer."; ta.focus(); return; }
    const fd2 = new FormData(); fd2.append("type", S.rType); fd2.append("message", ta.value.trim()); Array.from(fi.files || []).forEach(x => fd2.append("files", x));
    sb.disabled = true; sb.textContent = fi.files.length ? "Envoi des fichiers…" : "Envoi…";
    try { await api("/api/request", {body:fd2}); toast("Demande envoyée à l'agence."); await load(true); }
    catch(x){ er.textContent = x.message; sb.disabled = false; sb.textContent = "Envoyer à l'agence"; } };
  r.appendChild(f);
  const reqs = S.d.requests;
  const h = el("h2",null,"Vos demandes"); h.appendChild(el("small",null,String(reqs.length))); r.appendChild(h);
  const l = el("div","list"); reqs.forEach(q => l.appendChild(row({date:q.created_at, t:q.type, s:q.message + (q.files ? " ("+q.files.split(",").length+" fichier"+(q.files.split(",").length>1?"s":"")+")" : "")}, el("span","pill "+(q.status === "Envoyée" ? "wait" : "ok"), q.status)))); r.appendChild(l);
}

/* ---------- Navigation ---------- */
const R = {accueil:vAccueil, publications:vPublications, planning:vPlanning, resultats:vResultats, demandes:vDemandes};
function nav(v){ if (location.hash !== "#"+v) location.hash = v; else render(); }
function fromHash(){ const h = location.hash.replace("#",""); S.view = R[h] ? h : "accueil"; }
function render(){ if (!S.d) return; header(); tabs(); const r = $("#app"); r.textContent = ""; R[S.view](r); }
window.addEventListener("hashchange", () => { fromHash(); render(); window.scrollTo(0,0); });

async function load(keepScroll){
  const y = window.scrollY; const rb = $("#refresh"); rb.classList.add("spin");
  try { S.d = await api("/api/me"); fromHash(); render(); if (keepScroll) window.scrollTo(0, y); }
  catch(e){ if (TOKEN){ const r = $("#app"); r.textContent = ""; const b = el("div","loading"); b.append(el("p",null,e.message)); const t = el("button","btn go","Réessayer"); t.onclick = () => load(); b.appendChild(t); r.appendChild(b); } }
  finally { rb.classList.remove("spin"); }
}
$("#refresh").onclick = () => load(true);
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && TOKEN && S.d) load(true); });

function start(){
  S.d = null; $("#app").textContent = "";
  document.querySelectorAll(".onb").forEach(n => n.remove());
  if (!TOKEN) return onboard();
  const b = el("div","loading"); const lg = el("span","logo"); lg.append("AGENCE", document.createElement("br"), "GACOLET"); b.append(lg, el("span",null,"Chargement…")); $("#app").appendChild(b);
  load();
}
if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
start();
})();
