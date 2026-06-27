// 本機儲存：個人資料 + 行程紀錄
const Store = (() => {
  const PK = "tt_profile", RK = "tt_records";

  function getProfile() {
    try { return JSON.parse(localStorage.getItem(PK)) || {}; } catch { return {}; }
  }
  function saveProfile(p) { localStorage.setItem(PK, JSON.stringify(p)); }

  // 預設體重 60kg、身高 170cm
  function weight() { return Number(getProfile().weight) || 60; }
  function height() { return Number(getProfile().height) || 170; }

  function getRecords() {
    try { return JSON.parse(localStorage.getItem(RK)) || []; } catch { return []; }
  }
  function addRecord(rec) {
    const all = getRecords();
    all.unshift(rec);
    localStorage.setItem(RK, JSON.stringify(all.slice(0, 100)));
  }
  function deleteRecord(id) {
    localStorage.setItem(RK, JSON.stringify(getRecords().filter(r => r.id !== id)));
  }
  function clearRecords() { localStorage.removeItem(RK); }
  function clearSimRecords() {
    const kept = getRecords().filter(r => !r.sim);
    localStorage.setItem(RK, JSON.stringify(kept));
    return kept.length;
  }

  // 收藏
  const FK = "tt_favs";
  function getFavs() { try { return JSON.parse(localStorage.getItem(FK)) || []; } catch { return []; } }
  function isFav(id) { return getFavs().includes(id); }
  function toggleFav(id) {
    const f = getFavs();
    const i = f.indexOf(id);
    if (i === -1) f.push(id); else f.splice(i, 1);
    localStorage.setItem(FK, JSON.stringify(f));
    return i === -1;   // true = 已加入
  }

  // 我的步記（已完成 / 評分 / 筆記）
  const LK = "tt_log";
  function getLog() { try { return JSON.parse(localStorage.getItem(LK)) || {}; } catch { return {}; } }
  function trailLog(id) { return getLog()[id] || {}; }
  function setTrailLog(id, patch) {
    const l = getLog();
    l[id] = Object.assign({}, l[id], patch);
    if (!l[id].done && !l[id].rating && !(l[id].note || "").trim()) delete l[id];   // 空的就移除
    localStorage.setItem(LK, JSON.stringify(l));
  }
  function doneCount() { return Object.values(getLog()).filter(v => v.done).length; }

  // 備份 / 還原（避免換手機或清快取資料遺失）
  function exportAll() {
    const pet = {};
    for (const k of ["tt_pet_name", "tt_pet_hatch", "tt_pet_stage", "tt_pet_base",
      "tt_pet_berry_spent", "tt_pet_aff", "tt_pet_aff_t", "tt_pet_fed", "tt_pet_feedkm", "tt_daily_goal"]) { const v = localStorage.getItem(k); if (v != null) pet[k] = v; }
    return { v: 1, exportedAt: new Date().toISOString(),
      profile: getProfile(), records: getRecords(), favs: getFavs(), log: getLog(), pet };
  }
  function importAll(data, mode) {
    if (!data || typeof data !== "object") throw new Error("格式錯誤");
    if (data.profile) saveProfile(data.profile);
    if (data.pet) for (const k in data.pet) try { localStorage.setItem(k, data.pet[k]); } catch { /* */ }
    if (mode === "merge") {
      const ids = new Set(getRecords().map(r => r.id));
      const merged = getRecords().concat((data.records || []).filter(r => !ids.has(r.id)))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      localStorage.setItem(RK, JSON.stringify(merged.slice(0, 100)));
      localStorage.setItem(FK, JSON.stringify([...new Set(getFavs().concat(data.favs || []))]));
      localStorage.setItem(LK, JSON.stringify(Object.assign({}, getLog(), data.log || {})));
    } else {
      if (data.records) localStorage.setItem(RK, JSON.stringify(data.records.slice(0, 100)));
      if (data.favs) localStorage.setItem(FK, JSON.stringify(data.favs));
      if (data.log) localStorage.setItem(LK, JSON.stringify(data.log));
    }
  }

  return { getProfile, saveProfile, weight, height, getRecords, addRecord, deleteRecord, clearRecords,
           getFavs, isFav, toggleFav, trailLog, setTrailLog, doneCount, exportAll, importAll, clearSimRecords };
})();

// 公用：兩點 haversine 距離（公尺）
function haversine(a, b) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
