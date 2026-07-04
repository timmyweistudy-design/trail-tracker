// 把幾個新 UI 中文字串機翻到全部語言、注入 en(i18n.js DICT) 與各 web/js/i18n/<code>.js
import fs from "fs";
const STRINGS = ["匯出備份檔", "匯入備份檔", "登入後每趟走完會自動雲端備份，換手機或資料遺失都救得回。也可匯出備份檔自己保管。"];
const EN = { "匯出備份檔": "Export backup", "匯入備份檔": "Import backup",
  "登入後每趟走完會自動雲端備份，換手機或資料遺失都救得回。也可匯出備份檔自己保管。":
  "Once logged in, every hike is auto-backed up to the cloud — recoverable if you switch phones or lose data. You can also export a backup file to keep yourself." };
const LANGS = ["es","ja","ko","fr","de","cn","pt","it","ru","th","vi","id","tl","ms","nl","pl","tr","hi","my","km","ne","mn","uk"];
const TL = { cn: "zh-CN" };
async function tr(text, tl) {
  const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-TW&tl=${tl}&dt=t&q=`+encodeURIComponent(text), { signal: AbortSignal.timeout(9000) });
  const j = await r.json(); return (j[0]||[]).map(s=>s&&s[0]).join("");
}
function js(x){return JSON.stringify(x,{},0).length?JSON.stringify(x):'""';}
function jstr(x){return JSON.stringify(x);}
// en → i18n.js DICT
let ii = fs.readFileSync("web/js/i18n.js","utf8");
let enIns = STRINGS.map(s=>`    ${jstr(s)}: ${jstr(EN[s])},`).join("\n");
ii = ii.replace("  const DICT = {", "  const DICT = {\n"+enIns);
fs.writeFileSync("web/js/i18n.js", ii);
console.error("en injected");
// 各語言
for (const code of LANGS) {
  const tl = TL[code] || code;
  const pairs = [];
  for (const s of STRINGS) { try { pairs.push([s, await tr(s, tl)]); } catch(e){ pairs.push([s, EN[s]]); } }
  const f = `web/js/i18n/${code}.js`;
  let c = fs.readFileSync(f,"utf8");
  const ins = pairs.map(([k,v])=>`${jstr(k)}:${jstr(v)}`).join(",");
  c = c.replace(/(return \{ D: \{)/, `$1${ins},`);
  fs.writeFileSync(f, c);
  console.error(code, "ok:", pairs[0][1]);
}
