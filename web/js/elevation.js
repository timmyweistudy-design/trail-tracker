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

  // 從 DEM 高度序列重算。先 3 點中值壓量化毛刺，再 3 點移動平均進一步去噪，
  // 最後用「遲滯門檻(3m)」累積——只有離開參考點超過 3m 才計，避免 DEM 量化雜訊灌爆爬升，更接近實際。
  function recompute(elevs) {
    const v = (elevs || []).filter(e => typeof e === "number");
    if (v.length < 2) return null;
    const med3 = (a, b, c) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
    let s = v.map((e, i) => (i > 0 && i < v.length - 1) ? med3(v[i - 1], e, v[i + 1]) : e);
    s = s.map((e, i) => (i > 0 && i < s.length - 1) ? (s[i - 1] + e + s[i + 1]) / 3 : e);   // 再平滑一次
    let ascent = 0, descent = 0, ref = s[0], high = s[0], low = s[0];
    const DB = 3;   // 遲滯門檻（公尺）
    for (const e of s) {
      if (e > high) high = e; if (e < low) low = e;
      const dz = e - ref;
      if (Math.abs(dz) >= DB) { if (dz > 0) ascent += dz; else descent += -dz; ref = e; }
    }
    return { ascent: Math.round(ascent), descent: Math.round(descent), altHigh: Math.round(high), altLow: Math.round(low) };
  }

  // 依 gap 標記切段（暫停→繼續的位移不相連，不可把跳段高度差算進爬升）
  function segsOf(track) {
    if (typeof trackSegments === "function") return trackSegments(track);
    return [track || []];
  }
  // 軌跡水平長度（公尺），供決定取樣密度
  function lengthOf(pts) {
    if (typeof haversine !== "function") return 0;
    let s = 0;
    for (let i = 1; i < pts.length; i++) s += haversine(pts[i - 1], pts[i]);
    return s;
  }

  async function correct(track) {
    try {
      const segs = segsOf(track).filter(s => s && s.length > 1);
      if (!segs.length) return null;
      // 取樣密度依總長度調整：約每 20 m 一點，上限 500 點（長程更準、短程不浪費）
      const totalLen = segs.reduce((s, seg) => s + lengthOf(seg), 0);
      const budget = Math.max(100, Math.min(500, Math.round(totalLen / 20) || 200));
      let ascent = 0, descent = 0, high = -Infinity, low = Infinity, any = false;
      for (const seg of segs) {
        const share = Math.max(8, Math.round(budget * (lengthOf(seg) / (totalLen || 1))) || budget);
        const pts = downsample(seg, share);
        if (pts.length < 2) continue;
        const r = recompute(await lookup(pts));
        if (!r) continue;
        any = true;
        ascent += r.ascent; descent += r.descent;
        high = Math.max(high, r.altHigh); low = Math.min(low, r.altLow);
      }
      if (!any) return null;
      return { ascent: Math.round(ascent), descent: Math.round(descent), altHigh: Math.round(high), altLow: Math.round(low) };
    } catch (e) { if (typeof console !== "undefined") console.warn("elev correct failed", e && e.message); return null; }
  }

  return { correct, downsample, recompute };
})();
if (typeof module !== "undefined") module.exports = Elevation;
