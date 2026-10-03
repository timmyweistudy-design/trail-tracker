// OSM 步道（route=hiking/foot 關係）有沒有變？跟 App 內建 web/js/trails-data.js 的 osm-<關係 id> 比對：
//   1. 下架：App 有、OSM 已經沒有這個關係（被刪或不再是健行路線）
//   2. 改名：名稱跟 App 不同（App 名稱後面的「（縣市）」先拿掉再比）
//   3. 新路線：上次抓取（data/osm_crawled_at.txt）之後新增／修改、App 還沒有的
// 1、2 用 OSM 官方 API 一次查 100 個關係（快又穩；Overpass 鏡像常 504）；3 用 Overpass，查不到就在報告註明、不算失敗。
// 有差異印 Markdown（每季排程開 issue），exit 2；沒差異 exit 0；OSM API 連不上 exit 1。
// 要更新資料：python3 data/crawl_routes.py && python3 data/build_data.py && node scripts/pack-trails.mjs（或跟 Claude 說「更新 OSM 步道」）
const fs = require("fs"), path = require("path");
const SERVERS = ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const BBOX = "21.8,119.3,26.4,122.1";   // 台灣本島＋澎湖金馬（跟爬蟲範圍一致）
async function overpass(q) {
  let last;
  for (const s of SERVERS) {
    try {
      const r = await fetch(s, { method: "POST", body: "data=" + encodeURIComponent(q), headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "gather-the-trail-data-check (github.com/timmyweistudy-design/trail-tracker)" }, signal: AbortSignal.timeout(200000) });
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
  const UA = { "User-Agent": "gather-the-trail-data-check (github.com/timmyweistudy-design/trail-tracker)" };
  const ids = [...mine.keys()], els = [];
  try {
    for (let i = 0; i < ids.length; i += 100) {
      const r = await fetch(`https://api.openstreetmap.org/api/0.6/relations.json?relations=${ids.slice(i, i + 100).join(",")}`, { headers: UA, signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new Error("HTTP " + r.status);
      for (const e of (await r.json()).elements || []) if (e.visible !== false && /^(hiking|foot)$/.test((e.tags && e.tags.route) || "")) els.push(e);   // 還在、而且還是健行路線
      await new Promise(res => setTimeout(res, 300));   // 對官方 API 客氣一點
    }
  } catch (e) { console.error("連不上 OSM API：" + e.message); process.exit(1); }
  if (els.length < mine.size * 0.5) { console.error("OSM API 回傳筆數不對：" + els.length); process.exit(1); }
  let fresh = null;
  try { fresh = await overpass(`[out:json][timeout:180];relation["route"~"^(hiking|foot)$"]["name"](newer:"${since}T00:00:00Z")(${BBOX});out tags;`); }
  catch (e) { console.error("Overpass 查不到新路線（" + e.message + "），這次只比下架和改名"); }
  const byId = new Map(els.map(e => [String(e.id), e]));
  const base = s => String(s || "").replace(/（[^）]*）$/, "").trim().toLowerCase();   // 大小寫不同不算改名
  const out = { removed: [], renamed: [], added: [] };
  for (const [id, t] of mine) {
    const e = byId.get(id);
    if (!e) { out.removed.push(`${t.name}（關係 ${id}）`); continue; }
    const nm = (e.tags && (e.tags["name:zh"] || e.tags.name)) || "";
    if (nm && base(nm) !== base(t.name) && !base(t.name).includes(base(nm)) && !base(nm).includes(base(t.name))) out.renamed.push(`${t.name} → ${nm}（關係 ${id}）`);
  }
  if (fresh) for (const e of fresh.elements || []) if (!mine.has(String(e.id))) out.added.push(`${(e.tags && (e.tags["name:zh"] || e.tags.name)) || "?"}（關係 ${e.id}，https://www.openstreetmap.org/relation/${e.id}）`);
  const n = Object.values(out).reduce((s, a) => s + a.length, 0);
  const note = fresh ? "" : "\n\n（Overpass 這次連不上，新路線沒有比到）";
  if (!n) { console.log(`App 內建 ${mine.size} 條 OSM 健行路線都還在、沒改名${fresh ? "，也沒有新路線" : ""}（上次抓取 ${since}）。${note}`); process.exit(0); }
  const sec = (h, a) => a.length ? `### ${h}（${a.length}）\n${a.slice(0, 80).map(x => "- " + x).join("\n")}${a.length > 80 ? `\n- …還有 ${a.length - 80} 條` : ""}\n` : "";
  console.log(`## OSM 步道有變動（上次抓取 ${since}）\n\n${sec("OSM 已經沒有（App 還在列）", out.removed)}${sec("改名", out.renamed)}${sec("上次抓取後新增／修改、App 還沒有", out.added)}
新增的不一定都要收：爬蟲本來就會濾掉太短、自行車道、重複的路線。
更新方式：\`python3 data/crawl_routes.py && python3 data/build_data.py && node scripts/pack-trails.mjs\`，再把 data/osm_crawled_at.txt 改成當天日期。${note}`);
  process.exit(2);
})();
