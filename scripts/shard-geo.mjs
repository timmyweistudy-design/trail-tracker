// trails-geo.js（1.4MB）依縣市分片：開步道詳情只載該縣市 ~60KB，不必抓全台。
// 產出 web/js/geo/geo-<i>.js（各縣市）＋ geo-manifest.js（region→檔名，開機載入 ~1KB）。
// web/js/trails-geo.js 保留為資料源（refine/apply_geo 的輸出），執行期不再載它。
// 用法：node scripts/shard-geo.mjs（資料更新後重跑）
import fs from "fs";

const src = fs.readFileSync("web/js/trails-geo.js", "utf8");
const GEO = JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1));
const td = fs.readFileSync("web/js/trails-data.js", "utf8");
const g = { window: {} };
new Function("window", td)(g.window);
const regionOf = {};
for (const t of g.window.TRAILS) regionOf[t.id] = t.region || "other";

const shards = {};   // region → {id: geo}
for (const id in GEO) {
  const r = regionOf[id] || "other";
  (shards[r] = shards[r] || {})[id] = GEO[id];
}

fs.mkdirSync("web/js/geo", { recursive: true });
for (const f of fs.readdirSync("web/js/geo")) fs.unlinkSync("web/js/geo/" + f);
const manifest = {};
const regions = Object.keys(shards).sort();
regions.forEach((r, i) => {
  const file = `geo-${i}.js`;
  manifest[r] = file;
  fs.writeFileSync(`web/js/geo/${file}`,
    `// 自動產生（scripts/shard-geo.mjs）：${r} 的步道路線幾何\n` +
    `window.TRAILS_GEO = Object.assign(window.TRAILS_GEO || {}, ${JSON.stringify(shards[r])});\n`);
});
fs.writeFileSync("web/js/geo-manifest.js",
  "// 自動產生（scripts/shard-geo.mjs)：縣市→幾何分片檔名\n" +
  "window.TT_GEO_SHARDS = " + JSON.stringify(manifest) + ";\n");
const sizes = regions.map(r => `${r}:${(fs.statSync("web/js/geo/" + manifest[r]).size / 1024).toFixed(0)}KB`);
console.log(`✓ ${regions.length} 個分片`, sizes.join(" "));
console.log("最大分片:", Math.max(...regions.map(r => fs.statSync("web/js/geo/" + manifest[r]).size / 1024)).toFixed(0), "KB");
