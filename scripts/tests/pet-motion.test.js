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
const SPOTS = { 0: [[-34, 2, 34], [36, 12, -20]], 1: [[-62, 8, 66], [66, 40, 18], null], 3: [[-62, 8, 66], [66, 40, 18], [-30, 27, -64]], 4: [[-62, 8, 66], [66, 40, 18], [23, -62, 79]], 6: [[96, 140, 186], [104, 150, 176]] };   // 狐、虎的 C＝第一次錄影時的落點（會出現量完補小碎步）
const DEF = [[-62, 8, 66], [66, 40, 18]];
// 還沒修好的（階段名）：key＝檢查代號:階段
const TODO = {};   // 2026-10-06 第二輪 P0～P6 全部修好；之後新加的檢查還沒修好時放這裡（"檢查代號:階段": "Pn"）
const todoOf = (k, st) => TODO[k + ":" + st];

const probe = () => {
  const box = document.querySelector(".ps-box"), em = document.querySelector("#petEmoji"), st = +box.dataset.stage, standing = box.classList.contains("standing");
  const C = r => [r.left + r.width / 2, r.top + r.height / 2];
  const P = sel => PetWalk.part(box, sel);
  const m = P(".pr-mouth"), crit = em.querySelector(".pet-critter").getBoundingClientRect();
  const o = { raw: em.className + " || " + box.className, cls: [...em.classList].filter(c => /^(pb-|st-|chew)/.test(c)).join(" "), bcl: [...box.classList].filter(c => /standing|walking|face-r|pf-|lv-l/.test(c)).join(" "),
    mouth: PetWalk.cpt(box, "mouth") || (m ? C(m.getBoundingClientRect()) : null),   // 嘴的接觸點（跟程式用的同一個；側臉的嘴巴群組比較長，外框中心會偏後） crit: [crit.left, crit.top, crit.width, crit.height], wx: box.__wx,
    berries: [...document.querySelectorAll(".ps-berry")].map(b => { const r = b.getBoundingClientRect(); return { c: C(r), w: r.width, op: +getComputedStyle(b).opacity, cls: b.className.replace("ps-berry", "").trim() }; }),
    sparks: [...document.querySelectorAll(".ps-spark")].filter(e => +getComputedStyle(e).opacity > .3).length };   // 只算看得到的（還沒輪到的光點是透明的）
  { const sv = em.querySelector(".pet-critter"), R = sv.getBoundingClientRect(); let sp = 0;   // 畫出來的東西有沒有超出畫布（iOS WebKit 會照畫布裁掉）
    let sw = ""; [...sv.children].filter(g => g.tagName === "g" && getComputedStyle(g).display !== "none").forEach(g => { const q = g.getBoundingClientRect(); const v = Math.max(R.left - q.left, q.right - R.right, R.top - q.top, q.bottom - R.bottom); if (q.width && v > sp) { sp = v; sw = g.getAttribute("class") + " L" + (R.left - q.left).toFixed(0) + " R" + (q.right - R.right).toFixed(0) + " T" + (R.top - q.top).toFixed(0) + " B" + (q.bottom - R.bottom).toFixed(0); } });
    o.spill = sp; o.spillWhat = sw; }
  const eh = [...em.querySelectorAll(".pc-eh")].find(e => !e.closest(".pr-stand") || standing); o.happy = !!eh && getComputedStyle(eh).display !== "none";
  if (standing) o.paws = [...em.querySelectorAll(".pr-stand .pr-leg .pr-shin")].map(sh => { const e = [...sh.querySelectorAll("ellipse")].find(x => !x.closest("clipPath") && !x.closest("defs")); const pt = new DOMPoint(+e.getAttribute("cx"), +e.getAttribute("cy") + +e.getAttribute("ry")).matrixTransform(e.getScreenCTM()); return [pt.x, pt.y]; });
  if (st === 1) {   // 頭跟身體有沒有分開：頭（半徑 23）的中心到最前面那一節中心的距離（身體座標；平常約 17，>25＝看得到縫）
    const svg = em.querySelector(".pet-critter"), inv = svg.getScreenCTM().inverse(), hd = em.querySelector(".pr-head");
    const hc = new DOMPoint(148, 136).matrixTransform(hd.getScreenCTM()).matrixTransform(inv);
    const segs = [...em.querySelectorAll(".lv-seg")], fr = segs.reduce((a, b) => (+b.dataset.u > +a.dataset.u ? b : a));
    const fc = new DOMPoint(+fr.dataset.u, +fr.dataset.v).matrixTransform(fr.getScreenCTM()).matrixTransform(inv);
    o.neck = Math.hypot(hc.x - fc.x, hc.y - fc.y);
  }
  if (st === 0) {   // 蛋殼最低點：取蛋殼橢圓上的點、用真的變換算（群組外框在旋轉時會把四個角轉下去，量出來偏大）
    const eg = [...em.querySelectorAll(".pc-egg ellipse")].find(e => !e.closest("clipPath") && !e.closest("defs")), M = eg.getScreenCTM(); let lo = -1e9;
    const cx = +eg.getAttribute("cx"), cy = +eg.getAttribute("cy"), rx = +eg.getAttribute("rx"), ry = +eg.getAttribute("ry");
    for (let k = 0; k < 64; k++) { const t = k / 64 * Math.PI * 2, q = new DOMPoint(cx + rx * Math.cos(t), cy + ry * Math.sin(t)).matrixTransform(M); lo = Math.max(lo, q.y); }
    o.eggBottom = lo;
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
  // 1) 嘴的跳格：某一格的位移比前後兩格都大 5px 以上（尖峰＝跳），或一格超過 18px。平順但快的動作（低頭的弧線）不算
  const dd = F.map((f, i) => (i && !changed(i) && !/pb-hop/.test(f.cls) ? D(f.mouth, F[i - 1].mouth) : 0));   // 慶祝的跳（pb-hop）本來就是快的一下，不算
  let jump = 0, at = -1; for (let i = 2; i < n - 1; i++) { if (changed(i) || changed(i + 1)) continue; const sp = Math.max(dd[i] - Math.max(dd[i - 1], dd[i + 1]) > 5 ? dd[i] - Math.max(dd[i - 1], dd[i + 1]) : 0, dd[i] > 18 ? dd[i] : 0); if (sp > jump) { jump = sp; at = i; } }
  if (process.env.PM_SEQ && at > 0) for (let i = at - 3; i <= at + 2; i++) console.log("   ", i, dd[i].toFixed(1), F[i].mouth.map(v => v.toFixed(1)), F[i].raw);
  ok(jump === 0, `${tag}: the mouth never pops (no single-frame spike >5px over its neighbours, nothing >18px/frame; worst ${jump.toFixed(1)} @${at} ${at >= 0 ? F[at].cls + "|" + F[at].bcl : ""})`, todoOf("jump", st));
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
      // 從上一顆吞完（或餵食開始）到這一顆咬下：走路只能有一段（不准到了再補一小步）
      let gp = a; while (gp > 0 && !/pb-gulp/.test(F[gp].cls)) gp--; let runs = 0; for (let i = gp + 1; i < sn; i++) if (walk(i) && !walk(i - 1)) runs++; steps += Math.max(0, runs - 1);
      let lo = -1e9;
      for (let i = e; i < sn; i++) { if (F[i].mouth) { if (F[i].mouth[1] < lo - 2 && lo - F[i].mouth[1] > up) { up = lo - F[i].mouth[1]; upAt = `@${i} (from ${e}) ${F[i].cls}|${F[i].bcl}`; } lo = Math.max(lo, F[i].mouth[1]); } }
    }
    ok(drift <= 1, `${tag}: paws stay planted while eating (max drift ${drift.toFixed(1)}px)`, todoOf("paws", st));
    ok(steps === 0, `${tag}: walks to each berry in one go — no extra adjusting step before the bite (${steps} extra walks)`, todoOf("step", st));
    ok(up <= 2, `${tag}: from arriving to the bite the head only goes down, never back up (${up.toFixed(1)}px ${upAt})`, todoOf("lean", st));
  }
  // 2) 咬下那一格：嘴在果實上（蝶看口器、蛋不咬）
  if (st !== 0 && st !== 2) {
    const bites = []; for (let i = 1; i < n; i++) if (/pb-snap/.test(F[i].cls) && !/pb-snap/.test(F[i - 1].cls)) { const tb = F[i].berries.find(x => /target/.test(x.cls)); if (tb) bites.push(+(D(F[i].mouth, tb.c) / (tb.w / 2)).toFixed(2)); }
    ok(bites.length >= 3 && bites.every(v => v <= 1), `${tag}: at every bite the mouth is on the berry (distance / berry radius ${JSON.stringify(bites)})`, todoOf("bite", st));
  }
  if (st === 2) {
    const g = F.map((f, i) => [f, i]).filter(([f]) => f.prob && /pb-sip/.test(f.cls)).map(([f, i]) => { const tb = f.berries.find(x => /target/.test(x.cls)); return [tb ? D(f.prob, tb.c) : 0, i]; });
    const gw = g.reduce((a, b) => (b[0] > a[0] ? b : a), [0, -1]);
    if (process.env.PM_SEQ) console.log(tag, "sip", g.filter((_, k) => k % 3 === 0).map(([d, i]) => { const tb = F[i].berries.find(x => /target/.test(x.cls)); return i + ":" + d.toFixed(1) + " tip" + F[i].prob.map(v => v.toFixed(0)) + " b" + tb.c.map(v => v.toFixed(0)) + " w" + tb.w.toFixed(0); }).join("  "));
    ok(g.length > 10 && gw[0] <= 6, `${tag}: the proboscis tip stays on the berry the whole time it sips (max ${gw[0].toFixed(1)}px @${gw[1]})`);
    const under = F.filter(f => f.hw && /st-sip/.test(f.cls)).some(f => { const tb = f.berries.find(x => /target/.test(x.cls)); return tb && tb.c[0] > f.hw[0] + 6 && tb.c[0] < f.hw[2] - 6 && tb.c[1] > f.hw[1] && tb.c[1] < f.hw[3]; });
    ok(!under, `${tag}: the berry it sips is beside the wings, not hidden under them`, todoOf("wing", st));
  }
  // 3) 果實不亂跳：地上的不動；拿著／托著的每格最多 10px
  let bj = 0, bjAt = ""; for (let i = 45; i < n; i++) { if (F[i].berries.length !== F[i - 1].berries.length) continue; F[i].berries.forEach((x, k) => { if (/eaten|sipped|melt/.test(x.cls)) return; const d = D(x.c, F[i - 1].berries[k].c), held = /held|carried/.test(x.cls), ex = held ? d - 10 : d - 1; if (ex > bj) { bj = ex; bjAt = `@${i} ${x.cls} ${F[i].cls}`; } }); }
  ok(bj <= 0, `${tag}: berries never jump (ground berries still, held ones ≤10px/frame; worst excess ${bj.toFixed(1)}px ${bjAt})`, todoOf("berry", st));
  if (st === 1) {   // 最後一口咬住之後（held）：頭抬起時果實跟著嘴，不留在地上（2026-10-06 第四輪）
    let far = 0, nHeld = 0; for (const f of F) { const hb = f.berries.find(x => /held/.test(x.cls) && !/eaten/.test(x.cls)); if (hb && f.mouth) { nHeld++; far = Math.max(far, D(f.mouth, hb.c) / hb.w); } }
    ok(nHeld > 5 && far <= .6, `${tag}: after the last bite the berry rises with the mouth (max distance / berry size ${far.toFixed(2)}, ${nHeld} frames)`);
  }
  if (st === 1) {
    const v = F.filter(f => f.neck != null).map(f => f.neck), dv = Math.max(...v), i0 = F.findIndex(f => f.neck === dv);
    if (process.env.PM_SEQ) for (let i = i0 - 6; i <= i0 + 4; i++) console.log("   neck", i, F[i].neck.toFixed(1), F[i].raw);
    ok(dv <= 25, `${tag}: the head never comes off the body (head centre to the front segment ≤25 units, head radius 23; max ${dv.toFixed(1)} @${i0} ${F[i0] ? F[i0].cls + "|" + F[i0].bcl : ""})`, todoOf("neck", st));
  }
  if (st === 6) {
    let out = 0, thr = 0, thAt = ""; for (let i = 1; i < n; i++) { const d = F[i].deform, b = F[i].boxr; out = Math.max(out, b[0] - d[0], d[2] - b[2], b[1] - d[1]); const t = Math.max(...d.map((q, k) => Math.abs(q - F[i - 1].deform[k]))); if (t > thr) { thr = t; thAt = `@${i} ${F[i].cls}`; } }
    ok(out <= 0 && thr <= 14, `${tag}: the tail stays in frame and moves smoothly (out ${out.toFixed(0)}px, bbox change ${thr.toFixed(0)}px/frame ≤14 ${thAt})`, todoOf("tail", st));
  }
  if (st === 5) {   // 吞下最後一口之前不閉眼享受
    let bad = 0; for (const f of F) { const tb = f.berries.find(x => /target/.test(x.cls) && !/eaten/.test(x.cls)); if (tb && f.happy && D(f.mouth, tb.c) > tb.w / 2) bad++; }
    ok(bad === 0, `${tag}: no happy closed eyes while the berry is still away from the mouth (${bad} frames)`, todoOf("happy", st));
  }
  if (st === 0) {   // 圓底滾動：蛋殼最低點一直貼著地面（上下變動 ≤2px）
    const bs = F.map(f => f.eggBottom).filter(v => v != null), rng = Math.max(...bs) - Math.min(...bs);
    if (process.env.PM_SEQ) { const mx = Math.max(...bs), mn = Math.min(...bs); console.log(tag, "egg bottom max", mx.toFixed(1), F.filter(f => f.eggBottom === mx).map(f => f.cls).slice(0, 3), "min", mn.toFixed(1), F.filter(f => f.eggBottom === mn).map(f => f.cls).slice(0, 3), "rest", bs[0].toFixed(1)); }
    ok(rng <= 2, `${tag}: the egg rolls on its round bottom — its lowest point stays on the ground (range ${rng.toFixed(1)}px)`);
  }
  if (st === 0) {   // 果實跟光點不能同時「完整」存在
    // 每顆跟「它自己開始融化那一格」的大小比（以前拿這一格的第一顆比，融化的剛好是第一顆時＝自己跟自己比）
    let both = 0; const w0 = {}; for (const f of F) for (const x of f.berries) if (/melt/.test(x.cls)) { const key = Math.round(x.c[0] / 4); if (w0[key] == null) w0[key] = x.w; if (f.sparks >= 3 && x.op > .8 && x.w >= w0[key] * .9) both++; }
    ok(both === 0, `${tag}: the berry shrinks as the sparks leave it (frames with a full berry and ≥3 sparks: ${both})`, todoOf("egg", st));
  }
  const lim = st === 1 ? (/ C$/.test(tag) ? 18 : 27) : st === 4 ? 23 : st === 5 ? 25 : st === 3 || st === 6 ? 17.9 : 16;   // 幼蟲爬得像真的毛毛蟲（慢）：A、B 刻意讓果實落在兩邊（測掉頭）放寬；C＝遊戲真的落點（頭的前方）   // 幼龍：撿起來、舉到嘴邊、咬兩口、吞完才放手（步驟本來就多）；虎：每顆都趴下去吃再站起來（2026-10-06 人面獅身）   // 幼蟲：左右兩邊都有果實時要掉頭兩次（頭不動、身體繞過去＝每次多爬 80px）   // 含判定結束的 0.7 秒；狐、虎要走去左右兩端（A、C 組）；虎刻意慢、有重量（ChatGPT 看錄影的建議）
  ok(sec <= lim, `${tag}: one feeding (3 berries, walk home, celebrate) takes ≤${lim} s (${sec.toFixed(1)} s)`, todoOf("time", st));
  const spill = Math.max(...F.map(f => f.spill || 0)), si = F.findIndex(f => (f.spill || 0) === spill);
  ok(spill <= 0, `${tag}: nothing is drawn outside the canvas (iOS WebKit clips there; worst ${spill.toFixed(1)}px${spill > 0 ? ` @${si} ${F[si].spillWhat} ${F[si].cls}|${F[si].bcl}` : ""})`);
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
