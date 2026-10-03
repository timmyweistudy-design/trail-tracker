// OSM 步道（route=hiking/foot 關係）有沒有變？跟 App 內建 web/js/trails-data.js 的 osm-<關係 id> 比對：
//   1. 下架：App 有、OSM 已經沒有這個關係（被刪或不再是健行路線）
//   2. 改名：名稱跟 App 不同（App 名稱後面的「（縣市）」先拿掉再比）
//   3. 新路線：上次抓取（data/osm_crawled_at.txt）之後新增／修改、App 還沒有的
// 有差異印 Markdown（每季排程開 issue），exit 2；沒差異 exit 0；Overpass 全部連不上 exit 1。
// 要更新資料：python3 data/crawl_routes.py && python3 data/build_data.py && node scripts/pack-trails.mjs（或跟 Claude 說「更新 OSM 步道」）
const fs = require("fs"), path = require("path");
const SERVERS = ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const BBOX = "21.8,119.3,26.4,122.1";   // 台灣本島＋澎湖金馬（跟爬蟲範圍一致）
async function overpass(q) {
  let last;
  for (const s of SERVERS) {
    try {
      const r = await fetch(s, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "gather-the-trail-data-check" }, signal: AbortSignal.timeout(200000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) { last = e; console.error(`${s}：${(e.cause && e.cause.code) || e.message}`); }
  }
  throw last;
}
(async () => {
  const since = fs.readFileSync(path.join(__dirname, "../data/osm_crawled_at.txt"), "utf8").trim();
  global.window = {};
  eval(fs.readFileSync(path.join(__dirname, "../web/js/trails-data.js"), "utf8"));
  const mine = new Map(window.TRAILS.filter(t => t.source === "osm").map(t => [t.id.slice(4), t]));
  let all, fresh;
  try {
    all = await overpass(`[out:json][timeout:180];relation(id:${[...mine.keys()].join(",")});out tags;`);   // 只查 App 自己的（整個台灣範圍太重，鏡像站會 504）
    fresh = await overpass(`[out:json][timeout:180];relation["route"~"^(hiking|foot)$"]["name"](newer:"${since}T00:00:00Z")(${BBOX});out tags;`);
  } catch (e) { console.error("連不上 Overpass：" + e.message); process.exit(1); }
  const els = (all.elements || []).filter(e => /^(hiking|foot)$/.test((e.tags && e.tags.route) || ""));   // 還在、而且還是健行路線
  if (els.length < mine.size * 0.5) { console.error("Overpass 回傳筆數不對：" + els.length); process.exit(1); }
  const byId = new Map(els.map(e => [String(e.id), e]));
  const base = s => String(s || "").replace(/（[^）]*）$/, "").trim();
  const out = { removed: [], renamed: [], added: [] };
  for (const [id, t] of mine) {
    const e = byId.get(id);
    if (!e) { out.removed.push(`${t.name}（關係 ${id}）`); continue; }
    const nm = (e.tags && (e.tags["name:zh"] || e.tags.name)) || "";
    if (nm && base(nm) !== base(t.name) && !base(t.name).includes(base(nm)) && !base(nm).includes(base(t.name))) out.renamed.push(`${t.name} → ${nm}（關係 ${id}）`);
  }
  for (const e of fresh.elements || []) if (!mine.has(String(e.id))) out.added.push(`${(e.tags && (e.tags["name:zh"] || e.tags.name)) || "?"}（關係 ${e.id}，https://www.openstreetmap.org/relation/${e.id}）`);
  const n = Object.values(out).reduce((s, a) => s + a.length, 0);
  if (!n) { console.log(`App 內建 ${mine.size} 條 OSM 健行路線都還在、沒改名，也沒有新路線（上次抓取 ${since}）。`); process.exit(0); }
  const sec = (h, a) => a.length ? `### ${h}（${a.length}）\n${a.slice(0, 80).map(x => "- " + x).join("\n")}${a.length > 80 ? `\n- …還有 ${a.length - 80} 條` : ""}\n` : "";
  console.log(`## OSM 步道有變動（上次抓取 ${since}）\n\n${sec("OSM 已經沒有（App 還在列）", out.removed)}${sec("改名", out.renamed)}${sec("上次抓取後新增／修改、App 還沒有", out.added)}
新增的不一定都要收：爬蟲本來就會濾掉太短、自行車道、重複的路線。
更新方式：\`python3 data/crawl_routes.py && python3 data/build_data.py && node scripts/pack-trails.mjs\`，再把 data/osm_crawled_at.txt 改成當天日期。`);
  process.exit(2);
})();
