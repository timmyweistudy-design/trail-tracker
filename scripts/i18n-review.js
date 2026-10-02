#!/usr/bin/env node
// 產生翻譯抽查表：node scripts/i18n-review.js [語言…]（預設 en ja ko）
// 挑「畫面上最常出現的字串」＋「安全相關的字串」，輸出 docs/i18n-review/<語言>.csv（Excel／Google 試算表直接開）。
// 給母語者看：第一欄中文原文、第二欄目前譯文、第三欄留空讓他填修正、第四欄出現在哪幾個檔。
const fs = require("fs"), path = require("path");
const ROOT = path.resolve(__dirname, ".."), WEB = path.join(ROOT, "web");
const langs = process.argv.slice(2).length ? process.argv.slice(2) : ["en", "ja", "ko"];
global.localStorage = { getItem: () => null, setItem() { }, removeItem() { } };
global.window = {}; global.document = { documentElement: {}, addEventListener() { } };
eval(fs.readFileSync(path.join(WEB, "js/i18n.js"), "utf8").replace(/I18n\.start\(\);[^]*$/, "") + ";global.__I18n=I18n;");
global.window.I18n = global.__I18n;
for (const lf of fs.readdirSync(path.join(WEB, "js/i18n"))) eval(fs.readFileSync(path.join(WEB, "js/i18n", lf), "utf8"));
const tables = global.__I18n.tables ? global.__I18n.tables() : {};
const EN = (() => { const m = fs.readFileSync(path.join(WEB, "js/i18n.js"), "utf8").match(/const DICT = (\{[^]*?\n  \});/); try { return Function("return " + m[1])(); } catch (e) { return {}; } })();
// 來源檔：所有介面 JS＋index.html（資料檔不算）
const SKIP = /i18n|trails-|geo|peaks-data|ecology-data|debug|admin/;
const srcFiles = [path.join(WEB, "index.html"), ...fs.readdirSync(path.join(WEB, "js")).filter(f => f.endsWith(".js") && !SKIP.test(f)).map(f => path.join(WEB, "js", f)),
  ...fs.readdirSync(path.join(WEB, "js/social")).map(f => path.join(WEB, "js/social", f))];
const where = {}, count = {};
for (const f of srcFiles) {
  const s = fs.readFileSync(f, "utf8"), name = path.basename(f);
  for (const k of Object.keys(EN)) {
    if (!/[一-鿿]/.test(k) || k.length < 2) continue;
    const n = s.split(k).length - 1;
    if (n) { count[k] = (count[k] || 0) + n; (where[k] = where[k] || new Set()).add(name); }
  }
}
const SAFETY = ["留守人", "求救卡", "撥打 112", "原路返回", "天黑", "下山", "超時", "路況", "封閉", "坍方", "雷雨", "體感", "陣風", "112", "迷路", "偏離"];
const isSafety = k => SAFETY.some(w => k.includes(w));
const keys = Object.keys(count).sort((a, b) => (isSafety(b) - isSafety(a)) || count[b] - count[a]);
const pick = [...keys.filter(isSafety).slice(0, 60), ...keys.filter(k => !isSafety(k)).slice(0, 140)];
const csv = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
for (const L of langs) {
  const D = L === "en" ? EN : ((tables[L] || {}).D || {});
  const rows = [["中文原文", `目前譯文（${L}）`, "建議修正（空白＝沒問題）", "出現在", "安全相關"]];
  for (const k of pick) rows.push([k, D[k] || "（沒有翻譯）", "", [...where[k]].slice(0, 4).join(" "), isSafety(k) ? "★" : ""]);
  fs.writeFileSync(path.join(ROOT, "docs/i18n-review", `${L}.csv`), "﻿" + rows.map(r => r.map(csv).join(",")).join("\n") + "\n");
  console.log(`${L}: ${rows.length - 1} 句（安全相關 ${pick.filter(isSafety).length}）→ docs/i18n-review/${L}.csv`);
}
