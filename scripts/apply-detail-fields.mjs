// 把 data/trails.json 的 waypoints（沿線地標，enrich_waypoints.py 產）注入前端延遲載入的詳情檔
// web/js/trails-detail.js（window.TRAILS_DETAIL = {id:{...}}）。沒有 detail 條目的步道會補一個最小條目。
// 用法：python3 data/enrich_waypoints.py && node scripts/apply-detail-fields.mjs
import fs from "fs";

const trails = JSON.parse(fs.readFileSync("data/trails.json", "utf8"));
const wp = {};
for (const t of trails) if (t.id && Array.isArray(t.waypoints) && t.waypoints.length) wp[t.id] = t.waypoints;

const src = fs.readFileSync("web/js/trails-detail.js", "utf8");
const a = src.indexOf("{"), b = src.lastIndexOf("}");
if (a < 0 || b < 0) { console.error("讀不到 TRAILS_DETAIL 物件"); process.exit(1); }
const detail = JSON.parse(src.slice(a, b + 1));

let trailsWith = 0, total = 0;
for (const id of Object.keys(detail)) {                 // 先清舊的，再依 trails.json 重設（可重複執行）
  if (detail[id] && typeof detail[id] === "object") delete detail[id].waypoints;
}
for (const id of Object.keys(wp)) {
  if (!detail[id]) detail[id] = {};                     // OSM 步道常沒有其他詳情欄位 → 補最小條目
  detail[id].waypoints = wp[id];
  trailsWith++; total += wp[id].length;
}
fs.writeFileSync("web/js/trails-detail.js",
  "// 自動產生：步道詳情欄位（延遲載入）\nwindow.TRAILS_DETAIL = " + JSON.stringify(detail) + ";\n");
console.log(`沿線地標注入 ${trailsWith} 條步道、共 ${total} 個地標 → web/js/trails-detail.js`);
