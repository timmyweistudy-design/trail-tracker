// 夥伴相關句子的翻譯匯出表（2026-10-09 第三版 R10）：給母語者校對小語種用。
// 用法：node scripts/export-pet-i18n.js → docs/i18n-review-pet.tsv（中文 key、英文、日文、韓文、各小語種；校完可以照 scripts/apply-translations.py 的格式貼回）
const fs = require("fs"), W = __dirname + "/../web/js/";
const src = ["pet.js", "pet-stage.js", "pet-art.js", "pet-journey.js", "year-story.js", "me.js", "social/petsocial.js", "native-local-notif.js"].map(f => fs.readFileSync(W + f, "utf8")).join("\n");
const keys = new Set(); for (const m of src.matchAll(/ttT\(\s*"((?:[^"\\]|\\.)*)"/g)) if (/[一-鿿]/.test(m[1])) keys.add(m[1]);
for (const m of src.matchAll(/\[\s*"((?:[^"\\]|\\.)*[一-鿿](?:[^"\\]|\\.)*)"/g)) keys.add(m[1]);
const L = ["en", "ja", "ko", "cn", "km", "my", "mn", "ne", "hi", "th", "vi", "id", "ms", "tl", "tr", "uk", "ru", "pl", "nl", "de", "es", "fr", "it", "pt"];
const load = l => { const t = fs.readFileSync(W + "i18n/" + l + ".js", "utf8"), o = {}; for (const m of t.matchAll(/"((?:[^"\\]|\\.)*)"\s*:\s*"((?:[^"\\]|\\.)*)"/g)) o[JSON.parse('"' + m[1] + '"')] = JSON.parse('"' + m[2] + '"'); return o; };
const D = Object.fromEntries(L.map(l => [l, load(l)]));
const rows = [...keys].filter(k => k in D.en).sort();
const esc = v => String(v == null ? "" : v).replace(/\t|\n/g, " ");
fs.writeFileSync(__dirname + "/../docs/i18n-review-pet.tsv", ["zh\t" + L.join("\t")].concat(rows.map(k => [k].concat(L.map(l => D[l][k])).map(esc).join("\t"))).join("\n") + "\n");
console.log(rows.length + " 句 → docs/i18n-review-pet.tsv");
