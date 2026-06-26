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

  return { getProfile, saveProfile, weight, height, getRecords, addRecord, deleteRecord, clearRecords,
           getFavs, isFav, toggleFav };
})();

// 公用：兩點 haversine 距離（公尺）
function haversine(a, b) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
