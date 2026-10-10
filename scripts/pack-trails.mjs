// trails-data.js 欄式打包：JSON 物件陣列的鍵名重複佔了大半空間（18 個鍵 × 2187 筆），
// 改成「每欄一個陣列＋低基數欄位字典編碼」，執行期 10 行解碼還原成一模一樣的 window.TRAILS。
// 用法：node scripts/pack-trails.mjs（讀 web/js/trails-data.js 原格式 → 覆寫成打包格式；可重複執行——
// 若已是打包格式則先解碼再重打包，冪等）。build_data.py 重新產資料後要再跑一次本腳本。
import fs from "fs";

const FILE = "web/js/trails-data.js";
let src = fs.readFileSync(FILE, "utf8");

// 取得原始陣列：原格式直接 parse；打包格式用 node 執行解碼
let arr;
if (src.includes("window.TRAILS = [")) {
  arr = JSON.parse(src.slice(src.indexOf("["), src.lastIndexOf("]") + 1));
} else {
  const g = { window: {} };
  new Function("window", src)(g.window);
  arr = g.window.TRAILS;
}
if (!Array.isArray(arr) || arr.length < 100) { console.error("讀不到 TRAILS 陣列"); process.exit(1); }

// OSM 原始名稱的錯字／黏字修正（中文介面直接顯示原文，錯字很顯眼）
const NAME_FIX = {
  "To camp trial and Tianluanchi lake": "To Camp Trail and Tianluanchi Lake",
  "TheDarkSideoftheSword": "The Dark Side of the Sword",
};
let fixed = 0;
for (const t of arr) if (NAME_FIX[t.name]) { t.name = NAME_FIX[t.name]; fixed++; }
if (fixed) console.error(`名稱修正 ${fixed} 筆`);
// OSM 把兩個名字用分號黏在一起（「檜山道路;根本古道」）→ 用「・」
let semi = 0;
for (const t of arr) if (/\s*;\s*/.test(t.name || "")) { t.name = t.name.split(/\s*;\s*/).filter(Boolean).join("・"); semi++; }
if (semi) console.error(`名稱分號 → ・ ${semi} 筆`);

// 地形計算的累積爬升（scripts/compute-gain.mjs → data/trail_gain.json）：
// dem_gain／dem_loss＝沿路線一趟的累積爬升／下降，dem_hi／dem_lo＝路線最高／最低點，geo_km＝路線圖長度，loop＝環狀。
// 能不能信（路線圖跟官方長度差太多就不信）交給執行期 trailAscent() 判斷，這裡照實放。
const GAIN_FILE = "data/trail_gain.json";
if (fs.existsSync(GAIN_FILE)) {
  const G = JSON.parse(fs.readFileSync(GAIN_FILE, "utf8"));
  let n = 0;
  for (const t of arr) {
    for (const k of ["dem_gain", "dem_loss", "dem_hi", "dem_lo", "geo_km", "loop"]) delete t[k];
    const r = G[t.id]; if (!r) continue;
    Object.assign(t, { dem_gain: r.g, dem_loss: r.d, dem_hi: r.hi, dem_lo: r.lo, geo_km: r.km });
    if (r.lp) t.loop = 1;
    n++;
  }
  console.error(`地形爬升併入 ${n} 筆`);
}

// 欄位清單（穩定順序）；condition 是稀疏物件欄位，單獨存
const keys = [...new Set(arr.flatMap(t => Object.keys(t)))].filter(k => k !== "condition");
const DICT_MAX = 200;          // 相異值 ≤200 的欄位做字典編碼
const cols = {}, dicts = {};
for (const k of keys) {
  const vals = arr.map(t => (t[k] === undefined ? null : t[k]));
  const uniq = [...new Set(vals.map(v => JSON.stringify(v)))];
  if (uniq.length <= DICT_MAX && vals.some(v => typeof v === "string")) {
    const table = uniq.map(s => JSON.parse(s));
    const idx = new Map(uniq.map((s, i) => [s, i]));
    dicts[k] = table;
    cols[k] = vals.map(v => idx.get(JSON.stringify(v)));
  } else {
    cols[k] = vals;
  }
}
const cond = {};   // 稀疏：只有少數步道有 condition
arr.forEach((t, i) => { if (t.condition) cond[i] = t.condition; });

const payload = { n: arr.length, keys, dicts, cols, cond };
// 用 JSON.parse('…') 包一層，不直接寫物件字面值：V8 解析大型 JSON 字串比解析同樣的 JS 物件快
// （2026-10-10 優化輪 D2 實測，CPU 降速 4 倍：載入 60–95ms → 40–50ms）。單引號包住，只要跳脫 \ 和 '
const sq = s => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const out = `// 自動產生（scripts/pack-trails.mjs）：欄式＋字典編碼的步道資料，解碼後與原格式完全相同。
// 資料更新流程：python3 data/build_data.py && node scripts/pack-trails.mjs
window.TRAILS = (function () {
  const P = JSON.parse('${sq(JSON.stringify(payload))}');
  const out = new Array(P.n);
  for (let i = 0; i < P.n; i++) {
    const o = {};
    for (const k of P.keys) {
      let v = P.cols[k][i];
      if (P.dicts[k]) v = P.dicts[k][v];
      if (v !== null && v !== undefined) o[k] = v;
    }
    if (P.cond[i]) o.condition = P.cond[i];
    out[i] = o;
  }
  return out;
})();
`;
fs.writeFileSync(FILE, out);

// 驗證：解碼結果與原陣列深等
const g2 = { window: {} };
new Function("window", out)(g2.window);
const dec = g2.window.TRAILS;
// null 與「沒有該鍵」視為等價（原始資料偶有顯式 null；全程式皆用 truthiness/!= null 判斷）
const norm = t => JSON.stringify(Object.keys(t).sort().reduce((o, k) => (t[k] == null ? o : (o[k] = t[k], o)), {}));
let ok = dec.length === arr.length;
for (let i = 0; ok && i < arr.length; i++) if (norm(dec[i]) !== norm(arr[i])) { ok = false; console.error("mismatch at", i); }
// 筆數要用實際長度：寫死數字會在資料量變動後持續印舊值，看起來像管線沒更新（實際已更新）
console.log(ok ? `✓ 解碼驗證：${arr.length} 筆逐筆深等` : "✗ 驗證失敗", "| 大小:", (src.length / 1024).toFixed(0), "KB →", (out.length / 1024).toFixed(0), "KB");
if (!ok) { fs.writeFileSync(FILE, src); console.error("已還原原檔"); process.exit(1); }
