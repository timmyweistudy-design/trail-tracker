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
  // A4：拿掉 22 個 !important 之後，原本靠它贏的樣式照樣贏（把同樣的 class 放進同樣的容器量 computed style）
  const a4 = await p.evaluate(() => {
    const host = document.createElement("div"); host.innerHTML = `
      <div class="leaflet-container"><div class="leaflet-bottom"><div class="leaflet-control map-count" id="t1">x</div></div><a class="popup-go mp-go" id="t2">go</a></div>
      <div class="composer-head"><button class="btn primary comp-post" id="t3">post</button></div>
      <div class="ro-row"><input type="checkbox" class="tt-switch" id="t4"></div>
      <div class="set-row"><input type="checkbox" class="tt-switch" id="t4b"></div>
      <div class="input-card"><input class="auth-input bad" id="t5"></div>
      <div class="ach3d-mk got"><span class="ach-dot ach-mdl" id="t6"></span></div><div class="ach-stop got"><span class="ach-dot ach-mdl" id="t6b"></span></div>
      <label class="btn ghost ed-av-btn" id="t7">av</label>
      <div class="dv-comm"><div class="activity-card crowd-card crowd-empty" id="t8">e</div></div>
      <button class="acc-sw frame-sw on" id="t9"></button>`;
    document.body.appendChild(host); document.getElementById("t5").focus();
    const cs = id => getComputedStyle(document.getElementById(id));
    const r = { mapCount: cs("t1").marginBottom, mpGo: cs("t2").color, comp: cs("t3").paddingTop, sw: cs("t4").width + "x" + cs("t4").height, sw2: cs("t4b").width, bad: cs("t5").borderTopColor,
      medal: [cs("t6").backgroundImage, cs("t6").boxShadow, cs("t6b").boxShadow, cs("t6").borderTopLeftRadius], av: cs("t7").width, crowd: cs("t8").display, frame: cs("t9").boxShadow };
    host.remove(); return r;
  });
  ok(a4.mapCount === "52px" && a4.mpGo === "rgb(255, 255, 255)" && a4.comp === "7px", "A4: map count / popup button / post button keep their spacing and color " + JSON.stringify([a4.mapCount, a4.mpGo, a4.comp]));
  ok(a4.sw === "42px x25px".replace(" ", "") && a4.sw2 === "42px", "A4: switches stay 42×25 " + a4.sw + " " + a4.sw2);
  ok(/179, 50, 42|b3322a/i.test(a4.bad) || /rgb\((1[5-9]\d|2\d\d), [2-7]\d, [2-7]\d\)/.test(a4.bad), "A4: an invalid input stays red even while focused " + a4.bad);
  ok(a4.medal[0] === "none" && a4.medal[1] === "none" && a4.medal[2] === "none" && a4.medal[3] === "0px", "A4: medals drop the dot background, glow and rounding everywhere " + JSON.stringify(a4.medal));
  ok(a4.av !== "100%" && parseFloat(a4.av) < 300 && a4.crowd === "none" && /0px 0px 0px 4px/.test(a4.frame), "A4: avatar button auto width, empty crowd card hidden, frame swatch ring " + JSON.stringify([a4.av, a4.crowd, a4.frame]));
  const a4d = await p.evaluate(() => { const h = document.documentElement, was = h.dataset.theme; h.dataset.theme = "dark";
    const rm = document.getElementById("recMap"), box = document.createElement("div"); box.innerHTML = '<div class="leaflet-bar"><a id="d1">+</a></div><div class="leaflet-control-scale-line" id="d2">1 km</div><div class="leaflet-control-attribution" id="d3">©</div>';
    rm.appendChild(box); const c = id => getComputedStyle(document.getElementById(id)).backgroundColor; const r = [c("d1"), c("d2"), c("d3")]; box.remove(); if (was) h.dataset.theme = was; else delete h.dataset.theme; return r; });
  ok(a4d[0] === "rgb(38, 43, 34)" && a4d[1] === "rgba(0, 0, 0, 0.5)" && a4d[2] === "rgba(0, 0, 0, 0.45)", "A4: dark-theme map controls stay dark, record map scale line included " + JSON.stringify(a4d));
  // A4 第二批：假全螢幕、PRO 標籤、社群隱藏、夥伴眼睛心情、減少動態（刪掉各處重複的 !important，靠全域那一條）
  const a4b = await p.evaluate(() => {
    if (typeof initRecMap === "function") initRecMap();   // 先讓 Leaflet 初始化：它會在元素上寫行內 position: relative（沒初始化的話這條測不出來）
    const m = document.getElementById("recMap"), home = m.parentNode, mark = document.createComment("x"); home.insertBefore(mark, m); document.body.appendChild(m); m.classList.add("map-fs");
    const c = getComputedStyle(m), fs = { pos: c.position, h: Math.round(parseFloat(c.height)), r: c.borderTopLeftRadius, z: c.zIndex };
    m.classList.remove("map-fs"); home.insertBefore(m, mark); mark.remove();
    const host = document.createElement("div"); host.className = "ps-box"; host.innerHTML = '<div id="petEmojiX"></div><div class="fv-critter pet-m-sleepy"><span class="pb-blink2"><svg><ellipse class="pc-eye" id="eyeF"/></svg></span></div>';
    document.body.appendChild(host); const ef = getComputedStyle(document.getElementById("eyeF")); const eye = { tf: ef.transform, an: ef.animationName }; host.remove();
    document.body.classList.add("is-pro"); const tag = document.createElement("span"); tag.className = "pro-tag"; tag.textContent = "PRO"; document.body.appendChild(tag); const pro = getComputedStyle(tag).display; tag.remove(); document.body.classList.remove("is-pro");
    return { fs, eye, pro, inner: innerHeight };
  });
  ok(a4b.fs.pos === "fixed" && a4b.fs.h === a4b.inner && a4b.fs.r === "0px" && a4b.fs.z === "95", "A4: fullscreen record map still covers the whole screen " + JSON.stringify(a4b.fs));
  ok(/matrix\(1, 0, 0, 0\.28/.test(a4b.eye.tf) && a4b.eye.an === "none", "A4: a sleepy friend's eyes stay half-closed even during a blink behaviour " + JSON.stringify(a4b.eye));
  ok(a4b.pro === "none", "A4: PRO tags hide for members " + a4b.pro);
  await p.emulateMedia({ reducedMotion: "reduce" });
  const rm = await p.evaluate(() => { const host = document.createElement("div"); host.className = "ps-box"; host.innerHTML = '<span class="pb-hop"><i class="pc-ear" id="rmE"></i></span><i class="pet-bump" id="rmB"></i><svg><ellipse class="pc-eye" id="rmY"/></svg>'; document.body.appendChild(host);
    const r = ["rmE", "rmB", "rmY"].map(id => getComputedStyle(document.getElementById(id)).animationName); host.remove(); return r; });
  await p.emulateMedia({ reducedMotion: "no-preference" });
  ok(rm.every(x => x === "none"), "A4: reduced motion still stops every pet animation with the single global rule " + JSON.stringify(rm));
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
  // D1 使用者看過要改回原本（一列一項）；D2 大字模式
  await p.evaluate(() => document.querySelector('.tab[data-view="record"]').click()); await p.waitForTimeout(600);
  const d1 = await p.evaluate(() => { const o = document.querySelector(".rec-opts"); return o ? [...o.children].filter(x => x.offsetParent).map(x => Math.round(x.getBoundingClientRect().top)) : []; });
  ok(d1.length >= 3 && new Set(d1).size === d1.length, "D1 (reverted at the user's request): record settings are back to one per row " + JSON.stringify(d1));
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
  ok(/"全台完整離線地圖"/.test(src("js/premium.js")) && /10 MB<small class=\\"pm-sub\\">約 20 條步道/.test(src("js/premium.js")), "H: upgrade popup sells full-Taiwan offline vs 10 MB (≈20 trails)");
  ok(/PREVIEW/.test(src("js/premium.js")), "H: upgrade popup has preview pictures");
  // 比較表不能跑版：數值欄長字（「10 MB（約 20 條步道）」）以前把第一欄擠成一字一行；方案鈕在 iOS 變系統藍
  await p.evaluate(() => Premium.openUpgrade("offline")); await p.waitForTimeout(700);
  const tb = await p.evaluate(() => { const d = document.querySelector(".pm-more"); d.open = true; const card = document.querySelector(".premium-card").getBoundingClientRect(); const t = document.querySelector(".pm-compare").getBoundingClientRect();
    const firsts = [...document.querySelectorAll(".pm-compare tbody tr:not(.pm-g) td:first-child")].map(b => Math.round(b.getBoundingClientRect().width));
    const ink = getComputedStyle(document.documentElement).getPropertyValue("--ink").trim(); const plan = getComputedStyle(document.querySelector(".pm-plan b")).color;
    return { fit: t.right <= card.right + 1, minFirst: Math.min(...firsts), plan, blue: /0, 122, 255|0, 0, 238/.test(plan) }; });
  ok(tb.fit && tb.minFirst >= 140, "H: comparison table fits and feature names are not squeezed to one character per line " + JSON.stringify(tb));
  ok(!tb.blue, "H: plan buttons use the app's ink color, not the system blue " + tb.plan);
  await p.evaluate(() => { const m = document.querySelector(".premium-mask"); if (m) m.remove(); });
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
  // A2：拆出來的 anaProHtml／trackGains／trackHistoryLine／drawTrackMap 照常運作
  const a2 = await p.evaluate(async () => {
    await ensureScript("js/analytics.js"); if (typeof openTrackReview !== "function") await ensureScript("js/review.js");
    openAnalytics(); await new Promise(r => setTimeout(r, 400));
    const pro = { pb: document.querySelectorAll(".ana-pb").length, lock: !!document.querySelector(".ana-lock"), csv: !!document.querySelector("#anaCsv") };
    document.querySelector('[data-ov="analytics"]').remove();
    const t = TRAILS.find(x => x.source === "forestry"), base = realRecords()[0];
    const r1 = Object.assign({}, base, { id: "h1", trailId: t.id, trailName: t.name, date: "2026-10-01T08:00:00" }), r2 = Object.assign({}, base, { id: "h2", trailId: t.id, trailName: t.name, date: "2026-10-08T08:00:00" });
    Store.addRecord(r1); Store.addRecord(r2);
    openTrackReview(r2, false); await new Promise(r => setTimeout(r, 900));
    const old = { body: document.querySelector("#trackBody").textContent, tiles: document.querySelectorAll("#trackMap .leaflet-pane").length };
    closeTrackReview(); openTrackReview(Object.assign({}, r2, { id: "h3" }), true); await new Promise(r => setTimeout(r, 600));
    const fresh = document.querySelector("#trackBody").textContent; closeTrackReview();
    window.TT_DEBUG_FREE = true; window.PERSONAL_MODE = false; openAnalytics(); await new Promise(r => setTimeout(r, 400));
    const free = { pb: document.querySelectorAll(".ana-pb").length, lock: !!document.querySelector(".ana-lock") }; document.querySelector('[data-ov="analytics"]').remove();
    return { pro, free, hist: /第 2 次走這條/.test(old.body), map: old.tiles > 0, gains: /夥伴再|到過|第一次|破紀錄/.test(fresh) };
  });
  ok(a2.pro.pb >= 2 && !a2.pro.lock && a2.pro.csv, "A2: PRO analytics still renders personal bests and export " + JSON.stringify(a2.pro));
  ok(a2.free.pb === 0 && a2.free.lock, "A2: free analytics shows the lock instead " + JSON.stringify(a2.free));
  ok(a2.hist && a2.map, `A2: old record's review says which time you walked it and draws the map (${a2.hist}/${a2.map})`);
  ok(a2.gains, "A2: a fresh record's review lists what you gained");
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
  // 步道系統：專有名稱翻成英文、OSM 路網代碼（lwn／rwn／nwn）不再原樣顯示
  const sys = await p.evaluate(async () => { const row = () => [...document.querySelectorAll(".dv-info > div")].map(d => d.textContent).find(t => /Trail system/.test(t)) || "";
    const a = row(); const o = TRAILS.find(t => t.system === "lwn"); closeDetail(); await openDetail(o.id); await new Promise(r => setTimeout(r, 1500)); return [a, row()]; });
  ok(/Central Mountain Range Backbone/.test(sys[0]) && /Local/.test(sys[1]) && !/lwn/.test(sys[1]), "sweep fix: trail system shows in English, OSM codes become levels " + JSON.stringify(sys));
  // 基本資料欄位（路面、季節、位置、登山口、管理單位）在英文介面一個中文都不剩
  const fld = await p.evaluate(async () => { await ensureDetail(); await ensureScript("js/guides-en.js"); const D = window.TRAILS_DETAIL, left = new Set();
    for (const t of TRAILS) { const d = Object.assign({}, t, D[t.id] || {}); const f = [d.pave, d.best_season, d.position, d.admin, (d.entrances || []).map(e => e.memo).filter(m => m && !/步道範圍中心/.test(m)).slice(0, 3).join("、")];
      for (const v of f) { if (!v) continue; const tr = fieldEn(String(v)) || String(v).split("、").map(x => ttT(x.trim())).join(", "); if (/[一-鿿]/.test(tr)) left.add(String(v)); } }
    return [...left]; });
  ok(fld.length === 0, "sweep fix: every trail-facts field has English " + JSON.stringify(fld.slice(0, 3)));
  await p.context().close();
  // 最大字級（1.65）英文：天氣列圖示跟文字同一行、沒有回報時放在淺底框裡
  p = await mk({ tt_lang: "en", tt_fontscale: "1.65" });
  await p.evaluate(() => openDetail(TRAILS.find(t => t.source === "forestry").id)); await p.waitForTimeout(2200);
  const big = await p.evaluate(() => { const w = document.querySelector(".dv-wx-row"); if (!w) return null; const i = w.querySelector(".wx-ic").getBoundingClientRect(), t = w.querySelector("span").getBoundingClientRect(); const e = document.querySelector(".trp-empty");
    return { iconTop: Math.round(i.top), textTop: Math.round(t.top), textBottom: Math.round(t.bottom), empty: e ? getComputedStyle(e).backgroundColor : "none" }; });
  ok(big && big.iconTop >= big.textTop - 4 && big.iconTop <= big.textBottom, "sweep fix: weather icon stays on the same line as its text at the largest font " + JSON.stringify(big));
  ok(big && big.empty !== "rgba(0, 0, 0, 0)" && big.empty !== "none", "sweep fix: the no-reports note sits in a tinted box " + (big && big.empty));
  const info = await p.evaluate(() => { const rows = [...document.querySelectorAll(".dv-info > div")]; const lefts = new Set(rows.map(r => Math.round(r.querySelector("dd").getBoundingClientRect().left)));
    const overlap = rows.filter(r => { const a = r.querySelector("dt").getBoundingClientRect(), b = r.querySelector("dd").getBoundingClientRect(); return !(a.bottom <= b.top + 1 || a.right <= b.left + 1); }).length;
    return { lefts: lefts.size, overlap, n: rows.length }; });
  ok(info.n > 3 && info.lefts === 1 && info.overlap === 0, "layout: trail facts values all start at the same left edge and labels never overlap them (largest English font) " + JSON.stringify(info));
  await p.context().close();
  // 比較表在每種語言 × 字級都不能跑版：不出卡片、不被裁、不會有「一格只剩一兩個字寬」的直排
  for (const [lg, fz] of [["zh", "1.2"], ["zh", "1.65"], ["en", "1.2"], ["en", "1.65"]]) {
    p = await mk({ tt_lang: lg, tt_fontscale: fz, tt_debug_free: "1" });
    await p.evaluate(() => Premium.openUpgrade("offline")); await p.waitForTimeout(800);
    const bt = await p.evaluate(() => { document.querySelector(".pm-more").open = true; const card = document.querySelector(".premium-card").getBoundingClientRect();
      const cells = [...document.querySelectorAll(".pm-compare td, .pm-compare th")].filter(c => c.offsetParent && c.textContent.trim());
      const narrow = cells.filter(c => { const t = c.textContent.trim(), f = parseFloat(getComputedStyle(c).fontSize); return (t.length >= 3 && c.getBoundingClientRect().width < f * 3) || (t.length >= 2 && c.getBoundingClientRect().width < f * 2); });
      return { out: cells.filter(c => c.getBoundingClientRect().right > card.right + 1).map(c => c.textContent.trim()).slice(0, 3), clip: cells.filter(c => c.scrollWidth > c.clientWidth + 1).map(c => c.textContent.trim()).slice(0, 3), narrow: narrow.map(c => c.textContent.trim().slice(0, 12)).slice(0, 3) }; });
    ok(!bt.out.length && !bt.clip.length && !bt.narrow.length, `layout: comparison table (${lg} ${fz}) stays inside the card, nothing clipped or squeezed to a column of single letters ` + JSON.stringify(bt));
    await p.context().close();
  }
  // 使用者資料（名字）標成 data-raw，不給翻譯器動、英文掃描也不會當漏翻
  ok(/<b data-raw>\$\{escHtml\(p\.owner_name\)\}/.test(src("js/guardian.js")) && /<span data-raw>\$\{esc\(cname\)\}/.test(src("js/social/events.js")) && /petSay\(text, ms, raw\)/.test(src("js/pet.js")), "sweep fix: friend and pet names are marked as data");
  // C4／G2：先模糊後清楚（小圖當底圖）
  ok(/\.hero-carousel img\.bu:not\(\.loaded\) \{ filter: blur/.test(fs.readFileSync(ROOT + "/web/css/style-features.css", "utf8")) && /\/60px-/.test(src("js/detail.js")) && /thumb_path \? ` style="background:url/.test(src("js/social/postview.js")), "C4/G2: big photos show a small blurred version underneath until the sharp one loads");
  console.log("ERRS", JSON.stringify(errs)); console.log("FAILS", fails + (errs.length ? 1 : 0)); await b.close(); srv.kill(); process.exit(0);
})();
