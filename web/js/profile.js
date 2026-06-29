// 海拔剖面圖：沿步道路線取樣海拔（Open-Meteo elevation，免金鑰），畫成剖面。
const Profile = (() => {
  const cache = {};

  // 把多段路線用最近端點貪婪串接成單一連續點序列（涵蓋整條步道，非只取最長一段；不折返）
  function chainAll(geometry) {
    const segs = (geometry || []).filter(s => s && s.length >= 2).map(s => s.slice());
    if (!segs.length) return [];
    if (segs.length === 1) return segs[0];
    let si = 0; for (let i = 1; i < segs.length; i++) if (segs[i].length > segs[si].length) si = i;
    const used = new Array(segs.length).fill(false); used[si] = true;
    let path = segs[si].slice();
    const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
    for (let n = 1; n < segs.length; n++) {
      const end = path[path.length - 1];
      let best = -1, rev = false, bd = Infinity;
      for (let i = 0; i < segs.length; i++) {
        if (used[i]) continue; const s = segs[i];
        const dh = d2(end, s[0]), dt = d2(end, s[s.length - 1]);
        if (dh < bd) { bd = dh; best = i; rev = false; } if (dt < bd) { bd = dt; best = i; rev = true; }
      }
      if (best < 0) break; used[best] = true;
      path = path.concat(rev ? segs[best].slice().reverse() : segs[best]);
    }
    return path;
  }

  // 沿點序列等距取樣 n 點（依累積距離）
  function sampleAlong(pts, n) {
    if (pts.length <= n) return pts;
    const d = [0];
    for (let i = 1; i < pts.length; i++)
      d.push(d[i - 1] + haversine({ lat: pts[i - 1][0], lon: pts[i - 1][1] }, { lat: pts[i][0], lon: pts[i][1] }));
    const total = d[d.length - 1], out = [];
    for (let k = 0; k < n; k++) {
      const target = total * k / (n - 1);
      let i = 1; while (i < d.length - 1 && d[i] < target) i++;
      out.push(pts[i]);
    }
    return out;
  }

  async function elevations(points) {
    const lat = points.map(p => p[0].toFixed(5)).join(",");
    const lon = points.map(p => p[1].toFixed(5)).join(",");
    // 主來源 Open-Meteo；失敗(限流/錯誤)改用 OpenTopoData SRTM 備援
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
      if (res.ok) { const e = (await res.json()).elevation; if (e && e.length) return e; }
    } catch { /* 換備援 */ }
    const locs = points.map(p => `${p[0].toFixed(5)},${p[1].toFixed(5)}`).join("|");
    const res2 = await fetch(`https://api.opentopodata.org/v1/srtm30m?locations=${locs}`);
    if (!res2.ok) throw new Error("elev");
    return (await res2.json()).results.map(r => r.elevation);
  }

  // 回傳 {svg, gain, min, max, distKm}
  const LS = id => "tt_prof_v2_" + id;   // v2：取樣 90 點演算法；舊版自動失效
  // 持久化快取，限 25 筆 FIFO，避免塞爆 localStorage 影響其他寫入（如記錄存檔）
  function persist(id, result) {
    try {
      localStorage.setItem(LS(id), JSON.stringify(result));
      let idx = []; try { idx = JSON.parse(localStorage.getItem("tt_prof_idx") || "[]"); } catch (e) { }
      idx = idx.filter(x => x !== id); idx.push(id);
      while (idx.length > 25) { const old = idx.shift(); localStorage.removeItem(LS(old)); }
      localStorage.setItem("tt_prof_idx", JSON.stringify(idx));
    } catch (e) {
      try { JSON.parse(localStorage.getItem("tt_prof_idx") || "[]").forEach(x => localStorage.removeItem(LS(x))); localStorage.removeItem("tt_prof_idx"); } catch (e2) { }
    }
  }
  async function build(id, geometry) {
    if (cache[id]) return cache[id];
    try { const s = localStorage.getItem(LS(id)); if (s) { const r = JSON.parse(s); cache[id] = r; return r; } } catch (e) { /* */ }
    if (!geometry || !geometry.length) return null;
    // 串接全部路段成一條，再沿線等距取樣 90 點（涵蓋整條、解析度更高）
    const route = chainAll(geometry);
    if (route.length < 2) return null;
    let pts = sampleAlong(route, 90);
    let elev = await elevations(pts);
    // 過濾無效海拔（Open-Meteo 對部分點可能回 null），避免剖面圖出現 NaN
    const keep = elev.map((e, i) => [e, i]).filter(([e]) => e != null && !isNaN(e));
    if (keep.length < 2) return null;
    pts = keep.map(([, i]) => pts[i]);
    elev = keep.map(([e]) => e);
    // 累積距離
    const dist = [0];
    for (let i = 1; i < pts.length; i++)
      dist.push(dist[i - 1] + haversine({ lat: pts[i - 1][0], lon: pts[i - 1][1] }, { lat: pts[i][0], lon: pts[i][1] }));
    const distKm = dist[dist.length - 1] / 1000;
    // 累積爬升：用 3m 門檻去除 DEM 量化雜訊（與記錄端校正一致）
    let gain = 0, ref = elev[0];
    for (let i = 1; i < elev.length; i++) { const dz = elev[i] - ref; if (Math.abs(dz) >= 3) { if (dz > 0) gain += dz; ref = elev[i]; } }
    const min = Math.min(...elev), max = Math.max(...elev);
    const W = 300, H = 90, pad = 4;
    const span = (max - min) || 1;
    const xy = elev.map((e, i) => [
      pad + (W - 2 * pad) * dist[i] / (dist[dist.length - 1] || 1),
      pad + (H - 2 * pad) * (1 - (e - min) / span),
    ]);
    const line = xy.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const area = `${line} L${xy[xy.length - 1][0].toFixed(1)},${H - pad} L${xy[0][0].toFixed(1)},${H - pad} Z`;
    // #21 依坡度上色：緩=綠、中=琥珀、陡=紅
    const segColor = g => g < 0.10 ? "#4a8f55" : g < 0.22 ? "#c39327" : "#c0542f";
    let segs = "";
    for (let i = 1; i < xy.length; i++) {
      const dh = (dist[i] - dist[i - 1]) || 1;
      const grade = Math.abs(elev[i] - elev[i - 1]) / dh;
      segs += `<line x1="${xy[i - 1][0].toFixed(1)}" y1="${xy[i - 1][1].toFixed(1)}" x2="${xy[i][0].toFixed(1)}" y2="${xy[i][1].toFixed(1)}" stroke="${segColor(grade)}" stroke-width="2.4" stroke-linecap="round"/>`;
    }
    const svg = `<svg viewBox="0 0 ${W} ${H}" class="profile-svg" preserveAspectRatio="none">
      <path d="${area}" fill="#e3ecdf"/>${segs}</svg>`;
    const samples = xy.map((p, i) => ({ x: +p[0].toFixed(1), d: dist[i] / 1000, e: Math.round(elev[i]) }));
    const result = { svg, gain: Math.round(gain), min: Math.round(min), max: Math.round(max), distKm, samples, W };
    cache[id] = result;
    persist(id, result);
    return result;
  }

  return { build };
})();
