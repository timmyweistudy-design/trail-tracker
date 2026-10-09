// 小隊同行（改版）：不再用 Realtime WebSocket（部分網路頻頻 CLOSED、互相看不到）。
// 改成純 HTTPS 輪詢資料庫（和登入/發文同一條路，已證實可靠）：
//   - 每位隊員每 ~8 秒把自己的狀態（準備/記錄中/位置）upsert 進 team_presence（phase21）。
//   - 全員每 ~4 秒輪詢 team_presence 看誰在線/誰準備好。
//   - 不畫連續軌跡：點隊友名字才即時抓一次他的位置釘在地圖上（他記錄中才有），再點一次收起。
//   - 「一起開始」保留：隊長寫 team_starts（phase20），隊員輪詢到就一起開始。
const TeamLive = (() => {
  let map = null, me = null, myInfo = {}, lastPos = null;
  let curTeamId = null, leaderId = null, leaderName = null, myReady = false;
  let active = false, members = [], peekMarkers = {};
  let pollTimer = null, pushTimer = null, lastPushAt = 0;
  let pollOk = false, pushOk = false;
  // 一起開始：時間戳去重（同一次只觸發一次，新的一次必觸發）
  let onStartCb = null, onStopCb = null, lastHandledAt = 0, lastStopHandled = 0, joinedAt = 0, myStartAt = null, myStopAt = null, myStartSim = false;
  let onPauseCb = null, onResumeCb = null, lastPauseSyncAt = 0;   // 隊長控制暫停/繼續：全隊跟隨
  let noLook = false, noLookCol = false;   // phase41 還沒跑：不送／不讀 pet_look（R12）
  let showAll = false;   // 記錄中「全部隊友都顯示在地圖上」

  const ttx = s => (typeof ttT === "function" ? ttT(s) : s);
  const esc = s => Supa.esc(s);
  function isOn() { return active; }
  function isLeader() { return !!me && me === leaderId; }
  function recordingNow() { return typeof Recorder !== "undefined" && Recorder.getState && Recorder.getState() === "running"; }

  // 隊友的夥伴（R12）：新版送 pet_look {s 階段, h 帽子, a 配件}，舊版只有 emoji（反查成角色、不戴東西）。
  // 畫成帶 data-s 的 SVG：記錄地圖上自己夥伴的「依種類動」CSS（滾、爬、飛、滑翔）就會一起套到隊友身上
  function lookOf(v) {
    const L0 = v && typeof v === "object" ? v : null; if (!L0 || typeof PET_ART === "undefined") return null;
    const s = Math.round(+L0.s); if (!(s >= 0 && s <= 6)) return null;
    return { s, h: PET_ART.HAT_IDS.includes(L0.h) ? L0.h : "none", a: PET_ART.ACC_IDS && PET_ART.ACC_IDS.includes(L0.a) ? L0.a : "none", v: ["deep", "sea", "alpine"].includes(L0.v) ? L0.v : "" };
  }
  function petHtml(meta) {
    const lk = lookOf(meta.look);
    if (lk) return `<span class="tm-pet">${PET_ART.as ? PET_ART.as(lk.v, () => PET_ART.svg(lk.s, "", lk.h, undefined, lk.a)) : PET_ART.svg(lk.s, "", lk.h, undefined, lk.a)}</span>`;
    const petIdx = (meta.pet && typeof PET_ART !== "undefined" && PET_ART.byEmoji) ? PET_ART.byEmoji(meta.pet) : -1;
    return meta.pet ? `<span class="tm-pet">${petIdx >= 0 ? PET_ART.svg(petIdx) : esc(meta.pet)}</span>` : "";
  }
  function myLook() {
    if (typeof petStageIndex !== "function" || typeof totalKm !== "function") return null;
    return Object.assign({ s: petStageIndex(totalKm()), h: typeof petHat === "function" ? petHat() : "none", a: typeof petAcc === "function" ? petAcc() : "none" }, typeof petTone === "function" && petTone() ? { v: petTone() } : {});
  }
  function icon(meta, opts) {
    const av = meta.avatar ? `<img src="${esc(meta.avatar)}" alt="">` : `<span class="tm-ph">${esc((meta.name || "?").slice(0, 1))}</span>`;
    const pet = petHtml(meta);
    const dir = (meta.heading != null) ? `<div class="tm-dir" style="transform:rotate(${(+meta.heading).toFixed(0)}deg)"><span class="tm-cone"></span></div>` : "";
    const pulse = (opts && opts.pulse) ? `<span class="tm-pulse"></span>` : "";   // 點名字看定位→脈動光圈標示
    return L.divIcon({ className: "team-marker" + ((opts && opts.pulse) ? " peek" : ""), html: `<div class="tm-av">${pulse}${dir}${av}${pet}</div>`, iconSize: [32, 32], iconAnchor: [16, 16] });
  }

  // 目前在線名單（含準備狀態）：自己以本地 myReady 為準（輪詢有延遲，別把自己誤判成未準備）
  // 隊長按「開始」本身就代表準備好了 → 隊長一律算已準備（以前隊長也要先按準備，準備列還寫「等待按準備：自己」）
  function roster() {
    const out = members.map(m => ({ id: m.id, name: m.name, ready: m.leader ? true : (m.me ? myReady : m.ready), me: m.me, leader: m.leader, recording: m.recording }));
    return out.sort((a, b) => (b.leader - a.leader) || (b.me - a.me));
  }
  // 記錄中且有座標的隊友（供 3D 顯示 / 點名字看定位）
  function teammates() {
    return members.filter(m => !m.me && m.recording && m.lat != null)
      .map(m => ({ id: m.id, name: m.name, lat: m.lat, lon: m.lon, avatar: m.avatar || null, pet: m.pet || null, look: lookOf(m.look) }));
  }
  function allReady() { const r = roster(); return r.length > 0 && r.every(m => m.ready); }
  function notReadyNames() { return roster().filter(m => !m.ready).map(m => m.name); }

  // ── 一起開始/結束：時間戳去重（沿用舊邏輯，改由輪詢 team_starts 餵入）──
  function handleStart(at, simFlag) {
    at = +at || 0;
    if (!at || at <= lastHandledAt) return;
    if (isLeader()) { lastHandledAt = at; return; }
    if (Date.now() - at > 10 * 60e3) { lastHandledAt = at; return; }
    if (at < joinedAt - 60e3) { lastHandledAt = at; return; }
    if (!myReady || !onStartCb) return;
    lastHandledAt = at;
    onStartCb(!!simFlag);
  }
  function handleStop(at) {
    at = +at || 0;
    if (!at || at <= lastStopHandled) return;
    if (isLeader()) { lastStopHandled = at; return; }
    if (Date.now() - at > 10 * 60e3 || at < joinedAt - 60e3) { lastStopHandled = at; return; }
    lastStopHandled = at;
    if (onStopCb) onStopCb();
  }
  function onStart(cb) { onStartCb = cb; }
  function onStop(cb) { onStopCb = cb; }
  function sendStart(opts) {
    myStartAt = Date.now(); myStartSim = !!(opts && opts.sim); lastHandledAt = myStartAt;
    try { const c = Supa.client(); if (c && curTeamId) c.rpc("team_start", { p_team: curTeamId, p_sim: myStartSim }).then(r => { if (r && r.error) c.rpc("team_start", { p_team: curTeamId }).then(() => {}, () => {}); }, () => {}); } catch (e) { /* */ }
    pushPresence();
  }
  function sendStop() {
    myStopAt = Date.now(); lastStopHandled = myStopAt;
    try { const c = Supa.client(); if (c && curTeamId) c.rpc("team_stop", { p_team: curTeamId }).then(() => {}, () => {}); } catch (e) { /* */ }
    pushPresence();
  }
  // 隊長暫停/繼續：全隊跟隨（隊員收到訊號各自暫停/繼續自己的記錄器）
  function onPause(cb) { onPauseCb = cb; }
  function onResume(cb) { onResumeCb = cb; }
  function sendPause() { lastPauseSyncAt = Date.now(); try { const c = Supa.client(); if (c && curTeamId) c.rpc("team_pause", { p_team: curTeamId }).then(() => {}, () => {}); } catch (e) { /* */ } }
  function sendResume() { lastPauseSyncAt = Date.now(); try { const c = Supa.client(); if (c && curTeamId) c.rpc("team_resume", { p_team: curTeamId }).then(() => {}, () => {}); } catch (e) { /* */ } }
  function handlePauseState(pausedAt, resumedAt) {
    if (isLeader()) return;
    const pa = pausedAt ? Date.parse(pausedAt) : 0, ra = resumedAt ? Date.parse(resumedAt) : 0;
    const latest = Math.max(pa, ra);
    if (!latest || latest <= lastPauseSyncAt) return;
    if (Date.now() - latest > 10 * 60e3 || latest < joinedAt - 60e3) { lastPauseSyncAt = latest; return; }   // 太舊/我加入前→標記已處理不觸發
    lastPauseSyncAt = latest;
    if (pa >= ra) { if (onPauseCb) onPauseCb(); } else { if (onResumeCb) onResumeCb(); }
  }
  async function pollStarts() {
    if (!curTeamId || isLeader() || !myReady) return;
    try {
      const c = Supa.client(); if (!c) return;
      const { data } = await c.from("team_starts").select("started_at, sim, stopped_at, paused_at, resumed_at").eq("team_id", curTeamId).maybeSingle();
      if (data && data.started_at) handleStart(Date.parse(data.started_at), data.sim);
      if (data && data.stopped_at) handleStop(Date.parse(data.stopped_at));
      if (data) handlePauseState(data.paused_at, data.resumed_at);
    } catch (e) { /* phase20 未跑或離線 → 準備列會顯示 */ }
  }

  // ── 位置/狀態 ──
  function updatePos(lat, lon, heading) {
    if (lat == null || lon == null) return;
    lastPos = { lat, lon, heading: (heading != null && isFinite(heading) && heading >= 0) ? heading : (lastPos && lastPos.heading != null ? lastPos.heading : null) };
    pushThrottled();   // 記錄中位置變動→順手更新（節流）
  }
  async function pushPresence() {
    const c = Supa.client(); if (!c || !curTeamId) return;
    lastPushAt = Date.now();
    const rec = recordingNow();
    try {
      const args = {
        p_team: curTeamId, p_ready: !!myReady, p_recording: !!rec,
        p_lat: rec && lastPos ? lastPos.lat : null,
        p_lon: rec && lastPos ? lastPos.lon : null,
        p_heading: rec && lastPos && lastPos.heading != null ? lastPos.heading : null,
        p_name: myInfo.name || null, p_avatar: myInfo.avatar || null, p_pet: myInfo.pet || null,
      };
      const lk = noLook ? null : myLook();   // 同一次請求一起送，不多發
      let { error } = await c.rpc("upsert_team_presence", lk ? Object.assign({ p_pet_look: lk }, args) : args);
      // 資料庫還沒跑 phase41（沒有 p_pet_look 參數）：退回舊參數，這次開 App 不再送
      if (error && lk && /p_pet_look|upsert_team_presence|function/i.test(error.message || "")) { noLook = true; ({ error } = await c.rpc("upsert_team_presence", args)); }
      pushOk = !error;
    } catch (e) { pushOk = false; }
  }
  function pushThrottled() { if (Date.now() - lastPushAt < 7000) return; pushPresence(); }
  // 自適應頻率：有人記錄中才勤（輪詢 4s／回報 8s），否則放慢（10s／15s）省電省流量。
  // 用自我重排的 setTimeout（非固定 setInterval），回前景時可即時重排。
  function nextPollDelay() { return members.some(m => m.recording) ? 4000 : 10000; }
  function nextPushDelay() { return recordingNow() ? 8000 : 15000; }
  function loopPoll() { if (pollTimer) clearTimeout(pollTimer); if (!active) return; pollTimer = setTimeout(async () => { if (!active) return; try { await poll(); } catch (e) { /* */ } loopPoll(); }, nextPollDelay()); }
  function loopPush() { if (pushTimer) clearTimeout(pushTimer); if (!active) return; pushTimer = setTimeout(async () => { if (!active) return; try { await pushPresence(); } catch (e) { /* */ } loopPush(); }, nextPushDelay()); }

  async function poll() {
    const c = Supa.client(); if (!c || !curTeamId) return;
    try {
      const COLS = "user_id, ready, recording, lat, lon, heading, name, avatar, pet, updated_at";
      let { data, error } = await c.from("team_presence").select(noLookCol ? COLS : COLS + ", pet_look").eq("team_id", curTeamId);
      if (error && !noLookCol && /pet_look/.test(error.message || "")) { noLookCol = true; ({ data, error } = await c.from("team_presence").select(COLS).eq("team_id", curTeamId)); }   // 還沒跑 phase41
      if (!error && data) {
        const now = Date.now();
        members = data.map(r => {
          const age = now - Date.parse(r.updated_at);
          return { id: r.user_id, name: r.name || ttx("隊友"), ready: !!r.ready, recording: !!r.recording,
            lat: r.lat, lon: r.lon, heading: r.heading, avatar: r.avatar, pet: r.pet, look: r.pet_look || null,
            ageMs: age, online: age < 30000, me: r.user_id === me, leader: r.user_id === leaderId };
        }).filter(m => m.online || m.me);
        // 自己一定在名單裡（我的 row 可能還沒輪詢回來）；ready 用本地為準
        let hasMe = false;
        members.forEach(m => { if (m.me) { m.ready = myReady; m.recording = recordingNow(); hasMe = true; } });
        if (!hasMe) members.push({ id: me, name: myInfo.name || ttx("我"), ready: myReady, recording: recordingNow(), lat: null, lon: null, me: true, leader: me === leaderId, online: true, ageMs: 0 });
        pollOk = true;
      }
    } catch (e) { pollOk = false; }
    await pollStarts();
    refreshPins();      // 釘著的隊友位置跟著輪詢更新
    renderReadyBar();
  }

  // 點隊友名字：抓一次他的位置釘在地圖上（他記錄中才有），釘著的位置每次輪詢跟著更新；再點同一位隊友就收起。
  async function peek(uid) {
    if (!uid || uid === me) return;
    if (peekMarkers[uid]) { unpin(uid); renderReadyBar(); return; }   // 第二次點：收起
    const c = Supa.client(); if (!c || !curTeamId) return;
    let row = null;
    try { const { data } = await c.from("team_presence").select("*").eq("team_id", curTeamId).eq("user_id", uid).maybeSingle(); row = data; } catch (e) { /* */ }
    const nm = (row && row.name) || (members.find(m => m.id === uid) || {}).name || ttx("隊友");
    if (!row || !row.recording || row.lat == null) { if (typeof toast === "function") toast(ttx("隊友未在記錄中，暫時看不到位置")); return; }
    if (!map || typeof L === "undefined") return;
    pin(uid, { name: nm, lat: row.lat, lon: row.lon, heading: row.heading, avatar: row.avatar, pet: row.pet, look: row.pet_look || null,
      ageMs: Math.max(0, Date.now() - Date.parse(row.updated_at)) });
    try { map.panTo([row.lat, row.lon]); } catch (e) { }
    renderReadyBar();
  }
  // 釘上/更新一位隊友的位置標記（同一位重複呼叫＝就地更新，不重畫）
  function pin(uid, m) {
    if (!map || typeof L === "undefined") return;
    const ageS = Math.max(0, Math.round((m.ageMs || 0) / 1000));
    const tip = `${esc(m.name)}${ageS > 12 ? ` · ${ageS}s` : ""}`;
    const ico = icon({ name: m.name, avatar: m.avatar, pet: m.pet, look: m.look, heading: m.heading }, { pulse: true });
    const cur = peekMarkers[uid];
    if (cur) { try { cur.setLatLng([m.lat, m.lon]); cur.setIcon(ico); cur.setTooltipContent(tip); } catch (e) { /* */ } return; }
    peekMarkers[uid] = L.marker([m.lat, m.lon], { icon: ico, zIndexOffset: 1000 }).addTo(map)
      .bindTooltip(tip, { permanent: true, direction: "bottom", className: "team-tip", offset: [0, 14] }).openTooltip();
  }
  function unpin(uid) {
    const mk = peekMarkers[uid]; if (!mk) return;
    try { map && map.removeLayer(mk); } catch (e) { /* */ }
    delete peekMarkers[uid];
  }
  function isPinned(uid) { return !!peekMarkers[uid]; }
  // 每次輪詢：釘著的隊友位置跟著更新；他停止記錄/離線就自動收起（不必使用者再點一次）
  function refreshPins() {
    if (showAll) for (const m of members) if (!m.me && m.online && m.recording && m.lat != null) pin(m.id, m);
    for (const uid of Object.keys(peekMarkers)) {
      const m = members.find(x => x.id === uid);
      if (!m || !m.online || !m.recording || m.lat == null) { unpin(uid); continue; }
      pin(uid, m);
    }
  }

  function setReady(v) { myReady = !!v; pushPresence(); renderReadyBar(); }

  // ── 準備列 UI ──
  // 放大地圖時把面板搬到 body：#view-record 有 animation(fill both) → computed transform 是單位矩陣，
  // 會成為 fixed 的包含塊兼堆疊脈絡，面板留在裡面會被全螢幕地圖蓋掉。搬到 body 才浮得上去。
  function placeBar(el) {
    const fs = document.body.classList.contains("map-fs-open");
    const anchor = document.getElementById("selTrail");   // 小隊列置頂（rec-stats 下方、已選步道之前）
    if (fs) { if (el.parentNode !== document.body) document.body.appendChild(el); }
    else if (anchor && anchor.parentNode && el.nextSibling !== anchor) anchor.parentNode.insertBefore(el, anchor);
  }
  function syncFs() { const el = document.getElementById("teamReadyBar"); if (el) placeBar(el); }
  function readyBarEl() {
    let el = document.getElementById("teamReadyBar");
    if (el) { placeBar(el); return el; }
    const anchor = document.getElementById("selTrail");   // 小隊列置頂（rec-stats 下方、已選步道之前）
    if (!anchor || !anchor.parentNode) return null;
    el = document.createElement("div");
    el.id = "teamReadyBar"; el.className = "team-ready-bar";
    anchor.parentNode.insertBefore(el, anchor);
    placeBar(el);   // 小隊是在放大狀態下開的 → 直接放到 body
    el.addEventListener("click", e => { const t = e.target.closest("[data-peek]"); if (t) peek(t.getAttribute("data-peek")); });
    el.addEventListener("keydown", e => {   // 鍵盤可用：Enter/空白鍵＝點一下
      if (e.key !== "Enter" && e.key !== " ") return;
      const t = e.target.closest("[data-peek]"); if (!t) return;
      e.preventDefault(); peek(t.getAttribute("data-peek"));
    });
    return el;
  }
  function chipHtml(m, tappable) {
    const crown = m.leader ? `${typeof ic === "function" ? ic("crown") : ""} ` : "";
    const meTag = m.me ? ttx("（我）") : "";
    const tap = tappable && !m.me;
    const on = tap && isPinned(m.id);
    const mark = tap ? (typeof ic === "function" ? ic(on ? "x" : "pin") : "") : "";   // 已定位→再點一次收起（以前用 📍 emoji）
    const attr = (!m.me) ? ` data-peek="${esc(m.id)}"${tap ? ` role="button" tabindex="0" aria-pressed="${on}"` : ""}` : "";
    const cls = `trb-chip ${m.ready ? "ok" : ""}${tap ? " tappable" : ""}${on ? " pinned" : ""}`;
    // 狀態用字講清楚（以前「…」看不懂是沒準備）
    const st = tappable ? "" : `<em class="trb-st">${m.ready ? ttx("已準備") : ttx("還沒準備")}</em>`;
    return `<span class="${cls}"${attr}>${crown}${esc(m.name)}${meTag}${st}${mark}</span>`;
  }
  function renderReadyBar() {
    if (typeof window !== "undefined" && typeof window.syncTeamRecBtns === "function") window.syncTeamRecBtns();   // 隊員隱藏開始鈕
    const el = readyBarEl(); if (!el) return;
    if (!active) { el.remove(); return; }
    const r = roster();
    const onlineN = r.length;
    // 記錄中：顯示隊伍狀態＋可點名字看定位
    if (recordingNow()) {
      const chips = r.map(m => chipHtml(m, true)).join("");
      el.innerHTML = `<div class="trb-top"><b>${typeof ic === "function" ? ic("users") : ""} ${ttx("小隊記錄中")}</b><button class="trb-all ${showAll ? "on" : ""}" id="trbAll">${ttx(showAll ? "收起全部" : "全部顯示")}</button></div>
        <div class="trb-chips">${chips}</div>
        <div class="trb-hint">${ttx("點隊友名字看他的位置，再點一次收起")}</div>`;
      const ab = el.querySelector("#trbAll");
      if (ab) ab.addEventListener("click", () => {
        showAll = !showAll;
        if (!showAll) for (const uid of Object.keys(peekMarkers)) unpin(uid);
        refreshPins(); renderReadyBar();
        if (showAll && map && Object.keys(peekMarkers).length) { try { map.fitBounds(L.featureGroup(Object.values(peekMarkers)).getBounds().pad(0.3)); } catch (e) { /* */ } }
      });
      return;
    }
    // 準備階段
    const chips = r.map(m => chipHtml(m, false)).join("");
    const nr = notReadyNames();
    const hint = isLeader()
      ? (allReady() ? ttx("大家都準備好了，按下面的「開始」全隊一起記錄") : `${ttx("等這幾位按準備")}：${nr.join("、") || "…"}`)
      : (leaderId == null ? ttx("讀不到隊長資訊，請隊長重開「與小隊同行」")
        : (myReady ? (allReady() ? ttx("大家都準備好了，等隊長按開始") : ttx("你準備好了，等其他人")) : ttx("準備好就按「準備」，讓隊長知道")));
    const icn = n => (typeof ic === "function" ? ic(n) : "");
    let guide = "";
    if (onlineN <= 1) {
      // 以前這裡還顯示「🟢 sync · 在線 1」這種除錯字 → 改成只在連線失敗時講人話
      guide = `<div class="trb-guide">${ttx("還沒看到隊友？請隊友也在記錄頁打開「與小隊同行」")}${pollOk ? "" : `<br>${ttx("連不上小隊，檢查一下網路")}`}</div>`;
    }
    el.innerHTML = `<div class="trb-top"><b>${icn("users")} ${ttx("小隊同行")}${isLeader() ? `・${ttx("我是隊長")} ${icn("crown")}` : ""}</b>${isLeader() ? "" : `<button class="trb-ready ${myReady ? "on" : ""}" id="trbReady">${myReady ? `${icn("check")} ${ttx("已準備")}` : `${icn("hand")} ${ttx("準備")}`}</button>`}</div>
      <div class="trb-chips">${chips || `<span class='trb-chip'>${ttx("等待隊友上線…")}</span>`}</div>
      <div class="trb-hint">${hint}</div>${guide}`;
    const b = el.querySelector("#trbReady");
    if (b) b.addEventListener("click", () => setReady(!myReady));
  }

  async function start(teamId, leafletMap, info, opts) {
    stop();
    map = leafletMap; myInfo = info || { name: "我" };
    leaderId = (opts && opts.leader) || null;
    const c = Supa.client(); if (!c || !leafletMap) return;
    const { data: u } = await Supa.meUser(); me = u && u.user ? u.user.id : null; if (!me) return;
    if (!leaderId) {
      try { const { data: t } = await c.from("teams").select("owner").eq("id", teamId).maybeSingle(); leaderId = (t && t.owner) || null; } catch (e) { /* */ }
    }
    leaderName = null;
    if (leaderId) {
      try { const { data: lp } = await c.from("profiles").select("display_name,handle").eq("id", leaderId).maybeSingle(); leaderName = lp ? (lp.display_name || lp.handle) : null; } catch (e) { /* */ }
    }
    curTeamId = teamId; active = true; members = []; myStartAt = null; myStopAt = null; lastHandledAt = 0; lastStopHandled = 0; lastPauseSyncAt = 0; joinedAt = Date.now();
    await pushPresence();       // 立刻讓隊友看到我在線
    poll();                     // 立刻拉一次
    loopPoll(); loopPush();     // 自適應輪詢/回報（有人記錄較勤、否則放慢，省電省流量）
    renderReadyBar();
  }

  function stop() {
    active = false;
    try { const c = Supa.client(); if (c && curTeamId) c.rpc("clear_team_presence", { p_team: curTeamId }).then(() => {}, () => {}); } catch (e) { /* */ }
    for (const k in peekMarkers) { try { map && map.removeLayer(peekMarkers[k]); } catch (e) { } }
    peekMarkers = {}; members = []; map = null; lastPos = null; leaderId = null; myReady = false;
    myStartAt = null; myStopAt = null; lastHandledAt = 0; lastStopHandled = 0; curTeamId = null; pollOk = false; pushOk = false;
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    const el = document.getElementById("teamReadyBar"); if (el) el.remove();
  }

  function status() { return { on: active, poll: pollOk, push: pushOk, members: members.length, me, team: curTeamId, leader: leaderId }; }

  // 分頁切回前景：立刻回報＋輪詢一次，狀態不落後
  if (typeof document !== "undefined" && document.addEventListener) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible" || !active) return;
      setTimeout(() => { if (!active) return; pushPresence(); poll(); loopPoll(); loopPush(); }, 400);   // 回前景：立即刷新＋重排節奏
    });
  }

  return { start, stop, isOn, isLeader, setReady, allReady, roster, teammates, notReadyNames, sendStart, onStart, sendStop, onStop, sendPause, sendResume, onPause, onResume, updatePos, peek, syncFs, status, _petHtml: petHtml, _myLook: myLook };   // _開頭：測試用
})();
