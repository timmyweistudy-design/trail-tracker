// GPS 路徑記錄器：累積距離、估算步數與卡路里
const Recorder = (() => {
  let state = "idle";          // idle | running | paused
  let watchId = null, simTimer = null, ticker = null;
  let track = [];              // [{lat, lon, t}]
  let distance = 0;            // 公尺
  let ascent = 0;              // 累積爬升（公尺）
  let startTs = 0, elapsedMs = 0, lastResume = 0;
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

  function calories() {
    const hrs = elapsed() / 3600000;
    const kmh = hrs > 0 ? (distance / 1000) / hrs : 0;
    const grade = distance > 0 ? ascent / distance : 0;
    return Math.round(metForSpeed(kmh, grade) * Store.weight() * hrs);
  }

  function snapshot() {
    const ms = elapsed(), km = distance / 1000;
    const hrs = ms / 3600000;
    const kmh = hrs > 0 ? km / hrs : 0;
    const paceSec = km > 0.01 ? (ms / 1000) / km : 0;
    return {
      state, track, distanceKm: km, steps: steps(), kcal: calories(),
      elapsedMs: ms, ascent, speedKmh: kmh,
      pace: paceSec ? `${Math.floor(paceSec / 60)}'${String(Math.round(paceSec % 60)).padStart(2, "0")}` : "--",
    };
  }

  function push(lat, lon, alt) {
    const p = { lat, lon, t: Date.now() };
    if (track.length) {
      const d = haversine(track[track.length - 1], p);
      if (d < 200) distance += d;           // 過濾跳點
      if (alt != null && lastAlt != null && alt - lastAlt > 0) ascent += alt - lastAlt;
    }
    if (alt != null) lastAlt = alt;
    track.push(p);
    cb(snapshot());
  }

  // --- 真實 GPS ---
  function startGPS() {
    if (!navigator.geolocation) { alert("此裝置不支援定位，請改用模擬模式"); return false; }
    watchId = navigator.geolocation.watchPosition(
      pos => push(pos.coords.latitude, pos.coords.longitude, pos.coords.altitude),
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
    if (state === "idle") { track = []; distance = 0; ascent = 0; elapsedMs = 0; lastAlt = null; startTs = Date.now(); }
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
    state = "idle"; track = []; distance = 0; ascent = 0; elapsedMs = 0; lastAlt = null; simPos = null;
    cb(snapshot());
    return result;
  }

  return { start, pause, resume, stop, snapshot, onUpdate, getState: () => state };
})();
