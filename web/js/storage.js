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

  return { getProfile, saveProfile, weight, height, getRecords, addRecord, deleteRecord };
})();

// 公用：兩點 haversine 距離（公尺）
function haversine(a, b) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
