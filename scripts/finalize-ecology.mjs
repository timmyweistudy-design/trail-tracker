// 把 build-ecology.mjs 抓的 iNaturalist 原始資料整理成離線資料檔 web/js/ecology-data.js。
// 清理學名括號、每類取前 8 種。用法：node scripts/finalize-ecology.mjs <raw.json>
import fs from "fs";
const raw = JSON.parse(fs.readFileSync(process.argv[2] || "ecology-raw.json", "utf8"));
const clean = z => z.replace(/\s*[（(].*$/, "").trim();   // 「鼎異色灰蜻 (鼎脈灰蜻)」→「鼎異色灰蜻」
const HAB = {};
for (const [h, g] of Object.entries(raw)) {
  HAB[h] = {};
  for (const [k, list] of Object.entries(g)) HAB[h][k] = [...new Set(list.map(s => clean(s.zh)))].slice(0, 8);
}
const js = "// 自動產生：各環境帶常見物種，資料由 iNaturalist 真實觀察烘焙（research grade、野生、非外來、已濾人為）。\n"
  + "// 重抓：node scripts/build-ecology.mjs <raw.json> && node scripts/finalize-ecology.mjs <raw.json>\n"
  + "window.ECO_HABITATS = " + JSON.stringify(HAB, null, 1) + ";\n"
  + 'if (typeof module !== "undefined" && module.exports) module.exports = window.ECO_HABITATS;\n';
fs.writeFileSync("web/js/ecology-data.js", js);
const nSpecies = Object.values(HAB).reduce((s, g) => s + Object.values(g).reduce((a, l) => a + l.length, 0), 0);
console.log(`→ web/js/ecology-data.js（${Object.keys(HAB).length} 環境帶、共 ${nSpecies} 筆物種）`);
