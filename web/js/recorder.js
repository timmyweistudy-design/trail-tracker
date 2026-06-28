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
  let altSeries = [];          // [{x:距離m, e:海拔m}] 即時海拔曲線用
  let simMode = false;         // 本次記錄是否為模擬（模擬不計入寵物/成就）
  let lastAcceptT = 0;         // 上一個被採計點的時間（算分段速度用）
  let curSpeed = 0;            // 瞬時速度（公尺/秒，平滑後）供顯示
  // 混入新速度值：突然暴衝(GPS 雜訊)只給很小權重，避免數字亂飆
  function blendSpeed(r) {
    if (r == null || r < 0 || !isFinite(r)) return;
    if (r > 14) r = 14;                                   // 步行/跑步情境，>50km/h 一律當雜訊上限
    const w = (r > curSpeed * 1.8 + 1.5) ? 0.1 : 0.35;    // 跳太多→低權重；正常→平滑
    curSpeed = w * r + (1 - w) * curSpeed;
  }
  let distance = 0;            // 公尺（水平實際移動）
  let dist3D = 0;              // 公尺（含坡度 3D 距離）
  let ascent = 0;              // 累積爬升（公尺，已去抖動）
  let descent = 0;             // 累積下降（公尺，已去抖動）
  let refAlt = null;           // 高度去抖動基準
  let lastFixAlt = null;       // 上一個被接受點的高度（算 3D 用）
  let smLat = null, smLon = null;   // EMA 平滑後座標
  let elapsedMs = 0, lastResume = 0;   // 總計時（碼表）
  let movingMs = 0;            // 實際移動時間（卡路里用）
  const AUTO_PAUSE_MS = 90000; // 靜止超過此時間→自動暫停計時
  let autoPaused = false, lastMoveAt = 0, lowPower = false;
  let lastFix = null;          // 上一個被接受的定位點
  let lastPersist = 0;         // 上次存檔時間（節流）
  let simPos = null;
  let cb = () => {};

  function onUpdate(fn) { cb = fn; }

  // 步距(公尺) ≈ 身高 * 0.415；卡路里採 MET 法
  function strideMeters() { return (Store.height() * 0.415) / 100; }

  function steps() { return Math.round(distance / strideMeters()); }

  // 平路 MET（依速度；步行/跑步皆涵蓋）
  function metForSpeed(kmh) {
    return kmh < 3.2 ? 2.8 : kmh < 4.8 ? 3.5 : kmh < 6.4 ? 5.0 : kmh < 8 ? 7.0 : kmh < 11 ? 9.8 : 11.5;
  }
  // 合理步行/跑步上限：超過(像騎車/開車)的移動段不計入，避免灌水
  const MAX_FOOT_MS = 5.6;   // 公尺/秒 ≈ 20 km/h

  function elapsed() { return elapsedMs + ((state === "running" && !autoPaused) ? Date.now() - lastResume : 0); }

  // 自動暫停：靜止過久凍結計時（由 ticker 每秒檢查）
  function checkAutoPause() {
    if (state === "running" && !autoPaused && lastMoveAt && Date.now() - lastMoveAt > AUTO_PAUSE_MS) {
      elapsedMs += Date.now() - lastResume;   // 結算到此刻，凍結時鐘
      autoPaused = true;
    }
  }

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
    const w = Store.weight() + (Store.packWeight ? Store.packWeight() : 0);   // 體重 + 背包負重
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
      state, autoPaused, track, altSeries, distanceKm: km, distance3DKm: dist3D / 1000, steps: steps(), kcal: calories(),
      elapsedMs: ms, movingMs, ascent, descent, speedKmh: kmh, instKmh: (state === "running" && !autoPaused) ? curSpeed * 3.6 : 0,
      pace: paceSec ? `${Math.floor(paceSec / 60)}'${String(Math.round(paceSec % 60)).padStart(2, "0")}` : "--",
    };
  }

  // 接受一個定位點，套用抖動/跳點/精度過濾，只在真的移動時累積
  function push(lat, lon, alt, acc, clean, gpsSpeed) {
    if (!clean && acc != null && acc > MAX_ACC) return;   // 訊號太差，忽略（模擬點乾淨不過濾）
    const now = Date.now();
    // #7 EMA 平滑座標，降低 GPS 雜訊鋸齒；模擬點本身就在路線上，不平滑、不過濾才不會切彎偏離
    if (clean || smLat == null) { smLat = lat; smLon = lon; }
    else { smLat = SMOOTH * lat + (1 - SMOOTH) * smLat; smLon = SMOOTH * lon + (1 - SMOOTH) * smLon; }
    const p = { lat: smLat, lon: smLon, t: now };
    // 瞬時速度：優先用 GPS 回報的當下速度，尖峰拒斥+平滑後供顯示
    if (!clean && gpsSpeed != null && gpsSpeed >= 0) blendSpeed(gpsSpeed);

    if (!lastFix) {                                  // 第一個點：設為錨點
      lastFix = p; lastAcceptT = now; if (refAlt == null && alt != null) refAlt = alt;
      if (alt != null) lastFixAlt = alt;
      track.push(p); cb(snapshot()); return;
    }

    const d = haversine(lastFix, p);
    if (!clean && d < MIN_MOVE) {                    // 原地抖動：不累積，只推進時間基準
      lastFix.t = now;
      if (gpsSpeed == null) curSpeed *= 0.6;         // 無 GPS 速度時，靜止逐漸歸零
      cb(snapshot()); return;
    }
    // 自動偵測速度：超過合理步行/跑步上限(像騎車/開車) → 不計入里程，只移動錨點
    if (!clean) {
      const dt = (now - (lastAcceptT || lastFix.t)) / 1000;
      const segSpeed = (gpsSpeed != null && gpsSpeed >= 0) ? gpsSpeed : (dt >= 0.5 ? d / dt : curSpeed);
      if (gpsSpeed == null) blendSpeed(segSpeed);        // 無 GPS 速度→用估算(夠長的時間窗才採信)
      if (segSpeed > MAX_FOOT_MS) { lastFix = p; lastAcceptT = now; cb(snapshot()); return; }
    }
    if (clean || d <= MAX_JUMP) {                    // 視為真實移動
      lastAcceptT = now;
      if (autoPaused) { lastResume = Date.now(); autoPaused = false; }   // 移動→自動恢復計時
      lastMoveAt = Date.now();
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
      if (alt != null) altSeries.push({ x: distance, e: alt });   // 即時海拔曲線
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
      pos => push(pos.coords.latitude, pos.coords.longitude, pos.coords.altitude, pos.coords.accuracy, false, pos.coords.speed),
      err => cb({ ...snapshot(), error: err.message }),
      // 省電模式：關高精度、容許較舊定位，降低 GPS 耗電
      lowPower ? { enableHighAccuracy: false, maximumAge: 8000, timeout: 20000 }
               : { enableHighAccuracy: true, maximumAge: 1000, timeout: 15000 }
    );
    return true;
  }
  function setLowPower(on) { lowPower = !!on; }

  // --- 螢幕喚醒鎖：記錄中讓螢幕不自動熄滅，避免 App 被系統凍結而停止記錄（使用者可勾選開關）---
  let wakeWanted = false, wakeSentinel = null;
  async function acquireWake() {
    if (!wakeWanted || wakeSentinel || state !== "running" || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    try {
      wakeSentinel = await navigator.wakeLock.request("screen");
      wakeSentinel.addEventListener("release", () => { wakeSentinel = null; });
    } catch { wakeSentinel = null; }
  }
  function releaseWake() {
    if (wakeSentinel) { try { wakeSentinel.release(); } catch { } wakeSentinel = null; }
  }
  function setWake(on) { wakeWanted = !!on; if (wakeWanted) acquireWake(); else releaseWake(); }
  // 喚醒鎖在切到背景時會被系統自動釋放，回到前景且仍在記錄時重新取得
  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && state === "running" && wakeWanted) acquireWake();
    });
  }

  // --- 模擬 ---
  let simRoute = null, simDist = 0;
  function setSimRoute(pts) { simRoute = (pts && pts.length > 1) ? pts : null; }

  function _routeLen(r) {
    let s = 0;
    for (let i = 1; i < r.length; i++) s += haversine({ lat: r[i - 1][0], lon: r[i - 1][1] }, { lat: r[i][0], lon: r[i][1] });
    return s;
  }
  function _pointAt(r, d) {   // 沿路線距離 d(公尺) 取插值點
    let acc = 0;
    for (let i = 1; i < r.length; i++) {
      const seg = haversine({ lat: r[i - 1][0], lon: r[i - 1][1] }, { lat: r[i][0], lon: r[i][1] });
      if (acc + seg >= d) {
        const f = seg ? (d - acc) / seg : 0;
        return [r[i - 1][0] + (r[i][0] - r[i - 1][0]) * f, r[i - 1][1] + (r[i][1] - r[i - 1][1]) * f];
      }
      acc += seg;
    }
    return r[r.length - 1];
  }

  function startSim() {
    simMode = true;   // 只要這次記錄用過模擬來源就標記 sim，絕不讓模擬距離混入真實里程（即使中途由暫停切換而來）
    if (simRoute) {                                   // 沿選定步道路線滑行跑完（約10秒）
      simDist = 0;
      const total = _routeLen(simRoute);
      const DURATION = 10000;                         // 不論長短都約10秒跑完
      const interval = 25;                            // ~40fps，密集小步＝滑行感
      const frames = Math.round(DURATION / interval); // ~400幀
      const step = total / frames;
      let i = 0;
      simTimer = setInterval(() => {
        i++;
        simDist = Math.min(total, i * step);
        const p = _pointAt(simRoute, simDist);
        const alt = 50 + 250 * (0.5 - 0.5 * Math.cos(Math.PI * simDist / (total || 1)));  // 鐘形假海拔
        push(p[0], p[1], alt, null, true);            // clean：不平滑、不過濾，精準貼線
        if (i >= frames || simDist >= total) { clearInterval(simTimer); simTimer = null; }   // 走到終點停
      }, interval);
      return;
    }
    // 無選定步道：台北市區附近隨機漫步
    if (!simPos) simPos = { lat: 25.033 + Math.random() * .01, lon: 121.564 + Math.random() * .01 };
    let alt = 50, heading = Math.random() * Math.PI * 2;
    simTimer = setInterval(() => {
      heading += (Math.random() - 0.5) * 0.6;
      const step = 0.00010 + Math.random() * 0.00006;
      simPos.lat += Math.cos(heading) * step;
      simPos.lon += Math.sin(heading) * step;
      alt += (Math.random() - 0.4) * 4;
      push(simPos.lat, simPos.lon, alt);
    }, 1000);
  }

  function start(sim) {
    if (state === "running") return;
    if (state === "idle") { track = []; altSeries = []; distance = 0; dist3D = 0; ascent = 0; descent = 0; refAlt = null; lastFixAlt = null; smLat = null; smLon = null; elapsedMs = 0; movingMs = 0; lastFix = null; lastAcceptT = 0; curSpeed = 0; simMode = !!sim; }
    lastResume = Date.now();
    state = "running";
    autoPaused = false; lastMoveAt = Date.now();   // 開始/繼續都重設靜止計時
    if (sim) startSim(); else if (!startGPS()) { state = "idle"; return; }
    acquireWake();   // 記錄中保持螢幕喚醒（若已勾選）
    ticker = setInterval(() => { checkAutoPause(); cb(snapshot()); }, 1000);
    persist();
    cb(snapshot());
  }

  function pause() {
    if (state !== "running") return;
    elapsedMs += autoPaused ? 0 : Date.now() - lastResume;   // 已自動暫停則不重複結算
    autoPaused = false;
    state = "paused"; curSpeed = 0;
    releaseWake();           // 暫停時放開喚醒鎖
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
    if (state === "running" && !autoPaused) elapsedMs += Date.now() - lastResume;
    autoPaused = false;
    releaseWake();           // 結束記錄放開喚醒鎖
    stopSources();
    const snap = snapshot();
    const result = track.length > 1 ? {
      id: "r" + Date.now(),
      date: new Date().toISOString(),
      distanceKm: snap.distanceKm, distance3DKm: snap.distance3DKm, steps: snap.steps, kcal: snap.kcal,
      elapsedMs: snap.elapsedMs, ascent: Math.round(ascent), descent: Math.round(descent), track: track.slice(),
      sim: simMode || undefined,
    } : null;
    state = "idle"; track = []; altSeries = []; distance = 0; dist3D = 0; ascent = 0; descent = 0; refAlt = null; lastFixAlt = null;
    smLat = null; smLon = null; elapsedMs = 0; movingMs = 0; lastFix = null; lastAcceptT = 0; curSpeed = 0; simPos = null;
    simRoute = null; simDist = 0;   // 清除殘留路線，避免下次記錄誤跑舊模擬路線
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

  return { start, pause, resume, stop, snapshot, onUpdate, getState: () => state, hasActive, restore, setLowPower, setWake, setSimRoute };
})();
