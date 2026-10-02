// 步道人氣（擁擠熱度）：步道詳情頁「最近 7 天 12 人走過」＋星期×時段熱度圖（哪個時段人最多、哪個時段最清幽）。
// 資料：supabase/schema-phase32-trail-crowd.sql 的 trail_crowd（匿名聚合、少於 3 人不給數字）＋舊的 trail_activity（平均耗時）。
// 貢獻：登入的人走完一條步道（真實記錄）→ 匿名送「步道、出發時間、走多久」，不送軌跡和位置。設定裡可以關（tt_crowd_off）。
const TrailCrowd = (() => {
  const T = s => (typeof ttT === "function" ? ttT(s) : s);
  const SLOTS = ["清晨", "上午", "中午", "下午"];   // <8、8–11、11–14、14 點後（台灣時間）
  const ready = () => typeof Supa !== "undefined" && Supa.ready && Supa.ready() && Supa.client();
  const off = () => { try { return localStorage.getItem("tt_crowd_off") === "1"; } catch (e) { return false; } };
  // 星期幾：0=週一 … 6=週日（2024-01-01 是週一）
  const dayName = (i, long) => new Date(2024, 0, 1 + i).toLocaleDateString(ttLocale(), { weekday: long ? "long" : "narrow" });

  // 10 分鐘記憶快取：來回切換步道不重抓（人氣是一整週的統計，幾分鐘內不會變）
  const _cache = new Map();
  async function fetchAll(id) {
    const hit = _cache.get(String(id));
    if (hit && Date.now() - hit.at < 600000) return hit.v;
    const v = await fetchFresh(id);
    if (v.crowd || v.act) _cache.set(String(id), { at: Date.now(), v });
    return v;
  }
  async function fetchFresh(id) {
    const c = Supa.client();
    const [a, b] = await Promise.all([
      c.rpc("trail_crowd", { p_trail: String(id) }).then(r => r, () => ({ error: 1 })),
      c.rpc("trail_activity", { p_trail: String(id), p_days: 30 }).then(r => r, () => ({ error: 1 })),
    ]);
    return { crowd: !a.error && a.data && a.data[0] ? a.data[0] : null, act: !b.error && b.data && b.data[0] ? b.data[0] : null };
  }
  // 熱度圖的一句話：最熱鬧的時段＋白天裡最清幽的時段（優先平日）
  function summary(grid) {
    let best = -1, bi = 0;
    grid.forEach((v, i) => { if (v > best) { best = v; bi = i; } });
    let calm = null;
    for (const d of [0, 1, 2, 3, 4, 5, 6]) for (const s of [1, 2]) { const i = d * 4 + s; if (calm == null || grid[i] < grid[calm]) calm = i; }
    const name = i => `${dayName(Math.floor(i / 4), true)}${ttSp()}${T(SLOTS[i % 4])}`;
    const out = [`<span>${T("%s最熱鬧").replace("%s", `<b>${name(bi)}</b>`)}</span>`];
    if (calm != null && grid[calm] < best) out.push(`<span>${T("想清幽一點：%s").replace("%s", `<b>${name(calm)}</b>`)}</span>`);
    return out.join("");
  }
  function gridHtml(grid) {
    const cols = [0, 1, 2, 3, 4, 5, 6];
    return `<div class="crowd-grid" role="img" aria-label="${T("星期與時段的人潮")}">
      <span></span>${cols.map(d => `<span class="cg-d${d >= 5 ? " we" : ""}">${dayName(d)}</span>`).join("")}
      ${SLOTS.map((s, si) => `<span class="cg-s">${T(s)}</span>${cols.map(d => `<i class="cg-c l${grid[d * 4 + si] || 0}"></i>`).join("")}`).join("")}
    </div>
    <div class="crowd-legend"><span>${T("人少")}</span><i class="cg-c l0"></i><i class="cg-c l1"></i><i class="cg-c l2"></i><i class="cg-c l3"></i><i class="cg-c l4"></i><span>${T("人多")}</span></div>`;
  }

  async function load(t, preview) {
    const box = document.getElementById("activityBox"); if (!box) return;
    let r;
    if (preview) r = preview;   // 測試面板：用範例資料畫一次
    else {
      if (typeof socialHidden === "function" && socialHidden()) return;   // 社群功能關掉時不查別人的健行統計
      if (!ready()) return;
      try { r = await fetchAll(t.id); } catch (e) { return; }
    }
    if (typeof _detailTrail !== "undefined" && _detailTrail !== t) return;   // 已切換步道
    const cr = r.crowd, a = r.act;
    const h7 = cr ? cr.hikers7 : 0, h30 = cr ? cr.hikers30 : (a && a.hikers >= 3 ? a.hikers : 0);
    const grid = cr && Array.isArray(cr.grid) && cr.grid.length === 28 && cr.grid.some(x => x > 0) ? cr.grid : null;
    const meds = [];
    if (a && a.hikers >= 3 && a.median_ms) meds.push(`<span>${T("平均耗時")} <b>${fmtTime(Number(a.median_ms))}</b></span>`);
    if (a && a.hikers >= 3 && a.median_ascent) meds.push(`<span>${T("平均爬升")} <b>↑${a.median_ascent}</b> m</span>`);
    if (!h7 && !h30 && !grid && !meds.length) {
      // 人太少：不給數字（隱私），但資料庫已經開了 → 留一行小字，讓人知道走完會幫忙累積（冷啟動）
      if (!cr) return;
      box.hidden = false; box.className = "activity-card crowd-card crowd-empty";
      box.innerHTML = `<div class="act-h">${ic("users")} ${T("步道人氣")}</div><div class="crowd-note">${T(off() ? "這條步道的人氣資料還不夠。" : "這條步道的人氣資料還不夠。走完會匿名幫忙累積，幾個人走過就看得到哪個時段人多。")}</div>`;
      return;
    }
    const counts = [];
    if (h7) counts.push(`<span>${T("最近 7 天")} <b>${h7}</b> ${T("人走過")}</span>`);
    if (h30 && h30 !== h7) counts.push(`<span>${T("30 天")} <b>${h30}</b> ${T("人")}</span>`);
    else if (h30 && !h7) counts.push(`<span>${T("最近 30 天")} <b>${h30}</b> ${T("人走過")}</span>`);
    box.hidden = false;
    box.className = "activity-card crowd-card";
    box.innerHTML = `<div class="act-h">${ic("users")} ${T("步道人氣")}</div>
      ${counts.length ? `<div class="act-row">${counts.join("")}</div>` : ""}
      ${grid ? `<div class="crowd-sum">${summary(grid)}</div>${gridHtml(grid)}` : ""}
      ${meds.length ? `<div class="act-row act-meds">${meds.join("")}</div>` : ""}
      <div class="crowd-note">${T("依山友匿名分享的出發時間統計，人數太少不顯示")}</div>`;
  }

  // 走完送一筆（不擋結算；失敗就算了，不重送）
  async function contribute(rec) {
    if (!rec || rec.sim || rec.vehicle || !rec.trailId || off()) return false;
    if ((rec.distanceKm || 0) < 0.3 || (rec.elapsedMs || 0) < 10 * 60000) return false;   // 太短不算走過
    if (!ready()) return false;
    try {
      const { data: u } = await Supa.meUser(); if (!u || !u.user) return false;
      const start = new Date(new Date(rec.date).getTime() - (rec.elapsedMs || 0));
      const { error } = await Supa.client().from("trail_visits").insert({ user_id: u.user.id, trail_id: String(rec.trailId), started_at: start.toISOString(), duration_min: Math.max(1, Math.min(4320, Math.round((rec.elapsedMs || 0) / 60000))) });
      return !error;
    } catch (e) { return false; }
  }
  return { load, contribute, off, _summary: summary };
})();
if (typeof window !== "undefined") window.TrailCrowd = TrailCrowd;
