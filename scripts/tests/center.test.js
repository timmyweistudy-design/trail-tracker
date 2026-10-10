// 細節對齊與置中（2026-10-10 細節輪，docs/opt-round-3.md）：面板標題在正中間、彈窗標題一律置中、步道卡標籤與四格資訊置中
const __TTP = +process.env.TT_PORT || 8954;
const ROOT = require("path").resolve(__dirname, "../.."), fs = require("fs"); const { chromium } = require(ROOT + "/node_modules/playwright"); const { spawn } = require("child_process");
const MOCK = fs.readFileSync(__dirname + "/soc-mock.js", "utf8"); const CENTER = require("./center-rule"), TITLES = require("./title-survey-rule"); const errs = []; let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(__TTP)], { cwd: ROOT + "/web", stdio: "ignore" }); await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch();
  for (const lang of ["zh", "en"]) {
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); await require(__dirname + "/fake-weather")(p); p.on("pageerror", e => errs.push(e.message));
    await p.addInitScript(l => { if (sessionStorage.getItem("seed")) return; sessionStorage.setItem("seed", "1"); localStorage.setItem("tt_lang", l); ["tt_onboarded_v2", "tt_coach_trail", "tt_locperm_prompted", "tt_coach_record", "tt_coach_record_tools", "tt_coach_peaks", "tt_coach_team", "tt_coach_pet", "tt_coach_soc_explore", "tt_coach_soc_friends", "tt_coach_soc_me", "tt_coach_soc_search", "tt_coach_soc_notif"].forEach(k => localStorage.setItem(k, "1")); }, lang);
    await p.addInitScript(MOCK); await p.goto(`http://localhost:${__TTP}/`); await require(__dirname + "/ready")(p);
    await p.evaluate(async () => { window.__installFakeSupa({}); if (window.loadSocial) await window.loadSocial(); await ensureScript("js/debug.js"); });
    const clean = () => p.evaluate(() => document.querySelectorAll(".tour,.coach,.ttdlg-ov,.pv-mask,.pet-modal,.doc-ov,.ach-modal,.composer-mask").forEach(e => e.remove()));
    const offOf = sel => p.evaluate(sel => { const t = document.querySelector(sel); if (!t) return null; const box = (t.closest(".pv-head, .composer-head, .doc-head, .ach-pgnav, .ach-modal-head") || t.parentElement).getBoundingClientRect(); const rg = document.createRange(); rg.selectNodeContents(t); const rs = [...rg.getClientRects()].filter(r => r.width > 1); if (!rs.length) return null; const l = Math.min(...rs.map(r => r.left)), r = Math.max(...rs.map(r => r.right)); return Math.round((l + r) / 2 - (box.left + box.right) / 2); }, sel);
    const panels = [
      ["clubs (A1)", () => Clubs.open(), "#clTitle"],
      ["teams (A1)", () => Team.openSheet(), ".pv-head b"],
      ["user list (A1)", () => Discover.openUserList("u1", "followers"), ".pv-head b"],
      ["composer (A2)", () => Composer.open({ id: "x", trailName: "測試步道", distanceKm: 3, elapsedMs: 3.6e6, date: new Date().toISOString(), track: [] }), ".composer-head b"],
      ["SOS card (A3)", () => ttDebug.openSos(), ".sos-card h2"],
      ["achievements title (A4)", () => openAchTree(), ".ach-modal-h"],
      ["achievements pager (A4)", () => openAchTree(), ".ach-pgnav-t"],
      ["licenses page (A5)", () => ttOpenDoc("licenses"), ".doc-head b"],
    ];
    for (const [name, fn, sel] of panels) {
      await clean(); await p.evaluate(fn); await p.waitForTimeout(1100);
      const off = await offOf(sel); ok(off !== null && Math.abs(off) <= 4, `${lang}: ${name} title is centered (off ${off}px)`);
      const heads = (await p.evaluate(CENTER)).filter(x => x.k === "head" && !/dv-wx-row/.test(x.where)); ok(heads.length === 0, `${lang}: ${name} — no off-centre header anywhere on screen ${JSON.stringify(heads)}`);
    }
    // C2：其他彈窗的標題也都置中（19 個盤點過；這裡抽夥伴的三個＋收集冊）
    for (const [name, fn] of [["dress-up", () => openHatPicker()], ["pet photo", () => openPetPhoto()], ["summit log", () => Peaks.open()], ["handbook", () => { document.querySelector('.tab[data-view="pet"]').click(); setTimeout(() => document.querySelector("#petDex").click(), 600); }]]) {
      await clean(); await p.evaluate(fn); await p.waitForTimeout(1400);
      const t = await p.evaluate(TITLES); ok(t.length && t.every(x => x.k === "置中"), `${lang}: ${name} title centered like every other popup ${JSON.stringify(t)}`);
    }
    // B1：步道卡標籤置中（標題仍靠左）；B2：步道詳情四格置中
    await clean(); await p.evaluate(() => { document.querySelector('.tab[data-view="explore"]').click(); window.scrollTo(0, 0); }); await p.waitForTimeout(500);
    const card = await p.evaluate(() => { const c = document.querySelector("#trailList .jcard"); const cr = c.getBoundingClientRect(); const bs = [...c.querySelectorAll(".badges > *")].map(e => e.getBoundingClientRect()); const h = c.querySelector("h3").getBoundingClientRect(); return { badgeOff: Math.round((Math.min(...bs.map(r => r.left)) + Math.max(...bs.map(r => r.right))) / 2 - (cr.left + cr.right) / 2), titleLeft: Math.round(h.left - cr.left) }; });
    ok(Math.abs(card.badgeOff) <= 4 && card.titleLeft < 40, `${lang}: trail card tags centered, title stays left ${JSON.stringify(card)}`);
    await p.evaluate(() => openDetail("forestry-004")); await p.waitForTimeout(1500);
    const cells = await p.evaluate(() => [...document.querySelectorAll(".dv-stat")].map(c => { const cr = c.getBoundingClientRect(); const v = c.querySelector(".dv-stat-v"); const rg = document.createRange(); rg.selectNodeContents(v); const rs = [...rg.getClientRects()].filter(r => r.width > 1); return Math.round((Math.min(...rs.map(r => r.left)) + Math.max(...rs.map(r => r.right))) / 2 - (cr.left + cr.right) / 2); }));
    ok(cells.length === 4 && cells.every(o => Math.abs(o) <= 4), `${lang}: trail detail's four info cells centered ${JSON.stringify(cells)}`);
    await p.context().close();
  }
  console.log("ERRS", JSON.stringify(errs)); console.log("FAILS", fails + (errs.length ? 1 : 0)); await b.close(); srv.kill(); process.exit(0);
})();
