import fs from "fs";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const fams = [
  { key:"fraunces", css:"family=Fraunces:opsz,wght@30,400;30,600;30,700" },
  { key:"hanken",   css:"family=Hanken+Grotesk:wght@500;600;700" },
  { key:"sora",     css:"family=Sora:wght@500;600;700" },
  { key:"newsreader", css:"family=Newsreader:opsz,wght@18,400;18,600;18,700" },
];
const out = {};
for (const f of fams) {
  const url = "https://fonts.googleapis.com/css2?" + f.css + "&display=swap";
  const css = await (await fetch(url, { headers:{ "User-Agent": UA } })).text();
  // 拆成 /* subset */ + @font-face 區塊
  const blocks = css.split("/*").slice(1);
  out[f.key] = [];
  for (const b of blocks) {
    const subset = b.slice(0, b.indexOf("*/")).trim();
    if (subset !== "latin") continue;
    const wght = (b.match(/font-weight:\s*(\d+)/) || [])[1];
    const src = (b.match(/url\((https:\/\/[^)]+\.woff2)\)/) || [])[1];
    if (!wght || !src) continue;
    const buf = Buffer.from(await (await fetch(src, { headers:{ "User-Agent": UA } })).arrayBuffer());
    out[f.key].push({ wght:+wght, b64: buf.toString("base64"), kb: Math.round(buf.length/1024) });
    console.error(f.key, wght, out[f.key].at(-1).kb+"KB");
  }
}
fs.writeFileSync("fonts.json", JSON.stringify(out));
const tot = Object.values(out).flat().reduce((s,x)=>s+x.b64.length,0);
console.error("total base64 chars:", Math.round(tot/1024)+"KB");
