// 全部步道預先用地形圖算「真的累積爬升」：沿路線約每 25 m 取一點，查 AWS Terrain Tiles（terrarium，z14 約 9 m 一格），
// 雙線性內插＋中值／移動平均去噪＋2 m 遲滯門檻累加——跟 App 記錄校正（web/js/elevation.js recompute）同一套，
// 拿 2183 條步道官方爬升驗證過：中位誤差約 7.5%。
//
// 以前：林業署 118 條的「累積爬升」其實是「最高 − 最低海拔」；社群步道只用 12 個點估，彎多的路會少算。
// 輸出 data/trail_gain.json：{ id: { g: 爬升, d: 下降, hi, lo, km: 路線幾何長度, lp: 環狀 1／單程 0 } }，pack-trails.mjs 會併進 trails-data.js。
// 地形圖快取在 ~/tools/terrarium-cache（不進版控）；可重跑、會續用快取。
// 用法：node scripts/compute-gain.mjs [--only=forestry]
// 地形資料：AWS Terrain Tiles（Mapzen；SRTM、ETOPO1 等開放資料），App 已標註「Terrain: AWS/Mapzen」。
import fs from "fs";
import os from "os";
import path from "path";
import zlib from "zlib";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CACHE = path.join(os.homedir(), "tools", "terrarium-cache");
fs.mkdirSync(CACHE, { recursive: true });
const Z = 14;
const only = (process.argv.find(a => a.startsWith("--only=")) || "").slice(7);

// ── 讀步道與幾何 ──
const g = { window: {} };
new Function("window", fs.readFileSync(path.join(ROOT, "web/js/trails-data.js"), "utf8"))(g.window);
for (const f of fs.readdirSync(path.join(ROOT, "web/js/geo"))) new Function("window", fs.readFileSync(path.join(ROOT, "web/js/geo", f), "utf8"))(g.window);
const TRAILS = g.window.TRAILS, GEO = g.window.TRAILS_GEO || {};

// ── 幾何工具（跟 App 一樣）──
function hav(a, b) {
  const R = 6371000, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
  const s = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
// 同 web/js/profile.js chainAll：多段用最近端點貪婪串成一條（不折返）
function chainAll(geometry) {
  const segs = (geometry || []).filter(s => s && s.length >= 2).map(s => s.slice());
  if (!segs.length) return [];
  if (segs.length === 1) return segs[0];
  let si = 0; for (let i = 1; i < segs.length; i++) if (segs[i].length > segs[si].length) si = i;
  const used = new Array(segs.length).fill(false); used[si] = true;
  let p = segs[si].slice();
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
  for (let n = 1; n < segs.length; n++) {
    const end = p[p.length - 1]; let best = -1, rev = false, bd = Infinity;
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue; const s = segs[i];
      const dh = d2(end, s[0]), dt = d2(end, s[s.length - 1]);
      if (dh < bd) { bd = dh; best = i; rev = false; } if (dt < bd) { bd = dt; best = i; rev = true; }
    }
    if (best < 0) break; used[best] = true;
    // 兩段之間跳太遠（> 300 m）就不接：避免把隔壁山頭的碎段的高度差算進來
    if (Math.sqrt(bd) * 111000 > 300) continue;
    p = p.concat(rev ? segs[best].slice().reverse() : segs[best]);
  }
  return p;
}
// 沿線等距取樣（每 step 公尺一點，上限 cap）
function resample(pts, step, cap) {
  const d = [0]; for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + hav(pts[i - 1], pts[i]));
  const total = d[d.length - 1]; if (!total) return { pts: [], total: 0 };
  const n = Math.max(2, Math.min(cap, Math.round(total / step) + 1)), out = [];
  let j = 1;
  for (let k = 0; k < n; k++) {
    const t = total * k / (n - 1);
    while (j < d.length - 1 && d[j] < t) j++;
    const a = pts[j - 1], b = pts[j], f = (t - d[j - 1]) / ((d[j] - d[j - 1]) || 1);
    out.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
  }
  return { pts: out, total };
}

// ── PNG 解碼（terrarium 是 8-bit RGB/RGBA，不用外部套件）──
function decodePng(buf) {
  let off = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off), type = buf.toString("ascii", off + 4, off + 8), data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ct = data[9]; if (data[8] !== 8 || data[12] !== 0) throw new Error("unsupported png"); }
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    off += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0; if (!bpp) throw new Error("png color type " + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? px[y * stride + x - bpp] : 0, b = y ? px[(y - 1) * stride + x] : 0, c = (x >= bpp && y) ? px[(y - 1) * stride + x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += (pa <= pb && pa <= pc) ? a : pb <= pc ? b : c; }
      px[y * stride + x] = v & 255;
    }
  }
  const e = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) e[i] = px[i * bpp] * 256 + px[i * bpp + 1] + px[i * bpp + 2] / 256 - 32768;
  return { e, w, h };
}
const mem = new Map();
async function tile(x, y) {
  const k = `${x}/${y}`; if (mem.has(k)) return mem.get(k);
  const p = (async () => {
    const file = path.join(CACHE, `${Z}-${x}-${y}.png`);
    let buf;
    if (fs.existsSync(file)) buf = fs.readFileSync(file);
    else {
      for (let tries = 0; ; tries++) {
        try {
          const r = await fetch(`https://elevation-tiles-prod.s3.amazonaws.com/terrarium/${Z}/${x}/${y}.png`, { signal: AbortSignal.timeout(30000) });
          if (!r.ok) throw new Error("HTTP " + r.status);
          buf = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(file, buf); break;
        } catch (e) { if (tries >= 3) throw e; await new Promise(r => setTimeout(r, 1000 * (tries + 1))); }
      }
    }
    return decodePng(buf);
  })();
  mem.set(k, p);
  if (mem.size > 400) mem.delete(mem.keys().next().value);
  return p;
}
function tileXY(lat, lon) {
  const n = 2 ** Z, la = lat * Math.PI / 180;
  return { fx: (lon + 180) / 360 * n, fy: (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n };
}
async function elev(lat, lon) {
  const { fx, fy } = tileXY(lat, lon), tx = Math.floor(fx), ty = Math.floor(fy), t = await tile(tx, ty);
  const fpx = (fx % 1) * 256, fpy = (fy % 1) * 256, w = t.w, hm = t.h - 1;
  const x0 = Math.max(0, Math.min(w - 1, Math.floor(fpx))), y0 = Math.max(0, Math.min(hm, Math.floor(fpy)));
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(hm, y0 + 1), dx = fpx - x0, dy = fpy - y0;
  const a = t.e[y0 * w + x0], b = t.e[y0 * w + x1], c = t.e[y1 * w + x0], d = t.e[y1 * w + x1];
  const top = a + (b - a) * dx, bot = c + (d - c) * dx; return top + (bot - top) * dy;
}
// 同 web/js/elevation.js recompute
function recompute(v) {
  const med3 = (a, b, c) => Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
  let s = v.map((e, i) => (i > 0 && i < v.length - 1) ? med3(v[i - 1], e, v[i + 1]) : e);
  s = s.map((e, i) => (i > 0 && i < s.length - 1) ? (s[i - 1] + e + s[i + 1]) / 3 : e);
  let up = 0, down = 0, ref = s[0], hi = s[0], lo = s[0];
  for (const e of s) { if (e > hi) hi = e; if (e < lo) lo = e; const dz = e - ref; if (Math.abs(dz) >= 2) { if (dz > 0) up += dz; else down -= dz; ref = e; } }
  return { g: Math.round(up), d: Math.round(down), hi: Math.round(hi), lo: Math.round(lo) };
}

// ── 主程式 ──
const OUT = path.join(ROOT, "data/trail_gain.json");
const result = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, "utf8")) : {};
const redo = process.argv.includes("--all");
const todo = TRAILS.filter(t => GEO[t.id] && (!only || t.source === only) && (redo || !result[t.id] || result[t.id].lp == null));
console.log(`有路線幾何的步道 ${todo.length} 條（全部 ${TRAILS.length}）`);
let done = 0, fail = 0; const t0 = Date.now();
const CONC = 6; let idx = 0;
async function worker() {
  while (idx < todo.length) {
    const t = todo[idx++];
    try {
      const route = chainAll(GEO[t.id]);
      if (route.length < 2) continue;
      const { pts, total } = resample(route, 25, 1500);
      if (pts.length < 2) continue;
      const v = []; for (const p of pts) v.push(await elev(p[0], p[1]));
      if (v.some(x => !isFinite(x) || x < -500 || x > 4500)) throw new Error("bad elevation");
      // 環狀：路線頭尾相距 < 150 m、而且夠長（太短的碎段頭尾本來就近）
      const lp = total > 800 && hav(route[0], route[route.length - 1]) < 150 ? 1 : 0;
      result[t.id] = Object.assign(recompute(v), { km: Math.round(total / 10) / 100, lp });
    } catch (e) { fail++; if (fail < 10) console.warn("✗", t.id, e.message); }
    if (++done % 200 === 0) { console.log(`${done}/${todo.length}　${Math.round((Date.now() - t0) / 1000)} 秒　快取圖磚 ${fs.readdirSync(CACHE).length}`); fs.writeFileSync(OUT, JSON.stringify(result)); }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
fs.writeFileSync(OUT, JSON.stringify(result));
console.log(`完成 ${Object.keys(result).length} 條，失敗 ${fail}，${Math.round((Date.now() - t0) / 1000)} 秒 → data/trail_gain.json`);
