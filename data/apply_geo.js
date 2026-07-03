#!/usr/bin/env node
// 用「執行期同一套 chainSegments」驗收 refine_geo.py 的補幾何候選：
// 只在候選讓「模擬覆蓋長度更貼近官方、且不超過 1.6x」時採用，保證整體覆蓋只增不減、零回歸。
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const GEO_JS = path.join(ROOT, "web/js/trails-geo.js");

function hav(a, b) { const R = 6371000, t = x => x * Math.PI / 180; const dLat = t(b[0] - a[0]), dLon = t(b[1] - a[1]); const s = Math.sin(dLat / 2) ** 2 + Math.cos(t(a[0])) * Math.cos(t(b[0])) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(s)); }
// 從 app.js 抽出執行期 chainSegments（單一事實來源）
const app = fs.readFileSync(path.join(ROOT, "web/js/app.js"), "utf8");
eval(app.slice(app.indexOf("function chainSegments"), app.indexOf("// 骨架卡"))
  .replace(/haversine\(\{ lat: ([^,]+), lon: ([^}]+)\}, \{ lat: ([^,]+), lon: ([^}]+)\}\)/g, "hav([$1,$2],[$3,$4])"));
function simLen(g) { const r = chainSegments(g); let L = 0; for (let i = 1; i < r.length; i++) L += hav(r[i - 1], r[i]); return L; }

function loadGeo() { const s = fs.readFileSync(GEO_JS, "utf8"); return JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1)); }
const geo = loadGeo();
const cand = JSON.parse(fs.readFileSync(path.join(__dirname, "geo_candidates.json"), "utf8"));
const td = fs.readFileSync(path.join(ROOT, "web/js/trails-data.js"), "utf8");
const T = {}; for (const t of JSON.parse(td.slice(td.indexOf("["), td.lastIndexOf("]") + 1))) T[t.id] = t;

let applied = 0, rejected = 0;
for (const id in cand) {
  const t = T[id]; if (!t || !t.length_km) continue;
  const off = t.length_km * 1000;
  const before = simLen(geo[id]) / off;             // 現況模擬覆蓋比
  const after = simLen(cand[id]) / off;             // 候選模擬覆蓋比
  // 採用條件：候選更貼近官方(|r-1| 更小) 且 不超過 1.6x（執行期走完岔路後仍合理）
  if (after <= 1.6 && Math.abs(after - 1) < Math.abs(before - 1) - 0.1) {
    geo[id] = cand[id]; applied++;
  } else rejected++;
}
fs.writeFileSync(GEO_JS,
  "// 自動產生：步道路線幾何（延遲載入）｜refine_geo.py 交叉補幾何 + apply_geo.js 執行期驗收\n" +
  "window.TRAILS_GEO = " + JSON.stringify(geo) + ";\n");
console.log(`[apply] 候選 ${Object.keys(cand).length} 條：執行期驗收採用 ${applied} 條、駁回 ${rejected} 條（駁回＝會超長或沒更好）`);
