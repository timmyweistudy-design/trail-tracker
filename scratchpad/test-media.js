const fs = require("fs"), vm = require("vm");
const src = fs.readFileSync(__dirname + "/../web/js/social/media.js", "utf8");
const ctx = { module: {}, document: { createElement: () => ({ getContext: () => ({ drawImage() {} }) }) }, URL: {}, Image: function () {} };
vm.createContext(ctx); vm.runInContext(src, ctx);
const Media = ctx.module.exports;
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.error("FAIL", m, "got", JSON.stringify(a)); process.exitCode = 1; } else console.log("ok", m); };

eq(Media.targetSize(800, 600, 1600), { w: 800, h: 600 }, "small unchanged");
eq(Media.targetSize(3200, 2400, 1600), { w: 1600, h: 1200 }, "landscape scaled to long edge");
eq(Media.targetSize(2400, 3200, 1600), { w: 1200, h: 1600 }, "portrait scaled to long edge");
eq(Media.targetSize(400, 4000, 400), { w: 40, h: 400 }, "tall scaled");
console.log("done");
