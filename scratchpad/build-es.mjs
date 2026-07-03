import fs from "fs";
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
console.error("entries:", entries.length);
const out = {};
async function tr(text) {
  const ctl = AbortSignal.timeout(8000);
  const r = await fetch("https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=es&dt=t&q=" + encodeURIComponent(text), { signal: ctl });
  const j = await r.json();
  return (j[0] || []).map(s => s && s[0]).join("");
}
let idx = 0, done = 0;
async function worker() {
  while (idx < entries.length) {
    const [zh, en] = entries[idx++];
    try { out[zh] = await tr(en); } catch (e) { try { out[zh] = await tr(en); } catch (e2) { out[zh] = en; } }
    if (++done % 100 === 0) console.error("...", done);
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
fs.writeFileSync("scratchpad/es-dict-raw.json", JSON.stringify(out, null, 1));
console.error("done", done, "fallbacks:", Object.entries(out).filter(([z, v]) => v === D[z]).length);
