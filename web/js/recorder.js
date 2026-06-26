// GPS 路徑記錄器：累積距離、估算步數與卡路里
// 只在「真的有移動」時才累積：過濾 GPS 抖動，卡路里依實際移動時間計算（靜止時凍結）。
const Recorder = (() => {
  const MIN_MOVE = 5;          // 公尺：兩點位移低於此視為原地抖動，不累積
  const MAX_JUMP = 200;        // 公尺：高於此視為 GPS 跳點，捨棄
  const MAX_ACC = 50;          // 公尺：定位精度比這差就忽略該點

  let state = "idle";          // idle | running | paused
  let watchId = null, simTimer = null, ticker = null;
  let track = [];              // [{lat, lon, t}] 僅存通過過濾的軌跡點
  let distance = 0;            // 公尺（實際移動）
  let ascent = 0;              // 累積爬升（公尺）
  let elapsedMs = 0, lastResume = 0;   // 總計時（碼表，含休息）
  let movingMs = 0;            // 實際移動時間（卡路里用）
  let lastFix = null;          // 上一個被接受的定位點
  let lastAlt = null;
  let simPos = null;
  let cb = () => {};

  function onUpdate(fn) { cb = fn; }

  // 步距(公尺) ≈ 身高 * 0.415；卡路里採 MET 法
  function strideMeters() { return (Store.height() * 0.415) / 100; }

  function steps() { return Math.round(distance / strideMeters()); }

  function metForSpeed(kmh, grade) {
    let met = kmh < 3.2 ? 2.8 : kmh < 4.8 ? 3.5 : kmh < 6.4 ? 5.0 : kmh < 8 ? 7.0 : 8.3;
    if (grade > 0.05) met += grade * 100 * 0.12;   // 上坡加成
    return met;
  }

  function elapsed() { return elapsedMs + (state === "running" ? Date.now() - lastResume : 0); }

  // 卡路里依「實際移動時間」計算 → 靜止時不增加
  function calories() {
    const hrs = movingMs / 3600000;
    if (hrs <= 0) return 0;
    const kmh = (distance / 1000) / hrs;
    const grade = distance > 0 ? ascent / distance : 0;
    return Math.round(metForSpeed(kmh, grade) * Store.weight() * hrs);
  }

  function snapshot() {
    const ms = elapsed(), km = distance / 1000;
    const moveHrs = movingMs / 3600000;
    const kmh = moveHrs > 0 ? km / moveHrs : 0;
    // 配速用移動時間（實際走路快慢，不含休息）
    const paceSec = (km > 0.01 && movingMs > 0) ? (movingMs / 1000) / km : 0;
    return {
      state, track, distanceKm: km, steps: steps(), kcal: calories(),
      elapsedMs: ms, movingMs, ascent, speedKmh: kmh,
      pace: paceSec ? `${Math.floor(paceSec / 60)}'${String(Math.round(paceSec % 60)).padStart(2, "0")}` : "--",
    };
  }

  // 接受一個定位點，套用抖動/跳點/精度過濾，只在真的移動時累積
  function push(lat, lon, alt, acc) {
    if (acc != null && acc > MAX_ACC) return;        // 訊號太差，忽略
    const now = Date.now();
    const p = { lat, lon, t: now };

    if (!lastFix) {                                  // 第一個點：設為錨點
      lastFix = p; lastAlt = alt != null ? alt : lastAlt;
      track.push(p); cb(snapshot()); return;
    }

    const d = haversine(lastFix, p);
    if (d < MIN_MOVE) {                              // 原地抖動：不累積，只推進時間基準
      lastFix.t = now;
      cb(snapshot()); return;
    }
    if (d <= MAX_JUMP) {                             // 視為真實移動
      distance += d;
      movingMs += now - lastFix.t;
      if (alt != null && lastAlt != null && alt - lastAlt > 0) ascent += alt - lastAlt;
      track.push(p);
    }
    // d > MAX_JUMP：GPS 跳點，不累積，但更新錨點避免下次又算成大跳
    lastFix = p;
    if (alt != null) lastAlt = alt;
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
    if (state === "idle") { track = []; distance = 0; ascent = 0; elapsedMs = 0; movingMs = 0; lastAlt = null; lastFix = null; }
    lastResume = Date.now();
    state = "running";
    if (sim) startSim(); else if (!startGPS()) { state = "idle"; return; }
    ticker = setInterval(() => cb(snapshot()), 1000);
    cb(snapshot());
  }

  function pause() {
    if (state !== "running") return;
    elapsedMs += Date.now() - lastResume;
    state = "paused";
    lastFix = null;          // 恢復後重新設錨點，避免把暫停期間算成移動
    stopSources();
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
      distanceKm: snap.distanceKm, steps: snap.steps, kcal: snap.kcal,
      elapsedMs: snap.elapsedMs, ascent: Math.round(ascent), track: track.slice(),
    } : null;
    state = "idle"; track = []; distance = 0; ascent = 0; elapsedMs = 0; movingMs = 0;
    lastAlt = null; lastFix = null; simPos = null;
    cb(snapshot());
    return result;
  }

  return { start, pause, resume, stop, snapshot, onUpdate, getState: () => state };
})();
