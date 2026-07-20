// 把 data/recompute_osm_spine.py 算好的「主脊長度」（存在 data/trails.json）套進前端資料 web/js/trails-data.js。
// 因為 trails-data.js 是獨立產物（pack-trails 只重打包它、不讀 trails.json），OSM 長度修正要靠這支橋接。
// 用法：python3 data/recompute_osm_spine.py && node scripts/apply-spine-lengths.mjs && npm run data:pack
import fs from "fs";

const trails = JSON.parse(fs.readFileSync("data/trails.json", "utf8"));
const fix = new Map();
for (const t of trails) {
  if (t.source === "osm" && t.id != null && t.length_km != null) {
    fix.set(String(t.id), {
      length_km: t.length_km,
      difficulty: t.difficulty,
      difficulty_label: t.difficulty_label,
      difficulty_estimated: t.difficulty_estimated,
      family_friendly: t.family_friendly,
    });
  }
}

let src = fs.readFileSync("web/js/trails-data.js", "utf8");
let arr;
if (src.includes("window.TRAILS = [")) {
  arr = JSON.parse(src.slice(src.indexOf("["), src.lastIndexOf("]") + 1));
} else {
  const g = { window: {} };
  new Function("window", src)(g.window);   // 打包格式：執行解碼還原 window.TRAILS
  arr = g.window.TRAILS;
}
if (!Array.isArray(arr) || arr.length < 100) { console.error("讀不到 TRAILS 陣列"); process.exit(1); }

let changed = 0, matched = 0;
for (const t of arr) {
  if (t.source !== "osm" || t.id == null) continue;
  const f = fix.get(String(t.id));
  if (!f) continue;
  matched++;
  if (t.length_km !== f.length_km) changed++;
  t.length_km = f.length_km;
  t.difficulty = f.difficulty;
  t.difficulty_label = f.difficulty_label;
  t.difficulty_estimated = f.difficulty_estimated;
  t.family_friendly = f.family_friendly;
}
// 寫回原始（未打包）格式，交給 pack-trails.mjs 再壓縮
fs.writeFileSync("web/js/trails-data.js", "window.TRAILS = " + JSON.stringify(arr) + ";\n");
console.log(`OSM 對到 ${matched} 條、長度實際變更 ${changed} 條 → 已寫回 web/js/trails-data.js（記得再跑 npm run data:pack）`);
