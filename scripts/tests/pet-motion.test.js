// 夥伴餵食的「逐格」動作檢查（2026-10-05 第二輪）：用 Chrome 的虛擬時間一格 33ms（＝30fps）推進，每格量部位位置，
// 抓跳動、腳滑、嘴沒碰到果實、頭離開身體、尾巴亂甩……——即時截圖一秒只拍得到幾張，會漏掉這些（上一輪神龍尾巴亂甩就是這樣漏的）。
// 七隻 × 兩組指定落點（左右兩邊、兩種朝向都走到）＋中途滑走＋連按兩下。
// 還沒修好的項目標 todo（印出 TODO、不算失敗）；修好那一階段就把 todo 拿掉，之後壞掉就會紅。
// 環境變數 PM_ONLY=3,4 只跑某幾階；PM_DUMP=1 每格截圖到 scripts/tests/out/pm/
const path = require("path"), fs = require("fs");
const ROOT = path.resolve(__dirname, "../.."); const { chromium } = require(ROOT + "/node_modules/playwright"); const { spawn } = require("child_process");
const MOCK = fs.readFileSync(__dirname + "/soc-mock.js", "utf8");
const PORT = +process.env.TT_PORT || 8911, DUMP = !!process.env.PM_DUMP, ONLY = (process.env.PM_ONLY || "").split(",").filter(Boolean).map(Number);
const OUT = path.join(__dirname, "out", "pm") + "/"; if (DUMP) fs.mkdirSync(OUT, { recursive: true });
let fails = 0, todos = 0; const errs = [];
const ok = (c, m, todo) => { if (c) console.log((todo ? "PASS(已修好，可拿掉 todo " + todo + ") " : "PASS ") + m); else if (todo) { todos++; console.log("TODO(" + todo + ") " + m); } else { fails++; console.log("FAIL " + m); } };
const KM = [0, 5, 20, 40, 90, 150, 260];
// 落點：px（相對舞台中間）；神龍是雲上「圖上的 x」
const SPOTS = { 0: [[-34, 2, 34], [36, 12, -20]], 3: [[-62, 8, 66], [66, 40, 18], [-30, 27, -64]], 4: [[-62, 8, 66], [66, 40, 18], [23, -62, 79]], 6: [[96, 140, 186], [104, 150, 176]] };   // 狐、虎的 C＝第一次錄影時的落點（會出現量完補小碎步）
const DEF = [[-62, 8, 66], [66, 40, 18]];
// 還沒修好的（階段名）：key＝檢查代號:階段
const TODO = {
  "jump:1": "P4", "jump:2": "P6", "jump:3": "P3", "jump:4": "P3", "jump:5": "P5",
  "bite:5": "P5", "berry:5": "P5", "berry:6": "P5", "tail:6": "P5", "happy:5": "P5",
  "neck:1": "P4", "egg:0": "P6", "wing:2": "P6",
  "time:1": "P4", "time:3": "P3", "time:4": "P3", "time:5": "P5",
};
const todoOf = (k, st) => TODO[k + ":" + st];

const probe = () => {
  const box = document.querySelector(".ps-box"), em = document.querySelector("#petEmoji"), st = +box.dataset.stage, standing = box.classList.contains("standing");
  const C = r => [r.left + r.width / 2, r.top + r.height / 2];
  const P = sel => PetWalk.part(box, sel);
  const m = P(".pr-mouth"), crit = em.querySelector(".pet-critter").getBoundingClientRect();
  const o = { cls: [...em.classList].filter(c => /^(pb-|st-|chew)/.test(c)).join(" "), bcl: [...box.classList].filter(c => /standing|walking|face-r|pf-|lv-l/.test(c)).join(" "),
    mouth: m ? C(m.getBoundingClientRect()) : null, crit: [crit.left, crit.top, crit.width, crit.height], wx: box.__wx,
    berries: [...document.querySelectorAll(".ps-berry")].map(b => { const r = b.getBoundingClientRect(); return { c: C(r), w: r.width, op: +getComputedStyle(b).opacity, cls: b.className.replace("ps-berry", "").trim() }; }),
    sparks: document.querySelectorAll(".ps-spark").length };
  const eh = [...em.querySelectorAll(".pc-eh")].find(e => !e.closest(".pr-stand") || standing); o.happy = !!eh && getComputedStyle(eh).display !== "none";
  if (standing) o.paws = [...em.querySelectorAll(".pr-stand .pr-leg .pr-shin")].map(sh => { const e = [...sh.querySelectorAll("ellipse")].find(x => !x.closest("clipPath") && !x.closest("defs")); const pt = new DOMPoint(+e.getAttribute("cx"), +e.getAttribute("cy") + +e.getAttribute("ry")).matrixTransform(e.getScreenCTM()); return [pt.x, pt.y]; });
  if (st === 1) {   // 頭的中心相對「身體最前端」的位置（身體座標）：頭跟身體連著時這個向量幾乎不變
    const svg = em.querySelector(".pet-critter"), inv = svg.getScreenCTM().inverse(), hd = em.querySelector(".pr-head");
    const hc = new DOMPoint(148, 136).matrixTransform(hd.getScreenCTM()).matrixTransform(inv);
    const tube = [...em.querySelectorAll(".pr-deform path")].sort((a, b) => b.getAttribute("d").length - a.getAttribute("d").length)[0];
    const n = tube.getAttribute("d").match(/-?\d*\.?\d+/g).map(Number), pts = []; for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
    pts.sort((a, b) => b[0] - a[0]); const f = pts.slice(0, 4).reduce((s, q) => [s[0] + q[0] / 4, s[1] + q[1] / 4], [0, 0]);
    o.neck = [hc.x - f[0], hc.y - f[1]];
  }
  if (st === 2) { const ext = em.querySelector(".pr-ext"); if (+getComputedStyle(ext).opacity > .5) { const pt = ext.getPointAtLength(ext.getTotalLength()), s = new DOMPoint(pt.x, pt.y).matrixTransform(ext.getScreenCTM()); o.prob = [s.x, s.y]; }
    const hw = [...em.querySelectorAll(".pc-hw")].map(e => e.getBoundingClientRect()); o.hw = [Math.min(...hw.map(r => r.left)), Math.min(...hw.map(r => r.top)), Math.max(...hw.map(r => r.right)), Math.max(...hw.map(r => r.bottom))]; }
  if (st === 6) { const d = em.querySelector(".pr-deform").getBoundingClientRect(), b = box.getBoundingClientRect(); o.deform = [d.left, d.top, d.right, d.bottom]; o.boxr = [b.left, b.top, b.right, b.bottom]; }
  return o;
};

async function run(b, st, spots, tag) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); await require(__dirname + "/fake-weather")(p); p.on("pageerror", e => errs.push(tag + ": " + e.message));
  await p.addInitScript(o => { localStorage.setItem("tt_lang", "zh"); ["tt_onboarded_v2", "tt_coach_trail", "tt_locperm_prompted", "tt_coach_record", "tt_coach_record_tools", "tt_coach_peaks", "tt_coach_team", "tt_coach_pet"].forEach(k => localStorage.setItem(k, "1")); localStorage.setItem("tt_debug_km", String(o.km)); localStorage.setItem("tt_pet_berry_bonus", "20"); }, { km: KM[st] });
  await p.addInitScript(MOCK); await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(2500);
  await p.evaluate(() => document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e => e.remove())); await p.click('.tab[data-view="pet"]'); await p.waitForTimeout(1500);
  await p.evaluate(s => { document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e => e.remove()); window.__psNoIdle = true; window.__psSpots = s; localStorage.removeItem("tt_pet_fed_t"); renderPet(); document.querySelector(".ps-box").scrollIntoView({ block: "center" }); }, spots);
  await p.waitForTimeout(600);
  const bal0 = await p.evaluate(() => berriesBalance());
  const cdp = await ctx.newCDPSession(p); await cdp.send("Emulation.setVirtualTimePolicy", { policy: "pause" });
  await p.evaluate(() => document.querySelector("#petFeed").click());
  const F = []; let idle = 0;
  for (let f = 0; f < 1100; f++) {
    await cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance", budget: 33 }); await new Promise(r => cdp.once("Emulation.virtualTimeBudgetExpired", r));
    if (!DUMP) await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 10, clip: { x: 0, y: 0, width: 1, height: 1, scale: 1 } });   // 虛擬時間下不截圖就不出畫面（requestAnimationFrame 不會跑）：截一個 1×1 逼它畫一格
    const o = await p.evaluate(probe); F.push(o);
    if (DUMP) { const r = await p.evaluate(() => { const q = document.querySelector(".ps-box").getBoundingClientRect(); return { x: q.left, y: q.top, width: q.width, height: q.height, scale: 1 }; }); const s = await cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 70, clip: r }); fs.writeFileSync(`${OUT}${tag}-${String(f).padStart(4, "0")}.jpg`, Buffer.from(s.data, "base64")); }
    if (!o.berries.length && f > 60 && !/standing|walking/.test(o.bcl) && !o.cls) { if (++idle > 20) break; } else idle = 0;
  }
  await cdp.send("Emulation.setVirtualTimePolicy", { policy: "advance" });
  const end = await p.evaluate(() => ({ bal: berriesBalance(), wx: parseFloat(document.querySelector(".ps-box").style.getPropertyValue("--wx")) || 0 }));
  await ctx.close();
  return { F, bal0, end };
}

const D = (a, b) => (a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) : 0);
function judge(st, tag, R) {
  const F = R.F, n = F.length, sec = n * .033;
  if (process.env.PM_SEQ) { let pv = ""; console.log(tag, F.map((f, i) => { const k = f.cls + "|" + f.bcl + "|" + f.berries.length; if (k === pv) return ""; pv = k; return i + ":" + k; }).filter(Boolean).join("  ").slice(0, 1500)); }
  const changed = i => i > 0 && (F[i].bcl !== F[i - 1].bcl || (i > 1 && F[i - 1].bcl !== F[i - 2].bcl));   // 換姿勢（正面↔側身交叉淡入、幼蟲換邊）那一兩格不算
  // 1) 嘴每格跳動
  let jump = 0, at = -1; for (let i = 1; i < n; i++) { if (changed(i)) continue; const d = D(F[i].mouth, F[i - 1].mouth); if (d > jump) { jump = d; at = i; } }
  ok(jump <= 7, `${tag}: the mouth never jumps more than 7px in one frame (max ${jump.toFixed(1)} @${at} ${at >= 0 ? F[at].cls + "|" + F[at].bcl : ""})`, todoOf("jump", st));
  // 每顆果實的吃食窗口：從 st-lean／st-open／st-sip／st-crouch／st-tilt 開始，到 pb-gulp 結束（或果實消失）
  const wins = []; let s0 = -1;
  for (let i = 0; i < n; i++) { const eat = /st-lean|st-open|st-sip|st-crouch|st-tilt|st-land|pb-snap|pb-chew|pb-sip|pb-gulp|pb-swell/.test(F[i].cls); if (eat && s0 < 0) s0 = i; if (!eat && s0 >= 0) { if (!/pb-/.test(F[i].cls) && !(F[i + 1] && /st-|pb-/.test(F[i + 1].cls))) { wins.push([s0, i]); s0 = -1; } } }
  if (st === 3 || st === 4) {
    let drift = 0, steps = 0, up = 0, upAt = "";
    const walk = i => /walking/.test(F[i].bcl);
    for (let a = 1; a < n; a++) {
      if (!(/st-lean/.test(F[a].cls) && !/st-lean/.test(F[a - 1].cls))) continue;   // 每顆：開始低頭 a → 咬下 sn → 吞完 g
      const sn = F.findIndex((f, i) => i >= a && /pb-snap/.test(f.cls)); if (sn < 0) continue;
      let g = F.findIndex((f, i) => i > sn && /pb-gulp/.test(f.cls)); if (g < 0) g = n - 1; while (g < n - 1 && /pb-gulp/.test(F[g].cls)) g++;
      const base = F.slice(a, g).find(f => f.paws && !walk(F.indexOf(f)));
      for (let i = a; i < g; i++) if (base && F[i].paws && !walk(i)) drift = Math.max(drift, ...F[i].paws.map((q, k) => D(q, base.paws[k])));
      // 「走到定點」＝這次低頭之前最後一段長的走路（≥6 格）結束那一格；從那裡到咬下：不能再踏步、嘴只能往下（不能先抬回去）
      let e = a - 1; while (e > 0 && !(walk(e) && walk(e - 1) && walk(e - 2) && walk(e - 3) && walk(e - 4) && walk(e - 5))) e--;
      if (e <= 0) e = a; else while (e < a && walk(e)) e++;   // 前面沒有長的走路（果實就在旁邊）：從 st-lean 開始算
      let lo = -1e9;
      for (let i = e; i < sn; i++) { if (walk(i)) steps++; if (F[i].mouth) { if (F[i].mouth[1] < lo - 2 && lo - F[i].mouth[1] > up) { up = lo - F[i].mouth[1]; upAt = `@${i} (from ${e}) ${F[i].cls}|${F[i].bcl}`; } lo = Math.max(lo, F[i].mouth[1]); } }
    }
    ok(drift <= 1, `${tag}: paws stay planted while eating (max drift ${drift.toFixed(1)}px)`, todoOf("paws", st));
    ok(steps === 0, `${tag}: no extra step between arriving at the berry and swallowing (${steps} frames)`, todoOf("step", st));
    ok(up <= 2, `${tag}: from arriving to the bite the head only goes down, never back up (${up.toFixed(1)}px ${upAt})`, todoOf("lean", st));
  }
  // 2) 咬下那一格：嘴在果實上（蝶看口器、蛋不咬）
  if (st !== 0 && st !== 2) {
    const bites = []; for (let i = 1; i < n; i++) if (/pb-snap/.test(F[i].cls) && !/pb-snap/.test(F[i - 1].cls)) { const tb = F[i].berries.find(x => /target/.test(x.cls)); if (tb) bites.push(+(D(F[i].mouth, tb.c) / (tb.w / 2)).toFixed(2)); }
    ok(bites.length >= 3 && bites.every(v => v <= 1), `${tag}: at every bite the mouth is on the berry (distance / berry radius ${JSON.stringify(bites)})`, todoOf("bite", st));
  }
  if (st === 2) {
    const g = F.filter(f => f.prob && /pb-sip/.test(f.cls)).map(f => { const tb = f.berries.find(x => /target/.test(x.cls)); return tb ? D(f.prob, tb.c) : 0; });
    ok(g.length > 10 && Math.max(...g) <= 6, `${tag}: the proboscis tip stays on the berry the whole time it sips (max ${Math.max(0, ...g).toFixed(1)}px)`);
    const under = F.filter(f => f.hw && /st-sip/.test(f.cls)).some(f => { const tb = f.berries.find(x => /target/.test(x.cls)); return tb && tb.c[0] > f.hw[0] + 6 && tb.c[0] < f.hw[2] - 6 && tb.c[1] > f.hw[1] && tb.c[1] < f.hw[3]; });
    ok(!under, `${tag}: the berry it sips is beside the wings, not hidden under them`, todoOf("wing", st));
  }
  // 3) 果實不亂跳：地上的不動；拿著／托著的每格最多 10px
  let bj = 0; for (let i = 45; i < n; i++) { if (F[i].berries.length !== F[i - 1].berries.length) continue; F[i].berries.forEach((x, k) => { if (/eaten|sipped|melt/.test(x.cls)) return; const d = D(x.c, F[i - 1].berries[k].c), held = /held|carried/.test(x.cls); bj = Math.max(bj, held ? d - 10 : d - 1); }); }
  ok(bj <= 0, `${tag}: berries never jump (ground berries still, held ones ≤10px/frame; worst excess ${bj.toFixed(1)}px)`, todoOf("berry", st));
  if (st === 1) {
    const v = F.filter(f => f.neck).map(f => f.neck), v0 = v[0]; const dv = Math.max(...v.map(q => D(q, v0)));
    ok(dv <= 3, `${tag}: the head stays attached to the first body segment (max shift ${dv.toFixed(1)} units)`, todoOf("neck", st));
  }
  if (st === 6) {
    let out = 0, thr = 0; for (let i = 1; i < n; i++) { const d = F[i].deform, b = F[i].boxr; out = Math.max(out, b[0] - d[0], d[2] - b[2], b[1] - d[1]); thr = Math.max(thr, ...d.map((q, k) => Math.abs(q - F[i - 1].deform[k]))); }
    ok(out <= 0 && thr <= 12, `${tag}: the tail stays in frame and moves smoothly (out ${out.toFixed(0)}px, bbox change ${thr.toFixed(0)}px/frame)`, todoOf("tail", st));
  }
  if (st === 5) {   // 吞下最後一口之前不閉眼享受
    let bad = 0; for (const f of F) { const tb = f.berries.find(x => /target/.test(x.cls) && !/eaten/.test(x.cls)); if (tb && f.happy && D(f.mouth, tb.c) > tb.w / 2) bad++; }
    ok(bad === 0, `${tag}: no happy closed eyes while the berry is still away from the mouth (${bad} frames)`, todoOf("happy", st));
  }
  if (st === 0) {   // 果實跟光點不能同時「完整」存在
    let both = 0; for (const f of F) if (f.sparks >= 3 && f.berries.some(x => /melt/.test(x.cls) && x.op > .8 && x.w >= f.berries[0].w * .9)) both++;
    ok(both === 0, `${tag}: the berry shrinks as the sparks leave it (frames with a full berry and ≥3 sparks: ${both})`, todoOf("egg", st));
  }
  ok(sec <= 16, `${tag}: one feeding (3 berries, walk home, celebrate) takes ≤16 s (${sec.toFixed(1)} s)`, todoOf("time", st));
  const last = F[n - 1];
  ok(!last.berries.length && !last.cls && Math.abs(R.end.wx) < 1 && R.end.bal === R.bal0 - 3, `${tag}: ends clean — no berries, no leftover pose, back in the middle, exactly 3 berries spent ${JSON.stringify({ cls: last.cls, wx: R.end.wx, spent: R.bal0 - R.end.bal })}`);
}

(async () => {
  const srv = spawn("python3", ["-m", "http.server", String(PORT)], { cwd: ROOT + "/web", stdio: "ignore" }); await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch();
  const jobs = []; for (let st = 0; st < 7; st++) { if (ONLY.length && !ONLY.includes(st)) continue; (SPOTS[st] || DEF).forEach((s, k) => jobs.push([st, s, `stage ${st} ${"ABC"[k]}`])); }
  const res = {}; let q = jobs.slice();
  // 每個工作各開一個瀏覽器：同一個瀏覽器裡不在前景的分頁會被當成「看不到」，餵食一開始就直接結算
  await Promise.all(Array.from({ length: 4 }, async () => { const bw = await chromium.launch(); while (q.length) { const [st, s, tag] = q.shift(); res[tag] = [st, await run(bw, st, s, tag)]; } await bw.close(); }));
  for (const [st, s, tag] of jobs) judge(st, tag, res[tag][1]);
  // 中途滑走：直接結算，果實、姿勢都收乾淨，只扣一次；連按兩下：只開一輪
  if (!ONLY.length || ONLY.includes(3)) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage(); await require(__dirname + "/fake-weather")(p);
    await p.addInitScript(() => { localStorage.setItem("tt_lang", "zh"); ["tt_onboarded_v2", "tt_coach_trail", "tt_locperm_prompted", "tt_coach_record", "tt_coach_record_tools", "tt_coach_peaks", "tt_coach_team", "tt_coach_pet"].forEach(k => localStorage.setItem(k, "1")); localStorage.setItem("tt_debug_km", "40"); localStorage.setItem("tt_pet_berry_bonus", "20"); });
    await p.addInitScript(MOCK); await p.goto(`http://localhost:${PORT}/`); await p.waitForTimeout(2500);
    await p.evaluate(() => document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e => e.remove())); await p.click('.tab[data-view="pet"]'); await p.waitForTimeout(1500);
    const r = await p.evaluate(async () => { window.__psNoIdle = true; document.querySelectorAll(".tour,.coach,.ttdlg-ov").forEach(e => e.remove()); localStorage.removeItem("tt_pet_fed_t"); renderPet(); document.querySelector(".ps-box").scrollIntoView({ block: "center" }); await new Promise(r => setTimeout(r, 500));
      const b0 = berriesBalance(); const fb = document.querySelector("#petFeed"); fb.click(); fb.click(); await new Promise(r => setTimeout(r, 2600));
      window.scrollTo(0, document.body.scrollHeight); document.querySelector(".ps-box").closest(".view, main, body").scrollTop = 99999; document.querySelector(".ps-box").style.transform = "translateY(3000px)"; await new Promise(r => setTimeout(r, 6000));
      const em = document.querySelector("#petEmoji"); return { spent: b0 - berriesBalance(), berries: document.querySelectorAll(".ps-berry").length, cls: [...em.classList].filter(c => /^(pb-|st-)/.test(c)).join(" ") }; });
    ok(r.spent === 3 && r.berries === 0 && !r.cls, "double tap + scrolling away mid-feed: one feeding only, settles cleanly " + JSON.stringify(r));
    await ctx.close();
  }
  console.log("ERRS", JSON.stringify(errs)); console.log("TODO", todos); console.log("FAILS", fails + (errs.length ? 1 : 0)); await b.close(); srv.kill();
})();
