// 林業署步道基本資料同步：只更新官方改過的「名稱、難度、長度、最高／最低海拔」，其他欄位（含手動修過的）不碰。
// 每月 issue（data-check.yml）說資料有變時跑這支：node scripts/sync-forestry.mjs && node scripts/pack-trails.mjs
// 新增／下架的步道不會自動加減（要跑完整的 data/build_data.py 管線），這裡只列出來。
import fs from "fs";
const FILE = "web/js/trails-data.js";
const r = await fetch("https://recreation.forest.gov.tw/mis/api/BasicInfo/Trail", { signal: AbortSignal.timeout(30000) });
if (!r.ok) { console.error("抓不到林業署資料 HTTP " + r.status); process.exit(1); }
const off = JSON.parse((await r.text()).replace(/^﻿/, ""));
const g = { window: {} };
new Function("window", fs.readFileSync(FILE, "utf8"))(g.window);
const arr = g.window.TRAILS, byId = new Map(arr.map(t => [t.id, t]));
const LBL = { 1: "輕鬆", 2: "一般", 3: "進階", 4: "挑戰", 5: "困難" };   // 同 data/build_data.py DIFF_LABEL
const changes = [];
for (const o of off) {
  const t = byId.get("forestry-" + o.TRAILID);
  if (!t) { changes.push(`（新增，未自動加入）${o.TR_CNAME}`); continue; }
  const set = (k, v, why) => { if (v != null && v !== "" && !Number.isNaN(v) && t[k] !== v) { changes.push(`${t.name}：${why} ${t[k]} → ${v}`); t[k] = v; } };
  set("name", (o.TR_CNAME || "").trim() || null, "名稱");
  const d = +o.TR_DIF_CLASS; if (d >= 1 && d <= 5) { set("difficulty", d, "難度"); set("difficulty_label", LBL[d], "難度字"); }
  const L = +o.TR_LENGTH_NUM; if (L > 0) set("length_km", L, "長度");
  const hi = +o.TR_ALT, lo = +o.TR_ALT_LOW;
  if (hi > 0) set("alt_high", hi, "最高海拔"); if (lo >= 0 && o.TR_ALT_LOW !== "" && o.TR_ALT_LOW != null) set("alt_low", lo, "最低海拔");
  if (t.alt_high != null && t.alt_low != null) set("ascent", t.alt_high - t.alt_low, "高低差");
}
const seen = new Set(off.map(o => "forestry-" + o.TRAILID));
for (const t of arr) if (t.source === "forestry" && !seen.has(t.id)) changes.push(`（官方已移除，未自動刪除）${t.name}`);
// 寫回原始格式，交給 pack-trails.mjs 重新打包（它會併入地形爬升）
fs.writeFileSync(FILE, "// 自動產生（sync-forestry.mjs）：待 pack-trails.mjs 打包\nwindow.TRAILS = " + JSON.stringify(arr) + ";\n");
console.log(changes.length ? changes.join("\n") : "沒有變動");
