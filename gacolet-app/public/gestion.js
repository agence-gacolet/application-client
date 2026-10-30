/* Gacolet Gestion : écrans (repris du gestionnaire de l’agence). */
(function(){
"use strict";

/* ---------- Constantes ---------- */
const PEOPLE = ["Gabriel","Matis","Clara"];
const OWNERS = ["Gabriel","Matis","Clara","À attribuer"];
const POLES = [["00","00 · DIRECTION & DIVERS"],["10","10 · STRATÉGIE & CONSEIL"],["20","20 · PRODUCTION"],["30","30 · GRAPHISME & IMPRESSION"],["40","40 · RÉSEAUX SOCIAUX"],["50","50 · PUBLICITÉ"],["60","60 · WEB & RÉFÉRENCEMENT"]];
const POLE = Object.fromEntries(POLES);
const EV_TYPES = ["Tournage","Éditorial","Maroudeur","Rendez-vous"];
const EV_STATUS = ["Prévu","Fait","Annulé"];
const CAMP_STATUS = ["En cours","À lancer","Arrêtée"];
const RUSH_STATUS = ["À monter","En montage","Monté"];
const POST_STATUS = ["À préparer","En montage","Monté","Relu","Programmé","Publié"];
const POST_TYPES = ["Réel","Carrousel","Vidéo publicitaire"];
const CADENCE = [3,7,14,30];
const MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const DAYS = ["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"];
const DEFAULT_COLORS = {"Agence Gacolet":"#1D1D1B","AR Climatisation":"#E8833A","Bonobo":"#2E9E5B","Delta Sud Formation":"#D6334A","Domaine Pagezi":"#7A1F3D","Flora Design":"#C25CC9","France Étanchéité":"#2F6FE4","Gaufrement Bon":"#E3B505","Hugo Maître Nageur":"#1BA6C9","Insolent":"#5C5C57","KR Thermolaquage":"#8C6239","La Vie La Construction":"#F06A1D","Le Petit Mas":"#6E8B3D","Locamex":"#E2559C","Meyer-Pic":"#3D4FB5","Only Clean":"#17A398","Paillotte Bassamoise":"#F2A93B","SOS Pare-Brise Codognan":"#9B2226","SOS Pare-Brise Vendargues":"#4A6C8C","Sport Défense":"#8E44AD","The New Me Montpellier":"#D98BA5","Total Habitat 360":"#6C7A2E"};
const VIEWS = [
  ["accueil","Accueil"],["agenda","Agenda"],["taches","Tâches"],["commercial","Commercial"],["campagnes","Campagnes"],
  ["montage","Prêt à monter"],["publications","Publications"],["clients","Calendrier clients"]
];
const COLLS = ["events","tasks","commercial","campaigns","rushes","publications","clients","cevents","keydates","posts","edtodo","meta"];

/* ---------- Outils ---------- */
const $ = s => document.querySelector(s);
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null && text !== "") n.textContent = text; return n; };
const pad = n => String(n).padStart(2,"0");
const iso = d => d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());
const parseISO = s => { const [y,m,d] = String(s).split("-").map(Number); return new Date(y, (m||1)-1, d||1); };
const isISO = s => /^\d{4}-\d{2}-\d{2}$/.test(s||"");
const today = () => iso(new Date());
const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate()+n); return iso(d); };
const addMonths = (s, n) => { const d = parseISO(s); d.setMonth(d.getMonth()+n); return iso(d); };
const diffDays = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 864e5);
const nextWorkday = s => { let d = addDays(s,1); while ([0,6].includes(parseISO(d).getDay())) d = addDays(d,1); return d; };
const dow = s => DAYS[(parseISO(s).getDay()+6)%7];
const MSHORT = ["janv.","févr.","mars","avr.","mai","juin","juil.","août","sept.","oct.","nov.","déc."];
const fmtD = s => { if (!isISO(s)) return s || ""; const d = parseISO(s); return d.getDate()+" "+MSHORT[d.getMonth()]; };
const fmtDL = s => { if (!isISO(s)) return s || ""; const d = parseISO(s); return dow(s)+" "+d.getDate()+" "+MONTHS[d.getMonth()]; };
const fmtFR = s => { if (!isISO(s)) return s || ""; const [y,m,d] = s.split("-"); return d+"/"+m+"/"+y; };
const fmtTime = t => { if (!t) return ""; const [h,mi] = t.split(":"); return String(Number(h))+" h"+(mi && mi !== "00" ? " "+mi : ""); };
const fgOn = hex => { const h = String(hex||"#888888").replace("#",""); const r=parseInt(h.slice(0,2),16), g=parseInt(h.slice(2,4),16), b=parseInt(h.slice(4,6),16); return (0.299*r+0.587*g+0.114*b) > 150 ? "#1D1D1B" : "#FFFFFF"; };
const shortName = c => (c||"").replace("SOS Pare-Brise ","SOS ").replace("La Vie La Construction","LVLC").replace("Paillotte Bassamoise","Paillotte").replace("Delta Sud Formation","Delta Sud").replace("Hugo Maître Nageur","Hugo").replace("The New Me Montpellier","The New Me").replace("KR Thermolaquage","KR").replace("France Étanchéité","France Étanch.");
const plural = (n, s, p) => n + " " + (n > 1 ? (p || s+"s") : s);
const store = { get(k){ try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return null; } }, set(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} } };
const norm = s => String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase();

/* ---------- État ---------- */
const S = {
  me: store.get("gacolet-moi") || "",
  view: "accueil",
  db: null, canWrite: null, isOwner: false, ready: false, failed: "",
  d: Object.fromEntries(COLLS.map(c => [c, []])),
  got: {},
  ui: Object.assign({ agView:"month", agCursor:null, agSel:today(), agClient:"", agTypes:EV_TYPES.slice(), agWho:"", agLayers:["events","tasks","relances","cevents","keydates","posts"],
        tWho:"", tShowDone:false, coKind:"Tous", coQ:"", ccClient:"", ccTab:"client", edMonth:"", ruClient:"" }, store.get("gacolet-ui") || {})
};
S.ui.agCursor = null;
const remember = () => { const u = Object.assign({}, S.ui); delete u.agCursor; store.set("gacolet-ui", u); };

function clientsAll(){
  const list = S.d.clients.slice().sort((a,b) => a.name.localeCompare(b.name,"fr"));
  if (!list.length) return Object.keys(DEFAULT_COLORS).map(n => ({name:n, color:DEFAULT_COLORS[n]}));
  return list;
}
function colorOf(name){
  const c = S.d.clients.find(x => x.name === name);
  if (c && c.color) return c.color;
  if (DEFAULT_COLORS[name]) return DEFAULT_COLORS[name];
  const a = norm(name).replace(/[^a-z0-9]/g,""); const hit = S.d.clients.find(x => norm(x.name).replace(/[^a-z0-9]/g,"") === a); if (hit && hit.color) return hit.color;
  const k = Object.keys(DEFAULT_COLORS).find(n => name && (n.startsWith(name) || name.startsWith(n) || norm(n).replace(/[^a-z0-9]/g,"") === a));
  return k ? DEFAULT_COLORS[k] : "#8A8A84";
}
function clientTag(name){ const s = el("span","cl"); const d = el("span","dot"); d.style.setProperty("--c", colorOf(name)); s.append(d, el("span",null,name||"")); return s; }

/* ---------- Écriture ---------- */
let toastT = null;
function toast(msg){ let t = $(".toast"); if (!t){ t = el("div","toast"); document.body.appendChild(t); } t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 2200); }
function writable(){ return !!S.db && S.canWrite !== false; }
async function save(col, id, body, opts){
  if (!writable()) { toast("Consultation seule : demande l’accès Contributeur à Gabriel."); throw new Error("ro"); }
  const data = Object.assign({}, body, { updatedAt: new Date().toISOString(), updatedBy: S.me || "" });
  try {
    if (id && opts && opts.merge) await S.db.collection(col).doc(id).update(data);
    else if (id) await S.db.collection(col).doc(id).set(data);
    else { data.createdAt = data.updatedAt; data.createdBy = S.me || ""; await S.db.collection(col).doc().set(data); }
  } catch(x){
    if (x && x.code === "invalid_argument" && S.canWrite == null){ S.canWrite = false; toast("Consultation seule : demande l’accès Contributeur à Gabriel."); }
    else toast("Enregistrement impossible pour l’instant. Réessaie dans un moment.");
    throw x;
  }
}
const patch = (col, id, body) => save(col, id, body, {merge:true});
async function remove(col, id){
  if (!writable()) return;
  try { await S.db.collection(col).doc(id).delete(); toast("Supprimé."); }
  catch(x){ toast("Suppression impossible pour l’instant."); throw x; }
}
const strip = o => { const c = Object.assign({}, o); delete c.id; return c; };

/* ---------- Fenêtres et formulaires ---------- */
function openModal(build){ const m = $("#modal"); m.textContent = ""; m.className = "modal"; build(m); $("#overlay").classList.add("open"); const f = m.querySelector("input:not([type=checkbox]),select,textarea,button"); if (f) f.focus(); }
function closeModal(){ $("#overlay").classList.remove("open"); }
$("#overlay").addEventListener("click", e => { if (e.target.id === "overlay") closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });

/* fields: [{k,label,type:text|textarea|date|time|select|check|number|who|list, options, list, half, ph}] */
function openForm(o){
  openModal(m => {
    const t = el("h3", null, o.title); t.id = "mtitle"; m.appendChild(t);
    if (o.intro) m.appendChild(el("p","muted", o.intro));
    const f = el("form","form"); f.noValidate = true;
    const v = Object.assign({}, o.values || {});
    const inputs = {};
    let row = null;
    o.fields.forEach((fd, i) => {
      let inp;
      const id = "f-" + (o.key || "x") + "-" + fd.k;
      if (fd.type === "textarea"){ inp = el("textarea"); inp.rows = fd.rows || 3; inp.value = v[fd.k] || ""; }
      else if (fd.type === "select"){ inp = el("select"); (fd.options||[]).forEach(x => { const op = el("option", null, Array.isArray(x) ? x[1] : x); op.value = Array.isArray(x) ? x[0] : x; inp.appendChild(op); }); inp.value = v[fd.k] != null ? v[fd.k] : ((fd.options||[])[0] && (Array.isArray(fd.options[0]) ? fd.options[0][0] : fd.options[0])); }
      else if (fd.type === "check"){ inp = el("input"); inp.type = "checkbox"; inp.checked = !!v[fd.k]; }
      else if (fd.type === "files"){ inp = filesField(v[fd.k] || [], id); }
      else if (fd.type === "who"){ inp = el("div","chips"); const set = new Set(v[fd.k] || []); inp._get = () => PEOPLE.filter(p => set.has(p)); PEOPLE.forEach(p => { const b = el("button","chip",p); b.type = "button"; b.setAttribute("aria-pressed", String(set.has(p))); b.onclick = () => { set.has(p) ? set.delete(p) : set.add(p); b.setAttribute("aria-pressed", String(set.has(p))); }; inp.appendChild(b); }); }
      else { inp = el("input"); inp.type = fd.type || "text"; inp.value = v[fd.k] != null ? v[fd.k] : ""; if (fd.ph) inp.placeholder = fd.ph; if (fd.list){ const dl = el("datalist"); dl.id = id+"-l"; fd.list.forEach(x => { const op = el("option"); op.value = x; dl.appendChild(op); }); f.appendChild(dl); inp.setAttribute("list", dl.id); } }
      if (fd.type !== "who" && fd.type !== "files") inp.id = id;
      inputs[fd.k] = inp;
      let lab;
      if (fd.type === "check"){ lab = el("label","inline"); lab.append(inp, document.createTextNode(fd.label)); }
      else if (fd.type === "files"){ lab = el("div","form-who"); const s = el("div",null,fd.label); s.style.cssText = "font-size:13px;font-weight:600;margin-bottom:5px"; lab.append(s, inp); }
      else if (fd.type === "who"){ lab = el("div","form-who"); const s = el("div",null,fd.label); s.style.cssText = "font-size:13px;font-weight:600;margin-bottom:5px"; lab.append(s, inp); }
      else { lab = el("label", null, fd.label); lab.htmlFor = id; lab.appendChild(inp); }
      if (fd.half){ if (!row){ row = el("div","row2"); f.appendChild(row); row.appendChild(lab); } else { row.appendChild(lab); row = null; } }
      else { row = null; f.appendChild(lab); }
    });
    const err = el("div","err"); f.appendChild(err);
    const act = el("div","actions");
    if (o.onDelete && writable()){
      const del = el("button","btn danger left","Supprimer"); del.type = "button"; let armed = false;
      del.onclick = async () => { if (!armed){ armed = true; del.textContent = "Confirmer la suppression"; del.classList.add("armed"); err.textContent = "La ligne sera supprimée pour toute l’équipe."; return; } del.disabled = true; try { await o.onDelete(); closeModal(); } catch(x){ del.disabled = false; } };
      act.appendChild(del);
    }
    const cancel = el("button","btn","Annuler"); cancel.type = "button"; cancel.onclick = () => o.onCancel ? o.onCancel() : closeModal();
    const ok = el("button","btn solid", o.okLabel || "Enregistrer"); ok.type = "submit";
    if (!writable()) ok.disabled = true;
    act.append(cancel, ok); f.appendChild(act);
    f.onsubmit = async ev => {
      ev.preventDefault(); err.textContent = "";
      const out = {};
      o.fields.forEach(fd => { const inp = inputs[fd.k]; out[fd.k] = fd.type === "check" ? inp.checked : (fd.type === "who" || fd.type === "files") ? inp._get() : fd.type === "number" ? (inp.value === "" ? "" : Number(inp.value)) : inp.value.trim(); });
      for (const fd of o.fields){ if (fd.req && !out[fd.k]){ err.textContent = fd.req; inputs[fd.k].focus && inputs[fd.k].focus(); return; } }
      if (f.querySelector(".files[data-busy='1']")){ err.textContent = "Attends la fin de l’envoi du fichier."; return; }
      ok.disabled = true;
      try { await o.onSave(out); closeModal(); toast(o.done || "Enregistré."); }
      catch(x){ ok.disabled = false; }
    };
    m.appendChild(f);
  });
}
/* Fichiers joints (capacité assets) */
const fmtSize = n => !n ? "" : n < 1024*1024 ? Math.max(1, Math.round(n/1024))+" ko" : (n/1024/1024).toFixed(1).replace(".",",")+" Mo";
const fileUrl = f => f.url || ("/_blob/" + f.id);
function filesList(files){
  if (!files || !files.length) return "";
  const w = el("div","files");
  files.forEach(f => { const r = el("div","fl"); const a = el("a",null,(f.name||"Fichier")); a.href = fileUrl(f); a.target = "_blank"; a.rel = "noopener"; r.append(a, el("span","sz",fmtSize(f.size))); w.appendChild(r); });
  return w;
}
function filesField(initial, id){
  const w = el("div","files"); let list = initial.slice(); const box = el("div","files");
  const draw = () => { box.textContent = ""; list.forEach((f, i) => { const r = el("div","fl"); const a = el("a",null,(f.name||"Fichier")); a.href = fileUrl(f); a.target = "_blank"; a.rel = "noopener"; const x = el("button",null,"×"); x.type = "button"; x.title = "Retirer ce fichier"; x.setAttribute("aria-label","Retirer "+(f.name||"le fichier")); x.onclick = () => { list.splice(i,1); draw(); }; r.append(a, el("span","sz",fmtSize(f.size)), x); box.appendChild(r); }); };
  draw(); w.appendChild(box);
  const msg = el("div","muted"); msg.style.fontSize = "13px";
  if (!S.assets){ msg.textContent = "Ajout de fichiers indisponible ici (accès Contributeur nécessaire)."; w.appendChild(msg); }
  else {
    const inp = el("input"); inp.type = "file"; inp.multiple = true; inp.id = id; inp.setAttribute("aria-label","Ajouter un fichier");
    inp.onchange = async () => {
      const picked = Array.from(inp.files || []); if (!picked.length) return;
      w.dataset.busy = "1"; inp.disabled = true;
      for (const file of picked){
        if (file.size > 20*1024*1024){ msg.textContent = file.name+" : trop lourd (20 Mo au plus)."; continue; }
        msg.textContent = "Envoi de "+file.name+"…";
        try { const r = await S.assets.upload(file); list.push({id:r.id, url:r.url, name:file.name, type:r.contentType||file.type||"", size:r.sizeBytes||file.size}); draw(); msg.textContent = ""; }
        catch(e){ const c = e && e.code; msg.textContent = file.name+" : "+(c === "unsupported_type" ? "type de fichier refusé (images, vidéos, PDF, texte, CSV)." : c === "quota_exceeded" ? "espace de stockage plein." : c === "not_granted" ? "envoi non autorisé pour ton accès." : "envoi impossible, réessaie."); }
      }
      inp.value = ""; inp.disabled = false; delete w.dataset.busy;
    };
    const pk = el("div","pick"); pk.appendChild(inp); w.append(pk, msg);
  }
  w._get = () => list.slice();
  return w;
}
function openFacts(o){
  openModal(m => {
    const t = el("h3", null, o.title); t.id = "mtitle"; m.appendChild(t);
    if (o.client) m.appendChild(clientTag(o.client));
    if (o.quick && writable()){ const q = el("div","quick"); o.quick.forEach(([label, fn]) => { const b = el("button","btn sm", label); b.onclick = fn; q.appendChild(b); }); m.appendChild(q); }
    const dl = el("dl","facts");
    o.facts.forEach(([k,v]) => { if (v == null || v === "") return; dl.append(el("dt",null,k)); const dd = el("dd"); if (v instanceof Node) dd.appendChild(v); else dd.textContent = v; dl.append(dd); });
    m.appendChild(dl);
    const act = el("div","actions");
    const close = el("button","btn","Fermer"); close.onclick = closeModal; act.appendChild(close);
    if (o.onEdit && writable()){ const e = el("button","btn solid","Modifier"); e.onclick = o.onEdit; act.appendChild(e); }
    m.appendChild(act);
  });
}
const linkNode = (href, label) => { if (!/^https?:\/\//.test(href||"")) return href || ""; const a = el("a", null, label || "Ouvrir"); a.href = href; a.target = "_blank"; a.rel = "noopener"; return a; };

/* ---------- Règles métier ---------- */
function lateDays(date){ if (!isISO(date)) return 0; const n = diffDays(date, today()); return n > 0 ? n : 0; }
function lateClass(n){ return n >= 14 ? 3 : n >= 7 ? 2 : n >= 3 ? 1 : 0; }
function latePill(n){ if (!n) return el("span"); return el("span","pill l"+(lateClass(n)||"0"), n+" j"); }
const openTasks = () => S.d.tasks.filter(t => !t.done);

/* Commercial : rythme J+3, J+7, J+14, J+30 */
function relanceN(r){ const m = /(\d+)\s*sur\s*4/.exec(r||""); return m ? Number(m[1]) : 0; }
function stamp(txt){ return fmtFR(today()) + " : " + txt; }
function coNoAnswer(c){
  const n = relanceN(c.relance) + 1;
  const j0 = isISO(c.j0) ? c.j0 : today();
  if (n > 4) return { stage:"à clore", relance:"4 sur 4", nextAction:"Envoyer le message de clôture", nextDate:today(), lastContact:stamp("pas de réponse (4e relance)"), j0 };
  let d = addDays(j0, CADENCE[n-1]); if (d < today()) d = today();
  return { relance:n+" sur 4", nextAction:"Relance "+(n+1 <= 4 ? n+1 : 4)+" sur 4", nextDate:d, lastContact:stamp("pas de réponse (relance "+n+")"), j0 };
}
function coQuote(c){ return { stage:"proposition envoyée", j0:today(), relance:"0 sur 4", nextAction:"Relance 1 sur 4", nextDate:addDays(today(),3), lastContact:stamp("devis envoyé") }; }
function coNotInterested(c){ return { stage:"pas intéressé, à recontacter", relance:"", nextAction:"Reprendre contact", nextDate:addMonths(today(),6), lastContact:stamp("pas intéressé") }; }
function coSigned(c){ return { kind:"Client", stage:"signé", relance:"", nextAction:"Démarrage (P2)", nextDate:nextWorkday(today()), lastContact:stamp("signé") }; }

/* Éditorial agence : colonnes calculées (mêmes règles que le tableau) */
function weekType(){ const m = S.d.meta.find(x => x.id === "semaine-type"); return m || null; }
function postStory(p){ const w = weekType(); if (!w || !w.days) return ""; const d = w.days.find(x => norm(x.day) === norm(dow(p.date))); return d ? d.story : ""; }
function postRepost(p){ return p.type === "Réel" ? "Film complet de " + (p.client||"") : p.type === "Vidéo publicitaire" ? "Résultat à publier sous 4 semaines" : ""; }
function postWho(p){ return p.type === "Carrousel" ? "Clara" : "Matis"; }
function postDue(p){ return p.type === "Carrousel" ? "" : addDays(p.date, -7); }
const POST_DONE = ["Monté","Relu","Programmé","Publié"];
function postLate(p){ const d = postDue(p); return d && d < today() && !POST_DONE.includes(p.status); }

/* Calendrier clients : date de préparation */
function leadOf(client){ const c = S.d.clients.find(x => x.name === client); return (c && Number(c.leadWeeks)) || 3; }
function prepBy(e){ return isISO(e.date) ? addDays(e.date, -7*leadOf(e.client)) : ""; }

/* ---------- Agenda : tous les calques ---------- */
const LAYERS = [["events","Événements"],["tasks","Tâches"],["relances","Relances"],["cevents","Temps forts clients"],["keydates","Dates clés"],["posts","Com de l’agence"]];
const AGENCE = "Agence Gacolet";
function agendaItems(){
  const L = new Set(S.ui.agLayers), out = [];
  if (L.has("events")) S.d.events.forEach(e => { if (!S.ui.agTypes.includes(e.type)) return; out.push({k:"events", date:e.date, time:e.time||"", client:e.client, label:e.title||e.type, who:e.who||[], ref:e, cls:"ev t-"+e.type+" s-"+(e.status||"Prévu"), meta:[e.type, e.place, (e.files||[]).length ? plural(e.files.length,"fichier") : ""].filter(Boolean).join(", "), tag:e.status||"Prévu"}); });
  if (L.has("tasks")) openTasks().forEach(t => { if (!isISO(t.date)) return; const late = lateDays(t.date) > 0; out.push({k:"tasks", date: t.date, client:t.client, label:t.title, who:[t.who], ref:t, cls:"ev k-task"+(late?" late":""), meta:"Tâche · "+t.who, tag:late ? lateDays(t.date)+" j de retard" : "Tâche"}); });
  if (L.has("relances")) S.d.commercial.forEach(c => { if (!isISO(c.nextDate)) return; out.push({k:"relances", date:c.nextDate, client:c.company, label:c.nextAction||"Relance", who:["Gabriel"], ref:c, cls:"ev k-relance", meta:"Commercial · "+(c.stage||""), tag:c.kind}); });
  if (L.has("cevents")) S.d.cevents.forEach(e => { if (!isISO(e.date)) return; out.push({k:"cevents", date:e.date, client:e.client, label:e.subject, who:["Clara"], ref:e, cls:"ev k-cevent", meta:"Temps fort · préparer avant le "+fmtD(prepBy(e)), tag:e.piste ? "Piste" : (e.done ? "Fait" : "Temps fort")}); });
  if (L.has("keydates")) S.d.keydates.forEach(k => { if (!isISO(k.date)) return; out.push({k:"keydates", date:k.date, client:"", label:k.label, who:[], ref:k, cls:"ev k-keydate", meta:k.forWhom||"", tag:"Date clé"}); });
  if (L.has("posts")){
    S.d.posts.forEach(p => { if (!isISO(p.date)) return; out.push({k:"posts", date:p.date, client:AGENCE, label:(p.type||"")+(p.client ? " · "+shortName(p.client) : ""), who:[postWho(p)], ref:p, cls:"ev k-post"+(postLate(p) ? " late" : ""), meta:["Com de l’agence", p.format, p.client, p.status].filter(Boolean).join(" · "), tag:postLate(p) ? "Montage en retard" : p.status}); });
    S.d.edtodo.forEach(x => { if (x.done || !isISO(x.date)) return; const late = lateDays(x.date) > 0; out.push({k:"edtodo", date:x.date, client:AGENCE, label:x.title, who:x.who ? [x.who] : [], ref:x, cls:"ev k-task"+(late?" late":""), meta:"Com de l’agence · à faire"+(x.who ? " · "+x.who : ""), tag:late ? lateDays(x.date)+" j de retard" : "À faire"}); });
  }
  return out.filter(i =>
    (!S.ui.agClient || i.client === S.ui.agClient || (i.k === "keydates" && (i.ref.clients||[]).some(c => c === S.ui.agClient || c === "Tous"))) &&
    (!S.ui.agWho || !i.who.length || i.who.includes(S.ui.agWho))
  ).sort((a,b) => (a.date+(a.time||"99")+a.k).localeCompare(b.date+(b.time||"99")+b.k));
}
function openItem(i){
  if (i.k === "events") return openEvent(i.ref);
  if (i.k === "tasks") return openTask(i.ref);
  if (i.k === "relances") return openCommercial(i.ref);
  if (i.k === "cevents") return openCevent(i.ref);
  if (i.k === "keydates") return openKeydate(i.ref);
  if (i.k === "posts") return openPost(i.ref);
  if (i.k === "edtodo") return editEdTodo(i.ref);
}

/* ---------- Fiches et formulaires par type ---------- */
const clientNames = () => clientsAll().map(c => c.name);

/* Événements de l'agenda */
function openEvent(e){
  const d = e.date;
  openFacts({ title: e.title || e.type, client: e.client,
    facts: [["Date", fmtDL(d)+" "+(d||"").slice(0,4)+(e.time ? ", "+fmtTime(e.time) : "")],["Type", e.type],["Qui",(e.who||[]).join(", ")],["Statut", e.status||"Prévu"],["Lieu", e.place],["Note", e.note],["Fichiers", filesList(e.files)]],
    quick: [["Passer en Fait", () => patch("events", e.id, {status:"Fait"}).then(closeModal)],["Passer en Annulé", () => patch("events", e.id, {status:"Annulé"}).then(closeModal)]],
    onEdit: () => editEvent(e) });
}
function editEvent(e){
  openForm({ key:"ev", title: e.id ? "Modifier l’événement" : "Nouvel événement", values: Object.assign({type:"Tournage", status:"Prévu", who:[]}, e),
    fields: [{k:"client",label:"Client",type:"select",options:[["","Choisir un client"]].concat(clientNames().map(n=>[n,n])),half:true,req:"Choisis un client."},{k:"type",label:"Type",type:"select",options:EV_TYPES,half:true},
      {k:"title",label:"Intitulé",ph:"Ex. 3 réels chantier, soirée d’ouverture"},
      {k:"date",label:"Date",type:"date",half:true,req:"Indique une date."},{k:"time",label:"Heure (facultatif)",type:"time",half:true},
      {k:"who",label:"Qui",type:"who"},
      {k:"status",label:"Statut",type:"select",options:EV_STATUS,half:true},{k:"place",label:"Lieu",half:true,ph:"Adresse ou ville"},
      {k:"note",label:"Note",type:"textarea"},
      {k:"files",label:"Fichiers (feuille de tournage, devis, photos…)",type:"files"}],
    onCancel: () => e.id ? openEvent(e) : closeModal(),
    onDelete: e.id ? () => remove("events", e.id) : null,
    onSave: out => save("events", e.id || null, Object.assign(e.id ? strip(e) : {}, out)) });
}

/* Tâches */
function openTask(t){
  openFacts({ title: t.title, client: t.client,
    facts: [["Qui", t.who],["Pôle", POLE[t.pole] || t.pole],["Date", t.date ? fmtDL(t.date)+" "+t.date.slice(0,4) : "Sans date"],["Retard", lateDays(t.date) && !t.done ? lateDays(t.date)+" jours" : ""],["Fait", t.done ? "Oui, le "+fmtFR(t.doneAt) : ""],["Note", t.note]],
    quick: t.done ? [["Rouvrir la tâche", () => patch("tasks", t.id, {done:false, doneAt:""}).then(closeModal)]] :
      [["C’est fait", () => patch("tasks", t.id, {done:true, doneAt:today()}).then(() => { closeModal(); toast("Tâche faite."); })],
       ["Décaler à demain", () => patch("tasks", t.id, {date:addDays(today(),1)}).then(closeModal)],
       ["Décaler d’une semaine", () => patch("tasks", t.id, {date:addDays(isISO(t.date) && t.date > today() ? t.date : today(),7)}).then(closeModal)]],
    onEdit: () => editTask(t) });
}
function editTask(t){
  openForm({ key:"ta", title: t.id ? "Modifier la tâche" : "Nouvelle tâche", intro: t.id ? "" : "Intitulé « Verbe + livrable », une seule personne par tâche.",
    values: Object.assign({who: S.ui.tWho && S.ui.tWho !== "Tous" ? S.ui.tWho : (S.me || "À attribuer"), pole:"00"}, t),
    fields: [{k:"who",label:"Qui",type:"select",options:OWNERS,half:true},{k:"pole",label:"Pôle",type:"select",options:POLES,half:true},
      {k:"client",label:"Client",list:clientNames(),half:true},{k:"date",label:"Date",type:"date",half:true},
      {k:"title",label:"À faire",req:"Écris ce qu’il faut faire.",ph:"Ex. Monter les 3 réels KR"},
      {k:"note",label:"Note",type:"textarea"},{k:"done",label:"Fait",type:"check"}],
    onCancel: () => t.id ? openTask(t) : closeModal(),
    onDelete: t.id ? () => remove("tasks", t.id) : null,
    onSave: out => { const b = Object.assign(t.id ? strip(t) : {}, out); b.doneAt = out.done ? (t.doneAt || today()) : ""; return save("tasks", t.id || null, b); } });
}

/* Commercial */
function openCommercial(c){
  const late = lateDays(c.nextDate);
  openFacts({ title: c.company,
    facts: [["Type", c.kind],["Étape", c.stage],["Prochaine action", c.nextAction],["Date", c.nextDate ? fmtDL(c.nextDate)+(late ? " · "+late+" j de retard" : "") : ""],["Dernier contact", c.lastContact],["J0", fmtFR(c.j0)],["Relance", c.relance],["Contact", c.contact],["Compte rendu", c.report],["Notes", c.notes]],
    quick: [["Pas de réponse", () => applyCo(c, coNoAnswer(c), "Relance programmée.")],["Devis envoyé", () => applyCo(c, coQuote(c), "Relance 1 dans 3 jours.")],
            ["Date donnée", () => editCoDate(c)],["Pas intéressé", () => applyCo(c, coNotInterested(c), "Reprise de contact dans 6 mois.")],["Signé", () => applyCo(c, coSigned(c), "Signé : démarrage le prochain jour ouvré.")],
            ["Compte rendu", () => editCoReport(c)]],
    onEdit: () => editCommercial(c) });
}
function applyCo(c, body, msg){ return patch("commercial", c.id, body).then(() => { closeModal(); toast(msg); }); }
function editCoDate(c){
  openForm({ key:"cod", title:"Date donnée par "+c.company, values:{nextDate:"", nextAction:c.nextAction||""},
    fields:[{k:"nextDate",label:"Prochaine action le",type:"date",req:"Indique la date."},{k:"nextAction",label:"Prochaine action"},{k:"txt",label:"Ce qu’il a dit",ph:"Ex. rappeler après son rendez-vous comptable"}],
    onCancel: () => openCommercial(c),
    onSave: o => patch("commercial", c.id, {nextDate:o.nextDate, nextAction:o.nextAction, lastContact: stamp(o.txt || "date donnée par le prospect")}) });
}
function editCoReport(c){
  openForm({ key:"cor", title:"Compte rendu · "+c.company, intro:"Note l’échange. Utilise ensuite les boutons pour programmer la suite.", values:{txt:""},
    fields:[{k:"txt",label:"Échange",type:"textarea",rows:4,req:"Écris le compte rendu."}],
    onCancel: () => openCommercial(c),
    onSave: o => patch("commercial", c.id, {report: stamp(o.txt) + (c.report ? "\n" + c.report : ""), lastContact: stamp(o.txt)}) });
}
function editCommercial(c){
  openForm({ key:"co", title: c.id ? "Modifier · "+c.company : "Nouveau prospect", values: Object.assign({kind:"Prospect", relance:""}, c),
    fields:[{k:"company",label:"Entreprise",req:"Indique l’entreprise."},{k:"kind",label:"Type",type:"select",options:["Prospect","Client"],half:true},{k:"stage",label:"Étape",half:true,list:["à contacter","à rappeler","rendez-vous pris","proposition envoyée","à clore","client actif","signé"]},
      {k:"nextAction",label:"Prochaine action"},{k:"nextDate",label:"Date",type:"date",half:true},{k:"j0",label:"J0 (contact de départ)",type:"date",half:true},
      {k:"relance",label:"Relance",half:true,list:["0 sur 4","1 sur 4","2 sur 4","3 sur 4","4 sur 4"]},{k:"contact",label:"Contact",half:true},
      {k:"lastContact",label:"Dernier contact",type:"textarea",rows:2},{k:"notes",label:"Notes",type:"textarea",rows:4}],
    onCancel: () => c.id ? openCommercial(c) : closeModal(),
    onDelete: c.id ? () => remove("commercial", c.id) : null,
    onSave: out => save("commercial", c.id || null, Object.assign(c.id ? strip(c) : {order: 999}, out)) });
}

/* Campagnes */
function editCampaign(k){
  openForm({ key:"ca", title: k.id ? "Campagne · "+k.client : "Nouvelle campagne", values: Object.assign({status:"À lancer"}, k),
    fields:[{k:"client",label:"Client",list:clientNames(),req:"Indique le client."},{k:"status",label:"Statut",type:"select",options:CAMP_STATUS,half:true},{k:"budget",label:"Budget",half:true,ph:"Ex. 500 € / mois"},
      {k:"launchedAt",label:"Lancée le",type:"date",half:true},{k:"link",label:"Suivi des contacts (lien)",half:true,ph:"https://"},{k:"note",label:"À savoir",type:"textarea"}],
    onDelete: k.id ? () => remove("campaigns", k.id) : null,
    onSave: out => save("campaigns", k.id || null, Object.assign(k.id ? strip(k) : {order:999}, out)) });
}

/* Prêt à monter */
function editRush(r){
  openForm({ key:"ru", title: r.id ? "Montage · "+r.client : "Retour de tournage", intro: r.id ? "" : "Une ligne par tournage dont les rushs attendent le montage.", values: Object.assign({status:"À monter", shotAt:today()}, r),
    fields:[{k:"client",label:"Client",list:clientNames(),half:true,req:"Indique le client."},{k:"shotAt",label:"Tourné le",type:"date",half:true},
      {k:"content",label:"Ce qui a été tourné",type:"textarea",rows:2},{k:"editor",label:"Qui monte",type:"select",options:[["","À préciser"],["Matis","Matis"],["Clara","Clara"]],half:true,req:"Dis qui monte."},
      {k:"status",label:"Statut",type:"select",options:RUSH_STATUS,half:true},{k:"link",label:"Lien des rushs",ph:"https://"},{k:"note",label:"À savoir",type:"textarea"}],
    onDelete: r.id ? () => remove("rushes", r.id) : null,
    onSave: out => save("rushes", r.id || null, Object.assign(r.id ? strip(r) : {}, out)) });
}

/* Publications */
function editPub(p){
  openForm({ key:"pu", title:"Publications · "+p.client, values:p,
    fields:[{k:"planned",label:"Prévues ce mois",type:"number",half:true},{k:"metricoolId",label:"Marque Metricool",half:true},
      {k:"published",label:"Publiées depuis le 1er",half:true},{k:"scheduled7",label:"Programmées 7 jours",half:true},
      {k:"waiting",label:"En attente client",half:true},{k:"refused",label:"Refusées",half:true},{k:"next",label:"Prochaine publication"},{k:"alert",label:"Alerte"}],
    onDelete: () => remove("publications", p.id),
    onSave: out => save("publications", p.id, Object.assign(strip(p), out)) });
}

/* Calendrier clients */
function openCevent(e){
  const pb = prepBy(e);
  openFacts({ title: e.subject, client: e.client,
    facts:[["Date", fmtDL(e.date)+" "+(e.date||"").slice(0,4)],["À faire", e.todo],["Préparer avant le", pb ? fmtDL(pb)+(pb < today() && !e.done ? " · en retard" : "") : ""],["Piste", e.piste ? "Idée à valider avec le client" : ""],["Fait", e.done ? "Oui" : "Non"],["Note", e.note]],
    quick:[[e.done ? "Rouvrir" : "C’est fait", () => patch("cevents", e.id, {done:!e.done}).then(closeModal)]],
    onEdit: () => editCevent(e) });
}
function editCevent(e){
  openForm({ key:"ce", title: e.id ? "Modifier le temps fort" : "Nouveau temps fort", values: Object.assign({client:S.ui.ccClient}, e),
    fields:[{k:"client",label:"Client",type:"select",options:clientsAll().filter(c => c.calendar !== false).map(c => c.name),half:true},{k:"date",label:"Date",type:"date",half:true,req:"Indique la date."},
      {k:"subject",label:"Quoi",req:"Indique le sujet.",ph:"Ex. Soirée du 12/12"},{k:"todo",label:"À faire",type:"textarea",rows:2},
      {k:"piste",label:"Piste (idée à valider avec le client)",type:"check"},{k:"done",label:"Fait",type:"check"},{k:"note",label:"Note",type:"textarea",rows:2}],
    onCancel: () => e.id ? openCevent(e) : closeModal(),
    onDelete: e.id ? () => remove("cevents", e.id) : null,
    onSave: out => save("cevents", e.id || null, Object.assign(e.id ? strip(e) : {}, out)) });
}
function openKeydate(k){
  openFacts({ title:k.label, facts:[["Date", fmtDL(k.date)+(k.end ? " au "+fmtDL(k.end) : "")],["Pour qui", k.forWhom || (k.clients||[]).join(", ")],["Préparer avant le", fmtDL(addDays(k.date,-21))],["Note", k.note]],
    onEdit: () => editKeydate(k) });
}
function editKeydate(k){
  openForm({ key:"kd", title: k.id ? "Modifier la date clé" : "Nouvelle date clé", values: Object.assign({}, k, {clientsTxt:(k.clients||[]).join(", ")}),
    fields:[{k:"label",label:"Événement",req:"Indique l’événement."},{k:"date",label:"Date",type:"date",half:true,req:"Indique la date."},{k:"end",label:"Jusqu’au (facultatif)",type:"date",half:true},
      {k:"clientsTxt",label:"Pour qui (clients séparés par des virgules, ou Tous)"},{k:"note",label:"Note"}],
    onDelete: k.id ? () => remove("keydates", k.id) : null,
    onSave: out => { const cl = out.clientsTxt.split(",").map(s => s.trim()).filter(Boolean); delete out.clientsTxt; return save("keydates", k.id || null, Object.assign(k.id ? strip(k) : {}, out, {clients:cl, forWhom:cl.join(", ")})); } });
}
function editClient(c){
  openForm({ key:"cf", title:"Fiche · "+c.name, values:c,
    fields:[{k:"formula",label:"Formule"},{k:"perMonth",label:"Publications / mois"},{k:"shoot",label:"Tournage",half:true},{k:"networks",label:"Réseaux",half:true},
      {k:"remember",label:"À retenir",type:"textarea"},{k:"ask",label:"À demander au client",type:"textarea"},{k:"leadWeeks",label:"Préparer combien de semaines avant",type:"number",half:true},{k:"color",label:"Couleur dans l’agenda",type:"color",half:true}],
    onSave: out => save("clients", c.id, Object.assign(strip(c), out)) });
}

/* Éditorial agence */
function openPost(p){
  openFacts({ title: fmtDL(p.date)+" · "+p.type, client:p.client,
    facts:[["Format", p.format],["Secteur", p.sector],["Carton", p.carton],["Story du jour", postStory(p)],["Republication", postRepost(p)],["Qui", postWho(p)],["À remettre le", postDue(p) ? fmtDL(postDue(p))+(postLate(p) ? " · en retard" : "") : ""],["Statut", p.status],["Film en ligne", p.filmOnline ? "Oui" : "Non"],["Notes", p.notes]],
    onEdit: () => editPost(p) });
}
function editPost(p){
  openForm({ key:"po", title: p.id ? "Publication du "+fmtDL(p.date) : "Nouvelle publication", values: Object.assign({type:"Réel", status:"À préparer"}, p),
    fields:[{k:"date",label:"Date",type:"date",half:true,req:"Indique la date."},{k:"type",label:"Type",type:"select",options:POST_TYPES,half:true},
      {k:"format",label:"Format de montage",half:true,list:["Bande-annonce","Phrase du client","Geste du métier","Le détail","Photos du shooting","Micro-édit de la publicité"]},{k:"client",label:"Client",list:clientNames(),half:true},
      {k:"sector",label:"Secteur",half:true},{k:"carton",label:"Texte du carton",half:true},{k:"status",label:"Statut",type:"select",options:POST_STATUS,half:true},{k:"filmOnline",label:"Film en ligne chez le client",type:"check",half:true},
      {k:"notes",label:"Notes",type:"textarea"}],
    onCancel: () => p.id ? openPost(p) : closeModal(),
    onDelete: p.id ? () => remove("posts", p.id) : null,
    onSave: out => {
      if (out.status === "Publié" && out.type === "Réel" && !out.filmOnline) return Promise.reject(toast("Un réel n’est publié que si le film complet est en ligne chez le client."));
      return save("posts", p.id || null, Object.assign(p.id ? strip(p) : {}, out)); } });
}
function editEdTodo(t){
  openForm({ key:"et", title: t.id ? "Modifier" : "Nouvelle tâche éditoriale", values: Object.assign({who:S.me||"Clara"}, t),
    fields:[{k:"date",label:"Pour le",type:"date",half:true},{k:"who",label:"Qui",type:"select",options:PEOPLE,half:true},{k:"title",label:"Tâche",req:"Écris la tâche."},{k:"done",label:"Fait",type:"check"},{k:"note",label:"Notes",type:"textarea",rows:2}],
    onDelete: t.id ? () => remove("edtodo", t.id) : null,
    onSave: out => save("edtodo", t.id || null, Object.assign(t.id ? strip(t) : {}, out)) });
}

/* ---------- Gabarits ---------- */
function head(title, sub, tools){
  const h = el("header","head"); const l = el("div");
  if (sub) l.appendChild(el("p","sub",sub));
  const h1 = el("h1"); if (Array.isArray(title)){ h1.append(document.createTextNode(title[0]+" ")); h1.appendChild(el("span","yr",title[1])); } else h1.textContent = title;
  l.appendChild(h1); h.appendChild(l);
  if (tools){ const t = el("div","tools"); tools.forEach(x => x && t.appendChild(x)); h.appendChild(t); }
  return h;
}
function btn(label, cls, fn){ const b = el("button","btn "+(cls||""), label); b.onclick = fn; return b; }
function addBtn(label, fn){ const b = btn(label, "lemon", fn); if (!writable()) b.disabled = true; return b; }
function segm(options, value, onPick){ const s = el("div","seg"); s.setAttribute("role","group"); options.forEach(([v,l]) => { const b = el("button",null,l); b.setAttribute("aria-pressed", String(v === value)); b.onclick = () => onPick(v); s.appendChild(b); }); return s; }
function chipBar(options, value, onPick, counts){ const c = el("div","chips"); options.forEach(([v,l]) => { const b = el("button","chip",l); if (counts && counts[v] != null) b.appendChild(el("span","c",String(counts[v]))); b.setAttribute("aria-pressed", String(v === value)); b.onclick = () => onPick(v); c.appendChild(b); }); return c; }
function table(cols){ const w = el("div","tw"); const t = el("table","t"); const th = el("tr"); cols.forEach(c => th.appendChild(el("th", c[0] === "~" ? "hm" : null, c.replace(/^~/,"")))); const thead = el("thead"); thead.appendChild(th); t.appendChild(thead); const tb = el("tbody"); t.appendChild(tb); w.appendChild(t); return {w, tb}; }
function mo(cell, txt){ if (txt) cell.appendChild(el("div","mo",txt)); return cell; }
function td(tr, content, cls){ const c = el("td", cls); if (content instanceof Node) c.appendChild(content); else if (content != null) c.textContent = content; tr.appendChild(c); return c; }
function band(tb, label, n, cols){ const tr = el("tr","band"); const c = el("td"); c.colSpan = cols; c.textContent = label; if (n != null) c.appendChild(el("span",null,plural(n,"ligne"))); tr.appendChild(c); tb.appendChild(tr); }
function checkbox(checked, onChange, label){ const c = el("input","ck"); c.type = "checkbox"; c.checked = !!checked; c.setAttribute("aria-label", label || "Fait"); c.disabled = !writable(); c.onclick = e => e.stopPropagation(); c.onchange = () => onChange(c.checked); return c; }
function item(a, b, sub, c, onClick, color){
  const r = el("button","it"); r.appendChild(el("span","a",a));
  const m = el("span","b"); const bb = el("b"); if (color){ const d = el("span","dot"); d.style.setProperty("--c", color); d.style.marginRight = "6px"; bb.appendChild(d); } bb.appendChild(document.createTextNode(b)); m.appendChild(bb); if (sub) m.appendChild(el("span",null,sub));
  r.appendChild(m); r.appendChild(c instanceof Node ? c : el("span", null, c || "")); r.onclick = onClick; return r;
}

/* ---------- Accueil ---------- */
function vAccueil(root){
  const me = S.me || "Gabriel", t0 = today(), t7 = addDays(t0, 7);
  root.appendChild(head(["Bonjour", me], fmtDL(t0)+" "+t0.slice(0,4)+" · ce qui compte pour toi cette semaine", [addBtn("Ajouter une tâche", () => editTask({who:me}))]));
  const mine = openTasks().filter(t => t.who === me);
  const late = mine.filter(t => lateDays(t.date) > 0).sort((a,b) => a.date.localeCompare(b.date));
  const soon = mine.filter(t => isISO(t.date) && t.date >= t0 && t.date <= t7).sort((a,b) => a.date.localeCompare(b.date));
  const nodate = mine.filter(t => !isISO(t.date));
  const st = el("div","stats");
  [[late.length,"en retard",late.length>0],[soon.length,"dans les 7 jours"],[nodate.length,"sans date"],[mine.length,"tâches ouvertes"]].forEach(([n,l,a]) => { const s = el("div","stat"+(a?" alert":"")); s.append(el("b",null,String(n)), el("span",null,l)); st.appendChild(s); });
  root.appendChild(st);
  const g = el("div","grid2");
  const sec = (title, small, nodes, empty) => { const s = el("section"); const h = el("h2","sec",title); if (small) h.appendChild(el("small",null,small)); s.appendChild(h); const box = el("div","items"); if (!nodes.length) box.appendChild(el("p","empty",empty)); nodes.forEach(n => box.appendChild(n)); s.appendChild(box); return s; };
  const taskItem = t => item(t.date ? fmtD(t.date) : "—", t.title, [t.client, POLE[t.pole]].filter(Boolean).join(" · "), lateDays(t.date) ? latePill(lateDays(t.date)) : "", () => openTask(t), colorOf(t.client));
  g.appendChild(sec("Mes tâches", late.length ? plural(late.length,"en retard","en retard") : "", late.concat(soon).slice(0,14).map(taskItem), "Rien en retard ni prévu cette semaine."));
  const ev = S.d.events.filter(e => e.date >= t0 && e.date <= t7 && e.status !== "Annulé").sort((a,b) => (a.date+(a.time||"99")).localeCompare(b.date+(b.time||"99")));
  g.appendChild(sec("Agenda des 7 jours", "toute l’agence", ev.map(e => item(fmtD(e.date)+(e.time ? " · "+fmtTime(e.time) : ""), e.client+(e.title ? " : "+e.title : ""), [e.type, (e.who||[]).join(", "), e.place].filter(Boolean).join(" · "), (e.who||[]).includes(me) ? el("span","pill dark","Toi") : "", () => openEvent(e), colorOf(e.client))), "Aucun événement dans les 7 jours."));
  const shoots = S.d.events.filter(e => e.type === "Tournage" && e.status === "Prévu" && e.date >= t0 && e.date <= addDays(t0,4));
  if (me === "Gabriel"){
    const rel = S.d.commercial.filter(c => isISO(c.nextDate) && c.nextDate <= addDays(t0,2)).sort((a,b) => a.nextDate.localeCompare(b.nextDate));
    g.appendChild(sec("Relances commerciales", plural(rel.length,"à faire"), rel.slice(0,12).map(c => item(fmtD(c.nextDate), c.company, c.nextAction, lateDays(c.nextDate) ? latePill(lateDays(c.nextDate)) : "", () => openCommercial(c))), "Aucune relance due."));
    const val = S.d.edtodo.filter(x => !x.done && x.who === "Gabriel" && x.date <= t7).sort((a,b) => a.date.localeCompare(b.date));
    g.appendChild(sec("À valider", "éditorial agence", val.map(x => item(fmtD(x.date), x.title, x.note || "", lateDays(x.date) ? latePill(lateDays(x.date)) : "", () => editEdTodo(x))), "Rien à valider cette semaine."));
  }
  if (me === "Matis"){
    const ru = S.d.rushes.filter(r => r.status !== "Monté" && (r.editor === "Matis" || !r.editor));
    g.appendChild(sec("Prêt à monter", plural(ru.length,"tournage"), ru.map(r => item(fmtD(r.shotAt), r.client, r.content, el("span","pill",r.status), () => editRush(r), colorOf(r.client))), "Aucun rush en attente."));
    const po = S.d.posts.filter(p => postWho(p) === "Matis" && !POST_DONE.includes(p.status) && postDue(p) <= t7).sort((a,b) => a.date.localeCompare(b.date));
    g.appendChild(sec("Montages pour le compte de l’agence", "remise 7 jours avant", po.slice(0,12).map(p => item(fmtD(postDue(p)), p.type+" · "+(p.client||""), p.format+" · publication le "+fmtD(p.date), postLate(p) ? el("span","pill l3","En retard") : el("span","pill",p.status), () => openPost(p), colorOf(p.client))), "Rien à remettre cette semaine."));
  }
  if (me === "Clara"){
    g.appendChild(sec("Feuilles de tournage", "72 h avant chaque tournage", shoots.map(e => item(fmtD(addDays(e.date,-3)), e.client, "Tournage le "+fmtDL(e.date)+(e.time ? " à "+fmtTime(e.time) : ""), addDays(e.date,-3) < t0 ? el("span","pill l3","À faire") : el("span","pill","À préparer"), () => openEvent(e), colorOf(e.client))), "Aucun tournage dans les 4 jours."));
    const ce = S.d.cevents.filter(e => !e.done && prepBy(e) && prepBy(e) <= addDays(t0,14) && e.date >= t0).sort((a,b) => prepBy(a).localeCompare(prepBy(b)));
    g.appendChild(sec("Temps forts à préparer", "dans les 14 jours", ce.slice(0,14).map(e => item(fmtD(prepBy(e)), e.client+" : "+e.subject, e.todo, prepBy(e) < t0 ? el("span","pill l3","En retard") : (e.piste ? el("span","pill","Piste") : ""), () => openCevent(e), colorOf(e.client))), "Rien à préparer dans les 14 jours."));
    const ca = S.d.posts.filter(p => p.type === "Carrousel" && p.date >= t0 && p.date <= addDays(t0,10) && p.status !== "Publié");
    g.appendChild(sec("Carrousels de l’agence", "10 prochains jours", ca.map(p => item(fmtD(p.date), "Carrousel · "+(p.client||""), p.format, el("span","pill",p.status), () => openPost(p), colorOf(p.client))), "Aucun carrousel dans les 10 jours."));
  }
  if (me !== "Clara" && shoots.length) g.appendChild(sec("Feuilles de tournage", "faites par Clara 72 h avant", shoots.map(e => item(fmtD(addDays(e.date,-3)), e.client, "Tournage le "+fmtDL(e.date), "", () => openEvent(e), colorOf(e.client))), ""));
  root.appendChild(g);
  /* Récap de l'équipe */
  const h = el("h2","sec","L’équipe"); h.appendChild(el("small",null,"tâches ouvertes")); root.appendChild(h);
  const {w, tb} = table(["Personne","À faire","En retard","7 prochains jours","Sans date"]); w.querySelector("table").classList.add("team");
  OWNERS.forEach(p => { const l = openTasks().filter(t => t.who === p); const tr = el("tr","row"); tr.onclick = () => { S.ui.tWho = p; go("taches"); };
    td(tr, p, "ttl"); [l.length, l.filter(t => lateDays(t.date) > 0).length, l.filter(t => isISO(t.date) && t.date >= t0 && t.date <= t7).length, l.filter(t => !isISO(t.date)).length].forEach((n,i) => { const c = td(tr, el("b",null,String(n))); if (i === 1 && n) c.style.color = "var(--crit)"; }); tb.appendChild(tr); });
  root.appendChild(w);
}

/* ---------- Tâches ---------- */
function vTaches(root){
  const who = S.ui.tWho || S.me || "Gabriel";
  const list = who === "Terminées" ? null : S.d.tasks.filter(t => (who === "Tous" || t.who === who) && (!t.done || t.doneAt === today()));
  const counts = Object.fromEntries(OWNERS.map(p => [p, openTasks().filter(t => t.who === p).length])); counts["Tous"] = openTasks().length; counts["Terminées"] = S.d.tasks.filter(t => t.done).length;
  root.appendChild(head("Tâches", "Une tâche, une seule personne. Les tâches cochées passent dans Terminées le lendemain.", [addBtn("Ajouter une tâche", () => editTask({}))]));
  const f = el("div","filters"); f.appendChild(chipBar(OWNERS.concat(["Tous","Terminées"]).map(p => [p,p]), who, v => { S.ui.tWho = v; remember(); render(); }, counts)); root.appendChild(f);
  if (who === "Terminées"){
    const done = S.d.tasks.filter(t => t.done).sort((a,b) => (b.doneAt||"").localeCompare(a.doneAt||""));
    const {w, tb} = table(["Terminée le","Personne","Client","Tâche","Note",""]);
    if (!done.length) root.appendChild(el("p","empty","Aucune tâche terminée."));
    done.forEach(t => { const tr = el("tr","row done"); tr.onclick = () => openTask(t); td(tr, fmtFR(t.doneAt),"nw"); td(tr, t.who); td(tr, clientTag(t.client),"nw"); td(tr, t.title,"ttl w"); td(tr, el("div","note",t.note)); const b = btn("Rouvrir","sm", e => { e.stopPropagation(); patch("tasks", t.id, {done:false, doneAt:""}); }); b.disabled = !writable(); td(tr, b); tb.appendChild(tr); });
    root.appendChild(w); return;
  }
  const {w, tb} = table(["Fait","~Client","À faire","Date","~Retard","~Note"].concat(who === "Tous" ? ["Qui"] : []));
  const cols = who === "Tous" ? 7 : 6;
  POLES.forEach(([code, label]) => {
    const rows = list.filter(t => (t.pole || "00") === code).sort((a,b) => (a.done - b.done) || ((a.date||"9999").localeCompare(b.date||"9999")));
    if (!rows.length) return;
    band(tb, label, rows.length, cols);
    rows.forEach(t => {
      const n = t.done ? 0 : lateDays(t.date);
      const tr = el("tr","row"+(t.done ? " done" : "")+(lateClass(n) ? " r"+lateClass(n) : "")); tr.onclick = () => openTask(t);
      td(tr, checkbox(t.done, v => patch("tasks", t.id, {done:v, doneAt: v ? today() : ""}).then(() => v && toast("Tâche faite."))));
      td(tr, clientTag(t.client),"nw hm"); mo(td(tr, t.title,"ttl w"), [t.client, n ? n+" j de retard" : ""].filter(Boolean).join(" · ")); td(tr, t.date ? fmtD(t.date) : "—","nw"); td(tr, n ? n+" j" : "","nw hm"); td(tr, el("div","note",t.note),"hm");
      if (who === "Tous") td(tr, t.who,"nw");
      tb.appendChild(tr);
    });
  });
  if (!list.length) root.appendChild(el("p","empty","Aucune tâche ouverte pour "+who+". Ajoute-en une avec le bouton en haut."));
  else root.appendChild(w);
  root.appendChild(el("p","status","Couleurs : jaune de 3 à 6 jours de retard, orange de 7 à 13, rouge à partir de 14."));
}

/* ---------- Commercial ---------- */
function vCommercial(root){
  const q = norm(S.ui.coQ);
  const all = S.d.commercial.filter(c => (S.ui.coKind === "Tous" || c.kind === (S.ui.coKind === "Clients" ? "Client" : "Prospect")) && (!q || norm([c.company,c.stage,c.notes,c.contact,c.nextAction].join(" ")).includes(q)));
  const due = S.d.commercial.filter(c => isISO(c.nextDate) && c.nextDate <= today()).length;
  root.appendChild(head("Commercial", plural(due,"action due","actions dues")+" aujourd’hui ou en retard · rythme de relance J+3, J+7, J+14, J+30", [addBtn("Nouveau prospect", () => editCommercial({}))]));
  const f = el("div","filters");
  f.appendChild(segm([["Tous","Tous"],["Clients","Clients"],["Prospects","Prospects"]], S.ui.coKind, v => { S.ui.coKind = v; remember(); render(); }));
  const s = el("input","search"); s.id = "co-q"; s.type = "search"; s.placeholder = "Chercher une entreprise"; s.value = S.ui.coQ; s.oninput = () => { S.ui.coQ = s.value; renderSoon(); };
  f.appendChild(s); root.appendChild(f);
  const {w, tb} = table(["Entreprise","~Étape","Prochaine action","Date","~Retard","~Dernier contact","~Relance"]);
  [["Client","CLIENTS"],["Prospect","PROSPECTS"]].forEach(([k, label]) => {
    const rows = all.filter(c => c.kind === k).sort((a,b) => (a.nextDate||"9999").localeCompare(b.nextDate||"9999"));
    if (!rows.length) return; band(tb, label, rows.length, 7);
    rows.forEach(c => { const n = lateDays(c.nextDate); const tr = el("tr","row"+(lateClass(n) ? " r"+lateClass(n) : "")); tr.onclick = () => openCommercial(c);
      mo(td(tr, c.company,"ttl w"), c.stage); td(tr, el("div","note",c.stage),"hm"); td(tr, el("div","note",c.nextAction)); td(tr, fmtD(c.nextDate),"nw"); td(tr, n ? n+" j" : "","nw hm"); td(tr, el("div","note",c.lastContact),"hm"); td(tr, c.relance,"nw hm"); tb.appendChild(tr); });
  });
  if (!all.length) root.appendChild(el("p","empty", S.ui.coQ ? "Aucune entreprise ne correspond." : "Aucune fiche pour l’instant."));
  else root.appendChild(w);
  root.appendChild(el("p","status","Ouvre une ligne pour appliquer un compte rendu : pas de réponse, devis envoyé, date donnée, pas intéressé ou signé."));
}

/* ---------- Campagnes ---------- */
function vCampagnes(root){
  root.appendChild(head("Campagnes", "Publicité Meta : le budget est payé par le client directement à Meta.", [addBtn("Nouvelle campagne", () => editCampaign({}))]));
  const {w, tb} = table(["Client","Statut","Budget","Lancée le","À savoir","Suivi"]);
  [["En cours","EN COURS"],["À lancer","À LANCER"],["Arrêtée","ARRÊTÉES"]].forEach(([k,label]) => {
    const rows = S.d.campaigns.filter(c => c.status === k).sort((a,b) => (a.order||0)-(b.order||0)); if (!rows.length) return;
    band(tb, label, rows.length, 6);
    rows.forEach(c => { const tr = el("tr","row"); tr.onclick = () => editCampaign(c);
      td(tr, clientTag(c.client),"nw");
      const sel = el("select","inl"); CAMP_STATUS.forEach(x => { const o = el("option",null,x); o.value = x; sel.appendChild(o); }); sel.value = c.status; sel.disabled = !writable(); sel.onclick = e => e.stopPropagation(); sel.onchange = () => patch("campaigns", c.id, {status:sel.value}).then(() => toast("Campagne passée en « "+sel.value+" ». Pense à la fiche 50_PUBLICITE."));
      td(tr, sel); td(tr, c.budget,"nw"); td(tr, fmtFR(c.launchedAt),"nw"); td(tr, el("div","note",c.note));
      const l = linkNode(c.link, "Contacts"); if (l instanceof Node) l.onclick = e => e.stopPropagation(); td(tr, l);
      tb.appendChild(tr); });
  });
  root.appendChild(S.d.campaigns.length ? w : el("p","empty","Aucune campagne pour l’instant."));
}

/* ---------- Prêt à monter ---------- */
function vMontage(root){
  root.appendChild(head("Prêt à monter", "Les tournages dont les rushs attendent le montage.", [addBtn("Retour de tournage", () => editRush({client:S.ui.ruClient||""}))]));
  const f = el("div","filters"); const g = el("div","fgroup"); const lb = el("label","flabel","Client"); lb.htmlFor = "ru-client"; g.appendChild(lb);
  const sel = el("select","pick"); sel.id = "ru-client";
  const used = new Set(S.d.rushes.map(r => r.client).filter(Boolean)); const names = clientNames(); used.forEach(n => { if (!names.includes(n)) names.push(n); });
  [["","Tous les clients"]].concat(names.map(n => [n, n+(used.has(n) ? " ("+S.d.rushes.filter(r => r.client === n && r.status !== "Monté").length+")" : "")])).forEach(([val,l]) => { const o = el("option",null,l); o.value = val; sel.appendChild(o); });
  sel.value = S.ui.ruClient || ""; sel.onchange = () => { S.ui.ruClient = sel.value; remember(); render(); }; g.appendChild(sel); f.appendChild(g); root.appendChild(f);
  const rows = S.d.rushes.filter(r => !S.ui.ruClient || r.client === S.ui.ruClient).slice().sort((a,b) => (RUSH_STATUS.indexOf(a.status) - RUSH_STATUS.indexOf(b.status)) || (a.shotAt||"").localeCompare(b.shotAt||""));
  const {w, tb} = table(["Client","Tourné le","Ce qui a été tourné","Qui monte","Statut","À savoir","Rushs"]);
  rows.forEach(r => { const tr = el("tr","row"+(r.status === "Monté" ? " done" : "")); tr.onclick = () => editRush(r);
    td(tr, clientTag(r.client),"nw"); td(tr, fmtFR(r.shotAt),"nw"); td(tr, r.content,"ttl w"); td(tr, r.editor || el("span","pill l2","À préciser"));
    const s = segm(RUSH_STATUS.map(x => [x,x]), r.status, v => writable() && patch("rushes", r.id, {status:v})); s.onclick = e => e.stopPropagation(); s.style.transform = "scale(.88)"; s.style.transformOrigin = "left center"; td(tr, s,"nw");
    td(tr, el("div","note",r.note)); const l = linkNode(r.link, "Rushs"); if (l instanceof Node) l.onclick = e => e.stopPropagation(); td(tr, l); tb.appendChild(tr); });
  root.appendChild(rows.length ? w : el("p","empty", S.ui.ruClient ? "Aucun tournage pour ce client." : "Aucun tournage en attente de montage. Ajoute un retour de tournage pour créer une ligne."));
}

/* ---------- Publications ---------- */
function vPublications(root){
  const rows = S.d.publications.slice().sort((a,b) => a.client.localeCompare(b.client,"fr"));
  const total = rows.reduce((s,p) => s + (Number(p.planned)||0), 0);
  root.appendChild(head("Publications", "Chaque client réseaux face à son volume prévu du mois · "+total+" prévues · rempli chaque matin depuis Metricool, stories exclues"));
  const {w, tb} = table(["Client","Prévues","Publiées","Écart","Programmées 7 j","En attente client","Refusées","Prochaine","Alerte"]);
  rows.forEach(p => { const tr = el("tr","row"); tr.onclick = () => editPub(p);
    td(tr, clientTag(p.client),"nw"); [p.planned,p.published,p.gap,p.scheduled7,p.waiting,p.refused].forEach(v => td(tr, v === "" || v == null ? "—" : String(v),"nw")); td(tr, p.next,"nw");
    td(tr, p.alert ? el("span","pill l3",p.alert) : ""); tb.appendChild(tr); });
  root.appendChild(rows.length ? w : el("p","empty","Aucun client réseaux."));
  if (rows.every(p => p.published === "" || p.published == null)) root.appendChild(el("p","status","Compteurs vides jusqu’au 01/11/2026 : ils repartent de zéro chaque 1er du mois."));
}

/* ---------- Calendrier clients (Clara) ---------- */
function vClients(root){
  const tab = S.ui.ccTab || "client";
  root.appendChild(head("Calendrier clients", "Prévoir à l’avance : événements des clients, fêtes, temps forts, demandes. Préparer 3 semaines avant (6 pour la Paillotte).",
    [segm([["client","Par client"],["soon","À préparer"],["dates","Dates clés"],["recap","Récap"]], tab, v => { S.ui.ccTab = v; remember(); render(); })]));
  const cal = clientsAll().filter(c => c.calendar);
  if (tab === "dates"){
    const tools = el("div","filters"); tools.appendChild(addBtn("Ajouter une date clé", () => editKeydate({}))); root.appendChild(tools);
    const {w, tb} = table(["Date","Événement","Pour qui","Préparer avant le"]);
    let cur = "";
    S.d.keydates.slice().sort((a,b) => a.date.localeCompare(b.date)).forEach(k => {
      const m = k.date.slice(0,7); if (m !== cur){ cur = m; const d = parseISO(k.date); band(tb, (MONTHS[d.getMonth()]+" "+d.getFullYear()).toUpperCase(), null, 4); }
      const pb = addDays(k.date,-21); const tr = el("tr","row"+(k.date < today() ? " done" : "")); tr.onclick = () => openKeydate(k);
      td(tr, fmtD(k.date)+(k.end ? " → "+fmtD(k.end) : ""),"nw"); td(tr, k.label,"ttl w"); td(tr, el("div","note",k.forWhom || (k.clients||[]).join(", "))); td(tr, fmtD(pb),"nw"); tb.appendChild(tr); });
    root.appendChild(w); return;
  }
  if (tab === "recap"){
    const {w, tb} = table(["Client","Publications / mois","Dont réels","LinkedIn / mois","Tournages / mois","Réseaux","À confirmer"]);
    const sum = [0,0,0,0];
    cal.forEach(c => { const r = c.recap || {}; const tr = el("tr","row"); tr.onclick = () => { S.ui.ccClient = c.name; S.ui.ccTab = "client"; remember(); render(); };
      td(tr, clientTag(c.name),"nw"); [r.pubs, r.reels, r.linkedin, r.shoots].forEach((v,i) => { sum[i] += Number(v)||0; td(tr, v || "—","nw"); }); td(tr, r.networks); td(tr, el("div","note",r.confirm)); tb.appendChild(tr); });
    const tr = el("tr","band"); const c = el("td"); c.colSpan = 7; c.textContent = "TOTAL PAR MOIS : "+sum[0]+" PUBLICATIONS, DONT "+sum[1]+" RÉELS · "+sum[2]+" LINKEDIN · "+sum[3]+" TOURNAGES"; tr.appendChild(c); tb.appendChild(tr);
    root.appendChild(w); return;
  }
  if (tab === "soon"){
    const rows = S.d.cevents.filter(e => !e.done && e.date >= today() && prepBy(e) <= addDays(today(), 28)).sort((a,b) => prepBy(a).localeCompare(prepBy(b)));
    const {w, tb} = table(["Fait","Préparer avant le","Client","Date","Quoi","À faire"]);
    rows.forEach(e => { const pb = prepBy(e); const late = pb < today(); const tr = el("tr","row"+(late ? " r3" : "")); tr.onclick = () => openCevent(e);
      td(tr, checkbox(e.done, v => patch("cevents", e.id, {done:v}))); td(tr, fmtD(pb),"nw"); td(tr, clientTag(e.client),"nw"); td(tr, fmtD(e.date),"nw");
      const q = el("span","ttl", e.subject); const cell = td(tr, q,"w"); if (e.piste) cell.appendChild(el("span","pill",  "Piste")); td(tr, el("div","note",e.todo)); tb.appendChild(tr); });
    root.appendChild(el("p","status","Temps forts à préparer dans les 4 prochaines semaines, tous clients. En rouge : la date de préparation est passée."));
    root.appendChild(rows.length ? w : el("p","empty","Rien à préparer dans les 4 semaines."));
    return;
  }
  if (!S.ui.ccClient || !cal.find(c => c.name === S.ui.ccClient)) S.ui.ccClient = (cal[0] || {}).name || "";
  const split = el("div","split");
  const L = el("div","clist");
  cal.forEach(c => { const b = el("button"); const d = el("span","dot"); d.style.setProperty("--c", c.color || colorOf(c.name)); b.append(d, el("span",null,c.name));
    const n = S.d.cevents.filter(e => e.client === c.name && !e.done && e.date >= today() && prepBy(e) < today()).length; if (n) b.appendChild(el("span","pill l3",String(n)));
    b.setAttribute("aria-pressed", String(c.name === S.ui.ccClient)); b.onclick = () => { S.ui.ccClient = c.name; remember(); render(); }; L.appendChild(b); });
  split.appendChild(L);
  const R = el("div"); const c = cal.find(x => x.name === S.ui.ccClient);
  if (c){
    const t = el("h2","ctitle"); const d = el("span","dot"); d.style.cssText = "width:16px;height:16px"; d.style.setProperty("--c", c.color || colorOf(c.name)); t.append(d, document.createTextNode(c.title || c.name));
    const eb = btn("Modifier la fiche","sm", () => editClient(c)); eb.disabled = !writable(); t.appendChild(eb); R.appendChild(t);
    const dl = el("dl","fiche"); [["Formule",c.formula],["Publications / mois",c.perMonth],["Tournage",c.shoot],["Réseaux",c.networks],["À retenir",c.remember],["À demander",c.ask]].forEach(([k,v]) => { if (!v) return; dl.append(el("dt",null,k), el("dd",null,v)); }); R.appendChild(dl);
    const tools = el("div","filters"); tools.appendChild(addBtn("Ajouter un temps fort", () => editCevent({client:c.name}))); tools.appendChild(el("span","muted","Préparer "+(c.leadWeeks||3)+" semaines avant la date. Les pistes sont des idées à valider avec le client.")); R.appendChild(tools);
    const rows = S.d.cevents.filter(e => e.client === c.name).sort((a,b) => a.date.localeCompare(b.date));
    const {w, tb} = table(["Date","Quoi","À faire","Préparer avant le","Fait"]);
    let cur = "";
    rows.forEach(e => { const m = (e.date||"").slice(0,7); if (m !== cur){ cur = m; const dd = parseISO(e.date); band(tb, (MONTHS[dd.getMonth()]+" "+dd.getFullYear()).toUpperCase(), null, 5); }
      const pb = prepBy(e); const late = !e.done && pb && pb < today() && e.date >= today();
      const tr = el("tr","row"+(e.done ? " done" : "")+(late ? " r3" : "")+(e.date < today() && !e.done ? " done" : "")); tr.onclick = () => openCevent(e);
      td(tr, fmtD(e.date),"nw"); const q = td(tr, el("span","ttl",e.subject),"w"); if (e.piste){ q.appendChild(document.createTextNode(" ")); q.appendChild(el("span","pill","Piste")); }
      td(tr, el("div","note",e.todo)); td(tr, fmtD(pb),"nw"); td(tr, checkbox(e.done, v => patch("cevents", e.id, {done:v}))); tb.appendChild(tr); });
    R.appendChild(rows.length ? w : el("p","empty","Aucun temps fort pour ce client. Ajoute le premier avec le bouton ci-dessus."));
  }
  split.appendChild(R); root.appendChild(split);
}

/* ---------- Éditorial agence ---------- */
function vEditorial(root){
  const months = Array.from(new Set(S.d.posts.map(p => p.date.slice(0,7)))).sort();
  if (!S.ui.edMonth || !months.includes(S.ui.edMonth)) S.ui.edMonth = months.find(m => m >= today().slice(0,7)) || months[0] || today().slice(0,7);
  const m = S.ui.edMonth, d0 = parseISO(m+"-01");
  const rows = S.d.posts.filter(p => p.date.slice(0,7) === m).sort((a,b) => a.date.localeCompare(b.date));
  root.appendChild(head([MONTHS[d0.getMonth()], String(d0.getFullYear())], "Compte Instagram de l’agence · 7 publications par semaine et des stories tous les jours",
    [segm(months.map(x => { const d = parseISO(x+"-01"); return [x, MONTHS[d.getMonth()].replace(/^./, c => c.toUpperCase())]; }), m, v => { S.ui.edMonth = v; remember(); render(); }), addBtn("Ajouter", () => editPost({date:m+"-01"}))]));
  const st = el("div","stats"); const late = rows.filter(postLate).length;
  [[rows.filter(p => p.type === "Réel").length,"réels"],[rows.filter(p => p.type === "Carrousel").length,"carrousels"],[rows.filter(p => p.type === "Vidéo publicitaire").length,"vidéos publicitaires"],[rows.filter(p => p.status === "Publié").length+" / "+rows.length,"publiés"]].forEach(([n,l]) => { const s = el("div","stat"); s.append(el("b",null,String(n)), el("span",null,l)); st.appendChild(s); });
  root.appendChild(st);
  if (late) root.appendChild(el("p","status", plural(late,"montage")+" en retard : date de remise passée, ni Monté, ni Relu, ni Programmé, ni Publié."));
  const {w, tb} = table(["Date","Type","~Format","~Client","~Story du jour","~Qui","À remettre le","Statut","~Film en ligne","~Notes"]);
  rows.forEach(p => { const tr = el("tr","row"+(p.status === "Publié" ? " pub" : postLate(p) ? " r3" : "")); tr.onclick = () => openPost(p);
    td(tr, dow(p.date).slice(0,3)+". "+fmtD(p.date),"nw"); mo(td(tr, p.type,"nw ttl"), [p.client, postWho(p)].filter(Boolean).join(" · ")); td(tr, p.format,"nw hm"); td(tr, clientTag(p.client),"nw hm"); td(tr, el("div","note",postStory(p)),"hm w");
    td(tr, postWho(p),"nw hm"); td(tr, postDue(p) ? fmtD(postDue(p)) : "—","nw");
    const sel = el("select","inl"); POST_STATUS.forEach(x => { const o = el("option",null,x); o.value = x; sel.appendChild(o); }); sel.value = p.status; sel.disabled = !writable(); sel.onclick = e => e.stopPropagation();
    sel.onchange = () => { if (sel.value === "Publié" && p.type === "Réel" && !p.filmOnline){ sel.value = p.status; toast("Un réel n’est publié que si le film complet est en ligne chez le client. Propose le prochain réel prêt du même secteur."); return; } patch("posts", p.id, {status:sel.value}); };
    td(tr, sel); td(tr, checkbox(p.filmOnline, v => patch("posts", p.id, {filmOnline:v}), "Film en ligne chez le client"),"hm"); td(tr, el("div","note",p.notes),"hm w"); tb.appendChild(tr); });
  root.appendChild(rows.length ? w : el("p","empty","Aucune publication prévue ce mois-ci."));
  edExtras(root);
}
function edExtras(root){
  /* À faire */
  const h = el("h2","sec","À faire"); h.appendChild(el("small",null,"validations, programmations, bilans")); root.appendChild(h);
  const tl = el("div","filters"); tl.appendChild(addBtn("Ajouter", () => editEdTodo({}))); root.appendChild(tl);
  const t = table(["Fait","Pour le","Tâche","Qui","Notes"]);
  S.d.edtodo.slice().sort((a,b) => (a.done - b.done) || (a.date||"").localeCompare(b.date||"")).forEach(x => { const n = x.done ? 0 : lateDays(x.date); const tr = el("tr","row"+(x.done ? " done" : "")+(lateClass(n) ? " r"+lateClass(n) : "")); tr.onclick = () => editEdTodo(x);
    td(tr, checkbox(x.done, v => patch("edtodo", x.id, {done:v}))); td(tr, fmtD(x.date),"nw"); td(tr, x.title,"ttl w"); td(tr, x.who,"nw"); td(tr, el("div","note",x.note)); t.tb.appendChild(tr); });
  root.appendChild(t.w);
  /* Semaine type */
  const wt = weekType();
  if (wt){
    const det = el("details","box"); det.appendChild(el("summary",null,"Semaine type et règles"));
    if (wt.intro) det.appendChild(el("p","muted",wt.intro));
    const s = table(["Jour","Publication","Format de montage","Story du jour"]); (wt.days||[]).forEach(x => { const tr = el("tr"); td(tr, x.day,"ttl nw"); td(tr, x.type); td(tr, x.format); td(tr, x.story); s.tb.appendChild(tr); }); det.appendChild(s.w);
    [["Textes des cartons", wt.cartons],["Règles", wt.rules],["Mode d’emploi", wt.instructions]].forEach(([title, arr]) => { if (!arr || !arr.length) return; det.appendChild(el("h2","sec",title)); const dl = el("dl","rules"); arr.forEach(r => dl.append(el("dt",null,r.label), el("dd",null,r.text))); det.appendChild(dl); });
    root.appendChild(det);
  }
}

/* ---------- Agenda ---------- */
function agCursor(){ if (!S.ui.agCursor){ const d = parseISO(S.ui.agSel || today()); S.ui.agCursor = new Date(d.getFullYear(), d.getMonth(), 1); } return S.ui.agCursor; }
function evNode(i, compact){
  const b = el("button", i.cls); const c = colorOf(i.client); b.style.setProperty("--c", c); b.style.setProperty("--fg", fgOn(c));
  if (i.time) b.appendChild(el("span","tm", fmtTime(i.time)));
  if (i.gl) b.appendChild(el("span","gl", i.gl));
  const who = i.client ? (compact ? shortName(i.client)+" " : "") : "";
  b.appendChild(el("span","tx", compact ? who + i.label : (i.client || i.label)));
  if (!compact && i.client) b.appendChild(el("span","tx", i.label));
  b.title = [i.client, i.label, i.meta, i.who.join(", ")].filter(Boolean).join("\n");
  b.onclick = e => { e.stopPropagation(); openItem(i); };
  return b;
}
function lrow(i){
  const r = el("button","lrow"+(i.k === "events" ? " s-"+(i.ref.status||"Prévu") : "")); r.style.setProperty("--c", i.client ? colorOf(i.client) : "var(--muted)");
  r.appendChild(el("span","lm", i.time ? fmtTime(i.time) : i.k === "events" ? "Journée" : ({tasks:"Tâche",relances:"Relance",cevents:"Client",keydates:"Date clé",posts:"Agence",edtodo:"Agence"}[i.k])));
  r.appendChild(el("span","sw"+(i.k === "events" && i.ref.type === "Tournage" ? " fill" : "")));
  const mid = el("span"); mid.append(el("div","lt", (i.client ? i.client+" : " : "")+i.label), el("div","lm", [i.meta, i.who.join(", ")].filter(Boolean).join(" · ")));
  r.appendChild(mid); r.appendChild(el("span","pill tag", i.tag || ""));
  r.onclick = () => openItem(i); return r;
}
function newOnDay(k){ if (!writable()) return; editEvent({date:k, client:S.ui.agClient||"", type: S.ui.agTypes.length === 1 ? S.ui.agTypes[0] : "Tournage", who: S.ui.agWho ? [S.ui.agWho] : [], status:"Prévu"}); }
function vAgenda(root){
  const cur = agCursor(), y = cur.getFullYear(), m = cur.getMonth(), t0 = today(), v = S.ui.agView;
  let title = [MONTHS[m], String(y)];
  let monday, sunday;
  if (v === "week"){ const base = parseISO(S.ui.agSel); monday = new Date(base); monday.setDate(base.getDate()-((base.getDay()+6)%7)); sunday = new Date(monday); sunday.setDate(monday.getDate()+6);
    title = ["Semaine du "+monday.getDate()+(monday.getMonth() !== sunday.getMonth() ? " "+MONTHS[monday.getMonth()] : ""), "au "+sunday.getDate()+" "+MONTHS[sunday.getMonth()]]; }
  const step = dir => { if (v === "week"){ S.ui.agSel = addDays(S.ui.agSel, 7*dir); const s = parseISO(S.ui.agSel); S.ui.agCursor = new Date(s.getFullYear(), s.getMonth(), 1); } else { S.ui.agCursor = new Date(y, m+dir, 1); const s = parseISO(S.ui.agSel); if (s.getMonth() !== S.ui.agCursor.getMonth() || s.getFullYear() !== S.ui.agCursor.getFullYear()) S.ui.agSel = iso(S.ui.agCursor); } render(); };
  const prev = btn("‹","icon", () => step(-1)); prev.setAttribute("aria-label","Période précédente");
  const next = btn("›","icon", () => step(1)); next.setAttribute("aria-label","Période suivante");
  root.appendChild(head(title, "Agenda de l’agence", [prev, btn("Aujourd’hui","", () => { S.ui.agSel = t0; S.ui.agCursor = null; render(); }), next,
    segm([["month","Mois"],["week","Semaine"],["list","Liste"]], v, x => { S.ui.agView = x; remember(); render(); }), addBtn("Ajouter", () => newOnDay(S.ui.agSel))]));
  /* Filtres */
  const f = el("div","filters");
  const g1 = el("div","fgroup"); g1.appendChild(el("label","flabel","Client")); const sel = el("select","pick"); sel.id = "ag-client"; g1.querySelector("label").htmlFor = "ag-client";
  [["","Tous les clients"]].concat(clientNames().map(n => [n,n])).forEach(([val,l]) => { const o = el("option",null,l); o.value = val; sel.appendChild(o); }); sel.value = S.ui.agClient; sel.onchange = () => { S.ui.agClient = sel.value; if (sel.value === AGENCE && !S.ui.agLayers.includes("posts")) S.ui.agLayers = S.ui.agLayers.concat("posts"); remember(); render(); }; g1.appendChild(sel); f.appendChild(g1);
  const g2 = el("div","fgroup"); g2.appendChild(el("span","flabel","Qui")); g2.appendChild(chipBar([["","Tous"]].concat(PEOPLE.map(p => [p,p])), S.ui.agWho, x => { S.ui.agWho = x; remember(); render(); })); f.appendChild(g2);
  const qb = btn("Tournages, tous clients","", () => { S.ui.agClient = ""; S.ui.agWho = ""; S.ui.agLayers = ["events"]; S.ui.agTypes = ["Tournage"]; remember(); render(); }); qb.classList.add("right"); f.appendChild(qb);
  root.appendChild(f);
  const f2 = el("div","filters"); f2.style.paddingTop = "0";
  const g3 = el("div","fgroup lay"); g3.appendChild(el("span","flabel","Calques"));
  LAYERS.forEach(([k,l]) => { const b = el("button","chip"); const sw = el("span","sw "+({tasks:"k-task",cevents:"k-cevent",posts:"k-post",keydates:"k-keydate"}[k]||"")); b.append(sw, document.createTextNode(l)); b.setAttribute("aria-pressed", String(S.ui.agLayers.includes(k)));
    b.onclick = () => { const on = S.ui.agLayers.includes(k); S.ui.agLayers = on ? S.ui.agLayers.filter(x => x !== k) : S.ui.agLayers.concat(k); remember(); render(); }; g3.appendChild(b); });
  f2.appendChild(g3);
  if (S.ui.agLayers.includes("events")){ const g4 = el("div","fgroup"); g4.appendChild(el("span","flabel","Type d’événement"));
    EV_TYPES.forEach(t => { const b = el("button","chip",t); b.setAttribute("aria-pressed", String(S.ui.agTypes.includes(t) && S.ui.agTypes.length < EV_TYPES.length));
      b.onclick = () => { const on = S.ui.agTypes.includes(t); if (on && S.ui.agTypes.length === 1) S.ui.agTypes = EV_TYPES.slice(); else if (S.ui.agTypes.length === EV_TYPES.length) S.ui.agTypes = [t]; else S.ui.agTypes = on ? S.ui.agTypes.filter(x => x !== t) : S.ui.agTypes.concat(t); remember(); render(); }; g4.appendChild(b); });
    f2.appendChild(g4); }
  root.appendChild(f2);
  const items = agendaItems(); const map = {}; items.forEach(i => (map[i.date] = map[i.date] || []).push(i));
  if (v === "month"){
    const dw = el("div","dow"); ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"].forEach(d => dw.appendChild(el("span",null,d)));
    const g = el("div","cal"); const first = new Date(y, m, 1); const off = (first.getDay()+6)%7; const start = new Date(y, m, 1-off);
    const weeks = Math.ceil((off + new Date(y, m+1, 0).getDate())/7);
    for (let i = 0; i < weeks*7; i++){
      const d = new Date(start); d.setDate(start.getDate()+i); const k = iso(d);
      const cell = el("div","day"); cell.setAttribute("role","button"); cell.tabIndex = 0; cell.setAttribute("aria-label", DAYS[(d.getDay()+6)%7]+" "+d.getDate()+" "+MONTHS[d.getMonth()]);
      if (d.getMonth() !== m) cell.classList.add("out"); else if (i%7 >= 5) cell.classList.add("we");
      if (k === t0) cell.classList.add("today"); if (k === S.ui.agSel) cell.classList.add("sel");
      cell.appendChild(el("span","num", String(d.getDate())));
      const evs = map[k] || [];
      evs.slice(0,5).forEach(i => cell.appendChild(evNode(i, true)));
      if (evs.length > 5){ const more = el("button","more","+ "+(evs.length-5)+" autres"); more.onclick = e => { e.stopPropagation(); S.ui.agSel = k; S.ui.agView = "week"; remember(); render(); }; cell.appendChild(more); }
      const dots = el("div","dots"); evs.forEach(i => { const dt = el("span","dot"); dt.style.setProperty("--c", i.client ? colorOf(i.client) : "var(--muted)"); dots.appendChild(dt); }); cell.appendChild(dots);
      const pick = () => { if (window.matchMedia("(max-width:760px)").matches){ S.ui.agSel = k; render(); } else newOnDay(k); };
      cell.onclick = pick; cell.onkeydown = e => { if (e.key === "Enter" || e.key === " "){ e.preventDefault(); pick(); } };
      g.appendChild(cell);
    }
    root.append(dw, g);
    const p = el("section","daypanel"); p.setAttribute("aria-live","polite"); p.appendChild(el("h2",null, fmtDL(S.ui.agSel)));
    const evs = map[S.ui.agSel] || []; if (!evs.length) p.appendChild(el("p","empty","Rien de prévu ce jour-là.")); evs.forEach(i => p.appendChild(lrow(i)));
    const a = addBtn("Ajouter ce jour-là", () => newOnDay(S.ui.agSel)); a.style.marginTop = "10px"; p.appendChild(a); root.appendChild(p);
  } else if (v === "week"){
    const sx = el("div","tw"); sx.style.borderTop = "0"; const w = el("div","week");
    for (let i = 0; i < 7; i++){ const d = new Date(monday); d.setDate(monday.getDate()+i); const k = iso(d);
      const col = el("div","wcol"); if (k === t0) col.classList.add("today");
      const h = el("div","whead"); h.append(el("b",null,String(d.getDate())), el("span",null,DAYS[i])); col.appendChild(h);
      (map[k]||[]).forEach(it => col.appendChild(evNode(it, false))); col.onclick = () => newOnDay(k); w.appendChild(col); }
    sx.appendChild(w); root.appendChild(sx);
  } else {
    const from = iso(new Date(y, m, 1)), to = iso(new Date(y, m+1, 0));
    const days = Object.keys(map).filter(k => k >= from && k <= to).sort();
    if (!days.length) root.appendChild(el("p","empty","Rien de prévu ce mois-ci avec ces filtres."));
    days.forEach(k => { const d = parseISO(k); const row = el("div","lday"); const dd = el("div","ldate"); dd.append(el("b",null,fmtD(k)), el("span",null,dow(k)));
      const its = el("div","litems"); map[k].forEach(i => its.appendChild(lrow(i))); row.append(dd, its); root.appendChild(row); });
  }
  /* Légende */
  const lg = el("section","legend"); lg.setAttribute("aria-label","Légende des clients");
  const present = new Set(items.map(i => i.client).filter(Boolean));
  clientsAll().filter(c => present.has(c.name) || S.ui.agClient === c.name).forEach(c => { const b = el("button"); const dt = el("span","dot"); dt.style.setProperty("--c", c.color || colorOf(c.name)); b.append(dt, document.createTextNode(c.name)); b.setAttribute("aria-pressed", String(S.ui.agClient === c.name)); b.onclick = () => { S.ui.agClient = S.ui.agClient === c.name ? "" : c.name; remember(); render(); }; lg.appendChild(b); });
  root.appendChild(lg);
  root.appendChild(el("p","status", plural(items.length,"élément")+" avec ces filtres."));
  if (S.ui.agClient === AGENCE) agAgence(root, iso(new Date(y, m, 1)).slice(0,7));
}
/* Com de l'agence : ce qui était l'onglet Éditorial agence, affiché quand le filtre Client est sur Agence Gacolet */
function agAgence(root, m){
  const h0 = el("h2","sec","Com de l’agence"); h0.appendChild(el("small",null,"compte Instagram · 7 publications par semaine et des stories tous les jours")); root.appendChild(h0);
  const rows = S.d.posts.filter(p => (p.date||"").slice(0,7) === m);
  const st = el("div","stats"); const late = S.d.posts.filter(postLate).length;
  [[rows.filter(p => p.type === "Réel").length,"réels"],[rows.filter(p => p.type === "Carrousel").length,"carrousels"],[rows.filter(p => p.type === "Vidéo publicitaire").length,"vidéos publicitaires"],[rows.filter(p => p.status === "Publié").length+" / "+rows.length,"publiés"]].forEach(([n,l]) => { const s = el("div","stat"); s.append(el("b",null,String(n)), el("span",null,l)); st.appendChild(s); });
  root.appendChild(st);
  if (late) root.appendChild(el("p","status", plural(late,"montage")+" en retard : date de remise passée, ni Monté, ni Relu, ni Programmé, ni Publié."));
  const tl0 = el("div","filters"); tl0.appendChild(addBtn("Publication", () => editPost({date: S.ui.agSel && S.ui.agSel.slice(0,7) === m ? S.ui.agSel : m+"-01"}))); root.appendChild(tl0);
  edExtras(root);
}

/* ---------- Navigation ---------- */
const RENDER = {accueil:vAccueil, agenda:vAgenda, taches:vTaches, commercial:vCommercial, campagnes:vCampagnes, montage:vMontage, publications:vPublications, clients:vClients};
function go(v){ if (location.hash !== "#"+v) location.hash = v; else { S.view = v; render(); } }
function fromHash(){ let h = (location.hash||"").replace("#",""); if (h === "editorial"){ S.ui.agClient = AGENCE; if (!S.ui.agLayers.includes("posts")) S.ui.agLayers = S.ui.agLayers.concat("posts"); h = "agenda"; } S.view = RENDER[h] ? h : "accueil"; }
window.addEventListener("hashchange", () => { fromHash(); render(); window.scrollTo(0,0); });
const ICONS = {
  accueil:'<path d="M4 11.2 12 4.8l8 6.4V20h-5.6v-5.2H9.6V20H4z"/>',
  agenda:'<rect x="4" y="5.5" width="16" height="14.5" rx="1.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  taches:'<path d="M4.5 7l1.5 1.5L8.5 6M4.5 13l1.5 1.5L8.5 12M11 7.3h8.5M11 13.3h8.5M11 18.8h8.5M5 18.8h2.5"/>',
  commercial:'<path d="M4 19.5h16M7 16.5v-4.5M12 16.5V8.5M17 16.5V5"/>',
  campagnes:'<path d="M4 10v4l3 .4L15 19V5L7 9.6z"/><path d="M18.2 9.4a3.6 3.6 0 0 1 0 5.2"/>',
  montage:'<rect x="3.5" y="6" width="17" height="12" rx="1.5"/><path d="M8 6v12M16 6v12M3.5 10h4.5M3.5 14h4.5M16 10h4.5M16 14h4.5"/>',
  publications:'<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="3.6"/><path d="M16.7 7.3h.01"/>',
  clients:'<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M15.5 6.2a3 3 0 0 1 0 5.6M17 14.3c1.9.6 3.1 2.2 3.5 4.7"/>',
  plus:'<path d="M5 7h14M5 12h14M5 17h14"/>'
};
const SHORT = {accueil:"Accueil", agenda:"Agenda", taches:"Tâches", commercial:"Commercial", campagnes:"Campagnes", montage:"Montage", publications:"Publications", clients:"Calendrier clients"};
const MOBILE_MAIN = ["accueil","agenda","taches","commercial"];
const ico = k => { const s = document.createElementNS("http://www.w3.org/2000/svg","svg"); s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("aria-hidden","true"); s.classList.add("ico"); s.innerHTML = ICONS[k] || ""; return s; };
function renderTabs(){
  const me = S.me || "Gabriel";
  const badge = { taches: openTasks().filter(t => t.who === me && lateDays(t.date) > 0).length, commercial: me === "Gabriel" ? S.d.commercial.filter(c => isISO(c.nextDate) && c.nextDate <= today()).length : 0 };
  const link = k => { const a = el("a"); a.href = "#"+k; a.appendChild(ico(k)); a.appendChild(el("span","lb", SHORT[k])); if (k === S.view) a.setAttribute("aria-current","page"); if (badge[k]) a.appendChild(el("span","n",String(badge[k]))); return a; };
  const n = $("#tabs"); n.textContent = "";
  VIEWS.forEach(([k]) => { n.appendChild(link(k)); if (k === "commercial") n.appendChild(el("span","navsep")); });
  const m = $("#mtabs"); m.textContent = "";
  MOBILE_MAIN.forEach(k => m.appendChild(link(k)));
  const more = el("button","morebtn"); more.type = "button"; more.appendChild(ico("plus")); more.appendChild(el("span","lb","Plus"));
  if (!MOBILE_MAIN.includes(S.view)) more.setAttribute("aria-current","page");
  more.onclick = openMore; m.appendChild(more);
  $("#mbar-title").textContent = SHORT[S.view] || "";
  $("#me-name").textContent = me;
}
function openMore(){
  openModal(md => { md.classList.add("sheet"); const t = el("h3",null,"Menu"); t.id = "mtitle"; md.appendChild(t);
    const l = el("nav","morelist"); VIEWS.filter(([k]) => !MOBILE_MAIN.includes(k)).forEach(([k,lab]) => { const a = el("a"); a.href = "#"+k; a.appendChild(ico(k)); a.appendChild(el("span",null,lab)); if (k === S.view) a.setAttribute("aria-current","page"); a.onclick = () => closeModal(); l.appendChild(a); }); md.appendChild(l);
    const w = el("div","whobox"); w.appendChild(el("span","flabel","Je suis"));
    w.appendChild(segm(PEOPLE.map(p => [p,p]), S.me, p => { setMe(p); closeModal(); })); md.appendChild(w);
    const o = el("div","actions"); o.style.justifyContent = "space-between";
    const ag = el("a","btn sm","Espace clients"); ag.href = "/agence"; o.appendChild(ag);
    o.appendChild(btn("Se déconnecter","sm", () => window.GC && GC.logout())); md.appendChild(o);
  });
}
let rq = 0;
function renderSoon(){ if (rq) return; rq = requestAnimationFrame(() => { rq = 0; render(); }); }
function render(){
  renderTabs();
  const root = $("#app");
  const focusId = document.activeElement && document.activeElement.id; const caret = focusId && document.activeElement.selectionStart;
  root.textContent = "";
  if (S.failed){ root.appendChild(head("Gestionnaire", "")); root.appendChild(el("p","empty",S.failed)); return; }
  if (!S.ready){ root.appendChild(head(VIEWS.find(v => v[0] === S.view)[1], "Chargement des données de l’agence…")); root.appendChild(el("p","empty","Les tâches, le commercial, les campagnes, les calendriers et l’agenda s’affichent dans un instant.")); return; }
  try { RENDER[S.view](root); } catch(x){ root.appendChild(el("p","err","Affichage impossible : "+(x && x.message))); console.error(x); }
  if (S.canWrite === false) root.insertBefore(el("p","status","Consultation seule : demande à Gabriel l’accès Contributeur pour modifier."), root.firstChild);
  if (focusId){ const f = document.getElementById(focusId); if (f){ f.focus(); try { if (caret != null) f.setSelectionRange(caret, caret); } catch(e){} } }
  document.title = "Gacolet";
}

/* ---------- Démarrage ---------- */
const meSel = $("#me");
function askWho(){
  openModal(m => { const t = el("h3",null,"Qui es-tu ?"); t.id = "mtitle"; m.appendChild(t); m.appendChild(el("p","muted","Le gestionnaire s’ouvre sur tes tâches et tes dates. Tu peux changer en haut à droite."));
    const c = el("div","actions"); c.style.justifyContent = "flex-start"; PEOPLE.forEach(p => c.appendChild(btn(p,"solid", () => { setMe(p); closeModal(); }))); m.appendChild(c); });
}
function setMe(p){ S.me = p; store.set("gacolet-moi", p); meSel.value = p; S.ui.tWho = ""; render(); }
meSel.onchange = () => setMe(meSel.value);
fromHash();
if (S.me) meSel.value = S.me;
render();
(async function connect(){
  if (!window.claude || !window.claude.use){ S.failed = "Connexion au serveur impossible. Recharge la page."; render(); return; }
  let db = null, user = null;
  try { [db, user] = await Promise.all([window.claude.use("db"), window.claude.use("user")]); } catch(e){}
  if (!db){ S.failed = "Connexion au serveur impossible. Recharge la page."; render(); return; }
  S.db = db;
  window.claude.use("assets").then(a => { S.assets = a || null; }).catch(() => {});
  if (user){ try { S.isOwner = await user.isOwner(); } catch(e){} try { S.canWrite = await user.can("data.write"); } catch(e){} }
  if (!S.me){ if (S.isOwner){ S.me = "Gabriel"; meSel.value = "Gabriel"; } else askWho(); }
  COLLS.forEach(c => {
    db.collection(c).onSnapshot(snap => {
      S.d[c] = snap.docs.filter(d => d.exists).map(d => Object.assign({id: d.id}, d.data()));
      S.got[c] = true; if (!S.ready && COLLS.every(x => S.got[x])) S.ready = true;
      renderSoon();
    }, err => { S.failed = "Connexion perdue : les modifications reprendront dès le retour du réseau."; renderSoon(); });
  });
  setTimeout(() => { if (!S.ready){ S.ready = true; renderSoon(); } }, 8000);
})();
})();
