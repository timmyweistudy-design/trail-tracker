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
    1: { mode: "crawl", v: 60, D: 24, bob: 1.5, roll: 0, wave: 7 },                          // 幼蟲：蠕動（收縮波從尾巴往頭傳）
    2: { mode: "fly", v: 140, D: 38, bob: 9, roll: 0, bank: 9 },                               // 蝶：一拍一升的小弧線、轉彎時內傾
    3: { mode: "stand", v: 135, swing: 24, knee: 34, duty: .62, bob: 3, tail: 10, ear: 6, neck: 3.5, legL: 54 },   // 狐：站起來輕快地走（側身四條腿）
    4: { mode: "stand", v: 104, swing: 21, knee: 40, duty: .66, bob: 4.5, tail: 8, ear: 3, neck: -1.2, legL: 52 }, // 虎：慢、沉、腳抬高、頭穩（貓科頭幾乎不動）
    5: { mode: "waddle", v: 78, D: 28, bob: 4.5, roll: 7, lift: 11, duty: .56, tail: 12, ear: 6, head: 2.4 },        // 幼龍：短腿搖搖擺擺
    6: { mode: "swim", v: 125, D: 70, bob: 3, roll: 1.5, tail: 8, head: 1.5 },                 // 神龍：在雲上游
  };
  let raf = 0;
  const set = (box, k, v) => box.style.setProperty(k, v);
  const critterPx = box => { const c = box.querySelector("#petEmoji .pet-critter"); return c ? c.getBoundingClientRect().width || 168 : 168; };
  // 站姿走路的步伐長度：腳在支撐期掃過的距離＝2·腿長·sin(擺角)，換成 px（u＝SVG 單位／px）
  const strideD = (box, g) => (2 * g.legL * Math.sin(g.swing * Math.PI / 180) / g.duty) * critterPx(box) / 200;
  function pose(box, g, p, s, dir) {   // p＝步伐相位（可以超過 1）、s＝走路的程度 0..1（起步／停下時漸變）、dir＝±1
    const TAU = Math.PI * 2, f = x => (x % 1 + 1) % 1, u = 200 / critterPx(box);
    if (g.mode === "stand") {   // 側身四條腿：橫向步序 左後 → 左前 → 右後 → 右前；擺動期膝蓋彎、支撐期腳在地上不動
      const legA = (off, front) => {
        const ph = f(p + off), duty = g.duty;
        if (ph < duty) { const k = ph / duty; return [g.swing * (1 - 2 * k) * s, -4 * Math.sin(Math.PI * k) * s]; }   // 支撐：往前→往後（身體走過去）
        const k = (ph - duty) / (1 - duty), e = k * k * (3 - 2 * k);
        return [g.swing * (-1 + 2 * e) * s, -(front ? g.knee : g.knee * .8) * Math.sin(Math.PI * k) * s];   // 擺動：膝蓋往後彎、往前跨
      };
      const [aHL, bHL] = legA(0, false), [aFL, bFL] = legA(.25, true), [aHR, bHR] = legA(.5, false), [aFR, bFR] = legA(.75, true);
      [["--aHL", aHL], ["--bHL", bHL], ["--aFL", aFL], ["--bFL", bFL], ["--aHR", aHR], ["--bHR", bHR], ["--aFR", aFR], ["--bFR", bFR]].forEach(([k, v]) => set(box, k, v.toFixed(1) + "deg"));
      const contact = .5 + .5 * Math.cos(TAU * 2 * p);
      set(box, "--gby", (g.bob * contact * s).toFixed(2) + "px");
      set(box, "--nk", (g.neck * Math.cos(TAU * 2 * (p - .08)) * s).toFixed(2) + "deg");   // 頭跟著步伐點（虎是反向補償，頭幾乎不動）
      set(box, "--gtr", (g.tail * Math.sin(TAU * (p + .25)) * s).toFixed(2) + "deg");
      set(box, "--gear", (g.ear * Math.cos(TAU * 2 * (p - .12)) * s).toFixed(2) + "deg");
      return;
    }
    const contact = .5 + .5 * Math.cos(TAU * 2 * p);                      // 1＝著地下沉、0＝抬高（每週期兩次）
    let by = (g.bob || 0) * contact * s, br = (g.roll || 0) * Math.sin(TAU * p) * s;
    // 腳：兩組相差半拍（四足的前後各一組也錯開 1/4，形成背上往前傳的起伏）
    const leg = (off, lift) => {
      const ph = f(p + off), duty = g.duty || .6, S = (g.D * duty) * u;     // 支撐期身體走 D*duty，腳要往後退一樣多
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
    set(box, "--ghy", ((g.head || 0) * lag * s).toFixed(2) + "px");
    set(box, "--ghr", (dir * 1.5 * Math.sin(TAU * (p - .1)) * s).toFixed(2) + "deg");
    // 尾巴反向擺、耳朵晚一點彈
    set(box, "--gtr", ((g.tail || 0) * Math.sin(TAU * (p + .25)) * s).toFixed(2) + "deg");
    set(box, "--gear", ((g.ear || 0) * Math.cos(TAU * 2 * (p - .12)) * s).toFixed(2) + "deg");
    // 各種走法的身體
    if (g.mode === "rock") { br = dir * 4 * s + (g.roll) * Math.sin(TAU * p) * s; by = (g.bob) * Math.abs(Math.sin(TAU * p)) * s; }
    if (g.mode === "fly") { by = -(g.bob) * Math.abs(Math.sin(Math.PI * 2 * p)) * s; br = dir * (g.bank) * s; }
    if (g.mode === "crawl") { set(box, "--gwave", f(p).toFixed(3)); by = 0; }
    if (g.mode === "swim") { set(box, "--gwave", f(p).toFixed(3)); br = (g.roll) * Math.sin(TAU * p) * s; by = (g.bob) * Math.sin(TAU * p) * s; }
    if (g.mode === "waddle") br = (g.roll) * Math.sin(TAU * p) * s;
    set(box, "--gby", by.toFixed(2) + "px"); set(box, "--gbr", br.toFixed(2) + "deg"); set(box, "--gs", s.toFixed(3));
  }
  function stage(box) { return +box.dataset.stage || 0; }
  function curX(box) { return parseFloat(box.style.getPropertyValue("--wx")) || 0; }
  // 轉身（3/4 側面）：dir＝-1 往左、1 往右、0 轉回正面
  async function face(box, dir, ms) {
    const from = parseFloat(box.style.getPropertyValue("--face")) || 0, to = dir * 24, t0 = performance.now(), D = ms || 260;
    await new Promise(res => { const step = t => { const k = Math.min(1, (t - t0) / D), e = k * k * (3 - 2 * k); set(box, "--face", (from + (to - from) * e).toFixed(2) + "deg"); if (k < 1) raf = requestAnimationFrame(step); else res(); }; raf = requestAnimationFrame(step); });
  }
  // 走到 x（px，相對舞台中間）。回傳 promise。不支援動畫時直接瞬移。
  async function goTo(box, x, opts) {   // opts.keepFace：小碎步調整位置（往後退一點也不轉身）
    opts = opts || {};
    if (!box) return;
    let g = GAIT[stage(box)] || GAIT[3]; const x0 = curX(box), dist = x - x0, dir = Math.sign(dist) || 1;
    if (reduce()) { set(box, "--wx", x + "px"); return; }
    if (Math.abs(dist) < 3) { set(box, "--wx", x + "px"); return; }
    box.classList.add("walking"); box.dataset.walk = g.mode;
    if (g.mode === "stand") { await standUp(box); if (!opts.keepFace) box.classList.toggle("face-r", dir > 0); g = Object.assign({}, g, { D: strideD(box, g) }); }
    else if (!opts.keepFace) await face(box, dir);
    // 預備：往下蹲、往後縮一點
    if (!opts.keepFace) { set(box, "--gpre", "1"); await sleep(150); set(box, "--gpre", "0"); }   // 小碎步不用預備
    const ramp = Math.min(Math.abs(dist) * .35, 26);   // 起步／停下的緩衝距離
    let p = 0, t = performance.now(), done = 0;
    await new Promise(res => {
      const step = now => {
        const dt = Math.min(.05, (now - t) / 1000); t = now;
        const left = Math.abs(dist) - done;
        const ease = Math.min(1, (done + 2) / ramp, (left + 2) / ramp);   // 起步加速、快到時減速
        const v = g.v * (.25 + .75 * ease), ds = Math.min(left, v * dt);
        done += ds; p += ds / g.D;
        set(box, "--wx", (x0 + dir * done).toFixed(2) + "px");
        pose(box, g, p, Math.max(.15, ease), dir);
        if (left - ds > .2) raf = requestAnimationFrame(step); else res();
      };
      raf = requestAnimationFrame(step);
    });
    // 收步：身體往前多衝一點再回來（彈簧），腳收回、尾巴再擺一下
    const p1 = p, t1 = performance.now();
    await new Promise(res => {
      const step = now => {
        const k = Math.min(1, (now - t1) / (opts.keepFace ? 160 : 320)), s = (1 - k);
        pose(box, g, p1 + k * .25, s * .6, dir);
        set(box, "--gsx", (dir * 5 * Math.sin(k * Math.PI * 1.6) * (1 - k)).toFixed(2) + "px");   // 往前多衝一點再回來
        set(box, "--gtr", ((g.tail || 0) * 1.2 * Math.sin(k * Math.PI * 2.4) * (1 - k)).toFixed(2) + "deg");
        if (k < 1) raf = requestAnimationFrame(step); else res();
      };
      raf = requestAnimationFrame(step);
    });
    set(box, "--gsx", "0px");
    box.classList.remove("walking"); delete box.dataset.walk;
  }
  // 讓「嘴」對準果實：量嘴相對角色中心的位置（已經轉向那一側），走到嘴在果實正上方
  async function goEat(box, berryEl, berryX) {
    const em = box.querySelector("#petEmoji"); if (!em) return;
    const dir = Math.sign(berryX - curX(box)) || 1, g = GAIT[stage(box)] || {};
    if (g.mode === "stand") { await standUp(box); box.classList.toggle("face-r", dir > 0); }
    else await face(box, dir, 200);
    // 嘴的位置要用「低頭吃」的姿勢量（低頭時頭會往前／往下移）：同一格套上姿勢、量完拿掉，畫面不會閃
    const hold = ["st-lean"], old = box.style.getPropertyValue("--ex");
    const nk0 = box.style.getPropertyValue("--nk");
    box.classList.add("no-tr"); box.style.setProperty("--ex", "0"); if (g.mode === "stand") set(box, "--nk", "-70deg"); hold.forEach(k => em.classList.add(k)); void em.offsetWidth;
    const c = em.querySelector(".pet-critter").getBoundingClientRect(), m = (part(box, ".pr-mouth") || part(box, ".pr-head") || em).getBoundingClientRect();
    hold.forEach(k => em.classList.remove(k)); box.style.setProperty("--ex", old || "0"); if (g.mode === "stand") set(box, "--nk", nk0 || "0deg"); void em.offsetWidth; box.classList.remove("no-tr");
    let mouthDx = (m.left + m.width / 2) - (c.left + c.width / 2);   // 嘴在角色中心左右多少 px
    if (stage(box) === 0) mouthDx = dir * c.width * .34;              // 蛋：停在果實旁邊（不是壓在上面），晃一下把它吸進去
    if (stage(box) === 5) { const pw = em.querySelector(dir > 0 ? ".pr-paw.r" : ".pr-paw.l"); if (pw) { const q = pw.getBoundingClientRect(); mouthDx = (q.left + q.width / 2) - (c.left + c.width / 2) + dir * 6; } }   // 幼龍：用前爪撿起來
    await goTo(box, Math.round(berryX - mouthDx));
  }
  // 站起來／坐下（狐、虎）：換成側身站姿，坐下時換回正面坐姿、壓一下
  async function standUp(box) { if (box.classList.contains("standing")) return; set(box, "--nk", "0deg"); box.classList.add("standing"); await sleep(300); }
  async function sitDown(box) { if (!box.classList.contains("standing")) return; box.classList.remove("standing", "face-r"); ["--aHL", "--bHL", "--aFL", "--bFL", "--aHR", "--bHR", "--aFR", "--bFR", "--nk"].forEach(k => box.style.removeProperty(k)); const em = box.querySelector("#petEmoji"); if (em) { em.classList.add("pb-sit"); await sleep(420); em.classList.remove("pb-sit"); } }
  async function home(box) { if (!box) return; await goTo(box, 0); await sitDown(box); await face(box, 0, 300); }
  function stop(box) { cancelAnimationFrame(raf); if (box) { box.classList.remove("walking"); ["--wx", "--face", "--gby", "--gbr"].forEach(k => box.style.removeProperty(k)); } }
  // 現在看得到的那一份身體（站著時是 .pr-stand）裡找部位
  const part = (box, sel) => { const em = box.querySelector("#petEmoji"); if (!em) return null; return (box.classList.contains("standing") && em.querySelector(".pr-stand " + sel)) || em.querySelector(sel); };
  return { goTo, goEat, home, face, stop, standUp, sitDown, part, GAIT };
})();
