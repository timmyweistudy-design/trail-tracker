// 海拔剖面圖：沿步道路線取樣海拔（Open-Meteo elevation，免金鑰），畫成剖面。
const Profile = (() => {
  const cache = {};

  // 把多段線串成單一點序列
  function flatten(geometry) {
    const pts = [];
    for (const seg of geometry) for (const p of seg) pts.push(p);
    return pts;
  }

  // 沿線等距取樣 n 點（依累積距離）
  function sample(geometry, n = 30) {
    const pts = flatten(geometry);
    if (pts.length <= n) return pts;
    const d = [0];
    for (let i = 1; i < pts.length; i++)
      d.push(d[i - 1] + haversine({ lat: pts[i - 1][0], lon: pts[i - 1][1] }, { lat: pts[i][0], lon: pts[i][1] }));
    const total = d[d.length - 1];
    const out = [];
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
    const res = await fetch(`https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`);
    if (!res.ok) throw new Error("elev");
    return (await res.json()).elevation;
  }

  // 回傳 {svg, gain, min, max, distKm}
  async function build(id, geometry) {
    if (cache[id]) return cache[id];
    if (!geometry || !geometry.length) return null;
    let pts = sample(geometry, 30);
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
    let gain = 0;
    for (let i = 1; i < elev.length; i++) if (elev[i] > elev[i - 1]) gain += elev[i] - elev[i - 1];
    const min = Math.min(...elev), max = Math.max(...elev);
    const W = 300, H = 90, pad = 4;
    const span = (max - min) || 1;
    const xy = elev.map((e, i) => [
      pad + (W - 2 * pad) * dist[i] / (dist[dist.length - 1] || 1),
      pad + (H - 2 * pad) * (1 - (e - min) / span),
    ]);
    const line = xy.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
    const area = `${line} L${xy[xy.length - 1][0].toFixed(1)},${H - pad} L${xy[0][0].toFixed(1)},${H - pad} Z`;
    const svg = `<svg viewBox="0 0 ${W} ${H}" class="profile-svg" preserveAspectRatio="none">
      <path d="${area}" fill="#cfe3d4"/><path d="${line}" fill="none" stroke="#2f7d4f" stroke-width="2"/></svg>`;
    const result = { svg, gain: Math.round(gain), min: Math.round(min), max: Math.round(max), distKm };
    cache[id] = result;
    return result;
  }

  return { build };
})();
