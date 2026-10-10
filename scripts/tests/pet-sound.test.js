// 夥伴音效暫停（2026-10-10 使用者：「還是差很多，先取消，列待辦」）：一般使用者完全不出聲、不下載任何音檔、設定裡沒有音效開關，
// App 裡也不再附音檔（之前 125 MB）。重做時從 git 還原（docs/roadmap.md 待辦），再把這支測試換回精緻版的版本。觸覺回饋照常。
const __TTP = +process.env.TT_PORT || 8943;
const __path = require("path"), __fs = require("fs");
const ROOT = __path.resolve(__dirname, "../.."); const { chromium } = require(ROOT + "/node_modules/playwright"); const { spawn } = require("child_process");
const MOCK = __fs.readFileSync(__dirname + "/soc-mock.js", "utf8"); const errs = []; let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
ok(!__fs.existsSync(ROOT + "/web/sounds"), "no sound files ship with the app while sound is paused");
ok(/const PET_SOUND_READY = false;/.test(__fs.readFileSync(ROOT + "/web/js/pet.js", "utf8")), "sound master switch is off");
ok(!/試聽音效|音效試聽板/.test(__fs.readFileSync(ROOT + "/web/js/debug.js", "utf8")), "debug panel no longer offers sound previews");
(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(__TTP)], { cwd: ROOT + "/web", stdio: "ignore" }); await new Promise(r => setTimeout(r, 1200)); const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); await require(__dirname + "/fake-weather")(p); p.on("pageerror", e => errs.push(e.message));
  const reqs = []; p.on("request", r => { if (/\/sounds\//.test(r.url())) reqs.push(r.url()); });
  await p.addInitScript(() => { if (sessionStorage.getItem("seed")) return; sessionStorage.setItem("seed", "1"); localStorage.setItem("tt_lang", "zh"); localStorage.setItem("tt_debug_km", "90"); ["tt_onboarded_v2", "tt_coach_trail", "tt_locperm_prompted", "tt_coach_pet"].forEach(k => localStorage.setItem(k, "1")); localStorage.setItem("tt_pet_woke", String(Date.now())); });
  await p.addInitScript(MOCK); await p.goto(`http://localhost:${__TTP}/`); await require(__dirname + "/ready")(p);
  await p.evaluate(() => document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e => e.remove())); await p.click('.tab[data-view="pet"]'); await p.waitForTimeout(800);
  const r = await p.evaluate(async () => {
    window.__petSndLog = []; window.__hap = []; window.Capacitor = { isNativePlatform: () => true, getPlatform: () => "ios", Plugins: { Haptics: { impact: a => window.__hap.push("impact:" + a.style), notification: a => window.__hap.push("notify:" + a.type) } } };
    document.querySelector("#petEmoji").click(); petSound("gift"); await PetStage.react("pat"); petSoundScene(); await new Promise(r => setTimeout(r, 2500));
    document.querySelector("#petHelp").click(); await new Promise(r => setTimeout(r, 500));
    return { snd: window.__petSndLog.slice(), sw: ["petSoundSw", "petAmbSw", "petMusicSw", "petUiSw"].some(id => document.getElementById(id)), hap: window.__hap.slice() };
  });
  ok(r.snd.length === 0 && reqs.length === 0, "nothing plays and no sound file is requested " + JSON.stringify([r.snd, reqs.slice(0, 2)]));
  ok(!r.sw, "settings show no sound switches");
  ok(r.hap.length >= 1 && r.hap.every(x => x.startsWith("impact:")), "haptics still work " + JSON.stringify(r.hap));
  console.log("ERRS", JSON.stringify(errs)); console.log("FAILS", fails + (errs.length ? 1 : 0)); await b.close(); srv.kill(); process.exit(0);
})();
