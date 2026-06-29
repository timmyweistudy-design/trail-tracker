// 小隊同行：用 Realtime Presence 廣播自己定位、即時顯示隊友在地圖上的位置（離線自動消失）。
const TeamLive = (() => {
  let channel = null, watchId = null, map = null, markers = {}, me = null, myInfo = {}, lastPos = null;

  function isOn() { return !!channel; }

  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }
  function icon(meta) {
    const av = meta.avatar ? `<img src="${esc(meta.avatar)}" alt="">` : `<span class="tm-ph">${esc((meta.name || "?").slice(0, 1))}</span>`;
    const pet = meta.pet ? `<span class="tm-pet">${esc(meta.pet)}</span>` : "";
    return L.divIcon({ className: "team-marker", html: `<div class="tm-av">${av}${pet}</div>`, iconSize: [32, 32], iconAnchor: [16, 16] });
  }

  function render() {
    if (!channel || !map || typeof L === "undefined") return;
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

  function payload() { return { lat: lastPos.lat, lon: lastPos.lon, name: myInfo.name, avatar: myInfo.avatar || null, pet: myInfo.pet || null, at: Date.now() }; }
  function broadcast(p) {
    lastPos = { lat: p.coords.latitude, lon: p.coords.longitude };
    if (channel) channel.track(payload());
  }

  async function start(teamId, leafletMap, info) {
    stop();
    map = leafletMap; myInfo = info || { name: "我" };
    const c = Supa.client(); if (!c || !leafletMap) return;
    const { data: u } = await c.auth.getUser(); me = u && u.user ? u.user.id : null; if (!me) return;
    channel = c.channel("team:" + teamId, { config: { presence: { key: me } } });
    channel.on("presence", { event: "sync" }, render);
    channel.on("presence", { event: "join" }, render);
    channel.on("presence", { event: "leave" }, render);
    channel.subscribe(st => { if (st === "SUBSCRIBED" && lastPos) channel.track(payload()); });
    if (navigator.geolocation) {
      watchId = navigator.geolocation.watchPosition(broadcast, () => { }, { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 });
    }
  }

  function stop() {
    if (watchId != null && navigator.geolocation) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    if (channel) { try { Supa.client().removeChannel(channel); } catch (e) { } channel = null; }
    for (const k in markers) { try { map.removeLayer(markers[k]); } catch (e) { } }
    markers = {}; map = null; lastPos = null;
  }

  return { start, stop, isOn };
})();
