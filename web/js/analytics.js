// 進階分析＋年度回顧（PRO）：統計卡、每月里程/卡路里、雷達、一週節律、匯出、好友比較。
// 由 app.js 拆出；在 app.js 之前載入，函式皆於點擊時才執行（依賴的全域屆時已就緒）。
// 動畫數字 span（配合 countUp）
function cuSpan(to, pre, dec) { return `<span class="cu" data-to="${to}" data-pre="${pre || ""}" data-dec="${dec || 0}">${pre || ""}0</span>`; }
function runCountUps(root) { root.querySelectorAll(".cu").forEach(countUp); }
// 折線圖（配速趨勢用）
function sparkLine(vals) {
  if (!vals || vals.length < 2) return "";
  const W = 280, H = 64, pad = 8;
  const mn = Math.min(...vals), mx = Math.max(...vals), sp = (mx - mn) || 1;
  const xy = vals.map((v, i) => [pad + (W - 2 * pad) * i / (vals.length - 1), pad + (H - 2 * pad) * (1 - (v - mn) / sp)]);
  const line = xy.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)},${H - pad} L${xy[0][0].toFixed(1)},${H - pad} Z`;
  const dots = xy.map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.2" fill="var(--accent)"/>`).join("");
  return `<svg class="ana-spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><path d="${area}" fill="rgba(194,104,61,.16)"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>${dots}</svg>`;
}
// 難度雷達圖（6 軸）
function diffRadar(vals, labels) {
  const cx = 100, cy = 100, R = 64, N = vals.length, max = Math.max(1, ...vals);
  const pt = (i, rr) => { const a = (-90 + i * (360 / N)) * Math.PI / 180; return [cx + rr * Math.cos(a), cy + rr * Math.sin(a)]; };
  const poly = rr => vals.map((_, i) => pt(i, rr).map(n => n.toFixed(1)).join(",")).join(" ");
  let grid = [R * .34, R * .67, R].map(rr => `<polygon points="${poly(rr)}" fill="none" stroke="var(--line-soft)" stroke-width="1"/>`).join("");
  let axes = vals.map((_, i) => { const [ax, ay] = pt(i, R); return `<line x1="${cx}" y1="${cy}" x2="${ax.toFixed(1)}" y2="${ay.toFixed(1)}" stroke="var(--line-soft)" stroke-width="1"/>`; }).join("");
  const dp = vals.map((v, i) => pt(i, R * (v / max)).map(n => n.toFixed(1)).join(",")).join(" ");
  const data = `<polygon points="${dp}" fill="rgba(194,104,61,.28)" stroke="var(--accent)" stroke-width="2" stroke-linejoin="round"/>`;
  let labs = labels.map((l, i) => { const [lx, ly] = pt(i, R + 16); return `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="9.5" fill="var(--ink-soft)" text-anchor="middle" dominant-baseline="middle">${l}<tspan dx="2">${vals[i]}</tspan></text>`; }).join("");
  return `<svg class="ana-radar" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid meet">${grid}${axes}${data}${labs}</svg>`;
}
// 軌跡縮圖（純 SVG 路線形狀），track = [{lat,lon}]
function routeMini(track, cls) {
  if (!track || track.length < 2) return "";
  let minLa = 1e9, maxLa = -1e9, minLo = 1e9, maxLo = -1e9;
  for (const p of track) { minLa = Math.min(minLa, p.lat); maxLa = Math.max(maxLa, p.lat); minLo = Math.min(minLo, p.lon); maxLo = Math.max(maxLo, p.lon); }
  const w = 100, h = 56, pad = 6, sx = (maxLo - minLo) || 1e-6, sy = (maxLa - minLa) || 1e-6;
  const sc = Math.min((w - 2 * pad) / sx, (h - 2 * pad) / sy);
  const ox = (w - sx * sc) / 2, oy = (h - sy * sc) / 2;
  const lines = trackSegments(track).map(seg =>
    `<polyline points="${seg.map(p => `${(ox + (p.lon - minLo) * sc).toFixed(1)},${(oy + (maxLa - p.lat) * sc).toFixed(1)}`).join(" ")}" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`).join("");
  return `<svg class="route-mini ${cls || ""}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">${lines}</svg>`;
}
function openYearReview() {
  if (document.querySelector('[data-ov="year"]')) return;   // 防連點疊層
  const year = new Date().getFullYear();
  const all = realRecords();
  const recs = all.filter(r => (r.date || "").slice(0, 4) === String(year));
  const sum = (a, f) => a.reduce((s, r) => s + (f(r) || 0), 0);
  const km = sum(recs, r => r.distanceKm), asc = sum(recs, r => r.ascent), hrs = sum(recs, r => r.elapsedMs) / 3.6e6;
  const steps = sum(recs, r => r.steps), kcal = sum(recs, r => r.kcal);
  const distinct = new Set(recs.map(r => r.trailName || "自由路線")).size;
  let longest = 0, maxAlt = 0, longestRec = null; recs.forEach(r => { if ((r.distanceKm || 0) > longest) { longest = r.distanceKm || 0; longestRec = r; } maxAlt = Math.max(maxAlt, r.altHigh || 0); });
  const mo = {}; recs.forEach(r => { const m = +(r.date || "").slice(5, 7); if (m) mo[m] = (mo[m] || 0) + 1; });
  const busiest = Object.keys(mo).sort((a, b) => mo[b] - mo[a])[0];
  const tc = {}; recs.forEach(r => { const nm = r.trailName || "自由路線"; tc[nm] = (tc[nm] || 0) + 1; });
  const top = Object.keys(tc).sort((a, b) => tc[b] - tc[a])[0];
  const lastKm = sum(all.filter(r => (r.date || "").slice(0, 4) === String(year - 1)), r => r.distanceKm);
  const delta = km - lastKm;
  const mk = Array(12).fill(0); recs.forEach(r => { const m = +(r.date || "").slice(5, 7); if (m) mk[m - 1] += r.distanceKm || 0; });
  const mkMax = Math.max(1, ...mk);
  const ov = document.createElement("div"); ov.className = "pet-modal"; ov.dataset.ov = "year";
  ov.innerHTML = `<div class="pet-modal-card yr-card anim-seq">
    <button class="sheet-close" id="yrX" aria-label="關閉">${ic("x")}</button>
    <div class="yr-head"><div class="yr-year">${year}</div><div class="yr-title">我的山行回顧</div></div>
    ${recs.length ? `
    <div class="yr-grid">
      <div class="yr-stat"><b>${cuSpan(recs.length, "", 0)}</b><span>趟旅程</span></div>
      <div class="yr-stat"><b>${cuSpan(km, "", 0)}</b><span>公里</span></div>
      <div class="yr-stat"><b>${cuSpan(asc, "↑", 0)}</b><span>公尺爬升</span></div>
      <div class="yr-stat"><b>${cuSpan(hrs, "", 0)}</b><span>小時</span></div>
    </div>
    <div class="yr-sub">
      <div><b>${cuSpan(steps, "", 0)}</b><span>步</span></div>
      <div><b>${cuSpan(kcal, "", 0)}</b><span>大卡</span></div>
      <div><b>${cuSpan(distinct, "", 0)}</b><span>條步道</span></div>
    </div>
    <div class="yr-months">${mk.map((v, i) => `<div class="yr-mo"><div class="yr-mo-v">${v > 0 ? (v >= 10 ? Math.round(v) : v.toFixed(1)) : ""}</div><div class="yr-mo-bar" style="height:${Math.round(v / mkMax * 46) + 3}px;animation-delay:${(i * 0.04).toFixed(2)}s"></div><span>${i + 1}</span></div>`).join("")}</div>
    <div class="yr-mo-cap">每月里程（單位：km）</div>
    ${longestRec && longestRec.track && longestRec.track.length > 1 ? `<div class="yr-route"><div class="yr-route-l">最遠的一條 ‧ ${(longestRec.trailName || "自由路線")}（${longest.toFixed(1)} km）</div>${routeMini(longestRec.track, "yr-route-svg")}</div>` : ""}
    <div class="yr-lines">
      ${longest ? `<div>單次最長 <b>${longest.toFixed(1)} km</b></div>` : ""}
      ${maxAlt ? `<div>最高造訪海拔 <b>${maxAlt} m</b></div>` : ""}
      ${busiest ? `<div>最常出門 <b>${busiest} 月</b></div>` : ""}
      ${top ? `<div>最愛步道 <b>${top}</b></div>` : ""}
      <div>較去年里程 <b>${delta >= 0 ? "↑ +" : "↓ "}${Math.abs(delta).toFixed(0)} km</b></div>
      <div class="yr-foot">↑ 累積爬升約 ${(asc / 3952).toFixed(1)} 座玉山</div>
    </div>
    <div class="yr-btns"><button class="btn primary" id="yrShare">${ic("share")} 分享</button><button class="btn ghost yr-imgbtn" id="yrImg">${ic("camera")} 存成圖片</button></div>`
    : `<div class="social-empty" style="color:#fff">${year} 還沒有行程，今年一起多走幾趟吧！</div>`}
  </div>`;
  document.body.appendChild(ov);
  runCountUps(ov);
  const close = () => ov.remove();
  ov.querySelector("#yrX").addEventListener("click", close);
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  const sh = ov.querySelector("#yrShare");
  if (sh) sh.addEventListener("click", () => {
    const text = `我的 ${year} 山行回顧：${recs.length} 趟、${km.toFixed(0)} km、累積爬升 ↑${Math.round(asc)} m（約 ${(asc / 3952).toFixed(1)} 座玉山）— 循徑拾光`;
    if (navigator.share) navigator.share({ title: "我的山行回顧", text }).catch(() => { });
    else if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast("已複製回顧文字"));
    else toast(text);
  });
  const ib = ov.querySelector("#yrImg");
  const ps = (typeof petStats === "function") ? petStats() : null;
  if (ib) ib.addEventListener("click", () => drawYearImage({ year, n: recs.length, km, asc, hrs, steps, distinct, top, longest, pet: ps, avatar: window.__meAvatar }));
}
// 年度回顧 → 畫成可分享圖片（canvas，不需外部套件）
function drawYearImage(d) {
  if (d.avatar) { const img = new Image(); img.crossOrigin = "anonymous"; img.onload = () => build(img); img.onerror = () => build(null); img.src = d.avatar; }
  else build(null);
  function build(avImg) {
  const W = 540, H = 760, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d");
  const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#1f4730"); g.addColorStop(.6, "#16301f"); g.addColorStop(1, "#112619");
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.strokeStyle = "rgba(224,177,90,.10)"; x.lineWidth = 1.5;
  for (let yy = 80; yy < H; yy += 46) { x.beginPath(); for (let xx = 0; xx <= W; xx += 12) x.lineTo(xx, yy + Math.sin((xx / W) * 6.28) * 10); x.stroke(); }
  x.textAlign = "center";
  // 頭像 + 寵物
  const acx = W / 2, acy = 78, r = 40;
  if (avImg) {
    x.save(); x.beginPath(); x.arc(acx, acy, r, 0, 7); x.closePath(); x.clip();
    x.drawImage(avImg, acx - r, acy - r, r * 2, r * 2); x.restore();
    x.beginPath(); x.arc(acx, acy, r, 0, 7); x.lineWidth = 3; x.strokeStyle = "#e0b15a"; x.stroke();
  }
  if (d.pet) { x.font = "30px sans-serif"; x.fillText(d.pet.emoji || "🐾", avImg ? acx + r - 4 : acx, avImg ? acy + r - 2 : acy + 12); }
  x.fillStyle = "#e0b15a"; x.font = "700 76px 'Noto Serif TC', serif"; x.fillText(String(d.year), W / 2, 200);
  x.fillStyle = "#f3efe4"; x.font = "600 21px 'Noto Serif TC', serif"; x.fillText("我的山行回顧", W / 2, 234);
  const stats = [[d.n, "趟旅程"], [Math.round(d.km), "公里"], ["↑" + Math.round(d.asc), "公尺爬升"], [Math.round(d.hrs), "小時"]];
  stats.forEach((s, i) => {
    const cx = W / 2 + (i % 2 ? 120 : -120), cy = 310 + Math.floor(i / 2) * 124;
    x.fillStyle = "rgba(255,255,255,.07)"; roundRect(x, cx - 110, cy - 46, 220, 104, 14); x.fill();
    x.fillStyle = "#fff"; x.font = "700 38px 'Fraunces', serif"; x.fillText(String(s[0]), cx, cy + 4);
    x.fillStyle = "rgba(243,239,228,.75)"; x.font = "400 15px sans-serif"; x.fillText(s[1], cx, cy + 32);
  });
  x.fillStyle = "rgba(243,239,228,.9)"; x.font = "400 16px sans-serif"; x.textAlign = "center";
  let ly = 596;
  if (d.top) { x.fillText("最愛步道 ‧ " + d.top, W / 2, ly); ly += 30; }
  if (d.longest) { x.fillText("單次最長 " + d.longest.toFixed(1) + " km", W / 2, ly); ly += 30; }
  if (d.pet) { x.fillText("夥伴 " + (d.pet.name || "") + " Lv." + d.pet.level, W / 2, ly); ly += 30; }
  x.fillText("探索 " + d.distinct + " 條步道 ‧ 約 " + (d.asc / 3952).toFixed(1) + " 座玉山", W / 2, ly);
  x.fillStyle = "#e0b15a"; x.font = "700 19px 'Noto Serif TC', serif"; x.fillText("循徑拾光 · Gather the Trail", W / 2, H - 32);
  try { exportCanvas(c, d, avImg); } catch (e) { if (avImg) build(null); else toast("產生圖片失敗"); }
  }
}
function exportCanvas(c, d, avImg) {
  c.toBlob(async (blob) => {
    if (!blob) { toast("產生圖片失敗"); return; }
    const file = new File([blob], `循徑拾光-${d.year}-回顧.png`, { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "我的山行回顧" }); return; } catch (e) { }
    }
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast("已存成圖片");
  }, "image/png");
}
function roundRect(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
function openAnalytics() {
  if (document.querySelector('[data-ov="analytics"]')) return;   // 防連點疊層
  const recs = realRecords();
  const pro = (typeof Premium !== "undefined") && Premium.isOn();
  const n = recs.length;
  const totKm = recs.reduce((s, r) => s + (r.distanceKm || 0), 0);
  const totAsc = recs.reduce((s, r) => s + (r.ascent || 0), 0);
  const totHrs = recs.reduce((s, r) => s + (r.elapsedMs || 0), 0) / 3.6e6;
  // 每月里程
  const by = {};
  for (const r of recs) { const m = (r.date || "").slice(0, 7); if (!m) continue; (by[m] = by[m] || { km: 0, asc: 0, n: 0, kcal: 0 }); by[m].km += r.distanceKm || 0; by[m].asc += r.ascent || 0; by[m].kcal += r.kcal || 0; by[m].n++; }
  const months = Object.keys(by).sort().reverse().slice(0, 12);
  const maxKm = Math.max(1, ...months.map(m => by[m].km));
  const maxKcal = Math.max(1, ...months.map(m => by[m].kcal));
  const card = (to, pre, dec, l) => `<div class="ana-card"><div class="ana-cv">${cuSpan(to, pre, dec)}</div><div class="ana-cl">${l}</div></div>`;
  const pb = (label, val) => `<div class="ana-pb"><span>${label}</span><b>${val}</b></div>`;

  // ── 進階（PRO）數據 ──
  let longest = null, steepest = null, fastest = 0;
  for (const r of recs) {
    if (!longest || (r.distanceKm || 0) > (longest.distanceKm || 0)) longest = r;
    if (!steepest || (r.ascent || 0) > (steepest.ascent || 0)) steepest = r;
    const hrs = (r.elapsedMs || 0) / 3.6e6; if (hrs > 0.05) fastest = Math.max(fastest, (r.distanceKm || 0) / hrs);
  }
  const tc = {}; recs.forEach(r => { const nm = r.trailName || "自由路線"; tc[nm] = (tc[nm] || 0) + 1; });
  const favTrail = Object.keys(tc).sort((a, b) => tc[b] - tc[a])[0];
  const avgPace = totHrs > 0 ? totKm / totHrs : 0;
  // 難度分布（用 TRAILS 對照 trailId）
  const tmap = new Map(); if (typeof TRAILS !== "undefined") TRAILS.forEach(t => tmap.set(String(t.id), t.difficulty || 0));
  const diffN = [0, 0, 0, 0, 0, 0, 0];
  recs.forEach(r => { const d = r.trailId != null ? (tmap.get(String(r.trailId)) || 0) : 0; if (d >= 1 && d <= 6) diffN[d]++; });
  const DLBL = ["", "輕鬆", "一般", "進階", "挑戰", "困難", "雪季"];
  const maxD = Math.max(1, ...diffN);
  // 年度比較
  const yr = {}; recs.forEach(r => { const y = (r.date || "").slice(0, 4); if (y) yr[y] = (yr[y] || 0) + (r.distanceKm || 0); });
  const years = Object.keys(yr).sort().reverse().slice(0, 4);
  const maxY = Math.max(1, ...years.map(y => yr[y]));
  // 一週節律
  const wd = [0, 0, 0, 0, 0, 0, 0]; recs.forEach(r => { const d = new Date(r.date); if (!isNaN(d)) wd[d.getDay()]++; });
  const WLBL = ["日", "一", "二", "三", "四", "五", "六"]; const maxW = Math.max(1, ...wd);
  // 配速趨勢（近 14 趟，由舊到新）
  const paced = recs.filter(r => (r.elapsedMs || 0) > 6e4 && (r.distanceKm || 0) > 0)
    .slice(0, 14).reverse().map(r => r.distanceKm / (r.elapsedMs / 3.6e6));

  const proInner = `
    <div class="ana-sec">個人紀錄</div>
    <div class="ana-pbs">
      ${pb("單次最長", (longest ? longest.distanceKm || 0 : 0).toFixed(2) + " km")}
      ${pb("單次最大爬升", "↑" + Math.round(steepest ? steepest.ascent || 0 : 0) + " m")}
      ${pb("最快平均配速", fastest.toFixed(1) + " km/h")}
      ${pb("整體平均配速", avgPace.toFixed(1) + " km/h")}
      ${pb("最常走", favTrail ? favTrail + "（" + tc[favTrail] + " 次）" : "—")}
    </div>
    ${paced.length >= 2 ? `<div class="ana-sec">配速趨勢</div>${sparkLine(paced)}<div class="ana-spark-cap">近 ${paced.length} 趟平均配速（km/h，由舊到新）</div>` : ""}
    <div class="ana-sec">難度分布</div>
    ${diffN.slice(1).some(c => c > 0) ? diffRadar(diffN.slice(1), DLBL.slice(1)) : `<div class="ana-empty-note">尚無對應到分級步道的紀錄</div>`}
    <div class="ana-sec">年度里程</div>
    <div class="ana-list">${years.map(y => `<div class="ana-row"><div class="ana-m">${y}</div><div class="ana-bar"><i style="width:${Math.round(yr[y] / maxY * 100)}%"></i></div><div class="ana-v"><b>${yr[y].toFixed(1)}</b> km</div></div>`).join("")}</div>
    <div class="ana-sec">每月卡路里消耗</div>
    <div class="ana-list">${months.map(m => `
      <div class="ana-row"><div class="ana-m">${m.replace("-", " / ")}</div>
        <div class="ana-bar kcal"><i style="width:${Math.round(by[m].kcal / maxKcal * 100)}%"></i></div>
        <div class="ana-v"><b>${Math.round(by[m].kcal).toLocaleString()}</b> kcal</div></div>`).join("")}</div>
    <div class="ana-sec">一週節律</div>
    <div class="ana-week">${wd.map((c, i) => `<div class="aw"><div class="aw-v">${c}</div><div class="aw-bar" style="height:${Math.round(c / maxW * 46) + 4}px"></div><div class="aw-l">${WLBL[i]}</div></div>`).join("")}</div>
    <div class="ana-spark-cap">各星期的出行次數（單位：次）</div>
    <button class="btn ghost" id="anaCompare" style="margin-top:10px">${ic("users")} 好友里程比較</button>
    <div class="ana-exp">
      <button class="btn ghost" id="anaCsv">${ic("download")} CSV</button>
      <button class="btn ghost" id="anaGpx">${ic("download")} GPX</button>
      <button class="btn ghost" id="anaKml">${ic("download")} KML</button>
    </div>`;

  const proLocked = `
    <div class="ana-lock">
      <div class="ana-lock-ic">${ic("sparkle")}</div>
      <b>進階分析（PRO）</b>
      <div class="ana-lock-d">個人紀錄・配速・難度分布・年度比較・一週節律・匯出 CSV/GPX</div>
      <button class="btn primary" id="anaUp" style="max-width:220px;margin:12px auto 0">升級 Premium 解鎖</button>
    </div>`;

  const totSteps = recs.reduce((s, r) => s + (r.steps || 0), 0);
  const distinct = new Set(recs.map(r => r.trailName || "自由路線")).size;
  const ov = document.createElement("div"); ov.className = "pet-modal"; ov.dataset.ov = "analytics";
  ov.innerHTML = `<div class="pet-modal-card anim-seq">
    <button class="sheet-close" id="anaX" aria-label="關閉">${ic("x")}</button>
    <h2>${ic("target")} 進階分析</h2>
    ${n ? `
    <div class="ana-cards">
      ${card(n, "", 0, "總出行")}
      ${card(totKm, "", 1, "總里程 km")}
      ${card(totAsc, "↑", 0, "總爬升 m")}
      ${card(totHrs, "", 1, "總時數 小時")}
      ${card(totSteps, "", 0, "總步數")}
      ${card(distinct, "", 0, "探索步道")}
    </div>
    <div class="ana-sec">每月里程</div>
    <div class="ana-list">${months.map(m => `
      <div class="ana-row"><div class="ana-m">${m.replace("-", " / ")}</div>
        <div class="ana-bar"><i style="width:${Math.round(by[m].km / maxKm * 100)}%"></i></div>
        <div class="ana-v"><b>${by[m].km.toFixed(1)}</b>km ・ ↑${Math.round(by[m].asc)}m ・ ${by[m].n}次</div></div>`).join("")}</div>
    ${pro ? proInner : proLocked}`
    : `<div class="social-empty"><span class="ee">${ic("target")}</span>還沒有行程可分析，先去走一條吧。</div>`}
  </div>`;
  document.body.appendChild(ov);
  runCountUps(ov);
  const close = () => ov.remove();
  ov.querySelector("#anaX").addEventListener("click", close);
  ov.addEventListener("click", e => { if (e.target === ov) close(); });
  const up = ov.querySelector("#anaUp"); if (up) up.addEventListener("click", () => { close(); if (typeof Premium !== "undefined") Premium.openUpgrade(); });
  const csv = ov.querySelector("#anaCsv"); if (csv) csv.addEventListener("click", () => exportRecordsCsv(recs));
  const gpx = ov.querySelector("#anaGpx"); if (gpx) gpx.addEventListener("click", async () => { if (typeof GPX !== "undefined" && GPX.exportAll) (GPX.exportAll(await Store.allFull()) ? toast("已下載全部 GPX") : toast("無可匯出的軌跡")); });
  const kml = ov.querySelector("#anaKml"); if (kml) kml.addEventListener("click", async () => exportRecordsKml((await Store.allFull()).filter(isFootRec)));
  const cmp = ov.querySelector("#anaCompare"); if (cmp) cmp.addEventListener("click", openCompare);
}
// KML 匯出（每趟一條 LineString，可匯入 Google Earth）
function exportRecordsKml(recs) {
  const tracks = recs.filter(r => r.track && r.track.length > 1);
  if (!tracks.length) { toast("無可匯出的軌跡"); return; }
  const esc = s => String(s || "").replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  const pm = tracks.map(r => {
    const coords = r.track.map(p => `${p.lon},${p.lat}${p.alt != null ? "," + Math.round(p.alt) : ""}`).join(" ");
    return `<Placemark><name>${esc(r.trailName || "自由路線")}（${(r.distanceKm || 0).toFixed(1)}km）</name><LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString></Placemark>`;
  }).join("");
  const kml = `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>循徑拾光 行程</name>${pm}</Document></kml>`;
  const blob = new Blob([kml], { type: "application/vnd.google-earth.kml+xml" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "trail-records.kml"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000); toast("已匯出 KML");
}
// 好友里程比較：我 + 我追蹤的人，依累積里程排行
async function openCompare() {
  if (document.querySelector('[data-ov="cmpfriends"]')) return;   // 防連點疊層
  if (typeof Supa === "undefined" || !Supa.ready()) { toast("社群尚未啟用"); return; }
  const c = Supa.client(); const { data: u } = await c.auth.getUser();
  if (!u || !u.user) { toast("請先到社群分頁登入"); return; }
  const ov = document.createElement("div"); ov.className = "pet-modal";
  ov.dataset.ov = "cmpfriends";
  ov.innerHTML = `<div class="pet-modal-card"><button class="sheet-close" id="cmpX">${ic("x")}</button><h2>${ic("users")} 好友里程比較</h2><div id="cmpBody"><div class="feed-loading"><span class="spin"></span></div></div></div>`;
  document.body.appendChild(ov);
  ov.querySelector("#cmpX").addEventListener("click", () => ov.remove());
  ov.addEventListener("click", e => { if (e.target === ov) ov.remove(); });
  try {
    const { data: fol } = await c.from("follows").select("following_id").eq("follower_id", u.user.id);
    const ids = [u.user.id, ...((fol || []).map(r => r.following_id))];
    const { data: profs } = await c.from("profiles").select("id, handle, display_name, total_km, pet_level").in("id", ids);
    const list = (profs || []).map(p => ({ ...p, km: +(p.total_km || 0) })).sort((a, b) => b.km - a.km);
    const body = ov.querySelector("#cmpBody"); if (!body) return;
    if (list.length < 2) { body.innerHTML = `<div class="social-empty"><span class="ee">${ic("users")}</span>追蹤更多山友，就能一起比里程！</div>`; return; }
    const max = Math.max(1, ...list.map(p => p.km));
    body.innerHTML = `<div class="cmp-list">${list.map((p, i) => `<div class="cmp-row${p.id === u.user.id ? " me" : ""}"><span class="cmp-rank">${i + 1}</span><span class="cmp-name">${(p.display_name || p.handle || "山友")}${p.id === u.user.id ? "（我）" : ""}</span><div class="cmp-bar"><i style="width:${Math.round(p.km / max * 100)}%"></i></div><b class="cmp-km">${p.km.toFixed(0)}</b></div>`).join("")}</div>`;
  } catch (e) { const b = ov.querySelector("#cmpBody"); if (b) b.innerHTML = `<div class="social-empty">載入失敗</div>`; }
}
function exportRecordsCsv(recs) {
  const head = "日期,步道,公里,累積爬升m,下降m,大卡,時間分鐘\n";
  const rows = recs.map(r => [
    (r.date || "").slice(0, 10), `"${(r.trailName || "自由路線").replace(/"/g, "'")}"`,
    (r.distanceKm || 0).toFixed(2), Math.round(r.ascent || 0), Math.round(r.descent || 0),
    r.kcal || 0, Math.round((r.elapsedMs || 0) / 60000),
  ].join(",")).join("\n");
  const blob = new Blob(["﻿" + head + rows], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob), a = document.createElement("a");
  a.href = url; a.download = "trail-records.csv"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("已匯出 CSV");
}
