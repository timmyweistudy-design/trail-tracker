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
  // 稜線：固定種子，每個階段的山長得不一樣但每次都一樣
  function ridge(seed, base, amp, cls) {
    let s = seed * 9301 + 49297, d = `M-10 300 L-10 ${base}`;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let x = 0; x <= 420; x += 30) d += ` L${x} ${(base - rnd() * amp).toFixed(1)}`;
    return `<path class="${cls}" d="${d} L420 300Z"/>`;
  }
  const pine = (x, y, s, c) => `<g class="${c}" transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 l-16 0 l16 -32 l16 32Z"/><path d="M0 -20 l-13 14 l13 -30 l13 30Z"/><path d="M0 -38 l-9 12 l9 -24 l9 24Z"/><rect x="-2.5" y="0" width="5" height="8"/></g>`;
  const tuft = (x, y, s, c) => `<path class="${c}" transform="translate(${x} ${y}) scale(${s})" d="M0 0 q-3-14 -10-22 q8 6 12 16 q0-14 4-26 q3 14 2 26 q5-12 13-18 q-6 10 -9 24Z"/>`;
  const bloom = (x, y, s, col) => `<g transform="translate(${x} ${y}) scale(${s})"><path class="ps-stem" d="M0 0 v-22" stroke-width="2.4" fill="none"/><g fill="${col}"><circle cx="0" cy="-27" r="4.6"/><circle cx="5" cy="-23" r="4.6"/><circle cx="-5" cy="-23" r="4.6"/><circle cx="3" cy="-18" r="4.6"/><circle cx="-3" cy="-18" r="4.6"/></g><circle cx="0" cy="-22" r="3" fill="#fff3c4"/></g>`;
  const rock = (x, y, s, c) => `<path class="${c}" transform="translate(${x} ${y}) scale(${s})" d="M-30 0 q-4-22 14-30 q12-12 30-4 q18 4 20 22 q2 10 -4 12Z"/>`;
  const cloud = (x, y, s, c) => `<path class="${c}" transform="translate(${x} ${y}) scale(${s})" d="M-40 0 q-14 0 -12-12 q2-12 16-10 q4-16 22-14 q12-12 28 0 q16-4 20 12 q14 2 12 14 q0 10 -14 10Z"/>`;
  const shroom = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-3" y="-12" width="6" height="12" rx="2" fill="#efe4c8"/><path d="M-12 -11 q12 -18 24 0Z" fill="#d9674f"/><circle cx="-4" cy="-15" r="1.8" fill="#fff"/><circle cx="4" cy="-14" r="1.4" fill="#fff"/></g>`;
  const GROUND = `<path class="ps-g" d="M-10 300 L-10 252 Q90 236 200 244 Q310 252 410 238 L410 300Z"/>`;

  // 各階段：遠景（far）、中景（mid，含地面）、前景（front）
  const SCENES = [
    /* 0 卵：落葉窩、大樹幹 */ {
      far: ridge(3, 210, 40, "ps-f1") + ridge(7, 232, 26, "ps-f2"),
      mid: `<path class="ps-trunk" d="M14 270 L20 60 q6-30 14-30 q8 0 12 30 L50 270Z"/><path class="ps-trunk" d="M346 270 L352 40 q8-30 18-30 q10 0 14 30 L392 270Z"/><circle class="ps-m2" cx="34" cy="40" r="44"/><circle class="ps-m" cx="372" cy="22" r="52"/>` + GROUND +
        `<ellipse class="ps-nest" cx="200" cy="262" rx="70" ry="14"/><path class="ps-twig" d="M136 258 q60 -14 128 0 M142 266 q58 10 118 -2" stroke-width="4" fill="none" stroke-linecap="round"/>`,
      front: tuft(18, 300, 1.4, "ps-fr") + tuft(380, 300, 1.2, "ps-fr") + `<path class="ps-leaf" d="M60 296 q14-20 34-12 q-10 18 -34 12Z"/><path class="ps-leaf" d="M330 298 q16-16 32-6 q-12 14 -32 6Z"/>`,
    },
    /* 1 幼蟲：草地、香菇 */ {
      far: ridge(11, 200, 46, "ps-f1") + ridge(5, 228, 30, "ps-f2"),
      mid: GROUND + tuft(60, 252, 1.3, "ps-m") + tuft(330, 250, 1.5, "ps-m") + tuft(120, 248, .9, "ps-m") + shroom(84, 256, 1.4) + shroom(318, 252, 1.1) + shroom(300, 258, .8),
      front: tuft(14, 300, 1.8, "ps-fr") + tuft(44, 302, 1.3, "ps-fr") + tuft(370, 300, 1.7, "ps-fr") + tuft(396, 304, 1.2, "ps-fr"),
    },
    /* 2 蝶：花田 */ {
      far: ridge(17, 196, 44, "ps-f1") + ridge(2, 226, 28, "ps-f2"),
      mid: GROUND + bloom(70, 256, 1.2, "#e889a8") + bloom(104, 250, .9, "#f2c14e") + bloom(300, 252, 1.1, "#b58be0") + bloom(336, 256, 1.3, "#e889a8") + bloom(132, 246, .7, "#ffffff") + bloom(272, 246, .75, "#f2c14e"),
      front: bloom(26, 304, 1.6, "#f08a7a") + tuft(52, 302, 1.3, "ps-fr") + bloom(374, 302, 1.5, "#f2c14e") + tuft(350, 304, 1.2, "ps-fr"),
    },
    /* 3 狐：松林 */ {
      far: ridge(23, 190, 50, "ps-f1") + pine(40, 222, .9, "ps-f2") + pine(90, 214, .7, "ps-f2") + pine(320, 216, .8, "ps-f2") + pine(372, 222, 1, "ps-f2"),
      mid: GROUND + pine(54, 254, 1.7, "ps-m") + pine(110, 248, 1.2, "ps-m2") + pine(300, 248, 1.3, "ps-m2") + pine(352, 256, 1.9, "ps-m"),
      front: `<path class="ps-fern" d="M0 300 q30-40 70-46 q-30 16 -44 46Z"/><path class="ps-fern" d="M400 300 q-34-44 -74-48 q30 18 46 48Z"/>` + tuft(70, 304, 1.1, "ps-fr"),
    },
    /* 4 虎：岩稜 */ {
      far: `<path class="ps-f1" d="M-10 300 L-10 190 L60 150 L110 186 L170 128 L230 182 L300 140 L360 176 L410 150 L410 300Z"/>` + ridge(29, 228, 24, "ps-f2"),
      mid: GROUND + rock(70, 256, 1.6, "ps-rock") + rock(330, 254, 2, "ps-rock") + rock(120, 250, .8, "ps-rock2") + tuft(290, 250, 1, "ps-m"),
      front: rock(20, 306, 1.3, "ps-rock2") + rock(384, 308, 1.1, "ps-rock2") + tuft(56, 302, 1.2, "ps-fr"),
    },
    /* 5 幼龍：雲霧山谷 */ {
      far: `<path class="ps-f1" d="M-10 300 L-10 170 L50 120 L100 168 L160 96 L220 160 L280 104 L340 158 L410 112 L410 300Z"/>` + `<path class="ps-mist" d="M-10 196 q100 -14 210 0 q110 14 210 -4 L410 222 L-10 222Z"/>` + ridge(31, 226, 30, "ps-f2"),
      mid: GROUND + rock(60, 254, 1.2, "ps-rock") + pine(340, 252, 1.4, "ps-m") + pine(372, 258, 1.1, "ps-m2"),
      front: `<path class="ps-mist" d="M-10 300 q60-24 140-10 q-40 6 -60 10Z"/><path class="ps-mist" d="M410 300 q-70-26 -150-8 q40 4 60 8Z"/>` + tuft(28, 302, 1.2, "ps-fr"),
    },
    /* 6 神龍：雲海群峰（站在山頂之上） */ {
      far: `<path class="ps-f1" d="M-10 300 L-10 200 L40 164 L80 196 L130 120 L180 190 L240 140 L290 196 L350 130 L410 180 L410 300Z"/>` + cloud(80, 214, 1.4, "ps-cloud2") + cloud(320, 206, 1.6, "ps-cloud2"),
      mid: `<path class="ps-cloud" d="M-10 300 L-10 244 q40-20 80-6 q30-22 70-4 q40-16 70 0 q36-22 80-4 q40-16 70 2 q30-10 50 0 L410 300Z"/>`,
      front: cloud(30, 300, 1.5, "ps-cloud") + cloud(386, 302, 1.3, "ps-cloud"),
    },
  ];
  const clamp = i => Math.max(0, Math.min(SCENES.length - 1, i | 0));
  // 棲地裝飾（pet-journey.js 依走過的步道主題決定）：放進遠景或中景，不擋角色（角色在正中間）
  const DECOR = {
    sea: { far: `<rect class="ps-sea" x="-10" y="226" width="420" height="34"/><path class="ps-glint" d="M40 236 h26 M120 244 h18 M250 238 h30 M330 246 h20" stroke-width="2" stroke-linecap="round"/>` },
    // 瀑布：不規則岩壁＋一整條水（以前三條直線配方正岩壁，晚上看起來像亮燈的大樓）
    fall: { far: `<path class="ps-cliff" d="M270 262 Q268 214 280 186 Q286 160 300 150 Q312 138 326 146 Q338 140 348 156 Q360 178 358 210 Q362 240 366 262Z"/><path class="ps-water" d="M308 150 Q306 200 302 258 L328 258 Q324 200 322 148Z"/><path class="ps-fallw" d="M311 158 Q309 200 307 252 M318 156 Q317 200 316 252" stroke-width="2" stroke-linecap="round" fill="none"/><ellipse class="ps-splash" cx="315" cy="258" rx="24" ry="5.5"/>` },
    old: { mid: `<g class="ps-steps"><path d="M132 262 h30 l-3 -6 h-24Z"/><path d="M140 252 h24 l-3 -5 h-18Z"/><path d="M148 244 h18 l-2 -4 h-14Z"/></g>` },
    forest: { far: pine(170, 226, .6, "ps-f2") + pine(206, 222, .75, "ps-f2") + pine(240, 228, .55, "ps-f2") },
    lake: { mid: `<ellipse class="ps-lake" cx="300" cy="268" rx="44" ry="9"/><path class="ps-glint" d="M282 266 h16 M306 270 h12" stroke-width="2" stroke-linecap="round"/>` },
  };
  function decorOf(list, stage, layer) { return stage >= 6 ? "" : (list || []).map(k => (DECOR[k] && DECOR[k][layer]) || "").join(""); }

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
    const sc = SCENES[i];
    return `<div class="ps-box${o.bg ? " ps-bg" : ""}" data-stage="${i}"${(o.decor || []).length ? ` data-decor="${o.decor.join(" ")}"` : ""} data-tod="${t}" data-season="${se}"${wx ? ` data-wx="${wx}"` : ""} style="--wx:${o.bg ? 0 : pos.x};--face:${o.bg ? 1 : pos.face}">
      <div class="ps-l ps-sky" style="--d:.1">${sky(t)}${wx === "cloud" || wx === "rain" ? `<svg class="ps-svg ps-drift" ${VB}>${cloud(90, 70, 1.1, "ps-skycloud")}${cloud(300, 50, 1.4, "ps-skycloud")}</svg>` : ""}</div>
      <div class="ps-l ps-far" style="--d:.28"><svg class="ps-svg" ${VB}>${sc.far}${decorOf(o.decor, i, "far")}</svg></div>
      <div class="ps-l ps-mid" style="--d:.55"><svg class="ps-svg" ${VB}>${sc.mid}${decorOf(o.decor, i, "mid")}</svg></div>
      <div class="ps-l ps-fx" aria-hidden="true">${particles(i, t, se, wx)}</div>
      <div class="ps-actor" style="--d:.72">${actorHtml}</div>
      <div class="ps-l ps-front" style="--d:1.35"><svg class="ps-svg" ${VB}>${sc.front}</svg></div>
    </div>`;
  }

  // 角色在舞台上的位置（px，相對中心）與面向（1 右、-1 左）：重繪卡片時保留，不會「閃回中間」
  const pos = { x: 0, face: 1 };

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

  // ── 行為狀態機：待機 → 隨機挑一個動作 → 回待機。心情決定機率（睏的多半不動、開心的會跳會走、想念的東張西望）──
  const WEIGHTS = {
    sleepy: { idle: 6, stretch: 2, look: 1 },
    happy: { hop: 3, walk: 3, look: 2, idle: 1 },
    content: { walk: 3, look: 3, stretch: 1, idle: 2 },
    longing: { look: 4, walk: 1, idle: 2 },
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
  // 走到 x（px，相對舞台中心）；回傳走完的 promise
  function walkTo(x) {
    if (!box) return sleep(0);
    const lim = Math.max(30, box.clientWidth * .27);
    x = Math.round(Math.max(-lim, Math.min(lim, x)));
    const dist = Math.abs(x - pos.x); if (dist < 4) return sleep(0);
    pos.face = x > pos.x ? 1 : -1; pos.x = x;
    const ms = Math.round(900 + dist * 9);
    box.style.setProperty("--face", pos.face); box.style.setProperty("--wt", ms + "ms"); box.style.setProperty("--wx", x);
    const em = emEl(); if (em) em.classList.add("pb-walk");
    return sleep(ms).then(() => { const e = emEl(); if (e) e.classList.remove("pb-walk"); });
  }
  async function act(kind) {
    if (!box) return;
    busy = true;
    try {
      if (kind === "walk") {
        const lim = box.clientWidth * .27;
        let x = (Math.random() * 2 - 1) * lim; if (Math.abs(x - pos.x) < 50) x = pos.x > 0 ? -lim * .6 : lim * .6;
        await walkTo(x);
      } else if (kind === "look") {
        for (const d of [-1, 1, 0]) { if (!box) break; box.style.setProperty("--ex", d); await sleep(d ? 900 : 200); }
      } else if (kind === "hop") await flash("pb-hop", 1100);
      else if (kind === "stretch") await flash("pb-stretch", 1400);
      else await sleep(400);
    } finally { busy = false; }
  }
  function schedule(m) {
    clearTimeout(beat);
    if (reduce() || window.__psNoIdle) return;   // __psNoIdle：測試要穩定時關掉隨機動作
    beat = setTimeout(async () => {
      if (box && box.isConnected && visible && !document.hidden && !busy) await act(pick(WEIGHTS[m] || WEIGHTS.content));
      if (box && box.isConnected) schedule(m);
    }, 3500 + Math.random() * 4500);
  }

  // ── 互動：點頭＝摸摸頭、點身體＝搔癢、長按＝抱抱（pet.js 決定給什麼回饋，這裡只播動作） ──
  function zoneOf(clientY) {
    const c = box && box.querySelector("#petEmoji .pet-critter"); if (!c) return "pat";
    const r = c.getBoundingClientRect();
    return clientY < r.top + r.height * .5 ? "pat" : "tickle";
  }
  function react(kind) {
    if (reduce()) return sleep(0);
    return flash(kind === "hug" ? "pb-hug" : kind === "tickle" ? "pb-tickle" : "pb-pat", kind === "hug" ? 1000 : 800);
  }

  // ── 餵食：果實從天上掉在角色旁邊 → 角色走過去 → 吃三口 → 回到原位附近。回傳播完的 promise ──
  async function feed(berrySvg) {
    if (!box || reduce() || !visible) return;
    clearTimeout(beat); busy = true;
    try {
      const lim = box.clientWidth * .27;
      const side = pos.x > 0 ? -1 : 1, bx = Math.round(Math.max(-lim, Math.min(lim, pos.x + side * 70)));
      const b = document.createElement("span");
      b.className = "ps-berry"; b.innerHTML = berrySvg || ""; b.style.setProperty("--bx", bx);
      box.querySelector(".ps-actor").appendChild(b);
      await sleep(650);
      await walkTo(bx - side * 34);
      pos.face = side; box.style.setProperty("--face", side);
      b.classList.add("eaten");
      await flash("pb-eat", 1000);
      b.remove();
      await flash("pb-hop", 1100);
    } finally { busy = false; if (box) schedule(mood); }
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

  return { html, bind, unbind, tod, season, wxOf, weather, cachedWx, count: SCENES.length, zoneOf, react, feed, walkTo, act, pos };
})();
