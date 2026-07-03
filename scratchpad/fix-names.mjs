import fs from "fs";
const src = fs.readFileSync("web/js/i18n-names.js", "utf8");
const N = JSON.parse(src.slice(src.indexOf("{"), src.lastIndexOf("}") + 1));

// 中文字尾 → 英文類型詞
const SUF = [["環狀步道","Loop Trail"],["自然步道","Nature Trail"],["國家步道","National Trail"],["親山步道","Hillside Trail"],
  ["登山步道","Hiking Trail"],["森林步道","Forest Trail"],["觀光步道","Scenic Trail"],["景觀步道","Scenic Trail"],
  ["越嶺古道","Historic Crossing Trail"],["古道","Historic Trail"],["步道","Trail"],["步徑","Path"],["山徑","Trail"],
  ["主峰線","Main Peak Route"],["登山口","Trailhead"],["線","Route"],["山","Mountain"]];
// 疑似鬼譯：品牌詞/明顯無關詞
const BAD = /riot|games|lol|iphone|windows|nintendo|pokemon|coca|toyota|gundam|hello kitty|donald|batman/i;
// 中文結尾是步道類但英文沒有對應類型詞 → 可疑
const TYPE = /trail|path|road|route|ridge|peak|mountain|falls|lake|creek|old|ancient|historic|loop|line|walk|track|summit|steps/i;

const suspects = [];
for (const [zh, en] of Object.entries(N)) {
  if (/[縣市鄉鎮區]$/.test(zh)) continue;   // 行政區不查
  if (BAD.test(en) || (/(步道|古道|步徑|山徑|線)$/.test(zh) && !TYPE.test(en))) suspects.push(zh);
}
console.error("suspects:", suspects.length);

async function romanize(text) {
  const r = await fetch("https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-TW&tl=en&dt=rm&q=" + encodeURIComponent(text), { signal: AbortSignal.timeout(8000) });
  const j = await r.json();
  const rm = (j && j[0] || []).map(seg => seg && (seg[3] || "")).filter(Boolean).join(" ");
  const clean = rm.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z' ]/g, "").trim().toLowerCase();
  const joined = clean.split(/\s+/).filter(Boolean).join("");
  return joined ? joined[0].toUpperCase() + joined.slice(1) : "";
}
let fixed = 0;
for (const zh of suspects) {
  let base = zh, sufEn = "Trail";
  for (const [cs, es] of SUF) { if (zh.endsWith(cs)) { base = zh.slice(0, -cs.length) || zh; sufEn = es; break; } }
  try {
    const rom = await romanize(base);
    if (rom && rom.length >= 2) { N[zh] = `${rom} ${sufEn}`; fixed++; }
  } catch (e) { /* 保留原譯 */ }
  await new Promise(r => setTimeout(r, 50));
}
console.error("fixed:", fixed, "sample:", JSON.stringify(N["拳頭姆自然步道"]));
fs.writeFileSync("web/js/i18n-names.js",
  "// 自動產生（build-names.mjs + fix-names.mjs）：步道名/縣市/鄉鎮英文名。非中文介面才載入。\n" +
  "window.TT_NAMES = " + JSON.stringify(N) + ";\n");
