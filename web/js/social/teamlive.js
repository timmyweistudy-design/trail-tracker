// 小隊同行：用 Realtime Presence 廣播自己定位、即時顯示隊友在地圖上的位置（離線自動消失）。
// 小隊記錄規則：建立小隊的人是隊長；全員（含隊長）按「準備」後，只有隊長能按「開始」，
// 廣播 start 事件讓所有隊員同時開始記錄。每位隊員都能在記錄地圖上看到彼此定位。
const TeamLive = (() => {
  let channel = null, watchId = null, map = null, markers = {}, me = null, myInfo = {}, lastPos = null;
  let leaderId = null, myReady = false, onStartCb = null;

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
  function roster() {
    if (!channel) return [];
    const state = channel.presenceState();
    const out = [];
    for (const key in state) {
      const meta = (state[key] && state[key][0]) || {};
      out.push({ id: key, name: meta.name || "隊友", ready: !!meta.ready, me: key === me, leader: key === leaderId });
    }
    return out.sort((a, b) => (b.leader - a.leader) || (b.me - a.me));
  }
  function allReady() { const r = roster(); return r.length > 0 && r.every(m => m.ready); }

  function render() {
    if (!channel) return;
    renderReadyBar();
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
      heading: lastPos ? lastPos.heading : null, ready: myReady, at: Date.now() };
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
  // 隊長廣播「開始」：全員同時開始記錄（broadcast 不會送回自己，隊長本地另行開始）
  function sendStart() { if (channel) channel.send({ type: "broadcast", event: "start", payload: { at: Date.now() } }); }

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
    const chips = r.map(m => `<span class="trb-chip ${m.ready ? "ok" : ""}">${m.leader ? "👑 " : ""}${esc(m.name)}${m.me ? "（我）" : ""} ${m.ready ? "✓" : "…"}</span>`).join("");
    const hint = isLeader()
      ? (allReady() ? "全員已準備，按「▶ 開始」一起記錄！" : "等待全員按「準備」…")
      : (myReady ? "已準備，等待隊長開始…" : "按「準備」告訴隊長你就緒");
    el.innerHTML = `<div class="trb-top"><b>👥 小隊同行</b><button class="trb-ready ${myReady ? "on" : ""}" id="trbReady">${myReady ? "✓ 已準備" : "✋ 準備"}</button></div>
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
    channel = c.channel("team:" + teamId, { config: { presence: { key: me } } });
    channel.on("presence", { event: "sync" }, render);
    channel.on("presence", { event: "join" }, render);
    channel.on("presence", { event: "leave" }, render);
    channel.on("broadcast", { event: "start" }, () => { if (onStartCb) onStartCb(); });
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
    const el = document.getElementById("teamReadyBar"); if (el) el.remove();
  }

  return { start, stop, isOn, isLeader, setReady, allReady, roster, sendStart, onStart };
})();
