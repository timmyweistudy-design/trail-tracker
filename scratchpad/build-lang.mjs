// 通用字典建置：node build-lang.mjs <code> <sl> <tl> <source>
//   source=en → 從英文字典值翻；source=key → 從中文原文(key)翻（簡中用）
import fs from "fs";
const [code, sl, tl, source] = process.argv.slice(2);
const src = fs.readFileSync("web/js/i18n.js", "utf8");
const start = src.indexOf("const DICT = {");
let i = src.indexOf("{", start), depth = 0, end = -1;
for (let j = i; j < src.length; j++) {
  const c = src[j];
  if (c === "{") depth++;
  else if (c === "}") { depth--; if (depth === 0) { end = j; break; } }
}
const D = (0, eval)("(" + src.slice(i, end + 1) + ")");
const entries = Object.entries(D);
console.error(code, "entries:", entries.length);
const out = {};
async function tr(text) {
  const r = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=` + encodeURIComponent(text), { signal: AbortSignal.timeout(8000) });
  const j = await r.json();
  return (j[0] || []).map(s => s && s[0]).join("");
}
let idx = 0, done = 0;
async function worker() {
  while (idx < entries.length) {
    const [zh, en] = entries[idx++];
    const q = source === "key" ? zh : en;
    try { out[zh] = await tr(q); } catch (e) { try { out[zh] = await tr(q); } catch (e2) { out[zh] = q; } }
    if (++done % 300 === 0) console.error(code, "...", done);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
fs.writeFileSync(`scratchpad/${code}-dict-raw.json`, JSON.stringify(out, null, 1));
console.error(code, "done", done);
