// 地形海拔校正(DEM)：用準確的水平軌跡查地面真實高度，重算爬升/下降/海拔。
// 資料源 Open-Meteo Elevation（免費、無金鑰、CORS 開放）。GPS 高度太雜，這比它準很多。
const Elevation = (() => {
  const API = "https://api.open-meteo.com/v1/elevation";

  // 降取樣到 ≤max 點（保留首尾），減少請求數
  function downsample(track, max) {
    const pts = (track || []).filter(p => p && p.lat != null && p.lon != null);
    if (pts.length <= max) return pts;
    const step = (pts.length - 1) / (max - 1), out = [];
    for (let i = 0; i < max; i++) out.push(pts[Math.round(i * step)]);
    return out;
  }

  async function lookupChunk(pts) {
    const lat = pts.map(p => p.lat.toFixed(5)).join(",");
    const lon = pts.map(p => p.lon.toFixed(5)).join(",");
    const r = await fetch(`${API}?latitude=${lat}&longitude=${lon}`);
    if (!r.ok) throw new Error("elev " + r.status);
    const j = await r.json();
    return j.elevation || [];
  }
  async function lookup(pts) {
    const out = [];
    for (let i = 0; i < pts.length; i += 100) {
      out.push(...await lookupChunk(pts.slice(i, i + 100)));
      if (i + 100 < pts.length) await new Promise(r => setTimeout(r, 250));
    }
    return out;
  }

  // 從 DEM 高度序列重算（DEM 乾淨，用小門檻去除量化雜訊）
  function recompute(elevs) {
    const v = (elevs || []).filter(e => typeof e === "number");
    if (v.length < 2) return null;
    let ascent = 0, descent = 0, ref = v[0], high = v[0], low = v[0];
    const DB = 2;
    for (const e of v) {
      if (e > high) high = e; if (e < low) low = e;
      const dz = e - ref;
      if (Math.abs(dz) >= DB) { if (dz > 0) ascent += dz; else descent += -dz; ref = e; }
    }
    return { ascent: Math.round(ascent), descent: Math.round(descent), altHigh: Math.round(high), altLow: Math.round(low) };
  }

  async function correct(track) {
    try {
      const pts = downsample(track, 200);
      if (pts.length < 2) return null;
      return recompute(await lookup(pts));
    } catch (e) { if (typeof console !== "undefined") console.warn("elev correct failed", e && e.message); return null; }
  }

  return { correct, downsample, recompute };
})();
if (typeof module !== "undefined") module.exports = Elevation;
