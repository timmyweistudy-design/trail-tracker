// 步道生態：依海拔/地區判環境帶 → 常見物種（離線，資料在 ecology-data.js）；小黑蚊/蚊蟲風險（純函式）；
// 毒蛇標記；iNaturalist 附近真實目擊（連網，選配）。物種名維持中文（比照步道資料，不翻 25 語言）。
const Ecology = (() => {
  const HAB = (typeof window !== "undefined" && window.ECO_HABITATS) || {};
  const CATS = ["mammal", "bird", "insect", "herp"];

  // 縣市/毒蛇名單同屬「中文資料」，與物種清單一起放 ecology-data.js
  const SOUTH = new Set((typeof window !== "undefined" && window.ECO_SOUTH_REGIONS) || []);
  const POISON = new Set((typeof window !== "undefined" && window.ECO_POISON) || []);
  function isPoison(name) { return POISON.has(name); }

  // 一條步道可能跨多個環境帶：用 alt_low~alt_high 區間與各帶區間取交集，再看名稱判溪流/海岸
  function habitatsFor(trail) {
    const hi = trail.alt_high, lo = trail.alt_low;
    const bot = (lo != null ? lo : hi), top = (hi != null ? hi : lo);
    const out = [];
    if (bot != null && bot < 800) out.push("低海拔闊葉林");
    if (top != null && bot != null && top >= 800 && bot <= 2500) out.push("中海拔針闊混合林");
    if (top != null && top > 2500) out.push("高山");
    const s = (trail.name || "") + (trail.position || "");
    if (/溪|瀑|潭|澗|川|湖|水/.test(s)) out.push("溪流");
    if (/海|岬|岸|嶼|港|燈塔|礁/.test(s) && (bot == null || bot < 300)) out.push("海岸");
    if (!out.length) out.push("低海拔闊葉林");   // 無海拔資料 → 保守給低海拔
    return [...new Set(out)];
  }

  // 命中的環境帶物種聯集、去重；每類上限避免多帶時爆量
  function speciesFor(trail) {
    const habs = habitatsFor(trail);
    const out = {}, seen = {};
    CATS.forEach(k => { out[k] = []; seen[k] = new Set(); });
    for (const h of habs) {
      const g = HAB[h]; if (!g) continue;
      for (const k of CATS) for (const sp of (g[k] || [])) {
        if (!seen[k].has(sp)) { seen[k].add(sp); out[k].push(sp); }
      }
    }
    CATS.forEach(k => { out[k] = out[k].slice(0, 10); });
    return { habitats: habs, species: out };
  }

  // 小黑蚊/蚊蟲風險（純函式，可測）。回 { level, tips, seasonal, note }。
  // 依真實生態：海拔越低越兇（>1200m 幾乎絕跡）、中南部花東加重、日行性、3–11 月活躍（5–9 高峰）。
  function biteRisk(alt, region, date, envText) {
    const month = (date instanceof Date ? date : new Date()).getMonth() + 1;
    const seasonal = month >= 3 && month <= 11;      // 活躍季
    const peak = month >= 5 && month <= 9;           // 高峰
    // 高海拔直接判無（小黑蚊上不了）
    if (alt != null && alt >= 1200) {
      return { level: "none", seasonal, tips: ["海拔高，小黑蚊幾乎絕跡，一般蚊蟲也少"], note: "high-alt" };
    }
    let score = 0;
    if (alt == null || alt < 500) score += 3;
    else if (alt < 800) score += 2;
    else score += 1;                                 // 800–1200
    if (SOUTH.has(region)) score += 1.5;             // 中南部／花東加重
    if (/竹|蔭|溪|潭|草/.test(envText || "")) score += 0.5;
    if (!peak) score += seasonal ? -1 : -3;          // 非高峰略降、冬季大降
    score = Math.max(0, score);
    const level = score >= 3.5 ? "high" : score >= 2 ? "mid" : score >= 0.8 ? "low" : "none";
    const tips = [];
    if (level === "high" || level === "mid") {
      tips.push("穿長袖長褲、擦防蚊液（含敵避 DEET 或 Picaridin）");
      tips.push("小黑蚊白天叮咬，10–15 時最兇");
      tips.push("避免在竹林、樹蔭下久坐");
    } else if (level === "low") {
      tips.push("偶有蚊蟲，視情況簡單防護即可");
    } else {
      tips.push(seasonal ? "目前風險低，仍建議基本防蚊" : "目前非小黑蚊活躍季（3–11 月），風險低");
    }
    return { level, seasonal, tips, note: seasonal ? "season-on" : "season-off" };
  }

  // 附近的真實目擊（iNaturalist，連網；失敗/離線回 null → 呼叫端隱藏此區）
  async function nearbyObservations(lat, lon) {
    if (lat == null || lon == null || typeof fetch !== "function") return null;
    try {
      const u = `https://api.inaturalist.org/v1/observations?lat=${lat}&lng=${lon}&radius=5`
        + `&locale=zh-TW&order_by=observed_on&per_page=24&photos=true&quality_grade=research`
        + `&iconic_taxa=Aves,Mammalia,Insecta,Amphibia,Reptilia&introduced=false`;
      const r = await fetch(u); if (!r.ok) return null;
      const j = await r.json();
      const seen = new Set(), out = [];
      for (const o of (j.results || [])) {
        const t = o.taxon; if (!t) continue;
        const nm = t.preferred_common_name || t.name; if (!nm || seen.has(nm)) continue;
        seen.add(nm);
        const p = o.photos && o.photos[0] && o.photos[0].url;
        out.push({ name: nm, sci: t.name, thumb: p ? p.replace("square", "small") : null, on: o.observed_on || "" });
        if (out.length >= 12) break;
      }
      return out.length ? out : null;
    } catch (e) { return null; }
  }

  return { habitatsFor, speciesFor, biteRisk, nearbyObservations, isPoison, CATS };
})();
if (typeof module !== "undefined" && module.exports) module.exports = Ecology;
