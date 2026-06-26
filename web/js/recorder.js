// GPS 路徑記錄器：累積距離、估算步數與卡路里
// 只在「真的有移動」時才累積：過濾 GPS 抖動，卡路里依實際移動時間計算（靜止時凍結）。
const Recorder = (() => {
  const MIN_MOVE = 5;          // 公尺：兩點位移低於此視為原地抖動，不累積
  const MAX_JUMP = 200;        // 公尺：高於此視為 GPS 跳點，捨棄
  const MAX_ACC = 50;          // 公尺：定位精度比這差就忽略該點
  const ELEV_DEADBAND = 3;     // 公尺：高度變化低於此視為 GPS 雜訊，不計爬升/下降
  // 卡路里係數（kcal /(公斤·公尺)）：上坡為位能/肌肉效率(~23%)，下坡離心約上坡的 30%
  const KCAL_PER_KG_ASCENT = 0.0102;
  const KCAL_PER_KG_DESCENT = 0.0102 * 0.30;

  let state = "idle";          // idle | running | paused
  let watchId = null, simTimer = null, ticker = null;
  const SMOOTH = 0.6;          // EMA 平滑係數（越大越貼近原始）
  let track = [];              // [{lat, lon, t}] 僅存通過過濾的軌跡點
  let distance = 0;            // 公尺（水平實際移動）
  let dist3D = 0;              // 公尺（含坡度 3D 距離）
  let ascent = 0;              // 累積爬升（公尺，已去抖動）
  let descent = 0;             // 累積下降（公尺，已去抖動）
  let refAlt = null;           // 高度去抖動基準
  let lastFixAlt = null;       // 上一個被接受點的高度（算 3D 用）
  let smLat = null, smLon = null;   // EMA 平滑後座標
  let elapsedMs = 0, lastResume = 0;   // 總計時（碼表，含休息）
  let movingMs = 0;            // 實際移動時間（卡路里用）
  let lastFix = null;          // 上一個被接受的定位點
  let lastPersist = 0;         // 上次存檔時間（節流）
  let simPos = null;
  let cb = () => {};

  function onUpdate(fn) { cb = fn; }

  // 步距(公尺) ≈ 身高 * 0.415；卡路里採 MET 法
  function strideMeters() { return (Store.height() * 0.415) / 100; }

  function steps() { return Math.round(distance / strideMeters()); }

  // 平路步行 MET（依速度）
  function metForSpeed(kmh) {
    return kmh < 3.2 ? 2.8 : kmh < 4.8 ? 3.5 : kmh < 6.4 ? 5.0 : kmh < 8 ? 7.0 : 8.3;
  }

  function elapsed() { return elapsedMs + (state === "running" ? Date.now() - lastResume : 0); }

  // 高度去抖動：累積爬升/下降只計顯著變化，過濾 GPS 高度雜訊
  function updateElevation(alt) {
    if (alt == null) return;
    if (refAlt == null) { refAlt = alt; return; }
    const dz = alt - refAlt;
    if (Math.abs(dz) >= ELEV_DEADBAND) {
      if (dz > 0) ascent += dz; else descent += -dz;
      refAlt = alt;
    }
  }

  // 卡路里 = 平路移動(依時間) + 上坡爬升 + 下坡下降，三者相加；靜止時不增加
  function calories() {
    const hrs = movingMs / 3600000;
    if (hrs <= 0) return 0;
    const kmh = (distance / 1000) / hrs;
    const w = Store.weight();
    const flat = metForSpeed(kmh) * w * hrs;
    const climb = ascent * w * KCAL_PER_KG_ASCENT;
    const down = descent * w * KCAL_PER_KG_DESCENT;
    return Math.round(flat + climb + down);
  }

  function snapshot() {
    const ms = elapsed(), km = distance / 1000;
    const moveHrs = movingMs / 3600000;
    const kmh = moveHrs > 0 ? km / moveHrs : 0;
    // 配速用移動時間（實際走路快慢，不含休息）
    const paceSec = (km > 0.01 && movingMs > 0) ? (movingMs / 1000) / km : 0;
    return {
      state, track, distanceKm: km, distance3DKm: dist3D / 1000, steps: steps(), kcal: calories(),
      elapsedMs: ms, movingMs, ascent, descent, speedKmh: kmh,
      pace: paceSec ? `${Math.floor(paceSec / 60)}'${String(Math.round(paceSec % 60)).padStart(2, "0")}` : "--",
    };
  }

  // 接受一個定位點，套用抖動/跳點/精度過濾，只在真的移動時累積
  function push(lat, lon, alt, acc) {
    if (acc != null && acc > MAX_ACC) return;        // 訊號太差，忽略
    const now = Date.now();
    // #7 EMA 平滑座標，降低 GPS 雜訊鋸齒
    if (smLat == null) { smLat = lat; smLon = lon; }
    else { smLat = SMOOTH * lat + (1 - SMOOTH) * smLat; smLon = SMOOTH * lon + (1 - SMOOTH) * smLon; }
    const p = { lat: smLat, lon: smLon, t: now };

    if (!lastFix) {                                  // 第一個點：設為錨點
      lastFix = p; if (refAlt == null && alt != null) refAlt = alt;
      if (alt != null) lastFixAlt = alt;
      track.push(p); cb(snapshot()); return;
    }

    const d = haversine(lastFix, p);
    if (d < MIN_MOVE) {                              // 原地抖動：不累積，只推進時間基準
      lastFix.t = now;
      cb(snapshot()); return;
    }
    if (d <= MAX_JUMP) {                             // 視為真實移動
      distance += d;
      // #10 3D 距離：加垂直分量，坡度限 100% 以抑制 GPS 高度雜訊
      let seg3 = d;
      if (alt != null && lastFixAlt != null) {
        let dz = Math.max(-d, Math.min(d, alt - lastFixAlt));
        seg3 = Math.sqrt(d * d + dz * dz);
      }
      dist3D += seg3;
      if (alt != null) lastFixAlt = alt;
      movingMs += now - lastFix.t;
      updateElevation(alt);                          // 去抖動後累積爬升/下降
      track.push(p);
      if (now - lastPersist > 4000) { lastPersist = now; persist(); }   // 節流即時存檔
    }
    // d > MAX_JUMP：GPS 跳點，不累積，但更新錨點避免下次又算成大跳
    lastFix = p;
    cb(snapshot());
  }

  // --- 真實 GPS ---
  function startGPS() {
    if (!navigator.geolocation) { alert("此裝置不支援定位，請改用模擬模式"); return false; }
    watchId = navigator.geolocation.watchPosition(
      pos => push(pos.coords.latitude, pos.coords.longitude, pos.coords.altitude, pos.coords.accuracy),
      err => cb({ ...snapshot(), error: err.message }),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
    return true;
  }

  // --- 模擬：從台北市區附近隨機漫步 ---
  function startSim() {
    if (!simPos) simPos = { lat: 25.033 + Math.random() * .01, lon: 121.564 + Math.random() * .01 };
    let alt = 50, heading = Math.random() * Math.PI * 2;
    simTimer = setInterval(() => {
      heading += (Math.random() - 0.5) * 0.6;
      const step = 0.00010 + Math.random() * 0.00006;   // ~12-18m/tick
      simPos.lat += Math.cos(heading) * step;
      simPos.lon += Math.sin(heading) * step;
      alt += (Math.random() - 0.4) * 4;
      push(simPos.lat, simPos.lon, alt);
    }, 1000);
  }

  function start(sim) {
    if (state === "running") return;
    if (state === "idle") { track = []; distance = 0; dist3D = 0; ascent = 0; descent = 0; refAlt = null; lastFixAlt = null; smLat = null; smLon = null; elapsedMs = 0; movingMs = 0; lastFix = null; }
    lastResume = Date.now();
    state = "running";
    if (sim) startSim(); else if (!startGPS()) { state = "idle"; return; }
    ticker = setInterval(() => cb(snapshot()), 1000);
    persist();
    cb(snapshot());
  }

  function pause() {
    if (state !== "running") return;
    elapsedMs += Date.now() - lastResume;
    state = "paused";
    lastFix = null;          // 恢復後重新設錨點，避免把暫停期間算成移動
    refAlt = null;           // 高度也重新設基準
    lastFixAlt = null; smLat = null; smLon = null;
    stopSources();
    persist();
    cb(snapshot());
  }

  function resume(sim) { if (state === "paused") start(sim); }

  function stopSources() {
    if (watchId != null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    if (simTimer) { clearInterval(simTimer); simTimer = null; }
    if (ticker) { clearInterval(ticker); ticker = null; }
  }

  function stop() {
    if (state === "running") elapsedMs += Date.now() - lastResume;
    stopSources();
    const snap = snapshot();
    const result = track.length > 1 ? {
      id: "r" + Date.now(),
      date: new Date().toISOString(),
      distanceKm: snap.distanceKm, distance3DKm: snap.distance3DKm, steps: snap.steps, kcal: snap.kcal,
      elapsedMs: snap.elapsedMs, ascent: Math.round(ascent), descent: Math.round(descent), track: track.slice(),
    } : null;
    state = "idle"; track = []; distance = 0; dist3D = 0; ascent = 0; descent = 0; refAlt = null; lastFixAlt = null;
    smLat = null; smLon = null; elapsedMs = 0; movingMs = 0; lastFix = null; simPos = null;
    persist();
    cb(snapshot());
    return result;
  }

  // --- 崩潰復原：即時把記錄狀態存進 localStorage ---
  const ACTIVE = "tt_active_rec";
  function persist() {
    try {
      if (state === "idle") { localStorage.removeItem(ACTIVE); return; }
      localStorage.setItem(ACTIVE, JSON.stringify({
        track, distance, dist3D, ascent, descent, movingMs,
        elapsedMs: elapsed(), trailName: Recorder._trailName || null, savedAt: Date.now(),
      }));
    } catch { /* quota */ }
  }
  function hasActive() {
    try { const d = JSON.parse(localStorage.getItem(ACTIVE)); return !!(d && d.track && d.track.length > 1); }
    catch { return false; }
  }
  // 復原為「暫停」狀態，使用者可繼續或結束
  function restore() {
    let d; try { d = JSON.parse(localStorage.getItem(ACTIVE)); } catch { return null; }
    if (!d || !d.track) return null;
    track = d.track; distance = d.distance || 0; dist3D = d.dist3D || 0;
    ascent = d.ascent || 0; descent = d.descent || 0; movingMs = d.movingMs || 0; elapsedMs = d.elapsedMs || 0;
    refAlt = null; lastFixAlt = null; smLat = null; smLon = null; lastFix = null;
    state = "paused"; Recorder._trailName = d.trailName || null;
    cb(snapshot());
    return snapshot();
  }

  return { start, pause, resume, stop, snapshot, onUpdate, getState: () => state, hasActive, restore };
})();
