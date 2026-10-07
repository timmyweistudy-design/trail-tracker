// 夥伴走過去吃（2026-10-04）：共用的移動系統。pet-stage.js 的 feed() 呼叫 PetWalk.goTo()／home()。
// 讓走路看起來真實的幾個原則（動畫走路週期的研究整理）：
//   1. 腳要踩住：步伐相位由「走了多遠」推，不是由時間推——支撐腳往後退的量剛好等於身體往前的量，在地面上不動，所以不會滑
//   2. 著地 → 下沉（吃重量）→ 交錯 → 抬高：每一步身體上下兩次；沒有下沉那一格就會像在飄
//   3. 重心左右轉移（身體往支撐腳那側傾）；頭比身體晚一點、尾巴反向擺、耳朵晚一點彈（跟隨與重疊）
//   4. 起步先蹲一下往後一縮（預備）、速度慢慢加；停下來減速、身體往前多衝一點再回來，尾巴還會再擺
//   5. 往哪走就先轉成 3/4 側面（rotateY），眼睛一路盯著果實
// 每一格寫十幾個 CSS 變數在 .ps-box 上，style-features.css 的「走路」段把它們套到骨架（pet-art.js 的 pr-*）上。
window.PetWalk = (function () {
  const reduce = () => window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  // 各階的走法：D＝走一個完整步伐週期前進幾 px；v＝速度 px/s；duty＝支撐期比例；bob／roll／lift 單位是 SVG（viewBox 200）
  const GAIT = {
    0: { mode: "rock", v: 86, D: 30, bob: 3, roll: 15 },                                      // 蛋：左右搖著滾過去
    1: { mode: "crawl", v: 24, Du: 36, bob: 0, roll: 0, head: 0 },   // 2026-10-06 第五輪：尺蠖一個循環往前 36 單位（身長的四成）                         // 幼蟲：蠕動（收縮波從尾巴往頭傳；一道波往前 22 單位）
    2: { mode: "fly", v: 140, D: 38, bob: 9, roll: 0, bank: 9 },                               // 蝶：一拍一升的小弧線、轉彎時內傾
    3: { mode: "rock", v: 70, D: 26, bob: 2, roll: 3, lift: 5, duty: .6 },     // 狐（2026-10-07：不再側身走——萬一要挪位置，臉朝我們、左右晃著小碎步挪過去）
    4: { mode: "rock", v: 58, D: 30, bob: 2.6, roll: 2.4, lift: 5, duty: .64 },   // 虎：同上、慢一點沉一點
    5: { mode: "waddle", v: 100, D: 28, bob: 4.5, roll: 7, lift: 11, duty: .56, tail: 12, ear: 6, head: 2.4 },        // 幼龍：短腿搖搖擺擺
    6: { mode: "swim", v: 80, D: 70, bob: 3, roll: 1.5, tail: 0, head: 1.5 },   // tail 0（2026-10-07 使用者回報吃完左右游時尾巴抽兩下）：通用步態會轉 .pc-tail＝神龍尾端那片鰭、支點不在鰭上，起步和停下各甩一大圈；尾巴交給繩波                 // 神龍：在雲上游（2026-10-07 第六輪 125→80：繩波往後傳的速度≈前進速度，尾巴跟得上）
  };
  let raf = 0;
  // ── 身體變形（幼蟲蠕動、神龍游）：.pr-deform 裡的路徑座標每一格依「變形場」移動，走完還原 ──
  // 幼蟲：一個隆起從尾巴往頭跑（收縮波，腹足跟著被抬起來）；神龍：沿身體往尾巴傳的正弦波，越往尾巴越大
  const ORIG = new WeakMap();
  const TOK = /([MLHVCSQTAZmlhvcsqtaz])|(-?\d*\.?\d+(?:e[-+]?\d+)?)/g;
  function snapshot(box) {
    const g = box.querySelector("#petEmoji .pr-deform"); if (!g) return null;
    if (ORIG.has(g)) return ORIG.get(g);
    const items = [];
    for (const root of [g, box.querySelector("#petEmoji .pr-tailtop")]) if (root) root.querySelectorAll("path,ellipse,circle,g[transform]").forEach(el => {   // .pr-tailtop：神龍尾巴的上層那份（只在送果實時畫）
      const top = root !== g;
      const rg = el.closest(".pr-rigid"); if (rg && rg !== el) return;   // 剛體群組（神龍的後腳，2026-10-06 第五輪）：裡面的東西不各自變形，整組跟著群組的錨點平移
      if (el.tagName === "path") {   // 2026-10-07 優化輪：第一次就把路徑切好、轉成數字（以前每一格都重新切字串、轉數字、再查一次在不在平移群組裡）
        const d = el.getAttribute("d"); if (!d) return;
        const segs = []; let cur = null;
        for (const t of d.match(TOK)) { if (/[A-Za-z]/.test(t)) { cur = { c: t, n: [], pair: "MLTQSC".includes(t) }; segs.push(cur); } else if (cur) cur.n.push(+t); }
        const tg = el.closest("g[transform]");
        items.push({ el, d, segs, top, skip: !!tg && tg !== g && tg !== root });   // 在平移群組裡的（爪子）跟著群組走
      }
      else if (el.tagName === "g") { const m = /^translate\(([-\d.]+)[ ,]+([-\d.]+)\)(.*)$/.exec(el.getAttribute("transform")); if (m) items.push({ el, top, gx: +m[1], gy: +m[2], rest: m[3] }); }
      else if (!el.closest("g[transform]") || el.closest("g[transform]") === g) items.push({ el, top, cx: +el.getAttribute("cx"), cy: +el.getAttribute("cy") });
    });
    ORIG.set(g, items); return items;
  }
  function applyField(box, F) {
    const items = snapshot(box); if (!items) return;
    const r = v => Math.round(v * 10) / 10;
    const topOn = !!box.__tailTop;
    for (const it of items) {
      if (it.top && !topOn) continue;   // 尾巴上層那份透明時不算
      if (it.segs) {
        if (it.skip) continue;
        let out = "";
        for (const sg of it.segs) {
          out += sg.c; const n = sg.n;
          if (sg.pair) for (let i = 0; i + 1 < n.length; i += 2) { const q = F(n[i], n[i + 1]); out += r(q[0]) + " " + r(q[1]) + " "; }
          else if (n.length) out += n.join(" ") + " ";
        }
        it.el.setAttribute("d", out);      } else if (it.gx != null) { const [x, y] = F(it.gx, it.gy); it.el.setAttribute("transform", `translate(${r(x)} ${r(y)})${it.rest}`); }
      else { const [x, y] = F(it.cx, it.cy); it.el.setAttribute("cx", r(x)); it.el.setAttribute("cy", r(y)); }
    }
  }
  function resetField(box) {
    const g = box.querySelector("#petEmoji .pr-deform"); const items = g && ORIG.get(g); if (!items) return;
    for (const it of items) { if (it.segs) it.el.setAttribute("d", it.d); else if (it.gx != null) it.el.setAttribute("transform", `translate(${it.gx} ${it.gy})${it.rest}`); else { it.el.setAttribute("cx", it.cx); it.el.setAttribute("cy", it.cy); } }
  }
  // ── 幼蟲一節一節（2026-10-06）：每一節（.lv-seg）的中心 (u, v)；F(u, v) 回傳新的中心 [x, y]，這一節整個平移過去（腳跟著那一節）──
  const LVSEG = new WeakMap();
  // 2026-10-06 第四輪：每一節分兩層（.lv-ln 裡的外框＋腳、.lv-seg 填色），第 k 片兩層一起移動
  function lvSegs(box) { const g = box.querySelector("#petEmoji .lv-body"); if (!g) return null; let o = LVSEG.get(g); if (!o) { const L = [...g.querySelectorAll(":scope > .lv-ln > .lv-sl")]; o = [...g.querySelectorAll(":scope > .lv-seg")].map((el, i) => ({ el, ln: L[i], u: +el.dataset.u, v: +el.dataset.v, b: +el.dataset.b || +el.dataset.v })); LVSEG.set(g, o); } return o; }
  function lvPose(box, F, order) {   // order：依遠近重新排先後（U 型迴轉時近的那節蓋在遠的上面）
    const S = lvSegs(box); if (!S) return;
    for (const q of S) { const [x, y] = F(q.u, q.v), t = `translate(${(x - q.u).toFixed(2)}px, ${(y - q.v).toFixed(2)}px)`; q.el.style.transform = t; if (q.ln) q.ln.style.transform = t; q.z = order ? order(q.u) : 0; }
    if (order) { const g = S[0].el.parentNode; S.slice().sort((a, b) => a.z - b.z).forEach(q => { g.appendChild(q.el); if (q.ln) q.ln.parentNode.appendChild(q.ln); }); }
  }
  function lvReset(box) { const S = lvSegs(box); if (!S) return; const g = S[0].el.parentNode; S.forEach(q => { q.el.style.transform = ""; g.appendChild(q.el); if (q.ln) { q.ln.style.transform = ""; q.ln.parentNode.appendChild(q.ln); } }); }   // 回到原位、原本的先後（尾→頭）
  const hump = (x, c, w) => Math.exp(-Math.pow((x - c) / w, 2));
  const sstep = v => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
  // 幼蟲的蠕動（2026-10-05 重做）：真的鳳蝶幼蟲是一道收縮波從尾巴傳到頭——波經過的那一節抬起來往前移 Du，其他節貼在地上不動。
  // 身體整體（moveTo）是等速往前，所以每一節在身體座標裡：波還沒到 → 往後退（＝在地上不動）、波經過 → 往前跳 Du、波過了 → 又不動。
  // 一趟路切成整數道波，最後一道波結束時每一節剛好回到原位（身體是平的才停）。rev＝倒退（波從頭傳到尾）
  // 2026-10-06 第五輪（使用者：「不要波浪式，我要拱起來、蛄蛹的走」）：改尺蠖式——一個循環分兩段：
  //   前半（ph 0→.5）：前端抓地不動、尾端往前拖上來，中段拱成 Ω；後半（.5→1）：尾端抓地、前端往前伸出去，拱慢慢攤平、頭落地。
  // 拱的高度由「兩端距離縮短多少」反算（弧長≈身長，身體不會變長變短）；每一節在地上的位置＝尾端與前端的內插，跟身體的移動用同一個相位，所以抓地的那端不會滑。
  // 正在移動的那一端微微抬起（腳離地才往前）。rev＝倒退：前端先往後縮、尾端再退
  // 趴平（2026-10-07 第六輪，使用者：「一開始就要全部趴下去」）：平常前半身翹著、頭抬高；走之前每一節往下移到肚子貼地（G＝最低那節的肚子），頭跟著前端放低
  function lvFlatDy(box, x) {
    const S = lvSegs(box); if (!S) return 0; const T = S.slice().sort((a, b) => a.u - b.u), G = Math.max(...T.map(q => q.b));
    if (x <= T[0].u) return G - T[0].b; if (x >= T[T.length - 1].u) return G - T[T.length - 1].b;
    for (let i = 1; i < T.length; i++) if (x <= T[i].u) { const k = (x - T[i - 1].u) / (T[i].u - T[i - 1].u); return (G - T[i - 1].b) * (1 - k) + (G - T[i].b) * k; }
    return 0;
  }
  // 趴平的程度 fl 套在「靜止」姿勢上（吃東西、停下來時用；2026-10-07 優化輪 #6：走到果實前不再先抬頭、吃的時候再低頭）
  function lvFlatPose(box, fl) {
    const E = els(box); if (fl > 0) { lvPose(box, (x, y) => [x, y + fl * lvFlatDy(box, x)]); if (E.head) { E.head.style.transition = "none"; E.head.style.transform = `translate(0px, ${(fl * lvFlatDy(box, 146)).toFixed(2)}px)`; } }
    else { lvReset(box); if (E.head) E.head.style.transform = ""; }
  }
  async function lvRise(box) {   // 抬起前半身（趴平 → 平常的樣子）
    const f0 = box.__lvFlat || 0; if (!f0) return;
    await tween(340, e => { box.__lvFlat = f0 * (1 - e); lvFlatPose(box, box.__lvFlat); }); box.__lvFlat = null; lvFlatPose(box, 0);
  }
  function crawlField(box, ph, s, Du, rev) {
    const LB = 90, q = ph < .5 ? ph / .5 : (ph - .5) / .5, e = q * q * (3 - 2 * q), sg = rev ? -1 : 1;
    let aR, aF;   // 尾端、前端這一個循環已經往前了多少（世界座標，相對循環開始）
    if (!rev) { if (ph < .5) { aR = Du * e; aF = 0; } else { aR = Du; aF = Du * e; } }
    else { if (ph < .5) { aF = -Du * e; aR = 0; } else { aF = -Du; aR = -Du * e; } }
    const fl = box.__lvFlat == null ? 1 : box.__lvFlat, LM = LB * .66, c = LM - Math.abs(aR - aF), h = (2 / Math.PI) * Math.sqrt(Math.max(0, c * (LM - c))) * s;   // 中段（72%）的弦變短 → 拱變高（弧長≈中段長）
    const lift = 5 * Math.pow(Math.sin(Math.PI * q), .6) * s, movingRear = !rev ? ph < .5 : ph >= .5;
    const F = (x, y) => {
      const t = Math.max(0, Math.min(1, (x - 44) / LB)), a = Math.max(0, Math.min(1, (t - .24) / .66)), adv = aR + (aF - aR) * a;   // 拱橋的兩根柱子：尾端三節（有肉足）、頭後面那一節，各自整段跟著自己那一端（抓地完全不動）
      const end = movingRear ? Math.max(0, 1 - t / .32) : Math.max(0, (t - .68) / .32);   // 正在移動的那一端抬起（肉足離地才往前）
      return [x + adv - sg * ph * Du, y + fl * lvFlatDy(box, x) - h * 1.15 * Math.pow(Math.sin(Math.PI * a), .55) - lift * end];   // 拱兩側陡（像柱子撐起拱橋）、頂比較平
    };
    lvPose(box, F);
    // 頭掛在第一節上（2026-10-05 第二輪）：頭的位移＝同一個變形場在頸部那一點（x≈146）的位移——以前用另一條公式，跟身體前端差到 11 個單位，看得到頭離開身體
    const nk = F(146, 150);
    set(box, "--ghx", (nk[0] - 146).toFixed(2) + "px");
    set(box, "--ghy", (nk[1] - 150).toFixed(2) + "px");
  }
  // ── 神龍的繩波（2026-10-06）：整條身體一道從頭傳到尾的行進波（像甩繩子、像舞龍），位移垂直於身體中心線、越往尾巴越大。
  // 平常懸浮也有一道慢波流過身體（空中的緞帶）；游的時候波更大更快，相位加上「走了多遠」——身體每一點走頭走過的路。
  // 頭、抓龍珠的前爪跟著頸部的波；龍鬚晚一點跟上。用尾巴送果實時，尾巴那段的波慢慢收掉（交給 CCD，接觸點才準）。
  // 常駐迴圈（rope()）每格畫；尾巴的 CCD 只改 box.__chain，再叫 ropeRender 在同一格畫（果實才跟得上尾尖）
  const ROPE = { lam: 140, T: 2.8, a0: 1.2, a1: 8 };
  let RINFO = null;
  function ropeInfo() {
    if (RINFO) return RINFO; const S = sp6(); if (!S) return null;
    const sl = [0]; for (let i = 1; i < S.length; i++) sl.push(sl[i - 1] + Math.hypot(S[i].x - S[i - 1].x, S[i].y - S[i - 1].y));
    const n = S.map((q, i) => { const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)], tx = b.x - a.x, ty = b.y - a.y, L = Math.hypot(tx, ty) || 1; return [-ty / L, tx / L]; });
    return (RINFO = { sl, n, L: sl[sl.length - 1] });
  }
  function ropeRender(box, now) {
    const S = sp6(), I = ropeInfo(); if (!S || !I) return;
    const swim = box.classList.contains("walking"), travel = (box.__wx || 0) / pxu(box);
    const dt = box.__ropeT ? Math.min(.05, (now - box.__ropeT) / 1000) : 0; box.__ropeT = now; box.__ropePh = (box.__ropePh || 0) + dt / (swim ? 1.8 : ROPE.T);   // 相位一路累加（換速度不跳）
    // 幅度、尾巴那段的波都照「時間」慢慢變（2026-10-07 優化輪 #9/#17：以前每次呼叫乘 .08／.15，一格呼叫幾次、機器快慢都會改變收放的速度；停下來時波也收得不平均）
    const k0 = box.__ropeK == null ? 1 : box.__ropeK, k = box.__ropeK = k0 + ((swim ? 1.8 : 1) - k0) * (1 - Math.exp(-dt / .45));
    const t0 = box.__ropeTail == null ? 1 : box.__ropeTail, tf = box.__ropeTail = t0 + ((box.__chain ? 0 : 1) - t0) * (1 - Math.exp(-dt / .12));
    { const tt = els(box).tailTop, on = tf < .995; if (tt) { if (on !== !!box.__tailTop || on) tt.setAttribute("opacity", on ? Math.min(1, (1 - tf) * 1.6).toFixed(3) : "0"); } box.__tailTop = on; }   // 尾巴送果實時上層那份淡入
    const D = S.map((_, j) => (ROPE.a0 + ROPE.a1 * Math.pow(I.sl[j] / I.L, 1.3)) * k * Math.sin(2 * Math.PI * ((I.sl[j] + travel) / ROPE.lam - box.__ropePh)) * (j > I0 ? tf : 1));
    const P = box.__chain, R = rest(), phi = P ? S.map((_, j) => wrap(ang(P[j], P[j + 1]) - ang(R[j], R[j + 1]))) : null, zero = P ? null : S.map(() => 0);
    // 每一節的位移向量；尾巴（I0 以後）＝交界那一節的位移（整段跟著平移，交界不會斷開）＋自己的波 × tf（送果實時收掉）
    const base = [I.n[I0][0] * D[I0], I.n[I0][1] * D[I0]];
    const OFF = S.map((_, j) => {
      let nx = I.n[j][0], ny = I.n[j][1]; if (phi) { const c = Math.cos(phi[j]), sn = Math.sin(phi[j]); [nx, ny] = [c * nx - sn * ny, sn * nx + c * ny]; }
      const w = [nx * D[j], ny * D[j]]; if (j <= I0) return w;
      const raw = (ROPE.a0 + ROPE.a1 * Math.pow(I.sl[j] / I.L, 1.3)) * k * Math.sin(2 * Math.PI * ((I.sl[j] + travel) / ROPE.lam - box.__ropePh));
      return [base[0] + (nx * raw - base[0]) * tf, base[1] + (ny * raw - base[1]) * tf];
    });
    applyField(box, (x, y) => {
      const key = x + "," + y; if (!NEAR.has(key)) mapPt(R, zero || phi, x, y);
      const j = NEAR.get(key), b = P ? mapPt(P, phi, x, y) : [x, y];
      return [b[0] + OFF[j][0], b[1] + OFF[j][1]];
    });
    const E = els(box), hx = I.n[0][0] * D[0], hy = I.n[0][1] * D[0];
    const ln = box.__lean || [0, 0];   // 頭迎上去接果實（pet-stage 設定；跟繩波同一個地方寫，不跟咬的動畫搶同一個元素）
    if (E.head) E.head.style.transform = `translate(${(hx + ln[0]).toFixed(2)}px, ${(hy + ln[1]).toFixed(2)}px)`;
    if (E.pearl) E.pearl.style.transform = `translate(${(I.n[4][0] * D[4]).toFixed(2)}px, ${(I.n[4][1] * D[4]).toFixed(2)}px)`;
    const hs = box.__hys == null ? hy : box.__hys + (hy - box.__hys) * Math.min(1, (dt || .016) / .16);   // 龍鬚：頭往下時鬚尖往上飄、晚一點才跟上
    box.__hys = hs; const wa = Math.max(-14, Math.min(14, (hy - hs) * 6));
    E.sway.forEach(el => { el.style.animation = "none"; el.style.transform = `rotate(${(el.classList.contains("l") ? wa : -wa).toFixed(2)}deg)`; });
  }
  let ropeRaf = 0;
  function rope(box, on) {
    cancelAnimationFrame(ropeRaf); ropeRaf = 0; if (!box || !on || reduce()) return;
    let odd = false;
    const tick = () => { if (!box.isConnected || stage(box) !== 6) { ropeRaf = 0; return; }
      odd = !odd; if (odd || box.classList.contains("walking") || box.__chain || box.__ropeTail < .99) ropeRender(box, performance.now());   // 待機時繩波很慢：每秒畫 30 次就夠（游、用尾巴送果實時每格畫）
      ropeRaf = requestAnimationFrame(tick); };
    ropeRaf = requestAnimationFrame(tick);
  }
  // ── 蝶的翅膀（2026-10-06 第四輪）：單一個 JS 控制器每格寫前翅、後翅的 scaleX（1＝全開）。
  // 以前三方輪流管：平常 CSS pcflut、停下來 CSS bfRest、飛的時候 JS——每換一次手翅膀就從那個動畫的固定姿勢重來（一格跳一大段）。
  // 現在每種狀態是一個「時間 → 角度」的函式，換狀態時從「換的那一格的角度」平滑接到新函式（B 毫秒），角度永遠連續：
  //   idle 平常慢慢搧、fly 跟著身體一拍一升（pose 寫 box.__wfly）、rest 停著吃＝半合只微動（不再週期性大張）、flap 起飛前在原地用力拍
  const WING = {
    idle: t => [.78 + .22 * Math.cos(2 * Math.PI * t / .8), .78 + .22 * Math.cos(2 * Math.PI * (t - .06) / .8)],   // 2026-10-06 第五輪（使用者）：待機也要看得出在拍——跟飛行同一種節奏（以前 1.1 秒只收到 0.72，像沒在動）
    rest: () => [.45, .45],   // 2026-10-06 第五輪（使用者）：落地吃東西時翅膀完全停住
    flap: (t, w) => [.5 + .5 * Math.abs(Math.sin(Math.PI * (t - w.t0) / .34)), .5 + .5 * Math.abs(Math.sin(Math.PI * (t - w.t0 - .04) / .34))],
    fly: (t, w, box) => box.__wfly || WING.idle(t),
  };
  let wingRaf = 0;
  function wingNow(box, t) {
    const w = box.__wing || (box.__wing = { mode: "idle", from: null, ts: 0, B: 1, t0: 0 });
    const cur = WING[w.mode](t, w, box); if (!w.from) return cur;
    const k = Math.min(1, (t - w.ts) / w.B); if (k >= 1) { w.from = null; return cur; }
    const e = k * k * (3 - 2 * k); return [w.from[0] + (cur[0] - w.from[0]) * e, w.from[1] + (cur[1] - w.from[1]) * e];
  }
  function wingMode(box, mode, ms) {   // 換狀態：從現在的角度接過去
    if (!box) return; const t = performance.now() / 1000, w = box.__wing || (box.__wing = { mode: "idle", from: null, ts: 0, B: 1, t0: 0 });
    if (w.mode === mode) return;
    w.from = wingNow(box, t); w.mode = mode; w.ts = t; w.B = Math.max(.001, (ms == null ? 300 : ms) / 1000); w.t0 = t;
  }
  function wingRender(box) {
    const E = els(box); if (!E.fw.length) return;
    const v = wingNow(box, performance.now() / 1000); box.__wv = v;
    E.fw.forEach(el => { el.style.transform = `scaleX(${v[0].toFixed(3)})`; }); E.hw.forEach(el => { el.style.transform = `scaleX(${v[1].toFixed(3)})`; });
  }
  function wings(box, on) {
    cancelAnimationFrame(wingRaf); wingRaf = 0; if (!box || !on || reduce()) return;
    const tick = () => { if (!box.isConnected || stage(box) !== 2) { wingRaf = 0; return; } wingRender(box); wingRaf = requestAnimationFrame(tick); };
    wingRaf = requestAnimationFrame(tick);
  }
  // ── 神龍的雲座：晚 0.25 秒跟著重心走；落在雲上的果實（box.__riders）跟著雲一起移 ──
  function cloudTick(box, x) {
    const now = performance.now(), tr = box.__trail || (box.__trail = []);
    tr.push([now, x]); while (tr.length > 2 && tr[1][0] < now - 600) tr.shift();
    const t = now - 250; let cx = tr[0][1];
    for (let i = 1; i < tr.length; i++) if (tr[i][0] >= t) { const [t0, x0] = tr[i - 1], [t1, x1] = tr[i]; cx = t1 > t0 ? x0 + (x1 - x0) * Math.max(0, Math.min(1, (t - t0) / (t1 - t0))) : x1; break; } else cx = tr[i][1];
    const E = els(box); if (E.prop) E.prop.style.translate = `calc(-50% + ${cx.toFixed(2)}px) 0px`;
    box.__cloud = cx; ride(box);
  }
  function ride(box) { (box.__riders || []).forEach(r => { r.el.__rx = r.bx + (box.__cloud != null ? box.__cloud : r.c0) - r.c0; r.el.style.translate = `${(r.el.__rx + (r.el.__cx || 0)).toFixed(2)}px ${(r.el.__cy || 0).toFixed(2)}px`; }); }
  // ── 神龍用尾巴托果實（2026-10-05 第二輪改 FABRIK）：身體中心線（PET_ART.dragonSpine）＋尾尖當成一串固定長度的關節，
  // 從第 I0 節以後可以動。每一格從「上一格的姿勢」出發往目標逼近（FABRIK：從尾尖拉到目標、再從根部拉回來），所以前後兩格一定連續；
  // 每個關節相對原本的彎度最多多彎 14°——不會打結、不會折出尖角。以前用「等曲率＋二次」的公式整條重解，解出來可能繞好幾圈，內插時尾巴整條在甩。
  // 每個路徑點跟著離它最近的那一節一起平移、旋轉，所以尾鰭、後爪也跟著彎過去（不是被拉長）
  let SP6 = null, REST = null; const NEAR = new Map(), TIP6 = [172, 182], I0 = 28, BEND = 22 * Math.PI / 180;   // 2026-10-06 第四輪：I0 20 → 28（可以動的從背上的拱開始；以前整個下半身都跟著甩）
  const sp6 = () => SP6 || (SP6 = typeof PET_ART !== "undefined" && PET_ART.dragonSpine ? PET_ART.dragonSpine(16) : null);
  const rest = () => REST || (REST = sp6().map(q => [q.x, q.y]).concat([TIP6.slice()]));   // 最後一節＝尾尖（.cp-tail）
  const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]), wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  // ── 象鼻式尾巴（2026-10-06 第五輪，取代 CCD）：使用者「尾巴拿東西吃就跟大象一樣，現在太僵硬」。
  // 尾巴每一節「比原本多彎的角度」＝ c0 + c1·u + c2·u²（u：根部 0 → 尾尖 1）＋ 尾尖的勾 hook·smoothstep(u: .62→1)，再用 BEND·tanh 軟性夾住。
  // 彎度沿著尾巴連續變化（不會有一節折角）、每節長度固定（只改角度）、尾尖自然彎得最多（像象鼻捲東西）；
  // 每一格從上一格的參數出發解（阻尼最小平方：離目標近＋離上一格近），參數的變化再照時間限速——所以前後兩格一定連續、不會換一種彎法
  const tailAngles = P => P.slice(0, -1).map((q, i) => ang(q, P[i + 1]));
  // TS：尾巴伸長的比例（象鼻會伸長；2026-10-07 使用者：「尾巴做長一點，讓牠剛好吃到，頭不用動」）——送到嘴前搆不到時慢慢伸到最多 1.3 倍，放回去時縮回 1
  let TS = 1;
  function tailFk(A) { const R = rest(), P = R.map(q => q.slice()); let x = R[I0][0], y = R[I0][1]; for (let i = I0; i < R.length - 1; i++) { const L = Math.hypot(R[i + 1][0] - R[i][0], R[i + 1][1] - R[i][1]) * TS; x += Math.cos(A[i]) * L; y += Math.sin(A[i]) * L; P[i + 1] = [x, y]; } return P; }
  const ssT = v => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
  function trunk(c, hook) {   // 參數 → 整條鏈的點
    const R = rest(), RA = tailAngles(R), A = RA.slice(), N = R.length - 2 - I0; let acc = 0;
    for (let i = I0; i < R.length - 1; i++) { const u = (i - I0) / N, raw = c[0] + c[1] * u + c[2] * u * u + (hook || 0) * ssT((u - .62) / .38); acc += BEND * Math.tanh(raw / BEND); A[i] = RA[i] + acc; }
    return tailFk(A);
  }
  function trunkSolve(c, hook, T, iters) {   // 讓尾尖到 T：阻尼高斯牛頓，從 c 出發（會改 c）
    const tipOf = q => { const P = trunk(q, hook); return P[P.length - 1]; }, lam = .02, h = 1e-4;
    for (let it = 0; it < iters; it++) {
      const p0 = tipOf(c), ex = T[0] - p0[0], ey = T[1] - p0[1]; if (Math.hypot(ex, ey) < .05) break;
      const J = [0, 1, 2].map(k => { const q = c.slice(); q[k] += h; const p = tipOf(q); return [(p[0] - p0[0]) / h, (p[1] - p0[1]) / h]; });
      const M = [0, 1, 2].map(i => [0, 1, 2].map(j => J[i][0] * J[j][0] + J[i][1] * J[j][1])), g = [0, 1, 2].map(i => J[i][0] * ex + J[i][1] * ey);
      const tr = (M[0][0] + M[1][1] + M[2][2]) / 3; for (let i = 0; i < 3; i++) M[i][i] += tr * lam * 5;   // LM：阻尼跟矩陣同一個量級（步子小、不衝過頭）
      const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
      const D = det(M); if (!D) break;
      const dc = [0, 1, 2].map(k => det(M.map((row, i) => row.map((v, j) => (j === k ? g[i] : v)))) / D); for (let k = 0; k < 3; k++) c[k] += dc[k];
    }
    const p = tipOf(c); return Math.hypot(T[0] - p[0], T[1] - p[1]);
  }
  function mapPt(P, phi, x, y) {
    const S = sp6(), key = x + "," + y; let j = NEAR.get(key);
    if (j == null) { let best = 1e9; S.forEach((q, i) => { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < best) { best = d; j = i; } }); NEAR.set(key, j); }
    const a = phi[j], c = Math.cos(a), sn = Math.sin(a), dx = x - S[j].x, dy = y - S[j].y;
    return [P[j][0] + c * dx - sn * dy, P[j][1] + sn * dx + c * dy];
  }
  function applyChain(box, P) { box.__chain = P; ropeRender(box, performance.now()); }   // 尾巴的姿勢＋繩波一起畫（同一格，果實才跟得上尾尖）
  // 目標（畫面座標）→ 身體座標
  function toLocal(box, X, Y) { const g = box.querySelector("#petEmoji .pr-deform"), m = g && g.getScreenCTM(); if (!m) return [X, Y]; const q = new DOMPoint(X, Y).matrixTransform(m.inverse()); return [q.x, q.y]; }
  // 尾尖到得了這一點嗎（身體座標）：pet-stage.js 挑果實落點用
  // 跟動畫一樣讓目標一步一步移過去（從原位直接解 FABRIK 會卡住、誤判成搆不到——以前雲上的落點因此全被否決，神龍退回「果實掉在地上」）
  const tailReach = (x, y) => { if (!sp6()) return 99; TS = 1; const c = [0, 0, 0], s0 = TIP6; let e = 99; for (let f = 1; f <= 30; f++) { const k = f / 30; e = trunkSolve(c, 0, [s0[0] + (x - s0[0]) * k, s0[1] + (y - s0[1]) * k], f < 30 ? 6 : 30); } return e; };
  // tgt：果實元素（尾尖去托它）／"mouth"（送到下巴前的交接點）／null（尾巴放回原位）
  // 尾尖走一條弧線：去托果實時微微抬起；送到嘴前時從身體下方繞過去（不從臉、角或身體中間穿過）；收回時往下回到原位
  const mouthLocal = box => { const m = cpt(box, "mouth"); return toLocal(box, m[0] - 5, m[1] + 6); };   // 下巴前面一點點（交接點）
  function tailMs(box, tgt) {   // 照路長給時間（毫秒）：去勾 0.7～1 秒、送到嘴前 0.9～1.2、收回 0.9～1.3
    const P = box.__chain || rest(), tip = P[P.length - 1], g = !tgt ? TIP6 : tgt === "mouth" ? mouthLocal(box) : typeof tgt === "function" ? toLocal(box, ...tgt()) : (() => { const r = tgt.getBoundingClientRect(); return toLocal(box, r.left + r.width / 2, r.top + r.height * .62); })();
    const d = Math.hypot(g[0] - tip[0], g[1] - tip[1]), [lo, hi] = !tgt ? [900, 1300] : (tgt === "mouth" || typeof tgt === "function") ? [900, 1200] : [700, 1000];
    return Math.round(lo + (hi - lo) * Math.min(1, d / 110));
  }
  // 限速：這一格參數的變化讓「尾巴上任何一點」移動超過 vmax 單位，就按比例縮小（以前直接夾參數，c0 改一點點 21 節累加起來尾尖一格跑 20 單位）
  function limitTip(prev, c, hk, vmax) {
    const dm = 1 - Math.pow(.5, vmax / 3.2); for (let i = 0; i < 3; i++) c[i] = prev[i] + (c[i] - prev[i]) * dm;   // 阻尼：每 1/60 秒只走一半（照時間算；搆得到的邊緣兩種解會來回跳）
    const P0 = box0Chain(prev, hk), P1 = trunk(c, hk); let m = 0; for (let i = I0; i < P1.length; i++) m = Math.max(m, Math.hypot(P1[i][0] - P0[i][0], P1[i][1] - P0[i][1]));
    if (m > vmax) { const k = vmax / m; for (let i = 0; i < 3; i++) c[i] = prev[i] + (c[i] - prev[i]) * k; }
  }
  const box0Chain = (c, hk) => trunk(c, hk);
  // tgt：果實（尾尖過去、最後捲起來勾住）／"mouth"（勾著送到下巴前）／null（鬆開、放回原形）。hook：這一段結束時尾尖勾多少
  async function tailTo(box, tgt, ms, onFrame, hook) {
    if (!sp6()) return;
    if (ms == null) ms = tailMs(box, tgt);
    const T0 = box.__trunk || { c: [0, 0, 0], hook: 0, sx: 1 }, c = T0.c.slice(), h0 = T0.hook, h1 = hook == null ? (tgt ? h0 : 0) : hook, sx0 = T0.sx || 1; let sx = sx0;
    const st = (box.__chain || rest())[rest().length - 1].slice();
    const goal = () => { if (!tgt) return TIP6; if (tgt === "mouth") return mouthLocal(box); if (typeof tgt === "function") { const q = tgt(); return toLocal(box, q[0], q[1]); } const r = tgt.getBoundingClientRect(); return toLocal(box, r.left + r.width / 2, r.top + r.height * .62); };
    const toMouth = tgt === "mouth" || typeof tgt === "function";   // 送到嘴前（走身體下方的弧線）
    let tl = performance.now();
    const put = hk => { TS = sx; const P = trunk(c, hk); box.__trunk = { c: c.slice(), hook: hk, sx }; applyChain(box, P); if (onFrame) onFrame(); };
    const grow = (T, f) => { TS = sx; const P = trunk(c, box.__trunk ? box.__trunk.hook : h0), tip = P[P.length - 1], r = Math.hypot(tip[0] - T[0], tip[1] - T[1]);   // 送到嘴前：還差一點就伸長一點；其他時候慢慢縮回原長
      if (toMouth && r > .8) sx = Math.min(1.3, sx + .006 * f); else if (!toMouth) sx += (1 - sx) * Math.min(1, .08 * f); };
    if (!tgt) {   // 放回原形：參數直接緩緩歸零（尾尖的勾先鬆、整條再放下）
      await tween(ms, (e, k) => { const u = ssT(k / .8), w = ssT((k - .15) / .85); for (let i = 0; i < 3; i++) c[i] = T0.c[i] * (1 - w); sx = sx0 + (1 - sx0) * w; put(h0 * (1 - u)); });
      TS = 1;
      box.__trunk = null; resetField(box); box.__chain = null; return;
    }
    await tween(ms, (e, k) => {
      const g = goal(), cc = toMouth ? [(st[0] + g[0]) / 2, Math.max(st[1], g[1]) + 26] : [(st[0] + g[0]) / 2, Math.min(st[1], g[1]) - 16];
      const u = 1 - e, T = [u * u * st[0] + 2 * u * e * cc[0] + e * e * g[0], u * u * st[1] + 2 * u * e * cc[1] + e * e * g[1]];
      const hk = h0 + (h1 - h0) * ssT((k - .55) / .45);   // 快到的時候尾尖才捲起來
      const prev = c.slice(), now = performance.now(), f = Math.min(3, Math.max(.25, (now - tl) / 16.7)); tl = now;
      TS = sx; trunkSolve(c, hk, T, 6); limitTip(prev, c, hk, 3.2 * f); if (k > .6) grow(T, f);
      put(hk);
    });
    for (let fr = 0; fr < (toMouth ? 45 : 20); fr++) {   // 限速可能讓尾尖晚一點到：多跟幾格（送到嘴前：一邊伸長一邊跟）
      const g = goal(), P = box.__chain, tip = P[P.length - 1]; if (Math.hypot(tip[0] - g[0], tip[1] - g[1]) < 1) break;
      const prev = c.slice(); TS = sx; trunkSolve(c, h1, g, 6); limitTip(prev, c, h1, 3.2); grow(g, 1);
      put(h1); await new Promise(r => requestAnimationFrame(r));
    }
  }
  // 走路的變數寫在角色自己的容器（#petEmoji）上：寫在 .ps-box 會讓整個舞台（風景、粒子）每一格都重算樣式——
  // 實測 4 倍降速時狐狸掉到 27fps。位置（--wx）、轉身（--face）影子和道具也要用，留在 .ps-box
  const BOXV = new Set(["--wx", "--wy", "--face"]);
  // 效能：走路時每一格的值直接寫到「會動的那幾個元素」的 style 上（不用繼承的 CSS 變數）——
  // 改繼承變數會讓整個角色的所有子元素都重算樣式（34 KB 的 SVG，4 倍降速時一格要 30ms 以上）。
  // set() 先把值收進 box.__gv，pose() 結尾一次寫到元素上；位置（--wx）也直接寫到角色、影子、道具。
  const set = (box, k, v) => { if (BOXV.has(k)) { box.style.setProperty(k, v); return; } (box.__gv || (box.__gv = {}))[k] = v; };
  const ELS = new WeakMap();
  function els(box) {
    let o = ELS.get(box); const em = box.querySelector("#petEmoji");
    if (o && o.em === em) return o;
    const q = sel => em ? em.querySelector(sel) : null;
    o = { em, critter: q(".pet-critter"), shadow: box.querySelector(".pet-shadow"), prop: q(".pet-prop"),
      body: q(".pc-bob") || q(".pc-hover"), head: em ? em.querySelector(".pr-head") : null, tail: q(".pc-tail"),
      earL: q(".pc-ear.l"), earR: q(".pc-ear.r"),
      fw: em ? [...em.querySelectorAll(".pc-fw")] : [], hw: em ? [...em.querySelectorAll(".pc-hw")] : [],
      pearl: q(".pr-pearl"), sway: em ? [...em.querySelectorAll(".pr-head .pc-sway")] : [],
      pawL: q(".pr-paw.l"), pawR: q(".pr-paw.r"), footL: q(".pr-foot.l"), footR: q(".pr-foot.r"), tailTop: q(".pr-tailtop") };
    ELS.set(box, o); return o;
  }
  function flush(box) {
    if (box.__xtra) Object.assign(box.__gv || (box.__gv = {}), box.__xtra);   // 收步時額外疊上的值（見 goTo 的收步）
    const v = box.__gv; if (!v) return; box.__gv = null;
    const E = els(box), g = k => v[k] || "0px", d = k => v[k] || "0deg", T = (el, t) => { if (el) el.style.transform = t; };
    if (E.body) { E.body.style.animation = "none"; T(E.body, `translate(${g("--gsx")}, ${g("--gby")}) rotate(${d("--gbr")})`); E.body.style.scale = v["--gpre"] && v["--gpre"] !== "0" ? `1.03 .93` : ""; }
    if (stage(box) !== 6) T(E.head, `translate(${g("--ghx")}, ${g("--ghy")}) rotate(${d("--ghr")})`);   // 神龍的頭只由繩波寫（2026-10-07：游的時候兩邊都寫，這裡把頭的波動蓋掉了）
    if (E.tail) { E.tail.style.animation = "none"; T(E.tail, `rotate(${d("--gtr")})`); }
    if (E.earL) { E.earL.style.animation = "none"; T(E.earL, `rotate(${d("--gear")})`); }
    if (E.earR) { E.earR.style.animation = "none"; T(E.earR, `rotate(calc(${d("--gear")} * -1))`); }
    T(E.pawL, `translate(${g("--pLx")}, ${g("--pLy")}) rotate(${d("--pLr")})`); T(E.pawR, `translate(${g("--pRx")}, ${g("--pRy")}) rotate(${d("--pRr")})`);
    T(E.footL, `translate(${g("--hLx")}, ${g("--hLy")})`); T(E.footR, `translate(${g("--hRx")}, ${g("--hRy")})`);
  }
  // y＝前後（深度）：果實落在比較靠鏡頭的地方（畫面上比較低）時，往前站一點點，腳底線跟果實在同一個深度
  function moveTo(box, x, y) {   // 位置直接寫到角色、影子、幼龍的雲（不用 .ps-box 上的變數，免得整個舞台每格重算）
    const E = els(box), px = x.toFixed(2) + "px", py = (y == null ? curY(box) : y).toFixed(2) + "px";
    if (E.critter) E.critter.style.translate = `${px} ${py}`;
    if (E.shadow) E.shadow.style.translate = `${px} ${stage(box) === 2 ? "0px" : py}`;   // 蝶在飛：影子留在地上（降落時腳尖才碰到影子那條線）
    if (E.prop && +box.dataset.stage === 5) E.prop.style.translate = `calc(-50% + ${px}) ${py}`;
    if (+box.dataset.stage === 6) cloudTick(box, x);
    box.__wx = x; if (y != null) box.__wy = y;
  }
  const curY = box => (box.__wy != null && box.classList.contains("walking") ? box.__wy : parseFloat(box.style.getPropertyValue("--wy")) || 0);
  const GAITV = ["--ghx", "--gby", "--gbr", "--gs", "--gsx", "--gpre", "--ghy", "--ghr", "--gtr", "--gear", "--gwave", "--pLx", "--pLy", "--pLr", "--pRx", "--pRy", "--pRr", "--hLx", "--hLy", "--hRx", "--hRy", "--wf", "--wh"];
  const clearGait = box => {
    const em = box.querySelector("#petEmoji"); if (em) GAITV.forEach(k => em.style.removeProperty(k));
    box.__gv = null; const E = ELS.get(box); if (!E) return;
    [E.body, stage(box) === 6 ? null : E.head, E.tail, E.earL, E.earR, E.pawL, E.pawR, E.footL, E.footR, stage(box) === 6 ? null : E.pearl, ...(stage(box) === 6 ? [] : E.sway)].forEach(el => {   /* 神龍的頭、龍珠、龍鬚由繩波寫，不清（不然有一格回到原位） */ if (el) { el.style.transform = ""; el.style.animation = ""; el.style.scale = ""; } });
  };
  // 角色的版面寬度（px）：用 clientWidth，不能用 getBoundingClientRect——轉身（rotateY）時畫面上的寬度會變窄，步幅就會算錯
  // 1 個 SVG 單位＝幾 px（主角的畫布四周有留白，viewBox 不一定是 200 寬）；svgY：圖上的 y → 畫面 y
  // 2026-10-07 優化輪：快取（讀 clientWidth 會逼瀏覽器在這一格中間重新排版——神龍的繩波每格都讀，profiler 上是最大的一項）；尺寸真的變了 ResizeObserver 才清掉
  const PXU = new WeakMap(), PXRO = typeof ResizeObserver === "function" ? new ResizeObserver(es => es.forEach(e => PXU.delete(e.target))) : null;
  const pxu = box => {
    const c = box.querySelector("#petEmoji .pet-critter"); if (!c) return .84;
    let v = PXU.get(c); if (v) return v;
    const w = (c.viewBox && c.viewBox.baseVal && c.viewBox.baseVal.width) || 200, cw = c.clientWidth || c.getBoundingClientRect().width;
    v = (cw || 168) / w; if (cw && PXRO) { PXU.set(c, v); PXRO.observe(c); } return v;
  };
  const svgY = (c, r, y) => { const vb = c.viewBox && c.viewBox.baseVal; return vb && vb.height ? r.top + (y - vb.y) / vb.height * r.height : r.top + r.height * y / 200; };
  const critterPx = box => { const c = box.querySelector("#petEmoji .pet-critter"); return c ? (c.clientWidth || c.getBoundingClientRect().width || 168) : 168; };
  // 每條腿的長度（髖→膝、膝→腳掌著地點），從骨架讀一次記起來
  function pose(box, g, p, s, dir) {   // p＝步伐相位（可以超過 1）、s＝走路的程度 0..1（起步／停下時漸變）、dir＝±1
    const TAU = Math.PI * 2, f = x => (x % 1 + 1) % 1, u = (1 / pxu(box));
    const contact = .5 + .5 * Math.cos(TAU * 2 * p);                      // 1＝著地下沉、0＝抬高（每週期兩次）
    let by = (g.bob || 0) * contact * s, br = (g.roll || 0) * Math.sin(TAU * p) * s;
    // 腳：兩組相差半拍（四足的前後各一組也錯開 1/4，形成背上往前傳的起伏）
    const leg = (off, lift) => {
      // 支撐期身體走 D*duty，腳要往後退一樣多（在畫面上）。腳在角色座標裡移 1 單位、畫面上實際移多少 px，
      // 每次起步時量一次（轉身、透視、縮放都算進去了）：box.__k
      const ph = f(p + off), duty = g.duty || .6, S = (g.D * duty) / (box.__k || 1 / u);
      if (ph < duty) { const k = ph / duty; return { x: dir * S * (.5 - k) * s, y: 0, r: -dir * 6 * (.5 - k) * s }; }
      const k = (ph - duty) / (1 - duty), e = k * k * (3 - 2 * k);
      return { x: dir * S * (-.5 + e) * s, y: -(lift || g.lift || 6) * Math.sin(Math.PI * k) * s, r: dir * 10 * Math.sin(Math.PI * k) * s };
    };
    let L = leg(0), R = leg(.5), HL = leg(.25), HR = leg(.75);
    if (g.mode === "waddle") {   // 兩隻腳走路：腳交替踩（差半拍），手臂反向擺（左腳往前時右手往前）
      HL = leg(0); HR = leg(.5);
      const sw = 14 * s; L = { x: 0, y: 0, r: -sw * Math.sin(TAU * p) }; R = { x: 0, y: 0, r: -sw * Math.sin(TAU * p) };
    }
    set(box, "--pLx", L.x.toFixed(2) + "px"); set(box, "--pLy", L.y.toFixed(2) + "px"); set(box, "--pLr", L.r.toFixed(1) + "deg");
    set(box, "--pRx", R.x.toFixed(2) + "px"); set(box, "--pRy", R.y.toFixed(2) + "px"); set(box, "--pRr", R.r.toFixed(1) + "deg");
    set(box, "--hLx", HL.x.toFixed(2) + "px"); set(box, "--hLy", HL.y.toFixed(2) + "px");
    set(box, "--hRx", HR.x.toFixed(2) + "px"); set(box, "--hRy", HR.y.toFixed(2) + "px");
    // 頭：比身體晚一點才下沉；虎的頭反向補償（保持水平）
    const lag = .5 + .5 * Math.cos(TAU * 2 * (p - .07));
    if (g.mode !== "swim") set(box, "--ghy", ((g.head || 0) * lag * s).toFixed(2) + "px");   // 神龍的頭跟著繩波（ropeRender）
    set(box, "--ghr", (dir * 1.5 * Math.sin(TAU * (p - .1)) * s).toFixed(2) + "deg");
    // 尾巴反向擺、耳朵晚一點彈
    set(box, "--gtr", ((g.tail || 0) * Math.sin(TAU * (p + .25)) * s).toFixed(2) + "deg");
    set(box, "--gear", ((g.ear || 0) * Math.cos(TAU * 2 * (p - .12)) * s).toFixed(2) + "deg");
    // 各種走法的身體
    if (g.mode === "rock") { br = dir * 4 * s + (g.roll) * Math.sin(TAU * p) * s; by = (g.bob) * Math.abs(Math.sin(TAU * p)) * s; }
    if (g.mode === "fly") {   // 一拍一升：翅膀往下拍（收→張）時身體上升、往上收時落下；後翅晚一點跟上
      // 2026-10-06 第四輪：一個步幅拍一下（以前兩下＝每秒 7.4 下，30fps 一下只有四格，翅膀一格跳 0.16，看起來在抖）
      by = -(g.bob) * (.5 - .5 * Math.cos(2 * Math.PI * p)) * s; br = dir * (g.bank) * s;   // 起伏用平滑的波（|sin| 在谷底是尖的，身體一格反向、嘴跳一下）
      box.__wfly = [.7 + .3 * Math.abs(Math.sin(Math.PI * p)), .7 + .3 * Math.abs(Math.sin(Math.PI * (p - .06)))];   // 翅膀由 wings() 寫（同一個控制器，角度連續）
      if (!box.__wing || box.__wing.mode !== "fly") wingMode(box, "fly", 200);   // 第一次有飛行的拍子才交給飛行（以前起步就交，還沒有拍子時先用平常的搧法，下一格一跳）
      wingRender(box);   // 跟身體同一格寫（不等翅膀自己的迴圈，晚一格會看起來一頓一跳）
    }
    if (g.mode === "crawl") { set(box, "--gwave", f(p).toFixed(3)); by = 0; }
    if (g.mode === "swim") { set(box, "--gwave", f(p).toFixed(3)); br = (g.roll) * Math.sin(TAU * p) * s; by = (g.bob) * Math.sin(TAU * p) * s; }
    if (g.mode === "waddle") {
      br = (g.roll) * Math.sin(TAU * p) * s;
      const sr = Math.sin(br * Math.PI / 180) * 18;   // 腳離身體中心 ±18：身體繞腳底中間轉 br 度，左腳上去多少、右腳下去多少
      set(box, "--hLy", (HL.y - by + sr).toFixed(2) + "px"); set(box, "--hRy", (HR.y - by - sr).toFixed(2) + "px");
    }
    set(box, "--gby", by.toFixed(2) + "px"); set(box, "--gbr", br.toFixed(2) + "deg"); set(box, "--gs", s.toFixed(3));
    flush(box);
  }
  function stage(box) { return +box.dataset.stage || 0; }
  // 量「腳在角色座標裡移 20 單位，畫面上移幾 px」（同一格量完還原，不會閃）
  function calib(box) {
    const el = box.querySelector("#petEmoji .pr-foot.l") || box.querySelector("#petEmoji .pr-paw.l"); if (!el) return 0;
    const isFoot = el.classList.contains("pr-foot"), kx = isFoot ? "--hLx" : "--pLx", ky = isFoot ? "--hLy" : "--pLy";
    const ox = box.style.getPropertyValue(kx), oy = box.style.getPropertyValue(ky);
    box.classList.add("no-tr"); set(box, ky, "0px");
    set(box, kx, "0px"); void el.getBoundingClientRect(); const a = el.getBoundingClientRect().left;
    set(box, kx, "20px"); const b = el.getBoundingClientRect().left;
    set(box, kx, ox || "0px"); set(box, ky, oy || "0px"); box.classList.remove("no-tr");
    const k = Math.abs(b - a) / 20; return k > .2 && k < 5 ? k : 0;
  }
  function curX(box) { return box.classList.contains("walking") && box.__wx != null ? box.__wx : (parseFloat(box.style.getPropertyValue("--wx")) || 0); }
  // 轉身（3/4 側面）：dir＝-1 往左、1 往右、0 轉回正面
  async function face(box, dir, ms) {
    const from = parseFloat(box.style.getPropertyValue("--face")) || 0, to = dir * 24, t0 = performance.now(), D = ms || 260;
    await new Promise(res => { const step = () => { const t = performance.now(); const k = Math.min(1, (t - t0) / D), e = k * k * (3 - 2 * k); set(box, "--face", (from + (to - from) * e).toFixed(2) + "deg"); if (k < 1) raf = requestAnimationFrame(step); else res(); }; raf = requestAnimationFrame(step); });
  }
  // ── 幼蟲掉頭：身體一節一節往頭後面收（像轉向鏡頭：只看到頭、身體藏在後面），頭不動，換邊，再一節一節伸出去 ──
  // 畫面上：頭留在原地、身體從頭的一邊繞到另一邊（不是整條瞬間鏡像，也不會壓成紙片——最窄的時候是頭朝著你）
  const lvFace = box => (box.classList.contains("lv-l") ? -1 : 1);
  const LV_HEAD = 148;   // 幼蟲頭的中心（圖上的 x）
  // ── 幼蟲掉頭（2026-10-06 改真的 U 型迴轉）：把身體當成走在地面上的一條路——頸部往鏡頭方向繞半圈（半徑 LV_R），
  // 身體每一點都走頸部走過的路（毛毛蟲轉向：頭前段先抬起探向一邊，身體再沿著頭的路線跟過去）。地面的深度 Z 投影到畫面＝往下移（越近越低），
  // 所以繞過來的那段在下面、看得出是在地上繞。以前：身體縮成一團躲到頭後面、再從另一邊伸出來（像伸縮管）。
  // 轉完剛好等於「鏡像、朝另一邊」的樣子：換成 .lv-l、角色平移一點、深度往前一點（下一次往後繞，不會一直往前）
  let LSP = null; const lsp = () => LSP || (LSP = typeof PET_ART !== "undefined" && PET_ART.larvaSpine ? PET_ART.larvaSpine(16) : [{ x: 44, y: 166 }, { x: 134, y: 146 }]);
  const spY = u => { const S = lsp(); if (u <= S[0].x) return S[0].y; for (let i = 1; i < S.length; i++) if (u <= S[i].x) { const a = S[i - 1], b = S[i], t = (u - a.x) / (b.x - a.x); return a.y + (b.y - a.y) * t; } return S[S.length - 1].y; };
  const LV_NECK = 146, LV_R = 22, LV_KZ = .5, LV_BODY = 122;
  async function larvaTurn(box, dir) {
    const f = lvFace(box); if (f === dir) return;
    box.classList.add("walking"); box.dataset.walk = "turn";   /* 掉頭（不是拱身走） */
    const x0 = curX(box), y0 = curY(box), sz = y0 > 1 ? -1 : 1, PR = Math.PI * LV_R, Lend = PR + LV_BODY;   // 已經比較前面了就往後繞
    const path = s => (s <= 0 ? [s, 0] : s <= PR ? [LV_R * Math.sin(s / LV_R), LV_R * (1 - Math.cos(s / LV_R))] : [-(s - PR), 2 * LV_R]);
    const F = L => (x, y) => { const u = Math.max(24, Math.min(176, x)), v = y - spY(u), [dx, z] = path(L - (LV_NECK - u)); return [LV_NECK + dx, spY(u) + v + sz * z * LV_KZ]; };
    await tween(Lend / 72 * 1000, e => {
      const L = Lend * e, G = F(L); lvPose(box, G, u => sz * path(L - (LV_NECK - u))[1]);   // 近的那節（Z 大）畫在上面
      const nk = G(LV_NECK, 150), lift = -6 * Math.sin(Math.PI * Math.min(1, L / PR));   // 頭前段先抬起、探過去，繞過來再放下
      set(box, "--ghx", (nk[0] - LV_NECK).toFixed(2) + "px"); set(box, "--ghy", (nk[1] - 150 + lift).toFixed(2) + "px"); flush(box);
    });
    const pu = pxu(box), wx = x0 + f * pu * (2 * LV_NECK - LV_BODY - 200), wy = y0 + sz * 2 * LV_R * LV_KZ * pu;
    box.classList.toggle("lv-l", dir < 0); lvReset(box); clearGait(box);
    set(box, "--wx", wx + "px"); set(box, "--wy", wy + "px"); box.__wy = null; { const E = els(box); [E.critter, E.shadow, E.prop].forEach(el => { if (el) el.style.translate = ""; }); }
    box.classList.remove("walking"); delete box.dataset.walk;
  }
  // 幼蟲低頭吃：頭往下 ld、往前 lx（跟 CSS .st-lean 移頭的量一樣），身體前段跟著彎（x 從 78 到頭漸增），不會在中間拱出尖角
  async function bend(box, ld, lx, ms, onFrame) {   // onFrame：每寫一格就呼叫（咬住的果實在同一格跟著嘴）
    const [l0, x0] = box.__bend || [0, 0];
    // 頭跟身體同一格一起寫（2026-10-05 第二輪）：頭掛在身體最前端（x≈140 那一節彎了多少，頭就移多少）——
    // 以前頭靠 .st-lean 一下子跳到低頭位置、身體 0.3 秒才彎過去；抬頭時反過來，中間看得到頭離開身體
    // 彎曲集中在 x 86～132（頭底下那一段跟頭一起移；以前從 x 78 到頭慢慢加，頭正下方只彎了 67～94%，低頭時脖子被拉開）
    const K = x => sstep((x - 86) / 46), E = els(box), kh = K(140);
    const fl = box.__lvFlat || 0, hf = fl * lvFlatDy(box, 146);   // 趴平時低頭吃：彎曲疊在趴平的姿勢上
    await tween(ms, e => { const L = l0 + (ld - l0) * e, X = x0 + (lx - x0) * e; lvPose(box, (x, y) => { const k = K(x); return [x + X * k, y + L * k + fl * lvFlatDy(box, x)]; });
      if (E.head) E.head.style.transform = `translate(${(X * kh).toFixed(2)}px, ${(L * kh + hf).toFixed(2)}px)`; if (onFrame) onFrame(); });
    box.__bend = ld || lx ? [ld, lx] : null; if (!box.__bend) lvFlatPose(box, fl);
  }
  // 走到 x（px，相對舞台中間）。回傳 promise。不支援動畫時直接瞬移。
  async function goTo(box, x, opts) {   // opts.keepFace：小碎步調整位置（往後退一點也不轉身）
    opts = opts || {};
    if (!box) return;
    let g = GAIT[stage(box)] || GAIT[3]; const x0 = curX(box), dist = x - x0, dir = Math.sign(dist) || 1;
    const y0 = curY(box), y1 = opts.wy == null ? y0 : opts.wy;
    if (reduce()) { set(box, "--wx", x + "px"); set(box, "--wy", y1 + "px"); return; }
    if (Math.abs(dist) < 3) {   // 左右幾乎不用動、只要往前（深度）挪：原地踏一小步過去
      const vd = g.mode === "fly" ? Math.max(300, Math.abs(y1 - y0) / g.v * 1000 * 1.6) : 300;   // 蝶原地降落／起飛：依高度給時間（以前一律 0.3 秒，降 38px 擠在兩格）
      if (Math.abs(y1 - y0) >= 1.5) await new Promise(res => { const t0 = performance.now(); const step = () => { const now = performance.now(); const k = Math.min(1, (now - t0) / vd), e = k * k * (3 - 2 * k); moveTo(box, x0 + (x - x0) * e, y0 + (y1 - y0) * e); if (k < 1) raf = requestAnimationFrame(step); else res(); }; raf = requestAnimationFrame(step); });
      set(box, "--wx", x + "px"); set(box, "--wy", y1 + "px"); box.__wy = null; const E = els(box); [E.critter, E.shadow, E.prop].forEach(el => { if (el) el.style.translate = ""; }); if (g.mode === "fly") wingMode(box, "idle", 300); return;
    }
    box.classList.add("walking"); box.dataset.walk = g.mode;
    if (g.mode === "fly") box.__wfly = null;
    box.__k = 0;   // 起步後（轉完身）再量
    let rev = false;
    if (g.mode === "rock" && (stage(box) === 3 || stage(box) === 4)) opts = Object.assign({}, opts, { keepFace: true });   // 狐虎：臉一直朝我們（不轉身）
    else if (g.mode === "crawl") {   // 幼蟲：頭在前面爬（以前往左走是尾巴先走）；要換方向先原地掉頭
      if (!opts.keepFace && lvFace(box) !== dir) { box.classList.remove("walking"); await larvaTurn(box, dir); return goTo(box, x, Object.assign({}, opts, { keepFace: true })); }
      rev = lvFace(box) !== dir;   // 小碎步往後退：波從頭傳到尾
      const n = Math.max(1, Math.round(Math.abs(dist) / (g.Du / ((1 / pxu(box))))));   // 整數道波
      g = Object.assign({}, g, { D: Math.abs(dist) / n });
    }
    else if (!opts.keepFace && g.mode !== "fly" && g.mode !== "swim") await face(box, dir);   // 神龍也不轉身（2026-10-07：平面的身體一轉，尾巴往內縮再往外甩，看起來像抽動；方向由繩波表現）   // 蝶不轉身（正面對稱、靠身體內傾表示方向）：rotateY 會讓量口器位置的 getScreenCTM 不準
    // 預備：往下蹲、往後縮一點
    if (!opts.keepFace && g.mode !== "crawl" && g.mode !== "swim") { set(box, "--gpre", "1"); await sleep(150); set(box, "--gpre", "0"); }   // 神龍浮著不用預備（2026-10-07 使用者：起步往前抖一下）   // 小碎步不用預備；幼蟲的預備就是第一道波
    box.__k = g.mode === "crawl" ? 0 : calib(box);
    const arc = g.mode === "fly" ? Math.max(24, Math.min(46, Math.abs(dist) * .5)) : 0;   // 蝶：一段一段「跳」過去——高高的拋物線（2026-10-06 第五輪：以前 ≤28 像貼著地面滑）
    const Lp = g.mode === "fly" ? Math.hypot(Math.abs(dist), Math.abs(y1 - y0)) + arc * 1.6 : Math.abs(dist);   // 蝶按「真的飛過的路」推進（水平近、垂直遠時以前會兩格就掉到底）
    const ramp = Math.min(Lp * .35, 26);   // 起步／停下的緩衝距離
    if (g.mode === "crawl" && (box.__lvFlat || 0) < .99) { const Du0 = g.D * (1 / pxu(box)), f0 = box.__lvFlat || 0; await tween(340 * (1 - f0), e => { box.__lvFlat = f0 + (1 - f0) * e; crawlField(box, 0, 1, Du0, rev); flush(box); }); }   // 先整隻趴平（2026-10-07 第六輪）
    let p = 0, t = performance.now(), done = 0, lastS = .15;
    await new Promise(res => {
      const step = () => { const now = performance.now();
        const dt = Math.min(.05, (now - t) / 1000); t = now;
        const left = Lp - done;
        const ease = Math.min(1, (done + 2) / ramp, (left + 2) / ramp);   // 起步加速、快到時減速
        const fr = p - Math.floor(p), m = g.mode === "crawl" ? 1.2 * (.45 + 1.1 * Math.sin(2 * Math.PI * fr) ** 2) : 1;   /* 尺蠖：拖尾、伸頭兩段之間各停一下 */   // 2026-10-06 第四輪：幼蟲一道波一道波地走——波在尾巴起頭、到頭收尾時慢下來（兩道波之間像停一下），波走到身體中段最快；乘 1.2 讓一道波花的時間不變（∫dp/m＝1/√(.45×1.55)≈1.2）。踩住的腳不會滑：每一節的位移本來就是用 p 算的
        const v = g.v * m * (.25 + .75 * ease), ds = Math.min(left, v * dt);
        done += ds; p += ds / g.D * (Math.abs(dist) / Lp);
        const kk = Math.min(1, done / Lp);
        moveTo(box, x0 + dir * Math.abs(dist) * (g.mode === "fly" ? kk * kk * (3 - 2 * kk) : kk), y0 + (y1 - y0) * (g.mode === "fly" ? kk * kk * (3 - 2 * kk) : kk) - arc * Math.sin(Math.PI * kk));
        lastS = Math.max(.15, ease); pose(box, g, p, lastS, dir);
        if (g.mode === "crawl") { crawlField(box, Math.min(.99999, p - Math.floor(p)) , 1, g.D * (1 / pxu(box)), rev); flush(box); }   // 波的高度不跟著加減速縮（每一節的位移要剛好抵掉身體的移動，腳才不滑）
        if (left - ds > .2) raf = requestAnimationFrame(step); else res();
      };
      raf = requestAnimationFrame(step);
    });
    moveTo(box, x, y1);   // 停在剛好的位置（迴圈在差 0.2px 內就停）
    // 收步：身體往前多衝一點再回來（彈簧），腳收回、尾巴再擺一下（幼蟲沒有：最後一道波結束身體就是平的）
    const p1 = p, t1 = performance.now();
    if (g.mode !== "crawl") await new Promise(res => {
      const step = () => { const now = performance.now();
        const k = Math.min(1, (now - t1) / (opts.keepFace && g.mode !== "swim" ? 160 : 320)), s = (1 - k);   // 神龍至少 0.32 秒：雲座晚 0.25 秒才跟到
        if (g.mode === "swim") cloudTick(box, x);   // 雲座趕上來（身體的繩波由 rope() 一直畫）
        // 往前多衝一點再回來、尾巴再擺一下：交給 pose() 一起寫（以前 pose() 寫完再 flush 一次，那一次其他值都是空的——站姿的腿和下沉、幼龍的腳都被歸零，頭也跟著跳）
        box.__xtra = { "--gsx": ((g.mode === "swim" ? 0 : 1) * dir * 5 * Math.sin(k * Math.PI * 1.6) * (1 - k)).toFixed(2) + "px",   /* 神龍不往前衝再彈回（停下往後抖一下） */ "--gtr": ((g.tail || 0) * 1.2 * Math.sin(k * Math.PI * 2.4) * (1 - k)).toFixed(2) + "deg" };
        pose(box, g, p1 + k * .25, s * Math.min(.6, lastS), dir);   // 從走路最後的幅度接著收（以前一律從 0.6 開始，停下那一格步伐突然變大）
        box.__xtra = null;
        if (k < 1) raf = requestAnimationFrame(step); else res();
      };
      raf = requestAnimationFrame(step);
    });
    if (g.mode === "swim") resetField(box);
    if (g.mode === "crawl" && !opts.stayFlat) { const Du0 = g.D * (1 / pxu(box)); await tween(340, e => { box.__lvFlat = 1 - e; crawlField(box, .99999, 1, Du0, rev); flush(box); }); box.__lvFlat = null; lvReset(box); }
    else if (g.mode === "crawl") box.__lvFlat = 1;   // 要接著吃：保持趴平   // 走完再抬起前半身
    if (g.mode === "swim") { box.__trail = null; box.__hys = null; box.__cloud = x; ride(box); }
    set(box, "--wx", x + "px"); set(box, "--wy", y1 + "px"); box.__wy = null; { const E = els(box); [E.critter, E.shadow, E.prop].forEach(el => { if (el) el.style.translate = ""; }); }
    clearGait(box);   // 走完就清掉（站著吃東西時脖子角度由 pet-stage.js 寫在 .ps-box，不能被這裡的舊值蓋掉）
    if (g.mode === "crawl" && box.__lvFlat) lvFlatPose(box, box.__lvFlat);   // clearGait 把頭清掉了：趴著的話放回去
    box.classList.remove("walking"); delete box.dataset.walk;
    if (g.mode === "fly") wingMode(box, "idle", 300);   // 蝶：飛完翅膀回到平常的搧法
  }
  // 讓「嘴」對準果實：量嘴相對角色中心的位置（已經轉向那一側），走到嘴在果實正上方
  // 朝向＝前進的方向（以前先面向果實、goTo 再面向前進方向，果實在「身體中心和嘴之間」時會左右翻來翻去）
  async function goEat(box, berryEl, berryX) {
    const em = box.querySelector("#petEmoji"); if (!em) return;
    const g = GAIT[stage(box)] || {}, cur = curX(box), st = stage(box);
    // 嘴的位置要用「低頭吃」的姿勢量（低頭時頭會往前／往下移）：同一格套上姿勢、量完拿掉，畫面不會閃
    const old = box.style.getPropertyValue("--ex");
    box.classList.add("no-tr"); box.style.setProperty("--ex", "0"); em.classList.add("st-lean"); void em.offsetWidth;
    const c = em.querySelector(".pet-critter").getBoundingClientRect(), m = (part(box, ".pr-mouth") || part(box, ".pr-head") || em).getBoundingClientRect();
    em.classList.remove("st-lean"); box.style.setProperty("--ex", old || "0"); void em.offsetWidth; box.classList.remove("no-tr");
    let mouthDx = (m.left + m.width / 2) - (c.left + c.width / 2);   // 嘴在角色中心左右多少 px
    const side = Math.sign(berryX - cur) || 1;
    if (st === 1) {   // 幼蟲：嘴（頭）先決定要不要掉頭，掉頭時頭不動；然後往頭的方向爬到嘴在果實上
      const f = lvFace(box), mo = Math.abs(mouthDx), hx = cur + f * mo, need = Math.sign(berryX - hx) || f;
      if (need !== f && Math.abs(berryX - hx) > 60) { await lvRise(box); await larvaTurn(box, need); }   // 果實只在嘴後面一點點：倒退幾步就好（掉頭要繞一整圈，2026-10-06）
      await goTo(box, Math.round(berryX - lvFace(box) * mo), { keepFace: true, stayFlat: true });   // 走到了就趴著直接吃
      return;
    }
    if (st === 2) {   // 蝶：落在果實旁邊約 50px（2026-10-05 第二輪從 30 拉開：果實常被後翅蓋住，看不出在吸哪一顆）（口器斜斜伸過去吸），腳尖（圖上 y≈160）剛好踩在果實的那條地面線上
      const tipY = svgY(em.querySelector(".pet-critter"), c, 160);
      if (!box.__wing || box.__wing.mode !== "flap") { wingMode(box, "flap", 160); await sleep(160 + 2 * 340); }   // 先在原地拍兩下才騰空（2026-10-06 第五輪）
      await goTo(box, Math.round(berryX - side * 50), { wy: Math.round((curY(box) + groundY(berryEl) - tipY) * 10) / 10 });
      return;
    }
    if (st === 5) mouthDx = 0;   // 幼龍（2026-10-06）：走到果實在兩腳正前方，蹲下用雙手捧起來
    const tx = Math.round(berryX - mouthDx);
    if (Math.abs(tx - cur) >= 3) await face(box, Math.sign(tx - cur), 200);
    await goTo(box, tx);
  }
  // 果實那一條地面線（畫面座標）：用版面位置算，不受果實落下／旋轉的動畫影響
  function groundY(b) { const ar = b.offsetParent.getBoundingClientRect(); return ar.top + b.offsetTop + b.offsetHeight; }
  // ── 狐、虎正面趴著吃（2026-10-06 第五輪，使用者：「不要側身走，臉都朝向我們，趴著吃，果實控制在他面前，盡量不要移動」）──
  // e：0＝坐著、1＝趴下。整隻往下沉、坐著的臀部壓扁攤開（側躺在地上的後半身）、兩隻前腿往鏡頭伸（變短＝透視、腳掌往前落），後腳往外攤
  function frontLieSet(box, e) {   // 2026-10-07 優化輪 #7：分段——前腳先往前伸（0～.6）、身體再壓低（.2～.9）、後半身最後攤開（.35～1）
    const E = els(box), em = E.em; if (!em) return;
    const sb = em.querySelector(".pc-bob > .pc-sb"), ft = em.querySelector(".pc-bob > .pr-foot.r");
    const eL = sstep(e / .6), eB = sstep((e - .2) / .7), eH = sstep((e - .35) / .65);
    if (E.body) { E.body.style.animation = e ? "none" : ""; E.body.style.transform = e ? `translate(0px, ${(9 * eB).toFixed(2)}px)` : ""; }
    if (sb) { sb.style.transformBox = "view-box"; sb.style.transformOrigin = "100px 196px"; sb.style.transform = e ? `scale(${(1 + .1 * eH).toFixed(3)}, ${(1 - .5 * eH).toFixed(3)})` : ""; }
    [E.pawL, E.pawR].forEach((pw, i) => { if (!pw) return; pw.style.transition = e ? "none" : ""; pw.style.transform = e ? `translate(${((i ? 1 : -1) * 3 * eL).toFixed(2)}px, ${(12 * eL).toFixed(2)}px) scale(${(1 + .14 * eL).toFixed(3)}, ${(1 - .5 * eL).toFixed(3)})` : ""; });   // 前腿往鏡頭伸：變短（透視）、腳掌往前落、略變大
    if (ft) ft.style.transform = e ? `translate(${(4 * eH).toFixed(2)}px, ${(2 * eH).toFixed(2)}px)` : "";
    const lf = em.querySelector(".pc-bob > .pr-loaf"); if (lf) lf.style.opacity = Math.max(0, Math.min(1, (eB - .2) / .6)).toFixed(3);   // 趴著的身體（同色，淡入看不出重影）
    box.__lie = eB; frontHeadSet(box, box.__fh || null);   // 頭跟著身體一起放低
  }
  // 吃完一顆、下一顆之前：尾巴輕甩一下（不然三顆之間看起來很機械）
  function tailFlick(box) { const E = els(box); if (!E.tail || !E.tail.animate) return; const o = stage(box) === 4 ? "136px 186px" : "124px 172px";
    E.tail.animate([{ transformBox: "view-box", transformOrigin: o, transform: "rotate(0deg)" }, { transformBox: "view-box", transformOrigin: o, transform: "rotate(9deg)", offset: .35 }, { transformBox: "view-box", transformOrigin: o, transform: "rotate(-5deg)", offset: .7 }, { transformBox: "view-box", transformOrigin: o, transform: "rotate(0deg)" }], { duration: 560, easing: "ease-in-out" }); }
  const frontLie = (box, e1, ms) => { const e0 = box.__lie || 0; return tween(ms || 700, e => frontLieSet(box, e0 + (e1 - e0) * e)); };
  // 趴著時頭的姿勢：往下（低頭）、往左右（轉向那一顆）、微微轉、靠近鏡頭一點（變大）
  function frontHeadSet(box, h) {   // h＝相對「趴著時頭的位置」（趴下時頭本來就放低 16）
    const E = els(box); if (!E.head) return; E.head.style.transition = "none"; const L = (stage(box) === 4 ? 24 : 21) * (box.__lie || 0), q = h || [0, 0, 0];   // 趴下時頭放低到下巴靠在胸口上（第六輪：以前 16，頭懸空）
    E.head.style.transform = h || L ? `translate(${q[0].toFixed(2)}px, ${(q[1] + L).toFixed(2)}px) rotate(${q[2].toFixed(2)}deg) scale(${(1 + .07 * Math.max(0, Math.min(1, q[1] / 40))).toFixed(3)})` : ""; box.__fh = h;
  }
  // 嘴要碰到果實上緣（biteY）：同一格套上姿勢量、量完還原，回傳頭的姿勢 [dx, dy, rot]
  function frontHeadSolve(box, b, biteY) {
    const prev = box.__fh || null, u = 1 / pxu(box); let h = [0, 0, 0];
    for (let it = 0; it < 4; it++) { frontHeadSet(box, h); const m = cpt(box, "mouth"), r = b.getBoundingClientRect(); const ex = (r.left + r.width / 2 - m[0]) * u, ey = (r.top + r.height * biteY - m[1]) * u; h = [h[0] + ex, h[1] + ey, -(h[0] + ex) * .35]; }
    frontHeadSet(box, prev); return h;
  }
  const frontHead = (box, h1, ms) => { const h0 = box.__fh || [0, 0, 0], H = h1 || [0, 0, 0]; return tween(ms, e => frontHeadSet(box, h0.map((v, i) => v + (H[i] - v) * e))).then(() => { if (!h1) frontHeadSet(box, null); }); };
  // 所有逐格動畫都用 performance.now() 算進度，不用 requestAnimationFrame 給的時間戳記（兩者不保證同一個時鐘：Chrome 虛擬時間差了 25 秒、補間卡在起點）
  const tween = (ms, fn) => new Promise(res => { const t0 = performance.now(); const step = () => { const now = performance.now(); const k = Math.min(1, (now - t0) / ms); fn(k * k * (3 - 2 * k), k); if (k < 1) raf = requestAnimationFrame(step); else res(); }; raf = requestAnimationFrame(step); });
  async function home(box) {
    if (!box) return;
    // 幼蟲：離家不遠就倒退爬回去（收縮波從頭傳到尾，真的毛毛蟲也會），不用為了回中間掉頭
    const back = stage(box) === 1 && Math.sign(0 - curX(box)) === -lvFace(box) && Math.abs(curX(box)) <= 100;
    await goTo(box, 0, { wy: 0, keepFace: back }); if (stage(box) === 1) await lvRise(box); await face(box, 0, 300);
  }
  function stop(box) { cancelAnimationFrame(raf); if (box) { if (box.__lvFlat) { box.__lvFlat = null; lvFlatPose(box, 0); } if (stage(box) === 2) wingMode(box, "idle", 300); box.classList.remove("walking"); ["--wx", "--wy", "--face"].forEach(k => box.style.removeProperty(k)); clearGait(box); } }
  // 接觸點的畫面座標：mouth＝嘴（.pr-mouth 的支點，跟著頭的所有變換）；其他＝pet-art.js 畫的 .cp-*（手掌、尾尖、裂紋）
  function cpt(box, name) {
    const em = box.querySelector("#petEmoji"); if (!em) return null;
    if (name === "palms") { const a = cpt(box, "palm-l"), b = cpt(box, "palm-r"); return a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : a || b; }   // 幼龍雙手捧著：兩個手掌的中點
    let el = name === "mouth" ? part(box, ".pr-mouth") : em.querySelector(".cp-" + name); if (!el || !el.getScreenCTM) return null;
    const M = el.getScreenCTM(); if (!M) return null;
    const x = name === "mouth" ? parseFloat(el.style.getPropertyValue("--ox")) : +el.getAttribute("cx"), y = name === "mouth" ? parseFloat(el.style.getPropertyValue("--oy")) : +el.getAttribute("cy");
    const q = new DOMPoint(x, y).matrixTransform(M); return [q.x, q.y];
  }
  const part = (box, sel) => { const em = box.querySelector("#petEmoji"); return em ? em.querySelector(sel) : null; };
  return { tailFlick, lvHeadFlat: box => (box.__lvFlat || 0) * lvFlatDy(box, 146), rope, wings, wingMode, tailMs, frontLie, frontHead, frontHeadSolve, pxu, svgY, tween, goTo, goEat, home, face, stop, larvaTurn, bend, part, groundY, cpt, tailTo, tailReach, GAIT, _pose: pose, _crawl: (box, ph) => { crawlField(box, ph, 1, 36, false); flush(box); }, _tail: () => ({ I0, BEND, rest: sp6() ? rest() : null }) };   // _pose：測試逐相位檢查用
})();
