// 規則自動產生：把 en PATTERNS 區塊的字面文字段機翻成目標語言，${} 變數/tx()/CJK 鍵/程式結構原樣保留。
// 用法：node gen-patterns.mjs <lang>   → 輸出 scratchpad/<lang>-patterns.js（含 const XX_PATTERNS = [...]）
import fs from "fs";
const lang = process.argv[2];
const NAME = { pt: "PT", it: "IT", ru: "RU", th: "TH", vi: "VI", id: "ID" }[lang] || lang.toUpperCase();

const src = fs.readFileSync("web/js/i18n.js", "utf8");
const start = src.indexOf("const PATTERNS = [");
let i = src.indexOf("[", start), depth = 0, end = -1;
for (let j = i; j < src.length; j++) { const c = src[j]; if (c === "[") depth++; else if (c === "]") { depth--; if (depth === 0) { end = j; break; } } }
let block = src.slice(i, end + 1);   // [ ... ]（含中括號）

// 收集所有需要翻譯的字面段：模板字面 `...` 內的非 ${} 文字、以及獨立的 "..."。
const CJK = /[　-鿿＀-￯]/;
const hasWord = s => /[A-Za-z]{2,}/.test(s);
const segs = new Set();

// 模板字面：把 ${...} 換佔位，其餘依「單詞邊界」抓取
function litParts(tpl) {                 // tpl 不含反引號
  return tpl.split(/(\$\{(?:[^{}]|\{[^}]*\})*\})/);   // 保留 ${...}（允許一層巢狀 {}）
}
// 掃描 block 收集字面
const tplRe = /`(?:[^`\\]|\\.)*`/g;
const strRe = /"(?:[^"\\]|\\.)*"/g;
for (const m of block.matchAll(tplRe)) {
  const inner = m[0].slice(1, -1);
  for (const part of litParts(inner)) {
    if (part.startsWith("${")) continue;
    if (hasWord(part) && !CJK.test(part)) segs.add(part);
  }
}
for (const m of block.matchAll(strRe)) {
  const inner = m[0].slice(1, -1);
  if (hasWord(inner) && !CJK.test(inner)) segs.add(inner);
}

// 機翻（保護 {N} 這種佔位不被翻）＋批次
async function tr(text) {
  const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${lang}&dt=t&q=` + encodeURIComponent(text), { signal: AbortSignal.timeout(8000) });
  const j = await r.json();
  return (j[0] || []).map(s => s && s[0]).join("");
}
const list = [...segs];
const map = {};
let idx = 0, done = 0;
async function worker() {
  while (idx < list.length) {
    const s = list[idx++];
    // 前後空白要保留（模板拼接靠它）
    const lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0], core = s.trim();
    try { const t = await tr(core); map[s] = lead + (t || core) + tail; }
    catch (e) { try { const t = await tr(core); map[s] = lead + (t || core) + tail; } catch (e2) { map[s] = s; } }
    if (++done % 40 === 0) console.error(lang, done, "/", list.length);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));

// 回填：同樣的掃描順序，把字面段替換
block = block.replace(tplRe, tpl => {
  const inner = tpl.slice(1, -1);
  const out = litParts(inner).map(p => p.startsWith("${") ? p : (map[p] ?? p)).join("");
  return "`" + out + "`";
});
block = block.replace(strRe, str => {
  const inner = str.slice(1, -1);
  if (map[inner] != null) return '"' + map[inner].replace(/"/g, '\\"') + '"';
  return str;
});

fs.writeFileSync(`scratchpad/${lang}-patterns.js`, `  const ${NAME}_PATTERNS = ${block};\n`);
console.error(lang, "done — segs", list.length);
