// 林業署步道資料有沒有變？抓官方「步道基本資料」API，跟 App 內建的 web/js/trails-data.js 比對：
// 新增／下架的步道、改名、難度變了、長度差超過 0.3 公里。有差異就印出 Markdown（給每月排程開 issue 用），exit code 2。
// 用法：node scripts/forestry-diff.js           沒差異 exit 0；抓不到官方資料 exit 1
// 要更新資料：python3 data/build_data.py && node scripts/pack-trails.mjs（或跟 Claude 說「更新步道資料」）
const fs = require("fs"), path = require("path");
const API = "https://recreation.forest.gov.tw/mis/api/BasicInfo/Trail";
(async () => {
  let off;
  try {
    const r = await fetch(API, { signal: AbortSignal.timeout(30000) });
    if (!r.ok) throw new Error("HTTP " + r.status);
    off = JSON.parse((await r.text()).replace(/^﻿/, ""));
    if (!Array.isArray(off) || off.length < 50) throw new Error("回傳筆數不對：" + (off && off.length));
  } catch (e) { console.error("抓不到林業署資料：" + e.message); process.exit(1); }
  global.window = {};
  eval(fs.readFileSync(path.join(__dirname, "../web/js/trails-data.js"), "utf8"));
  const mine = new Map(window.TRAILS.filter(t => t.source === "forestry").map(t => [t.id, t]));
  const out = { added: [], removed: [], renamed: [], diff: [], len: [] };
  const seen = new Set();
  for (const o of off) {
    const id = "forestry-" + o.TRAILID; seen.add(id);
    const m = mine.get(id);
    if (!m) { out.added.push(`${o.TR_CNAME}（${o.TRAILID}，${o.TR_POSITION || ""}）`); continue; }
    if (o.TR_CNAME && o.TR_CNAME.trim() !== m.name) out.renamed.push(`${m.name} → ${o.TR_CNAME.trim()}`);
    const d = +o.TR_DIF_CLASS; if (d && m.difficulty && d !== m.difficulty) out.diff.push(`${m.name}：難度 ${m.difficulty} → ${d}`);
    const L = +o.TR_LENGTH_NUM; if (L && m.length_km && Math.abs(L - m.length_km) > 0.3) out.len.push(`${m.name}：${m.length_km} → ${L} 公里`);
  }
  for (const [id, m] of mine) if (!seen.has(id)) out.removed.push(`${m.name}（${id.slice(9)}）`);
  const n = Object.values(out).reduce((s, a) => s + a.length, 0);
  if (!n) { console.log(`林業署 ${off.length} 條步道，跟 App 內建資料一致。`); process.exit(0); }
  const sec = (t, a) => a.length ? `### ${t}（${a.length}）\n${a.slice(0, 40).map(x => "- " + x).join("\n")}${a.length > 40 ? `\n- …還有 ${a.length - 40} 筆` : ""}\n` : "";
  console.log(`林業署官方 ${off.length} 條步道，跟 App 內建資料比對有 **${n}** 處不同。\n\n`
    + sec("新增的步道", out.added) + sec("官方已移除", out.removed) + sec("改名", out.renamed) + sec("難度改了", out.diff) + sec("長度差超過 0.3 公里", out.len)
    + `\n**怎麼更新**：跟 Claude 說「更新步道資料」，或自己跑 \`python3 data/build_data.py && node scripts/pack-trails.mjs\`，跑完 \`npm run check\`。\n`);
  process.exit(2);
})();
