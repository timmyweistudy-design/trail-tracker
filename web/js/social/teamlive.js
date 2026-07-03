// 小隊同行：用 Realtime Presence 廣播自己定位、即時顯示隊友在地圖上的位置（離線自動消失）。
// 小隊記錄規則：建立小隊的人是隊長；全員（含隊長）按「準備」後，只有隊長能按「開始」，
// 廣播 start 事件讓所有隊員同時開始記錄。每位隊員都能在記錄地圖上看到彼此定位。
const TeamLive = (() => {
  let channel = null, watchId = null, map = null, markers = {}, me = null, myInfo = {}, lastPos = null;
  let leaderId = null, myReady = false, onStartCb = null;
  let myStartAt = null;        // 隊長按下開始的時間（跟著 presence 傳，凍結分頁回前景也能補收到）
  let startHandled = false;    // 這次同行已處理過開始訊號，避免重複觸發

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
      out.push({ id: key, name: last.name || "隊友", ready, me: key === me, leader: key === leaderId });
    }
    return out.sort((a, b) => (b.leader - a.leader) || (b.me - a.me));
  }
  function allReady() { const r = roster(); return r.length > 0 && r.every(m => m.ready); }
  function notReadyNames() { return roster().filter(m => !m.ready).map(m => m.name); }

  // 隊長的開始訊號也寫在 presence meta（started）：分頁被凍結錯過 broadcast 的隊員，
  // 回前景 presence 同步時仍會看到並補開始
  function checkPresenceStart() {
    if (!channel || startHandled || !onStartCb || isLeader() || !leaderId || !myReady) return;
    const metas = channel.presenceState()[leaderId] || [];
    const started = metas.reduce((t, m) => Math.max(t, (m && m.started) || 0), 0);
    if (started && Date.now() - started < 10 * 60e3) { startHandled = true; onStartCb(); }
  }

  function render() {
    if (!channel) return;
    renderReadyBar();
    checkPresenceStart();
    if (!map || typeof L === "undefined") return;
    const state = channel.presenceState();
    const seen = {};
    for (const key in state) {
      if (key === me) continue;                       // 不畫自己
      const meta = (state[key] && state[key][0]) || null;
      if (!meta || meta.lat == null) continue;
      seen[key] = true;
      const ll = [meta.lat, meta.lon];
      if (markers[key]) { markers[key].setLatLng(ll); markers[key].setIcon(icon(meta)); markers[key].setTooltipContent(meta.name || "隊友"); }
      else markers[key] = L.marker(ll, { icon: icon(meta) }).addTo(map)
        .bindTooltip(meta.name || "隊友", { permanent: true, direction: "top", className: "team-tip", offset: [0, -22] });
    }
    for (const key in markers) if (!seen[key]) { try { map.removeLayer(markers[key]); } catch (e) { } delete markers[key]; }
  }

  // lastPos 還沒定位到也要能回報準備狀態，座標先給 null
  function payload() {
    return { lat: lastPos ? lastPos.lat : null, lon: lastPos ? lastPos.lon : null,
      name: myInfo.name, avatar: myInfo.avatar || null, pet: myInfo.pet || null,
      heading: lastPos ? lastPos.heading : null, ready: myReady, started: myStartAt || 0, at: Date.now() };
  }
  function broadcast(p) {
    const h = p.coords.heading;
    lastPos = { lat: p.coords.latitude, lon: p.coords.longitude, heading: (h != null && isFinite(h) && h >= 0) ? h : (lastPos && lastPos.heading != null ? lastPos.heading : null) };
    if (channel) channel.track(payload());
  }

  function setReady(v) {
    myReady = !!v;
    if (channel) channel.track(payload());
    renderReadyBar();
  }
  function onStart(cb) { onStartCb = cb; }
  // 隊長廣播「開始」：全員同時開始記錄（broadcast 不會送回自己，隊長本地另行開始）。
  // 同時把 started 寫進 presence，讓凍結中的分頁回前景也補收得到
  function sendStart() {
    if (!channel) return;
    myStartAt = Date.now();
    channel.send({ type: "broadcast", event: "start", payload: { at: myStartAt } });
    channel.track(payload());
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
    const chips = r.map(m => `<span class="trb-chip ${m.ready ? "ok" : ""}">${m.leader ? `${typeof ic === "function" ? ic("crown") : ""} ` : ""}${esc(m.name)}${m.me ? "（我）" : ""} ${m.ready ? "✓" : "…"}</span>`).join("");
    const nr = notReadyNames();
    const hint = isLeader()
      ? (allReady() ? "✅ 全員已準備！按下面的「▶ 開始」，全隊一起記錄" : `等待按「準備」：${nr.join("、") || "…"}`)
      : (leaderId == null ? "⚠️ 讀不到隊長資訊，請隊長重開「與小隊同行」"
        : (myReady ? (allReady() ? "✅ 全員已準備，等隊長按開始…" : "已準備，等其他隊員…") : "按「準備」告訴隊長你就緒"));
    const icn = n => (typeof ic === "function" ? ic(n) : "");
    el.innerHTML = `<div class="trb-top"><b>${icn("users")} 小隊同行${isLeader() ? `・我是隊長 ${icn("crown")}` : ""}</b><button class="trb-ready ${myReady ? "on" : ""}" id="trbReady">${myReady ? "✓ 已準備" : `${icn("hand")} 準備`}</button></div>
      <div class="trb-chips">${chips || "<span class='trb-chip'>等待隊友上線…</span>"}</div>
      <div class="trb-hint">${hint}</div>`;
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
    channel = c.channel("team:" + teamId, { config: { presence: { key: me } } });
    myStartAt = null; startHandled = false;
    channel.on("presence", { event: "sync" }, render);
    channel.on("presence", { event: "join" }, render);
    channel.on("presence", { event: "leave" }, render);
    channel.on("broadcast", { event: "start" }, () => { if (onStartCb && !startHandled) { startHandled = true; onStartCb(); } });
    channel.subscribe(st => { if (st === "SUBSCRIBED") channel.track(payload()); });
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(broadcast, () => { }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 });
    }
    renderReadyBar();
  }

  function stop() {
    if (watchId != null && navigator.geolocation) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    if (channel) { try { Supa.client().removeChannel(channel); } catch (e) { } channel = null; }
    for (const k in markers) { try { map.removeLayer(markers[k]); } catch (e) { } }
    markers = {}; map = null; lastPos = null; leaderId = null; myReady = false;
    myStartAt = null; startHandled = false;
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

  return { start, stop, isOn, isLeader, setReady, allReady, roster, notReadyNames, sendStart, onStart };
})();
