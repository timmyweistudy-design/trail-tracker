// 即時步道路況：若有設定 Cloudflare Worker 代理（window.CONDITIONS_PROXY），
// 就向它抓最新路況、覆蓋烘焙進資料的舊路況；沒設定或失敗則沿用烘焙資料。
const Conditions = (() => {
  const URL = (typeof window !== "undefined" && window.CONDITIONS_PROXY) || "";

  async function refresh(trails) {
    if (!URL) return -1;   // 未設定代理
    try {
      const res = await fetch(URL);
      if (!res.ok) return 0;
      const raw = await res.json();
      const by = {};
      for (const c of raw) by[String(c.TRAILID)] = c;
      let n = 0;
      for (const t of trails) {
        if (t.source !== "forestry") continue;
        const tid = t.id.split("-").pop();
        const c = by[tid];
        if (c) {
          t.condition = { status: c.TR_TYP, title: c.TITLE, section: c.TR_SUB, reopen: c.opendate, dep: c.DEP_NAME };
          n++;
        } else if (t.condition) {
          t.condition = null;   // 已解除封閉
        }
      }
      return n;
    } catch { return 0; }
  }

  return { refresh };
})();
