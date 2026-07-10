import fs from "fs";
const UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36";
const dir="web/vendor/fonts";
// 1) Hanken Grotesk 變量版（一檔含所有字重）latin subset
const css=await (await fetch("https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@300..800&display=swap",{headers:{"User-Agent":UA}})).text();
const blocks=css.split("/*").slice(1);
let hankenUrl=null;
for(const b of blocks){ const sub=b.slice(0,b.indexOf("*/")).trim(); if(sub==="latin"){ hankenUrl=(b.match(/url\((https:\/\/[^)]+\.woff2)\)/)||[])[1]; } }
const hbuf=Buffer.from(await (await fetch(hankenUrl,{headers:{"User-Agent":UA}})).arrayBuffer());
fs.writeFileSync(dir+"/hanken-grotesk.woff2", hbuf);
console.log("hanken variable:", Math.round(hbuf.length/1024)+"KB");
// 2) Fraunces 600/700 static latin（品牌/標題用，用量少）— 從先前 fonts.json 取
const F=JSON.parse(fs.readFileSync("scratchpad/fonts.json","utf8"));
for(const w of [600,700]){ const x=F.fraunces.find(z=>z.wght===w); fs.writeFileSync(dir+`/fraunces-${w}.woff2`, Buffer.from(x.b64,"base64")); console.log(`fraunces ${w}:`, x.kb+"KB"); }
