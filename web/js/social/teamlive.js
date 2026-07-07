// 小隊同行：用 Realtime Presence 廣播自己定位、即時顯示隊友在地圖上的位置（離線自動消失）。
// 小隊記錄規則：建立小隊的人是隊長；全員（含隊長）按「準備」後，只有隊長能按「開始」，
// 廣播 start 事件讓所有隊員同時開始記錄。每位隊員都能在記錄地圖上看到彼此定位。
const TeamLive = (() => {
  let channel = null, watchId = null, map = null, markers = {}, me = null, myInfo = {}, lastPos = null;
  let trails = {};   // 每位隊友的足跡：key → { pts:[[lat,lon]...], line:L.polyline }
  const TRAIL_COLORS = ["#2f7d4f", "#2b6cb0", "#b7791f", "#805ad5", "#c05621", "#c53030", "#0d9488", "#6b46c1"];
  function colorFor(key) { let h = 0; for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0; return TRAIL_COLORS[h % TRAIL_COLORS.length]; }
  function metersBetween(la1, lo1, la2, lo2) { return Math.hypot((la1 - la2) * 111320, (lo1 - lo2) * 111320 * Math.cos(la1 * Math.PI / 180)); }
  let leaderId = null, leaderName = null, myReady = false, onStartCb = null;
  let myStartAt = null, myStopAt = null, lastStopHandled = 0, onStopCb = null;        // 隊長按下開始的時間（跟著 presence 傳，凍結分頁回前景也能補收到）
  let myStartSim = false;      // 隊長開始時是否用模擬模式：跟著訊號送，全隊一致才能一起動
  let lastHandledAt = 0;       // 已處理過的開始訊號時間戳：同一次開始只觸發一次，但「新的一次開始」永遠會觸發
  let joinedAt = 0;            // 我開啟同行的時間：比這更早太多的舊訊號不理（別人上一趟的殘留）
  let pollTimer = null, renderPoll = null, curTeamId = null;
  let lastTrackAt = 0;         // presence 位置更新節流（避免每秒打 realtime）
  let subState = "";           // 頻道訂閱狀態（SUBSCRIBED / CHANNEL_ERROR / TIMED_OUT / CLOSED）供診斷「看不到隊友」的真因

  function isOn() { return !!channel; }
  function isLeader() { return !!me && me === leaderId; }

  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }
  function icon(meta) {
    const av = meta.avatar ? `<img src="${esc(meta.avatar)}" alt="">` : `<span class="tm-ph">${esc((meta.name || "?").slice(0, 1))}</span>`;
    const pet = meta.pet ? `<span class="tm-pet">${esc(meta.pet)}</span>` : "";
    const dir = (meta.heading != null) ? `<div class="tm-dir" style="transform:rotate(${(+meta.heading).toFixed(0)}deg)"><span class="tm-cone"></span></div>` : "";
    return L.divIcon({ className: "team-marker", html: `<div class="tm-av">${dir}${av}${pet}</div>`, iconSize: [32, 32], iconAnchor: [16, 16] });
  }

  // 目前在線名單（含準備狀態），供準備列與「全員準備」判斷
  // 同一帳號可能同時有多個分頁/裝置＝多筆 meta：任一筆 ready 就算 ready，名字取最新一筆
  function roster() {
    if (!channel) return [];
    const state = channel.presenceState();
    const out = [];
    for (const key in state) {
      const metas = state[key] || [];
      const last = metas[metas.length - 1] || {};
      // 自己的準備狀態以本地為準（分頁切換時 presence 可能還沒同步回來，別把自己誤判成未準備）
      const ready = (key === me) ? (myReady || metas.some(m => m && m.ready)) : metas.some(m => m && m.ready);
      out.push({ id: key, name: last.name || (typeof ttT === "function" ? ttT("隊友") : "隊友"), ready, me: key === me, leader: key === leaderId });
    }
    return out.sort((a, b) => (b.leader - a.leader) || (b.me - a.me));
  }
  // 隊友目前位置（含頭像/寵物），供 3D 地圖顯示。排除自己、取每人最新有座標的一筆
  function teammates() {
    if (!channel) return [];
    const state = channel.presenceState(); const out = [];
    for (const key in state) {
      if (key === me) continue;
      const metas = state[key] || [];
      const meta = metas.reduce((best, mm) => (mm && mm.lat != null && (!best || (mm.at || 0) > (best.at || 0))) ? mm : best, null);
      if (meta) out.push({ id: key, name: meta.name, lat: meta.lat, lon: meta.lon, avatar: meta.avatar || null, pet: meta.pet || null });
    }
    return out;
  }
  function allReady() { const r = roster(); return r.length > 0 && r.every(m => m.ready); }
  function notReadyNames() { return roster().filter(m => !m.ready).map(m => m.name); }

  // 統一的開始訊號處理：broadcast / presence / DB 輪詢三路都進這裡。
  // 用「時間戳」去重：同一次開始只觸發一次；新的開始（新時間戳）一定會再觸發——
  // 修掉舊版布林旗標被上一趟殘留訊號卡死、之後真開始卻沒反應的 bug。
  function handleStart(at, simFlag) {
    at = +at || 0;
    if (!at || at <= lastHandledAt) return;
    if (isLeader()) { lastHandledAt = at; return; }              // 隊長本地自己開始，不吃訊號
    if (Date.now() - at > 10 * 60e3) { lastHandledAt = at; return; }   // 太舊：標記已處理但不觸發
    if (at < joinedAt - 60e3) { lastHandledAt = at; return; }    // 我加入前就存在的殘留訊號
    if (!myReady || !onStartCb) return;                          // 還沒按準備：先不吃，按了準備後輪詢會再進來
    lastHandledAt = at;
    onStartCb(!!simFlag);   // 帶上隊長的模擬模式，全隊跟隨（測試時大家才會一起動）
  }
  // 結束訊號（與開始同款三路遞送＋時間戳去重）：只有隊長能結束，全隊各自進結算
  function handleStop(at) {
    at = +at || 0;
    if (!at || at <= lastStopHandled) return;
    if (isLeader()) { lastStopHandled = at; return; }
    if (Date.now() - at > 10 * 60e3 || at < joinedAt - 60e3) { lastStopHandled = at; return; }
    lastStopHandled = at;
    if (onStopCb) onStopCb();
  }
  function onStop(cb) { onStopCb = cb; }
  function sendStop() {
    if (!channel) return;
    myStopAt = Date.now();
    lastStopHandled = myStopAt;
    try { channel.send({ type: "broadcast", event: "stop", payload: { at: myStopAt } }); } catch (e) { /* */ }
    try { channel.track(payload()); } catch (e) { /* */ }
    try { const c = Supa.client(); if (c && curTeamId) c.rpc("team_stop", { p_team: curTeamId }).then(() => { }, () => { }); } catch (e) { /* */ }
  }

  // presence 路徑：隊長的 started 跟著 presence 傳，凍結分頁回前景同步時補收
  function checkPresenceStart() {
    if (!channel || !leaderId) return;
    const metas = channel.presenceState()[leaderId] || [];
    let started = 0, ssim = false, stopped = 0;
    for (const m of metas) {
      if (m && (m.started || 0) > started) { started = m.started; ssim = !!m.startedSim; }
      if (m && (m.stopped || 0) > stopped) stopped = m.stopped;
    }
    if (started) handleStart(started, ssim);
    if (stopped) handleStop(stopped);
  }
  // DB 輪詢路徑（每 5 秒）：postgres_changes/broadcast 全漏接也追得回來
  async function pollDbStart() {
    if (!channel || !curTeamId || isLeader() || !myReady) return;
    try {
      const c = Supa.client(); if (!c) return;
      const { data } = await c.from("team_starts").select("started_at, sim, stopped_at").eq("team_id", curTeamId).maybeSingle();
      if (data && data.started_at) handleStart(Date.parse(data.started_at), data.sim);
      if (data && data.stopped_at) handleStop(Date.parse(data.stopped_at));
    } catch (e) { /* phase20 未跑或離線 → 其他兩路仍有效 */ }
  }

  function render() {
    if (!channel) return;
    renderReadyBar();
    checkPresenceStart();
    if (!map || typeof L === "undefined") return;
    const state = channel.presenceState();
    // 先收集所有有座標的隊友，依 key 排序取穩定索引（散開角度每次一致、不會抖）
    const others = [];
    for (const key in state) {
      if (key === me) continue;                       // 不畫自己
      const metas = state[key] || [];
      const meta = metas.reduce((best, m) => (m && m.lat != null && (!best || (m.at || 0) > (best.at || 0))) ? m : best, null);
      if (meta) others.push({ key, meta });
    }
    others.sort((a, b) => (a.key < b.key ? -1 : 1));
    const seen = {};
    // 已放置的位置（含我自己），用來把「幾乎完全重疊」的標記輕輕推開，但不影響真實移動呈現
    const placed = lastPos ? [{ lat: lastPos.lat, lon: lastPos.lon }] : [];
    for (const o of others) {
      const key = o.key, meta = o.meta;
      seen[key] = true;
      // 足跡：累積隊友的「真實」位置（移動超過 6m 才記一點），畫成線
      pushTrail(key, meta.lat, meta.lon);
      // 標記畫在真實位置；只有跟已放置標記幾乎疊在一起(<8m)時才用黃金角微推開(約 7m)，讓人看得到彼此又不失真
      let lat = meta.lat, lon = meta.lon, bump = 0;
      while (bump < 8 && placed.some(p => metersBetween(p.lat, p.lon, lat, lon) < 8)) {
        bump++; const a = bump * 2.399963;
        lat = meta.lat + 0.000065 * Math.sin(a); lon = meta.lon + 0.000065 * Math.cos(a);
      }
      placed.push({ lat, lon });
      const nm = meta.name || (typeof ttT === "function" ? ttT("隊友") : "隊友");
      if (markers[key]) { markers[key].setLatLng([lat, lon]); markers[key].setIcon(icon(meta)); markers[key].setTooltipContent(nm); }
      else markers[key] = L.marker([lat, lon], { icon: icon(meta), zIndexOffset: 900 }).addTo(map)
        .bindTooltip(nm, { permanent: true, direction: "bottom", className: "team-tip", offset: [0, 14] });   // 名字放下方，不擋寵物
    }
    for (const key in markers) if (!seen[key]) { try { map.removeLayer(markers[key]); } catch (e) { } delete markers[key]; }
    for (const key in trails) if (!seen[key]) removeTrail(key);   // 離線的隊友移除足跡線
  }
  // 累積某位隊友的足跡點並更新線
  function pushTrail(key, lat, lon) {
    if (!map || typeof L === "undefined" || lat == null) return;
    let t = trails[key];
    if (!t) { t = trails[key] = { pts: [], line: null }; }
    const last = t.pts[t.pts.length - 1];
    if (!last || metersBetween(last[0], last[1], lat, lon) > 6) {
      t.pts.push([lat, lon]);
      if (t.pts.length > 400) t.pts.shift();   // 上限，避免長時間記憶體膨脹
    }
    if (t.pts.length >= 2) {
      if (!t.line) t.line = L.polyline(t.pts, { color: colorFor(key), weight: 3, opacity: 0.7, dashArray: "1 6", lineCap: "round" }).addTo(map);
      else t.line.setLatLngs(t.pts);
    }
  }
  function removeTrail(key) { const t = trails[key]; if (t && t.line) { try { map.removeLayer(t.line); } catch (e) { } } delete trails[key]; }

  // lastPos 還沒定位到也要能回報準備狀態，座標先給 null
  function payload() {
    return { lat: lastPos ? lastPos.lat : null, lon: lastPos ? lastPos.lon : null,
      name: myInfo.name, avatar: myInfo.avatar || null, pet: myInfo.pet || null,
      heading: lastPos ? lastPos.heading : null, ready: myReady, started: myStartAt || 0, startedSim: myStartSim, stopped: myStopAt || 0, at: Date.now() };
  }
  function _trackThrottled() {
    if (!channel) return;
    const now = Date.now();
    if (now - lastTrackAt < 3000) return;   // 3 秒節流：位置更新夠即時又不會灌爆 realtime
    lastTrackAt = now;
    try { channel.track(payload()); } catch (e) { /* 重連中 */ }
  }
  function broadcast(p) {
    const h = p.coords.heading;
    lastPos = { lat: p.coords.latitude, lon: p.coords.longitude, heading: (h != null && isFinite(h) && h >= 0) ? h : (lastPos && lastPos.heading != null ? lastPos.heading : null) };
    _trackThrottled();
  }
  // 由記錄器餵位置（模擬模式/室內測試 TeamLive 自己拿不到 GPS 時，隊友也看得到你）
  function updatePos(lat, lon, heading) {
    if (lat == null || lon == null) return;
    lastPos = { lat, lon, heading: (heading != null && isFinite(heading) && heading >= 0) ? heading : (lastPos && lastPos.heading != null ? lastPos.heading : null) };
    _trackThrottled();
  }

  function setReady(v) {
    myReady = !!v;
    if (channel) channel.track(payload());
    renderReadyBar();
    if (myReady) { checkPresenceStart(); pollDbStart(); }   // 按下準備立刻補收（隊伍可能已經開始）
  }
  function onStart(cb) { onStartCb = cb; }
  // 隊長廣播「開始」：全員同時開始記錄（broadcast 不會送回自己，隊長本地另行開始）。
  // 同時把 started 寫進 presence，讓凍結中的分頁回前景也補收得到
  function sendStart(opts) {
    if (!channel) return;
    myStartAt = Date.now();
    myStartSim = !!(opts && opts.sim);
    lastHandledAt = myStartAt;   // 自己不再吃這個訊號
    // 三路齊發：broadcast（最快）+ presence（回前景補收）+ DB（最可靠，需 phase20 SQL）
    try { channel.send({ type: "broadcast", event: "start", payload: { at: myStartAt, sim: myStartSim } }); } catch (e) { /* */ }
    try { channel.track(payload()); } catch (e) { /* */ }
    try {
      const c = Supa.client();
      if (c && curTeamId) c.rpc("team_start", { p_team: curTeamId, p_sim: myStartSim })
        .then(r => { if (r && r.error) c.rpc("team_start", { p_team: curTeamId }).then(() => { }, () => { }); }, () => { });   // 舊版 RPC 相容
    } catch (e) { /* */ }
  }

  // 記錄頁準備列：✋ 準備切換 + 全隊準備狀態；隊長多一顆「開始小隊記錄」提示
  function readyBarEl() {
    let el = document.getElementById("teamReadyBar");
    if (!el) {
      const anchor = document.getElementById("recStatus");
      if (!anchor || !anchor.parentNode) return null;
      el = document.createElement("div");
      el.id = "teamReadyBar";
      el.className = "team-ready-bar";
      anchor.parentNode.insertBefore(el, anchor);
    }
    return el;
  }
  function renderReadyBar() {
    const el = readyBarEl(); if (!el) return;
    if (!channel) { el.remove(); return; }
    const r = roster();
    let chips = r.map(m => `<span class="trb-chip ${m.ready ? "ok" : ""}">${m.leader ? `${typeof ic === "function" ? ic("crown") : ""} ` : ""}${esc(m.name)}${m.me ? (typeof ttT === "function" ? ttT("（我）") : "（我）") : ""} ${m.ready ? "✓" : "…"}</span>`).join("");
    // 隊長此刻不在線 → 仍顯示一個離線隊長 chip（⏳），讓「加入別人小隊」的隊員知道誰是隊長
    if (leaderId && !r.some(m => m.leader)) {
      const lname = esc(leaderName || (typeof ttT === "function" ? ttT("隊長") : "隊長"));
      chips = `<span class="trb-chip leader-off">${typeof ic === "function" ? ic("crown") : ""} ${lname} ⏳</span>` + chips;
    }
    // 記錄中：改顯示隊伍即時狀態（在線人數/地圖可見人數），不再顯示準備提示
    if (typeof Recorder !== "undefined" && Recorder.getState && Recorder.getState() === "running") {
      const visible = Object.keys(markers).length;
      el.innerHTML = `<div class="trb-top"><b>${typeof ic === "function" ? ic("users") : ""} 小隊記錄中</b><span class="trb-chip ok">在線 ${r.length} 人・地圖可見 ${visible + 1} 人</span></div>
        <div class="trb-chips">${chips}</div>`;
      return;
    }
    const nr = notReadyNames();
    const hint = isLeader()
      ? (allReady() ? "✅ 全員已準備！按下面的「▶ 開始」，全隊一起記錄" : `等待按「準備」：${nr.join("、") || "…"}`)
      : (leaderId == null ? "⚠️ 讀不到隊長資訊，請隊長重開「與小隊同行」"
        : (myReady ? (allReady() ? "✅ 全員已準備，等隊長按開始…" : "已準備，等其他隊員…") : "按「準備」告訴隊長你就緒"));
    const icn = n => (typeof ic === "function" ? ic(n) : "");
    // 只有自己在線（看不到隊友）→ 明確提示 + 即時連線診斷（真因：連線異常 vs 隊友沒同時在線）
    let guide = "";
    if (r.length <= 1) {
      const connOk = subState === "SUBSCRIBED";
      const connBad = subState && subState !== "SUBSCRIBED";   // CLOSED/CHANNEL_ERROR/TIMED_OUT＝即時連線被擋
      const T = s => (typeof ttT === "function" ? ttT(s) : s);
      const tip = connBad
        ? T("即時連線被擋，請關 VPN／私人DNS 或改用行動網路")   // 真因：WebSocket 連不上→隊友定位無法同步
        : T("還沒看到隊友？請隊友也在記錄頁開啟「與小隊同行」");
      const diag = `<div class="trb-diag">${connOk ? "🟢" : "🔴"} Realtime: ${esc(subState || "…")} · online ${r.length}</div>`;
      guide = `<div class="trb-guide">${tip}${diag}</div>`;
    }
    el.innerHTML = `<div class="trb-top"><b>${icn("users")} 小隊同行${isLeader() ? `・我是隊長 ${icn("crown")}` : ""}</b><button class="trb-ready ${myReady ? "on" : ""}" id="trbReady">${myReady ? "✓ 已準備" : `${icn("hand")} 準備`}</button></div>
      <div class="trb-chips">${chips || "<span class='trb-chip'>等待隊友上線…</span>"}</div>
      <div class="trb-hint">${hint}</div>${guide}`;
    const b = el.querySelector("#trbReady");
    if (b) b.addEventListener("click", () => setReady(!myReady));
  }

  async function start(teamId, leafletMap, info, opts) {
    stop();
    map = leafletMap; myInfo = info || { name: "我" };
    leaderId = (opts && opts.leader) || null;
    const c = Supa.client(); if (!c || !leafletMap) return;
    const { data: u } = await c.auth.getUser(); me = u && u.user ? u.user.id : null; if (!me) return;
    // 沒拿到隊長資訊時直接查 DB（teams.owner），避免「誰都不是隊長→誰都不能開始」
    if (!leaderId) {
      try { const { data: t } = await c.from("teams").select("owner").eq("id", teamId).maybeSingle(); leaderId = (t && t.owner) || null; }
      catch (e) { /* 查不到就維持 null，準備列會提示 */ }
    }
    // 記住隊長名字：即使隊長此刻不在線，準備列也能顯示「👑 隊長（離線）」，不會讓人以為沒有隊長
    leaderName = null;
    if (leaderId) {
      try { const { data: lp } = await c.from("profiles").select("display_name,handle").eq("id", leaderId).maybeSingle(); leaderName = lp ? (lp.display_name || lp.handle) : null; }
      catch (e) { /* 查不到名字不影響功能 */ }
    }
    channel = c.channel("team:" + teamId, { config: { presence: { key: me } } });
    curTeamId = teamId; myStartAt = null; myStopAt = null; lastHandledAt = 0; lastStopHandled = 0; joinedAt = Date.now();
    channel.on("presence", { event: "sync" }, render);
    channel.on("presence", { event: "join" }, render);
    channel.on("presence", { event: "leave" }, render);
    channel.on("broadcast", { event: "start" }, msg => { const pl = msg && msg.payload; if (pl) handleStart(pl.at, pl.sim); });
    channel.on("broadcast", { event: "stop" }, msg => { const pl = msg && msg.payload; if (pl) handleStop(pl.at); });
    // DB 即時訂閱：隊長寫入 team_starts 就開始（需 phase20；沒跑也有輪詢與 presence 兜底）
    channel.on("postgres_changes", { event: "*", schema: "public", table: "team_starts", filter: "team_id=eq." + teamId },
      p => { const row = p && p.new; if (row) { if (row.started_at) handleStart(Date.parse(row.started_at), row.sim); if (row.stopped_at) handleStop(Date.parse(row.stopped_at)); } });
    channel.subscribe(st => {
      subState = st;   // 記錄訂閱狀態供診斷：非 SUBSCRIBED（CHANNEL_ERROR/TIMED_OUT）＝即時連線被擋，presence 無法同步
      if (st === "SUBSCRIBED") {
        try { channel.track(payload()); } catch (e) { /* */ }
        // 第一次 track 可能與 subscribe 競態沒送成→隔一下再補送幾次，確保別人一定看得到我
        setTimeout(() => { try { channel.track(payload()); } catch (e) { /* */ } }, 1200);
        setTimeout(() => { try { channel.track(payload()); } catch (e) { /* */ } }, 3500);
      }
    });
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(pollDbStart, 5000);   // 輪詢補收：任何漏接 5 秒內追回
    // 定時重繪 + presence 自癒：每 2.5 秒重繪，並「重新 track 自己」——若曾被斷線/漏送而從別人清單消失，
    // 這裡會把自己補回去，解決「隊長看不到隊員/單向看不到」的連線不對稱問題。
    if (renderPoll) clearInterval(renderPoll);
    renderPoll = setInterval(() => {
      try { render(); } catch (e) { /* */ }
      try { const st = channel && channel.presenceState ? channel.presenceState() : null; if (st && !st[me]) channel.track(payload()); } catch (e) { /* */ }
    }, 2500);
    if (navigator.geolocation) {
      // 立刻要一次粗略定位（可用快取）當種子——室內測試也能盡快讓隊友看到你；失敗就用地圖中心兜底
      navigator.geolocation.getCurrentPosition(broadcast, () => {
        if (!lastPos && map) { const ctr = map.getCenter(); lastPos = { lat: ctr.lat, lon: ctr.lng, heading: null }; _trackThrottled(); }
      }, { enableHighAccuracy: false, maximumAge: 60000, timeout: 8000 });
      // 高精度持續追蹤（走動時更新）；室內逾時的錯誤不清空既有位置
      watchId = navigator.geolocation.watchPosition(broadcast, () => {
        if (!lastPos && map) { const ctr = map.getCenter(); lastPos = { lat: ctr.lat, lon: ctr.lng, heading: null }; _trackThrottled(); }
      }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 });
    }
    renderReadyBar();
  }

  function stop() {
    if (watchId != null && navigator.geolocation) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    if (channel) { try { Supa.client().removeChannel(channel); } catch (e) { } channel = null; }
    for (const k in markers) { try { map.removeLayer(markers[k]); } catch (e) { } }
    for (const k in trails) { try { if (trails[k].line) map.removeLayer(trails[k].line); } catch (e) { } }
    markers = {}; trails = {}; map = null; lastPos = null; leaderId = null; myReady = false;
    myStartAt = null; myStopAt = null; lastHandledAt = 0; lastStopHandled = 0; curTeamId = null; subState = "";
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (renderPoll) { clearInterval(renderPoll); renderPoll = null; }
    const el = document.getElementById("teamReadyBar"); if (el) el.remove();
  }

  // 分頁切回前景：手機會凍結背景分頁、Realtime 斷線，回來後立刻重新註冊自己的 presence
  // （帶著 ready/started 狀態），並補查有沒有錯過隊長的開始訊號
  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible" || !channel) return;
      setTimeout(() => {
        if (!channel) return;
        try { channel.track(payload()); } catch (e) { /* 重連中 */ }
        render();
      }, 600);
    });
  }

  function status() { return { on: !!channel, sub: subState, presence: channel ? Object.keys(channel.presenceState()).length : 0, me, team: curTeamId, leader: leaderId }; }
  return { start, stop, isOn, isLeader, setReady, allReady, roster, teammates, notReadyNames, sendStart, onStart, sendStop, onStop, updatePos, status };
})();
