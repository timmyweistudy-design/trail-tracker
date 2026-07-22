// 產生壓縮版靜態站到 dist/（源碼保持可讀；部署改指向 dist/）
// 逐檔 minify JS/CSS；vendor/已.min/minify後反而變大的檔一律原樣複製 → 零語意風險
import esbuild from "esbuild";
import fs from "fs";
import path from "path";

const SRC = "web", OUT = "dist";
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let savedRaw = 0, total = 0, minified = 0;
function handle(s, d) {
  const ext = path.extname(s);
  const isVendor = s.split(path.sep).includes("vendor");
  if ((ext === ".js" || ext === ".css") && !isVendor && !/\.min\./.test(s)) {
    try {
      const src = fs.readFileSync(s, "utf8");
      const out = esbuild.transformSync(src, { loader: ext === ".css" ? "css" : "js", minify: true, legalComments: "none", target: "es2019", charset: "utf8" }).code;
      total++;
      if (Buffer.byteLength(out) < Buffer.byteLength(src)) {
        fs.writeFileSync(d, out); minified++; savedRaw += Buffer.byteLength(src) - Buffer.byteLength(out); return;
      }
    } catch (e) { console.warn("minify skip", s, e.message); }
  }
  fs.copyFileSync(s, d);
}
function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const s = path.join(dir, e.name), d = path.join(OUT, path.relative(SRC, s));
    if (e.isDirectory()) { fs.mkdirSync(d, { recursive: true }); walk(s); }
    else handle(s, d);
  }
}
walk(SRC);
console.log(`dist/ 完成：minify ${minified}/${total} 檔，raw 省 ${(savedRaw / 1024 / 1024).toFixed(2)} MB`);
