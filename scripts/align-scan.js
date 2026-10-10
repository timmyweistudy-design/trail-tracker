// 排版對齊掃描（2026-10-09 使用者規則）：「次要文字靠左的話，最左邊不能比標題更往左」
// 找：同一個容器裡「標題（粗體／字比較大、短）」後面接的文字區塊——標題是置中的、次要文字是靠左的、而且次要文字的左緣比標題的左緣更左 → 回報。
// 用法：node scripts/align-scan.js（要 LD_LIBRARY_PATH）；截圖在 scripts/tests/out/align/
const ROOT = require("path").resolve(__dirname, ".."); const { chromium } = require(ROOT + "/node_modules/playwright"); const { spawn } = require("child_process");
const MOCK = require("fs").readFileSync(ROOT + "/scripts/tests/soc-mock.js", "utf8"); const OUT = ROOT + "/scripts/tests/out/" + (((process.argv.find(a => a.startsWith("--rule=")) || "").slice(7) || "align") + "/");
const PORT = +process.env.TT_PORT || 8979;
const RULE = (process.argv.find(a => a.startsWith("--rule=")) || "--rule=align").slice(7);   // --rule=center：置中偵測（tests/center-rule.js）
const SCAN = require(RULE === "center" ? "./tests/center-rule" : RULE === "titles" ? "./tests/title-survey-rule" : "./tests/align-rule");
(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: ROOT + "/web", stdio: "ignore" }); await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
  await require(ROOT + "/scripts/tests/fake-weather")(p);
  await p.addInitScript(() => { if (sessionStorage.getItem("seed")) return; sessionStorage.setItem("seed", "1"); localStorage.setItem("tt_lang", "zh"); ["tt_onboarded_v2", "tt_coach_trail", "tt_locperm_prompted", "tt_coach_record", "tt_coach_record_tools", "tt_coach_peaks", "tt_coach_team", "tt_coach_pet"].forEach(k => localStorage.setItem(k, "1")); localStorage.setItem("tt_debug_km", "95"); localStorage.setItem("tt_pet_aff", "45"); localStorage.setItem("tt_pet_aff_t", new Date().toISOString()); localStorage.setItem("tt_pet_gifts", JSON.stringify([{ id: "pine", t: new Date().toISOString() }])); });
  await p.addInitScript(MOCK); await p.goto(`http://localhost:${PORT}/`); await require(ROOT + "/scripts/tests/ready")(p);
  await p.evaluate(() => window.__installFakeSupa({}));
  const kill = () => p.evaluate(() => { document.querySelectorAll(".tour,.coach,.ttdlg-ov,.pet-modal,.sheet.open,#debugPanel,.premium-mask,.pv-mask,.doc-ov").forEach(e => e.remove()); document.querySelectorAll(".sheet-close, [data-close]").forEach(b => { try { if (b.offsetParent) b.click(); } catch (e) { } }); });
  const all = {};
  const shot = async (name, fn) => { try { await kill(); await fn(); await p.waitForTimeout(700); const r = await p.evaluate(SCAN); all[name] = r; await p.screenshot({ path: OUT + name + ".png", fullPage: false }); console.log(name.padEnd(16), r.length ? JSON.stringify(r) : "ok"); } catch (e) { console.log(name, "ERR", e.message.split("\n")[0]); } };
  for (const v of ["explore", "record", "pet", "me", "social"]) await shot("view-" + v, async () => { await p.click(`.tab[data-view="${v}"]`); await p.waitForTimeout(800); });
  await shot("pet-help", async () => { await p.click('.tab[data-view="pet"]'); await p.waitForTimeout(500); await p.click("#petHelp"); });
  await shot("pet-dex", async () => { await p.click("#petDex"); });
  await shot("pet-hat", async () => { await p.evaluate(() => openHatPicker()); });
  await shot("pet-photo", async () => { await p.evaluate(() => openPetPhoto()); });
  await shot("pet-gift", async () => { await p.evaluate(() => petGiftShow("pine")); });
  await shot("pet-visit", async () => { await p.evaluate(() => Pets.renderFriends()); await p.waitForTimeout(600); await p.click('#petFriends .fp-visit[data-id="u1"]'); });
  // 步道詳情四個分頁＋探索清單往下（2026-10-10 置中排查加的）
  for (const tab of ["ov", "pre", "rt", "nb"]) await shot("detail-" + tab, async () => { await p.click('.tab[data-view="explore"]'); await p.evaluate(() => openDetail("forestry-004")); await p.waitForTimeout(1200); await p.evaluate(t => { const b = document.querySelector(`.detail-tabs [data-tab="${t}"], .detail-tabs button[data-pane="${t}"]`); if (b) b.click(); }, tab); await p.waitForTimeout(600); });
  for (const y of [500, 1400]) await shot("explore-" + y, async () => { await p.click('.tab[data-view="explore"]'); await p.waitForTimeout(400); await p.evaluate(y => { document.scrollingElement.scrollTop = y; }, y); });
  await shot("upgrade-free", async () => { await p.evaluate(() => { window.__pmSave = window.PERSONAL_MODE; window.PERSONAL_MODE = false; Premium.openUpgrade("peaks", "你已經蓋了 3 章"); window.PERSONAL_MODE = window.__pmSave; }); });
  await shot("settings-open", async () => { await p.click('.tab[data-view="me"]'); await p.evaluate(() => { document.querySelectorAll("#view-me details").forEach(d => d.open = true); const z = document.getElementById("setZone"); if (z) z.scrollIntoView(); }); });
  for (const sv of ["friends", "explore", "search", "notif", "me"]) await shot("social-" + sv, async () => { await p.click('.tab[data-view="social"]'); await p.waitForTimeout(600); await p.evaluate(sv => { const b = document.querySelector(`.sub-tab[data-sub="${sv}"]`); if (b) b.click(); }, sv); await p.waitForTimeout(700); });
  // 內頁往下捲，多掃幾段
  for (const v of ["pet", "me"]) for (const y of [700, 1400, 2100]) await shot(`scroll-${v}-${y}`, async () => { await p.click(`.tab[data-view="${v}"]`); await p.waitForTimeout(500); await p.evaluate(y => { const el = document.scrollingElement; el.scrollTop = y; document.querySelectorAll(".view.active, main").forEach(m => m.scrollTop = y); }, y); });
  // 測試面板裡的視窗範例（明信片簿、成就、求救卡、計畫書…）
  const DBG = ["開明信片簿", "開走過的縣市", "開第一張明信片", "開成就頁", "求救卡", "開收集冊", "山頂天氣", "回報路況", "留守人看到的", "人氣範例", "今年故事", "一句話搜尋", "山社", "登山計畫書", "附近步道", "低電量提醒", "揪團", "進階分析", "年度回顧", "結算頁範例", "重看語言選擇"];
  for (const lb of DBG) await shot("dbg-" + lb, async () => {
    await p.evaluate(async () => { await ensureScript("js/debug.js"); window.ttIsOwner = async () => true; if (!document.getElementById("debugPanel")) await window.openDebugPanel(); }); await p.waitForSelector("#debugPanel button", { timeout: 5000, state: "attached" });
    await p.waitForTimeout(300);
    await p.evaluate(() => document.querySelectorAll("#debugPanel details").forEach(d => { d.open = true; d.dispatchEvent(new Event("toggle")); })); await p.waitForTimeout(300);
    await p.evaluate(lb => { const b = [...document.querySelectorAll("#debugPanel button")].find(x => x.textContent.includes(lb)); if (!b) throw new Error("no button " + lb); b.click(); }, lb);
    await p.waitForTimeout(900);
  });
  require("fs").writeFileSync(OUT + "result.json", JSON.stringify(all, null, 1));
  await b.close(); srv.kill();
})();
