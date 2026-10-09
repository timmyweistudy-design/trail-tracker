// 每月挑戰：每個月一個里程目標＋一個出門次數目標，月初依你過去三個月的平均定下來（比平常多一點點），
// 整個月固定不變。兩項都達成就能領果實；第一次完成還會解鎖限定夥伴配件「登山頭巾」。
// 狀態：tt_mch = { ym: "2026-10", km, trips }（這個月的目標），tt_mch_done = ["2026-09", ...]（領過的月份）。
const Challenge = (() => {
  const T = s => (typeof ttT === "function" ? ttT(s) : s);
  const REWARD = 25, HAT = "bandana";
  const ym = (d) => { d = d || new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
  function doneList() { try { return JSON.parse(localStorage.getItem("tt_mch_done")) || []; } catch (e) { return []; } }
  function recsIn(ymStr) { return (typeof realRecords === "function" ? realRecords() : []).filter(r => !r.vehicle && localYM(r.date) === ymStr); }
  // 這個月的目標：前三個月平均的 1.15 倍、取整到 5 km；沒什麼紀錄就從 15 km、3 趟開始。上限 300 km、20 趟，不要變成苦差事
  function goal() {
    const now = ym();
    let g = null; try { g = JSON.parse(localStorage.getItem("tt_mch")); } catch (e) { /* */ }
    if (g && g.ym === now) return g;
    const prev = [1, 2, 3].map(k => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - k); return recsIn(ym(d)); });
    const kmAvg = prev.reduce((s, rs) => s + rs.reduce((a, r) => a + (r.distanceKm || 0), 0), 0) / 3;
    const tripAvg = prev.reduce((s, rs) => s + rs.length, 0) / 3;
    g = { ym: now, km: Math.min(300, Math.max(15, Math.round(kmAvg * 1.15 / 5) * 5)), trips: Math.min(20, Math.max(3, Math.round(tripAvg * 1.15))) };
    try { localStorage.setItem("tt_mch", JSON.stringify(g)); } catch (e) { /* */ }
    return g;
  }
  function progress() {
    const g = goal(), rs = recsIn(g.ym);
    const km = rs.reduce((a, r) => a + (r.distanceKm || 0), 0), trips = rs.length;
    return { g, km, trips, done: km >= g.km && trips >= g.trips, claimed: doneList().includes(g.ym) };
  }
  function hatUnlocked() { return doneList().length > 0; }
  function claim() {
    const p = progress(); if (!p.done || p.claimed) return;
    const first = !hatUnlocked();
    const list = doneList(); list.push(p.g.ym);
    try { localStorage.setItem("tt_mch_done", JSON.stringify(list)); } catch (e) { /* */ }
    if (typeof addBerryBonus === "function") addBerryBonus(REWARD);
    if (typeof bumpAffinity === "function") bumpAffinity(10);
    if (first) {   // 頭巾直接放進已擁有（不必再花果實）
      try { const own = new Set(JSON.parse(localStorage.getItem("tt_pet_hats_owned")) || ["none"]); own.add(HAT); localStorage.setItem("tt_pet_hats_owned", JSON.stringify([...own])); } catch (e) { /* */ }
    }
    toast(first ? `${T("挑戰完成")} +${REWARD} ${T("顆果實")}・${T("解鎖限定配件「登山頭巾」")}` : `${T("挑戰完成")} +${REWARD} ${T("顆果實")}`);
    if (typeof ttBuzz === "function") ttBuzz([120, 60, 120, 60, 240]);
    try { if (typeof confetti === "function") confetti(); } catch (e) { /* */ }
    render(); if (typeof renderPet === "function") renderPet();
  }
  function bar(v, goalV, dec, unit) {
    const pct = Math.min(100, goalV ? v / goalV * 100 : 0), ok = v >= goalV;
    return `<div class="mch-row${ok ? " ok" : ""}"><div class="mch-top"><span>${unit}</span><b>${dec ? Math.min(v, 9999).toFixed(1) : Math.round(v)} / ${goalV}</b></div>
      <div class="mch-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${pct.toFixed(1)}%"></i></div></div>`;
  }
  function render() {
    const box = document.getElementById("petMonth"); if (!box) return;
    const p = progress(), d = new Date();
    const month = d.toLocaleDateString(ttLocale(), { month: "long" });
    const left = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate() - d.getDate();
    const hat = (typeof PET_ART !== "undefined" && PET_ART.hat) ? `<span class="mch-hat">${PET_ART.own(() => PET_ART.svg(petStageIndex(totalKm())))}${PET_ART.hat(HAT, petStageIndex(totalKm()))}</span>` : "";
    const btn = p.claimed ? `<button class="btn ghost" disabled>${ic("check")} ${T("這個月的挑戰完成了")}</button>`
      : p.done ? `<button class="btn primary" id="mchClaim">${T("領取")} +${REWARD} ${typeof BERRY_SVG !== "undefined" ? BERRY_SVG : ""}</button>`
        : `<div class="mch-left">${left > 0 ? `${T("這個月還剩")}${ttColon()}<b>${left}</b> ${T("天")}` : T("今天是這個月最後一天")}</div>`;
    box.innerHTML = `<div class="section-title">${ic("flag")}<span>${T("本月挑戰")}</span><span class="mch-month">${month}</span></div>
      <div class="mch-card${p.done ? " done" : ""}">
        ${!hatUnlocked() ? `<div class="mch-prize">${hat}<span><b>${T("第一次完成就解鎖")}</b><span>${T("限定配件「登山頭巾」")}</span></span></div>` : ""}
        ${bar(p.km, p.g.km, true, T("距離") + " km")}
        ${bar(p.trips, p.g.trips, false, T("出行次數"))}
        ${btn}
        <div class="mch-note">${T("目標依你最近三個月的平均，每月一號重新定")}</div>
      </div>`;
    const c = document.getElementById("mchClaim"); if (c) c.addEventListener("click", claim);
  }
  return { render, progress, goal, claim, hatUnlocked, HAT };
})();
if (typeof window !== "undefined") window.Challenge = Challenge;
