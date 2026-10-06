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
    1: { mode: "crawl", v: 26, Du: 22, bob: 0, roll: 0, head: 0 },                         // 幼蟲：蠕動（收縮波從尾巴往頭傳；一道波往前 22 單位）
    2: { mode: "fly", v: 140, D: 38, bob: 9, roll: 0, bank: 9 },                               // 蝶：一拍一升的小弧線、轉彎時內傾
    3: { mode: "stand", v: 150, stride: 34, lift: 11, sink: 3.6, duty: .6, bob: 2.4, tail: 15, ear: 7, neck: 3.5, sh: .7, legL: 58 },             // 狐：小步、輕、有彈性；尾巴大幅、晚一拍
    4: { mode: "stand", v: 115, stride: 36, lift: 12, sink: 5, duty: .68, bob: 3.6, lag: .06, tail: 5, ear: 2, neck: -1.2, sh: 1.6, legL: 56 },  // 虎：慢、步幅大、肩膀隨前腳起伏、落地後才沉（重）；尾巴小幅；頭穩
    5: { mode: "waddle", v: 100, D: 28, bob: 4.5, roll: 7, lift: 11, duty: .56, tail: 12, ear: 6, head: 2.4 },        // 幼龍：短腿搖搖擺擺
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
  // ── 幼蟲一節一節（2026-10-06）：每一節（.lv-seg）的中心 (u, v)；F(u, v) 回傳新的中心 [x, y]，這一節整個平移過去（腳跟著那一節）──
  const LVSEG = new WeakMap();
  function lvSegs(box) { const g = box.querySelector("#petEmoji .lv-body"); if (!g) return null; let o = LVSEG.get(g); if (!o) { o = [...g.querySelectorAll(":scope > .lv-seg")].map(el => ({ el, u: +el.dataset.u, v: +el.dataset.v })); LVSEG.set(g, o); } return o; }
  function lvPose(box, F, order) {   // order：依遠近重新排先後（U 型迴轉時近的那節蓋在遠的上面）
    const S = lvSegs(box); if (!S) return;
    for (const q of S) { const [x, y] = F(q.u, q.v); q.el.style.transform = `translate(${(x - q.u).toFixed(2)}px, ${(y - q.v).toFixed(2)}px)`; q.z = order ? order(q.u) : 0; }
    if (order) { const g = S[0].el.parentNode; S.slice().sort((a, b) => a.z - b.z).forEach(q => g.appendChild(q.el)); }
  }
  function lvReset(box) { const S = lvSegs(box); if (!S) return; const g = S[0].el.parentNode; S.forEach(q => { q.el.style.transform = ""; g.appendChild(q.el); }); }   // 回到原位、原本的先後（尾→頭）
  const hump = (x, c, w) => Math.exp(-Math.pow((x - c) / w, 2));
  const sstep = v => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
  // 幼蟲的蠕動（2026-10-05 重做）：真的鳳蝶幼蟲是一道收縮波從尾巴傳到頭——波經過的那一節抬起來往前移 Du，其他節貼在地上不動。
  // 身體整體（moveTo）是等速往前，所以每一節在身體座標裡：波還沒到 → 往後退（＝在地上不動）、波經過 → 往前跳 Du、波過了 → 又不動。
  // 一趟路切成整數道波，最後一道波結束時每一節剛好回到原位（身體是平的才停）。rev＝倒退（波從頭傳到尾）
  function crawlField(box, ph, s, Du, rev) {
    const W = 36, c = rev ? 207 - 211 * ph : -4 + 211 * ph;   // 2026-10-06：W 36＝同時約 3 節在空中（真的毛毛蟲）；波的中心從尾巴外走到頭外   // 波的中心：從尾巴外（x≈8）走到頭外（x≈195）；過渡區 W 加寬到 24（2026-10-05 第二輪：以前 15，每一節的推進只有一格，頭一下子往前跳 18px）
    const S = x => sstep(((rev ? x - c : c - x) + W) / (2 * W)), sg = rev ? -1 : 1;
    const F = (x, y) => { const h = hump(x, c, 26) * s; return [x + sg * Du * (S(x) - ph), y - 6 * h]; };   // 拱的寬度要蓋住往前移的範圍（往前移的時候腳一定是抬起的，不然像在地上滑）   // 背上一個低而寬的拱（腹足只離地一點點）
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
    const k0 = box.__ropeK == null ? 1 : box.__ropeK, k = box.__ropeK = k0 + ((swim ? 1.8 : 1) - k0) * .08;   // 幅度慢慢變（起步、停下不跳）
    const dt = box.__ropeT ? Math.min(.05, (now - box.__ropeT) / 1000) : 0; box.__ropeT = now; box.__ropePh = (box.__ropePh || 0) + dt / (swim ? 1.5 : ROPE.T);   // 相位一路累加（換速度不跳）
    const t0 = box.__ropeTail == null ? 1 : box.__ropeTail, tf = box.__ropeTail = t0 + ((box.__chain ? 0 : 1) - t0) * .15;
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
    if (E.head) E.head.style.transform = `translate(${hx.toFixed(2)}px, ${hy.toFixed(2)}px)`;
    if (E.pearl) E.pearl.style.transform = `translate(${(I.n[4][0] * D[4]).toFixed(2)}px, ${(I.n[4][1] * D[4]).toFixed(2)}px)`;
    const hs = box.__hys == null ? hy : box.__hys + (hy - box.__hys) * Math.min(1, (dt || .016) / .16);   // 龍鬚：頭往下時鬚尖往上飄、晚一點才跟上
    box.__hys = hs; const wa = Math.max(-14, Math.min(14, (hy - hs) * 6));
    E.sway.forEach(el => { el.style.animation = "none"; el.style.transform = `rotate(${(el.classList.contains("l") ? wa : -wa).toFixed(2)}deg)`; });
  }
  let ropeRaf = 0;
  function rope(box, on) {
    cancelAnimationFrame(ropeRaf); ropeRaf = 0; if (!box || !on || reduce()) return;
    const tick = () => { if (!box.isConnected || stage(box) !== 6) { ropeRaf = 0; return; } ropeRender(box, performance.now()); ropeRaf = requestAnimationFrame(tick); };
    ropeRaf = requestAnimationFrame(tick);
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
  let SP6 = null, REST = null; const NEAR = new Map(), TIP6 = [172, 182], I0 = 20, BEND = 14 * Math.PI / 180;
  const sp6 = () => SP6 || (SP6 = typeof PET_ART !== "undefined" && PET_ART.dragonSpine ? PET_ART.dragonSpine(16) : null);
  const rest = () => REST || (REST = sp6().map(q => [q.x, q.y]).concat([TIP6.slice()]));   // 最後一節＝尾尖（.cp-tail）
  const ang = (a, b) => Math.atan2(b[1] - a[1], b[0] - a[0]), wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
  // CCD（循環座標下降）：從尾端的關節一路往根部，每個關節轉向目標，再把這個關節的彎度夾在「原本的彎度 ±14°」之內。
  // 跟限制配合得好（FABRIK 加限制會卡住，連尾尖正上方 20 單位都到不了）；自然會從尾尖先捲（尾尖繞過去托果實）
  function fabrik(P, T, iters) {
    const R = rest(), n = P.length, L = [], a = [], a0 = ang(R[I0 - 1], R[I0]);
    for (let i = I0; i < n - 1; i++) { L[i] = Math.hypot(R[i + 1][0] - R[i][0], R[i + 1][1] - R[i][1]); a[i] = ang(P[i], P[i + 1]); }
    const rel = i => wrap(a[i] - (i === I0 ? a0 : a[i - 1])), rrel = i => wrap(ang(R[i], R[i + 1]) - ang(R[i - 1], R[i]));
    const fk = () => { let x = R[I0][0], y = R[I0][1]; P[I0] = [x, y]; for (let i = I0; i < n - 1; i++) { x += Math.cos(a[i]) * L[i]; y += Math.sin(a[i]) * L[i]; P[i + 1] = [x, y]; } };
    fk();
    for (let it = 0; it < iters; it++) {
      for (let j = n - 2; j >= I0; j--) {
        const tip = P[n - 1], pj = P[j];
        let d = wrap(Math.atan2(T[1] - pj[1], T[0] - pj[0]) - Math.atan2(tip[1] - pj[1], tip[0] - pj[0]));
        const r0 = rel(j), c = Math.max(rrel(j) - BEND, Math.min(rrel(j) + BEND, r0 + d)); d = c - r0;
        if (!d) continue;
        for (let i = j; i < n - 1; i++) a[i] += d;
        fk();
      }
    }
    return Math.hypot(P[n - 1][0] - T[0], P[n - 1][1] - T[1]);
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
  const tailReach = (x, y) => { if (!sp6()) return 99; const P = rest().map(q => q.slice()), s0 = P[P.length - 1].slice(); let e = 99; for (let f = 1; f <= 30; f++) { const k = f / 30; e = fabrik(P, [s0[0] + (x - s0[0]) * k, s0[1] + (y - s0[1]) * k], f < 30 ? 4 : 12); } return e; };
  // tgt：果實元素（尾尖去托它）／"mouth"（送到下巴前的交接點）／null（尾巴放回原位）
  // 尾尖走一條弧線：去托果實時微微抬起；送到嘴前時從身體下方繞過去（不從臉、角或身體中間穿過）；收回時往下回到原位
  const mouthLocal = box => { const m = cpt(box, "mouth"); return toLocal(box, m[0] - 5, m[1] + 6); };   // 下巴前面一點點（交接點）
  async function tailTo(box, tgt, ms, onFrame) {   // onFrame：尾巴每寫一格就呼叫（pet-stage.js 在同一格把果實對齊尾尖）   // 果實跟著尾尖走由 pet-stage.js 的 follow() 負責（尾尖是 .cp-tail，在變形群組裡）
    if (!sp6()) return;
    let P = (box.__chain || rest()).map(q => q.slice());
    const st = P[P.length - 1].slice();
    // 每一格：從上一格的姿勢做 FABRIK，再限制每個關節點這一格最多移 6 個單位（FABRIK 偶爾會換一種彎法，限速讓它換得過去、不會一格跳到底）
    const step = T => { const prev = P.map(q => q.slice()); fabrik(P, T, 8); P = P.map((q, i) => { const dx = q[0] - prev[i][0], dy = q[1] - prev[i][1], d = Math.hypot(dx, dy), m = 6; return d > m ? [prev[i][0] + dx / d * m, prev[i][1] + dy / d * m] : q; }); };
    const goal = () => { if (!tgt) return TIP6; if (tgt === "mouth") return mouthLocal(box); const r = tgt.getBoundingClientRect(); return toLocal(box, r.left + r.width / 2, r.top + r.height * .62); };
    await tween(ms, (e, k) => {
      const g = goal(), c = tgt === "mouth" ? [(st[0] + g[0]) / 2, Math.max(st[1], g[1]) + 26] : tgt ? [(st[0] + g[0]) / 2, Math.min(st[1], g[1]) - 16] : [(st[0] + g[0]) / 2, Math.max(st[1], g[1]) + 10];
      const u = 1 - e, T = [u * u * st[0] + 2 * u * e * c[0] + e * e * g[0], u * u * st[1] + 2 * u * e * c[1] + e * e * g[1]];
      step(T);
      if (!tgt) { const R = rest(), w = e * e; P = P.map((q, i) => [q[0] + (R[i][0] - q[0]) * w, q[1] + (R[i][1] - q[1]) * w]); }   // 收回：一路混回原本的形狀（最後一格剛好是原形，不會跳）
      applyChain(box, P); if (onFrame) onFrame();
    });
    for (let f = 0; tgt && f < 12; f++) {   // 每格限速可能讓尾尖晚一點到：多跟幾格，真的碰到目標才結束
      const g = goal(); if (Math.hypot(P[P.length - 1][0] - g[0], P[P.length - 1][1] - g[1]) < 1) break;
      step(g); applyChain(box, P); if (onFrame) onFrame(); await new Promise(r => requestAnimationFrame(r));
    }
    if (!tgt) { resetField(box); box.__chain = null; }
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
    if (box.__xtra) Object.assign(box.__gv || (box.__gv = {}), box.__xtra);   // 收步時額外疊上的值（見 goTo 的收步）
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
    if (E.stand && !box.__bow && !box.__lie) { E.stand.style.translate = ""; E.stand.style.transform = ""; E.stand.style.transition = ""; }
  };
  // 角色的版面寬度（px）：用 clientWidth，不能用 getBoundingClientRect——轉身（rotateY）時畫面上的寬度會變窄，步幅就會算錯
  // 1 個 SVG 單位＝幾 px（主角的畫布四周有留白，viewBox 不一定是 200 寬）；svgY：圖上的 y → 畫面 y
  const pxu = box => { const c = box.querySelector("#petEmoji .pet-critter"); if (!c) return .84; const w = (c.viewBox && c.viewBox.baseVal && c.viewBox.baseVal.width) || 200; return (c.clientWidth || c.getBoundingClientRect().width || 168) / w; };
  const svgY = (c, r, y) => { const vb = c.viewBox && c.viewBox.baseVal; return vb && vb.height ? r.top + (y - vb.y) / vb.height * r.height : r.top + r.height * y / 200; };
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
  const strideD = (box, g) => (g.stride / g.duty) * pxu(box);   // 一個步伐週期身體走多遠（支撐期剛好走一個步幅）
  function pose(box, g, p, s, dir) {   // p＝步伐相位（可以超過 1）、s＝走路的程度 0..1（起步／停下時漸變）、dir＝±1
    const TAU = Math.PI * 2, f = x => (x % 1 + 1) % 1, u = (1 / pxu(box));
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
    if (g.mode !== "swim") set(box, "--ghy", ((g.head || 0) * lag * s).toFixed(2) + "px");   // 神龍的頭跟著繩波（ropeRender）
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
  // ── 幼蟲掉頭（2026-10-06 改真的 U 型迴轉）：把身體當成走在地面上的一條路——頸部往鏡頭方向繞半圈（半徑 LV_R），
  // 身體每一點都走頸部走過的路（毛毛蟲轉向：頭前段先抬起探向一邊，身體再沿著頭的路線跟過去）。地面的深度 Z 投影到畫面＝往下移（越近越低），
  // 所以繞過來的那段在下面、看得出是在地上繞。以前：身體縮成一團躲到頭後面、再從另一邊伸出來（像伸縮管）。
  // 轉完剛好等於「鏡像、朝另一邊」的樣子：換成 .lv-l、角色平移一點、深度往前一點（下一次往後繞，不會一直往前）
  let LSP = null; const lsp = () => LSP || (LSP = typeof PET_ART !== "undefined" && PET_ART.larvaSpine ? PET_ART.larvaSpine(16) : [{ x: 44, y: 166 }, { x: 134, y: 146 }]);
  const spY = u => { const S = lsp(); if (u <= S[0].x) return S[0].y; for (let i = 1; i < S.length; i++) if (u <= S[i].x) { const a = S[i - 1], b = S[i], t = (u - a.x) / (b.x - a.x); return a.y + (b.y - a.y) * t; } return S[S.length - 1].y; };
  const LV_NECK = 146, LV_R = 22, LV_KZ = .5, LV_BODY = 122;
  async function larvaTurn(box, dir) {
    const f = lvFace(box); if (f === dir) return;
    box.classList.add("walking"); box.dataset.walk = "crawl";
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
    await tween(ms, e => { const L = l0 + (ld - l0) * e, X = x0 + (lx - x0) * e; lvPose(box, (x, y) => { const k = K(x); return [x + X * k, y + L * k]; });
      if (E.head) E.head.style.transform = `translate(${(X * kh).toFixed(2)}px, ${(L * kh).toFixed(2)}px)`; if (onFrame) onFrame(); });
    box.__bend = ld || lx ? [ld, lx] : null; if (!box.__bend) { lvReset(box); if (E.head) E.head.style.transform = ""; }
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
      set(box, "--wx", x + "px"); set(box, "--wy", y1 + "px"); box.__wy = null; const E = els(box); [E.critter, E.shadow, E.prop].forEach(el => { if (el) el.style.translate = ""; }); return;
    }
    box.classList.add("walking"); box.dataset.walk = g.mode;
    box.__k = 0;   // 起步後（轉完身）再量
    let rev = false;
    if (g.mode === "stand") { if (!box.classList.contains("standing")) await standUp(box, dir); else if (!opts.keepFace) await turnStand(box, dir); g = Object.assign({}, g, { D: strideD(box, g) }); }
    else if (g.mode === "crawl") {   // 幼蟲：頭在前面爬（以前往左走是尾巴先走）；要換方向先原地掉頭
      if (!opts.keepFace && lvFace(box) !== dir) { box.classList.remove("walking"); await larvaTurn(box, dir); return goTo(box, x, Object.assign({}, opts, { keepFace: true })); }
      rev = lvFace(box) !== dir;   // 小碎步往後退：波從頭傳到尾
      const n = Math.max(1, Math.round(Math.abs(dist) / (g.Du / ((1 / pxu(box))))));   // 整數道波
      g = Object.assign({}, g, { D: Math.abs(dist) / n });
    }
    else if (!opts.keepFace && g.mode !== "fly") await face(box, dir);   // 蝶不轉身（正面對稱、靠身體內傾表示方向）：rotateY 會讓量口器位置的 getScreenCTM 不準
    // 預備：往下蹲、往後縮一點
    if (!opts.keepFace && g.mode !== "crawl") { set(box, "--gpre", "1"); await sleep(150); set(box, "--gpre", "0"); }   // 小碎步不用預備；幼蟲的預備就是第一道波
    box.__k = g.mode === "stand" || g.mode === "crawl" ? 0 : calib(box);   // 站姿用 IK（SVG 單位、沒有 3D 轉身），不用量
    const Lp = g.mode === "fly" ? Math.hypot(Math.abs(dist), Math.abs(y1 - y0)) : Math.abs(dist);   // 蝶按「真的飛過的路」推進（水平近、垂直遠時以前會兩格就掉到底）
    const ramp = Math.min(Lp * .35, 26);   // 起步／停下的緩衝距離
    const arc = g.mode === "fly" ? Math.min(28, Math.abs(dist) * .3) : 0;   // 蝶：飛一道弧線過去（不是貼著直線滑）
    let p = 0, t = performance.now(), done = 0, lastS = .15;
    await new Promise(res => {
      const step = () => { const now = performance.now();
        const dt = Math.min(.05, (now - t) / 1000); t = now;
        const left = Lp - done;
        const ease = Math.min(1, (done + 2) / ramp, (left + 2) / ramp);   // 起步加速、快到時減速
        const v = g.v * (.25 + .75 * ease), ds = Math.min(left, v * dt);
        done += ds; p += ds / g.D * (Math.abs(dist) / Lp);
        const kk = Math.min(1, done / Lp);
        moveTo(box, x0 + dir * Math.abs(dist) * kk, y0 + (y1 - y0) * (g.mode === "fly" ? kk * kk * (3 - 2 * kk) : kk) - arc * Math.sin(Math.PI * kk));
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
        box.__xtra = { "--gsx": (dir * 5 * Math.sin(k * Math.PI * 1.6) * (1 - k)).toFixed(2) + "px", "--gtr": ((g.tail || 0) * 1.2 * Math.sin(k * Math.PI * 2.4) * (1 - k)).toFixed(2) + "deg" };
        pose(box, g, p1 + k * .25, s * Math.min(.6, lastS), dir);   // 從走路最後的幅度接著收（以前一律從 0.6 開始，停下那一格步伐突然變大）
        box.__xtra = null;
        if (k < 1) raf = requestAnimationFrame(step); else res();
      };
      raf = requestAnimationFrame(step);
    });
    if (g.mode === "swim") resetField(box);
    if (g.mode === "crawl") lvReset(box);
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
      const sol = st === 4 ? solveLie(box, berryEl, .32) : solveBow(box, berryEl, st, .32), tx = Math.round(cur + sol.dx), back = Math.sign(tx - cur) === -f;   // 虎：用趴姿算站位   // 嘴已經超過果實一點：往後退一小步（不轉身）
      const bb = berryEl.getBoundingClientRect(), wy = Math.round(Math.max(-6, Math.min(6, curY(box) + bb.bottom - svgY(em.querySelector(".pet-critter"), c, 196))));   // 前後（深度）：站到果實那條線上（最多 ±6px）
      await goTo(box, tx, { wy, keepFace: back });
      return;
    }
    if (st === 1) {   // 幼蟲：嘴（頭）先決定要不要掉頭，掉頭時頭不動；然後往頭的方向爬到嘴在果實上
      const f = lvFace(box), mo = Math.abs(mouthDx), hx = cur + f * mo, need = Math.sign(berryX - hx) || f;
      if (need !== f && Math.abs(berryX - hx) > 60) await larvaTurn(box, need);   // 果實只在嘴後面一點點：倒退幾步就好（掉頭要繞一整圈，2026-10-06）
      await goTo(box, Math.round(berryX - lvFace(box) * mo), { keepFace: true });
      return;
    }
    if (st === 2) {   // 蝶：落在果實旁邊約 50px（2026-10-05 第二輪從 30 拉開：果實常被後翅蓋住，看不出在吸哪一顆）（口器斜斜伸過去吸），腳尖（圖上 y≈160）剛好踩在果實的那條地面線上
      const tipY = svgY(em.querySelector(".pet-critter"), c, 160);
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
  // ── 老虎趴著吃（2026-10-06，像人面獅身）：eh＝後腿收起來（臀部沉下去）、ef＝前腿往前伸平（胸口沉下去），0..1；nk＝脖子往下。
  // 身體整個往下 LIE_D（肚子貼地），後面先沉時前端微微抬起（pitch）；四條腿用跟走路同一套兩節 IK：
  // 前掌往前伸到身體前方的地上、後掌收在髖下面（膝蓋往上折），腳掌都在地面線上
  const LIE_D = 27;
  function lieSet(box, eh, ef, nk) {
    const E = els(box), geo = legGeo(box); if (!E.stand) return;
    const R = Math.PI / 180, drop = (eh + ef) / 2 * LIE_D, pitch = (eh - ef) * 12, th = -pitch * R, cs = Math.cos(th), sn = Math.sin(th);
    E.stand.style.transition = "none"; E.stand.style.translate = "";
    E.stand.style.transform = `${box.classList.contains("face-r") ? "translateX(-96px) scale(-1, 1) " : ""}translate(0px, ${drop.toFixed(2)}px) rotate(${pitch.toFixed(2)}deg)`;
    for (const n of ["fl", "fr", "hl", "hr"]) {
      const [lg, sh] = E.legs[n] || []; const G = geo[n]; if (!lg || !G) continue;
      const hx = parseFloat(lg.style.getPropertyValue("--ox")), hy = parseFloat(lg.style.getPropertyValue("--oy")), [L1, L2, dx] = G, front = n[0] === "f";
      const Tx = hx + dx + (front ? -34 * ef : 5 * eh), Ty = hy + L1 + L2;   // 地上的目標點（世界座標）
      const wx = Tx - PIV[0], wy = Ty - drop - PIV[1], bx = PIV[0] + cs * wx - sn * wy, by = PIV[1] + sn * wx + cs * wy;   // 換到身體座標（先扣掉下沉，再轉回傾斜）
      const tx = bx - hx, ty = by - hy, Rr = Math.hypot(dx, L2), dd = Math.atan2(-dx, L2);
      const d = Math.min(Math.hypot(tx, ty), L1 + Rr - .01);
      const thT = Math.atan2(-tx, ty) / R, al = Math.acos(Math.max(-1, Math.min(1, (L1 * L1 + d * d - Rr * Rr) / (2 * L1 * d)))) / R;
      const a = front ? thT + al : thT - al, kx = -L1 * Math.sin(a * R), ky = L1 * Math.cos(a * R);
      lg.style.transform = `rotate(${a.toFixed(2)}deg)`; if (sh) sh.style.transform = `rotate(${((Math.atan2(-(tx - kx), ty - ky) - dd) / R - a).toFixed(2)}deg)`;
    }
    if (E.neck) { E.neck.style.transition = "none"; E.neck.style.transform = `rotate(${nk.toFixed(2)}deg)`; }
    if (E.head2) { E.head2.style.transition = "none"; E.head2.style.transform = `rotate(${(-nk * .8).toFixed(2)}deg)`; }
    box.__lie = [eh, ef, nk];
  }
  function lie(box, eh, ef, nk, ms) {   // 從現在的姿勢平滑過去；趴下：後腿先、前腿晚 30%；站起來：前腿先、後腿晚
    const [h0, f0, n0] = box.__lie || [0, 0, 0], t0 = performance.now(), D = ms || 600, down = eh + ef > h0 + f0;
    const ss = v => { v = Math.max(0, Math.min(1, v)); return v * v * (3 - 2 * v); };
    return new Promise(res => { const step = () => { const k = Math.min(1, (performance.now() - t0) / D), a = ss(k / .7), b = ss((k - .3) / .7);
      const eH = h0 + (eh - h0) * (down ? a : b), eF = f0 + (ef - f0) * (down ? b : a);
      lieSet(box, eH, eF, n0 + (nk - n0) * ss(k)); if (k < 1) raf = requestAnimationFrame(step); else { if (!eh && !ef && !nk) { bowClear(box); box.__lie = null; } res(); } };
      raf = requestAnimationFrame(step); });
  }
  // 趴著的時候脖子要往下多少，嘴才碰到果實上緣；dx＝嘴還差多少（畫面 px）——在原地套上趴姿量、量完還原（不會畫出來）
  function solveLie(box, b, biteY) {
    const em = box.querySelector("#petEmoji"), prev = box.__lie;
    const gap = nk => { lieSet(box, 1, 1, nk); void em.offsetWidth; const m = cpt(box, "mouth"), br = b.getBoundingClientRect(); return [br.left + br.width / 2 - m[0], br.top + br.height * biteY - m[1]]; };
    let x0 = -10, x1 = -40, y0 = gap(x0)[1], y1 = gap(x1)[1];
    for (let it = 0; it < 5 && Math.abs(y1) > 1.2 && y1 !== y0; it++) { const x2 = Math.max(-95, Math.min(25, x1 - y1 * (x1 - x0) / (y1 - y0))); x0 = x1; y0 = y1; x1 = x2; y1 = gap(x1)[1]; }
    const dx = gap(x1)[0];
    if (prev) lieSet(box, prev[0], prev[1], prev[2]); else { bowClear(box); box.__lie = null; }
    void em.offsetWidth;
    return { nk: x1, dx, dy: y1 };
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
  async function home(box) {
    if (!box) return;
    // 幼蟲：離家不遠就倒退爬回去（收縮波從頭傳到尾，真的毛毛蟲也會），不用為了回中間掉頭
    const back = stage(box) === 1 && Math.sign(0 - curX(box)) === -lvFace(box) && Math.abs(curX(box)) <= 100;
    await goTo(box, 0, { wy: 0, keepFace: back }); await sitDown(box); await face(box, 0, 300);
  }
  function stop(box) { cancelAnimationFrame(raf); if (box) { box.classList.remove("walking", "pf-front", "pf-x", "pf-y"); setQ(box, 0); ["--wx", "--wy", "--face"].forEach(k => box.style.removeProperty(k)); clearGait(box); } }
  // 接觸點的畫面座標：mouth＝嘴（.pr-mouth 的支點，跟著頭的所有變換）；其他＝pet-art.js 畫的 .cp-*（手掌、尾尖、裂紋）
  function cpt(box, name) {
    const em = box.querySelector("#petEmoji"); if (!em) return null;
    if (name === "palms") { const a = cpt(box, "palm-l"), b = cpt(box, "palm-r"); return a && b ? [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] : a || b; }   // 幼龍雙手捧著：兩個手掌的中點
    let el = name === "mouth" ? part(box, ".pr-mouth") : em.querySelector(".cp-" + name); if (!el || !el.getScreenCTM) return null;
    const M = el.getScreenCTM(); if (!M) return null;
    const x = name === "mouth" ? parseFloat(el.style.getPropertyValue("--ox")) : +el.getAttribute("cx"), y = name === "mouth" ? parseFloat(el.style.getPropertyValue("--oy")) : +el.getAttribute("cy");
    const q = new DOMPoint(x, y).matrixTransform(M); return [q.x, q.y];
  }
  // 現在看得到的那一份身體（站著時是 .pr-stand）裡找部位
  const part = (box, sel) => { const em = box.querySelector("#petEmoji"); if (!em) return null; return (box.classList.contains("standing") && em.querySelector(".pr-stand " + sel)) || em.querySelector(sel); };
  return { rope, pxu, svgY, tween, goTo, goEat, home, face, stop, standUp, sitDown, turnStand, setQ, larvaTurn, bend, part, bow, bowSet, bowClear, solveBow, lie, lieSet, solveLie, groundY, cpt, tailTo, tailReach, GAIT, _pose: pose };   // _pose：測試逐相位檢查用
})();
