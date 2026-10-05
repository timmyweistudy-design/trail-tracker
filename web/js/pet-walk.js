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
    1: { mode: "crawl", v: 40, Du: 22, bob: 0, roll: 0, head: 0 },                         // 幼蟲：蠕動（收縮波從尾巴往頭傳；一道波往前 22 單位）
    2: { mode: "fly", v: 140, D: 38, bob: 9, roll: 0, bank: 9 },                               // 蝶：一拍一升的小弧線、轉彎時內傾
    3: { mode: "stand", v: 150, stride: 34, lift: 11, sink: 3.6, duty: .6, bob: 2.4, tail: 15, ear: 7, neck: 3.5, sh: .7, legL: 58 },             // 狐：小步、輕、有彈性；尾巴大幅、晚一拍
    4: { mode: "stand", v: 115, stride: 36, lift: 12, sink: 5, duty: .68, bob: 3.6, lag: .06, tail: 5, ear: 2, neck: -1.2, sh: 1.6, legL: 56 },  // 虎：慢、步幅大、肩膀隨前腳起伏、落地後才沉（重）；尾巴小幅；頭穩
    5: { mode: "waddle", v: 78, D: 28, bob: 4.5, roll: 7, lift: 11, duty: .56, tail: 12, ear: 6, head: 2.4 },        // 幼龍：短腿搖搖擺擺
    6: { mode: "swim", v: 125, D: 70, bob: 3, roll: 1.5, tail: 8, head: 1.5 },                 // 神龍：在雲上游
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
    g.querySelectorAll("path,ellipse,circle,g[transform]").forEach(el => {
      if (el.tagName === "path") { const d = el.getAttribute("d"); if (d) items.push({ el, d, toks: d.match(TOK) }); }
      else if (el.tagName === "g") { const m = /^translate\(([-\d.]+)[ ,]+([-\d.]+)\)(.*)$/.exec(el.getAttribute("transform")); if (m) items.push({ el, gx: +m[1], gy: +m[2], rest: m[3] }); }
      else if (!el.closest("g[transform]") || el.closest("g[transform]") === g) items.push({ el, cx: +el.getAttribute("cx"), cy: +el.getAttribute("cy") });
    });
    ORIG.set(g, items); return items;
  }
  function applyField(box, F) {
    const items = snapshot(box); if (!items) return;
    const r = v => Math.round(v * 10) / 10;
    for (const it of items) {
      if (it.toks) {
        if (it.el.closest("g[transform]") && it.el.closest("g[transform]") !== box.querySelector("#petEmoji .pr-deform")) continue;   // 在平移群組裡的（爪子）跟著群組走
        let out = "", cmd = "", buf = [];
        const flush = () => { if (!buf.length) return; if ("MLTQSC".includes(cmd)) for (let i = 0; i + 1 < buf.length; i += 2) { const [x, y] = F(buf[i], buf[i + 1]); out += r(x) + " " + r(y) + " "; } else out += buf.join(" ") + " "; buf = []; };
        for (const t of it.toks) { if (/[A-Za-z]/.test(t)) { flush(); cmd = t; out += t; } else buf.push(+t); }
        flush(); it.el.setAttribute("d", out.trim());
      } else if (it.gx != null) { const [x, y] = F(it.gx, it.gy); it.el.setAttribute("transform", `translate(${r(x)} ${r(y)})${it.rest}`); }
      else { const [x, y] = F(it.cx, it.cy); it.el.setAttribute("cx", r(x)); it.el.setAttribute("cy", r(y)); }
    }
  }
  function resetField(box) {
    const g = box.querySelector("#petEmoji .pr-deform"); const items = g && ORIG.get(g); if (!items) return;
    for (const it of items) { if (it.toks) it.el.setAttribute("d", it.d); else if (it.gx != null) it.el.setAttribute("transform", `translate(${it.gx} ${it.gy})${it.rest}`); else { it.el.setAttribute("cx", it.cx); it.el.setAttribute("cy", it.cy); } }
  }
  const hump = (x, c, w) => Math.exp(-Math.pow((x - c) / w, 2));
  const sstep = v => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
  // 幼蟲的蠕動（2026-10-05 重做）：真的鳳蝶幼蟲是一道收縮波從尾巴傳到頭——波經過的那一節抬起來往前移 Du，其他節貼在地上不動。
  // 身體整體（moveTo）是等速往前，所以每一節在身體座標裡：波還沒到 → 往後退（＝在地上不動）、波經過 → 往前跳 Du、波過了 → 又不動。
  // 一趟路切成整數道波，最後一道波結束時每一節剛好回到原位（身體是平的才停）。rev＝倒退（波從頭傳到尾）
  function crawlField(box, ph, s, Du, rev) {
    const W = 15, c = rev ? 196 - 206 * ph : 4 + 206 * ph;   // 波的中心：從尾巴外（x≈4）走到頭外（x≈210）
    const S = x => sstep(((rev ? x - c : c - x) + W) / (2 * W)), sg = rev ? -1 : 1;
    applyField(box, (x, y) => { const h = hump(x, c, 13) * s; return [x + sg * Du * (S(x) - ph), y - 10 * h]; });
    set(box, "--ghx", (sg * Du * (S(140) - ph)).toFixed(2) + "px");
    set(box, "--ghy", (-7 * hump(140, c, 16) * s).toFixed(2) + "px");   // 波傳到頭：頭抬起來往前探一步
  }
  // 神龍游（2026-10-05 改 follow-the-leader）：波固定在「世界」裡（跟著舞台位置 x，不跟著時間）——
  // 頭經過哪裡高、哪裡低，身體每一節經過同一個地方時就一樣高、一樣低，整條身體走頭走過的路（以前是原地扭的正弦波）。
  // 頭、抓龍珠的前爪跟著同一條路起伏；龍鬚晚一點跟上（低通濾波）；s＝起步／停下的漸變
  const SW_A = 5, SW_L = 96;
  function swimField(box, s, dt) {
    const u = 200 / critterPx(box), xw = (box.__wx || 0) * u, Y = x => SW_A * s * Math.sin(2 * Math.PI * (x + xw) / SW_L);
    applyField(box, (x, y) => [x, y + Y(x)]);
    const hy = Y(70), E = els(box);
    set(box, "--ghy", hy.toFixed(2) + "px");
    if (E.pearl) E.pearl.style.transform = `translateY(${Y(80).toFixed(2)}px)`;
    const hs = box.__hys == null ? hy : box.__hys + (hy - box.__hys) * Math.min(1, (dt || .016) / .16);   // 龍鬚：頭往下時鬚尖往上飄、晚一點才跟上
    box.__hys = hs; const wa = Math.max(-14, Math.min(14, (hy - hs) * 4));
    E.sway.forEach(el => { el.style.animation = "none"; el.style.transform = `rotate(${(el.classList.contains("l") ? wa : -wa).toFixed(2)}deg)`; });
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
  // ── 神龍用尾巴托果實：身體中心線（PET_ART.dragonSpine）當成一串關節，從第 i0 節開始每節多彎 k（等曲率）——
  // 每個路徑點跟著離它最近的那一節一起平移、旋轉，所以整條尾巴（含尾鰭、後爪）是彎過去的，不是被拉長。
  // 解「i0、k 是多少，尾尖才會到目標點」：粗掃再細掃（每格重解，龍上下飄的時候尾尖也黏著果實）
  let SP6 = null; const NEAR = new Map(), TIP6 = [172, 182];
  const sp6 = () => SP6 || (SP6 = typeof PET_ART !== "undefined" && PET_ART.dragonSpine ? PET_ART.dragonSpine(16) : null);
  function chainPts(phi) { const S = sp6(), P = [[S[0].x, S[0].y]]; for (let i = 0; i < S.length - 1; i++) { const c = Math.cos(phi[i]), sn = Math.sin(phi[i]), dx = S[i + 1].x - S[i].x, dy = S[i + 1].y - S[i].y; P.push([P[i][0] + c * dx - sn * dy, P[i][1] + sn * dx + c * dy]); } return P; }
  // 曲率沿尾巴線性變化：每節的累積轉角 = k·d + q·d²（d＝離 i0 幾節）——尾巴可以先往一邊彎、尾端再勾回來
  const phiOf = (i0, k, q) => sp6().map((_, i) => { const d = Math.max(0, i - i0); return k * d + (q || 0) * d * d; });
  function mapPt(P, phi, x, y) {
    const S = sp6(), key = x + "," + y; let j = NEAR.get(key);
    if (j == null) { let best = 1e9; S.forEach((q, i) => { const d = (q.x - x) ** 2 + (q.y - y) ** 2; if (d < best) { best = d; j = i; } }); NEAR.set(key, j); }
    const a = phi[j], c = Math.cos(a), sn = Math.sin(a), dx = x - S[j].x, dy = y - S[j].y;
    return [P[j][0] + c * dx - sn * dy, P[j][1] + sn * dx + c * dy];
  }
  const tipOf = phi => mapPt(chainPts(phi), phi, TIP6[0], TIP6[1]);
  function solveTail(tx, ty, prev, i0Fix) {   // prev：上一格的解（只在附近細修，不會突然換一種彎法）；i0Fix：只試這個起彎點
    const err = (i0, k, q) => { const [x, y] = tipOf(phiOf(i0, k, q)); return Math.hypot(x - tx, y - ty) + Math.abs(k) * 2 + Math.abs(q) * 40; };   // 一樣到得了，挑彎得少的
    let b = prev ? [err(prev.i0, prev.k, prev.q), prev.i0, prev.k, prev.q] : [1e9, 0, 0, 0];
    if (!prev) { const n = sp6().length; for (let i0 = i0Fix != null ? i0Fix : 10; i0 <= (i0Fix != null ? i0Fix : n - 10); i0 += 4) for (let k = -.3; k <= .3; k += .03) for (let q = -.012; q <= .012; q += .0015) { const e = err(i0, k, q); if (e < b[0]) b = [e, i0, k, q]; } }
    for (let dk = prev ? .006 : .015, dq = prev ? .0003 : .00075; dk > .0002; dk /= 2, dq /= 2)
      for (let it = 0; it < 2; it++) for (const [k, q] of [[b[2] - dk, b[3]], [b[2] + dk, b[3]], [b[2], b[3] - dq], [b[2], b[3] + dq]]) { const e = err(b[1], k, q); if (e < b[0]) b = [e, b[1], k, q]; }
    const [x, y] = tipOf(phiOf(b[1], b[2], b[3]));
    return { err: Math.hypot(x - tx, y - ty), i0: b[1], k: b[2], q: b[3] };
  }
  function applyPhi(box, phi) { const P = chainPts(phi); applyField(box, (x, y) => mapPt(P, phi, x, y)); box.__phi = phi; }
  // 目標（畫面座標）→ 身體座標
  function toLocal(box, X, Y) { const g = box.querySelector("#petEmoji .pr-deform"), m = g && g.getScreenCTM(); if (!m) return [X, Y]; const q = new DOMPoint(X, Y).matrixTransform(m.inverse()); return [q.x, q.y]; }
  function toScreen(box, x, y) { const g = box.querySelector("#petEmoji .pr-deform"), m = g.getScreenCTM(); const q = new DOMPoint(x, y).matrixTransform(m); return [q.x, q.y]; }
  // 尾尖到得了這一點嗎（身體座標）：pet-stage.js 挑果實落點用
  const tailReach = (x, y) => (sp6() ? solveTail(x, y).err : 99);
  // tgt：果實元素（尾尖去托它）／"mouth"（送到嘴前）／null（尾巴放回原位）
  // 起彎點 i0 在第一次伸出去時挑好（托果實、送到嘴前都用同一個），之後只改曲率——以前直接內插關節角度、每格重解，中間的姿勢會整條甩出畫面
  const mouthLocal = box => { const m = part(box, ".pr-mouth").getBoundingClientRect(); return toLocal(box, m.left + m.width / 2 - 4, m.top + m.height / 2 + 5); };   // 下巴前面一點點
  async function tailTo(box, tgt, ms) {   // 果實跟著尾尖走由 pet-stage.js 的 follow() 負責（尾尖是 .cp-tail，在變形群組裡）
    if (!sp6()) return;
    const n = sp6().length;
    const goal = () => {
      if (!tgt) return TIP6;
      if (tgt === "mouth") return mouthLocal(box);
      const r = tgt.getBoundingClientRect(); return toLocal(box, r.left + r.width / 2, r.top + r.height * .62);   // 托在果實下半部
    };
    let sol = box.__sol;
    if (!sol && tgt) {   // 挑起彎點：同時搆得到這顆果實和嘴、而且彎得少
      const g = goal(), m = mouthLocal(box); let best = null;
      for (let i0 = 10; i0 <= n - 10; i0 += 4) { const a = solveTail(g[0], g[1], null, i0), b = solveTail(m[0], m[1], null, i0), e = a.err + b.err + (Math.abs(a.k) + Math.abs(b.k)) * 4; if (!best || e < best.e) best = { e, i0 }; }
      sol = { i0: best.i0, k: 0, q: 0 };
    }
    if (!sol) { if (!tgt && box.__phi) { resetField(box); box.__phi = null; } return; }
    // 終點姿勢：在固定起彎點上整個搜一次，之後每格只在附近追（龍上下飄，果實在身體座標裡會跟著動）；
    // 中間的姿勢＝起點和終點的曲率參數內插——同一種彎法慢慢加深，不會甩出去，最後一格剛好到
    const s0 = { k: sol.k, q: sol.q }; let fin = null;
    if (tgt) { const g = goal(); fin = solveTail(g[0], g[1], null, sol.i0); }
    await tween(ms, (e, k) => {
      if (fin) { const g = goal(); fin = solveTail(g[0], g[1], fin); }
      const K = fin ? fin.k : 0, Q = fin ? fin.q : 0;
      sol = { i0: sol.i0, k: s0.k + (K - s0.k) * e, q: s0.q + (Q - s0.q) * e };
      const phi = !tgt && k >= 1 ? new Array(n).fill(0) : phiOf(sol.i0, sol.k, sol.q);
      applyPhi(box, phi);
    });
    box.__sol = tgt ? sol : null;
    if (!tgt) { resetField(box); box.__phi = null; }
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
    const q = sel => em ? em.querySelector(sel) : null, st = q(".pr-stand");
    o = { em, critter: q(".pet-critter"), shadow: box.querySelector(".pet-shadow"), prop: q(".pet-prop"),
      body: q(".pc-bob") || q(".pc-hover"), head: em ? [...em.querySelectorAll(".pr-head")].find(h => !h.closest(".pr-stand")) : null, tail: em ? [...em.querySelectorAll(".pc-tail")].find(t => !t.closest(".pr-stand")) : null,
      earL: em ? [...em.querySelectorAll(".pc-ear.l")].find(e => !e.closest(".pr-stand")) : null, earR: em ? [...em.querySelectorAll(".pc-ear.r")].find(e => !e.closest(".pr-stand")) : null,
      fw: em ? [...em.querySelectorAll(".pc-fw")] : [], hw: em ? [...em.querySelectorAll(".pc-hw")] : [],
      pearl: q(".pr-pearl"), sway: em ? [...em.querySelectorAll(".pr-head .pc-sway")].filter(e => !e.closest(".pr-stand")) : [],
      pawL: q(".pr-paw.l"), pawR: q(".pr-paw.r"), footL: q(".pr-foot.l"), footR: q(".pr-foot.r"),
      stand: st, neck: st && st.querySelector(".pr-neck"), head2: st && st.querySelector(".pr-head2 .pr-head"), h2g: st && st.querySelector(".pr-head2"), stail: st && st.querySelector(":scope > .pc-tail"),
      legs: st ? Object.fromEntries(["fl", "fr", "hl", "hr"].map(n => { const lg = st.querySelector(".pr-leg." + n); return [n, [lg, lg && lg.querySelector(".pr-shin")]]; })) : {} };
    ELS.set(box, o); return o;
  }
  function flush(box) {
    const v = box.__gv; if (!v) return; box.__gv = null;
    const E = els(box), g = k => v[k] || "0px", d = k => v[k] || "0deg", T = (el, t) => { if (el) el.style.transform = t; };
    if (box.classList.contains("standing") && E.stand) {
      E.stand.style.translate = `0 ${g("--gby")}`;
      if (v["--gpt"] != null) { E.stand.style.transition = "none"; E.stand.style.transform = `${box.classList.contains("face-r") ? "translateX(-96px) scale(-1, 1) " : ""}rotate(${v["--gpt"]})`; }   // 先鏡像再傾（支點＝後腳掌，鏡像後也對）
      for (const n of ["fl", "fr", "hl", "hr"]) { const [lg, sh] = E.legs[n] || []; const N = n.toUpperCase(); T(lg, `rotate(${d("--a" + N)})`); T(sh, `rotate(${d("--b" + N)})`); }
      if (v["--nk"] != null) { T(E.neck, `rotate(${v["--nk"]})`); T(E.head2, `rotate(calc(${v["--nk"]} * -.8))`); }
      T(E.stail, `rotate(${d("--gtr")})`);
      return;
    }
    if (E.body) { E.body.style.animation = "none"; T(E.body, `translate(${g("--gsx")}, ${g("--gby")}) rotate(${d("--gbr")})`); E.body.style.scale = v["--gpre"] && v["--gpre"] !== "0" ? `1.03 .93` : ""; }
    T(E.head, `translate(${g("--ghx")}, ${g("--ghy")}) rotate(${d("--ghr")})`);
    if (E.tail) { E.tail.style.animation = "none"; T(E.tail, `rotate(${d("--gtr")})`); }
    if (E.earL) { E.earL.style.animation = "none"; T(E.earL, `rotate(${d("--gear")})`); }
    if (E.earR) { E.earR.style.animation = "none"; T(E.earR, `rotate(calc(${d("--gear")} * -1))`); }
    T(E.pawL, `translate(${g("--pLx")}, ${g("--pLy")}) rotate(${d("--pLr")})`); T(E.pawR, `translate(${g("--pRx")}, ${g("--pRy")}) rotate(${d("--pRr")})`);
    T(E.footL, `translate(${g("--hLx")}, ${g("--hLy")})`); T(E.footR, `translate(${g("--hRx")}, ${g("--hRy")})`);
    if (v["--wf"] != null) { E.fw.forEach(el => { el.style.animation = "none"; el.style.transform = `scaleX(${v["--wf"]})`; }); E.hw.forEach(el => { el.style.animation = "none"; el.style.transform = `scaleX(${v["--wh"]})`; }); }   // 蝶：拍翅跟身體起伏同一個相位
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
  const GAITV = ["--ghx", "--gby", "--gbr", "--gs", "--gsx", "--gpre", "--ghy", "--ghr", "--gtr", "--gear", "--gwave", "--pLx", "--pLy", "--pLr", "--pRx", "--pRy", "--pRr", "--hLx", "--hLy", "--hRx", "--hRy", "--aHL", "--bHL", "--aFL", "--bFL", "--aHR", "--bHR", "--aFR", "--bFR", "--nk", "--gpt", "--wf", "--wh"];
  const clearGait = box => {
    const em = box.querySelector("#petEmoji"); if (em) GAITV.forEach(k => em.style.removeProperty(k));
    box.__gv = null; const E = ELS.get(box); if (!E) return;
    [E.body, E.head, E.tail, E.earL, E.earR, E.pawL, E.pawR, E.footL, E.footR, E.neck, E.head2, E.stail, ...E.fw, ...E.hw, E.pearl, ...E.sway, ...Object.values(E.legs || {}).flat()].forEach(el => { if (el) { el.style.transform = ""; el.style.animation = ""; el.style.scale = ""; } });
    if (E.stand && !box.__bow) { E.stand.style.translate = ""; E.stand.style.transform = ""; E.stand.style.transition = ""; }
  };
  // 角色的版面寬度（px）：用 clientWidth，不能用 getBoundingClientRect——轉身（rotateY）時畫面上的寬度會變窄，步幅就會算錯
  const critterPx = box => { const c = box.querySelector("#petEmoji .pet-critter"); return c ? (c.clientWidth || c.getBoundingClientRect().width || 168) : 168; };
  // 每條腿的長度（髖→膝、膝→腳掌著地點），從骨架讀一次記起來
  const GEO = new WeakMap(), PREVB = new WeakMap();
  function legGeo(box) {
    const st = box.querySelector("#petEmoji .pr-stand"); if (!st) return {};
    if (GEO.has(st)) return GEO.get(st);
    const o = {};
    st.querySelectorAll(".pr-leg").forEach(lg => {
      const n = ["fl", "fr", "hl", "hr"].find(k => lg.classList.contains(k)), sh = lg.querySelector(".pr-shin");
      const hy = parseFloat(lg.style.getPropertyValue("--oy")), ky = parseFloat(sh.style.getPropertyValue("--oy"));
      const pw = [...sh.querySelectorAll("ellipse")].find(e => !e.closest("clipPath") && !e.closest("defs"));
      const hx = parseFloat(lg.style.getPropertyValue("--ox"));
      if (n && pw) o[n] = [ky - hy, +pw.getAttribute("cy") + +pw.getAttribute("ry") - ky, +pw.getAttribute("cx") - hx, hx, hy];   // [大腿長, 小腿到著地點的垂直長, 著地點的水平偏移, 髖 x, 髖 y]
    });
    GEO.set(st, o); return o;
  }
  // 站姿走路的步伐長度：腳在支撐期掃過的距離＝2·腿長·sin(擺角)，換成 px（u＝SVG 單位／px）
  const strideD = (box, g) => (g.stride / g.duty) * critterPx(box) / 200;   // 一個步伐週期身體走多遠（支撐期剛好走一個步幅）
  function pose(box, g, p, s, dir) {   // p＝步伐相位（可以超過 1）、s＝走路的程度 0..1（起步／停下時漸變）、dir＝±1
    const TAU = Math.PI * 2, f = x => (x % 1 + 1) % 1, u = 200 / critterPx(box);
    if (g.mode === "stand") {   // 側身四條腿：橫向步序 左後 → 左前 → 右後 → 右前
      // 兩節腿的反向運動學（IK）：每條腿有一個「腳掌目標點」——
      //   支撐期：目標是地上固定的一點，在身體座標裡剛好以身體前進的速度往後退（腳完全不滑）
      //   擺動期：目標從離地點沿一條抬高的弧線跑到下一個落地點
      // 每一格用餘弦定理解出大腿與膝蓋的角度讓腳掌剛好到目標；前腳膝蓋往前、後腳跗關節往後（像真的四足動物）
      const R = Math.PI / 180, geo = legGeo(box), S = g.stride, duty = g.duty;
      const contact = .5 + .5 * Math.cos(TAU * 2 * (p - (g.lag || 0)));   // 虎：腳落地後身體才沉下去（lag），看起來重
      const sink = (g.sink + g.bob * contact) * s;   // 身體下沉：平常就微蹲（腳才搆得到步幅兩端），著地那一刻再沉一點
      // 肩膀跟著前腳起伏：整個身體以後腳掌為支點前後微微傾（前腳抬起時肩膀抬、落地時沉）。腳掌目標點換到傾斜後的身體座標，腳照樣不滑
      const pt = (g.sh || 0) * Math.sin(TAU * (p - .25)) * s, cP = Math.cos(-pt * R), sP = Math.sin(-pt * R);
      const legs = [[0, false, "hl"], [.25, true, "fl"], [.5, false, "hr"], [.75, true, "fr"]].map(([off, front, n]) => {
        const G = geo[n] || [g.legL * .5, g.legL * .5, 0], L1 = G[0], dx = G[2], L2 = G[1], Rr = Math.hypot(dx, L2), dd = Math.atan2(-dx, L2);
        const ph = f(p + off);
        let u, lift = 0;   // u＝腳掌在髖關節前方多少（SVG 單位，往前為正）
        if (ph < duty) { const k = ph / duty; u = (S / 2 - S * k) * s; }
        else { const k = (ph - duty) / (1 - duty), e = k * k * (3 - 2 * k); u = (-S / 2 + S * e) * s; lift = (front ? g.lift : g.lift * .85) * Math.sin(Math.PI * k) * s; }
        // 目標（相對髖關節，畫面座標：往前＝−x、往下＝+y）；換到下沉＋前後傾之後的身體座標
        const hx = G[3] != null ? G[3] : 0, hy = G[4] != null ? G[4] : 0, wx = hx - u - PIV[0], wy = hy + L1 + L2 - lift - sink - PIV[1];
        const tx = PIV[0] + cP * wx - sP * wy - hx, ty = PIV[1] + sP * wx + cP * wy - hy;
        let d = Math.hypot(tx, ty); d = Math.min(d, L1 + Rr - .01);
        const thT = Math.atan2(-tx, ty) / R;   // 目標相對「正下方」的角度（往前為正）
        const al = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - Rr * Rr) / (2 * L1 * d)))) / R;
        const a = front ? thT + al : thT - al;   // 前腳膝蓋往前凸、後腳往後凸
        const kx = -L1 * Math.sin(a * R), ky = L1 * Math.cos(a * R);   // 膝蓋位置
        const phi = (Math.atan2(-(tx - kx), ty - ky) - dd) / R;   // 小腿要轉多少，(dx, L2) 才會從膝蓋指到目標
        return { n, a, b: phi - a };
      });
      const [HL, FL, HR, FR] = legs;
      set(box, "--gby", sink.toFixed(2) + "px"); set(box, "--gpt", pt.toFixed(2) + "deg");
      [["--aHL", HL.a], ["--bHL", HL.b], ["--aFL", FL.a], ["--bFL", FL.b], ["--aHR", HR.a], ["--bHR", HR.b], ["--aFR", FR.a], ["--bFR", FR.b]].forEach(([k, v]) => set(box, k, v.toFixed(2) + "deg"));
      set(box, "--nk", (g.neck * Math.cos(TAU * 2 * (p - .08)) * s).toFixed(2) + "deg");   // 頭跟著步伐點（虎是反向補償，頭幾乎不動）
      set(box, "--gtr", (g.tail * Math.sin(TAU * (p + .25)) * s).toFixed(2) + "deg");
      set(box, "--gear", (g.ear * Math.cos(TAU * 2 * (p - .12)) * s).toFixed(2) + "deg");
      flush(box);
      return;
    }
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
    if (g.mode !== "swim") set(box, "--ghy", ((g.head || 0) * lag * s).toFixed(2) + "px");   // 神龍的頭跟著世界裡的波（swimField）
    set(box, "--ghr", (dir * 1.5 * Math.sin(TAU * (p - .1)) * s).toFixed(2) + "deg");
    // 尾巴反向擺、耳朵晚一點彈
    set(box, "--gtr", ((g.tail || 0) * Math.sin(TAU * (p + .25)) * s).toFixed(2) + "deg");
    set(box, "--gear", ((g.ear || 0) * Math.cos(TAU * 2 * (p - .12)) * s).toFixed(2) + "deg");
    // 各種走法的身體
    if (g.mode === "rock") { br = dir * 4 * s + (g.roll) * Math.sin(TAU * p) * s; by = (g.bob) * Math.abs(Math.sin(TAU * p)) * s; }
    if (g.mode === "fly") {   // 一拍一升：翅膀往下拍（收→張）時身體上升、往上收時落下；後翅晚一點跟上
      by = -(g.bob) * Math.abs(Math.sin(TAU * p)) * s; br = dir * (g.bank) * s;
      set(box, "--wf", (.7 + .3 * Math.abs(Math.sin(TAU * p))).toFixed(3)); set(box, "--wh", (.7 + .3 * Math.abs(Math.sin(TAU * (p - .05)))).toFixed(3));
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
  async function larvaTurn(box, dir) {
    const f = lvFace(box); if (f === dir) return;
    box.classList.add("walking"); box.dataset.walk = "crawl";
    const u = 200 / critterPx(box), x0 = curX(box);
    const tuck = (k, arch) => { applyField(box, (x, y) => { const t = Math.max(0, Math.min(1, (LV_HEAD - x) / 114)); return [LV_HEAD + (x - LV_HEAD) * k, y - arch * Math.sin(Math.PI * t) * (1 - k)]; }); };
    // 收：尾巴先收（離頭越遠收越多）、背拱起來；頭微微抬起、往前看
    await tween(380, e => { tuck(1 - .86 * e, 10); set(box, "--ghy", (-5 * e).toFixed(2) + "px"); flush(box); });
    box.classList.toggle("lv-l", dir < 0);
    moveTo(box, x0 + 2 * f * (LV_HEAD - 100) / u);   // 換邊：頭的位置不變（中心跳到頭的另一邊）
    await tween(420, e => { tuck(.14 + .86 * e, 10); set(box, "--ghy", (-5 * (1 - e)).toFixed(2) + "px"); flush(box); });
    resetField(box); clearGait(box);
    set(box, "--wx", (x0 + 2 * f * (LV_HEAD - 100) / u) + "px"); { const E = els(box); [E.critter, E.shadow, E.prop].forEach(el => { if (el) el.style.translate = ""; }); }
    box.classList.remove("walking"); delete box.dataset.walk;
  }
  // 幼蟲低頭吃：頭往下 ld、往前 lx（跟 CSS .st-lean 移頭的量一樣），身體前段跟著彎（x 從 78 到頭漸增），不會在中間拱出尖角
  async function bend(box, ld, lx, ms) {
    const [l0, x0] = box.__bend || [0, 0];
    // 頭跟身體同一格一起寫（2026-10-05 第二輪）：頭掛在身體最前端（x≈140 那一節彎了多少，頭就移多少）——
    // 以前頭靠 .st-lean 一下子跳到低頭位置、身體 0.3 秒才彎過去；抬頭時反過來，中間看得到頭離開身體
    const E = els(box), kh = sstep((140 - 78) / 66);
    await tween(ms, e => { const L = l0 + (ld - l0) * e, X = x0 + (lx - x0) * e; applyField(box, (x, y) => { const k = sstep((x - 78) / 66); return [x + X * k, y + L * k]; });
      if (E.head) E.head.style.transform = `translate(${(X * kh).toFixed(2)}px, ${(L * kh).toFixed(2)}px)`; });
    box.__bend = ld || lx ? [ld, lx] : null; if (!box.__bend) { resetField(box); if (E.head) E.head.style.transform = ""; }
  }
  // 走到 x（px，相對舞台中間）。回傳 promise。不支援動畫時直接瞬移。
  async function goTo(box, x, opts) {   // opts.keepFace：小碎步調整位置（往後退一點也不轉身）
    opts = opts || {};
    if (!box) return;
    let g = GAIT[stage(box)] || GAIT[3]; const x0 = curX(box), dist = x - x0, dir = Math.sign(dist) || 1;
    const y0 = curY(box), y1 = opts.wy == null ? y0 : opts.wy;
    if (reduce()) { set(box, "--wx", x + "px"); set(box, "--wy", y1 + "px"); return; }
    if (Math.abs(dist) < 3) {   // 左右幾乎不用動、只要往前（深度）挪：原地踏一小步過去
      if (Math.abs(y1 - y0) >= 1.5) await new Promise(res => { const t0 = performance.now(); const step = () => { const now = performance.now(); const k = Math.min(1, (now - t0) / 300), e = k * k * (3 - 2 * k); moveTo(box, x0 + (x - x0) * e, y0 + (y1 - y0) * e); if (k < 1) raf = requestAnimationFrame(step); else res(); }; raf = requestAnimationFrame(step); });
      set(box, "--wx", x + "px"); set(box, "--wy", y1 + "px"); box.__wy = null; const E = els(box); [E.critter, E.shadow, E.prop].forEach(el => { if (el) el.style.translate = ""; }); return;
    }
    box.classList.add("walking"); box.dataset.walk = g.mode;
    box.__k = 0;   // 起步後（轉完身）再量
    let rev = false;
    if (g.mode === "stand") { if (!box.classList.contains("standing")) await standUp(box, dir); else if (!opts.keepFace) await turnStand(box, dir); g = Object.assign({}, g, { D: strideD(box, g) }); }
    else if (g.mode === "crawl") {   // 幼蟲：頭在前面爬（以前往左走是尾巴先走）；要換方向先原地掉頭
      if (!opts.keepFace && lvFace(box) !== dir) { box.classList.remove("walking"); await larvaTurn(box, dir); return goTo(box, x, Object.assign({}, opts, { keepFace: true })); }
      rev = lvFace(box) !== dir;   // 小碎步往後退：波從頭傳到尾
      const n = Math.max(1, Math.round(Math.abs(dist) / (g.Du / (200 / critterPx(box)))));   // 整數道波
      g = Object.assign({}, g, { D: Math.abs(dist) / n });
    }
    else if (!opts.keepFace && g.mode !== "fly") await face(box, dir);   // 蝶不轉身（正面對稱、靠身體內傾表示方向）：rotateY 會讓量口器位置的 getScreenCTM 不準
    // 預備：往下蹲、往後縮一點
    if (!opts.keepFace && g.mode !== "crawl") { set(box, "--gpre", "1"); await sleep(150); set(box, "--gpre", "0"); }   // 小碎步不用預備；幼蟲的預備就是第一道波
    box.__k = g.mode === "stand" || g.mode === "crawl" ? 0 : calib(box);   // 站姿用 IK（SVG 單位、沒有 3D 轉身），不用量
    const ramp = Math.min(Math.abs(dist) * .35, 26);   // 起步／停下的緩衝距離
    const arc = g.mode === "fly" ? Math.min(28, Math.abs(dist) * .3) : 0;   // 蝶：飛一道弧線過去（不是貼著直線滑）
    let p = 0, t = performance.now(), done = 0, lastS = .15;
    await new Promise(res => {
      const step = () => { const now = performance.now();
        const dt = Math.min(.05, (now - t) / 1000); t = now;
        const left = Math.abs(dist) - done;
        const ease = Math.min(1, (done + 2) / ramp, (left + 2) / ramp);   // 起步加速、快到時減速
        const v = g.v * (.25 + .75 * ease), ds = Math.min(left, v * dt);
        done += ds; p += ds / g.D;
        const kk = Math.min(1, done / Math.abs(dist));
        if (g.mode === "swim") swimField(box, Math.max(.15, ease), dt);   // 先算（寫 --ghy），pose() 結尾一起寫到元素
        moveTo(box, x0 + dir * done, y0 + (y1 - y0) * (g.mode === "fly" ? kk * kk * (3 - 2 * kk) : kk) - arc * Math.sin(Math.PI * kk));
        lastS = Math.max(.15, ease); pose(box, g, p, lastS, dir);
        if (g.mode === "crawl") { crawlField(box, Math.min(.99999, p - Math.floor(p)) , 1, g.D * 200 / critterPx(box), rev); flush(box); }   // 波的高度不跟著加減速縮（每一節的位移要剛好抵掉身體的移動，腳才不滑）
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
        if (g.mode === "swim") { swimField(box, Math.max(0, .9 * (1 - k)), .016); cloudTick(box, x); }   // 身體的起伏慢慢收平、雲座趕上來
        pose(box, g, p1 + k * .25, s * Math.min(.6, lastS), dir);   // 從走路最後的幅度接著收（以前一律從 0.6 開始，停下那一格步伐突然變大）
        set(box, "--gsx", (dir * 5 * Math.sin(k * Math.PI * 1.6) * (1 - k)).toFixed(2) + "px");   // 往前多衝一點再回來
        set(box, "--gtr", ((g.tail || 0) * 1.2 * Math.sin(k * Math.PI * 2.4) * (1 - k)).toFixed(2) + "deg");
        flush(box);
        if (k < 1) raf = requestAnimationFrame(step); else res();
      };
      raf = requestAnimationFrame(step);
    });
    if (g.mode === "crawl" || g.mode === "swim") resetField(box);
    if (g.mode === "swim") { box.__trail = null; box.__hys = null; box.__cloud = x; ride(box); }
    set(box, "--wx", x + "px"); set(box, "--wy", y1 + "px"); box.__wy = null; { const E = els(box); [E.critter, E.shadow, E.prop].forEach(el => { if (el) el.style.translate = ""; }); }
    clearGait(box);   // 走完就清掉（站著吃東西時脖子角度由 pet-stage.js 寫在 .ps-box，不能被這裡的舊值蓋掉）
    box.classList.remove("walking"); delete box.dataset.walk;
  }
  // 讓「嘴」對準果實：量嘴相對角色中心的位置（已經轉向那一側），走到嘴在果實正上方
  // 朝向＝前進的方向（以前先面向果實、goTo 再面向前進方向，果實在「身體中心和嘴之間」時會左右翻來翻去）
  async function goEat(box, berryEl, berryX) {
    const em = box.querySelector("#petEmoji"); if (!em) return;
    const g = GAIT[stage(box)] || {}, cur = curX(box), st = stage(box);
    if (g.mode === "stand") await standUp(box, Math.sign(berryX - cur) || 1);
    // 嘴的位置要用「低頭吃」的姿勢量（低頭時頭會往前／往下移）：同一格套上姿勢、量完拿掉，畫面不會閃
    const old = box.style.getPropertyValue("--ex");
    box.classList.add("no-tr"); box.style.setProperty("--ex", "0"); em.classList.add("st-lean"); void em.offsetWidth;
    const c = em.querySelector(".pet-critter").getBoundingClientRect(), m = (part(box, ".pr-mouth") || part(box, ".pr-head") || em).getBoundingClientRect();
    em.classList.remove("st-lean"); box.style.setProperty("--ex", old || "0"); void em.offsetWidth; box.classList.remove("no-tr");
    let mouthDx = (m.left + m.width / 2) - (c.left + c.width / 2);   // 嘴在角色中心左右多少 px
    const side = Math.sign(berryX - cur) || 1;
    if (g.mode === "stand") {   // 側身：嘴在身體前端，面朝哪邊嘴就在哪邊
      const mm = Math.abs(mouthDx), was = box.classList.contains("face-r") ? 1 : -1;
      const ok = f => (f > 0 ? berryX - mm - cur >= -4 : berryX + mm - cur <= 4);   // 往這邊走得到（不用倒退）
      const f = ok(was) ? was : ok(-was) ? -was : was;
      await turnStand(box, f);
      // 只走一次（2026-10-05 第二輪）：轉好方向後，在原地把「趴多低、嘴還差多少」算好，直接走到最後的位置——
      // 以前用 CSS 的低頭姿勢估站位，到了再量一次、差幾 px 就補一小步（低頭前插一個抬腳）
      const sol = solveBow(box, berryEl, st, .32), tx = Math.round(cur + sol.dx), back = Math.sign(tx - cur) === -f;   // 嘴已經超過果實一點：往後退一小步（不轉身）
      const bb = berryEl.getBoundingClientRect(), wy = Math.round(Math.max(-6, Math.min(6, curY(box) + bb.bottom - (c.top + c.height * .98))));   // 前後（深度）：站到果實那條線上（最多 ±6px）
      await goTo(box, tx, { wy, keepFace: back });
      return;
    }
    if (st === 1) {   // 幼蟲：嘴（頭）先決定要不要掉頭，掉頭時頭不動；然後往頭的方向爬到嘴在果實上
      const f = lvFace(box), mo = Math.abs(mouthDx), hx = cur + f * mo, need = Math.sign(berryX - hx) || f;
      if (need !== f && Math.abs(berryX - hx) > 8) await larvaTurn(box, need);
      await goTo(box, Math.round(berryX - lvFace(box) * mo), { keepFace: true });
      return;
    }
    if (st === 2) {   // 蝶：落在果實旁邊約 30px（口器斜斜伸過去吸），腳尖（圖上 y≈160）剛好踩在果實的那條地面線上
      const tipY = c.top + c.height * 160 / 200;
      await goTo(box, Math.round(berryX - side * 30), { wy: Math.round((curY(box) + groundY(berryEl) - tipY) * 10) / 10 });
      return;
    }
    if (st === 5) { const pw = em.querySelector(side > 0 ? ".pr-paw.r" : ".pr-paw.l"); if (pw) { const q = pw.getBoundingClientRect(); mouthDx = (q.left + q.width / 2) - (c.left + c.width / 2) + side * 6; } }   // 幼龍：用前爪撿起來
    const tx = Math.round(berryX - mouthDx);
    if (Math.abs(tx - cur) >= 3) await face(box, Math.sign(tx - cur), 200);
    await goTo(box, tx);
  }
  // 果實那一條地面線（畫面座標）：用版面位置算，不受果實落下／旋轉的動畫影響
  function groundY(b) { const ar = b.offsetParent.getBoundingClientRect(); return ar.top + b.offsetTop + b.offsetHeight; }
  // 狐、虎要趴多低嘴才碰得到果實（嘴碰果實的上半部 biteY）：先維持自然的脖子角度、找身體前傾多少；趴到底還不夠才讓脖子再往下。
  // 同一格套上姿勢量、量完還原（不會畫出來）。回傳 { pt 前傾, nk 脖子, dx 嘴還差多少（畫面 px，往右為正）}
  function solveBow(box, b, st, biteY) {
    const em = box.querySelector("#petEmoji");
    const gap = (pt, nk) => { bowSet(box, pt, nk); void em.offsetWidth; const m = cpt(box, "mouth"), br = b.getBoundingClientRect(); return [br.left + br.width / 2 - m[0], br.top + br.height * biteY - m[1]]; };
    const solve = (f, lo, hi, x0, x1) => {   // 割線法：f(x)=0，x 限制在 [lo, hi]
      let y0 = f(x0), y1 = f(x1);
      for (let it = 0; it < 4 && Math.abs(y1) > 1.5 && y1 !== y0; it++) { const x2 = Math.max(lo, Math.min(hi, x1 - y1 * (x1 - x0) / (y1 - y0))); x0 = x1; y0 = y1; x1 = x2; y1 = f(x1); }
      return [x1, y1];
    };
    const prev = box.__bow, NK = st === 4 ? -46 : -54;   // 虎脖子短、粗：轉少一點
    let [pt, dy] = solve(v => gap(v, NK)[1], -40, 0, -12, -26), nk = NK;
    if (dy > 1.5) [nk, dy] = solve(v => gap(-40, v)[1], -100, NK, NK, NK - 20), pt = -40;   // 趴到底還不夠：脖子再往下
    const dx = gap(pt, nk)[0];
    if (prev) bowSet(box, prev[0], prev[1]); else bowClear(box);
    void em.offsetWidth;
    return { pt, nk, dx, dy };
  }
  // ── 低頭吃（狐、虎）：像狗趴下去吃東西——胸口往下（身體以後腳為支點往前傾）、前腳彎、四隻腳掌留在原地 ──
  // 以前只有脖子往下轉，地上的果實搆不到，脖子轉到 -112° 頭整個倒過來。現在：身體前傾 pitch、脖子 nk 轉自然的角度，
  // 每條腿用兩節 IK 解出「腳掌還在原本著地點」的大腿／小腿角度（跟走路同一套公式）
  const PIV = [148, 196];
  function bowSet(box, pitch, nk) {
    const E = els(box), geo = legGeo(box); if (!E.stand) return;
    const R = Math.PI / 180, th = -pitch * R, cs = Math.cos(th), sn = Math.sin(th);
    E.stand.style.transition = "none";
    E.stand.style.transform = `${box.classList.contains("face-r") ? "translateX(-96px) scale(-1, 1) " : ""}rotate(${pitch.toFixed(2)}deg)`;
    for (const n of ["fl", "fr", "hl", "hr"]) {
      const [lg, sh] = E.legs[n] || []; const G = geo[n]; if (!lg || !G) continue;
      const hx = parseFloat(lg.style.getPropertyValue("--ox")), hy = parseFloat(lg.style.getPropertyValue("--oy")), [L1, L2, dx] = G, front = n[0] === "f";
      const Tx = hx + dx, Ty = hy + L1 + L2;   // 站直時的著地點（世界座標，不動）
      const bx = PIV[0] + cs * (Tx - PIV[0]) - sn * (Ty - PIV[1]), by = PIV[1] + sn * (Tx - PIV[0]) + cs * (Ty - PIV[1]);   // 換到身體（已前傾）的座標
      const tx = bx - hx, ty = by - hy, Rr = Math.hypot(dx, L2), dd = Math.atan2(-dx, L2);
      const d = Math.min(Math.hypot(tx, ty), L1 + Rr - .01);
      const thT = Math.atan2(-tx, ty) / R, al = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - Rr * Rr) / (2 * L1 * d)))) / R;
      const a = front ? thT + al : thT - al, kx = -L1 * Math.sin(a * R), ky = L1 * Math.cos(a * R);
      const b = (Math.atan2(-(tx - kx), ty - ky) - dd) / R - a;
      lg.style.transform = `rotate(${a.toFixed(2)}deg)`; if (sh) sh.style.transform = `rotate(${b.toFixed(2)}deg)`;
    }
    if (E.neck) { E.neck.style.transition = "none"; E.neck.style.transform = `rotate(${nk.toFixed(2)}deg)`; }
    if (E.head2) { E.head2.style.transition = "none"; E.head2.style.transform = `rotate(${(-nk * .8).toFixed(2)}deg)`; }   // 頭幾乎轉回正（以前只轉回 55%，虎低頭時頭歪 21°；現在剩 9°，鼻口朝下對著果實）
    box.__bow = [pitch, nk];
  }
  function bowClear(box) {
    const E = els(box); box.__bow = null;
    [E.stand, E.neck, E.head2, ...Object.values(E.legs || {}).flat()].forEach(el => { if (el) { el.style.transform = ""; el.style.transition = ""; } });
  }
  // 從現在的姿勢平滑過去；pitch＝nk＝0 是站直。2026-10-05 第二輪：身體和脖子錯開——
  // 往下：肩膀先沉（前傾），脖子晚 30% 才往前下方伸；往上：脖子先抬，肩膀晚一點才回正（ChatGPT 看錄影的建議；以前兩個同時動，抬頭像整隻彈回去）
  function bow(box, pitch, nk, ms) {
    const [p0, n0] = box.__bow || [0, 0], t0 = performance.now(), D = ms || 360, up = Math.abs(pitch) + Math.abs(nk) < Math.abs(p0) + Math.abs(n0);
    const ss = v => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
    return new Promise(res => { const step = () => { const k = Math.min(1, (performance.now() - t0) / D);
      const a = ss(k / .7), b = ss((k - .3) / .7), ep = up ? b : a, en = up ? a : b;   // ep＝身體、en＝脖子
      bowSet(box, p0 + (pitch - p0) * ep, n0 + (nk - n0) * en); if (k < 1) raf = requestAnimationFrame(step); else { if (!pitch && !nk) bowClear(box); res(); } };
      raf = requestAnimationFrame(step); });
  }
  // ── 站起來／坐下／轉身（狐、虎）：坐著（正面）→ 站起來（正面）→ 四分之三面 → 側身；轉身＝側身 → 四分之三 → 正面 → 另一邊四分之三 → 側身 ──
  // 以前：坐姿直接換成側身（像換了一張圖）、轉身用 rotateY 翻面（翻到一半身體寬度是 0，像紙片）。
  // 現在每一步只差一點點：頭一直在、大小位置連續，身體由「坐著的臀部 → 正面的背 → 縮短的側身 → 完整側身」接起來
  // 所有逐格動畫都用 performance.now() 算進度，不用 requestAnimationFrame 給的時間戳記：
  // 兩者不保證同一個時鐘（Chrome 虛擬時間差了 25 秒、補間卡在起點；WebKit 也不保證），起點又是用 performance.now() 記的
  const tween = (ms, fn) => new Promise(res => { const t0 = performance.now(); const step = () => { const now = performance.now(); const k = Math.min(1, (now - t0) / ms); fn(k * k * (3 - 2 * k), k); if (k < 1) raf = requestAnimationFrame(step); else res(); }; raf = requestAnimationFrame(step); });
  const H2 = new WeakMap();
  function setQ(box, q) {   // q：0＝側身、1＝四分之三面（頭移到正面站姿的頭的位置、大小）
    const E = els(box); if (!E.stand || !E.h2g) return;
    let h = H2.get(E.h2g); if (!h) { const m = /translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)/.exec(E.h2g.getAttribute("transform")) || [0, 62, 80, .78]; h = [+m[1], +m[2], +m[3]]; H2.set(E.h2g, h); }
    const F = [100, 102.6, .86], L = (a, b) => a + (b - a) * q;
    E.stand.style.setProperty("--q", q.toFixed(3));
    E.h2g.style.transform = q > 0 ? `translate(${L(h[0], F[0]).toFixed(2)}px, ${L(h[1], F[1]).toFixed(2)}px) scale(${L(h[2], F[2]).toFixed(3)}) translate(-100px, -100px)` : "";
    box.__q = q;
  }
  const slow = box => (stage(box) === 4 ? 1.2 : 1);   // 虎比較慢、比較沉
  async function crossTo(box, toStand) {   // 正面 ↔ 四分之三：0.13 秒交叉淡入
    if (toStand) { box.classList.add("standing", "pf-x"); await sleep(130); box.classList.remove("pf-x"); }
    else { box.classList.add("pf-y"); await sleep(130); box.classList.remove("standing", "pf-y", "face-r"); }
  }
  async function standUp(box, dir) {
    if (box.classList.contains("standing")) return;
    box.style.setProperty("--nk", "0deg");
    box.classList.add("pf-front"); await sleep(240 * slow(box));             // 站起來（正面）：臀部抬起、後腿和背出現
    box.classList.toggle("face-r", (dir || -1) > 0); setQ(box, 1);         // 轉成四分之三面（頭先轉、身體跟上）
    await crossTo(box, true);
    await tween(300 * slow(box), e => setQ(box, 1 - e));                    // 身體轉到側面
    setQ(box, 0);
  }
  async function turnStand(box, dir) {   // 站著原地轉身：經過正面，不壓扁
    if (!box.classList.contains("standing") || box.classList.contains("face-r") === dir > 0) return;
    bowClear(box); clearGait(box);
    await tween(240 * slow(box), e => setQ(box, e));
    await crossTo(box, false); box.classList.add("pf-front"); await sleep(60);
    box.classList.toggle("face-r", dir > 0); setQ(box, 1);
    await crossTo(box, true);
    await tween(260 * slow(box), e => setQ(box, 1 - e)); setQ(box, 0);
  }
  async function sitDown(box) {
    if (!box.classList.contains("standing")) { box.classList.remove("pf-front"); return; }
    bowClear(box); clearGait(box); box.style.removeProperty("--nk");
    await tween(260 * slow(box), e => setQ(box, e));                        // 轉回四分之三面
    await crossTo(box, false); setQ(box, 0);                                // → 正面站姿
    await sleep(60);
    box.classList.remove("pf-front");                                       // 先彎後腿、臀部坐下去
    const em = box.querySelector("#petEmoji"); if (em) { em.classList.add("pb-sit"); await sleep(420); em.classList.remove("pb-sit"); }
  }
  async function home(box) { if (!box) return; await goTo(box, 0, { wy: 0 }); await sitDown(box); await face(box, 0, 300); }
  function stop(box) { cancelAnimationFrame(raf); if (box) { box.classList.remove("walking", "pf-front", "pf-x", "pf-y"); setQ(box, 0); ["--wx", "--wy", "--face"].forEach(k => box.style.removeProperty(k)); clearGait(box); } }
  // 接觸點的畫面座標：mouth＝嘴（.pr-mouth 的支點，跟著頭的所有變換）；其他＝pet-art.js 畫的 .cp-*（手掌、尾尖、裂紋）
  function cpt(box, name) {
    const em = box.querySelector("#petEmoji"); if (!em) return null;
    let el = name === "mouth" ? part(box, ".pr-mouth") : em.querySelector(".cp-" + name); if (!el || !el.getScreenCTM) return null;
    const M = el.getScreenCTM(); if (!M) return null;
    const x = name === "mouth" ? parseFloat(el.style.getPropertyValue("--ox")) : +el.getAttribute("cx"), y = name === "mouth" ? parseFloat(el.style.getPropertyValue("--oy")) : +el.getAttribute("cy");
    const q = new DOMPoint(x, y).matrixTransform(M); return [q.x, q.y];
  }
  // 現在看得到的那一份身體（站著時是 .pr-stand）裡找部位
  const part = (box, sel) => { const em = box.querySelector("#petEmoji"); if (!em) return null; return (box.classList.contains("standing") && em.querySelector(".pr-stand " + sel)) || em.querySelector(sel); };
  return { goTo, goEat, home, face, stop, standUp, sitDown, turnStand, setQ, larvaTurn, bend, part, bow, bowSet, bowClear, solveBow, groundY, cpt, tailTo, tailReach, GAIT, _pose: pose };   // _pose：測試逐相位檢查用
})();
