// 全站 UI 掃描（2026-10-09 收尾輪）：中文／英文 × 預設字級 1.2／最大 1.65，每個畫面跑五種偵測器
//   overflow：有東西超出螢幕右邊（不在可以左右捲的容器裡）
//   clip：按鈕／標籤文字被截掉（scrollWidth > clientWidth 且沒有省略號）
//   cjk：英文模式畫面上還有中文（步道名、地名、人名這類資料除外）
//   align：置中的標題底下，靠左的次要文字比標題更往左（scripts/tests/align-rule.js）
//   errors：頁面 JS 錯誤
// 另外：測試面板每一顆按鈕各按一次，收 JS 錯誤。
// 用法：node scripts/ui-sweep.js [zh|en] [1.2|1.65]（不帶＝四種組合）；要 LD_LIBRARY_PATH；結果 scripts/tests/out/sweep/
const ROOT = require("path").resolve(__dirname, ".."); const { chromium } = require(ROOT + "/node_modules/playwright"); const { spawn } = require("child_process"); const fs = require("fs");
const MOCK = fs.readFileSync(ROOT + "/scripts/tests/soc-mock.js", "utf8"); const OUT = ROOT + "/scripts/tests/out/sweep/"; fs.mkdirSync(OUT, { recursive: true });
const ALIGN = require("./tests/align-rule"); const PORT = +process.env.TT_PORT || 8983;
const DET = () => {
  const vis = el => { const s = getComputedStyle(el); return s.display !== "none" && s.visibility !== "hidden" && +s.opacity > 0.05 && el.getClientRects().length; };
  const W = innerWidth, out = { overflow: [], clip: [], cjk: [], hscroll: [] };
  const se = document.scrollingElement; if (se.scrollWidth > W + 1) out.hscroll.push(`page scrollWidth ${se.scrollWidth} > ${W}`);
  document.querySelectorAll(".view.active, main, .sheet.open .sheet-body, .pet-modal-card, .ttdlg").forEach(el => { if (getComputedStyle(el).overflowX !== "hidden" && el.scrollWidth > el.clientWidth + 1) out.hscroll.push(`${el.className.split(" ")[0]} scrollWidth ${el.scrollWidth} > ${el.clientWidth}`); });
  const scroller = el => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true; if (/(auto|scroll)/.test(s.overflowX)) return true; } return false; };
  const name = el => (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "") || el.tagName;
  for (const el of document.querySelectorAll("body *")) {
    if (!vis(el) || el.closest("svg,.leaflet-container,.maplibregl-map,canvas,#debugPanel,.tour,.ps-box")) continue;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.bottom < 0 || r.top > innerHeight) continue;
    if (r.right > W + 1 && !scroller(el) && getComputedStyle(el).position !== "fixed") out.overflow.push(`${name(el)} right=${Math.round(r.right)}`);
    if (el.matches("button, .btn, .chip, .pp-tod, .seg button, .lv-chip, label") && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).textOverflow !== "ellipsis" && getComputedStyle(el).overflow !== "visible") out.clip.push(`${name(el)} "${(el.innerText || "").trim().slice(0, 24)}" ${el.scrollWidth}>${el.clientWidth}`);
  }
  if (document.documentElement.lang !== "zh-Hant" && (localStorage.getItem("tt_lang") || "zh") !== "zh") {
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
    while ((n = tw.nextNode())) {
      const t = n.nodeValue.trim(); if (!t || !/[一-鿿]/.test(t)) continue;
      const el = n.parentElement; if (!el || !vis(el) || el.closest("svg,#debugPanel,.lang-list,.lang-gate-card,[data-raw],.trail-name,.tc-name,.fp-info b,.pet-name,input,textarea,.leaflet-container,.brand,header h1,#toast,#ttTag,#ttFps,.fc-cap,.ht,.ev-title,.ev-note,.gp-av,.fv-name,.pk-tab,.gd-empty")) continue;
      const r = el.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) continue;
      out.cjk.push(`${name(el)} "${t.slice(0, 30)}"`);
    }
  }
  for (const k in out) out[k] = [...new Set(out[k])].slice(0, 12);
  return out;
};
const COMBOS = (() => { const L = process.argv[2] ? [process.argv[2]] : ["zh", "en"], F = process.argv[3] ? [process.argv[3]] : ["1.2", "1.65"]; return L.flatMap(l => F.map(f => [l, f])); })();
(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: ROOT + "/web", stdio: "ignore" }); await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch(); const report = {};
  for (const [lang, fsz] of COMBOS) {
    const tag = `${lang}-${fsz}`, errs = []; report[tag] = {};
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, timezoneId: "Asia/Taipei" }); const p = await ctx.newPage(); await require(ROOT + "/scripts/tests/fake-weather")(p);
    p.on("pageerror", e => errs.push(e.message.split("\n")[0])); p.on("framenavigated", f => { if (f === p.mainFrame() && process.env.SW_DEBUG) console.log("NAV", f.url(), new Error().stack.split("\n")[2]); });
    await p.addInitScript(o => { if (sessionStorage.getItem("seed")) return; sessionStorage.setItem("seed", "1"); localStorage.setItem("tt_lang", o.lang); localStorage.setItem("tt_fontscale", o.fsz); ["tt_onboarded_v2", "tt_coach_trail", "tt_locperm_prompted", "tt_coach_record", "tt_coach_record_tools", "tt_coach_peaks", "tt_coach_team", "tt_coach_pet", "tt_coach_soc_friends", "tt_coach_soc_explore", "tt_coach_soc_search", "tt_coach_soc_notif", "tt_coach_soc_me"].forEach(k => localStorage.setItem(k, "1")); localStorage.setItem("tt_debug_km", "95"); localStorage.setItem("tt_pet_aff", "92"); localStorage.setItem("tt_pet_aff_t", new Date().toISOString());
      const t = new Date(Date.now() - 3 * 864e5).toISOString(); localStorage.setItem("tt_pet_gifts", JSON.stringify([{ id: "pine", t }, { id: "maple", t }, { id: "fern", t }])); localStorage.setItem("tt_pet_props", JSON.stringify({ l: "maple", r: "pine", b: "fern" })); localStorage.setItem("tt_pet_tricks", JSON.stringify({ 4: t })); }, { lang, fsz });
    await p.addInitScript(MOCK); await p.goto(`http://localhost:${PORT}/`); await require(ROOT + "/scripts/tests/ready")(p);
    for (let k = 0; k < 3; k++) { await p.waitForTimeout(1200); await require(ROOT + "/scripts/tests/ready")(p); try { await p.evaluate(() => 1); break; } catch (e) { /* 切語言重整中 */ } }
    await p.evaluate(() => { window.__installFakeSupa({}); const P = id => window.__fakeT.profiles.find(x => x.id === id); Object.assign(P("u1"), { pet_hat: "straw", pet_acc: "scarf", pet_state: { last: new Date(Date.now() - 864e5).toISOString(), at: new Date(Date.now() - 3 * 3600e3).toISOString() } }); localStorage.setItem("tt_pet_guest_who", JSON.stringify({ id: "u1", day: todayStr() })); });
    const kill = () => p.evaluate(() => { document.querySelectorAll(".tour,.coach,.ttdlg-ov,.pet-modal,.sheet.open,#debugPanel,.evolve-ov,[data-ov]").forEach(e => e.remove()); document.querySelectorAll(".sheet-close").forEach(b => { try { if (b.offsetParent) b.click(); } catch (e) { } }); });
    const shot = async (name, fn) => {
      if (process.env.SW_DEBUG) console.log("SHOT", name);
      try { await kill(); await fn(); await p.waitForTimeout(700); const d = await p.evaluate(DET); d.align = (await p.evaluate(ALIGN)).map(x => `"${x.title}" ← "${x.sub.slice(0, 20)}" (${x.over}px)`);
        const hit = Object.entries(d).filter(([, v]) => v.length); report[tag][name] = Object.fromEntries(hit);
        if (hit.length) await p.screenshot({ path: `${OUT}${tag}-${name}.png` });
      } catch (e) { report[tag][name] = { error: [e.message.split("\n")[0]] }; }
    };
    const tab = v => async () => { await p.click(`.tab[data-view="${v}"]`); await p.waitForTimeout(700); };
    for (const v of ["explore", "record", "pet", "me", "social"]) await shot(v, tab(v));
    for (const y of [600, 1200, 1800, 2400]) for (const v of ["pet", "me"]) await shot(`${v}@${y}`, async () => { await tab(v)(); await p.evaluate(y => { document.scrollingElement.scrollTop = y; document.querySelectorAll(".view.active,main").forEach(m => m.scrollTop = y); }, y); });
    await shot("pet-help", async () => { await tab("pet")(); await p.click("#petHelp"); });
    await shot("pet-dex", async () => { await tab("pet")(); await p.click("#petDex"); });
    for (const pane of ["帽子", "配件", "擺設", "hat", "acc", "prop"].slice(0, 3)) await shot("dress-" + pane, async () => { await tab("pet")(); await p.click("#petDress"); await p.waitForTimeout(400); await p.evaluate(i => { const bs = document.querySelectorAll('[data-ov="pethat"] .dr-tabs button'); if (bs[i]) bs[i].click(); }, ["帽子", "配件", "擺設"].indexOf(pane)); });
    await shot("friends", async () => { await tab("pet")(); await p.evaluate(() => Pets.renderFriends()); await p.waitForTimeout(500); await p.evaluate(() => document.getElementById("petFriends").scrollIntoView({ block: "center" })); });
    await shot("visit", async () => { await tab("pet")(); await p.evaluate(() => Pets.visit(window.__fakeT.profiles.find(x => x.id === "u1"), false, null)); });
    await shot("visit-together", async () => { await tab("pet")(); await p.evaluate(() => Pets.visit(window.__fakeT.profiles.find(x => x.id === "u1"), false, null, true)); await p.waitForTimeout(1200); });
    await shot("give-picker", async () => { await tab("pet")(); await p.evaluate(() => Pets.visit(window.__fakeT.profiles.find(x => x.id === "u1"), false, null)); await p.waitForTimeout(300); await p.click("#pvItem"); await p.waitForTimeout(500); });
    await shot("photo", async () => { await tab("pet")(); await p.evaluate(() => openPetPhoto()); });
    // 測試面板：每顆按鈕按一次（跳過會重整頁面、清資料、導覽的）
    const SKIP = /重設|清|導覽|重整|登出|刪|reset|語言|重看/;
    let labels = [];
    for (let k = 0; k < 3 && !labels.length; k++) try { labels = await p.evaluate(async () => { await ensureScript("js/debug.js"); window.ttIsOwner = async () => true; if (!document.getElementById("debugPanel")) await window.openDebugPanel(); return [...document.querySelectorAll("#debugPanel .dbg-sec button")].map(b => b.textContent); }); } catch (e) { console.log("labels retry", k, e.message.split("\n")[0]); await p.waitForTimeout(1500); }
    const dbgErr = {};
    for (const lb of labels) {
      if (SKIP.test(lb)) continue;
      const n0 = errs.length;
      try {
        await kill(); await p.evaluate(async () => { if (!document.getElementById("debugPanel")) await window.openDebugPanel(); });
        await p.evaluate(lb => { const b = [...document.querySelectorAll("#debugPanel .dbg-sec button")].find(x => x.textContent === lb); if (b) b.click(); }, lb);
        await p.waitForTimeout(900);
        const d = await p.evaluate(DET); d.align = (await p.evaluate(ALIGN)).map(x => `"${x.title}" ← "${x.sub.slice(0, 20)}" (${x.over}px)`);
        const hit = Object.entries(d).filter(([, v]) => v.length); if (hit.length) { report[tag]["dbg:" + lb] = Object.fromEntries(hit); await p.screenshot({ path: `${OUT}${tag}-dbg-${lb.replace(/[^\w一-鿿]/g, "")}.png` }); }
      } catch (e) { dbgErr[lb] = e.message.split("\n")[0]; }
      if (errs.length > n0) dbgErr[lb] = errs.slice(n0).join(" | ");
    }
    report[tag]["_debug_buttons"] = { pressed: labels.filter(l => !SKIP.test(l)).length, errors: dbgErr };
    report[tag]["_page_errors"] = [...new Set(errs)];
    await ctx.close();
    const n = Object.entries(report[tag]).filter(([k, v]) => !k.startsWith("_") && Object.keys(v).length).length;
    fs.writeFileSync(OUT + "report.json", JSON.stringify(report, null, 1));
    console.log(`${tag}: ${n} screens with findings, ${Object.keys(dbgErr).length} debug-button errors, ${report[tag]._page_errors.length} page errors`);
  }
  fs.writeFileSync(OUT + "report.json", JSON.stringify(report, null, 1));
  await b.close(); srv.kill();
})();
