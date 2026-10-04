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
    return `<div class="ps-box${o.bg ? " ps-bg" : ""}" data-stage="${i}"${(o.decor || []).length ? ` data-decor="${o.decor.join(" ")}"` : ""} data-tod="${t}" data-season="${se}"${wx ? ` data-wx="${wx}"` : ""}>
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
  // 蛋不會吃：晃一下把果實「吸」進去。減少動態效果或舞台不在畫面上時，pet.js 直接結算。回傳播完的 promise
  function dropSpots(n) {
    const out = [];
    for (let tries = 0; out.length < n && tries < 60; tries++) {
      const x = Math.round((Math.random() * 2 - 1) * 84);
      if (Math.abs(x) < 18 || out.some(o => Math.abs(o - x) < 34)) continue;   // 不要剛好在正中間（被身體擋住）、彼此不要疊在一起
      out.push(x);
    }
    while (out.length < n) out.push([-60, 58, -28][out.length]);   // 保底
    return out;
  }
  // 一顆一顆吃：看（頭＋眼轉過去）→ 俯身 → 張嘴 → 咬（果實飛進嘴裡）→ 抬頭 → 嚼三下（臉頰鼓起）→ 吞；
  // 三顆吃完舔舔嘴、再慶祝。蝶是飛低、口器伸直去吸；蛋是晃一下、裂縫亮起來把果實吸進去。
  const cls = (on, ...c) => { const em = emEl(); if (em) c.forEach(k => em.classList.toggle(k, on)); };
  function toMouth(b, egg) {   // 果實要飛去的點＝嘴（蛋就是蛋的中間）
    const em = emEl(); if (!em) return;
    const t = (egg ? em.querySelector(".pc-bob") : em.querySelector(".pr-mouth") || em.querySelector(".pr-head")) || em;
    const a = t.getBoundingClientRect(), r = b.getBoundingClientRect();
    b.style.setProperty("--tx", `${Math.round(a.left + a.width / 2 - (r.left + r.width / 2))}px`);
    b.style.setProperty("--ty", `${Math.round(a.top + a.height / 2 - (r.top + r.height / 2))}px`);
  }
  async function feed(berrySvg) {
    if (!box || reduce() || !visible) return;
    clearTimeout(beat); busy = true;
    const actor = box.querySelector(".ps-actor"), stg = +box.dataset.stage, egg = stg === 0, fly = stg === 2;
    const bal = document.querySelector("#petFeed .feed-bal");
    let left = bal ? +bal.textContent : NaN;
    const berries = [];
    try {
      dropSpots(3).forEach((x, k) => {
        const b = document.createElement("span");
        b.className = "ps-berry";
        b.innerHTML = berrySvg || "";
        const size = 26 + Math.round(Math.random() * 7), by = 10 + Math.round(Math.random() * 12);
        b.style.cssText = `--bx:${x};--by:${by}px;--bs:${size}px;--br:${Math.round((Math.random() * 2 - 1) * 22)}deg;--bh:${-(200 + Math.round(Math.random() * 70))}px;animation-delay:${k * 170}ms;z-index:${by < 16 ? 4 : 3}`;
        actor.appendChild(b); berries.push({ b, x });
      });
      box.style.setProperty("--ex", "0"); box.style.setProperty("--ey", "1");   // 低頭看掉下來的果實
      await sleep(340 + 650 + 120);
      berries.sort((a, b) => Math.abs(a.x) - Math.abs(b.x));   // 從離自己最近的開始吃
      for (const { b, x } of berries) {
        if (!box) break;
        box.style.setProperty("--ex", String(Math.sign(x) * Math.min(1, Math.abs(x) / 60)));   // 頭和眼睛轉過去看這一顆
        await sleep(240);
        if (egg) {   // 蛋：晃一下把果實吸進去
          toMouth(b, true); b.classList.add("eaten");
          await flash("pb-absorb", 560);
        } else {
          cls(true, "st-lean"); await sleep(360);                     // 俯身（狐會先嗅兩下）
          cls(true, fly ? "st-sip" : "st-open"); await sleep(fly ? 260 : 170);   // 張嘴（蝶：口器伸直）
          toMouth(b, false); b.classList.add("eaten");               // 果實飛進嘴裡
          if (fly) { await flash("pb-sip", 900); cls(false, "st-sip"); }
          else { cls(false, "st-open"); await flash("pb-snap", 240); }   // 咬！
          cls(false, "st-lean"); await sleep(280);                    // 抬頭
          if (!fly) await flash("pb-chew", stg === 1 ? 900 : stg === 4 ? 1200 : 900);   // 嚼三下（幼蟲快快啃、虎慢慢嚼）
          await flash("pb-gulp", 340);                               // 吞
        }
        if (bal && isFinite(left)) { left = Math.max(0, left - 1); bal.textContent = left; bal.classList.remove("tick"); void bal.offsetWidth; bal.classList.add("tick"); }
        if (typeof ttBuzz === "function") ttBuzz(8);
        b.remove();
      }
      if (box) { box.style.setProperty("--ex", "0"); box.style.setProperty("--ey", "0"); }
      if (!egg && !fly) await flash("pb-lick", 780);                  // 舔舔嘴
      await flash("pb-hop", 1300);   // 各自的慶祝（style-features.css 依階段換動作）
    } finally { berries.forEach(o => o.b.remove()); cls(false, "st-lean", "st-open", "st-sip"); busy = false; if (box) schedule(mood); }
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

  return { html, bind, unbind, tod, season, wxOf, weather, cachedWx, count: STAGES, zoneOf, react, feed, act };
})();
