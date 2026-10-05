// 山林夥伴 2.5D 舞台：天空 → 遠山 → 中景（各階段棲地）→ 天氣/季節粒子 → 角色 → 前景，分層做視差。
// 時段（晨/午/昏/夜）、季節、天氣跟真實世界同步；手指拖、陀螺儀（已授權才有）會讓各層以不同深度位移。
// 只負責「畫面」：角色 SVG 仍由 PET_ART 提供（地圖標記、分享圖卡、動態島都讀那邊，不受影響）。
// 系統設定「減少動態效果」時：不視差、不飄粒子、不走動（畫面照樣有層次，只是靜止）。
window.PetStage = (function () {
  const reduce = () => { try { return matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } };

  // ── 真實世界狀態 ──
  function tod(d) {
    const h = (d || new Date()).getHours();
    return h >= 5 && h < 8 ? "dawn" : h >= 8 && h < 16 ? "day" : h >= 16 && h < 19 ? "dusk" : "night";
  }
  function season(d) {
    const m = (d || new Date()).getMonth() + 1;
    return m >= 3 && m <= 5 ? "spring" : m >= 6 && m <= 8 ? "summer" : m >= 9 && m <= 11 ? "autumn" : "winter";
  }
  // WMO 天氣代碼 → 舞台天氣（只分三種畫得出差別的）
  function wxOf(code) {
    if (code == null) return "";
    if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "rain";
    if (code >= 71 && code <= 77 || code === 85 || code === 86) return "snow";
    if (code === 3 || code === 45 || code === 48) return "cloud";
    return "";
  }

  // ── 場景 SVG（viewBox 400×300，貼底、寬度鋪滿） ──
  const VB = `viewBox="0 0 400 300" preserveAspectRatio="xMidYMax slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"`;
  // 場景插畫在 stage-art.js（ArtKit 畫的：受光山稜、霧、樹、裝飾）；這裡只組層、做視差與動作
  const STAGES = 7;
  const clamp = i => Math.max(0, Math.min(STAGES - 1, i | 0));

  // 天空小物：太陽／月亮／星星
  function sky(t) {
    if (t === "night") {
      let st = "";
      for (let k = 0; k < 14; k++) st += `<circle class="ps-star" cx="${(k * 97 + 23) % 400}" cy="${(k * 53 + 11) % 150}" r="${k % 3 ? 1.3 : 2}" style="animation-delay:${(k % 7) * .45}s"/>`;
      return `<svg class="ps-svg" ${VB}>${st}<circle cx="318" cy="56" r="17" fill="#f6efcf"/><circle cx="326" cy="50" r="15" class="ps-moonbite"/></svg>`;
    }
    const sun = t === "day" ? `<circle cx="320" cy="58" r="40" fill="#fff6c8" opacity=".25"/><circle cx="320" cy="58" r="20" fill="#fff3b8"/>`
      : `<circle cx="${t === "dawn" ? 90 : 310}" cy="176" r="56" fill="#ffd08a" opacity=".22"/><circle cx="${t === "dawn" ? 90 : 310}" cy="176" r="26" fill="#ffc77a"/>`;
    return `<svg class="ps-svg" ${VB}>${sun}</svg>`;
  }

  // 粒子：季節（春花瓣／夏螢火蟲或花粉／秋落葉／冬高山才下雪）＋天氣（雨／雪）
  function particles(stage, t, se, wx) {
    let kind = wx === "rain" ? "rain" : wx === "snow" ? "snow"
      : se === "spring" ? "petal" : se === "autumn" ? "leaf" : se === "winter" ? (stage >= 5 ? "snow" : "mote")
      : (t === "night" || t === "dusk") ? "fly" : "mote";
    if (t === "night" && kind === "mote") kind = "fly";
    const n = kind === "rain" ? 16 : kind === "fly" ? 7 : 9;
    let h = "";
    for (let k = 0; k < n; k++) {
      const left = (k * 37 + 7) % 100, delay = ((k * 0.77) % 5).toFixed(2), dur = (kind === "rain" ? 0.9 + (k % 4) * .12 : 6 + (k % 5) * 1.3).toFixed(2);
      h += `<i class="ps-p ps-${kind === "leaf" ? "maple" : kind}" style="left:${left}%;top:${kind === "fly" || kind === "mote" ? 20 + (k * 29) % 60 : -8}%;animation-delay:-${delay}s;animation-duration:${dur}s"></i>`;
    }
    return h;
  }

  // 舞台 HTML：actorHtml 是角色那一層的內容（對話泡＋角色＋影子），由 pet.js 組好傳進來
  function html(stage, actorHtml, o) {
    o = Object.assign({}, o, window.__ps || {});   // window.__ps＝測試／除錯面板強制指定時段、季節、天氣
    const i = clamp(stage), t = o.tod || tod(), se = o.season || season(), wx = o.wx || "";
    const sc = StageArt.scene(i, t, se, o.decor);
    return `<div class="ps-box${o.bg ? " ps-bg" : ""}" data-stage="${i}"${o.evo ? ` data-evo="${o.evo}"` : ""}${(o.decor || []).length ? ` data-decor="${o.decor.join(" ")}"` : ""} data-tod="${t}" data-season="${se}"${wx ? ` data-wx="${wx}"` : ""}>
      <div class="ps-l ps-sky" style="--d:.1">${sky(t)}${wx === "cloud" || wx === "rain" ? `<svg class="ps-svg ps-drift" ${VB}>${StageArt.skyClouds(t)}</svg>` : ""}</div>
      <div class="ps-l ps-far" style="--d:.28"><svg class="ps-svg" ${VB}>${sc.far}</svg></div>
      <div class="ps-l ps-mid" style="--d:.55"><svg class="ps-svg" ${VB}>${sc.mid}</svg></div>
      <div class="ps-l ps-fx" aria-hidden="true">${particles(i, t, se, wx)}</div>
      <div class="ps-actor" style="--d:.72">${actorHtml}</div>
      <div class="ps-l ps-front" style="--d:1.35"><svg class="ps-svg" ${VB}>${sc.front}</svg></div>
    </div>`;
  }

  // ── 視差：手指拖（任何裝置）＋陀螺儀（已有權限時，例如開過指北針；不在這裡主動跳權限框） ──
  let cur = { x: 0, y: 0 }, tgt = { x: 0, y: 0 }, raf = 0, box = null, base = null, io = null, visible = false;
  const lerp = (a, b, k) => a + (b - a) * k;
  function frame() {
    raf = 0;
    if (!box || !box.isConnected) return;
    cur.x = lerp(cur.x, tgt.x, .12); cur.y = lerp(cur.y, tgt.y, .12);
    box.style.setProperty("--px", cur.x.toFixed(3)); box.style.setProperty("--py", cur.y.toFixed(3));
    if (Math.abs(cur.x - tgt.x) > .002 || Math.abs(cur.y - tgt.y) > .002) raf = requestAnimationFrame(frame);
  }
  const kick = () => { if (!raf && visible) raf = requestAnimationFrame(frame); };
  function aim(x, y) { tgt.x = Math.max(-1, Math.min(1, x)); tgt.y = Math.max(-1, Math.min(1, y)); kick(); }
  function onMove(e) {
    if (!box) return;
    const r = box.getBoundingClientRect();
    aim(((e.clientX - r.left) / r.width - .5) * 2, ((e.clientY - r.top) / r.height - .5) * 2);
    look(e.clientX, e.clientY);
  }
  // 眼睛看向手指（以角色中心為準，-1～1）
  function look(cx, cy) {
    const c = box && box.querySelector("#petEmoji .pet-critter"); if (!c) return;
    const r = c.getBoundingClientRect();
    const ex = Math.max(-1, Math.min(1, (cx - (r.left + r.width / 2)) / (r.width * .8)));
    const ey = Math.max(-1, Math.min(1, (cy - (r.top + r.height * .45)) / (r.height * .8)));
    box.style.setProperty("--ex", ex.toFixed(2)); box.style.setProperty("--ey", ey.toFixed(2));
  }
  const onLeave = () => { aim(0, 0); if (box) { box.style.setProperty("--ex", "0"); box.style.setProperty("--ey", "0"); } };
  function onOrient(e) {
    if (!visible || e.gamma == null || e.beta == null) return;
    if (!base) base = { g: e.gamma, b: e.beta };
    aim((e.gamma - base.g) / 18, (e.beta - base.b) / 24);
  }
  let mood = "content";
  function bind(el, m) {
    unbind();
    mood = m || "content";
    if (!el || reduce()) return;
    box = el; base = null; cur = { x: 0, y: 0 }; tgt = { x: 0, y: 0 };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    el.addEventListener("pointerup", onLeave);
    window.addEventListener("deviceorientation", onOrient);
    if ("IntersectionObserver" in window) { io = new IntersectionObserver(es => { visible = es.some(x => x.isIntersecting); if (!visible) base = null; }); io.observe(el); }
    else visible = true;
    schedule(mood);
  }
  function unbind() {
    if (box) { box.removeEventListener("pointermove", onMove); box.removeEventListener("pointerleave", onLeave); box.removeEventListener("pointerup", onLeave); }
    window.removeEventListener("deviceorientation", onOrient);
    if (io) { io.disconnect(); io = null; }
    if (raf) cancelAnimationFrame(raf);
    clearTimeout(beat); beat = 0; busy = false;
    raf = 0; box = null; visible = false;
  }

  // ── 行為狀態機：待機 → 隨機挑一個動作 → 回待機。角色固定站在舞台中間（走動試過，看起來不自然，2026-10-04 拿掉）。
  // 心情決定機率：睏的多半不動、開心的會跳、想念的東張西望。
  // 2026-10-04：多了連眨兩下、打哈欠（睏）、嘆氣（想念）；看的時候頭跟著轉（CSS 讀 --ex）
  const WEIGHTS = {
    sleepy: { idle: 5, yawn: 3, stretch: 1, look: 1 },
    happy: { hop: 4, look: 2, stretch: 1, blink2: 1, idle: 1 },
    content: { look: 3, hop: 1, stretch: 2, blink2: 1, idle: 2 },
    longing: { look: 3, sigh: 2, blink2: 1, idle: 2 },
  };
  let beat = 0, busy = false;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function pick(w) {
    let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
    for (const k in w) if ((r -= w[k]) < 0) return k;
    return "idle";
  }
  function emEl() { return box && box.querySelector("#petEmoji"); }
  function flash(cls, ms) {   // 加一個動作 class，播完拿掉
    const em = emEl(); if (!em) return sleep(0);
    em.classList.remove(cls); void em.offsetWidth; em.classList.add(cls);
    return sleep(ms).then(() => em.classList.remove(cls));
  }
  async function act(kind) {
    if (!box) return;
    busy = true;
    try {
      if (kind === "look") {
        for (const d of [-1, 1, 0]) { if (!box) break; box.style.setProperty("--ex", d); await sleep(d ? 900 : 200); }
      } else if (kind === "hop") await flash("pb-hop", 1100);
      else if (kind === "stretch") await flash("pb-stretch", 1400);
      else if (kind === "yawn") await flash("pb-yawn", 1400);
      else if (kind === "sigh") await flash("pb-sigh", 1600);
      else if (kind === "blink2") await flash("pb-blink2", 500);
      else await sleep(400);
    } finally { busy = false; }
  }
  function schedule(m) {
    clearTimeout(beat);
    if (reduce() || window.__psNoIdle) return;   // __psNoIdle：測試要穩定時關掉隨機動作
    if (box) box.style.setProperty("--bk", (3.2 + Math.random() * 3).toFixed(2) + "s");   // 眨眼間隔每輪換一次（不要像節拍器）
    beat = setTimeout(async () => {
      if (window.__psNoIdle) return;   // 已經排好的那一次也要停（以前只在排程時檢查，測試關掉後還會再跳一次）
      if (box && box.isConnected && visible && !document.hidden && !busy) await act(pick(WEIGHTS[m] || WEIGHTS.content));
      if (box && box.isConnected) schedule(m);
    }, 3500 + Math.random() * 4500);
  }

  // ── 互動：點頭＝摸摸頭、點身體＝搔癢、長按＝抱抱（pet.js 決定給什麼回饋，這裡只播動作） ──
  function zoneOf(clientY) {
    const c = box && box.querySelector("#petEmoji .pet-critter"); if (!c) return "pat";
    const r = c.getBoundingClientRect();
    const line = typeof PET_ART !== "undefined" && PET_ART.headLine ? PET_ART.headLine(+box.dataset.stage || 0) : .5;   // 每階段的頭高度不同（幼蟲的頭在下半部）
    return clientY < r.top + r.height * line ? "pat" : "tickle";
  }
  function react(kind) {
    if (reduce()) return sleep(0);
    return flash(kind === "hug" ? "pb-hug" : kind === "tickle" ? "pb-tickle" : "pb-pat", kind === "hug" ? 1000 : 800);
  }

  // ── 餵食（2026-10-04 改）：一次扣三顆，就掉三顆——隨機落在腳邊（彼此分開、各自大小／角度／落下高度不同），
  // 夥伴一顆一顆轉頭看、咬一口（果實被吸到嘴邊縮小），餵食鈕上的果實數跟著一顆一顆減；三顆吃完再用自己那一種方式慶祝（跳、撲、挺胸…）。
  // 蛋不會吃也不會走：果實掉在蛋前面，化成光點飛進裂縫。減少動態效果或舞台不在畫面上時，pet.js 直接結算。回傳播完的 promise
  function dropSpots(n, egg) {   // egg：蛋不會走路，果實掉在蛋的前方 ±40 以內（在蛋前面、不會被擋住）
    if (Array.isArray(window.__psSpots) && window.__psSpots.length >= n) return window.__psSpots.slice(0, n);   // 測試／除錯：指定落點（px，相對舞台中間）
    const out = [], R = egg ? 40 : 84, gap = egg ? 26 : 34;
    for (let tries = 0; out.length < n && tries < 80; tries++) {
      const x = Math.round((Math.random() * 2 - 1) * R);
      if ((!egg && Math.abs(x) < 18) || out.some(o => Math.abs(o - x) < gap)) continue;   // 不要剛好在正中間（被身體擋住）、彼此不要疊在一起
      out.push(x);
    }
    while (out.length < n) out.push((egg ? [-32, 30, -2] : [-60, 58, -28])[out.length]);   // 保底
    return out;
  }
  // 神龍：果實落在雲面上（雲的頂＋陷進去 3），只挑尾巴搆得到、彼此分開的位置。回傳 [{x, by}]（px，相對舞台中間／舞台底）
  function cloudSpots(n) {
    const pr = box.querySelector("#petEmoji .pet-prop"), actor = box.querySelector(".ps-actor");
    if (!pr || typeof PET_ART === "undefined" || !PET_ART.cloudTop6) return null;
    const q = pr.getBoundingClientRect(), a = actor.getBoundingClientRect(), k = q.width / 200, out = [];
    const forced = Array.isArray(window.__psSpots) && window.__psSpots.length >= n ? window.__psSpots.slice(0, n) : null;   // 測試：指定雲上的落點（圖上的 x）
    for (let tries = 0; out.length < n && tries < 120; tries++) {
      const lx = forced ? forced[out.length] : 84 + Math.random() * 112, top = PET_ART.cloudTop6(lx); if (top == null) continue;   // 尾巴那一側（頭那邊要繞過整個身體，太勉強）
      const x = Math.round(q.left + lx * k - (a.left + a.width / 2));
      if (!forced && (out.some(o => Math.abs(o.x - x) < 26) || PetWalk.tailReach(lx, top + 3 - 15) > 3)) continue;
      out.push({ x, by: Math.round(a.bottom - (q.top + (top + 3) * k)) });
    }
    return out.length === n ? out : null;
  }
  // ── 蝶：口器伸向果實（量果實在口器座標裡的位置，把伸直的口器改成一條彎過去的線）──
  const PROB0 = "M100 95 Q101 118 100 142 q-1 4 -3 3";
  function aimProboscis(b) {
    const em = emEl(), ext = em && em.querySelector(".pr-ext"); if (!ext || !ext.getScreenCTM) return;
    const m = ext.getScreenCTM(); if (!m) return;
    const r = b.getBoundingClientRect(), q = new DOMPoint(r.left + r.width / 2, r.top + r.height * .5).matrixTransform(m.inverse());
    const tx = q.x, ty = q.y;   // 從嘴往下先垂一點、再彎向果實（像真的蝴蝶口器展開）
    ext.setAttribute("d", `M100 95 Q${(100 + (tx - 100) * .12).toFixed(1)} ${(95 + (ty - 95) * .9).toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)}`);
  }
  function resetProboscis() { const em = emEl(), ext = em && em.querySelector(".pr-ext"); if (ext) ext.setAttribute("d", PROB0); }
  // ── 蛋：往果實那邊傾、裂縫亮起來、果實化成 5～7 顆光點沿弧線飛進最近的那道裂縫、鼓起來晃兩下 ──
  async function absorb(b, side) {
    const em = emEl(); if (!em) return;
    cls(true, "st-tilt-" + side); await sleep(380);
    cls(true, "st-glow"); await sleep(200);
    const glows = [...em.querySelectorAll(".pr-glow")].map(g => g.getBoundingClientRect()).filter(q => q.width > 0);
    const br = b.getBoundingClientRect(), bx = br.left + br.width / 2, by = br.top + br.height / 2;
    const tg = glows.sort((p, q) => Math.abs(p.left + p.width / 2 - bx) - Math.abs(q.left + q.width / 2 - bx))[0];
    const actor = box.querySelector(".ps-actor"), ar = actor.getBoundingClientRect();
    b.classList.add("melt");
    const n = 5 + Math.floor(Math.random() * 3), sparks = [];
    for (let k = 0; k < n; k++) {
      const s = document.createElement("i"); s.className = "ps-spark";
      const sx = bx + (Math.random() - .5) * br.width * .6, sy = by + (Math.random() - .5) * br.height * .5;
      const ex = tg ? tg.left + tg.width * (.3 + .4 * Math.random()) : bx, ey = tg ? tg.top + tg.height * (.3 + .4 * Math.random()) : by - 40;
      const dx = ex - sx, dy = ey - sy, lift = 18 + Math.random() * 16;
      s.style.left = (sx - ar.left) + "px"; s.style.top = (sy - ar.top) + "px";
      actor.appendChild(s);
      const a = s.animate([
        { transform: "translate(0, 0) scale(.6)", opacity: 0 },
        { transform: `translate(${(dx * .2).toFixed(1)}px, ${(dy * .2 - lift * .6).toFixed(1)}px) scale(1.1)`, opacity: 1, offset: .25 },
        { transform: `translate(${(dx * .6).toFixed(1)}px, ${(dy * .6 - lift).toFixed(1)}px) scale(.9)`, opacity: 1, offset: .65 },
        { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(.35)`, opacity: .2 },
      ], { duration: 560 + k * 30, delay: k * 55, easing: "ease-in", fill: "both" });
      s.__end = [ex, ey]; sparks.push([s, a]);
    }
    await Promise.all(sparks.map(([, a]) => a.finished.catch(() => {})));
    sparks.forEach(([s]) => s.remove());
    cls(false, "st-tilt-" + side);
    await flash("pb-swell", 720);
    cls(false, "st-glow"); await sleep(160);
  }
  // 一顆一顆吃：看（頭＋眼轉過去）→ 俯身 → 張嘴 → 咬（果實飛進嘴裡）→ 抬頭 → 嚼三下（臉頰鼓起）→ 吞；
  // 三顆吃完舔舔嘴、再慶祝。蝶是落在果實旁、口器彎過去吸；蛋是往果實傾、裂縫亮起來把光吸進去。
  const cls = (on, ...c) => { const em = emEl(); if (em) c.forEach(k => em.classList.toggle(k, on)); };
  // ── 果實歸誰（2026-10-05 第二輪）：地上（不動）／手掌／尾尖／嘴，同一時間只歸一個。歸了誰，每一格就把果實的錨點對齊到那個接觸點（PetWalk.cpt），
  // 部位怎麼動（爪子的 CSS 過渡、尾巴的變形、龍上下飄）果實就怎麼跟——以前用「量外框估爪尖」再讓果實用自己的過渡追，會落後、會跳。
  // 換手時從現在的位置接過來，殘差 off0 在 ms 內收到 0（接觸點本來就碰到果實了才換手，所以只差幾 px，不是果實自己飛過去）
  const owned = new Set(); let ownRaf = 0;
  function follow(b, name, o) {
    o = o || {}; const pt = typeof PetWalk !== "undefined" ? PetWalk.cpt(box, name) : null; if (!pt) return;
    const r = b.getBoundingClientRect(), ax = o.ax == null ? .5 : o.ax, ay = o.ay == null ? .5 : o.ay;
    if (b.__tx == null) { b.__bx0 = b.__rx != null ? b.__rx : parseFloat(b.style.getPropertyValue("--bx")) || 0; b.__tx = 0; b.__ty = 0; }
    b.__own = { name, ax, ay, off0: [r.left + r.width * ax - pt[0], r.top + r.height * ay - pt[1]], t0: performance.now(), ms: o.ms || 140 };
    owned.add(b); ownTick(true);
  }
  function release(b) { owned.delete(b); if (b) b.__own = null; }
  function ownTick(once) {
    if (!once) ownRaf = 0;
    if (!box) { owned.clear(); return; }
    owned.forEach(b => {
      if (!b.isConnected || !b.__own) { owned.delete(b); return; }
      const o = b.__own, pt = PetWalk.cpt(box, o.name); if (!pt) return;
      const k = Math.min(1, (performance.now() - o.t0) / o.ms), e = 1 - (1 - k) * (1 - k);
      const r = b.getBoundingClientRect();
      b.__tx += pt[0] + o.off0[0] * (1 - e) - (r.left + r.width * o.ax); b.__ty += pt[1] + o.off0[1] * (1 - e) - (r.top + r.height * o.ay);
      b.style.translate = `${(b.__bx0 + b.__tx).toFixed(2)}px ${b.__ty.toFixed(2)}px`;
    });
    if (owned.size && !ownRaf) ownRaf = requestAnimationFrame(() => ownTick());
  }
  function toMouth(b, egg) {   // 最後一口：果實要縮進去的點＝嘴的接觸點（蛋就是蛋的中間）
    const em = emEl(); if (!em) return;
    release(b);
    let pt = !egg && typeof PetWalk !== "undefined" && box ? PetWalk.cpt(box, "mouth") : null;
    if (!pt) { const t = (egg ? em.querySelector(".pc-bob") : em.querySelector(".pr-mouth") || em.querySelector(".pr-head")) || em, a = t.getBoundingClientRect(); pt = [a.left + a.width / 2, a.top + a.height / 2]; }
    const r = b.getBoundingClientRect();
    const ox = parseFloat(b.style.getPropertyValue("--tx")) || 0, oy = parseFloat(b.style.getPropertyValue("--ty")) || 0;   // 已經被移動過就接著算
    b.style.setProperty("--tx", `${Math.round(ox + pt[0] - (r.left + r.width / 2))}px`);
    b.style.setProperty("--ty", `${Math.round(oy + pt[1] - (r.top + r.height / 2))}px`);
  }
  // 低頭（.st-lean 把頭移 --lx/--ld）要移多少，嘴才會剛好碰到果實：套上姿勢量、算差、再量一次修正（同一格量完拿掉，不會閃）。
  // 差太多（頭伸不到）就先小碎步挪過去再量——**果實絕不自己飛過去**，沒碰到不准咬
  async function reach(b, stg) {
    const em = emEl(); if (!em) return;
    const c = em.querySelector(".pet-critter"), u = 200 / ((c && c.clientWidth) || 168);
    const gap = (lx, ld) => { box.style.setProperty("--lx", lx + "px"); box.style.setProperty("--ld", ld + "px"); void em.offsetWidth;
      const m = PetWalk.cpt(box, "mouth"), r = b.getBoundingClientRect();
      return [(r.left + r.width / 2 - m[0]) * u, (r.top + r.height * BITE_Y - m[1]) * u]; };   // 嘴碰果實的上半部
    const LIM = { 1: [-14, 40], 3: [-8, 40], 4: [-8, 40], 6: [-14, 64] }[stg] || [-10, 40];
    let lx = 0, ld = 0;
    box.classList.add("no-tr"); em.classList.add("st-lean");
    for (let it = 0; it < 3; it++) {
      const [gx, gy] = gap(lx, ld); if (Math.abs(gx) < 1.5 && Math.abs(gy) < 1.5) break;
      lx = Math.max(-12, Math.min(12, lx + gx)); ld = Math.max(LIM[0], Math.min(LIM[1], ld + gy));
    }
    const [rx] = gap(lx, ld);
    em.classList.remove("st-lean"); void em.offsetWidth; box.classList.remove("no-tr"); void em.offsetWidth;
    box.style.setProperty("--lx", Math.round(lx) + "px"); box.style.setProperty("--ld", Math.round(ld) + "px");
    if (Math.abs(rx) > 4 && typeof PetWalk !== "undefined") {   // 頭往旁邊伸不到：小碎步挪過去
      await PetWalk.goTo(box, (parseFloat(box.style.getPropertyValue("--wx")) || 0) + rx / u, { keepFace: true });
    }
  }
  const BITE_Y = .32;   // 咬的位置：果實由上往下 32%（咬住上緣、一部分留在嘴外）
  let feeding = false;
  async function feed(berrySvg) {
    if (!box || reduce() || !visible || feeding) return;   // 正在吃就不再開一輪（餵食鈕本來就會鎖住＋8 小時冷卻；測試面板連按才會進來）
    clearTimeout(beat); busy = true; feeding = true; box.classList.add("feeding");
    const actor = box.querySelector(".ps-actor"), stg = +box.dataset.stage, egg = stg === 0, fly = stg === 2;
    const bal = document.querySelector("#petFeed .feed-bal");
    let left = bal ? +bal.textContent : NaN;
    const berries = []; let aborted = false;
    try {
      const onCloud = stg === 6 && typeof PetWalk !== "undefined" ? cloudSpots(3) : null;   // 神龍：果實落在雲上（跟著雲走）
      (onCloud ? onCloud.map(o => o.x) : dropSpots(3, egg)).forEach((x, k) => {
        const b = document.createElement("span");
        b.className = "ps-berry";
        b.innerHTML = berrySvg || "";
        const size = 26 + Math.round(Math.random() * 7), by = onCloud ? onCloud[k].by : egg ? 3 + Math.round(Math.random() * 5) : 10 + Math.round(Math.random() * 12);
        b.style.cssText = `--bx:${x};--by:${by}px;--bs:${size}px;--br:${Math.round((Math.random() * 2 - 1) * 22)}deg;--bh:${-(200 + Math.round(Math.random() * 70))}px;animation-delay:${k * 170}ms;z-index:${by < 16 ? 4 : 3}`;
        actor.appendChild(b); berries.push({ b, x });
      });
      if (onCloud) { const c0 = parseFloat(box.style.getPropertyValue("--wx")) || 0; box.__cloud = c0; box.__riders = berries.map(o => ({ el: o.b, bx: o.x, c0 })); berries.forEach(o => { o.b.__rx = o.x; }); }
      box.style.setProperty("--ex", "0"); box.style.setProperty("--ey", "1");   // 低頭看掉下來的果實
      await sleep(340 + 650);   // 等最後一顆落地（以前多等 0.12 秒；再早出發，第三顆還在彈就開始走）
      const W = typeof PetWalk !== "undefined";
      const at = () => parseFloat(box.style.getPropertyValue("--wx")) || 0;
      // 吃的順序：從離現在位置比較近的那一端開始，一路掃到另一端——以前每次挑最近的會左右來回（轉身最難看，能少就少：最多轉兩次）
      const todo = berries.slice().sort((a, b) => a.x - b.x);
      if (Math.abs(todo[todo.length - 1].x - at()) < Math.abs(todo[0].x - at())) todo.reverse();
      // 幼蟲掉頭很花時間（頭不動、身體繞過去，等於多走 80px）：從頭朝的那一端開始吃，少掉一次頭（2026-10-05 第二輪）
      if (stg === 1 && (todo[0].x > todo[todo.length - 1].x) !== !box.classList.contains("lv-l")) todo.reverse();   // 頭朝右＝從最右邊開始
      while (todo.length) {
        if (!box || !visible || document.hidden) { aborted = true; break; }   // 滑走或切到背景：直接結算（pet.js 的 done 會更新數字），角色回到坐姿
        const { b, x } = todo.shift(), later = todo.length < 2;   // 第二、三顆：嚼兩下、停頓短一點（整段不要拖太久）
        // 正在吃的這顆亮一圈、其他的稍微暗下來在旁邊等——一眼就知道牠要吃哪一顆
        b.classList.add("target"); todo.forEach(o => o.b.classList.add("wait")); b.classList.remove("wait");
        box.style.setProperty("--ex", String(Math.sign(x - at()) * Math.min(1, Math.abs(x - at()) / 60)));   // 頭和眼睛轉過去看這一顆（轉身時一起轉，不另外停）
        await sleep(W ? 60 : 240);
        if (W && !egg && !onCloud) { await PetWalk.goEat(box, b, x); box.style.setProperty("--ex", "0"); box.style.setProperty("--ey", "1"); }   // 走過去：停在嘴剛好在果實上方
        // 低頭要低多少：量嘴到果實的高度差（換成 SVG 單位），夠不到的最後一點由果實「跳」進嘴裡
        let bowTo = null;
        if (box.classList.contains("standing")) {   // 站著（狐、虎）：找「身體前傾多少」嘴才碰到果實（脖子先維持自然角度，不夠才再往下）
          // 站位已經在 goEat 一次算好、走過去了（只走一次）；這裡只重算「趴多低」（走過去時前後深度變了一點），不再挪腳
          const sol = PetWalk.solveBow(box, b, stg, BITE_Y), pt = sol.pt, nk = sol.nk;
          bowTo = [pt, nk];
        } else if (!egg && !fly && stg !== 5 && !onCloud) await reach(b, stg);
        if (egg) await absorb(b, x >= 0 ? "r" : "l");   // 蛋：不走路，原地把果實化成光吸進裂縫
        else if (onCloud) {   // 神龍：尾巴繞過去托住果實 → 送到嘴前 → 張嘴咬 → 嚼的時候尾巴放回去
          await PetWalk.tailTo(box, b, 600);
          b.classList.add("carried"); follow(b, "tail", { ay: .62, ms: 120 }); await PetWalk.tailTo(box, "mouth", 760);   // 托住之後果實歸尾尖
          cls(true, "st-open"); await sleep(170);
          toMouth(b, false); b.classList.add("eaten"); cls(false, "st-open"); await flash("pb-snap", 240);
          const relax = PetWalk.tailTo(box, null, 600);
          cls(later, "chew2"); await flash("pb-chew", later ? 600 : 900); cls(false, "chew2"); await relax;
          await flash("pb-gulp", 340);
        }
        else if (fly) {   // 蝶：落在果實旁（腳伸出來、翅膀半收慢拍）→ 口器彎過去吸 → 果實原地縮小淡出 → 收口器、起飛
          cls(true, "st-land"); await sleep(340);
          aimProboscis(b); cls(true, "st-sip"); await sleep(240);
          b.classList.add("sipped"); await flash("pb-sip", later ? 820 : 1000);
          cls(false, "st-sip"); await sleep(200); resetProboscis();
          cls(false, "st-land");
        } else {
          if (stg === 5) {   // 幼龍：用前爪撿起來再送到嘴邊（短腿彎不下去，撿起來吃最自然）
            const side = x - at() >= 0 ? "r" : "l";
            cls(true, "st-crouch", "st-reach-" + side); await sleep(380);       // 蹲下、那隻爪子伸下去
            b.classList.add("held"); follow(b, "palm-" + side, { ay: .38, ms: 140 }); await sleep(220);   // 抓住：從現在起果實歸手掌
            cls(false, "st-reach-" + side); cls(true, "st-lift-" + side); await sleep(420);   // 舉到嘴邊（果實每一格跟著手掌）
            // 咬兩口（2026-10-05）：第一口咬掉一角（剩 2/3）、手拿著嚼；第二口整顆吃掉、放下手再嚼、吞，最後拍拍肚子
            b.style.setProperty("--nx", side === "r" ? "28%" : "72%");          // 缺口在靠嘴的那一側
            cls(true, "st-open"); await sleep(170);
            cls(false, "st-open"); b.classList.add("bit1"); await flash("pb-snap", 240);
            cls(true, "chew2"); await flash("pb-chew", later ? 480 : 600); cls(false, "chew2");   // 手拿著果實嚼
            cls(true, "st-open"); await sleep(150);
            toMouth(b, false); b.classList.add("eaten");
            cls(false, "st-open", "st-lift-" + side, "st-crouch"); await flash("pb-snap", 240);
            cls(true, "chew2"); await flash("pb-chew", later ? 480 : 600); cls(false, "chew2"); await flash("pb-gulp", 340);
            await flash("pb-belly", 640);                                        // 拍拍肚子
            if (bal && isFinite(left)) { left = Math.max(0, left - 1); bal.textContent = left; bal.classList.remove("tick"); void bal.offsetWidth; bal.classList.add("tick"); }
            if (typeof ttBuzz === "function") ttBuzz(8);
            b.remove(); box.style.removeProperty("--ld"); box.style.removeProperty("--lx"); continue;
          }
          if (stg === 1) {   // 幼蟲：一小口一小口啃——每一口果實多一個缺口（缺口在嘴靠過來的那一側），第三口整顆吞下
            // 低頭：不是只有頭往下（那樣身體中間會拱成尖角），前面幾節一起彎下去（頭那一端彎最多、往後漸少）
            const ld = parseFloat(box.style.getPropertyValue("--ld")) || 0, lx = parseFloat(box.style.getPropertyValue("--lx")) || 0;
            { const hd = PetWalk.part(box, ".pr-head"); if (hd) hd.style.transform = "translate(0px, 0px)"; }   // 頭先由 JS 接手（不然加上 st-lean 那一格，CSS 會先把頭移到低頭的位置，身體還沒彎）
            cls(true, "st-lean"); await PetWalk.bend(box, ld, lx, 320);
            b.style.setProperty("--nx", box.classList.contains("lv-l") ? "38%" : "62%");   // 缺口在上面、偏嘴那一側
            for (let k = 1; k <= 1; k++) {   // 2026-10-05 第二輪：兩口（咬一口留缺口、第二口吃掉），以前三口——一次餵食 23～29 秒太長
              cls(true, "st-open"); await sleep(130); cls(false, "st-open");
              b.classList.add("bit" + k); await flash("pb-snap", 220);           // 咬下去：果實多一個缺口
              cls(true, "chew2"); await flash("pb-chew", 320); cls(false, "chew2");  // 快快啃兩下
            }
            cls(true, "st-open"); await sleep(130);
            toMouth(b, false); b.classList.add("eaten"); cls(false, "st-open"); await flash("pb-snap", 220);
            cls(false, "st-lean"); await PetWalk.bend(box, 0, 0, later ? 220 : 280);
            cls(true, "chew2"); await flash("pb-chew", 400); cls(false, "chew2"); await flash("pb-gulp", 300);
            if (bal && isFinite(left)) { left = Math.max(0, left - 1); bal.textContent = left; bal.classList.remove("tick"); void bal.offsetWidth; bal.classList.add("tick"); }
            if (typeof ttBuzz === "function") ttBuzz(8);
            b.remove(); box.style.removeProperty("--ld"); box.style.removeProperty("--lx"); continue;
          }
          cls(true, "st-lean"); if (bowTo) { await PetWalk.bow(box, bowTo[0], bowTo[1], stg === 4 ? 540 : 440); await sleep(90); } else await sleep(360);   // 俯身（肩膀先沉、脖子再伸；虎慢、先沉重心），碰到後停一下
          cls(true, "st-open"); await sleep(170);   // 張嘴
          toMouth(b, false); b.classList.add("eaten");               // 果實被咬進嘴裡
          cls(false, "st-open"); await flash("pb-snap", bowTo ? 200 : 240);   // 咬！
          cls(false, "st-lean"); if (bowTo) await PetWalk.bow(box, 0, 0, stg === 4 ? 580 : 480); else await sleep(later ? 200 : 280);   // 抬頭（脖子先帶起來、肩膀再回正）
          { const two = later || !!bowTo; cls(two, "chew2"); await flash("pb-chew", (stg === 1 ? 900 : stg === 4 ? 1050 : 900) * (two ? .67 : 1)); cls(false, "chew2"); }   // 嚼三下（後兩顆、以及狐虎每一顆都兩下：整段控制在 16 秒內）   // 嚼三下（後兩顆兩下；幼蟲快快啃、虎慢慢嚼）
          await flash("pb-gulp", bowTo ? 280 : 340);                 // 吞
        }
        if (bal && isFinite(left)) { left = Math.max(0, left - 1); bal.textContent = left; bal.classList.remove("tick"); void bal.offsetWidth; bal.classList.add("tick"); }
        if (typeof ttBuzz === "function") ttBuzz(8);
        b.remove();
        box.style.removeProperty("--ld"); box.style.removeProperty("--lx");
      }
      if (box) { box.style.setProperty("--ex", "0"); box.style.setProperty("--ey", "0"); }
      if (aborted || !box) return;
      if (!egg && !fly) await flash("pb-lick", 640);                  // 舔舔嘴
      if (onCloud && W && box) { box.__riders = null; await PetWalk.goTo(box, -40); }   // 神龍：吃飽在雲上游一小段（身體走頭走過的路、雲座晚一點跟上）
      if (W && box) await PetWalk.home(box);                          // 走回中間
      await flash("pb-hop", 1300);   // 各自的慶祝（style-features.css 依階段換動作）
    } finally { berries.forEach(o => { release(o.b); o.b.remove(); }); cls(false, "st-lean", "st-open", "st-sip", "st-land", "st-glow", "st-tilt-l", "st-tilt-r"); resetProboscis(); if (box) { box.__riders = null; if (box.__phi && typeof PetWalk !== "undefined") PetWalk.tailTo(box, null, 1); box.style.removeProperty("--ld"); box.style.removeProperty("--lx"); if (typeof PetWalk !== "undefined" && (reduce() || aborted)) { PetWalk.stop(box); box.classList.remove("standing", "face-r"); } } feeding = false; busy = false; if (box) { box.classList.remove("feeding"); schedule(mood); } }
  }

  // ── 天氣：用使用者所在位置（探索頁拿過的）或最後一趟走的步道；拿不到就不畫天氣，絕不在這裡要定位 ──
  let wxMemo = null;   // { at, wx }
  function wxPlace() {
    try { if (typeof myLoc !== "undefined" && myLoc && isFinite(myLoc.lat)) return myLoc; } catch (e) { /* */ }
    try {
      const recs = (typeof Store !== "undefined" ? Store.getRecords() : []).filter(r => r.trailId).sort((a, b) => (a.date < b.date ? 1 : -1));
      for (const r of recs) {
        const t = typeof TRAILS !== "undefined" ? TRAILS.find(x => x.id === r.trailId) : null;
        if (t && isFinite(t.lat) && isFinite(t.lon)) return { lat: t.lat, lon: t.lon };
      }
    } catch (e) { /* */ }
    return null;
  }
  async function weather() {
    if (wxMemo && Date.now() - wxMemo.at < 30 * 60e3) return wxMemo.wx;
    const p = wxPlace();
    if (!p || typeof Weather === "undefined" || !navigator.onLine) return "";
    try {
      const d = await Weather.get(p.lat, p.lon);
      wxMemo = { at: Date.now(), wx: wxOf(d && d.current && d.current.weather_code) };
      return wxMemo.wx;
    } catch (e) { return ""; }
  }
  const cachedWx = () => (wxMemo ? wxMemo.wx : "");

  // ── 除錯標記（測試面板「餵食除錯標記」／PetStage.debug(true)）：紅＝嘴、綠＝果實中心、藍＝腳掌著地點、黃＝接觸點（.cp-*）──
  let dbgOn = false, dbgRaf = 0;
  function debug(on) {
    dbgOn = on == null ? !dbgOn : !!on; cancelAnimationFrame(dbgRaf);
    document.querySelectorAll(".ps-dbg").forEach(e => e.remove());
    if (!dbgOn) return false;
    const lay = document.createElement("div"); lay.className = "ps-dbg"; lay.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999"; document.body.appendChild(lay);
    const dot = (x, y, c, r) => `<i style="position:fixed;left:${x - (r || 3)}px;top:${y - (r || 3)}px;width:${2 * (r || 3)}px;height:${2 * (r || 3)}px;border-radius:50%;background:${c};box-shadow:0 0 0 1px #000"></i>`;
    const tick = () => {
      if (!dbgOn) return;
      let h = "";
      const bx = document.querySelector(".ps-box"), em = bx && bx.querySelector("#petEmoji");
      if (em) {
        const P = sel => (typeof PetWalk !== "undefined" ? PetWalk.part(bx, sel) : em.querySelector(sel));
        const m = P(".pr-mouth"); if (m) { const r = m.getBoundingClientRect(); h += dot(r.left + r.width / 2, r.top + r.height / 2, "#f33", 4); }
        em.querySelectorAll(".cp").forEach(c => { const q = c.getBoundingClientRect(); if (q.width || q.height || c.getScreenCTM) { const M = c.getScreenCTM && c.getScreenCTM(); if (M) { const pt = new DOMPoint(+c.getAttribute("cx"), +c.getAttribute("cy")).matrixTransform(M); h += dot(pt.x, pt.y, "#ff0", 3); } } });
        if (bx.classList.contains("standing")) em.querySelectorAll(".pr-stand .pr-shin").forEach(sh => { const e = [...sh.querySelectorAll("ellipse")].find(x => !x.closest("clipPath") && !x.closest("defs")); if (!e) return; const pt = new DOMPoint(+e.getAttribute("cx"), +e.getAttribute("cy") + +e.getAttribute("ry")).matrixTransform(e.getScreenCTM()); h += dot(pt.x, pt.y, "#39f", 3); });
      }
      document.querySelectorAll(".ps-berry").forEach(b => { const r = b.getBoundingClientRect(); h += dot(r.left + r.width / 2, r.top + r.height / 2, "#3f6", 3); });
      lay.innerHTML = h; dbgRaf = requestAnimationFrame(tick);
    };
    tick(); return true;
  }

  // 心情變了但卡片沒重畫（pet.js 的 petCardUpdate）：待機動作的機率跟著換
  function setMood(m) { mood = m || "content"; if (box) schedule(mood); }
  return { debug, setMood, html, bind, unbind, tod, season, wxOf, weather, cachedWx, count: STAGES, zoneOf, react, feed, act };
})();
