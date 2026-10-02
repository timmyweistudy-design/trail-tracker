// 即時步道路況：若有設定 Cloudflare Worker 代理（window.CONDITIONS_PROXY），
// 就向它抓最新路況、覆蓋烘焙進資料的舊路況；沒設定或失敗則沿用烘焙資料。
// 抓到的原始資料存一份在本機（tt_cond_cache）：下次開 App、或山上沒網路時，用的是「最後一次抓到的」而不是打包時的舊資料。
// 你收藏的步道路況有變（新封閉／恢復開放）會提醒一次（tt_cond_seen 記著上次看到的狀態）。
const Conditions = (() => {
  const URL = (typeof window !== "undefined" && window.CONDITIONS_PROXY) || "";
  const CK = "tt_cond_cache", SK = "tt_cond_seen";
  let lastUpdated = 0, lastOk = false;

  function apply(trails, raw) {
    const by = {};
    for (const c of raw) by[String(c.TRAILID)] = c;
    let n = 0;
    for (const t of trails) {
      if (t.source !== "forestry") continue;
      const tid = t.id.split("-").pop();
      const c = by[tid];
      if (c) {
        t.condition = { status: c.TR_TYP, title: c.TITLE, content: c.CONTENT, section: c.TR_SUB, reopen: c.opendate, dep: c.DEP_NAME, ann: c.ANN_DATE };
        n++;
      } else if (t.condition) {
        t.condition = null;   // 已解除封閉
      }
    }
    return n;
  }
  // 開機先套用本機存的最新一份（同步、不等網路）
  function restore(trails) {
    try {
      const c = JSON.parse(localStorage.getItem(CK) || "null");
      if (!c || !Array.isArray(c.data) || !c.at) return false;
      if (Date.now() - c.at > 14 * 864e5) return false;   // 太舊（兩週以上）就不要拿來蓋打包資料
      apply(trails, c.data); lastUpdated = c.at;
      return true;
    } catch (e) { return false; }
  }
  // 收藏的步道：跟上次看到的狀態比，回傳有變的 [{ t, was, now }]（第一次只記下來，不提醒）
  function favChanges(trails) {
    if (typeof Store === "undefined" || !Store.isFav) return [];
    let seen = null; try { seen = JSON.parse(localStorage.getItem(SK)); } catch (e) { /* */ }
    const out = [], next = {};
    for (const t of trails) {
      if (t.source !== "forestry" || !Store.isFav(t.id)) continue;
      const now = (t.condition && t.condition.status) || "";
      next[t.id] = now;
      if (seen && t.id in seen && seen[t.id] !== now) out.push({ t, was: seen[t.id], now });
    }
    try { localStorage.setItem(SK, JSON.stringify(next)); } catch (e) { /* */ }
    return out;
  }

  async function refresh(trails) {
    if (!URL) return { ok: false, count: -1 };   // 未設定代理
    try {
      const res = await fetch(URL);
      if (!res.ok) return { ok: false, count: 0 };
      const raw = await res.json();
      if (!Array.isArray(raw)) return { ok: false, count: 0 };
      const n = apply(trails, raw);
      lastUpdated = Date.now(); lastOk = true;
      try { localStorage.setItem(CK, JSON.stringify({ at: lastUpdated, data: raw })); } catch (e) { /* 存不下就算了 */ }
      return { ok: true, count: n, changes: favChanges(trails) };
    } catch { return { ok: false, count: 0 }; }
  }

  return { refresh, restore, favChanges, lastUpdated: () => lastUpdated, ok: () => lastOk };
})();
