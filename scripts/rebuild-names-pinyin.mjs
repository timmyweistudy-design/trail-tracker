// 步道名英譯字典（非中文介面才載入）：拼音基底 + 英文類型詞；知名步道用官方英譯覆蓋。
// 產出 web/js/i18n-names.js 的 window.TT_NAMES。
//
// 讀 data/trails.json（永遠是原格式）而非 web/js/trails-data.js —— 後者跑過 pack-trails.mjs
// 之後是欄式打包格式，直接 JSON.parse 會失敗。
// 預設「只補缺的」：資料擴充後只翻新步道，不動既有譯名也不重打幾千次 API。
//   node scripts/rebuild-names-pinyin.mjs          # 只補缺的（資料更新後跑這個）
//   node scripts/rebuild-names-pinyin.mjs --all    # 全部重翻（改了規則才需要）
import fs from "fs";

const ALL = process.argv.includes("--all");
const trails = JSON.parse(fs.readFileSync("data/trails.json", "utf8"));
const names = new Set();
for (const t of trails) if (t.name) names.add(t.name);

const cur = fs.readFileSync("web/js/i18n-names.js", "utf8");
const N = JSON.parse(cur.slice(cur.indexOf("{"), cur.lastIndexOf("}") + 1));

// 知名步道官方/通行英譯（僅收有把握的）
const FAMOUS = {
  "砂卡礑步道": "Shakadang Trail", "錐麓古道": "Zhuilu Old Trail", "白楊步道": "Baiyang Trail",
  "九曲洞步道": "Tunnel of Nine Turns Trail", "燕子口步道": "Swallow Grotto Trail",
  "特富野古道": "Tefuye Historic Trail", "眠月線": "Mianyue Line",
  "見晴懷古步道": "Jiancing Historic Trail", "台灣山毛櫸步道": "Taiwan Beech Trail",
  "翠峰湖環山步道": "Cuifeng Lake Circular Trail", "松羅國家步道": "Songluo National Trail",
  "林美石磐步道": "Linmei Shipan Trail", "聖母登山步道": "Marian Hiking Trail",
  "草嶺古道": "Caoling Historic Trail", "桃源谷步道": "Taoyuan Valley Trail",
  "嘉明湖國家步道": "Jiaming Lake National Trail", "能高越嶺道": "Nenggao Cross-Ridge Trail",
  "八通關古道": "Batongguan Historic Trail", "魚路古道": "Yulu Historic Trail",
  "五寮尖登山步道": "Wuliaojian Trail", "象山親山步道": "Elephant Mountain Trail",
  "南澳古道": "Nan'ao Historic Trail", "淡蘭古道": "Tamsui-Kavalan Trail",
  "樟之細路": "Raknus Selu Trail", "小錐麓步道": "Xiaozhuilu Trail",
  "鼻頭角步道": "Bitoujiao Trail", "橫嶺古道": "Hengling Historic Trail",
  "南子吝步道": "Nanzilin Trail",
};
const SUF = [["環狀步道", "Loop Trail"], ["自然步道", "Nature Trail"], ["國家步道", "National Trail"], ["親山步道", "Trail"],
  ["登山步道", "Hiking Trail"], ["森林步道", "Forest Trail"], ["觀光步道", "Scenic Trail"], ["景觀步道", "Scenic Trail"],
  ["觀景步道", "Scenic Trail"], ["海岸步道", "Coastal Trail"], ["越嶺古道", "Historic Crossing Trail"],
  ["越嶺道", "Cross-Ridge Trail"], ["懷古步道", "Historic Trail"], ["古道", "Historic Trail"], ["步道", "Trail"],
  ["步徑", "Path"], ["小徑", "Path"], ["山徑", "Trail"], ["主峰線", "Main Peak Route"], ["林道", "Forest Road"],
  ["縱走", "Ridge Traverse"], ["路線", "Route"], ["路徑", "Route"], ["線", "Route"]];

async function rawRom(text) {
  const r = await fetch("https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-TW&tl=en&dt=t&dt=rm&q=" + encodeURIComponent(text), { signal: AbortSignal.timeout(8000) });
  const j = await r.json();
  return (j && j[0] || []).map(seg => seg && (seg[3] || "")).filter(Boolean).join(" ");
}

async function rom(text) {
  let raw = await rawRom(text);
  // 有些名稱 Google 就是不回 romanization（實測 51 個，如「面天山」「保線道」「大崎棟古道」——
  // 語言偵測誤判成日文時整段沒有 rm 欄位）。逐字查則正常，所以退而求其次逐字拼。
  if (!raw) {
    const out = [];
    for (const c of [...text]) {
      if (!/[一-鿿]/.test(c)) { out.push(c); continue; }
      out.push(await rawRom(c));
    }
    raw = out.filter(Boolean).join(" ");
  }
  const syl = raw.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z' ]/g, "").split(/\s+/).filter(Boolean);
  if (!syl.length) return "";
  // 分組：>4 音節取 3、剩 4 取 2+2、否則整組；組內母音開頭音節加 '
  const words = [];
  let i = 0;
  while (i < syl.length) {
    const left = syl.length - i;
    const take = left > 4 ? 3 : (left === 4 ? 2 : left);
    words.push(syl.slice(i, i + take)); i += take;
  }
  return words.map(w => {
    let out = "";
    for (let k = 0; k < w.length; k++) {
      const t = w[k];
      out += (k > 0 && /^[aeou]/.test(t) && !out.endsWith("'")) ? "'" + t : t;
    }
    return out[0].toUpperCase() + out.slice(1);
  }).join(" ");
}

const todo = [...names].filter(n => ALL || !N[n]);
console.error(`步道名 ${names.size} 個；待處理 ${todo.length} 個${ALL ? "（全部重翻）" : "（只補缺的）"}`);
let idx = 0, done = 0, failed = 0;
async function worker() {
  while (idx < todo.length) {
    const zh = todo[idx++];
    done++;
    if (FAMOUS[zh]) { N[zh] = FAMOUS[zh]; continue; }
    let base = zh, sufEn = "Trail", matched = false;
    for (const [cs, es] of SUF) { if (zh.endsWith(cs) && zh.length > cs.length) { base = zh.slice(0, -cs.length); sufEn = es; matched = true; break; } }
    if (!matched && /山$/.test(zh) && zh.length > 1) { base = zh.slice(0, -1); sufEn = "Mountain"; matched = true; }
    if (!matched) { base = zh; sufEn = ""; }
    // 基底含非中文分隔（- / （） 等）：逐段 romanize
    const parts = base.split(/[-‧·／/()（）]+/).filter(Boolean);
    try {
      const roms = [];
      for (const p of parts) roms.push(/[一-鿿]/.test(p) ? await rom(p) : p);
      const r = roms.filter(Boolean).join(" ");
      if (r) N[zh] = (r + (sufEn ? " " + sufEn : "")).replace(/\s+/g, " ").trim();
      else failed++;
    } catch (e) { failed++; }
    if (done % 300 === 0) console.error("...", done, "/", todo.length);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
fs.writeFileSync("web/js/i18n-names.js",
  "// 自動產生（scripts/rebuild-names-pinyin.mjs）：步道名＝拼音+類型詞（知名步道用官方英譯）；縣市鄉鎮＝官方/標準拼音。非中文介面才載入。\n"
  + "window.TT_NAMES = " + JSON.stringify(N) + ";\n");
const still = [...names].filter(n => !N[n]).length;
console.error(`完成：處理 ${done}、失敗 ${failed}；字典 ${Object.keys(N).length} 條；仍缺 ${still} 條`);
