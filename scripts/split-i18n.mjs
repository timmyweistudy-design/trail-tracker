// 一次性：把 i18n.js 內各語言（en 以外）的 DICT+PATTERNS 抽成 web/js/i18n/<code>.js 按需檔。
// 用 Node 直接 eval 現有 i18n.js 取真正的物件/函式，再以 fn.toString() 序列化（保留 regex 與箭頭函式）。
import fs from "fs";
global.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
let src = fs.readFileSync("web/js/i18n.js", "utf8").replace(/I18n\.start\(\);[^]*$/, ";globalThis.I18n = I18n;");
eval(src);
const LANGS = I18n.tables();
let n = 0;
for (const code of Object.keys(LANGS)) {
  if (code === "en") continue;
  const D = JSON.stringify(LANGS[code].D);
  const P = "[\n" + LANGS[code].P.map(([re, fn]) => `    [${re.toString()}, ${fn.toString()}]`).join(",\n") + "\n  ]";
  const out = `// 自動產生（scripts/split-i18n.mjs）：${code} 語言字典＋規則，按需載入。\n` +
    `window.I18n.registerLang(${JSON.stringify(code)}, function (tx) {\n  return { D: ${D}, P: ${P} };\n});\n`;
  fs.writeFileSync(`web/js/i18n/${code}.js`, out);
  n++;
}
console.log("wrote", n, "language files to web/js/i18n/");
