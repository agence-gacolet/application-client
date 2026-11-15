// Gardien de l'appli : lance server.js et le relance tout seul s'il s'arrête (mise à jour, plantage).
// Infomaniak ne surveille que ce processus, qui ne s'arrête jamais : plus besoin de cliquer « Redémarrer » dans le Manager.
// Code de sortie 75 = redémarrage voulu après une mise à jour (relance immédiate). Plantages répétés = attente croissante (30 s au plus).
const { spawn } = require("child_process");
let child = null, fails = 0, started = 0, stopping = false;
function go() {
  started = Date.now();
  child = spawn(process.execPath, ["--env-file-if-exists=.env", "server.js"], { stdio: "inherit", cwd: __dirname, env: Object.assign({}, process.env, { GACOLET_SUPERVISED: "1" }) });
  child.on("exit", code => {
    if (stopping) return;
    fails = code === 75 ? 0 : Date.now() - started < 15000 ? fails + 1 : 0;
    const wait = code === 75 ? 200 : Math.min(30000, 1000 * 2 ** fails);
    console.log("[gardien] serveur arrêté (code " + code + "), relance dans " + wait + " ms");
    setTimeout(go, wait);
  });
}
["SIGTERM", "SIGINT"].forEach(s => process.on(s, () => { stopping = true; if (child) child.kill(s); setTimeout(() => process.exit(0), 3000).unref(); child ? child.once("exit", () => process.exit(0)) : process.exit(0); }));
go();
