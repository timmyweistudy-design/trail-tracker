// 年度山行故事（像 Spotify Wrapped）：一頁一頁滑的全螢幕卡片，每頁都能存成 1080×1920 直式圖分享到 IG 限動。
// 從「年度回顧」打開，或 12 月～1 月中在「我的」頁上方的橫幅打開。延遲載入（跟 analytics.js 一樣點了才載）。
// 點右邊下一頁、點左邊上一頁、按住暫停、往下滑或 Esc 關閉；每頁 7 秒自動往下。
const YearStory = (() => {
  const T = s => (typeof ttT === "function" ? ttT(s) : s);
  const DUR = 7000;
  const fmt = (v, d) => Number(v).toLocaleString(ttLocale(), { maximumFractionDigits: d || 0, minimumFractionDigits: d || 0 });
  const moName = m => new Date(2023, m - 1, 1).toLocaleDateString(ttLocale(), { month: "long" });
  const startOf = r => new Date(new Date(r.date).getTime() - (r.elapsedMs || 0));

  // ───────── 整理這一年的數字 ─────────
  function collect(year) {
    const recs = realRecords().filter(r => +localYear(r.date) === year).sort((a, b) => new Date(a.date) - new Date(b.date));
    const sum = f => recs.reduce((s, r) => s + (f(r) || 0), 0);
    const km = sum(r => r.distanceKm), asc = sum(r => r.ascent), hrs = sum(r => r.elapsedMs) / 3.6e6, steps = sum(r => r.steps);
    const mk = Array(12).fill(0), mn = Array(12).fill(0);
    recs.forEach(r => { const m = +localYM(r.date).slice(5, 7); if (m) { mk[m - 1] += r.distanceKm || 0; mn[m - 1]++; } });
    const busiest = mn.some(x => x) ? mn.map((n, i) => [n, mk[i], i]).sort((a, b) => b[0] - a[0] || b[1] - a[1])[0][2] + 1 : 0;
    let longest = null, maxAlt = 0;
    recs.forEach(r => { if (!longest || (r.distanceKm || 0) > (longest.distanceKm || 0)) longest = r; maxAlt = Math.max(maxAlt, r.altHigh || 0); });
    const tc = {}; recs.forEach(r => { const nm = r.trailName; if (nm && nm !== "自由路線") tc[nm] = (tc[nm] || 0) + 1; });
    const top = Object.keys(tc).sort((a, b) => tc[b] - tc[a])[0] || null;
    const distinct = new Set(recs.filter(r => r.trailId || (r.trailName && r.trailName !== "自由路線")).map(r => r.trailId || r.trailName)).size;
    // 出門的節奏：幾點出發、週末比例
    const hours = recs.map(r => startOf(r).getHours() + startOf(r).getMinutes() / 60).sort((a, b) => a - b);
    const midH = hours.length ? hours[Math.floor(hours.length / 2)] : null;
    const weekend = recs.filter(r => [0, 6].includes(startOf(r).getDay())).length;
    // 收集冊：這一年蓋到的章
    let stamps = [];
    try {
      const g = typeof Peaks !== "undefined" ? Peaks.got() : JSON.parse(localStorage.getItem("tt_peaks") || "{}");
      const L = typeof Peaks !== "undefined" ? Peaks.LISTS : null;
      stamps = Object.keys(g).filter(k => g[k] && +localYear(g[k].at) === year).map(k => {
        const list = k[0], no = +k.slice(1), pk = L && L[list] ? L[list].data.find(p => p[0] === no) : null;
        return pk ? { list, name: pk[1], ele: pk[2] } : null;
      }).filter(Boolean).sort((a, b) => b.ele - a.ele);
    } catch (e) { stamps = []; }
    const pet = typeof petStats === "function" ? petStats() : null;
    return { year, recs, n: recs.length, km, asc, hrs, steps, mk, mn, busiest, longest, maxAlt, top, topN: top ? tc[top] : 0, distinct, midH, weekend, stamps, pet };
  }
  function persona(d) {
    if (d.n < 3 || d.midH == null) return null;
    const h = d.midH;
    const p = h < 7 ? ["清晨型山友", "天還沒亮就出發，山上的日出你看最多"] : h < 10 ? ["早鳥山友", "趁早上涼爽出門，下山剛好吃午餐"] : h < 14 ? ["睡飽才出門派", "不趕時間，慢慢走也是一種走法"] : ["午後漫遊者", "下午的光最溫柔，你都挑這時候出門"];
    const ws = d.weekend / d.n;
    const w = ws >= 0.7 ? T("%d% 的行程在週末").replace("%d", Math.round(ws * 100)) : ws <= 0.3 ? T("平日也常出門，%d% 在週間").replace("%d", Math.round((1 - ws) * 100)) : T("週末平日都有出門");
    return { name: T(p[0]), line: T(p[1]), week: w, hm: `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.round((h % 1) * 60 / 5) * 5 % 60).padStart(2, "0")}` };
  }

  // ───────── 每一頁：畫面（html）與圖片（canvas）用同一份內容 ─────────
  // 頁面規格：{ key, theme, kicker, big, unit, lines[], art: "pet"|"months"|"route"|"stamps"|null, cta }
  function pages(d) {
    const out = [];
    const P = d.pet;
    out.push({ key: "cover", theme: "forest", kicker: String(d.year), big: T("我的山行故事"), lines: [T("%n 趟・%k 公里").replace("%n", fmt(d.n)).replace("%k", fmt(d.km, d.km < 10 ? 1 : 0))], art: P ? "pet" : null, hint: T("點右邊看下一頁") });
    const mara = d.km / 42.195, tw = d.km / 394;
    out.push({ key: "dist", theme: "dusk", kicker: T("這一年你走了"), big: fmt(d.km, d.km < 10 ? 1 : 0), unit: T("公里"), lines: [
      tw >= 1 ? T("差不多是台灣頭走到台灣尾 %s 趟").replace("%s", fmt(tw, 1)) : mara >= 1 ? T("≈ %s 場全程馬拉松").replace("%s", fmt(mara, 1)) : T("每一步都算數"),
      d.steps ? T("一共 %s 步").replace("%s", "≈" + fmt(d.steps)) : T("花了 %s 小時在山裡").replace("%s", fmt(d.hrs, 0)),
    ] });
    if (d.asc >= 50) out.push({ key: "climb", theme: "sky", kicker: T("往上爬了"), big: fmt(d.asc), unit: T("公尺"), lines: [
      d.asc >= 3952 * 0.5 ? T("≈ %s 座玉山疊起來").replace("%s", fmt(d.asc / 3952, 1)) : T("≈ %s 座台北 101").replace("%s", fmt(d.asc / 508, 1)),
      d.maxAlt ? T("最高到過海拔 %s 公尺").replace("%s", fmt(d.maxAlt)) : "",
    ].filter(Boolean) });
    if (d.busiest) out.push({ key: "months", theme: "sun", kicker: T("最常出門的月份"), big: moName(d.busiest), lines: [T("%n 趟・%k 公里").replace("%n", fmt(d.mn[d.busiest - 1])).replace("%k", fmt(d.mk[d.busiest - 1], 1))], art: "months" });
    const ps = persona(d);
    if (ps) out.push({ key: "persona", theme: "night", kicker: T("你是哪一種山友"), big: ps.name, lines: [ps.line, T("最常在 %s 出發").replace("%s", ps.hm), ps.week] });
    if (d.top || (d.longest && d.longest.track && d.longest.track.length > 1)) out.push({ key: "fav", theme: "moss", kicker: T(d.top ? "最愛步道" : "最遠的一趟"), big: d.top ? T(d.top) : `${fmt(d.longest.distanceKm || 0, 1)} km`, lines: [
      d.top ? T("走了 %d 次").replace("%d", d.topN) : T(d.longest.trailName || "自由路線"),
      d.longest ? T("最遠的一趟：%s").replace("%s", `${T(d.longest.trailName || "自由路線")} ${fmt(d.longest.distanceKm || 0, 1)} km`) : "",
      d.distinct > 1 ? T("一共走了 %d 條不同的步道").replace("%d", d.distinct) : "",
    ].filter(Boolean).slice(0, 3), art: d.longest && d.longest.track && d.longest.track.length > 1 ? "route" : null });
    if (d.stamps.length) {
      const b = d.stamps.filter(s => s.list === "b").length, x = d.stamps.length - b;
      out.push({ key: "peaks", theme: "snow", kicker: T("今年蓋到的章"), big: fmt(d.stamps.length), unit: T("座"), lines: [
        [b ? T("百岳 %d 座").replace("%d", b) : "", x ? T("小百岳 %d 座").replace("%d", x) : ""].filter(Boolean).join(ttCJK() ? "・" : " · "),
        d.stamps.length > 6 ? T("還有 %d 座").replace("%d", d.stamps.length - 6) : "",   // 前 6 座畫成章，名字不用再寫一次
      ].filter(Boolean), art: "stamps" });
    }
    if (P) out.push({ key: "pet", theme: "forest", kicker: T("陪你走的夥伴"), big: P.name, lines: [`Lv.${P.level}・${T(P.stage)}`, T("今年一起走了 %s 公里").replace("%s", fmt(d.km, d.km < 10 ? 1 : 0))], art: "pet" });
    out.push({ key: "sum", theme: "forest", kicker: T("我的山行回顧"), big: String(d.year), lines: [], art: "sum", stats: [
      [fmt(d.n), T("趟旅程")], [fmt(d.km, d.km < 10 ? 1 : 0), T("公里")], [fmt(d.asc), T("公尺爬升")], [fmt(d.hrs, 0), T("小時")],
    ], extra: [d.top ? `${T("最愛步道")}${ttColon()}${T(d.top)}` : "", d.stamps.length ? T("蓋到 %d 座山的章").replace("%d", d.stamps.length) : ""].filter(Boolean) });
    return out;
  }
  const THEMES = {
    forest: ["#1f4730", "#0f2418", "#e0b15a"], dusk: ["#3b2a5c", "#14112a", "#ffb37a"], sky: ["#1d4f7a", "#0d2236", "#9fd6ff"],
    sun: ["#7a3b16", "#2a140a", "#ffd27a"], night: ["#172338", "#070b14", "#c9d3ff"], moss: ["#2e5a3a", "#122517", "#b8e07a"], snow: ["#4a5a6e", "#18202b", "#ffffff"],
  };

  // ───────── 畫面 ─────────
  function monthsSvg(d, hi) {
    const mx = Math.max(1, ...d.mk);
    return `<div class="ys-months">${d.mk.map((v, i) => `<div class="ys-mo${i + 1 === hi ? " hi" : ""}"><i style="height:${Math.round(v / mx * 100)}%;animation-delay:${(i * 0.05).toFixed(2)}s"></i><span>${i + 1}</span></div>`).join("")}</div>`;
  }
  function artHtml(p, d) {
    if (p.art === "pet" && typeof PET_ART !== "undefined") return `<div class="ys-pet">${PET_ART.svg(petStageIndex(totalKm()), "", typeof petHat === "function" ? petHat() : "")}</div>`;
    if (p.art === "months") return monthsSvg(d, d.busiest);
    if (p.art === "route" && typeof routeMini === "function") return `<div class="ys-route">${routeMini(d.longest.track, "ys-route-svg", true)}</div>`;
    if (p.art === "stamps") return `<div class="ys-stamps">${d.stamps.slice(0, 6).map(s => `<span class="ys-stamp ${s.list}">${ic("mountain")}<b>${escHtml(T(s.name))}</b><small>${fmt(s.ele)} m</small></span>`).join("")}</div>`;
    if (p.art === "sum") return `<div class="ys-grid">${p.stats.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join("")}</div>${p.extra.map(x => `<div class="ys-line">${escHtml(x)}</div>`).join("")}`;
    return "";
  }
  function pageHtml(p, d) {
    return `<div class="ys-page ys-p-${p.key}">
      <div class="ys-kicker">${escHtml(p.kicker)}</div>
      <div class="ys-big${String(p.big).length > 8 ? " long" : ""}">${escHtml(p.big)}${p.unit ? `<small>${escHtml(p.unit)}</small>` : ""}</div>
      ${p.lines.map(l => `<div class="ys-line">${escHtml(l)}</div>`).join("")}
      ${artHtml(p, d)}
      ${p.hint ? `<div class="ys-hint">${escHtml(p.hint)} ›</div>` : ""}
    </div>`;
  }

  // ───────── 圖片（1080×1920，IG 限動比例） ─────────
  function wrap(x, text, maxW) {
    const out = []; let line = "";
    const units = ttCJK() ? [...text] : text.split(/(\s+)/);
    for (const u of units) { const t = line + u; if (x.measureText(t).width > maxW && line) { out.push(line.trim()); line = u.trimStart(); } else line = t; }
    if (line.trim()) out.push(line.trim());
    return out;
  }
  function petImage() {
    return new Promise(res => {
      if (typeof PET_ART === "undefined" || !PET_ART.dataUri) return res(null);
      const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null);
      im.src = PET_ART.dataUri(petStageIndex(totalKm()), 360);
    });
  }
  async function drawPage(p, d) {
    const W = 1080, H = 1920, c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d"), th = THEMES[p.theme] || THEMES.forest;
    try { await document.fonts.load("700 80px TaipeiSans"); } catch (e) { /* */ }
    const g = x.createLinearGradient(0, 0, W * 0.4, H); g.addColorStop(0, th[0]); g.addColorStop(1, th[1]);
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    // 等高線
    x.strokeStyle = "rgba(255,255,255,.06)"; x.lineWidth = 3;
    for (let yy = 220; yy < H; yy += 120) { x.beginPath(); for (let xx = 0; xx <= W; xx += 20) x.lineTo(xx, yy + Math.sin(xx / W * 6.28 + yy / 300) * 36); x.stroke(); }
    const F = "'TaipeiSans', 'PingFang TC', sans-serif";
    x.textAlign = "center";
    let y = 470;
    x.fillStyle = th[2]; x.font = `700 54px ${F}`; x.fillText(p.kicker, W / 2, y); y += 70;
    if (p.key !== "sum") {
      let size = 230; x.font = `800 ${size}px ${F}`;
      while (x.measureText(String(p.big)).width > W - 160 && size > 90) { size -= 10; x.font = `800 ${size}px ${F}`; }
      y += size * 0.85;
      x.fillStyle = "#fff"; x.fillText(String(p.big), W / 2, y);
      if (p.unit) { x.font = `700 60px ${F}`; x.fillStyle = "rgba(255,255,255,.8)"; y += 90; x.fillText(p.unit, W / 2, y); }
      y += 110;
    } else { x.font = `800 200px ${F}`; x.fillStyle = "#fff"; y += 175; x.fillText(String(d.year), W / 2, y); y += 90; }
    x.font = `500 46px ${F}`; x.fillStyle = "rgba(255,255,255,.92)";
    for (const l of p.lines) for (const w of wrap(x, l, W - 200)) { x.fillText(w, W / 2, y); y += 66; }
    y += 40;
    // 圖
    if (p.art === "pet") { const im = await petImage(); if (im) x.drawImage(im, W / 2 - 180, Math.min(y, H - 640), 360, 360); }
    if (p.art === "months") {
      const mx = Math.max(1, ...d.mk), bw = 56, gap = 18, tot = 12 * bw + 11 * gap, x0 = (W - tot) / 2, base = Math.min(y + 420, H - 300);
      d.mk.forEach((v, i) => {
        const h = Math.max(8, v / mx * 380);
        x.fillStyle = i + 1 === d.busiest ? th[2] : "rgba(255,255,255,.35)"; roundRect(x, x0 + i * (bw + gap), base - h, bw, h, Math.min(10, h / 2)); x.fill();   // 圓角不能大於一半高，不然沒走的月份會畫成彎彎的
        x.fillStyle = "rgba(255,255,255,.7)"; x.font = `500 32px ${F}`; x.fillText(String(i + 1), x0 + i * (bw + gap) + bw / 2, base + 46);
      });
    }
    if (p.art === "route" && d.longest && d.longest.track) {
      const tr = d.longest.track; let a = 1e9, b = -1e9, cc = 1e9, dd = -1e9;
      tr.forEach(q => { a = Math.min(a, q.lat); b = Math.max(b, q.lat); cc = Math.min(cc, q.lon); dd = Math.max(dd, q.lon); });
      const bw = W - 260, bh = 520, sc = Math.min(bw / ((dd - cc) || 1e-6), bh / ((b - a) || 1e-6)), ox = (W - (dd - cc) * sc) / 2, oy = Math.min(y, H - 760) + (bh - (b - a) * sc) / 2;
      const P2 = q => [ox + (q.lon - cc) * sc, oy + (b - q.lat) * sc];
      x.strokeStyle = th[2]; x.lineWidth = 12; x.lineJoin = "round"; x.lineCap = "round";
      x.beginPath(); tr.forEach((q, i) => { const [px, py] = P2(q); if (i) x.lineTo(px, py); else x.moveTo(px, py); }); x.stroke();
      [[tr[0], "#3f9d5c"], [tr[tr.length - 1], "#e8893b"]].forEach(([q, col]) => { const [px, py] = P2(q); x.beginPath(); x.arc(px, py, 20, 0, 7); x.fillStyle = col; x.fill(); x.lineWidth = 6; x.strokeStyle = "#fff"; x.stroke(); });
    }
    if (p.art === "stamps") {
      const sn = Math.min(6, d.stamps.length);
      d.stamps.slice(0, 6).forEach((s, i) => {
        const col = i % 2, row = Math.floor(i / 2), lone = i === sn - 1 && sn % 2 === 1;   // 單數個時最後一個置中
        const cx = lone ? W / 2 : W / 2 + (col ? 220 : -220), cy = Math.min(y, H - 760) + 90 + row * 190;
        x.fillStyle = "rgba(255,255,255,.10)"; roundRect(x, cx - 200, cy - 80, 400, 160, 28); x.fill();
        x.fillStyle = "#fff"; x.font = `700 50px ${F}`; x.fillText(T(s.name), cx, cy + 4, 360);
        x.fillStyle = "rgba(255,255,255,.7)"; x.font = `500 34px ${F}`; x.fillText(`${fmt(s.ele)} m`, cx, cy + 54);
      });
    }
    if (p.art === "sum") {
      p.stats.forEach(([v, l], i) => {
        const cx = W / 2 + (i % 2 ? 230 : -230), cy = y + 40 + Math.floor(i / 2) * 260;
        x.fillStyle = "rgba(255,255,255,.08)"; roundRect(x, cx - 210, cy - 100, 420, 220, 30); x.fill();
        x.fillStyle = "#fff"; x.font = `800 92px ${F}`; x.fillText(v, cx, cy + 20);
        x.fillStyle = "rgba(255,255,255,.75)"; x.font = `500 40px ${F}`; x.fillText(l, cx, cy + 82);
      });
      let ey = y + 600; x.font = `500 44px ${F}`; x.fillStyle = "rgba(255,255,255,.9)";
      p.extra.forEach(e => { x.fillText(e, W / 2, ey, W - 160); ey += 66; });
    }
    // 頁尾品牌
    x.fillStyle = th[2]; x.font = `700 44px ${F}`; x.fillText(T("循徑拾光 · Gather the Trail"), W / 2, H - 120);
    x.fillStyle = "rgba(255,255,255,.55)"; x.font = `500 34px ${F}`; x.fillText(`#${d.year}${T("山行回顧")}`, W / 2, H - 66);
    return c;
  }
  async function shareImage(p, d) {
    try {
      const c = await drawPage(p, d);
      const blob = await new Promise(r => c.toBlob(r, "image/png"));
      if (!blob) throw new Error("blob");
      const name = ttCJK() ? `循徑拾光-${d.year}-${p.key}.png` : `gather-the-trail-${d.year}-${p.key}.png`;
      const how = await saveBlob(blob, name, T("我的山行故事"));
      if (how === "saved") toast(T("已存成圖片"));
      return how;
    } catch (e) { toast(T("產生圖片失敗")); return null; }
  }

  // ───────── 播放器 ─────────
  let _opening = false;
  async function open(year) {
    if (document.querySelector('[data-ov="story"]') || _opening) return;
    year = year || new Date().getFullYear();
    // 收集冊還沒開過的人，以前走過的山頂還沒蓋章 → 先補蓋（只做一次），故事裡才有「今年蓋到的章」
    _opening = true;
    try { if (typeof Peaks !== "undefined" && Peaks.backfill) await Peaks.backfill(); } catch (e) { /* */ } finally { _opening = false; }
    if (document.querySelector('[data-ov="story"]')) return;
    const d = collect(year);
    if (!d.n) { toast(T("這一年還沒有行程")); return; }
    const list = pages(d);
    const ov = document.createElement("div"); ov.className = "ys"; ov.dataset.ov = "story";
    ov.innerHTML = `<div class="ys-frame" role="dialog" aria-label="${escHtml(T("我的山行故事"))}">
      <div class="ys-bars">${list.map(() => `<span><i></i></span>`).join("")}</div>
      <button class="ys-x" aria-label="${T("關閉")}">${ic("x")}</button>
      <div class="ys-stage" aria-live="polite"></div>
      <div class="ys-foot"><button class="ys-share" aria-label="${T("存成圖片分享")}">${ic("share")} <span>${T("分享這一頁")}</span></button><span class="ys-count"></span></div>
    </div>`;
    document.body.appendChild(ov);
    const stage = ov.querySelector(".ys-stage"), bars = [...ov.querySelectorAll(".ys-bars i")], frame = ov.querySelector(".ys-frame");
    let i = 0, t0 = 0, held = false, raf = 0, elapsed = 0, closed = false;
    const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    function show(k) {
      i = Math.max(0, Math.min(list.length - 1, k)); elapsed = 0; t0 = performance.now();
      const p = list[i], th = THEMES[p.theme] || THEMES.forest;
      frame.style.setProperty("--ys-a", th[0]); frame.style.setProperty("--ys-b", th[1]); frame.style.setProperty("--ys-c", th[2]);
      stage.innerHTML = pageHtml(p, d);
      bars.forEach((b, j) => { b.style.width = j < i ? "100%" : "0%"; });
      ov.querySelector(".ys-count").textContent = `${i + 1} / ${list.length}`;
    }
    function loop(now) {
      if (closed) return;
      if (!held) elapsed += now - t0;
      t0 = now;
      const f = Math.min(1, elapsed / DUR);
      bars[i].style.width = `${(f * 100).toFixed(1)}%`;
      if (f >= 1) { if (i < list.length - 1) show(i + 1); else held = true; }
      raf = requestAnimationFrame(loop);
    }
    let _a11y = null;
    const close = () => { closed = true; cancelAnimationFrame(raf); if (_a11y) _a11y(); ov.remove(); document.removeEventListener("keydown", onKey); };
    if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: ".ys-x" });
    const onKey = e => { if (e.key === "ArrowRight") show(i + 1); else if (e.key === "ArrowLeft") show(i - 1); else if (e.key === " ") { held = !held; e.preventDefault(); } };
    document.addEventListener("keydown", onKey);
    ov.querySelector(".ys-x").addEventListener("click", close);
    ov.querySelector(".ys-share").addEventListener("click", async e => { e.stopPropagation(); held = true; await shareImage(list[i], d); held = false; });
    // 點左 1/3 上一頁、右邊下一頁；按住暫停；往下滑關閉
    let down = null, holdTimer = 0, wasHold = false;
    stage.addEventListener("pointerdown", e => { down = { x: e.clientX, y: e.clientY, t: Date.now() }; wasHold = false; holdTimer = setTimeout(() => { held = true; wasHold = true; frame.classList.add("held"); }, 260); });
    const up = e => {
      clearTimeout(holdTimer); frame.classList.remove("held");
      if (!down) return;
      const dy = e.clientY - down.y, dx = e.clientX - down.x; const st = down; down = null;
      if (wasHold) { held = false; return; }
      if (dy > 90 && Math.abs(dx) < 80) { close(); return; }
      if (Math.abs(dx) > 50) { show(i + (dx < 0 ? 1 : -1)); return; }
      const r = stage.getBoundingClientRect();
      if (Date.now() - st.t < 600) show(i + (e.clientX - r.left < r.width / 3 ? -1 : 1));
    };
    stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", () => { clearTimeout(holdTimer); down = null; held = false; frame.classList.remove("held"); });
    show(0);
    if (reduce) held = false;
    raf = requestAnimationFrame(t => { t0 = t; loop(t); });
    try { localStorage.setItem("tt_story_seen", String(year)); } catch (e) { /* */ }
    return { show: k => show(k), count: list.length, keys: list.map(p => p.key), close, pause: v => { held = v; }, data: d };
  }
  return { open, collect, pages, drawPage, persona };
})();
if (typeof window !== "undefined") window.YearStory = YearStory;
