// 用 iNaturalist 真實觀察資料，烘焙各環境帶的常見物種（build-time，產出離線資料）。
// 每個環境帶用台灣代表座標查 species_counts（research grade、野生、非外來），過濾人為物種，取前 N。
// 產出 scratchpad/ecology-raw.json 供人工檢視後整理進 web/js/ecology.js。
import fs from "fs";

const HABITATS = {
  "低海拔闊葉林": [{ lat: 25.16, lng: 121.55 }, { lat: 23.67, lng: 120.80 }],   // 陽明山、溪頭
  "中海拔針闊混合林": [{ lat: 24.51, lng: 121.05 }, { lat: 23.51, lng: 120.80 }], // 觀霧、阿里山
  "高山": [{ lat: 24.14, lng: 121.28 }, { lat: 23.47, lng: 120.95 }],           // 合歡山、玉山群峰
  "溪流": [{ lat: 24.90, lng: 121.35 }, { lat: 23.30, lng: 120.90 }],           // 北插天溪、南部溪谷
  "海岸": [{ lat: 25.13, lng: 121.92 }, { lat: 21.95, lng: 120.75 }],           // 東北角、墾丁
};
// 溪流帶重點抓兩棲/蜻蜓/溪鳥；其餘帶抓鳥/哺乳/昆蟲/兩爬
const TAXA = { bird: "Aves", mammal: "Mammalia", insect: "Insecta", herp: "Amphibia,Reptilia" };
// 人為/家養/人類，一律排除（就算標成野生也不該列進「山林生態」）
const EXCLUDE = new Set(["Homo sapiens", "Bubalus bubalis", "Felis catus", "Canis familiaris",
  "Canis lupus familiaris", "Gallus gallus", "Bos taurus", "Sus scrofa domesticus", "Capra hircus",
  "Passer montanus", "Columba livia", "Acridotheres tristis", "Acridotheres cristatellus"]);
const RADIUS = 12, PER = 30, TOP = 12;

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function speciesCounts(lat, lng, iconic) {
  const u = `https://api.inaturalist.org/v1/observations/species_counts?lat=${lat}&lng=${lng}&radius=${RADIUS}`
    + `&iconic_taxa=${iconic}&locale=zh-TW&quality_grade=research&introduced=false&captive=false&per_page=${PER}`;
  const r = await fetch(u); if (!r.ok) throw new Error("http " + r.status);
  const j = await r.json();
  return (j.results || []).map(x => ({
    zh: x.taxon.preferred_common_name || x.taxon.name, sci: x.taxon.name, n: x.count,
  }));
}

const out = {};
for (const [hab, coords] of Object.entries(HABITATS)) {
  out[hab] = {};
  for (const [key, iconic] of Object.entries(TAXA)) {
    const merged = new Map();   // 多座標合併：同物種觀察數相加
    for (const c of coords) {
      try {
        const list = await speciesCounts(c.lat, c.lng, iconic);
        for (const s of list) {
          if (EXCLUDE.has(s.sci) || !s.zh) continue;
          const cur = merged.get(s.zh) || { zh: s.zh, sci: s.sci, n: 0 };
          cur.n += s.n; merged.set(s.zh, cur);
        }
      } catch (e) { console.error(`  ! ${hab}/${key} @${c.lat},${c.lng}: ${e.message}`); }
      await sleep(1200);   // iNaturalist 建議 <1 req/sec，節流保守一點
    }
    out[hab][key] = [...merged.values()].sort((a, b) => b.n - a.n).slice(0, TOP);
    console.error(`✓ ${hab} / ${key}: ${out[hab][key].length} 種`);
  }
}
fs.writeFileSync(process.argv[2] || "ecology-raw.json", JSON.stringify(out, null, 2));
console.error("\n完成 → " + (process.argv[2] || "ecology-raw.json"));
