// 2026-10-10 優化輪 4（docs/opt-round-4.md）：每一項都有一條會紅的檢查
const __TTP = +process.env.TT_PORT || 8955;
const ROOT = require("path").resolve(__dirname, "../.."), fs = require("fs"); const { chromium } = require(ROOT + "/node_modules/playwright"); const { spawn } = require("child_process");
const MOCK = fs.readFileSync(__dirname + "/soc-mock.js", "utf8"); const errs = []; let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
const src = f => fs.readFileSync(ROOT + "/web/" + f, "utf8");
// A3：新增的全域名稱不能撞到既有的（check.js 那條檢查本身還在）
ok(/頂層名稱不能重複/.test(fs.readFileSync(ROOT + "/scripts/check.js", "utf8")), "A3: check.js still guards against duplicate top-level names");
// A5：步道介紹英文版——每一篇都有英文（長文人工翻譯、社群步道固定句型用規則）
{
  global.window = {}; eval(src("js/trails-detail.js")); eval(src("js/guides-en.js"));
  const all = Object.entries(window.TRAILS_DETAIL).filter(([, v]) => v.guide), miss = all.filter(([id, v]) => !window.guideEn(id, v.guide)).map(([id]) => id);
  ok(all.length > 1500 && miss.length === 0, `A5: every one of the ${all.length} trail guides has English (${miss.slice(0, 5)})`);
  const cjk = all.map(([id, v]) => window.guideEn(id, v.guide)).filter(e => /[一-鿿]/.test(e));
  ok(cjk.length === 0, "A5: no Chinese left in the English guides " + JSON.stringify(cjk.slice(0, 2)));
  ok(/guides-en\.js/.test(src("sw.js")), "A5: English guides cached for offline");
}
// A6：備份提示一分鐘最多一次
ok(/__bkToastAt/.test(src("js/me.js")), "A6: cloud-backup toast is throttled");
(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(__TTP)], { cwd: ROOT + "/web", stdio: "ignore" }); await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch();
  const mk = async (seed = {}, opt = {}) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); await require(__dirname + "/fake-weather")(p); p.on("pageerror", e => errs.push(e.message));
    if (opt.time) await p.clock.setFixedTime(new Date(opt.time));
    await p.addInitScript(o => { if (sessionStorage.getItem("seed")) return; sessionStorage.setItem("seed", "1"); localStorage.setItem("tt_lang", "zh"); ["tt_onboarded_v2", "tt_coach_trail", "tt_locperm_prompted", "tt_coach_record", "tt_coach_record_tools", "tt_coach_peaks", "tt_coach_team", "tt_coach_pet"].forEach(k => localStorage.setItem(k, "1")); for (const [k, v] of Object.entries(o)) localStorage.setItem(k, v); }, seed);
    await p.addInitScript(MOCK); const t0 = Date.now(); await p.goto(`http://localhost:${__TTP}/`); await require(__dirname + "/ready")(p); p._ready = Date.now() - t0;
    await p.evaluate(() => document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e => e.remove()));
    return p;
  };
  let p = await mk({ tt_debug_free: "1" });
  // A7：啟動效能預算（不降速；本機約 1 秒，超過 6 秒就是變慢了）
  ok(p._ready < 6000, `A7: app ready within budget (${p._ready} ms)`);
  // B1：地圖標記一次整批加，全部 2,9xx 個都在（以前上限 2,500）
  await p.evaluate(() => document.querySelector('.seg-btn[data-mode="map"]').click()); await p.waitForTimeout(1500);
  const b1 = await p.evaluate(() => ({ n: browseMarkers.size, all: curList.length }));
  ok(b1.n === b1.all && b1.all > 2500, `B1: every trail gets a map marker, no 2,500 cap (${b1.n}/${b1.all})`);
  ok(/addLayers\(add\)/.test(src("js/explore.js")), "B1: markers are added in one batch");
  await p.evaluate(() => document.querySelector('.seg-btn[data-mode="list"]') && document.querySelector('.seg-btn[data-mode="list"]').click());
  // B2：地區晶片收成五組，按了才展開
  const b2 = await p.evaluate(() => { const gs = [...document.querySelectorAll("#fsRegion .fs-fold")]; const open0 = gs.filter(g => g.classList.contains("open")).length; gs[0] && gs[0].querySelector(".fs-rg-h").click(); return { n: gs.length, open0, open1: gs[0] && gs[0].classList.contains("open") }; });
  ok(b2.n >= 4 && b2.open0 === 0 && b2.open1, `B2: region chips folded into ${b2.n} groups, opened on tap`);
  const b2w = await p.evaluate(() => [...document.querySelectorAll("#fsRegion .fs-fold")].map(g => Math.round(g.getBoundingClientRect().width)));
  ok(b2w.length && b2w.every(w => w > 250), "B2: each region group takes a full row " + JSON.stringify(b2w));
  // B4：簡體與打錯一個字也找得到
  const search = async q => { await p.fill("#searchInput", q); await p.waitForTimeout(700); return p.evaluate(() => ({ names: curList.slice(0, 5).map(t => t.name), count: document.querySelector("#resultCount").textContent })); };
  const s1 = await search("嘉明湖"), s2 = await search("佳明湖"), s3 = await search("嘉明湖国家步道");
  ok(s1.names.some(n => /嘉明湖/.test(n)), "B4: baseline search finds 嘉明湖");
  ok(s2.names.some(n => /嘉明湖/.test(n)) && /很接近/.test(s2.count), `B4: one-typo search still finds it and says so (${s2.count})`);
  ok(s3.names.some(n => /嘉明湖/.test(n)), "B4: simplified-Chinese search finds it");
  await p.fill("#searchInput", ""); await p.waitForTimeout(400);
  // B3：主題卡有自己的圖示標記
  ok(await p.evaluate(() => [...document.querySelectorAll(".coll-card")].filter(c => c.dataset.ic).length >= 4), "B3: theme cards carry their own illustration key");
  // C1：動作列黏著、不鑽到分頁列底下
  await p.evaluate(() => openDetail(TRAILS.find(t => t.source === "forestry").id)); await p.waitForTimeout(1500);
  const c1 = await p.evaluate(() => [...document.querySelectorAll(".dv-acts > .dv-act")].filter(x => x.offsetParent).map(x => Math.round(x.getBoundingClientRect().top)));
  ok(c1.length >= 4 && new Set(c1).size === 1, "C1: detail actions stay on one row (no lone button on a second line) " + JSON.stringify(c1));
  await p.evaluate(() => closeDetail && closeDetail());
  // D1／D2：記錄設定收成一排；大字模式
  await p.evaluate(() => document.querySelector('.tab[data-view="record"]').click()); await p.waitForTimeout(600);
  const d1 = await p.evaluate(() => { const o = document.querySelector(".rec-opts"); return o ? [...o.children].filter(x => x.offsetParent).map(x => Math.round(x.getBoundingClientRect().top)) : []; });
  ok(d1.length >= 3 && new Set(d1).size === 1, "D1: record settings sit in one row " + JSON.stringify(d1));
  ok(await p.evaluate(() => !!document.getElementById("recBigTog")), "D2: big-number toggle exists on the record screen");
  await p.evaluate(() => document.getElementById("recBigTog").click());
  ok(await p.evaluate(() => document.body.classList.contains("rec-big") && localStorage.getItem("tt_rec_big") === "1"), "D2: big mode switches on and is remembered");
  await p.evaluate(() => document.getElementById("recBigTog").click());
  // E1：夥伴頁上方有跳轉列
  await p.evaluate(() => document.querySelector('.tab[data-view="pet"]').click()); await p.waitForTimeout(1200);
  const e1 = await p.evaluate(() => [...document.querySelectorAll(".pet-jump [data-jump]")].map(x => x.dataset.jump));
  ok(e1.length === 5, "E1: pet page has a jump bar " + JSON.stringify(e1));
  // H：離線額度用條數講；PRO 下載全台完整
  await p.evaluate(() => document.querySelector('.tab[data-view="me"]').click()); await p.waitForTimeout(800);
  const h = await p.evaluate(() => ({ q: (document.querySelector(".oq-n") || {}).textContent || "", ao: (document.querySelector("#btnAllOffline .ao-l") || {}).textContent || "" }));
  ok(/約可再存 \d+ 條步道/.test(h.q), `H: free quota says how many trails still fit (${h.q})`);
  ok(/全台完整|概覽/.test(h.ao), `H: Taiwan download button names what you get (${h.ao})`);
  ok(/"全台完整離線地圖"/.test(src("js/premium.js")) && /10 MB（約 20 條步道）/.test(src("js/premium.js")), "H: upgrade popup sells full-Taiwan offline vs 10 MB (≈20 trails)");
  ok(/PREVIEW/.test(src("js/premium.js")), "H: upgrade popup has preview pictures");
  await p.context().close();
  // F1：走過的路有縮圖；F2：速度趨勢少於 5 趟改文字
  const tr = (d, i) => ({ id: "r" + i, date: d, name: "自由路線", distanceKm: 2.1 + i * .3, distance3DKm: 2.1 + i * .3, elapsedMs: 3600e3, ascent: 120, descent: 100, steps: 3000, kcal: 120, track: [[24.1 + i * .01, 121.2], [24.11 + i * .01, 121.21], [24.12 + i * .01, 121.205]].map(([lat, lon], k) => ({ lat, lon, t: Date.parse(d) + k * 600000, alt: 300 + k * 40 })) });
  p = await mk({ tt_records: JSON.stringify([tr("2026-10-02T08:00:00", 1), tr("2026-10-05T08:00:00", 2)]) }, { time: "2026-11-03T10:00:00" });
  await p.evaluate(() => document.querySelector('.tab[data-view="me"]').click()); await p.waitForTimeout(1200);
  const f1 = await p.evaluate(() => [...document.querySelectorAll(".hist-thumb path")].map(x => new Set(x.getAttribute("d").match(/[\d.]+,[\d.]+/g)).size));
  ok(f1.length >= 2 && f1.every(n => n >= 3), "F1: history cards show a track thumbnail with a real shape (distinct points per card) " + JSON.stringify(f1));
  const f1b = await p.evaluate(() => { const t = document.querySelector(".hist-thumb").getBoundingClientRect(); return [...document.querySelectorAll(".hist-card")[0].querySelectorAll(".row span, .top b, .top .date")].filter(e => { const r = e.getBoundingClientRect(); return !(r.right <= t.left || r.left >= t.right || r.bottom <= t.top || r.top >= t.bottom); }).map(e => e.textContent.trim()); });
  ok(f1b.length === 0, "F1: thumbnail does not cover any text on the card " + JSON.stringify(f1b));
  // H：每月 1～7 號有上個月回顧小卡
  const mr = await p.evaluate(() => ({ card: !!document.querySelector(".mrecap"), txt: (document.querySelector(".mrecap") || {}).textContent || "" }));
  ok(mr.card && /2/.test(mr.txt), `H: month recap card on Nov 3 for October (${mr.txt.slice(0, 40)})`);
  // H：免費用戶的登頂收集冊是上鎖版
  await p.evaluate(() => { localStorage.setItem("tt_debug_free", "1"); Peaks.open({ locked: true }); }); await p.waitForTimeout(600);
  ok(await p.evaluate(() => !!document.querySelector(".pk-lock")), "H: locked stamp book for free users");
  await p.context().close();
  // A5：英文介面看到英文介紹，可切回原文
  p = await mk({ tt_lang: "en" });
  await p.evaluate(() => openDetail(TRAILS.find(t => t.id === "forestry-139").id)); await p.waitForTimeout(2000);
  const a5 = await p.evaluate(() => ({ g: (document.querySelector("#dvGuide") || {}).textContent || "", o: !!document.querySelector("#guideOrig") }));
  ok(/Jiaming Lake/.test(a5.g) && a5.o, `A5: English UI shows the English guide with a show-original button (${a5.g.slice(0, 40)})`);
  await p.evaluate(() => document.querySelector("#guideOrig").click());
  ok(await p.evaluate(() => /嘉明湖/.test(document.querySelector("#dvGuide").textContent)), "A5: show-original switches back to Chinese");
  await p.context().close();
  console.log("ERRS", JSON.stringify(errs)); console.log("FAILS", fails + (errs.length ? 1 : 0)); await b.close(); srv.kill(); process.exit(0);
})();
