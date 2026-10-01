// 步道名英譯字典（非中文介面才載入）：拼音基底 + 英文類型詞；知名步道用官方英譯覆蓋。
// 產出 web/js/i18n-names.js 的 window.TT_NAMES。
//
// 讀 data/trails.json（永遠是原格式）而非 web/js/trails-data.js —— 後者跑過 pack-trails.mjs
// 之後是欄式打包格式，直接 JSON.parse 會失敗。
// 離線、可重現：每次都全部重算（不打網路）。
//   node scripts/rebuild-names-pinyin.mjs           # 重建
//   node scripts/rebuild-names-pinyin.mjs --diff    # 順便印出前 60 筆變動
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

// ── 離線拼音（pinyin-pro）＋類型詞英譯 ──
// 以前用 Google 翻譯的羅馬拼音：常把中文當日文唸（「藤枝段」→ Fujiedadan），類型詞也黏在拼音裡
// （「小關山林道後段」→ Xiaoguanshan Lindaohouduan）。改成離線標準漢語拼音，林道/段/縱走…翻成英文。
import { pinyin, customPinyin } from "pinyin-pro";
// 地名的破音字：pinyin-pro 預設讀法不對的（都蘭讀 du，不是 dou）
customPinyin({ "都蘭": "du lan", "都歷": "du li", "大武": "da wu", "六龜": "liu gui", "龜山": "gui shan", "禪寺": "chan si", "禪": "chan" });
const TERMS = Object.entries({
  "國家森林遊樂區": "National Forest Recreation Area", "森林遊樂區": "Forest Recreation Area", "國家公園": "National Park",
  "自然保護區": "Nature Reserve", "風景區": "Scenic Area", "遊樂區": "Recreation Area",
  "大縱走": "Grand Traverse", "縱走": "Traverse", "環狀步道": "Loop Trail", "自然步道": "Nature Trail", "國家步道": "National Trail",
  "親山步道": "Trail", "登山步道": "Hiking Trail", "健行步道": "Hiking Trail", "森林步道": "Forest Trail", "觀光步道": "Scenic Trail",
  "景觀步道": "Scenic Trail", "觀景步道": "Scenic Trail", "海岸步道": "Coastal Trail", "環山步道": "Circular Trail", "步道群": "Trail Network",
  "越嶺古道": "Historic Crossing Trail", "越嶺道": "Cross-Ridge Trail", "懷古步道": "Historic Trail", "古道": "Historic Trail",
  "步道": "Trail", "步徑": "Path", "小徑": "Path", "山徑": "Trail", "林道": "Forest Road", "警備道": "Patrol Road", "保線道": "Maintenance Path",
  "產業道路": "Farm Road", "登山口": "Trailhead", "主峰線": "Main Peak Route", "主峰": "Main Peak", "吊橋": "Suspension Bridge",
  "瀑布": "Waterfall", "越道": "Crossing Trail", "健走步道": "Walking Trail", "國小": "Elementary School", "原始林": "Primeval Forest",
  "樹木園": "Arboretum", "越嶺國家步道": "Cross-Ridge National Trail", "越嶺步道": "Crossing Trail", "巨木群": "Giant Trees", "巨木": "Giant Tree",
  "療癒步道": "Healing Trail",
  // 縣市與常見地名用官方拼法（不是漢語拼音的 Taibei、Gaoxiong）
  "臺北": "Taipei", "台北": "Taipei", "臺中": "Taichung", "台中": "Taichung", "臺南": "Tainan", "台南": "Tainan", "高雄": "Kaohsiung",
  "基隆": "Keelung", "新竹": "Hsinchu", "嘉義": "Chiayi", "花蓮": "Hualien", "臺東": "Taitung", "台東": "Taitung", "宜蘭": "Yilan",
  "屏東": "Pingtung", "南投": "Nantou", "雲林": "Yunlin", "苗栗": "Miaoli", "彰化": "Changhua", "桃園": "Taoyuan", "澎湖": "Penghu",
  "金門": "Kinmen", "馬祖": "Matsu", "淡水": "Tamsui", "南區": "South", "北區": "North", "森林浴": "Forest Bathing", "自行車道": "Bike Path", "公園": "Park", "支線": "Branch", "路線": "Route", "參拜道": "Pilgrimage Path",
}).sort((a, b) => b[0].length - a[0].length);
const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 };
const SEC_DIR = { 前: "Front", 後: "Rear", 上: "Upper", 下: "Lower", 中: "Middle", 東: "East", 西: "West", 南: "South", 北: "North" };
const isHan = c => /[\u4e00-\u9fff]/.test(c);
// 長串中文在「地名尾字」後面斷字（綠島阿眉山 → Ludao Ameishan），不再每 3 個音節硬切
const GEO_END = "山嶺湖溪園寺宮林谷峰坑崙岩尖洞埔里村社港灣島池潭嘴坪坡寮厝橋莊路";
function romWord(run) {   // 一段連續中文 → 拼音字，首字大寫、a/e/o 開頭的音節前加 '
  const chars = [...run];
  const pieces = [];
  // 在地名尾字後面斷（前後都至少 2 字、下一字不是另一個地名尾字，例如「烏山嶺」不拆）
  let cur = [];
  chars.forEach((c, i) => { cur.push(c); if (GEO_END.includes(c) && cur.length >= 2 && chars.length - 1 - i >= 2 && !GEO_END.includes(chars[i + 1])) { pieces.push(cur); cur = []; } });
  if (cur.length) pieces.push(cur);
  return pieces.map(pc => {
    const syl = pinyin(pc.join(""), { toneType: "none", type: "array" }).map(x => x.toLowerCase().replace(/ü|v/g, "u"));
    let out = ""; syl.forEach((t, k) => { out += (k > 0 && /^[aeo]/.test(t)) ? "'" + t : t; });
    return out ? out[0].toUpperCase() + out.slice(1) : "";
  }).filter(Boolean).join(" ");
}
function segEn(seg) {
  // 結尾的「段」：第六段→Section 6、後段→(Rear Section)、藤枝段→Tengzhi Section
  let tail = "", m;
  if ((m = seg.match(/第?([一二三四五六七八九十\d]+)段$/))) { const n = /\d/.test(m[1]) ? m[1] : (CN_NUM[m[1]] || m[1]); seg = seg.slice(0, -m[0].length); tail = ` Section ${n}`; }
  else if ((m = seg.match(/^([前後上下中東西南北])段$/))) return `${SEC_DIR[m[1]]} Section`;   // 冒號後單獨的「西段」
  else if ((m = seg.match(/([前後上下中東西南北])段$/)) && seg.length > 2) { seg = seg.slice(0, -2); tail = ` (${SEC_DIR[m[1]]} Section)`; }
  else if (/段$/.test(seg) && seg.length > 1) { seg = seg.slice(0, -1); tail = " Section"; }
  else if (/[^路]線$/.test(seg) && seg.length > 2) { seg = seg.slice(0, -1); tail = " Route"; }   // 苗圃線 → Miaopu Route
  if (N[seg] && !names.has(seg)) return N[seg] + tail;   // 整段是縣市鄉鎮 → 用官方拼音
  const out = []; let run = "", lat = "", i = 0;
  const flush = () => { if (run) { out.push(romWord(run)); run = ""; } if (lat.trim()) out.push(lat.trim()); lat = ""; };
  while (i < seg.length) {
    const hit = TERMS.find(([zh]) => seg.startsWith(zh, i));
    if (hit) {
      flush();
      // 「古道親山步道」→ 不要 Historic Trail Trail：前一個已經是 …Trail/Road/Path 就略過純「Trail」
      if (!(/^(Hiking )?Trail$/.test(hit[1]) && out.length && /(Trail|Road|Path)$/.test(out[out.length - 1]))) out.push(hit[1]);
      i += hit[0].length; continue;
    }
    const c = seg[i];
    if (isHan(c)) { if (lat) flush(); run += c; } else { if (run) { out.push(romWord(run)); run = ""; } lat += c; }   // 英數字整串保留，不拆成單字母
    i++;
  }
  flush();
  let s = out.join(" ").replace(/\s+/g, " ").trim();
  if (!s) return tail.trim();
  return s + tail;
}
function toEn(zh) {
  if (FAMOUS[zh]) return FAMOUS[zh];
  if (!/[\u4e00-\u9fff]/.test(zh)) return zh;
  // 括號內容先抽出來另外翻（常是縣市或段落：丹大林道（南投縣）、(第六段+第七段)），避免裡面的 + 被當分隔符
  const paren = [];
  let s = zh.replace(/[（(]([^）)]+)[）)]/g, (_, x) => { paren.push(toEn(x)); return `\u0001${paren.length - 1}\u0001`; });
  const parts = s.split(/(\s*[：:]\s*|\s*[-－—–~～]\s*|\s*[+＋]\s*|\s*[、／/‧·．•]\s*)/);
  s = parts.map(p => {
    const t = p.trim();
    if (/^[：:]$/.test(t)) return ": ";
    if (/^[-－—–~～]$/.test(t)) return " – ";
    if (/^[+＋]$/.test(t)) return " + ";
    if (/^[、／/‧·．•]$/.test(t)) return " / ";
    return t.split(/(\u0001\d+\u0001)/).map(q => /^\u0001/.test(q) ? q : (q.trim() ? segEn(q.trim()) : "")).join(" ");
  }).join("");
  return s.replace(/\u0001(\d+)\u0001/g, (_, n) => ` (${paren[+n]}) `).replace(/\s+/g, " ").replace(/\s+([:)])/g, "$1").replace(/\(\s+/g, "(").trim();
}
const before = {};
let done = 0;
for (const zh of names) { before[zh] = N[zh]; N[zh] = toEn(zh); done++; }
const failed = 0;
if (process.argv.includes("--diff")) { let k = 0; for (const zh of names) if (before[zh] !== N[zh] && k++ < 60) console.error(zh, "|", before[zh], "→", N[zh]); }
// 專有名詞一律首字大寫：曾有 "nantou county"、"kaohsiung city" 小寫混進來，地區篩選英文版看起來很怪
for (const k of Object.keys(N)) if (/^[a-z]/.test(N[k])) N[k] = N[k].replace(/\b[a-z]/g, c => c.toUpperCase());
fs.writeFileSync("web/js/i18n-names.js",
  "// 自動產生（scripts/rebuild-names-pinyin.mjs）：步道名＝拼音+類型詞（知名步道用官方英譯）；縣市鄉鎮＝官方/標準拼音。非中文介面才載入。\n"
  + "window.TT_NAMES = " + JSON.stringify(N) + ";\n");
const still = [...names].filter(n => !N[n]).length;
console.error(`完成：處理 ${done}；字典 ${Object.keys(N).length} 條；仍缺 ${still} 條`);
