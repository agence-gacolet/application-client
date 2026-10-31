/* Gacolet Gestion : écrans (repris du gestionnaire de l’agence). */
(function(){
"use strict";

/* ---------- Constantes ---------- */
let PEOPLE = ["Gabriel","Matis","Clara"];
let OWNERS = ["Gabriel","Matis","Clara","À attribuer"];
const POLES = [["00","DIRECTION & DIVERS"],["10","STRATÉGIE & CONSEIL"],["20","PRODUCTION"],["30","GRAPHISME & IMPRESSION"],["40","RÉSEAUX SOCIAUX"],["50","PUBLICITÉ"],["60","WEB & RÉFÉRENCEMENT"]];
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
  ["accueil","Accueil"],["agenda","Agenda"],["taches","Tâches"],["messagerie","Messagerie"],["vocal","Vocal"],["commercial","Commercial"],["clients","Calendrier clients"],
  ["montage","Prêt à monter"],["publications","Publications"],["campagnes","Campagnes"],["formation","Formation"],["parametres","Paramètres"],["fiches","Tableau clients"],["idees","Idées clients"],["focus","Focus"]
];
const NAV_GROUPS = [["",["accueil"]],["Au quotidien",["agenda","taches","messagerie","vocal","focus"]],["Gestion",["fiches","commercial","publications","idees"]],["Meta",["campagnes"]],["Ressources",["formation"]],["Compte",["parametres"]]];
/* Onglets fusionnés : le calendrier clients vit dans l’agenda, le montage dans les tâches. */
const MERGED = { clients: ["agenda","agHub"], montage: ["taches","tHub"] };
/* Rôles : ce que chaque siège voit. Le serveur applique les mêmes limites aux données. */
const ROLE_LABEL = {owner:"Propriétaire", member:"Membre", commercial:"Commercial"};
/* Poste : le métier de la personne (affiché), distinct du rôle (les droits). */
const POSTES = ["Directeur","Direction","Responsable communication","Responsable vidéo","Commercial","Vidéaste","Monteur","Community manager","Graphiste","Chargé de communication","Photographe","Alternant","Stagiaire"];
function posteInput(id, value){ const i = el("input"); i.id = id; i.value = value || ""; i.placeholder = "Ex. Vidéaste"; i.maxLength = 60; const dl = el("datalist"); dl.id = id + "-l"; POSTES.forEach(x => { const o = el("option"); o.value = x; dl.appendChild(o); }); i.setAttribute("list", dl.id); return [i, dl]; }
const ROLE_VIEWS = {
  member: ["accueil","agenda","taches","messagerie","vocal","focus","formation","parametres"],
  commercial: ["accueil","agenda","taches","messagerie","vocal","focus","commercial","clients","montage","publications","idees","campagnes","formation","parametres"]
};
const canSee = k => !S.role || S.role === "owner" || (ROLE_VIEWS[S.role] || []).includes(k);
const COLLS = ["events","tasks","commercial","campaigns","rushes","publications","clients","cevents","keydates","posts","edtodo","meta","messages","formations","msheets","idees"];

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
const hhmm = d => d.getHours() + " h" + (d.getMinutes() ? " " + String(d.getMinutes()).padStart(2,"0") : "");
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
  if (L.has("tasks")) openTasks().forEach(t => { if (!isISO(t.date)) return; const late = lateDays(t.date) > 0; out.push({k:"tasks", date: t.date, client:t.client, label:t.title, who:[t.who], ref:t, cls:"ev k-task"+(late?" late":""), meta:"Tâche, "+t.who, tag:late ? lateDays(t.date)+" j de retard" : "Tâche"}); });
  if (L.has("relances")) S.d.commercial.forEach(c => { if (!isISO(c.nextDate)) return; out.push({k:"relances", date:c.nextDate, client:c.company, label:c.nextAction||"Relance", who:["Gabriel"], ref:c, cls:"ev k-relance", meta:"Commercial, "+(c.stage||""), tag:c.kind}); });
  if (L.has("cevents")) S.d.cevents.forEach(e => { if (!isISO(e.date)) return; out.push({k:"cevents", date:e.date, client:e.client, label:e.subject, who:["Clara"], ref:e, cls:"ev k-cevent", meta:"Temps fort, préparer avant le "+fmtD(prepBy(e)), tag:e.piste ? "Piste" : (e.done ? "Fait" : "Temps fort")}); });
  if (L.has("keydates")) S.d.keydates.forEach(k => { if (!isISO(k.date)) return; out.push({k:"keydates", date:k.date, client:"", label:k.label, who:[], ref:k, cls:"ev k-keydate", meta:k.forWhom||"", tag:"Date clé"}); });
  if (L.has("posts")){
    S.d.posts.forEach(p => { if (!isISO(p.date)) return; out.push({k:"posts", date:p.date, client:AGENCE, label:(p.type||"")+(p.client ? ", "+shortName(p.client) : ""), who:[postWho(p)], ref:p, cls:"ev k-post"+(postLate(p) ? " late" : ""), meta:["Com de l’agence", p.format, p.client, p.status].filter(Boolean).join(", "), tag:postLate(p) ? "Montage en retard" : p.status}); });
    S.d.edtodo.forEach(x => { if (x.done || !isISO(x.date)) return; const late = lateDays(x.date) > 0; out.push({k:"edtodo", date:x.date, client:AGENCE, label:x.title, who:x.who ? [x.who] : [], ref:x, cls:"ev k-task"+(late?" late":""), meta:"Com de l’agence, à faire"+(x.who ? ", "+x.who : ""), tag:late ? lateDays(x.date)+" j de retard" : "À faire"}); });
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
    facts: [["Type", c.kind],["Étape", c.stage],["Prochaine action", c.nextAction],["Date", c.nextDate ? fmtDL(c.nextDate)+(late ? ", "+late+" j de retard" : "") : ""],["Dernier contact", c.lastContact],["J0", fmtFR(c.j0)],["Relance", c.relance],["Contact", c.contact],["Compte rendu", c.report],["Notes", c.notes]],
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
  openForm({ key:"cor", title:"Compte rendu, "+c.company, intro:"Note l’échange. Utilise ensuite les boutons pour programmer la suite.", values:{txt:""},
    fields:[{k:"txt",label:"Échange",type:"textarea",rows:4,req:"Écris le compte rendu."}],
    onCancel: () => openCommercial(c),
    onSave: o => patch("commercial", c.id, {report: stamp(o.txt) + (c.report ? "\n" + c.report : ""), lastContact: stamp(o.txt)}) });
}
function editCommercial(c){
  openForm({ key:"co", title: c.id ? "Modifier, "+c.company : "Nouveau prospect", values: Object.assign({kind:"Prospect", relance:""}, c),
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
  openForm({ key:"ca", title: k.id ? "Campagne, "+k.client : "Nouvelle campagne", values: Object.assign({status:"À lancer"}, k),
    fields:[{k:"client",label:"Client",list:clientNames(),req:"Indique le client."},{k:"status",label:"Statut",type:"select",options:CAMP_STATUS,half:true},{k:"budget",label:"Budget",half:true,ph:"Ex. 500 € / mois"},
      {k:"launchedAt",label:"Lancée le",type:"date",half:true},{k:"link",label:"Suivi des contacts (lien)",half:true,ph:"https://"},{k:"note",label:"À savoir",type:"textarea"}],
    onDelete: k.id ? () => remove("campaigns", k.id) : null,
    onSave: out => save("campaigns", k.id || null, Object.assign(k.id ? strip(k) : {order:999}, out)) });
}

/* Prêt à monter */
function editRush(r){
  openForm({ key:"ru", title: r.id ? "Montage, "+r.client : "Retour de tournage", intro: r.id ? "" : "Une ligne par tournage dont les rushs attendent le montage.", values: Object.assign({status:"À monter", shotAt:today()}, r),
    fields:[{k:"client",label:"Client",list:clientNames(),half:true,req:"Indique le client."},{k:"shotAt",label:"Tourné le",type:"date",half:true},
      {k:"content",label:"Ce qui a été tourné",type:"textarea",rows:2},{k:"editor",label:"Qui monte",type:"select",options:[["","À préciser"],["Matis","Matis"],["Clara","Clara"]],half:true,req:"Dis qui monte."},
      {k:"status",label:"Statut",type:"select",options:RUSH_STATUS,half:true},{k:"link",label:"Lien des rushs",ph:"https://"},{k:"note",label:"À savoir",type:"textarea"}],
    onDelete: r.id ? () => remove("rushes", r.id) : null,
    onSave: out => save("rushes", r.id || null, Object.assign(r.id ? strip(r) : {}, out)) });
}

/* Publications */
function editPub(p){
  openForm({ key:"pu", title:"Publications, "+p.client, values:p,
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
    facts:[["Date", fmtDL(e.date)+" "+(e.date||"").slice(0,4)],["À faire", e.todo],["Préparer avant le", pb ? fmtDL(pb)+(pb < today() && !e.done ? ", en retard" : "") : ""],["Piste", e.piste ? "Idée à valider avec le client" : ""],["Fait", e.done ? "Oui" : "Non"],["Note", e.note]],
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
/* Services vendus : gestion des réseaux sociaux, publicité Meta, ou les deux. Les anciennes fiches (codes 10 à 60) sont relues ainsi. */
const SERVICES = [["com","Gestion des réseaux sociaux","Réseaux sociaux"],["meta","Publicité Meta","Meta"]];
const svOf = c => { const o = {}; Object.entries(c.services || {}).forEach(([k, v]) => { const n = k === "meta" || k === "50" ? "meta" : "com"; if (!(n in o) || (v && (!o[n] || v < o[n]))) o[n] = v || o[n] || ""; }); return o; };
function editClient(c){
  const sv = svOf(c); const vals = Object.assign({}, c); SERVICES.forEach(([k]) => { vals["sv"+k] = k in sv; vals["sd"+k] = sv[k] || ""; });
  const svFields = []; SERVICES.forEach(([k, l]) => { svFields.push({k:"sv"+k, label:l, type:"check", half:true}); svFields.push({k:"sd"+k, label:"Depuis le", type:"date", half:true}); });
  openForm({ key:"cf", title: c.id ? "Fiche, "+c.name : "Nouveau client", values:vals,
    fields:(c.id ? [] : [{k:"name",label:"Nom du client",req:"Indique le nom du client."}]).concat([{k:"since",label:"Client depuis le",type:"date"}]).concat(svFields).concat([{k:"formula",label:"Formule"},{k:"perMonth",label:"Publications / mois"},{k:"shoot",label:"Tournage",half:true},{k:"networks",label:"Réseaux",half:true},
      {k:"tel",label:"Téléphone",type:"tel",half:true},{k:"email",label:"Courriel",type:"email",half:true},{k:"site",label:"Site internet",half:true,ph:"https://"},{k:"instagram",label:"Instagram",half:true,ph:"@compte ou lien"},{k:"facebook",label:"Facebook",half:true,ph:"Lien de la page"},{k:"tiktok",label:"TikTok",half:true,ph:"@compte ou lien"},{k:"linkedin",label:"LinkedIn",half:true,ph:"Lien de la page"},{k:"youtube",label:"YouTube",half:true,ph:"Lien de la chaîne"},{k:"google",label:"Fiche Google",ph:"Lien de la fiche"},
      {k:"remember",label:"À retenir",type:"textarea"},{k:"ask",label:"À demander au client",type:"textarea"},{k:"leadWeeks",label:"Préparer combien de semaines avant",type:"number",half:true},{k:"color",label:"Couleur dans l’agenda",type:"color",half:true}]),
    onSave: out => { const services = {}; SERVICES.forEach(([k]) => { if (out["sv"+k]) services[k] = out["sd"+k] || ""; delete out["sv"+k]; delete out["sd"+k]; }); out.services = services;
      if (!c.id){ const n = String(out.name || "").trim(); if (S.d.clients.some(x => x.name.toLowerCase() === n.toLowerCase())){ toast("Ce client existe déjà."); return Promise.reject(new Error("doublon")); } out.name = n; out.calendar = true; }
      return save("clients", c.id || null, Object.assign(c.id ? strip(c) : {}, out)); } });
}
/* Coordonnées et réseaux d’un client : pastilles cliquables */
const NET_ICO = {
  tel:'<path d="M6.6 3.5h3l1.4 4.2-2 1.3a12 12 0 0 0 6 6l1.3-2 4.2 1.4v3a2 2 0 0 1-2.1 2A17 17 0 0 1 4.6 5.6a2 2 0 0 1 2-2.1z"/>',
  email:'<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>',
  site:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.6 2.6 14.4 0 17M12 3.5c-2.6 2.6-2.6 14.4 0 17"/>',
  instagram:'<rect x="4" y="4" width="16" height="16" rx="4.5"/><circle cx="12" cy="12" r="3.6"/><circle cx="16.8" cy="7.2" r=".6" fill="currentColor"/>',
  facebook:'<path d="M14.5 20v-7h2.4l.4-2.8h-2.8V8.5c0-.8.3-1.4 1.4-1.4h1.5V4.6a19 19 0 0 0-2.2-.1c-2.2 0-3.6 1.3-3.6 3.7v2H9.2V13h2.4v7"/>',
  tiktok:'<path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5M14 4c.4 2.4 2 4 4.5 4.2"/>',
  linkedin:'<rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8 10.5V16M8 7.8v.1M11.5 16v-5.5M11.5 13c0-1.6 1-2.5 2.2-2.5s2.1.8 2.1 2.5V16"/>',
  youtube:'<rect x="3.5" y="6" width="17" height="12" rx="3.5"/><path d="m10.5 9.5 4 2.5-4 2.5z"/>',
  google:'<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>'
};
const NET_LAB = { tel:"Appeler", email:"Écrire", site:"Site internet", instagram:"Instagram", facebook:"Facebook", tiktok:"TikTok", linkedin:"LinkedIn", youtube:"YouTube", google:"Fiche Google" };
function netUrl(k, v){
  v = String(v || "").trim(); if (!v) return "";
  if (k === "tel") return "tel:" + v.replace(/[^\d+]/g, "");
  if (k === "email") return "mailto:" + v;
  if (/^https?:\/\//i.test(v)) return v;
  const h = v.replace(/^@/, "");
  if (k === "instagram") return "https://www.instagram.com/" + h;
  if (k === "tiktok") return "https://www.tiktok.com/@" + h;
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(v)) return "https://" + v;
  if (k === "facebook") return "https://www.facebook.com/" + h;
  return "";
}
function netLinks(c, big){
  const box = el("div","net" + (big ? " big" : ""));
  Object.keys(NET_ICO).forEach(k => { const u = netUrl(k, c[k]); if (!u) return;
    const a = el("a","net-a net-" + k); a.href = u; if (!/^(tel|mailto):/.test(u)){ a.target = "_blank"; a.rel = "noopener"; }
    a.title = NET_LAB[k] + " : " + c[k]; a.setAttribute("aria-label", a.title); a.onclick = e => e.stopPropagation();
    a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + NET_ICO[k] + '</svg>'; box.appendChild(a); });
  return box;
}
function vFiches(root){
  root.appendChild(head("Tableau clients", "Réservé aux propriétaires : depuis quand, quels services, la formule et ce qu’il faut penser.", [addBtn("Nouveau client", () => editClient({}))]));
  const f = el("div","filters ag-f"); const g = el("div","fgroup"); const lb = el("label","flabel","Service"); lb.htmlFor = "fi-sv"; const sel = el("select","pick"); sel.id = "fi-sv";
  [["","Tous les services"],["com","Réseaux sociaux"],["meta","Publicité Meta"],["both","Réseaux sociaux et Meta"]].forEach(([v,l]) => { const o = el("option",null,l); o.value = v; sel.appendChild(o); }); sel.value = S.ui.fiSv || ""; sel.onchange = () => { S.ui.fiSv = sel.value; remember(); render(); };
  g.append(lb, sel); f.appendChild(g); root.appendChild(f);
  const list = S.d.clients.filter(c => c.name !== AGENCE && (!S.ui.fiSv || (S.ui.fiSv === "both" ? ("com" in svOf(c) && "meta" in svOf(c)) : S.ui.fiSv in svOf(c)))).sort((a,b) => (a.since || "9999").localeCompare(b.since || "9999") || a.name.localeCompare(b.name,"fr"));
  const {w, tb} = table(["Client","Depuis","Services","Contact et réseaux","~Formule","~Publications / mois","~À penser"]);
  const line = (tr, txt, cls) => { const c = td(tr, txt ? el("span","fi-1", txt) : el("span","muted","—"), cls); if (txt) c.title = txt; return c; };
  list.forEach(c => { const tr = el("tr","row fi-row"); tr.onclick = () => editClient(c);
    td(tr, clientTag(c.name),"nw"); td(tr, c.since ? fmtFR(c.since) : "—","nw");
    const so = svOf(c), ks = SERVICES.map(x => x[0]).filter(k => k in so), sv = el("div","fi-sv");
    ks.forEach(k => { const s = SERVICES.find(x => x[0] === k); const p = el("b","fi-code",s[2]); p.title = s[1] + (so[k] ? ", depuis " + fmtFR(so[k]) : ""); sv.appendChild(p); });
    if (!ks.length) sv.appendChild(el("span","muted","À renseigner"));
    td(tr, sv,"nw"); const nl = netLinks(c); if (!nl.childNodes.length) nl.appendChild(el("span","muted","À renseigner")); td(tr, nl,"nw"); line(tr, c.formula, "hm"); line(tr, c.perMonth, "hm"); line(tr, [c.remember, c.ask ? "À demander : " + c.ask : ""].filter(Boolean).join(" "), "hm");
    tb.appendChild(tr); });
  w.classList.add("fi-tw");
  root.appendChild(list.length ? w : el("p","empty","Aucun client pour ce service."));
  root.appendChild(el("p","status", plural(list.length,"client")+". Clique sur une ligne pour voir et modifier toute la fiche : tournage, réseaux, à penser."));
}

/* Éditorial agence */
function openPost(p){
  openFacts({ title: fmtDL(p.date)+", "+p.type, client:p.client,
    facts:[["Format", p.format],["Secteur", p.sector],["Carton", p.carton],["Story du jour", postStory(p)],["Republication", postRepost(p)],["Qui", postWho(p)],["À remettre le", postDue(p) ? fmtDL(postDue(p))+(postLate(p) ? ", en retard" : "") : ""],["Statut", p.status],["Film en ligne", p.filmOnline ? "Oui" : "Non"],["Notes", p.notes]],
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
  const me = S.me || "Gabriel", t0 = today(), now = new Date(), hr = now.getHours(), wd = now.getDay(), t1 = addDays(t0, 1);
  const weekend = wd === 0 || wd === 6, evening = hr >= 18;
  const evOf = d => S.d.events.filter(e => e.date === d && e.status !== "Annulé" && (!(e.who||[]).length || (e.who||[]).includes(me))).sort((a,b) => (a.time||"99").localeCompare(b.time||"99"));
  const evs = evening || weekend ? evOf(t1) : evOf(t0);
  const hello = hr < 5 ? "Bonne nuit" : hr < 12 ? "Bonjour" : hr < 14 ? "Bon appétit" : hr < 18 ? "Bon après-midi" : "Bonsoir";
  let say;
  if (weekend) say = "C’est le week-end, rien ne presse. Profite.";
  else if (hr < 5) say = "Il est tard. Le meilleur travail se fait après une bonne nuit.";
  else if (hr < 12) say = wd === 1 ? "Nouvelle semaine, page blanche. Le café d’abord, le reste suivra." : wd === 5 ? "Vendredi. Dernière ligne droite, on finit la semaine en beauté." : "Le café d’abord, le reste suivra.";
  else if (hr < 14) say = "Une vraie pause, puis on reprend tranquillement.";
  else if (hr < 18) say = wd === 5 ? "Encore quelques heures et c’est le week-end." : "Encore un bel après-midi devant toi.";
  else say = "La journée touche à sa fin. Beau travail aujourd’hui.";
  if (evs.length){ const e = evs[0]; const what = e.type === "Tournage" ? "tournage chez " + e.client : e.type === "Rendez-vous" ? "rendez-vous avec " + e.client : e.client; say += " " + (evening || weekend ? "Demain" : "Aujourd’hui") + ", " + what + (e.time ? " à " + fmtTime(e.time) : "") + "."; }
  const W = el("section","welcome2");
  const mug = document.createElement("div"); mug.className = "w2-mug"; mug.setAttribute("aria-hidden","true");
  mug.innerHTML = '<svg viewBox="0 0 64 64"><path class="st" d="M24 6c-3 4 3 6 0 10M32 4c-3 4 3 6 0 10M40 6c-3 4 3 6 0 10"/><path d="M12 24h36v14a14 14 0 0 1-14 14h-8a14 14 0 0 1-14-14z"/><path d="M48 28h3a7 7 0 0 1 0 14h-4"/><path d="M8 58h44"/></svg>';
  W.appendChild(mug);
  const dl = fmtDL(t0); W.appendChild(el("p","w2-date", dl.charAt(0).toUpperCase()+dl.slice(1)));
  const h1 = el("h1","w2-h"); h1.append(document.createTextNode(hello + " "), el("span", null, me)); W.appendChild(h1);
  W.appendChild(el("p","w2-say", say));
  const t14 = addDays(t0, 14), t7 = addDays(t0, 7);
  const myTasks = openTasks().filter(t => t.who === me && (!isISO(t.date) || t.date <= t7)).length;
  const tiles = [];
  if (S.role && S.role !== "owner"){ if (S.role === "commercial") tiles.push([S.d.commercial.filter(c => isISO(c.nextDate) && c.nextDate <= t0).length, "relances", () => go("commercial")]); }
  else if (me === "Matis"){
    tiles.push([S.d.rushes.filter(r => r.status !== "Monté" && (r.editor === "Matis" || !r.editor)).length, "montages", () => go("montage")]);
    tiles.push([S.d.events.filter(e => e.type === "Tournage" && e.status === "Prévu" && e.date >= t0 && e.date <= t7).length, "tournages cette semaine", () => go("agenda")]);
  } else if (me === "Clara"){
    tiles.push([S.d.posts.filter(p => postWho(p) === "Clara" && !POST_DONE.includes(p.status) && p.date >= t0 && p.date <= t14).length, "posts à préparer", () => { S.ui.agClient = AGENCE; go("agenda"); }]);
    tiles.push([S.d.cevents.filter(e => !e.done && prepBy(e) && prepBy(e) <= t14 && e.date >= t0).length, "temps forts clients", () => { S.ui.ccTab = "soon"; go("clients"); }]);
  } else {
    tiles.push([S.d.commercial.filter(c => isISO(c.nextDate) && c.nextDate <= t0).length, "relances", () => go("commercial")]);
    tiles.push([S.d.campaigns.filter(c => c.status === "À lancer").length, "campagnes à lancer", () => go("campagnes")]);
  }
  ["main","shoot"].forEach(md => { const pre = md === "shoot" ? "tg:" : "", chs = msgChannels(md);
    const isC = k => k.startsWith(pre + "c:") || k.replace(/^tg:/, "").startsWith("cg:") || k.startsWith("cdm:");
    const team = chs.filter(k => !isC(k)), cli = chs.filter(isC);
    const nt = team.reduce((n, k) => n + unreadIn(k), 0), nc = cli.reduce((n, k) => n + unreadIn(k), 0), fc = cli.find(k => unreadIn(k));
    const open = k => () => { S.ui.msgMode = md; if (md === "shoot") S.ui.msgShoot = k; else S.ui.msgCh = k; remember(); go("messagerie"); };
    const sfx = md === "shoot" ? ", tournage" : "";
    if (nt) tiles.push([nt, (nt > 1 ? "messages équipe" : "message équipe") + sfx, open(team[0])]);
    if (nc) tiles.push([nc, (nc > 1 ? "messages clients" : "message client") + sfx, open(fc)]); });
  tiles.push([myTasks, "tâches cette semaine", () => { S.ui.tWho = me; go("taches"); }]);
  W.appendChild(el("h2","w2-lab", hr >= 18 || weekend ? "Pour la suite" : "Ta journée en bref"));
  const s = el("div","w2-tiles");
  tiles.forEach(([n, l, f], i) => { const t = el("button","w2-tile" + (n ? "" : " zero")); t.style.animationDelay = (0.45 + i*0.08) + "s"; t.append(el("b",null,String(n)), el("span",null,l)); if (!n) t.appendChild(el("i",null,"C’est calé")); t.onclick = f; s.appendChild(t); });
  W.appendChild(s); root.appendChild(W);
}

/* ---------- Tâches ---------- */
function vTaches(root){
  const who = S.ui.tWho || S.me || "Gabriel";
  const list = who === "Terminées" ? null : S.d.tasks.filter(t => (who === "Tous" || t.who === who) && !t.done);
  const counts = Object.fromEntries(OWNERS.map(p => [p, openTasks().filter(t => t.who === p).length])); counts["Tous"] = openTasks().length; counts["Terminées"] = S.d.tasks.filter(t => t.done).length;
  root.appendChild(head("Tâches", "Une tâche, une seule personne. Une tâche cochée part dans les archives.", [addBtn("Ajouter une tâche", () => editTask({}))]));
  const f = el("div","filters"); f.appendChild(chipBar(OWNERS.concat(["Tous","Terminées"]).map(p => [p, p === "Terminées" ? "Archives" : p]), who, v => { S.ui.tWho = v; remember(); render(); }, counts)); root.appendChild(f);
  if (who === "Terminées"){
    const done = S.d.tasks.filter(t => t.done).sort((a,b) => (b.doneAt||"").localeCompare(a.doneAt||""));
    const {w, tb} = table(["Terminée le","Personne","Client","Tâche","Note",""]);
    if (!done.length) root.appendChild(el("p","empty","Aucune tâche archivée."));
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
      td(tr, checkbox(t.done, v => patch("tasks", t.id, {done:v, doneAt: v ? today() : ""}).then(() => v && toast("Tâche faite, rangée dans les archives."))));
      td(tr, clientTag(t.client),"nw hm"); mo(td(tr, t.title,"ttl w"), [t.client, n ? n+" j de retard" : ""].filter(Boolean).join(", ")); td(tr, t.date ? fmtD(t.date) : "—","nw"); td(tr, n ? n+" j" : "","nw hm"); td(tr, el("div","note",t.note),"hm");
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
  root.appendChild(head("Commercial", plural(due,"action due","actions dues")+" aujourd’hui ou en retard, rythme de relance J+3, J+7, J+14, J+30", [addBtn("Nouveau prospect", () => editCommercial({}))]));
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
  const CATS = [["En cours","EN COURS"],["À lancer","À LANCER"],["Arrêtée","ARRÊTÉES"]];
  const cur = CATS.some(c => c[0] === S.ui.cpStatus) ? S.ui.cpStatus : "";
  { const f = el("div","filters ag-f"); const g = el("div","fgroup"); const lb = el("label","flabel","Statut"); lb.htmlFor = "cp-status"; const s = el("select","pick"); s.id = "cp-status";
    [["","Toutes les campagnes"],["En cours","En cours"],["À lancer","À lancer"],["Arrêtée","Arrêtées"]].forEach(([v,l]) => { const n = v ? S.d.campaigns.filter(c => c.status === v).length : S.d.campaigns.length; const o = el("option",null,l+" ("+n+")"); o.value = v; s.appendChild(o); });
    s.value = cur; s.onchange = () => { S.ui.cpStatus = s.value; remember(); render(); }; g.append(lb, s); f.appendChild(g); root.appendChild(f); }
  const {w, tb} = table(["Client","Statut","Budget","Lancée le","À savoir","Suivi"]);
  CATS.filter(c => !cur || c[0] === cur).forEach(([k,label]) => {
    const rows = S.d.campaigns.filter(c => c.status === k).sort((a,b) => (a.order||0)-(b.order||0)); if (!rows.length) return;
    band(tb, label, rows.length, 6);
    rows.forEach(c => { const tr = el("tr","row"); tr.onclick = () => editCampaign(c);
      td(tr, clientTag(c.client),"nw");
      const sel = el("select","inl"); CAMP_STATUS.forEach(x => { const o = el("option",null,x); o.value = x; sel.appendChild(o); }); sel.value = c.status; sel.disabled = !writable(); sel.onclick = e => e.stopPropagation(); sel.onchange = () => patch("campaigns", c.id, {status:sel.value}).then(() => toast("Campagne passée en « "+sel.value+" ». Pense à la fiche 50_PUBLICITE."));
      td(tr, sel); td(tr, c.budget,"nw"); td(tr, fmtFR(c.launchedAt),"nw"); td(tr, el("div","note",c.note));
      const l = linkNode(c.link, "Contacts"); if (l instanceof Node) l.onclick = e => e.stopPropagation(); td(tr, l);
      tb.appendChild(tr); });
  });
  root.appendChild(S.d.campaigns.some(c => !cur || c.status === cur) ? w : el("p","empty", cur ? "Aucune campagne dans cette catégorie." : "Aucune campagne pour l’instant."));
}

/* ---------- Meta : une page par client ---------- */
let META_LOAD = 0;
function loadMeta(force){
  if ((S.meta && !force) || META_LOAD) return; META_LOAD = 1;
  GC.api("GET","/api/g-meta").then(r => { S.meta = r; }).catch(e => { S.meta = { clients: [], leads: [], error: e.message }; }).finally(() => { META_LOAD = 0; render(); });
}
const CAMP_RANK = { "En cours":0, "À lancer":1, "Arrêtée":2 };
/* Tableaux de suivi copiés depuis Google Sheets par Make (lecture seule, mis à jour automatiquement) */
const msBase = n => norm(n).replace(/\s*\(.*\)\s*$/, "").replace(/\s+/g, " ").trim();
const sheetsOf = name => (S.d.msheets || []).filter(x => msBase(x.client) === msBase(name) || norm(x.client) === norm(name));
const TAB_RANK = t => /^contacts$/i.test(t) ? 0 : /factur/i.test(t) ? 1 : /r[ée]cap/i.test(t) ? 2 : /mode d/i.test(t) ? 9 : 5;
const msDate = v => { const s = String(v || "").trim(); let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); if (m) return m[3] + "-" + m[2].padStart(2,"0") + "-" + m[1].padStart(2,"0"); m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : ""; };
const msStatusCol = h => { const i = h.findIndex(x => /^statut final$/i.test(x)); if (i >= 0) return i; const j = h.findIndex(x => /^statut$/i.test(x)); if (j >= 0) return j; return h.findIndex(x => /^suite$/i.test(x)); };
const msTone = v => /^(qualifié|commande|signé|oui$)/i.test(v) ? "ok" : /^(non qualifié|exclu|pas de commande|sans suite|non$)/i.test(v) ? "l2" : v ? "l3" : "";
function msContacts(name){
  const sh = sheetsOf(name).find(x => /^contacts$/i.test(x.tab)); if (!sh || !sh.rows || !sh.rows.length) return null;
  const h = sh.rows[0], rows = sh.rows.slice(1).filter(r => r.some(v => v !== "")), di = h.findIndex(x => /^reçu le$/i.test(x)), si = msStatusCol(h);
  return { sh, h, rows, date: r => di >= 0 ? msDate(r[di]) : "", status: r => si >= 0 ? r[si] : "" };
}
function msStats(name, month){
  const c = msContacts(name); if (!c) return null;
  const lm = c.rows.filter(r => c.date(r).slice(0, 7) === month), real = r => !/^exclu/i.test(c.status(r));
  return { month: lm.filter(real).length, qualified: lm.filter(r => /^(qualifié|commande)/i.test(c.status(r))).length, last: c.rows.map(c.date).filter(Boolean).sort().pop() || "" };
}
function msCell(v, tone){ if (tone && v) return el("span","pill" + (tone === "ok" ? " ok" : tone === "l2" ? " l2" : " l3"), v); const s = el("span","ms-c", v); if (v && v.length > 28) s.title = v; return s; }
function msRowCard(h, r, title){
  openModal(m => { const t = el("h3",null,title); t.id = "mtitle"; m.appendChild(t); const dl = el("dl","ms-dl");
    h.forEach((k, i) => { if (!k || r[i] === "" || r[i] == null) return; dl.append(el("dt",null,k), el("dd",null,r[i])); }); m.appendChild(dl);
    const a = el("div","actions"); a.appendChild(btn("Fermer","", () => closeModal())); m.appendChild(a); });
}
function msSection(root, name){
  const all = sheetsOf(name).sort((a, b) => TAB_RANK(a.tab) - TAB_RANK(b.tab) || a.tab.localeCompare(b.tab, "fr"));
  if (!all.length) return false;
  const key = "msTab:" + msBase(name), cur = all.find(x => x.tab === S.ui[key]) || all[0];
  const bar = el("div","ms-tabs"); all.forEach(x => { const b = el("button",null, x.tab); b.type = "button"; b.setAttribute("aria-selected", String(x === cur)); b.onclick = () => { S.ui[key] = x.tab; remember(); render(); }; bar.appendChild(b); });
  root.appendChild(bar);
  const rows = (cur.rows || []).filter(r => r.some(v => v !== ""));
  if (/mode d/i.test(cur.tab)){ const box = el("div","ms-doc"); rows.forEach(r => { const t = r.filter(Boolean).join(" "); const p = el("p", /^[A-ZÀ-Ý][^.:]{0,40}$/.test(t) ? "ms-dh" : null, t); box.appendChild(p); }); root.appendChild(box); }
  else if (/^contacts$|factur/i.test(cur.tab) && rows.length){
    const h = rows[0]; let data = rows.slice(1);
    const used = h.map((_, i) => data.some(r => r[i] !== "")), si = msStatusCol(h);
    const tools = el("div","filters ag-f");
    const q = el("input","search"); q.type = "search"; q.id = "ms-q"; q.placeholder = "Chercher un nom, un numéro, une commune"; q.value = S.ui.msQ || ""; q.oninput = () => { S.ui.msQ = q.value; renderSoon(); }; tools.appendChild(q);
    if (si >= 0){ const vals = [...new Set(data.map(r => r[si]).filter(Boolean))].sort(); const g = el("div","fgroup"); const lb = el("label","flabel", h[si]); lb.htmlFor = "ms-st"; const sel = el("select","pick"); sel.id = "ms-st";
      [["","Tous (" + data.length + ")"]].concat(vals.map(v => [v, v + " (" + data.filter(r => r[si] === v).length + ")"])).forEach(([v, l]) => { const o = el("option",null,l); o.value = v; sel.appendChild(o); });
      sel.value = vals.includes(S.ui.msSt) ? S.ui.msSt : ""; sel.onchange = () => { S.ui.msSt = sel.value; remember(); render(); }; g.append(lb, sel); tools.appendChild(g); }
    root.appendChild(tools);
    const t = norm(S.ui.msQ); if (t) data = data.filter(r => norm(r.join(" ")).includes(t));
    if (si >= 0 && S.ui.msSt && data.some(r => r[si] === S.ui.msSt)) data = data.filter(r => r[si] === S.ui.msSt);
    const so = S.ui.msSort && S.ui.msSort.tab === cur.tab ? S.ui.msSort : null;
    if (so && so.col < h.length){ const num = v => { const x = parseFloat(String(v).replace(/\s/g, "").replace(",", ".")); return isNaN(x) ? null : x; };
      data = data.slice().sort((a, b) => { const A = a[so.col], B = b[so.col], da = msDate(A), db = msDate(B), na = num(A), nb = num(B);
        const r = da && db ? da.localeCompare(db) || String(A).localeCompare(String(B)) : na != null && nb != null ? na - nb : String(A).localeCompare(String(B), "fr"); return so.dir * r; }); }
    else data = data.slice().reverse();
    const w = el("div","tw ms-tw"); const tb = el("table","t ms-t"); const trh = el("tr");
    h.forEach((k, i) => { if (!used[i]) return; const th = el("th", i < 3 ? "ms-stick s" + i : null, k + (so && so.col === i ? (so.dir > 0 ? " ↑" : " ↓") : "")); th.onclick = () => { S.ui.msSort = { tab: cur.tab, col: i, dir: so && so.col === i ? -so.dir : 1 }; remember(); render(); }; trh.appendChild(th); });
    const th0 = el("thead"); th0.appendChild(trh); tb.appendChild(th0); const body = el("tbody");
    data.forEach(r => { const tr = el("tr","row"); tr.onclick = () => msRowCard(h, r, (r[2] || r[1] || "Ligne") + (r[0] ? ", n° " + r[0] : ""));
      h.forEach((k, i) => { if (!used[i]) return; const c = el("td", i < 3 ? "ms-stick s" + i : null); c.appendChild(msCell(r[i], i === si ? msTone(r[i]) : "")); tr.appendChild(c); }); body.appendChild(tr); });
    tb.appendChild(body); w.appendChild(tb);
    root.appendChild(data.length ? w : el("p","empty", rows.length > 1 ? "Aucune ligne ne correspond." : "Aucune ligne pour l’instant."));
  } else {
    const w = el("div","tw ms-tw"); const tb = el("table","t ms-t ms-grid"); const body = el("tbody");
    const hi = rows.findIndex(r => r.filter(Boolean).length >= 3 && r.every(v => String(v).length <= 40));
    rows.forEach((r, ri) => { const tr = el("tr", ri === hi ? "ms-hr" : null); const n = Math.max(...rows.map(x => { let k = x.length; while (k && x[k - 1] === "") k--; return k; }));
      for (let i = 0; i < n; i++){ const c = el(ri === hi ? "th" : "td"); c.appendChild(msCell(r[i] || "")); tr.appendChild(c); } body.appendChild(tr); });
    tb.appendChild(body); w.appendChild(tb); root.appendChild(w);
  }
  const st = el("p","status","Copie du tableau Google Sheets, mise à jour automatiquement" + (cur.syncedAt ? " (dernière mise à jour le " + fmtFR(cur.syncedAt.slice(0, 10)) + " à " + fmtTime(cur.syncedAt.slice(11, 16)) + ", heure UTC)" : "") + ". Le client et l’agence continuent de remplir le Sheets. ");
  if (cur.url){ const a = el("a",null,"Ouvrir le Sheets"); a.href = cur.url; a.target = "_blank"; a.rel = "noopener"; st.appendChild(a); }
  root.appendChild(st);
  return true;
}
function vMeta(root){
  loadMeta();
  const M = S.meta || { clients: [], leads: [] };
  const base = n => norm(n).replace(/\s*\(.*\)\s*$/, "").trim();
  const mc = n => M.clients.find(c => norm(c.name) === norm(n)) || M.clients.find(c => base(c.name) === base(n));
  const names = [...new Set(S.d.campaigns.map(c => c.client).filter(Boolean).concat(M.clients.map(c => c.name)).concat((S.d.msheets || []).filter(x => !S.d.campaigns.some(c => msBase(c.client) === msBase(x.client))).map(x => x.client)))]
    .sort((a, b) => { const ra = Math.min(...S.d.campaigns.filter(c => c.client === a).map(c => CAMP_RANK[c.status] ?? 3), 3), rb = Math.min(...S.d.campaigns.filter(c => c.client === b).map(c => CAMP_RANK[c.status] ?? 3), 3); return ra - rb || a.localeCompare(b, "fr"); });
  const cur = names.includes(S.ui.mtTab) ? S.ui.mtTab : "";
  const month = today().slice(0, 7);
  const leadsOf = n => { const c = mc(n); return c ? M.leads.filter(l => l.client_id === c.id) : []; };

  /* Onglets : vue d’ensemble puis un onglet par client */
  const tabs = el("div","mt-tabs"); tabs.setAttribute("role","tablist");
  [["","Vue d’ensemble"]].concat(names.map(n => [n, n])).forEach(([v, l]) => {
    const b = el("button",null); b.type = "button"; b.setAttribute("role","tab"); b.setAttribute("aria-selected", String(v === cur));
    if (v){ const d = el("span","dot"); d.style.setProperty("--c", colorOf(v)); b.appendChild(d); if (S.d.campaigns.some(c => c.client === v && c.status === "En cours")) b.classList.add("live"); }
    b.appendChild(document.createTextNode(l)); b.onclick = () => { S.ui.mtTab = v; remember(); render(); }; tabs.appendChild(b); });

  requestAnimationFrame(() => { const s = tabs.querySelector("[aria-selected=true]"); if (s) tabs.scrollLeft = s.offsetLeft - tabs.offsetLeft - tabs.clientWidth / 2 + s.offsetWidth / 2; });
  if (!cur){
    root.appendChild(head("Meta", "Publicité Meta, un onglet par client. Le budget est payé par le client directement à Meta.", [addBtn("Nouvelle campagne", () => editCampaign({}))]));
    root.appendChild(tabs);
    const {w, tb} = table(["Client","Campagne","Budget","~Contacts ce mois","~Qualifiés ce mois","~Dernier contact"]);
    names.forEach(n => {
      const cs = S.d.campaigns.filter(c => c.client === n).sort((a, b) => (CAMP_RANK[a.status] ?? 3) - (CAMP_RANK[b.status] ?? 3));
      const top = cs[0], ls = leadsOf(n), lm = ls.filter(l => (l.date || "").slice(0, 7) === month), c = mc(n), ms = msStats(n, month);
      const tr = el("tr","row"); tr.onclick = () => { S.ui.mtTab = n; remember(); render(); };
      td(tr, clientTag(n),"nw");
      td(tr, top ? el("span","pill" + (top.status === "En cours" ? " ok" : top.status === "Arrêtée" ? " l2" : ""), top.status + (cs.length > 1 ? " (" + cs.length + ")" : "")) : el("span","muted","Aucune"),"nw");
      td(tr, top ? top.budget || "—" : "—","nw");
      td(tr, ms ? String(ms.month) : c ? lm.length + (c.goal ? " / " + c.goal : "") : "—","nw hm");
      td(tr, ms ? String(ms.qualified) : c ? String(lm.filter(l => l.qualified === 1).length) : "—","nw hm");
      td(tr, ms && ms.last ? fmtD(ms.last) : ls[0] ? fmtD(ls[0].date) : "—","nw hm");
      tb.appendChild(tr); });
    root.appendChild(names.length ? w : el("p","empty","Aucune campagne pour l’instant."));
    if (M.error) root.appendChild(el("p","status","Suivi des contacts indisponible : " + M.error));
    else root.appendChild(el("p","status","Contacts : ceux de l’espace client (module Meta). Ouvre un client pour le détail."));
    return;
  }

  const c = mc(cur), cs = S.d.campaigns.filter(x => x.client === cur).sort((a, b) => (CAMP_RANK[a.status] ?? 3) - (CAMP_RANK[b.status] ?? 3));
  const ls = leadsOf(cur), lm = ls.filter(l => (l.date || "").slice(0, 7) === month);
  const tools = [addBtn("Nouvelle campagne", () => editCampaign({ client: cur }))];
  if (c) tools.push(btn("Ajouter un contact","", () => addLead(c)));
  root.appendChild(head(cur, "Publicité Meta, budget payé par le client directement à Meta.", tools));
  root.appendChild(tabs);

  const k = el("div","mt-kpis");
  const kpi = (v, l) => { const b = el("div","mt-kpi"); b.append(el("b",null,v), el("span",null,l)); k.appendChild(b); };
  const live = cs.filter(x => x.status === "En cours");
  kpi(String(live.length), live.length > 1 ? "campagnes en cours" : "campagne en cours");
  kpi(live[0] ? live[0].budget || "—" : "—", "budget en cours");
  const ms = msStats(cur, month);
  kpi(ms ? String(ms.month) : c ? lm.length + (c.goal ? " / " + c.goal : "") : "—", "contacts ce mois");
  kpi(ms ? String(ms.qualified) : c ? String(lm.filter(l => l.qualified === 1).length) : "—", ms ? "qualifiés ou commandes ce mois" : "qualifiés ce mois");
  root.appendChild(k);

  root.appendChild(el("h3","mt-h","Campagnes"));
  if (cs.length){
    const {w, tb} = table(["Statut","Budget","Lancée le","À savoir","Suivi"]);
    cs.forEach(x => { const tr = el("tr","row"); tr.onclick = () => editCampaign(x);
      const sel = el("select","inl"); CAMP_STATUS.forEach(v => { const o = el("option",null,v); o.value = v; sel.appendChild(o); }); sel.value = x.status; sel.disabled = !writable(); sel.onclick = e => e.stopPropagation(); sel.onchange = () => patch("campaigns", x.id, {status:sel.value}).then(() => toast("Campagne passée en « "+sel.value+" »."));
      td(tr, sel); td(tr, x.budget,"nw"); td(tr, fmtFR(x.launchedAt),"nw"); td(tr, el("div","note",x.note));
      const l = linkNode(x.link, "Tableau"); if (l instanceof Node) l.onclick = e => e.stopPropagation(); td(tr, l); tb.appendChild(tr); });
    root.appendChild(w);
  } else root.appendChild(el("p","empty","Aucune campagne pour ce client."));

  root.appendChild(el("h3","mt-h","Suivi des contacts"));
  { const gs = cs.map(x => x.link).concat(sheetsOf(cur).map(x => x.url)).find(u => /^https:\/\/docs\.google\.com\/spreadsheets\/d\//.test(u || ""));
    if (gs){ const id = gs.match(/\/d\/([\w-]+)/)[1], src = "https://docs.google.com/spreadsheets/d/" + id + "/edit?rm=minimal";
      const box = el("div","gs-box"); const fr = document.createElement("iframe"); fr.src = src; fr.title = "Tableau de suivi " + cur; fr.loading = "lazy"; fr.allow = "clipboard-read; clipboard-write"; box.appendChild(fr); root.appendChild(box);
      /* Souris sur le tableau : seule la feuille défile ; souris à côté : la page défile. */
      const lock = on => document.documentElement.classList.toggle("gs-lock", on);
      box.onmouseenter = () => lock(true); box.onmouseleave = () => lock(false); fr.onmouseleave = () => lock(false);
      const st = el("p","status","Le vrai tableau Google Sheets, modifiable ici. Il faut être connecté au compte Google de l’agence dans ce navigateur. "); const a = el("a",null,"Ouvrir dans Google Sheets"); a.href = "https://docs.google.com/spreadsheets/d/" + id + "/edit"; a.target = "_blank"; a.rel = "noopener"; st.appendChild(a); root.appendChild(st); return; } }
  if (msSection(root, cur)) return;
  if (!c){ root.appendChild(el("p","empty","Ce client n’a pas le module Meta dans l’espace client : le suivi passe par le lien de la campagne.")); return; }
  root.appendChild(el("p","status", c.qualifiedDef ? "Contact qualifié : " + c.qualifiedDef : "Pas encore de définition écrite du contact qualifié : à fixer avec le client avant d’annoncer un chiffre."));
  if (!ls.length){ root.appendChild(el("p","empty","Aucun contact enregistré.")); return; }
  const {w, tb} = table(["Date","Contact","~Détail","Qualifié"]);
  let mo2 = "";
  ls.forEach(l => { const m = (l.date || "").slice(0, 7); if (m !== mo2){ mo2 = m; const d = parseISO(l.date); band(tb, (MONTHS[d.getMonth()] + " " + d.getFullYear()).toUpperCase(), ls.filter(x => (x.date || "").slice(0, 7) === m).length, 4); }
    const tr = el("tr","row"); td(tr, fmtD(l.date),"nw"); td(tr, l.title,"ttl w"); td(tr, el("div","note",l.detail),"hm");
    const s2 = segm([[1,"Oui"],[0,"Non"],[null,"À voir"]], l.qualified === 1 ? 1 : l.qualified === 0 ? 0 : null, async v => { if (!writable()) return; try { await GC.api("PATCH","/api/g-meta/lead/" + l.id, { qualified: v }); l.qualified = v; render(); } catch(e){ toast(e.message); } });
    s2.style.transform = "scale(.88)"; s2.style.transformOrigin = "left center"; td(tr, s2,"nw"); tb.appendChild(tr); });
  root.appendChild(w);
}
function addLead(c){
  openForm({ key:"ld", title: "Nouveau contact, " + c.name, values: { date: today() },
    fields:[{k:"date",label:"Date",type:"date",half:true,req:"Indique la date."},{k:"title",label:"Contact",half:true,ph:"Nom, ou objet de la demande",req:"Indique le contact."},{k:"detail",label:"Détail",type:"textarea"}],
    onSave: async out => { try { await GC.api("POST","/api/g-meta/lead", Object.assign({ clientId: c.id }, out)); } catch(e){ toast(e.message); throw e; } loadMeta(true); } });
}

/* ---------- Prêt à monter ---------- */
function vMontage(root){
  root.appendChild(head("Montage", "Les tournages dont les rushs attendent le montage.", [addBtn("Retour de tournage", () => editRush({client:S.ui.ruClient||""}))]));
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
  root.appendChild(head("Publications", "Chaque client réseaux face à son volume prévu du mois, "+total+" prévues, rempli chaque matin depuis Metricool, stories exclues"));
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
    const tr = el("tr","band"); const c = el("td"); c.colSpan = 7; c.textContent = "TOTAL PAR MOIS : "+sum[0]+" PUBLICATIONS, DONT "+sum[1]+" RÉELS, "+sum[2]+" LINKEDIN, "+sum[3]+" TOURNAGES"; tr.appendChild(c); tb.appendChild(tr);
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
    R.appendChild(t);
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
  root.appendChild(head([MONTHS[d0.getMonth()], String(d0.getFullYear())], "Compte Instagram de l’agence, 7 publications par semaine et des stories tous les jours",
    [segm(months.map(x => { const d = parseISO(x+"-01"); return [x, MONTHS[d.getMonth()].replace(/^./, c => c.toUpperCase())]; }), m, v => { S.ui.edMonth = v; remember(); render(); }), addBtn("Ajouter", () => editPost({date:m+"-01"}))]));
  const st = el("div","stats"); const late = rows.filter(postLate).length;
  [[rows.filter(p => p.type === "Réel").length,"réels"],[rows.filter(p => p.type === "Carrousel").length,"carrousels"],[rows.filter(p => p.type === "Vidéo publicitaire").length,"vidéos publicitaires"],[rows.filter(p => p.status === "Publié").length+" / "+rows.length,"publiés"]].forEach(([n,l]) => { const s = el("div","stat"); s.append(el("b",null,String(n)), el("span",null,l)); st.appendChild(s); });
  root.appendChild(st);
  if (late) root.appendChild(el("p","status", plural(late,"montage")+" en retard : date de remise passée, ni Monté, ni Relu, ni Programmé, ni Publié."));
  const {w, tb} = table(["Date","Type","~Format","~Client","~Story du jour","~Qui","À remettre le","Statut","~Film en ligne","~Notes"]);
  rows.forEach(p => { const tr = el("tr","row"+(p.status === "Publié" ? " pub" : postLate(p) ? " r3" : "")); tr.onclick = () => openPost(p);
    td(tr, dow(p.date).slice(0,3)+". "+fmtD(p.date),"nw"); mo(td(tr, p.type,"nw ttl"), [p.client, postWho(p)].filter(Boolean).join(", ")); td(tr, p.format,"nw hm"); td(tr, clientTag(p.client),"nw hm"); td(tr, el("div","note",postStory(p)),"hm w");
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
  const mid = el("span"); mid.append(el("div","lt", (i.client ? i.client+" : " : "")+i.label), el("div","lm", [i.meta, i.who.join(", ")].filter(Boolean).join(", ")));
  r.appendChild(mid); r.appendChild(el("span","pill tag", i.tag || ""));
  r.onclick = () => openItem(i); return r;
}
function newOnDay(k){ if (!writable()) return; editEvent({date:k, client:S.ui.agClient||"", type: S.ui.agTypes.length === 1 ? S.ui.agTypes[0] : "Tournage", who: S.ui.agWho ? [S.ui.agWho] : [], status:"Prévu"}); }
function vAgenda(root){
  const cur = agCursor(), y = cur.getFullYear(), m = cur.getMonth(), t0 = today(), v = S.ui.agView;
  let title = [MONTHS[m], String(y)];
  let monday, sunday;
  if (v === "week"){ const base = parseISO(S.ui.agSel); monday = new Date(base); monday.setDate(base.getDate()-((base.getDay()+6)%7)); sunday = new Date(monday); sunday.setDate(monday.getDate()+6);
    title = [monday.getDate()+(monday.getMonth() !== sunday.getMonth() ? " "+MONTHS[monday.getMonth()].slice(0,4)+"." : "")+" au "+sunday.getDate(), MONTHS[sunday.getMonth()]]; }
  const step = dir => { if (v === "week"){ S.ui.agSel = addDays(S.ui.agSel, 7*dir); const s = parseISO(S.ui.agSel); S.ui.agCursor = new Date(s.getFullYear(), s.getMonth(), 1); } else { S.ui.agCursor = new Date(y, m+dir, 1); const s = parseISO(S.ui.agSel); if (s.getMonth() !== S.ui.agCursor.getMonth() || s.getFullYear() !== S.ui.agCursor.getFullYear()) S.ui.agSel = iso(S.ui.agCursor); } render(); };
  const prev = btn("‹","icon", () => step(-1)); prev.setAttribute("aria-label","Période précédente");
  const next = btn("›","icon", () => step(1)); next.setAttribute("aria-label","Période suivante");
  root.appendChild(head(title, "Agenda de l’agence", [prev, btn("Aujourd’hui","", () => { S.ui.agSel = t0; S.ui.agCursor = null; render(); }), next,
    segm([["month","Mois"],["week","Semaine"],["list","Liste"]], v, x => { S.ui.agView = x; remember(); render(); }), addBtn("Ajouter", () => newOnDay(S.ui.agSel))]));
  root.lastChild.classList.add("ag-head");
  /* Filtres : quatre menus déroulants */
  const f = el("div","filters ag-f");
  const dd = (id, label, opts, val, on) => { const g = el("div","fgroup"); const lb = el("label","flabel",label); lb.htmlFor = id; const s = el("select","pick"); s.id = id;
    opts.forEach(([v,l]) => { const o = el("option",null,l); o.value = v; s.appendChild(o); }); s.value = val; s.onchange = () => { on(s.value); remember(); render(); }; g.append(lb, s); f.appendChild(g); };
  dd("ag-client","Client", [["","Tous les clients"]].concat(clientNames().map(n => [n,n])), S.ui.agClient, x => { S.ui.agClient = x; if (x === AGENCE && !S.ui.agLayers.includes("posts")) S.ui.agLayers = S.ui.agLayers.concat("posts"); });
  dd("ag-who","Qui", [["","Tout le monde"]].concat(PEOPLE.map(p => [p,p])), S.ui.agWho, x => { S.ui.agWho = x; });
  /* Un seul menu « Afficher » : tout, un type d’événement, ou une autre catégorie */
  const allL = LAYERS.map(x => x[0]);
  const curShow = S.ui.agLayers.length === 1 && S.ui.agLayers[0] === "events" && S.ui.agTypes.length === 1 ? "ev:" + S.ui.agTypes[0] : S.ui.agLayers.length === 1 && S.ui.agLayers[0] !== "events" ? S.ui.agLayers[0] : S.ui.agLayers.length === 1 ? "events" : "";
  { const g = el("div","fgroup"); const lb = el("label","flabel","Afficher"); lb.htmlFor = "ag-show"; const s = el("select","pick"); s.id = "ag-show";
    const opt = (p, v, l) => { const o = el("option",null,l); o.value = v; p.appendChild(o); };
    opt(s, "", "Tout");
    const g1 = document.createElement("optgroup"); g1.label = "Événements"; opt(g1, "events", "Tous les événements"); EV_TYPES.forEach(t => opt(g1, "ev:"+t, t === "Tournage" ? "Tournages" : t === "Rendez-vous" ? "Rendez-vous" : t)); s.appendChild(g1);
    const g2 = document.createElement("optgroup"); g2.label = "Autres"; LAYERS.filter(x => x[0] !== "events").forEach(([k,l]) => opt(g2, k, l)); s.appendChild(g2);
    s.value = curShow;
    s.onchange = () => { const x = s.value;
      if (!x){ S.ui.agLayers = allL.slice(); S.ui.agTypes = EV_TYPES.slice(); }
      else if (x === "events"){ S.ui.agLayers = ["events"]; S.ui.agTypes = EV_TYPES.slice(); }
      else if (x.startsWith("ev:")){ S.ui.agLayers = ["events"]; S.ui.agTypes = [x.slice(3)]; }
      else { S.ui.agLayers = [x]; S.ui.agTypes = EV_TYPES.slice(); }
      remember(); render(); };
    g.append(lb, s); f.appendChild(g); }
  root.appendChild(f);
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
  if (S.ui.agClient === AGENCE) agAgence(root, iso(new Date(y, m, 1)).slice(0,7));
}
/* Com de l'agence : ce qui était l'onglet Éditorial agence, affiché quand le filtre Client est sur Agence Gacolet */
function agAgence(root, m){
  const h0 = el("h2","sec","Com de l’agence"); h0.appendChild(el("small",null,"compte Instagram, 7 publications par semaine et des stories tous les jours")); root.appendChild(h0);
  const rows = S.d.posts.filter(p => (p.date||"").slice(0,7) === m);
  const st = el("div","stats"); const late = S.d.posts.filter(postLate).length;
  [[rows.filter(p => p.type === "Réel").length,"réels"],[rows.filter(p => p.type === "Carrousel").length,"carrousels"],[rows.filter(p => p.type === "Vidéo publicitaire").length,"vidéos publicitaires"],[rows.filter(p => p.status === "Publié").length+" / "+rows.length,"publiés"]].forEach(([n,l]) => { const s = el("div","stat"); s.append(el("b",null,String(n)), el("span",null,l)); st.appendChild(s); });
  root.appendChild(st);
  if (late) root.appendChild(el("p","status", plural(late,"montage")+" en retard : date de remise passée, ni Monté, ni Relu, ni Programmé, ni Publié."));
  const tl0 = el("div","filters"); tl0.appendChild(addBtn("Publication", () => editPost({date: S.ui.agSel && S.ui.agSel.slice(0,7) === m ? S.ui.agSel : m+"-01"}))); root.appendChild(tl0);
  edExtras(root);
}

/* ---------- Messagerie ---------- */
const CHANNELS = [["general","Général"]];
const MSG_ROLE = {Gabriel:["main","shoot"], Clara:["main"], Matis:["shoot"]};
function dmKey(a, b){ return "dm:" + [a, b].sort().join("|"); }
function dmOther(k){ const me = S.me || "Gabriel"; return String(k).slice(3).split("|").find(n => n !== me) || me; }
function dmChannels(){ const me = S.me || "Gabriel"; const set = new Set((S.ui.dmOpen || []).filter(k => k.startsWith("dm:") && k.slice(3).split("|").includes(me))); S.d.messages.forEach(m => { if (String(m.ch).startsWith("dm:") && m.ch.slice(3).split("|").includes(me)) set.add(m.ch); }); return [...set]; }
function cgChannels(){ return (S.cgroups || []).map(g => g.ch); }
/* Conversations privées ouvertes par un client avec moi : « cdm:<id client>|<mon nom> » */
function cdmChannels(){ const me = S.me || "Gabriel"; const set = new Set((S.ui.cdmOpen || []).filter(k => k.endsWith("|" + me))); S.d.messages.forEach(m => { const k = String(m.ch || ""); if (k.startsWith("cdm:") && k.split("|")[1] === me) set.add(k); }); return [...set]; }
function cdmClient(k){ const g = (S.cgroups || []).find(x => x.id === Number(String(k).slice(4).split("|")[0])); return g ? g.name : "Client"; }
function cgOf(k){ return (S.cgroups || []).find(g => g.ch === k); }
async function loadCgroups(){ try { const r = await GC.api("GET","/api/g-cgroups"); S.cgroups = r.groups || []; renderSoon(); } catch(e){} }
function msgChannels(mode){ const pre = mode === "shoot" ? "tg:" : ""; return CHANNELS.map(c => pre + c[0]).concat(mode === "shoot" ? [] : dmChannels()).concat(mode === "shoot" ? cgChannels().map(k => "tg:" + k) : cgChannels().concat(cdmChannels())).concat(clientNames().filter(n => n !== AGENCE).map(n => pre + "c:" + n)); }
function seenKey(k){ return "seen_" + (S.me || "Gabriel") + "_" + k; }
function unreadIn(k){ const me = S.me || "Gabriel", s = S.ui[seenKey(k)] || ""; return S.d.messages.filter(m => m.ch === k && m.who !== me && (m.at || "") > s).length; }
function unreadMode(mode){ return msgChannels(mode).reduce((n, k) => n + unreadIn(k), 0); }
function unreadRole(){ return ["main","shoot"].reduce((n, m) => n + unreadMode(m), 0); }
function shootLabel(e){ return fmtD(e.date) + ", " + e.client; }
function chName(k){ if (String(k).startsWith("dm:")) return dmOther(k); if (String(k).startsWith("cdm:")) return cdmClient(k); if (String(k).replace(/^tg:/, "").startsWith("cg:")){ const g = cgOf(String(k).replace(/^tg:/, "")); return g ? g.name : "Groupe client"; } k = k.replace(/^tg:/, ""); const c = CHANNELS.find(x => x[0] === k); return c ? c[1] : k.replace(/^c:/, ""); }
/* ---------- Messages vocaux ---------- */
let REC = null;
const AUDIO_EL = new Map();
function recLabel(){ const t = REC ? Math.floor((Date.now() - REC.start) / 1000) : 0; return Math.floor(t / 60) + ":" + String(t % 60).padStart(2, "0"); }
async function recStart(ch){
  if (!navigator.mediaDevices || !window.MediaRecorder){ toast("Le micro n’est pas disponible sur cet appareil."); return; }
  let stream; try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch(e){ toast("Accès au micro refusé. Autorise-le dans les réglages du navigateur."); return; }
  const type = ["audio/webm;codecs=opus","audio/mp4","audio/webm"].find(t => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || "";
  const mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
  const r = { mr, chunks: [], start: Date.now(), ch, stream, cancel: false };
  mr.ondataavailable = e => { if (e.data && e.data.size) r.chunks.push(e.data); };
  mr.onstop = async () => {
    clearInterval(r.timer); r.stream.getTracks().forEach(t => t.stop()); REC = null; render();
    const dur = Math.round((Date.now() - r.start) / 1000);
    if (r.cancel || !r.chunks.length || dur < 1) return;
    const mime = (r.mr.mimeType || "audio/webm").split(";")[0];
    const file = new File(r.chunks, "vocal" + (mime.includes("mp4") ? ".m4a" : ".webm"), { type: mime });
    let wave = null; try { wave = await peaksOf(file); } catch(e){}
    try { if (!S.assets) throw new Error("x"); toast("Envoi du vocal…"); const up = await S.assets.upload(file);
      await save("messages", null, Object.assign({ ch: r.ch, text: "", audio: up.url, dur, who: S.me || "Gabriel", at: new Date().toISOString() }, wave ? { wave } : {})); }
    catch(e){ toast("Le vocal n’a pas pu être envoyé."); }
  };
  REC = r; mr.start(1000);
  r.timer = setInterval(() => { const el2 = document.getElementById("rec-time"); if (el2) el2.textContent = recLabel(); if (Date.now() - r.start > 5 * 60000) recStop(false); }, 250);
  render();
}
function recStop(cancel){ if (!REC) return; REC.cancel = !!cancel; try { REC.mr.stop(); } catch(e){} }
const fmtS = s => Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
function wavePeaks(buf, n){ const d = buf.getChannelData(0), step = Math.max(1, Math.floor(d.length / n)), out = [];
  for (let i = 0; i < n; i++){ let s = 0; for (let j = i * step; j < (i + 1) * step && j < d.length; j++) s += d[j] * d[j]; out.push(Math.sqrt(s / step)); }
  const mx = Math.max(...out) || 1; return out.map(v => Math.round(v / mx * 100) / 100); }
async function peaksOf(src){ const ab = src instanceof Blob ? await src.arrayBuffer() : await (await fetch(src)).arrayBuffer();
  const C = window.AudioContext || window.webkitAudioContext; const ctx = new C();
  try { const buf = await new Promise((res, rej) => ctx.decodeAudioData(ab, res, rej)); return wavePeaks(buf, 40); } finally { try { ctx.close(); } catch(e){} } }
function audioFor(m){
  let w = AUDIO_EL.get(m.id); if (w) return w;
  const N = 40, PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>', PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>';
  w = el("div","vw"); const a = document.createElement("audio"); a.preload = "metadata"; a.src = m.audio;
  const play = el("button","vw-play"); play.type = "button"; play.setAttribute("aria-label","Écouter le vocal"); play.innerHTML = PLAY;
  const bars = el("div","vw-bars"); for (let i = 0; i < N; i++) bars.appendChild(el("span"));
  const tm = el("span","vw-time", fmtS(m.dur || 0));
  const total = () => isFinite(a.duration) && a.duration > 0 ? a.duration : (m.dur || 1);
  const setPeaks = pk => [...bars.children].forEach((b, i) => { b.style.height = (4 + Math.round((pk[i] == null ? .1 : pk[i]) * 26)) + "px"; });
  setPeaks(m.wave || Array(N).fill(.15)); if (!m.wave) peaksOf(m.audio).then(setPeaks).catch(() => {});
  let raf; const draw = () => { const k = Math.round(Math.min(1, a.currentTime / total()) * N); [...bars.children].forEach((b, i) => b.classList.toggle("on", i < k));
    tm.textContent = fmtS(a.paused && a.currentTime === 0 ? (m.dur || 0) : a.currentTime); if (!a.paused) raf = requestAnimationFrame(draw); };
  play.onclick = () => { if (a.paused){ document.querySelectorAll(".vw audio").forEach(x => { if (x !== a) x.pause(); }); a.play().catch(() => toast("Lecture impossible sur cet appareil.")); } else a.pause(); };
  a.onplay = () => { play.innerHTML = PAUSE; w.classList.add("playing"); draw(); };
  a.onpause = () => { play.innerHTML = PLAY; w.classList.remove("playing"); cancelAnimationFrame(raf); draw(); };
  a.onended = () => { try { a.currentTime = 0; } catch(e){} draw(); };
  bars.onclick = e => { const r = bars.getBoundingClientRect(); try { a.currentTime = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * total(); } catch(_){} draw(); };
  w.append(play, bars, tm, a); AUDIO_EL.set(m.id, w); return w;
}
/* ---------- Avatars ---------- */
const AV_COLORS = ["#C6FF33","#5AC8FA","#FF9F5A","#C49BFF","#4CD9A0","#FF6B8B","#F5D04C","#7AA7FF"];
function avColor(s){ let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AV_COLORS[h % AV_COLORS.length]; }
function initials(s){ const w = String(s || "?").replace(/\(.*?\)/g, " ").replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/); return ((w[0] || "?")[0] + (w.length > 1 ? w[w.length - 1][0] : "")).toUpperCase(); }
function personAvatar(name){ const t = (S.team || []).find(x => x.name === name); return t && t.avatar ? t.avatar : ""; }
function avatarEl(name, size, opts){
  opts = opts || {};
  const a = el("span","av"); a.style.width = a.style.height = size + "px"; a.style.fontSize = Math.round(size * .38) + "px";
  const src = opts.src != null ? opts.src : personAvatar(name);
  if (opts.logo){ a.classList.add("av-logo"); a.innerHTML = '<svg viewBox="140 158 561 281" aria-hidden="true"><path transform="matrix(1,0,0,-1,700.5803,436.46803)" d="M0 0-147.532-1.615-193.477 45.57-273.888 22.275-261.335 93.466-366.182 35.258-183.556 179.076Z"/><path transform="matrix(1,0,0,-1,232.1747,348.0155)" d="M0 0V0L-91.997-90.068 179.263 118.781 271.552 107.27 190.836 189.479 31.32 30.024"/></svg>'; return a; }
  if (src){ const i = document.createElement("img"); i.src = src; i.alt = ""; i.loading = "lazy"; a.appendChild(i); return a; }
  const c = opts.color || avColor(name); a.textContent = initials(name);
  if (opts.soft){ a.classList.add("av-soft"); a.style.color = c; a.style.background = "color-mix(in srgb, " + c + " 20%, #141413)"; a.style.borderColor = "color-mix(in srgb, " + c + " 35%, transparent)"; }
  else a.style.background = c;
  return a;
}
function chAvatar(k, size){ if (String(k).startsWith("dm:")) return avatarEl(dmOther(k), size); if (String(k).startsWith("cdm:") || String(k).replace(/^tg:/, "").startsWith("cg:")){ const n = chName(k); return avatarEl(n, size, { src: "", color: colorOf(n) }); } const base = String(k).replace(/^tg:/, ""); if (base.startsWith("c:")){ const n = base.slice(2); return avatarEl(n, size, { src: "", color: colorOf(n), soft: true }); } return avatarEl("Équipe", size, { logo: true }); }

/* ---------- Pièces jointes ---------- */

const isImg = f => /^image\//.test(f.type || "") || /\.(jpe?g|png|gif|webp|heic)$/i.test(f.name || "");
const isVid = f => /^video\//.test(f.type || "") || /\.(mp4|mov|webm|m4v)$/i.test(f.name || "");
function msgPreview(m){
  if (m.audio) return "Message vocal";
  const f = m.files || [];
  if (f.length && !m.text) return f.length > 1 ? f.length + " fichiers" : isImg(f[0]) ? "Photo" : isVid(f[0]) ? "Vidéo" : f[0].name;
  return String(m.text || "");
}
function attachEl(f){
  if (isImg(f)){ const a = el("a","wa-img"); a.href = f.url; a.target = "_blank"; a.rel = "noopener"; const i = document.createElement("img"); i.src = f.url; i.alt = f.name || "Photo"; i.loading = "lazy"; a.appendChild(i); return a; }
  if (isVid(f)){ const v = document.createElement("video"); v.className = "wa-vid"; v.src = f.url; v.controls = true; v.preload = "metadata"; v.playsInline = true; return v; }
  const a = el("a","wa-file"); a.href = f.url; a.target = "_blank"; a.rel = "noopener"; a.setAttribute("download", f.name || "");
  const ic = el("span","wa-fic", (String(f.name || "").split(".").pop() || "").slice(0, 4).toUpperCase() || "FICHIER");
  const tx = el("span","wa-ftx"); tx.append(el("b",null,f.name || "Fichier"), el("small",null,(f.size ? fmtSize(f.size) : "") + (f.size ? ", " : "") + "Télécharger"));
  a.append(ic, tx); return a;
}
let PENDING = { ch: "", files: [], busy: 0 };
async function addFiles(ch, list){
  if (!S.assets){ toast("Envoi de fichiers indisponible."); return; }
  if (PENDING.ch !== ch) PENDING = { ch, files: [], busy: 0 };
  for (const file of list){
    if (file.size > 300 * 1048576){ toast(file.name + " dépasse 300 Mo."); continue; }
    const item = { name: file.name, type: file.type, size: file.size, url: "", local: (isImg(file) ? URL.createObjectURL(file) : "") };
    PENDING.files.push(item); PENDING.busy++; render();
    try { const r = await S.assets.upload(file); item.url = r.url; item.type = r.contentType || file.type; item.size = r.sizeBytes || file.size; }
    catch(e){ PENDING.files = PENDING.files.filter(x => x !== item); toast("« " + file.name + " » n’a pas pu être envoyé."); }
    PENDING.busy--; render();
  }
}

/* ---------- Messagerie (façon messagerie de téléphone) ---------- */
function msgMenu(anchor, m, ch, mine){
  document.querySelectorAll(".wa-menu").forEach(x => x.remove());
  const me = S.me || "Gabriel", menu = el("div","wa-menu");
  const item = (label, fn, cls) => { const b = el("button", cls || null, label); b.type = "button"; b.onclick = e => { e.stopPropagation(); fn(b); }; menu.appendChild(b); return b; };
  item("Transférer", () => { menu.remove(); forwardMsg(m); });
  item("En faire une tâche", () => { menu.remove(); editTask({who: me, title: (m.text || (m.audio ? "Écouter le message vocal" : "Voir le fichier de " + m.who)).slice(0,120), client: ch.replace(/^tg:/, "").startsWith("c:") ? ch.replace(/^tg:/, "").slice(2) : ""}); });
  if (m.text && navigator.clipboard) item("Copier le texte", () => { navigator.clipboard.writeText(m.text).catch(() => {}); menu.remove(); });
  if (mine || S.role === "owner"){ let armed = false; item("Retirer", b => { if (!armed){ armed = true; b.textContent = "Confirmer le retrait"; return; } menu.remove(); AUDIO_EL.delete(m.id); remove("messages", m.id); }, "rm"); }
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect(), w = menu.offsetWidth, h = menu.offsetHeight;
  let x = mine ? r.right - w : r.left, y = r.bottom + 6;
  if (y + h > innerHeight - 8) y = r.top - h - 6;
  menu.style.left = Math.max(8, Math.min(x, innerWidth - w - 8)) + "px"; menu.style.top = Math.max(8, y) + "px";
  const off = e => { if (!menu.contains(e.target)){ menu.remove(); document.removeEventListener("pointerdown", off, true); } };
  setTimeout(() => document.addEventListener("pointerdown", off, true), 0);
}
function forwardMsg(m){
  const me = S.me || "Gabriel";
  const team = (S.team || []).filter(t => t.name !== me && t.role).map(t => dmKey(me, t.name));
  const grp = k => k.startsWith("dm:") ? 0 : k.startsWith("tg:") ? 3 : k.startsWith("c:") ? 2 : 1;
  const keys = [...new Set(team.concat(msgChannels("main")).concat(msgChannels("shoot")))].filter(k => k !== m.ch).sort((a, b) => grp(a) - grp(b));
  const label = k => (k.startsWith("tg:") ? "Tournage, " : "") + chName(k);
  openModal(md => {
    md.classList.add("fw-modal");
    const h = el("h3",null,"Transférer à"); h.id = "mtitle"; md.appendChild(h);
    const q = el("input"); q.type = "search"; q.placeholder = "Rechercher une conversation"; md.appendChild(q);
    const ls = el("div","fw-list"); md.appendChild(ls);
    const draw = () => { ls.textContent = ""; const t = q.value.trim().toLowerCase();
      keys.filter(k => !t || label(k).toLowerCase().includes(t)).forEach(k => {
        const b = el("button","fw-row"); b.type = "button"; const nm = el("span",null,label(k)); b.append(chAvatar(k, 36), nm);
        b.onclick = () => openModal(cm => {
          const t = el("h3",null,"Transférer ce message ?"); t.id = "mtitle"; cm.appendChild(t);
          cm.appendChild(el("p","muted","Il sera envoyé à " + label(k) + ", avec la mention « Transféré »."));
          const pv = el("div","fw-pv"); pv.textContent = m.text || (m.audio ? "Message vocal" : (m.files || []).map(f => f.name).join(", ") || "Pièce jointe"); cm.appendChild(pv);
          const a = el("div","actions"); a.append(btn("Annuler","", () => forwardMsg(m)), btn("Transférer","lemon", async () => { closeModal(); try { await save("messages", null, Object.assign({ ch: k, who: me, text: m.text || "", at: new Date().toISOString(), fwd: m.who || "1" }, m.files ? { files: m.files } : {}, m.audio ? { audio: m.audio, dur: m.dur } : {}, m.wave ? { wave: m.wave } : {})); toast("Message transféré à " + label(k)); } catch(e){} }));
          cm.appendChild(a); });
        ls.appendChild(b); }); };
    q.oninput = draw; draw();
    const act = el("div","actions"); act.appendChild(btn("Annuler","", () => closeModal())); md.appendChild(act);
  });
}
function profileCard(name){
  const me = S.me || "Gabriel", t = (S.team || []).find(x => x.name === name) || { name };
  openModal(m => {
    m.classList.add("pf-modal");
    const big = avatarEl(name, 132); big.classList.add("pf-av");
    if (t.avatar){ big.classList.add("av-click"); big.title = "Voir en grand"; big.onclick = () => window.open(t.avatar, "_blank", "noopener"); }
    const h = el("h3",null,name); h.id = "mtitle";
    m.append(big, h, el("p","pf-role", [t.poste, ROLE_LABEL[t.role]].filter(Boolean).join(", ")));
    const dl = el("dl","pf-dl");
    if (t.email){ const a = el("a",null,t.email); a.href = "mailto:" + t.email; dl.append(el("dt",null,"Courriel"), (() => { const d = el("dd"); d.appendChild(a); return d; })()); }
    if (t.tel){ const a = el("a",null,t.tel); a.href = "tel:" + t.tel.replace(/\s/g, ""); dl.append(el("dt",null,"Téléphone"), (() => { const d = el("dd"); d.appendChild(a); return d; })()); }
    if (dl.children.length) m.appendChild(dl);
    const act = el("div","actions");
    if (name !== me && t.role) act.appendChild(btn("Message privé","lemon", () => { const k = dmKey(me, name); S.ui.dmOpen = [...new Set((S.ui.dmOpen || []).concat(k))]; S.ui.msgMode = "main"; S.ui.msgCh = k; S.ui.waConv = true; remember(); closeModal(); go("messagerie"); render(); }));
    if (name === me) act.appendChild(btn("Modifier mon profil","", () => { closeModal(); S.ui.pmTab = "compte"; remember(); go("parametres"); }));
    act.appendChild(btn("Fermer","", () => closeModal()));
    m.appendChild(act);
  });
}
function newDm(){
  const me = S.me || "Gabriel";
  openModal(m => {
    const t = el("h3",null,"Nouvelle conversation privée"); t.id = "mtitle"; m.appendChild(t);
    m.appendChild(el("p","muted","Visible uniquement par vous deux."));
    const l = el("div","dm-list");
    (S.team || []).filter(x => x.name !== me).forEach(x => { const b = el("button","wa-row"); b.type = "button"; const tx = el("span","wa-rtx"); tx.append(el("b",null,x.name), el("small",null,ROLE_LABEL[x.role] || ""));
      b.append(avatarEl(x.name, 40), tx); b.onclick = () => { const k = dmKey(me, x.name); S.ui.dmOpen = [...new Set((S.ui.dmOpen || []).concat(k))]; S.ui.msgMode = "main"; S.ui.msgCh = k; S.ui.waConv = true; remember(); closeModal(); go("messagerie"); render(); }; l.appendChild(b); });
    if (!l.children.length) l.appendChild(el("p","muted","Personne d’autre dans l’équipe pour l’instant."));
    m.appendChild(l);
  });
}
function gifPicker(ch, me){
  openModal(m => {
    m.classList.add("gif-modal");
    const t = el("h3",null,"GIF"); t.id = "mtitle"; m.appendChild(t);
    const q = el("input","gif-q"); q.type = "search"; q.placeholder = "Rechercher un GIF"; m.appendChild(q);
    const grid = el("div","gif-grid"); m.appendChild(grid);
    m.appendChild(el("p","gif-by","Propulsé par GIPHY"));
    let tm = 0, seq = 0;
    const load = async () => { const my = ++seq; grid.textContent = ""; grid.appendChild(el("p","muted","Chargement…"));
      try { const r = await GC.api("GET","/api/g-gifs?q=" + encodeURIComponent(q.value.trim())); if (my !== seq) return; grid.textContent = "";
        if (!r.gifs.length) grid.appendChild(el("p","muted","Aucun GIF trouvé."));
        r.gifs.forEach(g => { const b = el("button","gif-it"); b.type = "button"; b.title = g.title || "GIF"; const i = document.createElement("img"); i.src = g.small || g.url; i.alt = g.title || "GIF"; i.loading = "lazy"; b.appendChild(i);
          b.onclick = async () => { closeModal(); try { await save("messages", null, { ch, who: me, text: "", at: new Date().toISOString(), files: [{ url: g.url, name: "GIF", type: "image/gif", gif: true }] }); } catch(e){} };
          grid.appendChild(b); }); }
      catch(x){ if (my !== seq) return; grid.textContent = ""; grid.appendChild(el("p","muted", x.message)); } };
    q.oninput = () => { clearTimeout(tm); tm = setTimeout(load, 350); };
    load(); setTimeout(() => q.focus(), 50);
  });
}
function waTime(at){ const d = new Date(at || 0), k = iso(d); if (k === today()) return hhmm(d); if (k === addDays(today(), -1)) return "Hier"; return fmtD(k); }
/* Salons vocaux intégrés : son, caméra et partage d’écran de pair à pair (WebRTC). Le serveur ne relaie que la mise en relation. */
const VOICE = [["equipe","Salon équipe","Discussions au fil de la journée"],["tournage","Salon tournage","Préparer et suivre les tournages"],["reunion","Réunion","Points d’équipe, réunions avec un client"]];
const HEADSET = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3.5" y="13.5" width="4" height="6.5" rx="1.5"/><rect x="16.5" y="13.5" width="4" height="6.5" rx="1.5"/></svg>';
const VC_ICO = {
  mic:'<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>',
  micOff:'<svg viewBox="0 0 24 24"><path d="M15 9.3V6a3 3 0 0 0-5.7-1.3M9 9v2a3 3 0 0 0 4.6 2.5M5 11a7 7 0 0 0 11.3 5.5M19 11a7 7 0 0 1-.6 2.8M12 18v3M4 4l16 16"/></svg>',
  cam:'<svg viewBox="0 0 24 24"><rect x="3" y="6.5" width="13" height="11" rx="2"/><path d="m16 10.5 5-3v9l-5-3"/></svg>',
  screen:'<svg viewBox="0 0 24 24"><rect x="3" y="4.5" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16.5V20M12 13V8M9.5 10.5 12 8l2.5 2.5"/></svg>',
  leave:'<svg viewBox="0 0 24 24"><path d="M4.5 13.5c4.6-4 10.4-4 15 0l-1.8 2.3-3-1.2v-2.2a9 9 0 0 0-5.4 0v2.2l-3 1.2z"/></svg>',
  full:'<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  unfull:'<svg viewBox="0 0 24 24"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  grid:'<svg viewBox="0 0 24 24"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/></svg>',
  spot:'<svg viewBox="0 0 24 24"><rect x="3" y="4" width="13" height="16" rx="1.5"/><rect x="18" y="4" width="3" height="4" rx=".8"/><rect x="18" y="10" width="3" height="4" rx=".8"/><rect x="18" y="16" width="3" height="4" rx=".8"/></svg>'
};
const VC = { room: "", label: "", pid: "", local: null, video: null, kind: "", muted: false, peers: new Map(), polling: false, speak: {}, chat: [], focus: "" };
S.rtc = { rooms: {} };
function voiceHere(room){ return (S.rtc.rooms[room] || []).slice(); }
let RTC_T = 0;
async function rtcState(){ try { const r = await GC.api("GET","/api/rtc/state"); const a = JSON.stringify(S.rtc.rooms); S.rtc.rooms = r.rooms || {}; if (JSON.stringify(S.rtc.rooms) !== a){ if (S.view === "vocal") render(); else renderTabs(); } } catch(e){} }
function rtcTick(){ clearTimeout(RTC_T); if (S.ready && GC.loggedIn && GC.loggedIn()) rtcState(); RTC_T = setTimeout(rtcTick, VC.room || S.view === "vocal" ? 4000 : 15000); }
const rtcSend = (to, data) => GC.api("POST","/api/rtc/signal",{ room: VC.room, pid: VC.pid, to, data }).catch(() => {});
function vcPeer(pid, name){
  if (VC.peers.has(pid)) return VC.peers.get(pid);
  const pc = new RTCPeerConnection({ iceServers: [{ urls: ["stun:stun.l.google.com:19302","stun:stun1.l.google.com:19302"] }] });
  const P = { pid, name, pc, polite: VC.pid > pid, makingOffer: false, ignoreOffer: false, stream: new MediaStream(), audio: document.createElement("audio"), vsender: null };
  P.audio.autoplay = true; P.audio.srcObject = P.stream; vcBox().appendChild(P.audio);
  VC.local.getAudioTracks().forEach(t => pc.addTrack(t, VC.local));
  if (VC.video) P.vsender = pc.addTrack(VC.video, VC.local);
  pc.ontrack = e => { if (!P.stream.getTracks().includes(e.track)) P.stream.addTrack(e.track); e.track.onended = e.track.onmute = e.track.onunmute = () => vcRender(); P.stream.onremovetrack = () => vcRender(); vcMeter(pid, P.stream); vcRender(); };
  pc.onicecandidate = e => { if (e.candidate) rtcSend(pid, { candidate: e.candidate }); };
  pc.onnegotiationneeded = async () => { try { P.makingOffer = true; await pc.setLocalDescription(); rtcSend(pid, { description: pc.localDescription }); } catch(e){} finally { P.makingOffer = false; } };
  pc.onconnectionstatechange = () => vcRender();
  VC.peers.set(pid, P); vcRender(); return P;
}
async function vcSignal(from, data){
  const P = VC.peers.get(from); if (!P) return; const pc = P.pc;
  try {
    if (data.description){
      const offerCollision = data.description.type === "offer" && (P.makingOffer || pc.signalingState !== "stable");
      P.ignoreOffer = !P.polite && offerCollision; if (P.ignoreOffer) return;
      await pc.setRemoteDescription(data.description);
      if (data.description.type === "offer"){ await pc.setLocalDescription(); rtcSend(from, { description: pc.localDescription }); }
    } else if (data.candidate){ try { await pc.addIceCandidate(data.candidate); } catch(e){ if (!P.ignoreOffer) throw e; } }
  } catch(e){ console.warn(e); }
}
function vcDrop(pid){ const P = VC.peers.get(pid); if (!P) return; try { P.pc.close(); } catch(e){} P.audio.remove(); VC.peers.delete(pid); delete VC.speak[pid]; vcRender(); }
async function vcPoll(){
  VC.polling = true; const room = VC.room, pid = VC.pid;
  while (VC.room === room && VC.pid === pid){
    try { const r = await GC.api("GET","/api/rtc/poll?room=" + room + "&pid=" + pid);
      if (r.gone){ toast("La connexion au salon a été perdue."); vcLeave(true); break; }
      for (const ev of r.events || []){
        if (ev.type === "join") vcPeer(ev.pid, ev.name);
        else if (ev.type === "leave") vcDrop(ev.pid);
        else if (ev.type === "signal"){ if (!VC.peers.has(ev.from)) continue; await vcSignal(ev.from, ev.data); }
        else if (ev.type === "chat"){ VC.chat.push({ name: ev.name, text: ev.text }); vcChat(); if (S.view !== "vocal") toast(ev.name + " : " + ev.text.slice(0, 80)); }
      }
    } catch(e){ await new Promise(r => setTimeout(r, 2000)); }
  }
  VC.polling = false;
}
let VC_AC = null;
function vcMeter(id, stream){
  if (!stream.getAudioTracks().length) return;
  try { VC_AC = VC_AC || new (window.AudioContext || window.webkitAudioContext)(); const src = VC_AC.createMediaStreamSource(stream), an = VC_AC.createAnalyser(); an.fftSize = 512; src.connect(an);
    const buf = new Uint8Array(an.frequencyBinCount);
    const tick = () => { if (!VC.room || (id !== "me" && !VC.peers.has(id))) return; an.getByteFrequencyData(buf); let s = 0; for (const v of buf) s += v; const on = s / buf.length > 18 && !(id === "me" && VC.muted);
      if (on !== !!VC.speak[id]){ VC.speak[id] = on; document.querySelectorAll('[data-vc="' + id + '"]').forEach(x => x.classList.toggle("talk", on)); } setTimeout(tick, 200); };
    tick(); } catch(e){}
}
async function vcJoin(room, label){
  if (VC.room === room){ go("vocal"); return; }
  if (VC.room) await vcLeave();
  let local; try { local = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); } catch(e){ toast("Micro refusé ou introuvable : autorise le micro pour rejoindre le salon."); return; }
  let r; try { r = await GC.api("POST","/api/rtc/join",{ room }); } catch(e){ local.getTracks().forEach(t => t.stop()); toast(e.message); return; }
  Object.assign(VC, { room, label, pid: r.pid, local, video: null, kind: "", muted: false, speak: {}, chat: [] });
  vcMeter("me", local);
  (r.peers || []).forEach(p => vcPeer(p.pid, p.name));
  vcPoll(); rtcTick(); vcRender(); if (S.view === "vocal") render();
}
async function vcLeave(silent){
  if (!VC.room) return; const room = VC.room, pid = VC.pid;
  [...VC.peers.keys()].forEach(vcDrop);
  if (VC.local) VC.local.getTracks().forEach(t => t.stop()); if (VC.video) VC.video.stop();
  Object.assign(VC, { room: "", label: "", pid: "", local: null, video: null, kind: "" });
  if (!silent) GC.api("POST","/api/rtc/leave",{ room, pid }).catch(() => {});
  vcRender(); rtcTick(); if (S.view === "vocal") render();
}
function vcMute(){ VC.muted = !VC.muted; if (VC.local) VC.local.getAudioTracks().forEach(t => { t.enabled = !VC.muted; }); vcRender(); if (S.view === "vocal") render(); }
async function vcVideo(kind){
  if (VC.kind === kind){ vcStopVideo(); return; }
  let track;
  try { const st = kind === "screen" ? await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 15 }, audio: false }) : await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } }); track = st.getVideoTracks()[0]; }
  catch(e){ if (kind !== "screen") toast("Caméra refusée ou introuvable."); return; }
  if (VC.video){ const old = VC.video; VC.local.removeTrack(old); VC.local.addTrack(track); VC.video = track; VC.peers.forEach(P => { if (P.vsender) P.vsender.replaceTrack(track); else P.vsender = P.pc.addTrack(track, VC.local); }); old.stop(); }
  else { VC.video = track; VC.local.addTrack(track); VC.peers.forEach(P => { P.vsender = P.pc.addTrack(track, VC.local); }); }
  VC.kind = kind; track.onended = () => { if (VC.video === track) vcStopVideo(); };
  vcRender(); if (S.view === "vocal") render();
}
function vcStopVideo(){
  if (!VC.video) return; const t = VC.video; VC.video = null; VC.kind = "";
  VC.peers.forEach(P => { if (P.vsender){ try { P.pc.removeTrack(P.vsender); } catch(e){} P.vsender = null; } });
  try { VC.local.removeTrack(t); } catch(e){} t.stop(); vcRender(); if (S.view === "vocal") render();
}
function vcBox(){ let b = document.getElementById("vc-audio"); if (!b){ b = el("div"); b.id = "vc-audio"; b.hidden = true; document.body.appendChild(b); } return b; }
function vcBtn(ico, label, on, fn, cls){ const b = el("button","vc-b" + (on ? " on" : "") + (cls ? " " + cls : "")); b.type = "button"; b.title = label; b.setAttribute("aria-label", label); b.innerHTML = VC_ICO[ico]; b.onclick = fn; return b; }
function vcControls(){ const c = el("div","vc-ctl");
  c.append(vcBtn(VC.muted ? "micOff" : "mic", VC.muted ? "Activer le micro" : "Couper le micro", VC.muted, vcMute, VC.muted ? "warn" : ""),
    vcBtn("cam", VC.kind === "cam" ? "Couper la caméra" : "Activer la caméra", VC.kind === "cam", () => vcVideo("cam")),
    vcBtn("screen", VC.kind === "screen" ? "Arrêter le partage d’écran" : "Partager l’écran", VC.kind === "screen", () => vcVideo("screen")),
    vcBtn(vcSpotOn() ? "grid" : "spot", vcSpotOn() ? "Tout le monde en grand" : "Mettre une image en grand", false, vcToggleSpot),
    vcBtn(vcIsFull() ? "unfull" : "full", vcIsFull() ? "Quitter le plein écran" : "Plein écran", vcIsFull(), vcFull),
    vcBtn("leave", "Quitter le salon", false, () => vcLeave(), "end"));
  return c; }
/* Plein écran et image principale : partage d’écran en grand, caméras en petit sur le côté */
function vcIsFull(){ const f = document.fullscreenElement || document.webkitFullscreenElement; return !!(f && f.id === "vc-stage"); }
function vcFull(){ const st = document.getElementById("vc-stage"); if (!st) return;
  if (vcIsFull()){ (document.exitFullscreen || document.webkitExitFullscreen).call(document); return; }
  const go = st.requestFullscreen || st.webkitRequestFullscreen; if (go){ try { const r = go.call(st); if (r && r.catch) r.catch(() => {}); } catch(e){} } }
function vcHasV(stream){ return !!(stream && stream.getVideoTracks().some(x => x.readyState === "live" && !x.muted)); }
function vcMain(){
  if (VC.focus === "grid") return "";
  if (VC.focus && (VC.focus === "me" || VC.peers.has(VC.focus))) return VC.focus;
  let m = ""; VC.peers.forEach((P, k) => { if (!m && vcHasV(P.stream)) m = k; });
  if (!m && VC.kind === "screen") m = "me";
  return m;
}
function vcSpotOn(){ return !!vcMain(); }
function vcToggleSpot(){
  if (vcSpotOn()) VC.focus = "grid";
  else { let m = ""; VC.peers.forEach((P, k) => { if (!m) m = k; }); VC.focus = m || "me"; }
  vcStage();
}
document.addEventListener("fullscreenchange", () => vcStage());
document.addEventListener("webkitfullscreenchange", () => vcStage());
/* Barre d’appel flottante, visible dans tous les onglets pendant un appel */
function vcRender(){
  let bar = document.getElementById("vc-bar");
  if (!VC.room || S.view === "vocal"){ if (bar) bar.remove(); if (S.view === "vocal" && VC.room) vcStage(); return; }
  if (!bar){ bar = el("div","vc-bar"); bar.id = "vc-bar"; document.body.appendChild(bar); }
  bar.textContent = "";
  const info = el("button","vc-info"); info.type = "button"; info.onclick = () => go("vocal");
  info.append(el("b",null,VC.label), el("small",null, VC.peers.size ? (VC.peers.size + 1) + " dans le salon" : "Seul dans le salon"));
  bar.append(info, vcControls());
}
function vcTile(id, name, stream, isMe){
  const t = el("div","vc-tile"); t.dataset.vc = id; if (VC.speak[id]) t.classList.add("talk");
  const v = stream && stream.getVideoTracks().find(x => x.readyState === "live" && !x.muted);
  if (v){ const vid = document.createElement("video"); vid.autoplay = true; vid.playsInline = true; vid.muted = true; vid.srcObject = new MediaStream([v]); if (isMe && VC.kind === "cam") vid.classList.add("mirror"); t.appendChild(vid); t.classList.add("has-v"); }
  else t.appendChild(avatarEl(name, 84));
  const lb = el("span","vc-name", name + (isMe ? " (toi)" : "")); if (isMe && VC.muted) lb.appendChild(el("i",null," micro coupé")); t.appendChild(lb);
  return t;
}
function vcStage(){
  const st = document.getElementById("vc-stage"); if (!st) return; const keep = document.getElementById("vc-in"), kv = keep ? keep.value : "", kf = keep && document.activeElement === keep; st.textContent = "";
  setTimeout(() => { const i = document.getElementById("vc-in"); if (i){ i.value = kv; if (kf) i.focus(); } }, 0);
  const me = S.me || "Gabriel"; const main = vcMain(); let grid;
  const pick = id => { VC.focus = VC.focus === id || (!VC.focus && main === id) ? "grid" : id; vcStage(); };
  const tile = (id, name, stream, isMe) => { const t = vcTile(id, name, stream, isMe); t.classList.add("pick"); t.title = "Cliquer pour mettre en grand"; t.onclick = () => pick(id); return t; };
  if (main){
    grid = el("div","vc-spot"); const big = el("div","vc-big"), side = el("div","vc-side");
    const P = main === "me" ? null : VC.peers.get(main);
    big.appendChild(main === "me" ? vcTile("me", me, VC.local, true) : vcTile(P.pid, P.name, P.stream, false));
    big.firstChild.title = "Cliquer pour revenir à la grille"; big.firstChild.onclick = () => { VC.focus = "grid"; vcStage(); };
    if (main !== "me") side.appendChild(tile("me", me, VC.local, true));
    VC.peers.forEach(Q => { if (Q.pid !== main) side.appendChild(tile(Q.pid, Q.name, Q.stream, false)); });
    grid.append(big); if (side.childNodes.length) grid.append(side); else grid.classList.add("solo");
  } else {
    grid = el("div","vc-grid n" + Math.min(VC.peers.size + 1, 6));
    grid.appendChild(tile("me", me, VC.local, true));
    VC.peers.forEach(P => grid.appendChild(tile(P.pid, P.name, P.stream, false)));
  }
  st.classList.toggle("is-full", vcIsFull());
  const hd = el("div","vc-sh"); hd.append(el("b",null,VC.label), el("span","muted", VC.peers.size ? (VC.peers.size + 1) + " personnes" : "En attente des autres"));
  const body = el("div","vc-body"); const ch = el("section","vc-chat"); ch.appendChild(el("h3",null,"Discussion du salon"));
  const ms = el("div","vc-msgs"); ms.id = "vc-msgs"; ch.appendChild(ms);
  const f = el("form","vc-cf"); const inp = el("input"); inp.id = "vc-in"; inp.placeholder = "Écrire dans le salon"; inp.maxLength = 2000; inp.autocomplete = "off"; const sb = el("button","btn sm lemon","Envoyer"); sb.type = "submit"; f.append(inp, sb);
  f.onsubmit = async e => { e.preventDefault(); const t = inp.value.trim(); if (!t || !VC.room) return; inp.value = ""; VC.chat.push({ name: me, text: t, mine: true }); vcChat(); try { await GC.api("POST","/api/rtc/chat",{ room: VC.room, pid: VC.pid, text: t }); } catch(x){} };
  ch.appendChild(f); body.append(grid, ch);
  st.append(hd, body, vcControls()); vcChat();
}
function vcChat(){ const box = document.getElementById("vc-msgs"); if (!box) return; box.textContent = "";
  if (!VC.chat.length) box.appendChild(el("p","muted","Messages visibles par les personnes présentes, effacés à la fin de l’appel."));
  VC.chat.forEach(m => { const d = el("div","vc-m" + (m.mine ? " mine" : "")); if (!m.mine) d.appendChild(el("b",null,m.name)); d.appendChild(document.createTextNode(m.text)); box.appendChild(d); }); box.scrollTop = box.scrollHeight; }
function vVocal(root){
  root.appendChild(head("Vocal", "Salons vocaux de l’agence, directement dans l’application : micro, caméra et partage d’écran."));
  if (VC.room){ const st = el("section","vc-stage"); st.id = "vc-stage"; root.appendChild(st); setTimeout(vcStage, 0); }
  const g = el("div","vx-grid");
  VOICE.forEach(([k, l, sub]) => { const here = voiceHere(k), mine = VC.room === k;
    const c = el("section","vx-card" + (here.length ? " live" : "") + (mine ? " mine" : "")); const ic = el("span","wa-vic"); ic.innerHTML = HEADSET;
    const hd = el("div","vx-hd"); const tt = el("div"); tt.append(el("h2",null,l), el("p","muted",sub)); hd.append(ic, tt); c.appendChild(hd);
    const ppl = el("div","vx-ppl"); if (here.length) here.forEach(n => { const p = el("span","vx-p"); p.append(avatarEl(n, 28), el("span",null,n)); ppl.appendChild(p); }); else ppl.appendChild(el("span","muted","Personne pour l’instant")); c.appendChild(ppl);
    const a = el("div","vx-act"); a.appendChild(mine ? btn("Quitter","", () => vcLeave()) : btn(VC.room ? "Changer de salon" : "Rejoindre","lemon", () => vcJoin(k, l))); c.appendChild(a);
    g.appendChild(c); });
  root.appendChild(g);
  const cv = (S.cgroups || []).filter(x => (x.people || []).length);
  if (cv.length){
    const sec = el("section","vx-inv"); const top = el("div","vx-invh"); const tt = el("div"); tt.append(el("h2",null,"Visios mensuelles avec les clients"), el("p","muted","Chaque client a sa salle. Il la rejoint depuis son espace, onglet Visio, sans lien à envoyer."));
    top.appendChild(tt); sec.appendChild(top);
    cv.forEach(x => { const here = voiceHere(x.room), mine = VC.room === x.room; const r = el("div","vx-ir" + (here.length ? " live" : ""));
      const tx = el("div"); tx.append(el("b",null,x.name), el("small",null, here.length ? here.join(", ") + " dans la salle." : "Personne dans la salle pour l’instant."));
      const a = el("div","vx-ia"); a.appendChild(mine ? btn("Quitter","sm", () => vcLeave()) : btn("Rejoindre","sm lemon", () => vcJoin(x.room, "Visio, " + x.name)));
      r.append(tx, a); sec.appendChild(r); });
    root.appendChild(sec);
  }
  if (S.role === "owner" || S.role === "commercial"){
    if (!S.invites && !S.invLoading){ S.invLoading = true; GC.api("GET","/api/rtc/invites").then(r => { S.invites = r.invites; }).catch(() => { S.invites = []; }).finally(() => { S.invLoading = false; render(); }); }
    const sec = el("section","vx-inv"); const top = el("div","vx-invh"); const tt = el("div"); tt.append(el("h2",null,"Rendez-vous avec des prospects"), el("p","muted","Un lien à envoyer : la personne entre son nom et rejoint la visio, sans compte. Elle n’a accès qu’à ce salon."));
    top.append(tt, btn("Inviter un prospect","lemon", () => newInvite())); sec.appendChild(top);
    const list = (S.invites || []);
    if (!list.length) sec.appendChild(el("p","muted", S.invites ? "Aucun rendez-vous en cours." : "Chargement…"));
    list.forEach(x => { const here = voiceHere(x.room), mine = VC.room === x.room; const r = el("div","vx-ir" + (here.length ? " live" : ""));
      const tx = el("div"); tx.append(el("b",null,x.label), el("small",null, (here.length ? here.join(", ") + " dans le salon. " : "") + "Créé par " + x.by + ", valable jusqu’au " + fmtFR(new Date(x.exp).toISOString().slice(0, 10)) + "."));
      const a = el("div","vx-ia");
      a.append(mine ? btn("Quitter","sm", () => vcLeave()) : btn("Rejoindre","sm lemon", () => vcJoin(x.room, x.label)), btn("Copier le lien","sm", () => copyInvite(x.link)));
      const del = btn("Supprimer","sm rm", async () => { if (!del.classList.contains("armed")){ del.classList.add("armed"); del.textContent = "Confirmer"; setTimeout(() => { del.classList.remove("armed"); del.textContent = "Supprimer"; }, 3000); return; } try { await GC.api("DELETE","/api/rtc/invites/" + x.room); if (VC.room === x.room) vcLeave(true); S.invites = null; render(); } catch(e){ toast(e.message); } });
      a.appendChild(del); r.append(tx, a); sec.appendChild(r); });
    root.appendChild(sec);
  }
  root.appendChild(el("p","status","Le son et l’image passent directement d’un ordinateur à l’autre. On peut changer d’onglet pendant un appel : une barre reste en bas de l’écran. Le navigateur demande l’accès au micro la première fois."));
}
function copyInvite(link){ const u = location.origin + link; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).then(() => toast("Lien copié, à envoyer au prospect."), () => prompt("Lien à envoyer au prospect", u)); }
function newInvite(){
  openForm({ key:"iv", title:"Inviter un prospect", intro:"Le lien est copié tout de suite. La visio s’ouvre dans le navigateur du prospect, sans rien installer.", values:{ days: 7 },
    fields:[{k:"label",label:"Nom du rendez-vous",ph:"Ex. Découverte, Boulangerie Martin",req:"Donne un nom au rendez-vous."},{k:"days",label:"Lien valable (jours)",type:"number",half:true}],
    onSave: async out => { try { const r = await GC.api("POST","/api/rtc/invites",{ label: out.label, days: Number(out.days) || 7 }); copyInvite(r.link); S.invites = null; render(); } catch(e){ toast(e.message); throw e; } } });
}
window.addEventListener("beforeunload", () => { if (VC.room) navigator.sendBeacon && fetch("/api/rtc/leave", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (localStorage.getItem("gacolet-gestion-cle") || "") }, body: JSON.stringify({ room: VC.room, pid: VC.pid }) }).catch(() => {}); });
function vMessagerie(root){
  const me = S.me || "Gabriel";
  const mode = S.ui.msgMode || "main";
  const pre = mode === "shoot" ? "tg:" : "";
  let ch = mode === "shoot" ? (S.ui.msgShoot || "") : (S.ui.msgCh || "general");
  if (!msgChannels(mode).includes(ch)) ch = mode === "shoot" ? "tg:general" : "general";
  if (unreadIn(ch) && (S.ui.waConv || !window.matchMedia("(max-width:900px)").matches)){ S.ui[seenKey(ch)] = new Date().toISOString(); remember(); setTimeout(renderTabs, 0); }
  const sgEl = ((() => { const sg = segm([["main","Principal"],["shoot","Tournage"]], mode, v => { S.ui.msgMode = v; S.ui.waConv = false; remember(); render(); }); [...sg.querySelectorAll("button")].forEach((b, i) => { const n = unreadMode(i ? "shoot" : "main"); if (n) b.appendChild(el("span","cnt",String(n))); }); return sg; })());
  const wrap = el("div","wa " + (S.ui.waConv ? "show-conv" : "show-list"));

  /* Liste des conversations */
  const side = el("nav","wa-list");
  const top = el("div","wa-top"); const plus = el("button","wa-new"); plus.type = "button"; plus.title = "Nouvelle conversation privée"; plus.setAttribute("aria-label", plus.title); plus.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'; plus.onclick = () => newDm();
  const tl = el("div","wa-tl"); tl.append(el("h1",null,"Messagerie"), plus); top.append(tl, sgEl); side.appendChild(top);
  const lastOf = {}; S.d.messages.forEach(m => { if (!lastOf[m.ch] || (m.at || "") > (lastOf[m.ch].at || "")) lastOf[m.ch] = m; });
  const row = (k, label) => {
    const b = el("button","wa-row"); b.type = "button"; b.setAttribute("aria-pressed", String(k === ch));
    const lm = lastOf[k], un = k === ch && S.ui.waConv !== false ? 0 : unreadIn(k);
    const tx = el("span","wa-rtx"); const top = el("span","wa-rtop"); top.append(el("b",null,label), el("small",null, lm ? waTime(lm.at) : ""));
    const bot = el("span","wa-rbot"); bot.append(el("span",null, lm ? (lm.who === me ? "Toi : " : String(k).startsWith("dm:") ? "" : lm.who + " : ") + msgPreview(lm) : "Aucun message")); if (un) bot.appendChild(el("span","cnt",String(un)));
    tx.append(top, bot); b.append(chAvatar(k, 44), tx); if (un) b.classList.add("unread");
    b.onclick = () => { if (mode === "shoot") S.ui.msgShoot = k; else S.ui.msgCh = k; S.ui[seenKey(k)] = new Date().toISOString(); S.ui.waConv = true; remember(); render(); };
    side.appendChild(b);
  };
  side.appendChild(el("span","wa-lab","Équipe")); CHANNELS.forEach(([k,l]) => row(pre+k, l));
  if (mode !== "shoot"){ const dms = dmChannels(); if (dms.length){ side.appendChild(el("span","wa-lab","Privé")); dms.sort((a, b) => ((lastOf[b] || {}).at || "").localeCompare((lastOf[a] || {}).at || "")).forEach(k => row(k, dmOther(k))); } }
  if (mode !== "shoot"){ const cd = cdmChannels(); if (cd.length){ side.appendChild(el("span","wa-lab","Privé avec les clients")); cd.sort((a, b) => ((lastOf[b] || {}).at || "").localeCompare((lastOf[a] || {}).at || "")).forEach(k => row(k, cdmClient(k))); } }
  const cgShown = cgChannels().filter(k => k === ch.replace(/^tg:/, "") || lastOf[pre + k] || ((cgOf(k) || {}).people || []).length).map(k => pre + k);
  if (cgShown.length){ side.appendChild(el("span","wa-lab","Groupes avec les clients"));
    cgShown.map(k => [k, chName(k)]).sort((a, b) => ((lastOf[b[0]] || {}).at || "").localeCompare((lastOf[a[0]] || {}).at || "") || a[1].localeCompare(b[1])).forEach(([k, n]) => row(k, n)); }
  side.appendChild(el("span","wa-lab","Clients, entre nous"));
  clientNames().filter(n => n !== AGENCE).map(n => [pre+"c:"+n, n]).sort((a, b) => ((lastOf[b[0]] || {}).at || "").localeCompare((lastOf[a[0]] || {}).at || "") || a[1].localeCompare(b[1])).forEach(([k, n]) => row(k, n));

  /* Conversation */
  const main = el("section","wa-conv");
  const hd = el("header","wa-head");
  const back = el("button","wa-back"); back.type = "button"; back.setAttribute("aria-label","Retour aux conversations"); back.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>'; back.onclick = () => { S.ui.waConv = false; remember(); render(); };
  const ht = el("div","wa-htx"); const isCli = ch.replace(/^tg:/,"").startsWith("c:");
  const isDm = ch.startsWith("dm:"), isCdm = ch.startsWith("cdm:"), isCg = ch.replace(/^tg:/, "").startsWith("cg:");
  ht.append(el("b",null,(mode === "shoot" ? "Tournage, " : "") + chName(ch)), el("small",null, isDm ? "Conversation privée, visible de vous deux seulement" : isCdm ? "Conversation privée avec le client, toi seul la vois" : isCg ? (mode === "shoot" ? "Tournages, partagé avec le client" : "Groupe partagé avec le client") + ((cgOf(ch.replace(/^tg:/, "")) || {}).people || []).filter(Boolean).map((p, i) => (i ? ", " : " : ") + p).join("") : isCli ? "Échanges de l’équipe sur ce client, le client ne les voit pas" : (S.team || []).map(t => t.name).join(", ")));
  const hav = chAvatar(ch, 40); if (isDm){ hav.classList.add("av-click"); hav.onclick = () => profileCard(dmOther(ch)); ht.classList.add("av-click"); ht.onclick = () => profileCard(dmOther(ch)); }
  hd.append(back, hav, ht);
  if (isCg && mode !== "shoot"){ const pv = btn("Message privé","sm", () => { const k = "cdm:" + ch.slice(3) + "|" + me; S.ui.cdmOpen = [...new Set((S.ui.cdmOpen || []).concat(k))]; S.ui.msgCh = k; S.ui.waConv = true; remember(); render(); }); pv.classList.add("wa-hbtn"); hd.appendChild(pv); }
  main.appendChild(hd);
  const list = el("div","wa-msgs"); list.id = "chat-list";
  const msgs = S.d.messages.filter(m => m.ch === ch).sort((a,b) => (a.at||"").localeCompare(b.at||""));
  if (!msgs.length) list.appendChild(el("p","wa-empty","Aucun message ici pour l’instant. Écris le premier."));
  let prev = null;
  msgs.forEach(m => {
    const md = new Date(m.at||0), d = iso(md);
    if (!prev || iso(new Date(prev.at||0)) !== d){ const dl = fmtDL(d); list.appendChild(el("div","wa-day", d === today() ? "Aujourd’hui" : d === addDays(today(), -1) ? "Hier" : dl.charAt(0).toUpperCase()+dl.slice(1))); prev = null; }
    const mine = m.who === me, grouped = prev && prev.who === m.who && (Date.parse(m.at) - Date.parse(prev.at)) < 5*60000;
    const line = el("div","wa-line" + (mine ? " mine" : "") + (grouped ? " cont" : ""));
    if (!mine){ if (grouped) line.appendChild(el("span","av-sp")); else { const av = avatarEl(m.who, 30); av.classList.add("av-click"); av.title = "Voir le profil de " + m.who; av.onclick = () => profileCard(m.who); line.appendChild(av); } }
    const bub = el("div","wa-bub");
    if (!mine && !grouped){ const nm = el("b","wa-name",m.who || ""); nm.style.color = avColor(m.who); nm.onclick = e => { e.stopPropagation(); profileCard(m.who); }; bub.appendChild(nm); }
    if (m.fwd) bub.appendChild(el("span","wa-fwd","Transféré"));
    if (m.ext && !grouped) bub.appendChild(el("span","wa-ext","Client"));
    (m.files || []).forEach(f => bub.appendChild(attachEl(f)));
    if (m.audio) bub.appendChild(audioFor(m));
    if (m.text) bub.appendChild(el("div","wa-txt", m.text));
    bub.appendChild(el("span","wa-time", hhmm(md)));
    const col = el("div","wa-col"); col.appendChild(bub); line.appendChild(col);
    const dots = el("button","wa-dots"); dots.type = "button"; dots.title = "Plus d’options"; dots.setAttribute("aria-label", dots.title);
    dots.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
    dots.onclick = e => { e.stopPropagation(); msgMenu(dots, m, ch, mine); };
    line.appendChild(dots);
    list.appendChild(line); prev = m;
  });
  main.appendChild(list);

  /* Saisie */
  const form = el("form","wa-form");
  if (PENDING.ch === ch && PENDING.files.length){
    const pv = el("div","wa-pend");
    PENDING.files.forEach(f => { const c = el("span","wa-chip" + (f.url ? "" : " busy")); if (f.local){ const i = document.createElement("img"); i.src = f.local; c.appendChild(i); } c.appendChild(el("span",null, f.url ? f.name : "Envoi de " + f.name + "…"));
      const x = el("button",null,"Retirer"); x.type = "button"; x.onclick = () => { PENDING.files = PENDING.files.filter(y => y !== f); render(); }; c.appendChild(x); pv.appendChild(c); });
    form.appendChild(pv);
  }
  const bar = el("div","wa-bar");
  const fi = el("input"); fi.type = "file"; fi.multiple = true; fi.hidden = true; fi.onchange = () => { addFiles(ch, [...fi.files]); fi.value = ""; };
  const gif = el("button","wa-ic wa-gif","GIF"); gif.type = "button"; gif.title = "Envoyer un GIF"; gif.onclick = () => gifPicker(ch, me);
  const clip = el("button","wa-ic"); clip.type = "button"; clip.title = "Joindre une photo, une vidéo ou un fichier"; clip.setAttribute("aria-label", clip.title);
  clip.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5 12.4 19a5 5 0 0 1-7.1-7.1l8-8a3.4 3.4 0 0 1 4.8 4.8l-8 8a1.7 1.7 0 0 1-2.4-2.4l7.3-7.3"/></svg>';
  clip.onclick = () => fi.click();
  const ta = el("textarea"); ta.id = "chat-input"; ta.rows = 1; ta.placeholder = "Message"; ta.value = S.ui.msgDraft || "";
  const SEND = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12 20 4l-4 16-4-6.5z"/><path d="M12 13.5 20 4"/></svg>';
  const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  const go2 = el("button","wa-send"); go2.type = "submit";
  const ready = () => !!ta.value.trim() || (PENDING.ch === ch && PENDING.files.some(f => f.url));
  const setBtn = () => { const r = ready(); go2.innerHTML = r ? SEND : MIC; go2.setAttribute("aria-label", r ? "Envoyer" : "Enregistrer un message vocal"); go2.dataset.mode = r ? "send" : "mic"; };
  ta.oninput = () => { S.ui.msgDraft = ta.value; ta.style.height = "auto"; ta.style.height = Math.min(140, ta.scrollHeight) + "px"; setBtn(); };
  const send = async () => {
    if (PENDING.ch === ch && PENDING.busy){ toast("Attends la fin de l’envoi des fichiers."); return; }
    const t = ta.value.trim(), files = PENDING.ch === ch ? PENDING.files.filter(f => f.url).map(f => ({ url: f.url, name: f.name, type: f.type, size: f.size })) : [];
    if (!t && !files.length){ if (REC) recStop(true); recStart(ch); return; }
    S.ui.msgDraft = ""; ta.value = ""; PENDING = { ch: "", files: [], busy: 0 };
    try { await save("messages", null, Object.assign({ch, text: t, who: me, at: new Date().toISOString()}, files.length ? { files } : {})); } catch(e){ S.ui.msgDraft = t; }
  };
  ta.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey){ e.preventDefault(); if (ready()) send(); } };
  form.onsubmit = e => { e.preventDefault(); send(); };
  if (REC && REC.ch === ch){
    const rb = el("div","rec"); const tm = el("b",null,recLabel()); tm.id = "rec-time"; rb.append(el("span","rec-dot"), el("span",null,"Enregistrement"), tm);
    const cb = btn("Annuler","", () => recStop(true)); const ok = btn("Envoyer le vocal","lemon", () => recStop(false));
    cb.type = "button"; ok.type = "button";
    form.onsubmit = e => { e.preventDefault(); recStop(false); };
    bar.append(rb, cb, ok);
  } else { setBtn(); bar.append(fi, clip, gif, ta, go2); }
  form.appendChild(bar);
  main.ondragover = e => { e.preventDefault(); main.classList.add("drop"); };
  main.ondragleave = () => main.classList.remove("drop");
  main.ondrop = e => { e.preventDefault(); main.classList.remove("drop"); if (e.dataTransfer.files.length) addFiles(ch, [...e.dataTransfer.files]); };
  main.appendChild(form);
  wrap.append(side, main); root.appendChild(wrap);
  list.querySelectorAll("img,video").forEach(x => x.addEventListener(x.tagName === "IMG" ? "load" : "loadedmetadata", () => { list.scrollTop = list.scrollHeight; }, { once: true }));
  requestAnimationFrame(() => { const l = document.getElementById("chat-list"); if (l) l.scrollTop = l.scrollHeight; if (ta.value){ ta.style.height = "auto"; ta.style.height = Math.min(140, ta.scrollHeight) + "px"; } });
}

/* ---------- Salon focus : travail au calme, ensemble ---------- */
const FOCUS_TOOLS = ["Premiere Pro","After Effects","DaVinci Resolve","CapCut","Photoshop","Lightroom","Illustrator","Canva","Metricool","Meta Business","Google Drive","Mails et appels"];
const FOCUS = { on: false, task: "", tool: "", people: [], cv: null, raf: 0, audio: null, vol: 0.5, timer: null, mode: "", end: 0, loaded: false };
function focusApi(body){ return GC.api(body ? "POST" : "GET", "/api/focus", body).then(r => { FOCUS.people = r.people || []; FOCUS.loaded = true; if (S.view === "focus") focusPeople(); renderTabs(); }).catch(() => {}); }
setInterval(() => { if (!S.ready) return; if (FOCUS.on) focusApi({ task: FOCUS.task, tool: FOCUS.tool }); else if (S.view === "focus" || !FOCUS.loaded) focusApi(); }, 20000);
window.addEventListener("beforeunload", () => { if (FOCUS.on) fetch("/api/focus", { method: "POST", keepalive: true, headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (localStorage.getItem("gacolet-gestion-cle") || "") }, body: JSON.stringify({ on: false }) }).catch(() => {}); });
function focusDur(ms){ const m = Math.max(0, Math.floor(ms / 60000)); if (m < 1) return "un instant"; return m < 60 ? m + " min" : Math.floor(m / 60) + " h" + (m % 60 ? " " + String(m % 60).padStart(2, "0") : ""); }
/* Cheminée : flammes en particules, braises, lueur qui respire. Dessin original, sans image. */
function fireCanvas(){
  if (FOCUS.cv) return FOCUS.cv;
  const cv = document.createElement("canvas"); cv.className = "fo-fire"; FOCUS.cv = cv;
  const ctx = cv.getContext("2d"); let W = 0, H = 0, parts = [], sparks = [], t = 0;
  const fit = () => { const r = cv.getBoundingClientRect(), d = Math.min(2, window.devicePixelRatio || 1); W = Math.max(1, r.width); H = Math.max(1, r.height); cv.width = W * d; cv.height = H * d; ctx.setTransform(d, 0, 0, d, 0, 0); };
  const loop = () => {
    if (!document.body.contains(cv)){ FOCUS.raf = 0; return; }
    if (cv.width < 2 || Math.abs(cv.getBoundingClientRect().width - W) > 2) fit();
    t += 1; const cx = W / 2, small = W < 600, base = H * (small ? 0.6 : 0.74), fw = small ? W * 0.6 : Math.min(W * 0.48, 470), sc = small ? 0.8 : 1.25;
    ctx.globalCompositeOperation = "source-over"; ctx.fillStyle = "#0B0806"; ctx.fillRect(0, 0, W, H);
    const pulse = 0.85 + 0.15 * Math.sin(t / 47) + 0.05 * Math.sin(t / 13);
    const g = ctx.createRadialGradient(cx, base - 40, 10, cx, base - 40, Math.max(W, H) * 0.7);
    g.addColorStop(0, "rgba(255,140,40," + (0.32 * pulse) + ")"); g.addColorStop(0.35, "rgba(160,60,15," + (0.16 * pulse) + ")"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 10; i++) parts.push({ x: cx + (Math.random() - .5) * fw * (0.4 + Math.random() * 0.6), y: base - 6, vx: (Math.random() - .5) * 0.5, vy: -(1.2 + Math.random() * 1.9) * sc, life: 0, max: 50 + Math.random() * 50, r: (16 + Math.random() * 24) * sc });
    if (Math.random() < 0.18) sparks.push({ x: cx + (Math.random() - .5) * fw * .6, y: base - 20, vx: (Math.random() - .5) * 1.2, vy: -(1.5 + Math.random() * 2.5), life: 0, max: 60 + Math.random() * 80 });
    ctx.globalCompositeOperation = "lighter";
    parts = parts.filter(p => p.life < p.max);
    parts.forEach(p => { p.life++; const k = p.life / p.max; p.x += p.vx + Math.sin((p.y + t) / 18) * 0.35 + (cx - p.x) * 0.012; p.y += p.vy; const r = p.r * (1 - k * 0.7);
      const c = k < 0.25 ? [255, 230, 160] : k < 0.55 ? [255, 150, 50] : [200, 60, 20], a = (1 - k) * 0.26;
      const rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r); rg.addColorStop(0, "rgba(" + c + "," + a + ")"); rg.addColorStop(1, "rgba(" + c + ",0)");
      ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); });
    sparks = sparks.filter(s => s.life < s.max);
    sparks.forEach(s => { s.life++; s.x += s.vx + Math.sin((s.life + s.y) / 9) * 0.4; s.y += s.vy; s.vy *= 0.985; const a = 1 - s.life / s.max; ctx.fillStyle = "rgba(255,190,90," + a + ")"; ctx.fillRect(s.x, s.y, 1.6, 1.6); });
    ctx.globalCompositeOperation = "source-over";
    const logs = [[-0.55, 0.06, 0.18], [0.5, 0.05, -0.16], [0, 0.0, 0.03]];
    logs.forEach(([dx, dy, rot]) => { ctx.save(); ctx.translate(cx + dx * fw * 0.5, base + 12 + dy * 60); ctx.rotate(rot); const lw = fw * 0.75, lh = 22;
      const lg = ctx.createLinearGradient(0, -lh / 2, 0, lh / 2); lg.addColorStop(0, "#3A2416"); lg.addColorStop(1, "#160C06"); ctx.fillStyle = lg;
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-lw / 2, -lh / 2, lw, lh, 11) : ctx.rect(-lw / 2, -lh / 2, lw, lh); ctx.fill();
      ctx.fillStyle = "rgba(255,120,40," + (0.25 + 0.2 * Math.sin(t / 20 + dx * 5)) + ")"; ctx.fillRect(-lw / 2 + 12, -lh / 2, lw - 24, 2.5); ctx.restore(); });
    const fl = ctx.createLinearGradient(0, base + 30, 0, H); fl.addColorStop(0, "rgba(255,110,30," + 0.12 * pulse + ")"); fl.addColorStop(1, "rgba(0,0,0,0)"); ctx.fillStyle = fl; ctx.fillRect(0, base + 30, W, H - base);
    FOCUS.raf = requestAnimationFrame(loop);
  };
  cv._start = () => { if (!FOCUS.raf) FOCUS.raf = requestAnimationFrame(loop); };
  return cv;
}
/* Ambiance sonore générée : souffle du feu et crépitements. */
function fireSound(on){
  if (!on){ if (FOCUS.audio){ FOCUS.audio.ctx.close(); FOCUS.audio = null; } return; }
  if (FOCUS.audio) return;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
  const ctx = new AC(), out = ctx.createGain(); out.gain.value = FOCUS.vol; out.connect(ctx.destination);
  const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0); let last = 0;
  for (let i = 0; i < len; i++){ const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.2; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420; const rg = ctx.createGain(); rg.gain.value = 0.55;
  src.connect(lp); lp.connect(rg); rg.connect(out); src.start();
  const crack = () => { if (!FOCUS.audio) return; const n = ctx.createBufferSource(), b = ctx.createBuffer(1, ctx.sampleRate * 0.03, ctx.sampleRate), x = b.getChannelData(0);
    for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 3);
    n.buffer = b; const hp = ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 1200 + Math.random() * 2500; const gg = ctx.createGain(); gg.gain.value = 0.08 + Math.random() * 0.25;
    n.connect(hp); hp.connect(gg); gg.connect(out); n.start(); setTimeout(crack, 60 + Math.random() * (Math.random() < 0.2 ? 120 : 900)); };
  FOCUS.audio = { ctx, out }; crack();
}
function focusPeople(){
  const box = document.getElementById("fo-people"); if (!box) return; box.textContent = "";
  const me = S.me || "Gabriel", list = FOCUS.people.slice().sort((a, b) => a.since - b.since);
  if (!list.length){ box.appendChild(el("p","fo-empty","Personne au coin du feu pour l’instant. Lance ta session, les autres te verront.")); return; }
  list.forEach(p => { const c = el("div","fo-p" + (p.pause ? " pause" : "") + (p.name === me ? " me" : ""));
    const av = avatarEl(p.name, 44); av.classList.add("av-click"); av.onclick = () => profileCard(p.name);
    const tx = el("div","fo-ptx"); tx.append(el("b",null,p.name + (p.name === me ? " (toi)" : "")), el("span",null, p.pause ? "En pause" : [p.tool, p.task].filter(Boolean).join(", ") || "Concentré"), el("small",null, (Date.now() - p.since < 60000 ? "Vient d’arriver" : "En focus depuis " + focusDur(Date.now() - p.since))));
    c.append(av, tx); box.appendChild(c); });
}
function focusTimerLabel(){ if (!FOCUS.end) return ""; const s = Math.max(0, Math.round((FOCUS.end - Date.now()) / 1000)); return Math.floor(s / 60) + " min " + String(s % 60).padStart(2, "0"); }
function focusTimer(min, mode){
  clearInterval(FOCUS.timer); FOCUS.mode = mode; FOCUS.end = min ? Date.now() + min * 60000 : 0;
  if (!min){ render(); return; }
  FOCUS.timer = setInterval(() => { const t = document.getElementById("fo-time"); if (t) t.textContent = focusTimerLabel();
    if (Date.now() >= FOCUS.end){ clearInterval(FOCUS.timer); const was = FOCUS.mode; FOCUS.end = 0; FOCUS.mode = "";
      toast(was === "work" ? "Bravo, session terminée. Une pause de 10 minutes ?" : "Fin de la pause, on reprend.");
      if (FOCUS.on) focusApi({ task: FOCUS.task, tool: FOCUS.tool, pause: false }); render(); } }, 1000);
  if (FOCUS.on) focusApi({ task: FOCUS.task, tool: FOCUS.tool, pause: mode === "pause" });
  render();
}
function vFocus(root){
  const me = S.me || "Gabriel";
  if (!FOCUS.loaded) focusApi();
  const wrap = el("section","fo"); wrap.id = "fo";
  const stage = el("div","fo-stage"); const cv = fireCanvas(); stage.appendChild(cv);
  const ov = el("div","fo-ov");
  const h = el("h1","fo-h"); h.append(document.createTextNode("Salon "), el("span",null,"focus")); ov.appendChild(h);
  ov.appendChild(el("p","fo-sub", FOCUS.on ? "Tu es au coin du feu. Les autres voient que tu travailles." : "Un coin calme pour travailler ensemble. Chacun voit qui est concentré, sans se déranger."));
  if (FOCUS.end) ov.appendChild(el("p","fo-time", focusTimerLabel())).id = "fo-time";
  const ctl = el("div","fo-ctl");
  if (!FOCUS.on){
    const inp = el("input","fo-in"); inp.id = "fo-task"; inp.placeholder = "Sur quoi tu bosses ? (facultatif)"; inp.maxLength = 120; inp.value = FOCUS.task;
    inp.oninput = () => { FOCUS.task = inp.value; }; inp.onkeydown = e => { if (e.key === "Enter") go2.click(); };
    const go2 = btn("Je me mets en focus","lemon", () => { FOCUS.on = true; focusApi({ task: FOCUS.task.trim(), tool: FOCUS.tool }); if (!FOCUS.audio && FOCUS.sound !== false) fireSound(true); render(); });
    ctl.append(inp, go2);
  } else {
    ctl.append(btn(FOCUS.mode === "work" ? "Arrêter le minuteur" : "Session de 50 min", FOCUS.mode === "work" ? "" : "lemon", () => focusTimer(FOCUS.mode === "work" ? 0 : 50, "work")),
      btn(FOCUS.mode === "pause" ? "Reprendre" : "Pause de 10 min","", () => focusTimer(FOCUS.mode === "pause" ? 0 : 10, "pause")),
      btn("Quitter le salon","", () => { FOCUS.on = false; clearInterval(FOCUS.timer); FOCUS.end = 0; FOCUS.mode = ""; focusApi({ on: false }); fireSound(false); render(); }));
  }
  ov.appendChild(ctl);
  /* Sur quel outil : visible des autres au coin du feu */
  const tl = el("div","fo-chips"); tl.setAttribute("role","group"); tl.setAttribute("aria-label","Outil en cours");
  FOCUS_TOOLS.forEach(n => { const b = el("button","fo-chip",n); b.type = "button"; b.setAttribute("aria-pressed", String(FOCUS.tool === n));
    b.onclick = () => { FOCUS.tool = FOCUS.tool === n ? "" : n; if (FOCUS.on) focusApi({ task: FOCUS.task, tool: FOCUS.tool }); render(); }; tl.appendChild(b); });
  ov.appendChild(tl);
  const tools = el("div","fo-tools");
  const snd = btn(FOCUS.audio ? "Couper le feu" : "Son du feu","sm", () => { fireSound(!FOCUS.audio); FOCUS.sound = !!FOCUS.audio; render(); });
  const vol = el("input","fo-vol"); vol.type = "range"; vol.min = 0; vol.max = 1; vol.step = 0.05; vol.value = FOCUS.vol; vol.title = "Volume du feu"; vol.setAttribute("aria-label", vol.title);
  vol.oninput = () => { FOCUS.vol = Number(vol.value); if (FOCUS.audio) FOCUS.audio.out.gain.value = FOCUS.vol; };
  const voc = VC.room === "focus" ? btn("Quitter le vocal","sm", () => vcLeave()) : btn("Rejoindre en vocal","sm", () => vcJoin("focus","Salon focus"));
  const full = btn("Plein écran","sm", () => { const f = document.getElementById("fo"); if (document.fullscreenElement) document.exitFullscreen(); else if (f && f.requestFullscreen) f.requestFullscreen().catch(() => {}); });
  tools.append(snd, vol, voc, full); ov.appendChild(tools);
  stage.appendChild(ov); wrap.appendChild(stage);
  /* Radio : un direct YouTube ou une playlist, au choix de chacun */
  const side = el("aside","fo-side");
  side.appendChild(el("h2",null,"Au coin du feu"));
  const pp = el("div","fo-people"); pp.id = "fo-people"; side.appendChild(pp);
  side.appendChild(el("h2",null,"Radio"));
  const src = embedUrl(S.ui.foRadio || "");
  if (src && FOCUS.on){ const fr = el("div","fo-radio"); const i = document.createElement("iframe"); i.src = src + (src.includes("?") ? "&" : "?") + "autoplay=1"; i.allow = "autoplay; encrypted-media"; i.title = "Radio du salon focus"; fr.appendChild(i); side.appendChild(fr); }
  const rf = el("form","fo-rf"); const ri = el("input","fo-in"); ri.id = "fo-radio-in"; ri.placeholder = "Lien YouTube d’un direct ou d’une playlist"; ri.value = S.ui.foRadio || "";
  const rb = el("button","btn sm","OK"); rb.type = "submit"; rf.append(ri, rb);
  rf.onsubmit = e => { e.preventDefault(); const v = ri.value.trim(); if (v && !embedUrl(v)){ toast("Colle un lien YouTube ou Vimeo."); return; } S.ui.foRadio = v; remember(); render(); };
  side.appendChild(rf);
  side.appendChild(el("p","muted fo-note", src ? (FOCUS.on ? "La radio joue pendant ta session." : "La radio démarre quand tu te mets en focus.") : "Colle le lien de ta radio préférée, elle se lancera à chaque session."));
  wrap.appendChild(side); root.appendChild(wrap);
  setTimeout(() => { cv._start(); focusPeople(); }, 0);
}

/* ---------- Idées clients : ce que les clients déposent depuis leur espace ---------- */
function vIdees(root){
  const me = S.me || "Gabriel", all = (S.d.idees || []).slice().sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  const names = [...new Set(all.map(i => i.client))].sort((a, b) => a.localeCompare(b, "fr"));
  const f = S.ui.idClient && names.includes(S.ui.idClient) ? S.ui.idClient : "";
  const sel = el("select","pick"); [["","Tous les clients"]].concat(names.map(n => [n, n])).forEach(([v, l]) => { const o = el("option", null, l); o.value = v; if (v === f) o.selected = true; sel.appendChild(o); });
  sel.onchange = () => { S.ui.idClient = sel.value; remember(); render(); };
  const unseen = all.filter(i => !(i.seen || []).includes(me));
  const markAll = unseen.length ? btn("Tout marquer comme vu","sm", () => unseen.forEach(i => patch("idees", i.id, { seen: [...new Set((i.seen || []).concat(me))] }))) : null;
  root.appendChild(head("Idées clients", "Idées, photos et vidéos envoyées par les clients depuis leur espace", [sel, markAll]));
  const list = all.filter(i => !f || i.client === f);
  if (!list.length){ root.appendChild(el("p","empty","Rien pour l’instant. Les envois des clients arrivent ici.")); return; }
  const g = el("div","id-grid");
  list.forEach(i => {
    const c = el("article","id-card" + ((i.seen || []).includes(me) ? "" : " new"));
    const h = el("header","id-h"); h.append(avatarEl(i.client, 34, { src: "", color: colorOf(i.client), soft: true }));
    const t = el("div","id-ht"); t.append(el("b",null,i.client), el("small",null,(i.who || "") + ", " + waTime(i.at))); h.append(t, el("span","pill",i.kind || "Idée")); c.appendChild(h);
    if (i.text) c.appendChild(el("p","id-tx",i.text));
    if ((i.files || []).length){ const m = el("div","id-media"); i.files.forEach(x => m.appendChild(attachEl(x))); c.appendChild(m); }
    const a = el("div","id-acts");
    if (!(i.seen || []).includes(me)) a.appendChild(btn("Marquer comme vu","sm", () => patch("idees", i.id, { seen: [...new Set((i.seen || []).concat(me))] })));
    const g2 = (S.cgroups || []).find(x => x.name === i.client);
    if (g2) a.appendChild(btn("Répondre dans le groupe","sm lemon", () => { S.ui.msgMode = "main"; S.ui.msgCh = g2.ch; S.ui.waConv = true; remember(); go("messagerie"); }));
    c.appendChild(a); g.appendChild(c);
  });
  root.appendChild(g);
}

/* ---------- Formation ---------- */
function embedUrl(u){
  u = String(u||"").trim(); let m;
  if ((m = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/))) return "https://www.youtube-nocookie.com/embed/" + m[1];
  if ((m = u.match(/vimeo\.com\/(?:video\/)?(\d+)/))) return "https://player.vimeo.com/video/" + m[1];
  if ((m = u.match(/drive\.google\.com\/file\/d\/([\w-]+)/))) return "https://drive.google.com/file/d/" + m[1] + "/preview";
  return "";
}
function editFormation(f){
  openForm({ key:"fo", title: f.id ? f.title : "Nouvelle vidéo", intro: f.id ? "" : "Colle le lien d’une vidéo YouTube, Vimeo ou Google Drive.", values: Object.assign({aud: S.ui.foAud || "Équipe"}, f),
    fields:[{k:"title",label:"Titre",req:"Donne un titre."},{k:"aud",label:"Pour",type:"select",options:["Équipe","Clients"],half:true},{k:"topic",label:"Thème",half:true,ph:"Ex. Montage, Metricool, Tournage"},
      {k:"url",label:"Lien de la vidéo",ph:"https://",req:"Colle le lien de la vidéo."},{k:"duration",label:"Durée",half:true,ph:"Ex. 4 min"},{k:"order",label:"Ordre",type:"number",half:true},{k:"desc",label:"Ce qu’on y apprend",type:"textarea"}],
    onDelete: f.id ? () => remove("formations", f.id) : null,
    onSave: out => save("formations", f.id || null, Object.assign(f.id ? strip(f) : {}, out)) });
}
function openFormation(f){
  const me = S.me || "Gabriel";
  openModal(m => {
    const t = el("h3",null,f.title); t.id = "mtitle"; m.appendChild(t);
    if (f.topic || f.duration) m.appendChild(el("p","muted",[f.topic, f.duration].filter(Boolean).join(", ")));
    const src = embedUrl(f.url);
    if (src){ const v = el("div","fo-player"); const i = document.createElement("iframe"); i.src = src; i.allow = "autoplay; fullscreen; picture-in-picture"; i.allowFullscreen = true; v.appendChild(i); m.appendChild(v); }
    else if (f.url){ const a = el("a","btn","Ouvrir la vidéo"); a.href = f.url; a.target = "_blank"; a.rel = "noopener"; m.appendChild(a); }
    if (f.desc) m.appendChild(el("p","fo-desc",f.desc));
    const acts = el("div","actions");
    const seen = (f.seenBy||[]).includes(me);
    const sb = btn(seen ? "Vue" : "Marquer comme vue", seen ? "" : "lemon", () => { const s = new Set(f.seenBy||[]); seen ? s.delete(me) : s.add(me); patch("formations", f.id, {seenBy:[...s]}); closeModal(); });
    const eb = btn("Modifier","", () => { closeModal(); editFormation(f); });
    acts.append(eb, sb); m.appendChild(acts);
  });
}
function vFormation(root){
  const me = S.me || "Gabriel"; const aud = S.ui.foAud || "Équipe";
  root.appendChild(head("Formation", aud === "Équipe" ? "Pour bien démarrer à l’agence" : "Les tutos à partager aux clients",
    [segm([["Équipe","Équipe"],["Clients","Clients"]], aud, v => { S.ui.foAud = v; remember(); render(); }), addBtn("Ajouter une vidéo", () => editFormation({aud}))]));
  const rows = S.d.formations.filter(f => (f.aud||"Équipe") === aud).sort((a,b) => (Number(a.order)||999) - (Number(b.order)||999) || (a.title||"").localeCompare(b.title||""));
  if (!rows.length){ root.appendChild(el("p","empty", aud === "Équipe" ? "Aucune vidéo pour l’instant. Ajoute la première : outils, règles de nommage, tournage, montage." : "Aucun tuto client pour l’instant. Commence par « Valider une publication » et « Envoyer ses photos »." )); return; }
  const topics = []; rows.forEach(f => { const t = f.topic || "Général"; if (!topics.includes(t)) topics.push(t); });
  const seenN = rows.filter(f => (f.seenBy||[]).includes(me)).length;
  if (aud === "Équipe") root.appendChild(el("p","status", seenN + " sur " + rows.length + " vues par toi."));
  topics.forEach(tp => {
    root.appendChild(el("h2","sec",tp));
    const g = el("div","fo-grid");
    rows.filter(f => (f.topic || "Général") === tp).forEach(f => {
      const c = el("button","fo-card"+((f.seenBy||[]).includes(me) ? " seen" : ""));
      const th = el("span","fo-th"); th.appendChild(el("span","fo-play")); c.appendChild(th);
      c.appendChild(el("b",null,f.title)); c.appendChild(el("span",null,[f.duration, (f.seenBy||[]).includes(me) ? "Vue" : ""].filter(Boolean).join(", ")));
      c.onclick = () => openFormation(f); g.appendChild(c);
    });
    root.appendChild(g);
  });
}

/* ---------- Navigation ---------- */
function hubTabs(root, opts, cur, key){
  const bar = el("div","hub"); bar.setAttribute("role","tablist");
  opts.forEach(([v, l]) => { const b = el("button",null,l); b.type = "button"; b.setAttribute("role","tab"); b.setAttribute("aria-selected", String(v === cur)); b.onclick = () => { S.ui[key] = v; remember(); render(); }; bar.appendChild(b); });
  root.insertBefore(bar, root.firstChild);
}
function vAgendaHub(root){
  const opts = [["agenda","Agenda"]].concat(canSee("clients") ? [["clients","Calendrier clients"]] : []);
  const cur = opts.some(o => o[0] === S.ui.agHub) ? S.ui.agHub : "agenda";
  (cur === "clients" ? vClients : vAgenda)(root); if (opts.length > 1) hubTabs(root, opts, cur, "agHub");
}
function vTachesHub(root){
  const opts = [["taches","Tâches"]].concat(canSee("montage") ? [["montage","Montage"]] : []);
  const cur = opts.some(o => o[0] === S.ui.tHub) ? S.ui.tHub : "taches";
  (cur === "montage" ? vMontage : vTaches)(root); if (opts.length > 1) hubTabs(root, opts, cur, "tHub");
}
const RENDER = {fiches:vFiches, parametres:vParametres, accueil:vAccueil, agenda:vAgendaHub, taches:vTachesHub, commercial:vCommercial, campagnes:vMeta, montage:vMontage, publications:vPublications, clients:vClients, messagerie:vMessagerie, vocal:vVocal, formation:vFormation, idees:vIdees, focus:vFocus};
function go(v){ if (MERGED[v]){ S.ui[MERGED[v][1]] = v; remember(); v = MERGED[v][0]; } if (location.hash !== "#"+v) location.hash = v; else { S.view = v; render(); } }
function fromHash(){ let h = (location.hash||"").replace("#",""); if (h === "editorial"){ S.ui.agClient = AGENCE; if (!S.ui.agLayers.includes("posts")) S.ui.agLayers = S.ui.agLayers.concat("posts"); h = "agenda"; } if (MERGED[h] && canSee(h)){ S.ui[MERGED[h][1]] = h; h = MERGED[h][0]; } S.view = RENDER[h] && canSee(h) ? h : "accueil"; }
window.addEventListener("hashchange", () => { fromHash(); render(); window.scrollTo(0,0); });
const ICONS = {
  fiches:'<rect x="4" y="4.5" width="16" height="15" rx="1.5"/><path d="M4 9.5h16M9.5 9.5v10"/>',
  parametres:'<circle cx="12" cy="12" r="3.2"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/>',
  accueil:'<path d="M4 11.2 12 4.8l8 6.4V20h-5.6v-5.2H9.6V20H4z"/>',
  agenda:'<rect x="4" y="5.5" width="16" height="14.5" rx="1.5"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
  taches:'<path d="M4.5 7l1.5 1.5L8.5 6M4.5 13l1.5 1.5L8.5 12M11 7.3h8.5M11 13.3h8.5M11 18.8h8.5M5 18.8h2.5"/>',
  commercial:'<path d="M4 19.5h16M7 16.5v-4.5M12 16.5V8.5M17 16.5V5"/>',
  campagnes:'<path d="M4 10v4l3 .4L15 19V5L7 9.6z"/><path d="M18.2 9.4a3.6 3.6 0 0 1 0 5.2"/>',
  montage:'<rect x="3.5" y="6" width="17" height="12" rx="1.5"/><path d="M8 6v12M16 6v12M3.5 10h4.5M3.5 14h4.5M16 10h4.5M16 14h4.5"/>',
  publications:'<rect x="4" y="4" width="16" height="16" rx="4"/><circle cx="12" cy="12" r="3.6"/><path d="M16.7 7.3h.01"/>',
  clients:'<circle cx="9" cy="9" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5M15.5 6.2a3 3 0 0 1 0 5.6M17 14.3c1.9.6 3.1 2.2 3.5 4.7"/>',
  messagerie:'<path d="M4.5 6.5A2 2 0 0 1 6.5 4.5h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H10l-4.5 3.5v-3.5h0a2 2 0 0 1-1-1.7z"/>',
  vocal:'<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3.5" y="13.5" width="4" height="6.5" rx="1.5"/><rect x="16.5" y="13.5" width="4" height="6.5" rx="1.5"/>',
  formation:'<rect x="3.5" y="5.5" width="17" height="12" rx="2"/><path d="M10.5 9v5l4-2.5z"/><path d="M8 20.5h8"/>',
  plus:'<path d="M5 7h14M5 12h14M5 17h14"/>',
  idees:'<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  focus:'<path d="M12 21c-3.6 0-6.5-2.6-6.5-6.2 0-3.4 2.6-5.2 3.6-8.3.9 1.4 1.4 2.7 1.4 4 1.3-1.1 2.3-3.2 2.1-6 3 2.4 5.9 6 5.9 10.3 0 3.6-2.9 6.2-6.5 6.2z"/><path d="M12 21c-1.6 0-2.8-1.2-2.8-2.8 0-1.7 1.6-2.6 2.8-4.2 1.2 1.6 2.8 2.5 2.8 4.2 0 1.6-1.2 2.8-2.8 2.8z"/>'
};
const SHORT = {fiches:"Tableau clients", parametres:"Paramètres", accueil:"Accueil", agenda:"Agenda", taches:"Tâches", commercial:"Commercial", campagnes:"Campagnes", montage:"Montage", publications:"Publications", clients:"Calendrier clients", messagerie:"Messagerie", vocal:"Vocal", formation:"Formation", idees:"Idées clients", focus:"Focus"};
const MOBILE_MAIN = ["accueil","agenda","taches","messagerie"];
const ico = k => { const s = document.createElementNS("http://www.w3.org/2000/svg","svg"); s.setAttribute("viewBox","0 0 24 24"); s.setAttribute("aria-hidden","true"); s.classList.add("ico"); s.innerHTML = ICONS[k] || ""; return s; };
function renderTabs(){
  const me = S.me || "Gabriel";
  const badge = { messagerie: unreadRole(), taches: openTasks().filter(t => t.who === me && lateDays(t.date) > 0).length, commercial: me === "Gabriel" ? S.d.commercial.filter(c => isISO(c.nextDate) && c.nextDate <= today()).length : 0, idees: (S.d.idees || []).filter(i => !(i.seen || []).includes(me)).length, focus: FOCUS.people.filter(p => p.name !== me && !p.pause).length, vocal: S.ready ? new Set(VOICE.flatMap(([k]) => voiceHere(k)).filter(n => n !== me)).size : 0 };
  try { const n = badge.messagerie || 0; if (navigator.setAppBadge) { n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } } catch(e){}
  const link = k => { const a = el("a"); a.href = "#"+k; a.appendChild(ico(k)); a.appendChild(el("span","lb", SHORT[k])); if (k === S.view) a.setAttribute("aria-current","page"); if (badge[k]) a.appendChild(el("span","n",String(badge[k]))); return a; };
  const n = $("#tabs"); n.textContent = "";
  NAV_GROUPS.forEach(([lab, ks]) => { ks = ks.filter(canSee); if (!ks.length) return; if (lab) n.appendChild(el("span","navlab",lab)); ks.forEach(k => n.appendChild(link(k))); });
  const m = $("#mtabs"); m.textContent = "";
  const mm = S.role && S.role !== "owner" ? ["accueil","agenda","taches","messagerie"] : MOBILE_MAIN;
  mm.filter(canSee).forEach(k => m.appendChild(link(k)));
  const more = el("button","morebtn"); more.type = "button"; more.appendChild(ico("plus")); more.appendChild(el("span","lb","Plus"));
  if (!mm.includes(S.view)) more.setAttribute("aria-current","page");
  if (badge.messagerie) more.appendChild(el("span","n",String(badge.messagerie)));
  more.onclick = openMore; m.appendChild(more);
  $("#mbar-title").textContent = SHORT[S.view] || "";
  $("#me-name").textContent = me;
}
function openMore(){
  openModal(md => { md.classList.add("sheet"); const t = el("h3",null,"Menu"); t.id = "mtitle"; md.appendChild(t);
    const l = el("nav","morelist"); NAV_GROUPS.flatMap(g => g[1]).map(k => [k, SHORT[k]]).filter(([k]) => canSee(k) && !(S.role && S.role !== "owner" ? ["accueil","agenda","taches","messagerie"] : MOBILE_MAIN).includes(k)).forEach(([k,lab]) => { const a = el("a"); a.href = "#"+k; a.appendChild(ico(k)); a.appendChild(el("span",null,lab)); if (k === S.view) a.setAttribute("aria-current","page"); a.onclick = () => closeModal(); l.appendChild(a); }); md.appendChild(l);
    if (S.secours || !S.user){ const w = el("div","whobox"); w.appendChild(el("span","flabel","Je suis"));
    w.appendChild(segm(PEOPLE.map(p => [p,p]), S.me, p => { setMe(p); closeModal(); })); md.appendChild(w); }
    const o = el("div","actions"); o.style.justifyContent = "space-between";
    o.appendChild(btn("Se déconnecter","sm", () => window.GC && GC.logout())); md.appendChild(o);
  });
}
let rq = 0;
function renderSoon(){ if (rq) return; rq = requestAnimationFrame(() => { rq = 0; render(); }); }
/* Sur téléphone, chaque ligne de tableau devient une carte : on recopie l’intitulé de colonne sur chaque case. */
function cardLabels(root){
  root.querySelectorAll("table.t").forEach(t => { if (t.classList.contains("ms-t")) return;
    const hs = [...t.querySelectorAll("thead th")].map(th => th.textContent.trim());
    t.querySelectorAll("tbody tr").forEach(tr => { [...tr.children].forEach((td, i) => { if (td.tagName === "TD" && hs[i] && !td.hasAttribute("colspan")) td.dataset.label = hs[i]; }); });
  });
}
function render(){
  if (vcIsFull()){ vcStage(); vcRender(); return; }
  if (document.fullscreenElement && document.fullscreenElement.id === "fo"){ focusPeople(); return; }
  if (S.view !== "campagnes") document.documentElement.classList.remove("gs-lock");
  renderTabs();
  const root = $("#app");
  const focusId = document.activeElement && document.activeElement.id; const caret = focusId && document.activeElement.selectionStart;
  root.textContent = "";
  document.body.classList.toggle("chat-full", S.view === "messagerie" && !S.failed && !!S.ready);
  if (S.failed){ root.appendChild(head("Gestionnaire", "")); root.appendChild(el("p","empty",S.failed)); return; }
  if (!S.ready){ root.appendChild(head(VIEWS.find(v => v[0] === S.view)[1], "Chargement des données de l’agence…")); root.appendChild(el("p","empty","Les tâches, le commercial, les campagnes, les calendriers et l’agenda s’affichent dans un instant.")); return; }
  try { RENDER[S.view](root); cardLabels(root); } catch(x){ root.appendChild(el("p","err","Affichage impossible : "+(x && x.message))); console.error(x); }
  if (S.preview){ const b = el("div","pv-bar"); b.append(el("span",null,"Aperçu : tu vois l’application comme "+S.me+" ("+(ROLE_LABEL[S.role]||S.role)+"). Lecture seule.")); b.appendChild(btn("Quitter l’aperçu","sm", () => { GC.setAs(""); location.hash = "#parametres"; location.reload(); })); root.insertBefore(b, root.firstChild); }
  else if (S.canWrite === false) root.insertBefore(el("p","status","Consultation seule."), root.firstChild);
  if (focusId){ const f = document.getElementById(focusId); if (f){ f.focus(); try { if (caret != null) f.setSelectionRange(caret, caret); } catch(e){} } }
  { const n = S.ready ? unreadRole() : 0; document.title = (n ? "(" + n + ") " : "") + "Gacolet"; }
  if (S.ready && !RTC_T) rtcTick();
  vcRender();
}

/* ---------- Compte connecté ---------- */
function applyMe(r){
  if (!r || !r.user) return;
  const u = r.user;
  S.user = u; S.role = u.role; S.secours = !!u.secours; S.preview = !!u.preview;
  S.isOwner = u.role === "owner"; S.canWrite = !u.preview;
  S.team = r.team || [];
  const names = S.team.map(t => t.name);
  if (names.length) PEOPLE = names;
  if (!S.secours) S.me = u.name;
  OWNERS = S.role === "owner" ? PEOPLE.concat(["À attribuer"]) : [S.me];
  const lab = document.querySelector(".me"); if (lab) lab.hidden = !S.secours;
  if (S.secours){ meSel.textContent = ""; PEOPLE.forEach(p => { const o = el("option",null,p); o.value = p; meSel.appendChild(o); }); if (S.me) meSel.value = S.me; }
  const ac = $("#acct");
  if (ac && !S.secours){ ac.hidden = false; const ov = ac.querySelector(".av"); if (ov) ov.remove(); ac.prepend(avatarEl(u.name, 34, { src: (u.info || {}).avatar || "" })); $("#acct-name").textContent = u.name; $("#acct-role").textContent = ((u.info || {}).poste || ROLE_LABEL[u.role] || "") + (S.preview ? ", aperçu" : ""); }
  const toAcct = () => { S.ui.pmTab = "compte"; remember(); go("parametres"); };
  if (ac){ ac.onclick = toAcct; ac.title = "Mon compte"; ac.setAttribute("role","button"); ac.tabIndex = 0; ac.onkeydown = e => { if (e.key === "Enter") toAcct(); }; }
  const mn = $("#me-name"); if (mn && !S.secours) mn.onclick = toAcct;
  fromHash(); render();
}

/* ---------- Notifications (messages) ---------- */
const notifKey = () => "gacolet-notif-" + (S.user && S.user.id ? S.user.id : (S.me || ""));
const notifOn = () => store.get(notifKey()) === true && "Notification" in window && Notification.permission === "granted";
let NOTIF_SEEN = null;
function notifyInit(){}
function notifyNew(){
  if (!NOTIF_SEEN){ NOTIF_SEEN = new Set(S.d.messages.map(m => m.id)); return; }
  const fresh = S.d.messages.filter(m => !NOTIF_SEEN.has(m.id)); fresh.forEach(m => NOTIF_SEEN.add(m.id));
  if (!notifOn() || S.preview) return;
  if (!document.hidden && S.view === "messagerie") return;
  fresh.filter(m => m.who !== S.me && Date.now() - Date.parse(m.at || 0) < 120000).slice(-3).forEach(m => {
    try {
      const n = new Notification(m.who + ", " + chName(m.ch), { body: msgPreview(m).slice(0, 140), icon: "/icon-v4-512.png", tag: m.id });
      n.onclick = () => { window.focus(); const shoot = String(m.ch).startsWith("tg:"); S.ui.msgMode = shoot ? "shoot" : "main"; if (shoot) S.ui.msgShoot = m.ch; else S.ui.msgCh = m.ch; remember(); go("messagerie"); n.close(); };
    } catch(e){}
  });
}

/* ---------- Paramètres ---------- */
async function squareJpeg(file, size){ size = size || 320;
  try { const img = await createImageBitmap(file); const c = document.createElement("canvas"); c.width = c.height = size; const m = Math.min(img.width, img.height);
    c.getContext("2d").drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, size, size);
    const b = await new Promise(r => c.toBlob(r, "image/jpeg", .86)); return b ? new File([b], "photo.jpg", { type: "image/jpeg" }) : file; }
  catch(e){ return file; } }
function pmCard(title, sub){ const c = el("section","pm-card"); c.appendChild(el("h2",null,title)); if (sub) c.appendChild(el("p","muted",sub)); return c; }
function pmField(label, type, value, ac){ const l = el("label","pm-f"); l.appendChild(el("span",null,label)); const i = el("input"); i.type = type || "text"; i.value = value || ""; if (ac) i.autocomplete = ac; l.appendChild(i); return [l, i]; }
async function reloadUsers(){ try { const r = await GC.api("GET","/api/g-users"); S.users = r.users; } catch(e){ toast(e.message); if (!S.users) S.users = []; } render(); }

function vParametres(root){
  const tabs = [["compte","Mon compte"],["notif","Notifications"]].concat(S.role === "owner" ? [["equipe","Équipe et accès"],["codes","Codes clients"]] : []).concat([["cgu","Conditions"]]);
  const tab = tabs.some(t => t[0] === S.ui.pmTab) ? S.ui.pmTab : (S.secours ? "equipe" : "compte");
  root.appendChild(head("Paramètres", "Ton compte, tes notifications, l’équipe et les règles de l’application.", [segm(tabs, tab, v => { S.ui.pmTab = v; remember(); render(); })]));
  const w = el("div","pm"); root.appendChild(w);
  ({compte:pmCompte, notif:pmNotif, equipe:pmEquipe, codes:pmCodes, cgu:pmCgu})[tab](w);
}

function pmCompte(w){
  if (S.secours){
    const c = pmCard("Accès de secours", "Tu es connecté avec le mot de passe commun de l’agence. Il sert seulement à créer les comptes ou à dépanner. Définis ton mot de passe dans Équipe et accès, puis reconnecte-toi avec ton identifiant.");
    const a = el("div","pm-actions"); a.append(btn("Aller à Équipe et accès","lemon", () => { S.ui.pmTab = "equipe"; render(); }), btn("Se déconnecter","", () => GC.logout())); c.appendChild(a); w.appendChild(c); return;
  }
  if (S.preview){ w.appendChild(pmCard("Aperçu", "Les réglages du compte ne sont pas disponibles pendant un aperçu.")); return; }
  const u = S.user || {}, info = u.info || {};
  const cp = pmCard("Photo de profil", "Elle apparaît dans la messagerie et dans le menu.");
  const pr = el("div","pm-av"); pr.appendChild(avatarEl(u.name, 76, { src: info.avatar || "" }));
  const pfi = el("input"); pfi.type = "file"; pfi.accept = "image/*"; pfi.hidden = true;
  const setAv = async url => { const r = await GC.api("PATCH","/api/g-me",{ avatar: url }); S.user.info = r.info; const t = (S.team || []).find(x => x.name === u.name); if (t) t.avatar = url; applyMe({ user: S.user, team: S.team }); };
  pfi.onchange = async () => { const f = pfi.files[0]; pfi.value = ""; if (!f) return; if (!S.assets){ toast("Envoi indisponible."); return; }
    toast("Envoi de la photo…"); try { const up = await S.assets.upload(await squareJpeg(f)); await setAv(up.url); toast("Photo enregistrée."); } catch(x){ toast(x.message || "La photo n’a pas pu être envoyée."); } };
  const pa = el("div","pm-actions"); pa.append(pfi, btn(info.avatar ? "Changer la photo" : "Ajouter une photo","lemon", () => pfi.click()));
  if (info.avatar) pa.appendChild(btn("Retirer la photo","", async () => { try { await setAv(""); toast("Photo retirée."); } catch(x){ toast(x.message); } }));
  pr.appendChild(pa); cp.appendChild(pr); w.appendChild(cp);
  const c1 = pmCard("Mon profil"); const dl = el("dl","pm-dl");
  [["Prénom", u.name], ["Poste", info.poste || "À renseigner"], ["Identifiant", u.username], ["Rôle", ROLE_LABEL[u.role] || u.role]].forEach(([k, v]) => dl.append(el("dt",null,k), el("dd",null,v || ""))); c1.appendChild(dl); w.appendChild(c1);

  const c2 = pmCard("Poste et coordonnées", "Ton métier à l’agence, et comment l’équipe peut te joindre.");
  const f2 = el("form"); const g2 = el("div","pm-grid");
  const [l1, iMail] = pmField("Courriel","email",info.email,"email"), [l2, iTel] = pmField("Téléphone","tel",info.tel,"tel");
  const l0 = el("label","pm-f"); l0.appendChild(el("span",null,"Poste")); const [iPoste, dlP] = posteInput("pm-poste", info.poste); l0.append(iPoste, dlP);
  g2.append(l0, l1, l2); f2.appendChild(g2);
  const s2 = el("button","btn lemon","Enregistrer"); s2.type = "submit"; f2.appendChild(s2);
  f2.onsubmit = async e => { e.preventDefault(); s2.disabled = true; try { const r = await GC.api("PATCH","/api/g-me",{ poste: iPoste.value.trim(), email: iMail.value.trim(), tel: iTel.value.trim() }); S.user.info = r.info; const t = (S.team || []).find(x => x.name === S.user.name); if (t) t.poste = r.info.poste || ""; applyMe({ user: S.user, team: S.team }); toast("Profil enregistré."); } catch(x){ toast(x.message); } s2.disabled = false; };
  c2.appendChild(f2); w.appendChild(c2);

  const c3 = pmCard("Mot de passe", "8 caractères au moins. Le changer déconnecte tes autres appareils.");
  const f3 = el("form"); const g3 = el("div","pm-grid");
  const hid = el("input"); hid.type = "text"; hid.autocomplete = "username"; hid.value = u.username || ""; hid.hidden = true; f3.appendChild(hid);
  const [a1, pCur] = pmField("Mot de passe actuel","password","","current-password"), [a2, pNew] = pmField("Nouveau mot de passe","password","","new-password"), [a3, pNew2] = pmField("Confirmer le nouveau","password","","new-password");
  g3.append(a1, el("span"), a2, a3); f3.appendChild(g3);
  const s3 = el("button","btn lemon","Changer le mot de passe"); s3.type = "submit"; f3.appendChild(s3);
  f3.onsubmit = async e => { e.preventDefault();
    if (pNew.value.length < 8){ toast("Le nouveau mot de passe doit faire au moins 8 caractères."); return; }
    if (pNew.value !== pNew2.value){ toast("Les deux nouveaux mots de passe ne sont pas identiques."); return; }
    s3.disabled = true;
    try { const r = await GC.api("POST","/api/g-me/password",{ current: pCur.value, next: pNew.value }); GC.setKey(r.key); pCur.value = pNew.value = pNew2.value = ""; toast("Mot de passe changé."); } catch(x){ toast(x.message); }
    s3.disabled = false; };
  c3.appendChild(f3); w.appendChild(c3);

  const c4 = pmCard("Session"); c4.appendChild(btn("Se déconnecter","", () => GC.logout())); w.appendChild(c4);
}

function pmNotif(w){
  const c = pmCard("Nouveaux messages", "Une notification quand quelqu’un t’écrit, tant que l’application est ouverte sur cet appareil, même en arrière-plan.");
  const lab = el("label","pm-tg"); const cb = el("input"); cb.type = "checkbox"; cb.checked = notifOn(); lab.append(cb, el("span",null,"Recevoir les notifications sur cet appareil"));
  cb.onchange = () => {
    if (!cb.checked){ store.set(notifKey(), false); toast("Notifications coupées."); render(); return; }
    if (!("Notification" in window)){ cb.checked = false; toast("Cet appareil ne gère pas les notifications."); return; }
    Notification.requestPermission().then(p => {
      if (p === "granted"){ store.set(notifKey(), true); toast("Notifications activées."); }
      else { store.set(notifKey(), false); toast("Notifications refusées : autorise-les dans les réglages du navigateur."); }
      render();
    });
  };
  c.appendChild(lab);
  const st = !("Notification" in window) ? "Cet appareil ne gère pas les notifications." : Notification.permission === "denied" ? "Le navigateur bloque les notifications pour l’application : il faut les autoriser dans ses réglages." : notifOn() ? "Activées sur cet appareil." : "Désactivées sur cet appareil.";
  c.appendChild(el("p","pm-note", st));
  c.appendChild(el("p","pm-note","Sur iPhone, il faut que l’application soit installée sur l’écran d’accueil (iOS 16.4 ou plus récent). Les pastilles du menu, elles, restent toujours affichées."));
  w.appendChild(c);
}

/* Codes clients : un code par client, partagé par toutes les personnes de ce client */
const MOD_LABEL = { "com":"Réseaux sociaux", "meta":"Publicité Meta", "com,meta":"Réseaux et Meta" };
async function reloadCodes(){ try { const r = await GC.api("GET","/api/g-codes"); S.codes = r.clients; } catch(e){ toast(e.message); if (!S.codes) S.codes = []; } render(); }
function copyCode(code){ (navigator.clipboard ? navigator.clipboard.writeText(code) : Promise.reject()).then(() => toast("Code " + code + " copié."), () => toast(code)); }
function pmCodes(w){
  if (S.role !== "owner"){ w.appendChild(pmCard("Codes clients", "Réservé aux propriétaires.")); return; }
  if (!S.codes){ w.appendChild(el("p","empty","Chargement des clients…")); reloadCodes(); return; }
  const c = pmCard("Codes clients", "Un code par client. Toute personne qui s’inscrit avec ce code est rattachée à ce client et ne voit que ses informations : pour un associé, donne-lui le même code. Renouveler un code bloque les nouvelles inscriptions avec l’ancien, sans déconnecter les personnes déjà inscrites.");
  const top = el("div","pm-actions"); const q = el("input","search"); q.type = "search"; q.id = "cd-q"; q.placeholder = "Chercher un client"; q.value = S.ui.cdQ || ""; q.oninput = () => { S.ui.cdQ = q.value; renderSoon(); };
  top.append(q, btn("Nouveau client","lemon", () => editCode({}))); c.appendChild(top);
  const t = norm(S.ui.cdQ), rows = S.codes.filter(x => !t || norm(x.name + " " + x.code).includes(t)).sort((a, b) => (b.active - a.active) || a.name.localeCompare(b.name, "fr"));
  const {w: tw, tb} = table(["Client","Code","~Services","Personnes",""]);
  rows.forEach(x => { const tr = el("tr","row" + (x.active ? "" : " done")); tr.onclick = () => editCode(x);
    td(tr, x.name,"ttl"); td(tr, el("code","cd-code", x.code),"nw"); td(tr, MOD_LABEL[x.modules] || x.modules,"nw hm");
    td(tr, x.people.length ? x.people.length + (x.people.length > 1 ? " personnes" : " personne") : el("span","muted","Personne"),"nw");
    const a = el("div","cd-act");
    const cp = btn("Copier","sm", e => { e.stopPropagation(); copyCode(x.code); });
    const rn = btn("Renouveler","sm", async e => { e.stopPropagation(); if (!rn.classList.contains("armed")){ rn.classList.add("armed"); rn.textContent = "Confirmer"; setTimeout(() => { rn.classList.remove("armed"); rn.textContent = "Renouveler"; }, 3000); return; }
      try { const r = await GC.api("PATCH","/api/g-codes/" + x.id, { renew: true }); toast("Nouveau code pour " + x.name + " : " + r.code); } catch(err){ toast(err.message); } reloadCodes(); });
    a.append(cp, rn); if (!x.active) a.appendChild(el("span","pill l2","Désactivé")); td(tr, a,"nw"); tb.appendChild(tr); });
  c.appendChild(rows.length ? tw : el("p","empty", t ? "Aucun client ne correspond." : "Aucun client pour l’instant."));
  w.appendChild(c);
}
function editCode(x){
  const isNew = !x.id;
  openModal(m => {
    const h = el("h3",null, isNew ? "Nouveau client" : x.name); h.id = "mtitle"; m.appendChild(h);
    if (!isNew){ const r = el("div","cd-big"); r.append(el("code","cd-code", x.code), btn("Copier","sm", () => copyCode(x.code))); m.appendChild(r); }
    const f = el("form","form cd-form"); f.noValidate = true;
    const fld = (label, inp, half) => { const l = el("label", half ? null : "full"); l.appendChild(el("span",null,label)); l.appendChild(inp); f.appendChild(l); return inp; };
    const iN = fld("Nom du client", Object.assign(el("input"), { value: x.name || "", required: true }));
    const iM = el("select"); Object.entries(MOD_LABEL).forEach(([v, l]) => { const o = el("option",null,l); o.value = v; iM.appendChild(o); }); iM.value = x.modules || "com"; fld("Services de l’espace client", iM, true);
    const iF = fld("Formule", Object.assign(el("input"), { value: x.formula || "", placeholder: "Ex. Pack réseaux" }), true);
    const iG = fld("Objectif de contacts par mois (Meta)", Object.assign(el("input"), { type: "number", min: 0, value: x.contacts_goal || "" }), true);
    const iA = el("select"); [["1","Actif"],["0","Désactivé"]].forEach(([v,l]) => { const o = el("option",null,l); o.value = v; iA.appendChild(o); }); iA.value = x.active === 0 ? "0" : "1"; if (!isNew) fld("Accès", iA, true);
    const iQ = fld("Définition écrite du contact qualifié (Meta)", Object.assign(el("textarea"), { rows: 3, value: x.qualified_definition || "" }));
    m.appendChild(f);
    if (!isNew){
      m.appendChild(el("h4","cd-h", "Personnes inscrites"));
      if (!x.people.length) m.appendChild(el("p","muted","Personne ne s’est encore inscrit avec ce code."));
      x.people.forEach(u => { const r = el("div","cd-p"); r.append(el("span",null, (u.prenom + " " + u.nom).trim() + (u.email ? ", " + u.email : "")));
        const b = btn("Retirer l’accès","sm rm", async () => { if (!b.classList.contains("armed")){ b.classList.add("armed"); b.textContent = "Confirmer"; setTimeout(() => { b.classList.remove("armed"); b.textContent = "Retirer l’accès"; }, 3000); return; }
          try { await GC.api("DELETE","/api/g-codes/user/" + u.id); x.people = x.people.filter(y => y !== u); r.remove(); toast("Accès retiré."); reloadCodes(); } catch(e){ toast(e.message); } });
        r.appendChild(b); m.appendChild(r); });
    }
    const act = el("div","actions");
    act.append(btn("Annuler","", () => closeModal()), btn(isNew ? "Créer et générer le code" : "Enregistrer","lemon", async () => {
      if (!iN.value.trim()){ iN.focus(); toast("Indique le nom du client."); return; }
      const body = { name: iN.value.trim(), modules: iM.value.split(","), formula: iF.value.trim(), goal: Number(iG.value) || 0, qualifiedDef: iQ.value.trim() };
      try { if (isNew){ const r = await GC.api("POST","/api/g-codes", body); toast("Code créé : " + r.code); copyCode(r.code); } else { body.active = iA.value === "1"; await GC.api("PATCH","/api/g-codes/" + x.id, body); toast("Client enregistré."); } closeModal(); reloadCodes(); S.meta = null; } catch(e){ toast(e.message); } }));
    m.appendChild(act);
  });
}
function pmEquipe(w){
  if (S.role !== "owner"){ w.appendChild(pmCard("Équipe et accès", "Réservé aux propriétaires.")); return; }
  if (!S.users){ w.appendChild(el("p","empty","Chargement des comptes…")); reloadUsers(); return; }
  if (S.secours) w.appendChild(el("p","pv-note","Accès de secours : définis le mot de passe de chaque propriétaire, puis reconnectez-vous chacun avec votre identifiant."));
  const us = S.users, act = us.filter(u => !u.disabled);
  const c = pmCard("Sièges", act.length + " siège" + (act.length > 1 ? "s" : "") + " actif" + (act.length > 1 ? "s" : "") + " : " + ["owner","member","commercial"].map(r => act.filter(u => u.role === r).length + " " + (ROLE_LABEL[r] || r).toLowerCase() + (act.filter(u => u.role === r).length > 1 ? "s" : "")).join(", ") + ".");
  const top = el("div","pm-actions"); top.appendChild(addBtn("Ajouter un siège", () => seatForm())); c.appendChild(top);
  const { w: tw, tb } = table(["Nom","Poste","Identifiant","Rôle","Mot de passe","Statut",""]);
  us.forEach(u => {
    const tr = el("tr","row" + (u.disabled ? " done" : ""));
    td(tr, u.name + (S.user && u.id === S.user.id ? " (toi)" : ""), "nw");
    { const [pi, pdl] = posteInput("po-" + u.id, u.poste); pi.className = "inl po-in"; pi.disabled = !writable(); let last = u.poste || "";
      const saveP = async () => { const v = pi.value.trim(); if (v === last) return; last = v; try { await GC.api("PATCH","/api/g-users/"+u.id,{ poste: v }); u.poste = v; const t = (S.team || []).find(x => x.name === u.name); if (t) t.poste = v; toast("Poste de " + u.name + " enregistré."); } catch(x){ toast(x.message); } };
      pi.onchange = saveP; pi.onkeydown = e => { if (e.key === "Enter"){ e.preventDefault(); pi.blur(); } }; const c = el("div"); c.append(pi, pdl); td(tr, c); }
    td(tr, u.username, "nw");
    const sel = el("select","inl"); Object.entries(ROLE_LABEL).forEach(([k, l]) => { const o = el("option",null,l); o.value = k; sel.appendChild(o); }); sel.value = u.role; sel.disabled = !writable();
    sel.onchange = async () => { try { await GC.api("PATCH","/api/g-users/"+u.id,{ role: sel.value }); toast(u.name + " passe " + (ROLE_LABEL[sel.value] || "").toLowerCase() + "."); } catch(x){ toast(x.message); } reloadUsers(); };
    td(tr, sel);
    td(tr, u.hasPassword ? "Défini" : el("span","pm-tag","À définir"), "nw");
    td(tr, u.disabled ? "Suspendu" : "Actif", "nw");
    const a = el("div","pm-row-a");
    a.appendChild(btn(u.hasPassword ? "Nouveau mot de passe" : "Définir le mot de passe","sm", () => pwForm(u)));
    a.appendChild(btn(u.disabled ? "Réactiver" : "Suspendre","sm", async () => { try { await GC.api("PATCH","/api/g-users/"+u.id,{ disabled: !u.disabled }); } catch(x){ toast(x.message); } reloadUsers(); }));
    if (!(S.user && u.id === S.user.id)){ const rm = el("button","btn sm rmb","Retirer"); rm.type = "button"; let armed = false;
      rm.onclick = async () => { if (!armed){ armed = true; rm.textContent = "Confirmer"; setTimeout(() => { armed = false; rm.textContent = "Retirer"; }, 3000); return; } try { await GC.api("DELETE","/api/g-users/"+u.id); toast("Siège retiré."); } catch(x){ toast(x.message); } reloadUsers(); };
      a.appendChild(rm); }
    td(tr, a);
    tb.appendChild(tr);
  });
  c.appendChild(tw); w.appendChild(c);

  const r = pmCard("Les rôles");
  const rl = el("dl","pm-dl wide");
  [["Propriétaire","Tout : chaque onglet, toutes les tâches, l’agenda complet, les comptes et ces réglages."],
   ["Membre","Accueil, Agenda (uniquement ses tâches et les événements où il est inscrit), ses tâches, la Messagerie et la Formation."],
   ["Commercial","Comme un membre, plus Commercial, Calendrier clients, Montage, Publications et Campagnes."]].forEach(([k, v]) => rl.append(el("dt",null,k), el("dd",null,v)));
  r.appendChild(rl);
  r.appendChild(el("p","pm-note","Le serveur applique ces limites : une personne ne reçoit jamais les données que son rôle ne permet pas de voir. Les propriétaires peuvent retirer n’importe quel message, les autres seulement les leurs."));
  w.appendChild(r);

  const p = pmCard("Aperçu", "Pour vérifier les réglages : l’application s’ouvre exactement comme la voit la personne choisie, en lecture seule.");
  const g = el("div","pm-grid");
  const others = us.filter(u => !(S.user && u.id === S.user.id) && !u.disabled);
  const s1 = el("select","pick"); others.forEach(u => { const o = el("option",null,u.name + ", " + (ROLE_LABEL[u.role] || "").toLowerCase()); o.value = u.id; s1.appendChild(o); });
  const b1 = btn("Voir comme ce membre","lemon", () => { if (!s1.value) return; GC.setAs(s1.value); location.hash = "#accueil"; location.reload(); });
  const box1 = el("div","pm-f"); box1.append(el("span",null,"Membre de l’agence"), s1, b1);
  const s2 = el("select","pick"); (S.pvClients || []).forEach(x => { const o = el("option",null,x.name); o.value = x.id; s2.appendChild(o); });
  if (!S.pvClients && !S.pvLoading){ S.pvLoading = true; GC.api("GET","/api/g-preview-clients").then(r => { S.pvClients = r.clients; render(); }).catch(() => { S.pvClients = []; }); }
  const b2 = btn("Voir l’espace de ce client","lemon", async () => { if (!s2.value) return; const win = window.open("about:blank","_blank"); try { const r = await GC.api("POST","/api/g-preview-client",{ clientId: Number(s2.value) }); if (win) win.location = r.url; else location.href = r.url; } catch(x){ if (win) win.close(); toast(x.message); } });
  const box2 = el("div","pm-f"); box2.append(el("span",null,"Client"), s2, b2);
  g.append(box1, box2); p.appendChild(g);
  if (!others.length) p.appendChild(el("p","pm-note","Ajoute d’abord un siège pour pouvoir l’ouvrir en aperçu."));
  w.appendChild(p);
}
function seatForm(){
  openForm({ key:"seat", title:"Nouveau siège", intro:"Choisis le rôle et un mot de passe provisoire à transmettre à la personne. Elle pourra le changer dans Paramètres.", okLabel:"Créer le siège", done:"Siège créé.",
    fields:[{k:"name",label:"Prénom",req:"Indique le prénom.",half:true},{k:"username",label:"Identifiant",req:"Choisis un identifiant.",half:true,ph:"ex. lea"},
      {k:"poste",label:"Poste",list:POSTES,ph:"Ex. Vidéaste",half:true},{k:"role",label:"Rôle (droits d’accès)",type:"select",half:true,options:[["member","Membre"],["commercial","Commercial"],["owner","Propriétaire"]]},
      {k:"password",label:"Mot de passe provisoire",type:"password",ph:"8 caractères au moins",req:"Indique un mot de passe provisoire."}],
    onSave: async out => { try { await GC.api("POST","/api/g-users",out); } catch(x){ toast(x.message); throw x; } reloadUsers(); } });
}
function pwForm(u){
  openForm({ key:"pw", title:"Mot de passe de " + u.name, intro: u.hasPassword ? "Le nouveau mot de passe remplace l’ancien et déconnecte ses appareils." : "Définis le mot de passe de ce compte, puis transmets-le à la personne.", okLabel:"Enregistrer", done:"Mot de passe enregistré.",
    fields:[{k:"password",label:"Nouveau mot de passe",type:"password",ph:"8 caractères au moins",req:"Indique un mot de passe."}],
    onSave: async out => { try { await GC.api("PATCH","/api/g-users/"+u.id,{ password: out.password }); } catch(x){ toast(x.message); throw x; } reloadUsers(); } });
}

const CGU = [
  ["Objet", "L’application Gacolet est l’outil de travail de l’Agence Gacolet : organisation, messagerie, suivi des clients et, pour sa partie client, espace où chaque client suit ses contenus et ses résultats. Ces conditions s’appliquent à toute personne à qui l’agence ouvre un accès. Utiliser l’application vaut acceptation de ces conditions."],
  ["Éditeur et hébergement", "Éditeur : Agence Gacolet, Nîmes (Gard) [forme juridique, adresse et numéro SIRET à compléter]. Contact : [adresse de contact à compléter]. Hébergement : Infomaniak Network SA, Genève, Suisse."],
  ["Accès et comptes", "L’accès se fait uniquement sur invitation de l’agence. Chaque compte est personnel : l’identifiant et le mot de passe ne se partagent pas. La personne est responsable de ce qui est fait depuis son compte et prévient l’agence sans attendre en cas de perte ou de doute. L’agence peut suspendre ou retirer un accès à tout moment, notamment à la fin d’une collaboration."],
  ["Rôles", "Chaque compte a un rôle (propriétaire, membre ou commercial) qui détermine les parties visibles. Toute tentative d’accéder à une partie non autorisée, de contourner une limite ou d’utiliser le compte d’une autre personne est interdite."],
  ["Règles d’utilisation", "L’application sert à un usage professionnel. Sont interdits : les contenus illicites, injurieux, discriminatoires ou portant atteinte à la vie privée ; la diffusion hors de l’agence d’informations sur les clients, les prix, les devis ou la stratégie ; l’enregistrement ou la diffusion de la voix d’une personne sans son accord ; l’envoi de fichiers malveillants ; toute action qui perturbe le fonctionnement de l’application."],
  ["Confidentialité", "Les informations consultées dans l’application (clients, contrats, tarifs, contenus en préparation, échanges internes) sont confidentielles. Cette obligation s’applique pendant la collaboration et après sa fin."],
  ["Propriété intellectuelle", "L’application, son code, son nom, son logo et sa présentation appartiennent à l’Agence Gacolet. Ils ne peuvent être copiés, reproduits ou réutilisés sans accord écrit. Les droits sur les contenus réalisés pour les clients suivent les contrats signés avec eux."],
  ["Données personnelles", "Responsable du traitement : Agence Gacolet. Données traitées : prénom, identifiant, coordonnées facultatives (courriel, téléphone), mot de passe (stocké sous forme chiffrée, jamais lisible), messages écrits et vocaux, fichiers envoyés, tâches et éléments d’organisation ; pour les clients, l’identité, l’entreprise, les coordonnées, les réponses au questionnaire et les validations de contenus. Finalités : faire fonctionner l’application, organiser le travail de l’agence et échanger avec les clients. Bases légales : l’exécution du contrat (de travail, de collaboration ou de prestation) et l’intérêt légitime de l’agence à organiser son activité. Destinataires : les membres de l’agence selon leur rôle et l’hébergeur. Les données ne sont ni vendues ni utilisées à des fins publicitaires. Durée de conservation : le temps de l’accès, puis suppression dans les [3 mois, à valider] suivant la fin de la collaboration, sauf obligation légale de conservation."],
  ["Sécurité", "Connexion chiffrée, mots de passe chiffrés, accès limités par rôle, sauvegardes assurées par l’hébergeur. Aucune mesure n’offre une sécurité absolue : chacun contribue en gardant son mot de passe secret et en se déconnectant sur un appareil partagé."],
  ["Vos droits", "Chaque personne peut demander l’accès à ses données, leur rectification, leur effacement, la limitation ou l’opposition au traitement et leur portabilité, en écrivant à l’agence [adresse de contact à compléter]. En cas de désaccord, une réclamation peut être déposée auprès de la CNIL (cnil.fr)."],
  ["Stockage sur l’appareil", "L’application garde sur l’appareil la session de connexion et quelques préférences (filtres, messages lus, notifications). Elle n’utilise ni cookie publicitaire ni outil de mesure d’audience."],
  ["Disponibilité", "L’agence fait le nécessaire pour que l’application fonctionne, sans garantir une disponibilité continue. Des interruptions peuvent avoir lieu pour maintenance ou en cas d’incident chez l’hébergeur."],
  ["Évolution des conditions", "L’agence peut faire évoluer ces conditions. La version en vigueur est toujours consultable dans Paramètres."],
  ["Droit applicable", "Ces conditions sont soumises au droit français. En cas de litige, une solution amiable est recherchée en priorité ; à défaut, les tribunaux compétents sont ceux du ressort de Nîmes [à valider]."]
];
function pmCgu(w){
  const c = pmCard("Conditions générales d’utilisation et protection des données", "Version 1, octobre 2026.");
  if (S.role === "owner") c.appendChild(el("p","pv-note","Visible des propriétaires seulement : les mentions entre crochets sont à compléter, et le texte est à faire relire par un professionnel du droit avant de le présenter aux clients."));
  const box = el("div","pm-legal");
  CGU.forEach(([t, x], i) => { box.appendChild(el("h3",null,(i + 1) + ". " + t)); box.appendChild(el("p",null,x)); });
  c.appendChild(box); w.appendChild(c);
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
  try { applyMe(await GC.api("GET","/api/g-me")); } catch(e){}
  loadCgroups(); setInterval(loadCgroups, 5 * 60000);
  if (!S.me){ if (S.isOwner){ S.me = "Gabriel"; meSel.value = "Gabriel"; } else askWho(); }
  if (S.d.messages) notifyInit();
  COLLS.forEach(c => {
    db.collection(c).onSnapshot(snap => {
      S.d[c] = snap.docs.filter(d => d.exists).map(d => Object.assign({id: d.id}, d.data()));
      if (c === "messages") notifyNew();
      S.got[c] = true; if (!S.ready && COLLS.every(x => S.got[x])) S.ready = true;
      renderSoon();
    }, err => { /* coupure passagère : le bandeau « Hors connexion » s'affiche et la synchro reprend seule */ });
  });
  setTimeout(() => { if (!S.ready){ S.ready = true; renderSoon(); } }, 8000);
})();
})();
