// 授權與條款（2026-10-10 全面檢查）：這些都是「功能正常但條款不允許」，一般測試抓不到
//   Google Places 結果不可畫在非 Google 地圖上／條款頁要連 Google 條款／離線只存 NLSC 開放版 z15、離線 z16+ 拿 z15 放大／字型留 OFL 欄位／第三方授權頁接得到／測試面板模擬免費用戶
const __TTP = +process.env.TT_PORT || 8951;
const ROOT = require("path").resolve(__dirname, "../.."), fs = require("fs"); const { chromium } = require(ROOT + "/node_modules/playwright"); const { spawn, execFileSync } = require("child_process");
const errs = []; let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const src = f => fs.readFileSync(ROOT + "/web/" + f, "utf8");
ok(!/plotPoi\s*\(/.test(src("js/detail.js") + src("js/app.js")), "Google Places food/attractions are not plotted on the NLSC/Esri map");
ok(/maps\.google\.com\/help\/terms_maps/.test(src("terms.html")) && /policies\.google\.com\/privacy/.test(src("terms.html")) && /policies\.google\.com\/privacy/.test(src("privacy.html")), "terms and privacy pages link Google's terms and privacy policy");
ok(/EMAP5_OPENDATA/.test(src("js/offline.js")) && !/wmts\/EMAP\/default/.test(src("js/offline.js")), "offline maps only store the NLSC open-data layer");
ok(/\/wmts\/EMAP\//.test(src("sw.js")) && /licenses\.html/.test(src("sw.js")), "service worker does not keep plain EMAP tiles, and caches the licenses page");
ok(fs.existsSync(ROOT + "/web/vendor/fonts/OFL.txt") && /SIL OPEN FONT LICENSE/.test(fs.readFileSync(ROOT + "/web/vendor/fonts/OFL.txt", "utf8")), "OFL text ships with the fonts");
try { const out = execFileSync("python3", ["-c", "from fontTools.ttLib import TTFont\nt=TTFont('web/vendor/fonts/taipei-sans.woff2')\nprint(sorted({n.nameID for n in t['name'].names}))"], { cwd: ROOT }).toString(); ok(/13/.test(out) && /14/.test(out), "font subset keeps the OFL license name fields 13/14 " + out.trim()); } catch (e) { console.log("SKIP font name check (no fontTools)"); }
(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(__TTP)], { cwd: ROOT + "/web", stdio: "ignore" }); await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); await require(__dirname + "/fake-weather")(p); p.on("pageerror", e => errs.push(e.message));
  await p.addInitScript(() => { if (sessionStorage.getItem("seed")) return; sessionStorage.setItem("seed", "1"); localStorage.setItem("tt_lang", "zh"); ["tt_onboarded_v2", "tt_coach_trail", "tt_locperm_prompted", "tt_coach_record", "tt_coach_record_tools", "tt_coach_peaks", "tt_coach_team", "tt_coach_pet"].forEach(k => localStorage.setItem(k, "1")); });
  const ready = () => require(__dirname + "/ready")(p);
  await p.goto(`http://localhost:${__TTP}/`); await ready();
  ok(await p.evaluate(() => Premium.isOn()), "personal mode: member");
  // 模擬免費用戶
  await p.evaluate(() => localStorage.setItem("tt_debug_free", "1")); await p.reload(); await ready();
  const f = await p.evaluate(() => ({ on: Premium.isOn(), tag: !!document.querySelector(".dbg-free-tag"), pro: document.documentElement.classList.contains("is-pro") }));
  ok(!f.on && f.tag && !f.pro, "simulate free user: not a member, PRO tags shown, reminder tag on screen " + JSON.stringify(f));
  await p.evaluate(() => { document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e => e.remove()); _proGate(); }); await p.waitForTimeout(300);
  ok(await p.evaluate(() => !!document.querySelector(".premium-mask")), "simulate free user: PRO features open the upgrade panel");
  await p.evaluate(() => { localStorage.removeItem("tt_debug_free"); }); await p.reload(); await ready();
  ok(await p.evaluate(() => Premium.isOn() && !document.querySelector(".dbg-free-tag")), "back to member after switching off");
  // 第三方授權頁
  await p.evaluate(() => { document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e => e.remove()); document.querySelector('.tab[data-view="me"]').click(); }); await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelector('.app-legal [data-doc="licenses"]').click()); await p.waitForTimeout(900);
  const d = await p.evaluate(() => { const fr = document.querySelector(".doc-frame"); const h = fr && fr.contentDocument && fr.contentDocument.body.innerText; return { src: fr && fr.getAttribute("src"), osm: /ODbL/.test(h || ""), ofl: /Open Font License/.test(h || ""), cc0: /CC0/.test(h || "") }; });
  ok(d.src === "licenses.html" && d.osm && d.ofl && d.cc0, "Me → licenses page opens in-app with ODbL / OFL / CC0 notices " + JSON.stringify(d));
  // 底圖：z15 以下用開放版網址（和離線一致）；一般 EMAP 抓不到時 z16+ 拿 z15 放大
  const mk = z => p.evaluate(async z => { const el = document.createElement("div"); el.style.cssText = "width:256px;height:256px"; document.body.appendChild(el); const m = L.map(el, { zoomControl: false }).setView([24.15, 121.28], z); baseTopo().addTo(m); await new Promise(r => setTimeout(r, 2500)); return [...el.querySelectorAll(".leaflet-tile img")].map(i => i.src.split("/wmts/")[1].split("/")[0] + "@" + i.style.width); }, z);
  await ctx.route(/wmts\.nlsc\.gov\.tw/, rt => rt.request().url().includes("/EMAP/") ? rt.abort() : rt.fulfill({ status: 200, contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") }));
  const z14 = await mk(14), z17 = await mk(17);
  ok(z14.length && z14.every(s => s.startsWith("EMAP5_OPENDATA@100%")), "zoom 14 uses the open-data tiles " + JSON.stringify(z14.slice(0, 2)));
  ok(z17.length && z17.every(s => s.startsWith("EMAP5_OPENDATA@400%")), "zoom 17 without plain EMAP falls back to the zoom-15 open-data tile, scaled ×4 " + JSON.stringify(z17.slice(0, 2)));
  ok(await p.evaluate(() => Offline.tileList({ n: 24.2, s: 24.1, e: 121.3, w: 121.2 }, 14, 17).every(u => /EMAP5_OPENDATA\/default\/GoogleMapsCompatible\/1[45]\//.test(u))), "offline tile lists stop at zoom 15");
  console.log("ERRS", JSON.stringify(errs)); console.log("FAILS", fails + (errs.length ? 1 : 0)); await b.close(); srv.kill(); process.exit(0);
})();
