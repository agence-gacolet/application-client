// Notifications push (Web Push, norme RFC 8030 / 8291 / 8292), sans dépendance externe.
// Les clés VAPID sont créées au premier démarrage et gardées en base : aucune clé à saisir.
const crypto = require("crypto");

const b64u = b => Buffer.from(b).toString("base64url");
const unb64u = s => Buffer.from(String(s || ""), "base64url");
const hkdf = (salt, ikm, info, len) => Buffer.from(crypto.hkdfSync("sha256", ikm, salt, info, len));

function encrypt(sub, payload) {
  const ua = unb64u(sub.keys.p256dh), auth = unb64u(sub.keys.auth);
  const me = crypto.createECDH("prime256v1"); me.generateKeys();
  const mePub = me.getPublicKey(), shared = me.computeSecret(ua);
  const ikm = hkdf(auth, shared, Buffer.concat([Buffer.from("WebPush: info\0"), ua, mePub]), 32);
  const salt = crypto.randomBytes(16);
  const cek = hkdf(salt, ikm, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(salt, ikm, Buffer.from("Content-Encoding: nonce\0"), 12);
  const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const head = Buffer.alloc(21); salt.copy(head, 0); head.writeUInt32BE(4096, 16); head.writeUInt8(65, 20);
  return Buffer.concat([head, mePub, ct]);
}

function vapidHeader(endpoint, keys) {
  const enc = o => b64u(JSON.stringify(o));
  const unsigned = enc({ typ: "JWT", alg: "ES256" }) + "." + enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: "mailto:agencegacolet@gmail.com" });
  const pub = unb64u(keys.pub);
  const key = crypto.createPrivateKey({ key: { kty: "EC", crv: "P-256", x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)), d: keys.priv }, format: "jwk" });
  const sig = crypto.sign("sha256", Buffer.from(unsigned), { key, dsaEncoding: "ieee-p1363" });
  return "vapid t=" + unsigned + "." + b64u(sig) + ", k=" + keys.pub;
}

module.exports = function (db) {
  let ready = null, KEYS = null;
  const init = () => ready || (ready = (async () => {
    await db.run("CREATE TABLE IF NOT EXISTS push_cfg (k VARCHAR(40) NOT NULL PRIMARY KEY, v TEXT NOT NULL)");
    await db.run("CREATE TABLE IF NOT EXISTS push_subs (id VARCHAR(64) NOT NULL PRIMARY KEY, kind VARCHAR(4) NOT NULL, owner VARCHAR(160) NOT NULL, sub TEXT NOT NULL, created_at VARCHAR(30) NOT NULL)");
    const r = await db.one("SELECT v FROM push_cfg WHERE k = 'vapid'");
    if (r) KEYS = JSON.parse(r.v);
    else {
      const e = crypto.createECDH("prime256v1"); e.generateKeys();
      KEYS = { pub: b64u(e.getPublicKey()), priv: b64u(e.getPrivateKey()) };
      await db.run("INSERT INTO push_cfg (k, v) VALUES ('vapid', ?)", [JSON.stringify(KEYS)]);
    }
  })().catch(e => { ready = null; throw e; }));

  const idOf = endpoint => crypto.createHash("sha256").update(String(endpoint)).digest("hex");
  const okSub = s => s && typeof s.endpoint === "string" && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000 && s.keys && s.keys.p256dh && s.keys.auth;

  async function save(kind, owner, sub) {
    await init(); if (!okSub(sub)) throw Object.assign(new Error("Abonnement invalide."), { status: 400 });
    const id = idOf(sub.endpoint), clean = JSON.stringify({ endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } });
    await db.run("DELETE FROM push_subs WHERE id = ?", [id]);
    await db.run("INSERT INTO push_subs (id, kind, owner, sub, created_at) VALUES (?,?,?,?,?)", [id, kind, String(owner).slice(0, 160), clean, new Date().toISOString()]);
  }
  async function remove(endpoint) { await init(); await db.run("DELETE FROM push_subs WHERE id = ?", [idOf(endpoint)]); }

  // Envoie à toutes les personnes (owners) d’un type donné ; les abonnements expirés sont retirés.
  async function send(kind, owners, data) {
    try {
      await init(); if (!owners.length) return 0;
      const rows = (await db.all("SELECT id, owner, sub FROM push_subs WHERE kind = ?", [kind])).filter(r => owners.includes(r.owner));
      let n = 0;
      await Promise.all(rows.map(async r => {
        try {
          const sub = JSON.parse(r.sub), body = encrypt(sub, JSON.stringify(data));
          const res = await fetch(sub.endpoint, { method: "POST", headers: { Authorization: vapidHeader(sub.endpoint, KEYS), "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: "86400", Urgency: "high" }, body });
          if (res.status === 404 || res.status === 410) await db.run("DELETE FROM push_subs WHERE id = ?", [r.id]);
          else if (res.ok) n++;
          else console.error("Push", res.status, (await res.text()).slice(0, 200));
        } catch (e) { console.error("Push", e.message); }
      }));
      return n;
    } catch (e) { console.error("Push", e.message); return 0; }
  }
  return { init, save, remove, send, key: async () => { await init(); return KEYS.pub; }, _encrypt: encrypt, _vapid: vapidHeader };
};
