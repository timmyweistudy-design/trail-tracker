// 本機儲存：個人資料 + 行程紀錄
// 行程有三層保護：
//   1. localStorage（同步、最近 100 筆）＝畫面直接讀的來源，有記憶體快取避免重複 JSON.parse
//   2. IndexedDB 封存（Archive）＝每筆完整紀錄（含軌跡）都另存一份，容量 GB 級，不受 100 筆上限影響
//   3. 終身統計（tt_life）＝只增不減的累積 km/爬升/步數/卡路里/趟數；就算舊紀錄被容量保護砍掉，
//      總里程、寵物等級也絕不倒退（手動刪除單筆才會扣回）
const Store = (() => {
  const PK = "tt_profile", RK = "tt_records";

  function getProfile() {
    try { return JSON.parse(localStorage.getItem(PK)) || {}; } catch { return {}; }
  }
  function saveProfile(p) { localStorage.setItem(PK, JSON.stringify(p)); }

  // 預設體重 60kg、身高 170cm
  function weight() { return Number(getProfile().weight) || 60; }
  function height() { return Number(getProfile().height) || 170; }
  function packWeight() { return Math.max(0, Number(getProfile().pack) || 0); }

  // ---- IndexedDB 完整封存（含軌跡）----
  const Archive = (() => {
    let dbp = null;
    function db() {
      if (dbp) return dbp;
      dbp = new Promise(res => {
        try {
          if (typeof indexedDB === "undefined") { res(null); return; }
          const rq = indexedDB.open("tt-archive", 1);
          rq.onupgradeneeded = () => { try { rq.result.createObjectStore("records", { keyPath: "id" }); } catch (e) { /* */ } };
          rq.onsuccess = () => res(rq.result);
          rq.onerror = () => res(null);
        } catch { res(null); }
      });
      return dbp;
    }
    async function put(rec) { const d = await db(); if (!d || !rec || !rec.id) return; try { d.transaction("records", "readwrite").objectStore("records").put(rec); } catch (e) { /* */ } }
    function req(r) { return new Promise(res => { r.onsuccess = () => res(r.result); r.onerror = () => res(null); }); }
    async function get(id) { const d = await db(); if (!d) return null; try { return (await req(d.transaction("records").objectStore("records").get(id))) || null; } catch { return null; } }
    async function all() { const d = await db(); if (!d) return []; try { return (await req(d.transaction("records").objectStore("records").getAll())) || []; } catch { return []; } }
    async function del(id) { const d = await db(); if (!d) return; try { d.transaction("records", "readwrite").objectStore("records").delete(id); } catch (e) { /* */ } }
    async function clear() { const d = await db(); if (!d) return; try { d.transaction("records", "readwrite").objectStore("records").clear(); } catch (e) { /* */ } }
    return { put, get, all, del, clear };
  })();

  // ---- 終身累積統計（只增不減）----
  const LIFE = "tt_life";
  const isFootR = r => r && !r.sim && !r.vehicle;
  function _lifeRead() { try { return JSON.parse(localStorage.getItem(LIFE)) || null; } catch { return null; } }
  function _lifeSave(s) { try { localStorage.setItem(LIFE, JSON.stringify(s)); } catch (e) { /* */ } }
  function _lifeFrom(recs) {
    const s = { km: 0, asc: 0, kcal: 0, steps: 0, ms: 0, trips: 0 };
    for (const r of recs) if (isFootR(r)) {
      s.km += r.distanceKm || 0; s.asc += r.ascent || 0; s.kcal += r.kcal || 0;
      s.steps += r.steps || 0; s.ms += r.elapsedMs || 0; s.trips++;
    }
    s.km = +s.km.toFixed(3); s.asc = Math.round(s.asc);
    return s;
  }
  function life() {
    let s = _lifeRead();
    if (!s) { s = _lifeFrom(getRecords()); _lifeSave(s); }   // 首次：由現有紀錄初始化
    return s;
  }
  function _bumpLife(rec, sign) {
    if (!isFootR(rec)) return;
    const s = life();
    s.km = Math.max(0, +(s.km + sign * (rec.distanceKm || 0)).toFixed(3));
    s.asc = Math.max(0, Math.round(s.asc + sign * (rec.ascent || 0)));
    s.kcal = Math.max(0, Math.round(s.kcal + sign * (rec.kcal || 0)));
    s.steps = Math.max(0, Math.round(s.steps + sign * (rec.steps || 0)));
    s.ms = Math.max(0, s.ms + sign * (rec.elapsedMs || 0));
    s.trips = Math.max(0, s.trips + sign);
    _lifeSave(s);
  }
  // 還原/合併備份後校正：取「現有終身值」與「由紀錄重算值」逐欄較大者
  function _lifeReconcile() {
    const a = life(), b = _lifeFrom(getRecords());
    const s = {}; for (const k of ["km", "asc", "kcal", "steps", "ms", "trips"]) s[k] = Math.max(a[k] || 0, b[k] || 0);
    _lifeSave(s);
  }

  // ---- 行程紀錄（記憶體快取：records 可能好幾 MB，別每次都 JSON.parse）----
  let _recCache = null;
  function getRecords() {
    if (!_recCache) { try { _recCache = JSON.parse(localStorage.getItem(RK)) || []; } catch { _recCache = []; } }
    return _recCache;
  }
  function _saveRecords(all) {
    try { localStorage.setItem(RK, JSON.stringify(all)); _recCache = all; return true; }
    catch { return false; }
  }
  // 空間不足時：先拿掉舊紀錄的軌跡（統計數字保留、軌跡可從封存/雲端找回），最後才丟整筆
  function _stripTrack(r) {
    if (!r || (!r.track && !r.altSeries)) return r;
    const c = Object.assign({}, r); delete c.track; delete c.altSeries; c.trackArchived = true; return c;
  }
  function addRecord(rec) {
    _bumpLife(rec, +1);
    Archive.put(rec);   // 完整封存（含軌跡），失敗不影響主流程
    const all = [rec, ...getRecords()].slice(0, 100);
    if (_saveRecords(all)) return;
    const slim = all.map((r, i) => i < 20 ? r : _stripTrack(r));   // 保留最近 20 筆軌跡
    if (_saveRecords(slim)) return;
    for (let keep = 80; keep >= 20; keep -= 20) { if (_saveRecords(slim.slice(0, keep))) return; }
  }
  function deleteRecord(id) {
    const rec = getRecords().find(r => r.id === id);
    if (rec) _bumpLife(rec, -1);   // 手動刪除＝使用者本意，終身統計一併扣回
    Archive.del(id);
    _saveRecords(getRecords().filter(r => r.id !== id));
  }
  function clearRecords() { localStorage.removeItem(RK); _recCache = null; _lifeSave({ km: 0, asc: 0, kcal: 0, steps: 0, ms: 0, trips: 0 }); Archive.clear(); }
  function setRecordNote(id, note) {
    const all = getRecords(); const r = all.find(x => x.id === id);
    if (r) { if (note) r.note = note; else delete r.note; _saveRecords(all); Archive.put(r); }
  }
  function clearSimRecords() {
    const kept = getRecords().filter(r => !r.sim);
    _saveRecords(kept);
    return kept.length;
  }
  // 取單筆完整紀錄：localStorage 沒軌跡（被容量保護精簡過）就到封存撈
  async function fullRecord(id) {
    const r = getRecords().find(x => x.id === id);
    if (r && r.track && r.track.length) return r;
    const a = await Archive.get(id);
    return a || r || null;
  }
  // 取全部紀錄（軌跡盡量補齊）：匯出 GPX/KML、足跡熱力圖用
  async function allFull() {
    const local = getRecords();
    const arch = await Archive.all();
    const am = new Map(arch.map(r => [r.id, r]));
    return local.map(r => (r.track && r.track.length) ? r : (am.get(r.id) || r));
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
  // 完整鍵清單：寵物、果實、成就、每日任務、外觀主題、篩選預設全都備份（新增鍵記得加進來）
  const BACKUP_KEYS = [
    "tt_pet_name", "tt_pet_hatch", "tt_pet_stage", "tt_pet_base",
    "tt_pet_berry_spent", "tt_pet_berry_bonus", "tt_pet_aff", "tt_pet_aff_t",
    "tt_pet_fed", "tt_pet_fed_t", "tt_pet_feedkm",
    "tt_quest_claim", "tt_quest_hi", "tt_badges_got", "tt_life",
    "tt_theme", "tt_accent", "tt_pro_color", "tt_pro_frame",
    "tt_presets", "tt_default_vis", "tt_wakelock",
  ];
  function exportAll() {
    const pet = {};
    for (const k of BACKUP_KEYS) { const v = localStorage.getItem(k); if (v != null) pet[k] = v; }
    return { v: 2, exportedAt: new Date().toISOString(),
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
      _saveRecords(merged.slice(0, 100));
      localStorage.setItem(FK, JSON.stringify([...new Set(getFavs().concat(data.favs || []))]));
      localStorage.setItem(LK, JSON.stringify(Object.assign({}, getLog(), data.log || {})));
    } else {
      if (data.records) _saveRecords(data.records.slice(0, 100));
      if (data.favs) localStorage.setItem(FK, JSON.stringify(data.favs));
      if (data.log) localStorage.setItem(LK, JSON.stringify(data.log));
    }
    for (const r of (data.records || [])) if (r && r.id && r.track) Archive.put(r);   // 匯入的完整紀錄也進封存
    _lifeReconcile();   // 終身統計取較大值，還原絕不倒退
  }

  return { getProfile, saveProfile, weight, height, getRecords, addRecord, deleteRecord, clearRecords,
           getFavs, isFav, toggleFav, trailLog, setTrailLog, doneCount, exportAll, importAll, clearSimRecords, packWeight, setRecordNote,
           life, fullRecord, allFull };
})();

// 公用：把軌跡依 gap 標記切成多段（暫停→繼續的跳段不相連）。回傳 [[{lat,lon,..}...], ...]
function trackSegments(track) {
  const segs = [];
  let cur = [];
  for (const p of (track || [])) {
    if (p && p.gap && cur.length) { segs.push(cur); cur = []; }
    cur.push(p);
  }
  if (cur.length) segs.push(cur);
  return segs;
}

// 公用：兩點 haversine 距離（公尺）
function haversine(a, b) {
  const R = 6371000, toRad = d => d * Math.PI / 180;
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
