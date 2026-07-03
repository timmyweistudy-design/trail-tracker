import fs from "fs";
const d = fs.readFileSync("web/js/trails-data.js", "utf8");
const m = d.match(/window.TRAILS\s*=\s*/);
const arr = JSON.parse(d.slice(m.index + m[0].length).replace(/;\s*$/, ""));

// 22 縣市：官方英文名（不交給機翻）
const REGIONS = {
  "臺北市": "Taipei City", "台北市": "Taipei City", "新北市": "New Taipei City", "桃園市": "Taoyuan City",
  "臺中市": "Taichung City", "台中市": "Taichung City", "臺南市": "Tainan City", "台南市": "Tainan City",
  "高雄市": "Kaohsiung City", "基隆市": "Keelung City", "新竹市": "Hsinchu City", "新竹縣": "Hsinchu County",
  "苗栗縣": "Miaoli County", "彰化縣": "Changhua County", "南投縣": "Nantou County", "雲林縣": "Yunlin County",
  "嘉義市": "Chiayi City", "嘉義縣": "Chiayi County", "屏東縣": "Pingtung County", "宜蘭縣": "Yilan County",
  "花蓮縣": "Hualien County", "臺東縣": "Taitung County", "台東縣": "Taitung County", "澎湖縣": "Penghu County",
  "金門縣": "Kinmen County", "連江縣": "Lienchiang County",
};

const positions = new Set(), names = new Set();
for (const t of arr) { if (t.position) positions.add(t.position); if (t.name) names.add(t.name); }
const todo = [...positions, ...names];
console.error("to translate:", todo.length);

async function tr(text) {
  const r = await fetch("https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-TW&tl=en&dt=t&q=" + encodeURIComponent(text), { signal: AbortSignal.timeout(8000) });
  const j = await r.json();
  return (j[0] || []).map(s => s && s[0]).join("");
}
const out = { ...REGIONS };
let idx = 0, done = 0, fail = 0;
async function worker() {
  while (idx < todo.length) {
    const zh = todo[idx++];
    try { out[zh] = await tr(zh); } catch (e) { try { out[zh] = await tr(zh); } catch (e2) { fail++; } }
    if (++done % 300 === 0) console.error("...", done);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
// 清理：位置字串裡的縣市用官方名（機翻常把 臺北市 翻成 Taipei City ✓，但保險起見開頭換掉）
for (const [zh, en] of Object.entries(out)) {
  if (!en) { delete out[zh]; continue; }
  out[zh] = en.replace(/\s+/g, " ").trim();
}
const js = "// 自動產生（scratchpad/build-names.mjs）：步道名/縣市/鄉鎮的英文名。非中文介面才載入。\n" +
  "window.TT_NAMES = " + JSON.stringify(out) + ";\n";
fs.writeFileSync("web/js/i18n-names.js", js);
console.error("done", done, "fail", fail, "entries", Object.keys(out).length, "bytes", js.length);
