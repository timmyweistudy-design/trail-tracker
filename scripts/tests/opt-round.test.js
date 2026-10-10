// 2026-10-10 優化輪（docs/opt-round-next.md）B／C 項：每一項都有一條會紅的檢查
const __TTP = +process.env.TT_PORT || 8953;
const ROOT = require("path").resolve(__dirname, "../.."), fs = require("fs"); const { chromium } = require(ROOT + "/node_modules/playwright"); const { spawn } = require("child_process");
const MOCK = fs.readFileSync(__dirname + "/soc-mock.js", "utf8"); const errs = []; let fails = 0; const ok = (c, m) => { console.log((c ? "PASS " : "FAIL ") + m); if (!c) fails++; };
ok(/<span data-raw>\$\{esc\(friendName\(rv\)\)\}<\/span>/.test(fs.readFileSync(ROOT + "/web/js/social/petsocial.js", "utf8")), "B5: a friend's own pet name is marked as data inside the translated sentence");
(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(__TTP)], { cwd: ROOT + "/web", stdio: "ignore" }); await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch();
  const mk = async (seed = {}) => {
    const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); await require(__dirname + "/fake-weather")(p); p.on("pageerror", e => errs.push(e.message));
    await p.addInitScript(o => { if (sessionStorage.getItem("seed")) return; sessionStorage.setItem("seed", "1"); localStorage.setItem("tt_lang", "zh"); ["tt_onboarded_v2", "tt_coach_trail", "tt_locperm_prompted", "tt_coach_record", "tt_coach_record_tools", "tt_coach_peaks", "tt_coach_team", "tt_coach_pet"].forEach(k => localStorage.setItem(k, "1")); for (const [k, v] of Object.entries(o)) localStorage.setItem(k, v); }, seed);
    await p.addInitScript(MOCK); await p.goto(`http://localhost:${__TTP}/`); await require(__dirname + "/ready")(p);
    await p.evaluate(() => document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e => e.remove()));
    return p;
  };
  // B1：預設清單，暫停開放的在後面
  let p = await mk();
  const b1 = await p.evaluate(() => { const ids = [...document.querySelectorAll("#trailList .jcard")].slice(0, 12).map(c => c.classList.contains("is-closed")); const firstShut = curList.findIndex(isClosed), lastOpen = curList.length - 1 - [...curList].reverse().findIndex(t => !isClosed(t)); return { first: ids, firstShut, lastOpen, n: curList.filter(isClosed).length }; });
  ok(b1.n > 0 && !b1.first[0] && b1.firstShut > b1.lastOpen, `B1: default list puts the ${b1.n} closed trails after every open one (first card open: ${!b1.first[0]})`);
  await p.evaluate(() => { document.querySelector('[data-sort="length-asc"]') && document.querySelector('[data-sort="length-asc"]').click(); }); await p.waitForTimeout(300);
  ok(await p.evaluate(() => curSort !== "length-asc" || curList.slice(1).every((t, i) => (t.length_km ?? 9e9) >= (curList[i].length_km ?? 9e9))), "B1: a sort the user picks (length) is kept as is");
  // B2：暫停開放的步道，開始記錄先提醒
  const shutId = await p.evaluate(() => TRAILS.find(isClosed).id);
  await p.evaluate(id => openDetail(id), shutId); await p.waitForTimeout(1500);
  ok(await p.evaluate(() => document.querySelector("#btnGoRecord").classList.contains("is-closed")), "B2: start button looks like a warning on a closed trail");
  await p.evaluate(() => document.querySelector("#btnGoRecord").click()); await p.waitForTimeout(500);
  const dlg = await p.evaluate(() => { const d = document.querySelector(".ttdlg-ov"); return d ? d.innerText : ""; });
  ok(/暫停|封閉|關閉/.test(dlg) && /還是要記錄/.test(dlg), "B2: tapping it asks first: " + dlg.replace(/\s+/g, " ").slice(0, 60));
  await p.evaluate(() => { const c = [...document.querySelectorAll(".ttdlg-ov button")].find(x => /取消/.test(x.textContent)); c && c.click(); }); await p.waitForTimeout(400);
  ok(await p.evaluate(() => document.body.dataset.view !== "record"), "B2: cancel stays on the trail page");
  // B3：新用戶「我的」是引導卡
  await p.evaluate(() => { closeDetail && closeDetail(); document.querySelector('.tab[data-view="me"]').click(); }); await p.waitForTimeout(600);
  const b3 = await p.evaluate(() => ({ card: !!document.querySelector("#meMonth .me-first"), statsHidden: document.querySelector("#meStats").hidden, btns: document.querySelectorAll(".me-first .btn").length }));
  ok(b3.card && b3.statsHidden && b3.btns === 2, "B3: a new user sees a 'first hike' card instead of rows of 0.0 " + JSON.stringify(b3));
  await p.evaluate(() => document.querySelector("#meFirstNear").click()); await p.waitForTimeout(500);
  ok(await p.evaluate(() => document.body.dataset.view === "explore"), "B3: 'find nearby trails' goes to Explore");
  await p.context().close();
  // B3 反向＋B4：有紀錄的人看到統計；記錄地圖從上次的位置開始
  p = await mk({ tt_last_loc: JSON.stringify({ lat: 24.15, lon: 121.28 }), tt_debug_km: "40" });
  await p.evaluate(() => { Store.addRecord && Store.addRecord({ id: "r1", date: new Date().toISOString(), trailName: "測試", distanceKm: 3, elapsedMs: 3.6e6, track: [] }); renderStats && renderStats(); document.querySelector('.tab[data-view="me"]').click(); }); await p.waitForTimeout(600);
  ok(await p.evaluate(() => !document.querySelector(".me-first") && !document.querySelector("#meStats").hidden), "B3: someone with a hike sees their stats");
  await p.evaluate(() => document.querySelector('.tab[data-view="record"]').click()); await p.waitForTimeout(1200);
  const c = await p.evaluate(() => { const c = recMap.getCenter(); return { lat: c.lat, lon: c.lng, z: recMap.getZoom() }; });
  ok(Math.abs(c.lat - 24.15) < .05 && Math.abs(c.lon - 121.28) < .05 && c.z >= 12, "B4: record map opens where you were last time, not all of Taiwan " + JSON.stringify(c));
  // D：收藏／步記的解析快取——寫入後立刻看得到、拿到的是複本（改了不寫回不會汙染）、掃全部步道不再每條重新解析
  const d = await p.evaluate(() => {
    const id = TRAILS[5].id, before = Store.isFav(id); Store.toggleFav(id); const after = Store.isFav(id);
    const f = Store.getFavs(); f.push("zzz"); const leak = Store.isFav("zzz");
    Store.setTrailLog(TRAILS[6].id, { done: true }); const done = Store.trailLog(TRAILS[6].id).done; const lg = Store.trailLog(TRAILS[6].id); lg.done = false; const kept = Store.trailLog(TRAILS[6].id).done;
    localStorage.setItem("tt_favs", JSON.stringify([TRAILS[7].id])); const ext = Store.isFav(TRAILS[7].id) && !Store.isFav(id);
    const t0 = performance.now(); for (let k = 0; k < 20; k++) TRAILS.filter(t => Store.isFav(t.id) || Store.trailLog(t.id).done); const ms = (performance.now() - t0) / 20;
    return { before, after, leak, done, kept, ext, ms };
  });
  ok(!d.before && d.after && !d.leak && d.done && d.kept && d.ext, "D: favorites / trail log cache stays correct after writes, copies and outside changes " + JSON.stringify(d));
  ok(d.ms < 25, `D: scanning all trails for favorites + done takes ${d.ms.toFixed(1)}ms (was ~40ms unthrottled per scan)`);
  // C4：進化儀式的光點不超出螢幕
  await p.evaluate(() => { const i = Math.max(1, petStageIndex(totalKm())); celebrateEvolve(petStageInfo(i), i + 1); }); await p.waitForTimeout(900);
  const over = await p.evaluate(() => [...document.querySelectorAll(".evolve-card, .evolve-card *")].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && !e.closest(".evolve-burst")).map(e => e.className).slice(0, 3));
  ok(over.length === 0, "C4: evolve sparkles stay inside the screen " + JSON.stringify(over));
  // C1：主題卡的文字沒被截（右下的淡圖示是刻意超出的裝飾）
  const clipped = await p.evaluate(() => [...document.querySelectorAll(".coll-card .coll-t, .coll-card .coll-s")].filter(e => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 2).length);
  ok(clipped === 0, "C1: collection card titles and subtitles fit");
  await p.context().close();
  console.log("ERRS", JSON.stringify(errs)); console.log("FAILS", fails + (errs.length ? 1 : 0)); await b.close(); srv.kill(); process.exit(0);
})();
