// 留守人：出發前設定預計下山時間，指定留守人（互相追蹤的好友）。
// 記錄開始時把行程送上雲端（supabase/schema-phase31-guardian.sql）；記錄中每 5 分鐘回報一次最後位置；
// 超過預計時間 30 分鐘還沒按結束，後端會通知留守人（附最後位置）。按結束＝平安下山。
// 沒登入、沒好友也能用：可以把行程用簡訊／訊息傳給家人，App 也會在預計時間到時提醒你自己。
// 本機狀態 tt_guard（跟裝置走、不備份）：{ at: 預計下山 ms, gs: [{id,name,avatar}], trail, planId, on: 已開始, pend: 等網路補送 }
const Guardian = (() => {
  const T = s => (typeof ttT === "function" ? ttT(s) : s);
  const KEY = "tt_guard", GRACE = 30 * 60000, PING = 5 * 60000, MAXG = 5;
  const NID_DUE = 201, NID_WARN = 202;
  let _lastPing = 0, _busy = false, _warned = 0;

  function st() { try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch (e) { return null; } }
  function save(s) { try { if (s) localStorage.setItem(KEY, JSON.stringify(s)); else localStorage.removeItem(KEY); } catch (e) { /* */ } }
  const recState = () => (typeof Recorder !== "undefined" ? Recorder.getState() : "idle");
  const recording = () => recState() !== "idle";
  const ready = () => typeof Supa !== "undefined" && Supa.ready && Supa.ready() && Supa.client();
  async function ensureSocial() { if (!ready() && typeof window.loadSocial === "function") { try { await window.loadSocial(); } catch (e) { /* */ } } return ready(); }
  async function me() { try { const { data } = await Supa.meUser(); return data && data.user ? data.user.id : null; } catch (e) { return null; } }

  // 「今天 15:40」「明天 07:00」
  function whenText(ms) {
    const d = new Date(ms), now = new Date();
    const day = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 864e5);
    const hm = d.toLocaleTimeString(ttLocale(), { hour: "2-digit", minute: "2-digit", hour12: false });
    return `${T(day <= 0 ? "今天" : day === 1 ? "明天" : "後天")} ${hm}`;
  }
  const round15 = ms => Math.ceil(ms / 9e5) * 9e5;
  function curTrail() {
    const id = (typeof selectedTrailId !== "undefined" && selectedTrailId) || (typeof Recorder !== "undefined" && Recorder._trailId);
    return id && typeof TRAILS !== "undefined" ? TRAILS.find(t => String(t.id) === String(id)) : null;
  }
  // 依步道（有你的腳程就用你的）估：現在出發，走完再多留 30 分鐘
  function suggest() {
    const t = curTrail(); if (!t) return null;
    const h = (typeof myHoursFor === "function" && myHoursFor(t)) || (typeof estHours === "function" && estHours(t));
    if (!h || !isFinite(h) || h <= 0 || h > 48) return null;
    const s = recording() && typeof Recorder !== "undefined" ? Recorder.snapshot() : null;
    const start = s && s.elapsedMs ? Date.now() - s.elapsedMs : Date.now();
    return Math.max(Date.now() + 30 * 60000, round15(start + h * 3.6e6 + 30 * 60000));
  }
  function lastPos() {
    const s = typeof Recorder !== "undefined" ? Recorder.snapshot() : null;
    const p = s && s.track && s.track.length ? s.track[s.track.length - 1] : null;
    return p ? { lat: p.lat, lon: p.lon } : null;
  }

  // ───────── 本機提醒（原生：系統通知；網頁：App 開著時 toast＋震動） ─────────
  function LN() { const w = window; return w.Capacitor && w.Capacitor.isNativePlatform && w.Capacitor.isNativePlatform() && w.Capacitor.Plugins && w.Capacitor.Plugins.LocalNotifications; }
  async function scheduleLocal(s) {
    const P = LN(); if (!P) return;
    try { await P.cancel({ notifications: [{ id: NID_DUE }, { id: NID_WARN }] }); } catch (e) { /* */ }
    if (!s || !s.at) return;
    try {
      let perm = await P.checkPermissions(); if (perm.display !== "granted") perm = await P.requestPermissions();
      if (perm.display !== "granted") return;
      const list = [];
      if (s.at > Date.now()) list.push({ id: NID_DUE, title: T("預計下山時間到了"), body: T(s.planId ? "平安的話記得按結束。30 分鐘後還沒結束，會通知你的留守人" : "平安的話記得按結束，也跟家人說一聲"), schedule: { at: new Date(s.at) } });
      if (s.planId && s.at + GRACE - 10 * 60000 > Date.now()) list.push({ id: NID_WARN, title: T("10 分鐘後會通知留守人"), body: T("還在走的話，打開 App 延後時間"), schedule: { at: new Date(s.at + GRACE - 10 * 60000) } });
      if (list.length) await P.schedule({ notifications: list });
    } catch (e) { /* 提醒排不進去不影響留守 */ }
  }

  // ───────── 雲端行程 ─────────
  async function createPlan(s) {
    if (!s.gs || !s.gs.length) return true;   // 只傳給家人、沒有雲端留守人
    if (!(await ensureSocial()) || !navigator.onLine) return false;
    const uid = await me(); if (!uid) return false;
    const p = lastPos();
    const t = curTrail();
    const row = { owner_id: uid, trail_id: t ? String(t.id) : null, trail_name: (t && t.name) || s.trail || null, expected_at: new Date(s.at).toISOString(), guardians: s.gs.map(g => g.id), last_lat: p ? p.lat : null, last_lon: p ? p.lon : null, last_at: p ? new Date().toISOString() : null };
    try {
      const { data, error } = await Supa.client().from("trip_plans").insert(row).select("id").single();
      if (error) { s.err = /trip_plans|relation|does not exist|schema cache/i.test(error.message || "") ? "nodb" : /mutual friend/i.test(error.message || "") ? "nofriend" : "net"; save(s); return false; }
      s.planId = data.id; s.pend = false; s.err = null; save(s); _lastPing = Date.now();
      return true;
    } catch (e) { s.err = "net"; save(s); return false; }
  }
  async function patchPlan(fields) {
    const s = st(); if (!s || !s.planId || !ready()) return false;
    try { const { error } = await Supa.client().from("trip_plans").update(fields).eq("id", s.planId); return !error; } catch (e) { return false; }
  }
  async function ping(force) {
    const s = st(); if (!s || !s.on || !s.planId || !navigator.onLine) return;
    if (!force && Date.now() - _lastPing < PING) return;
    const p = lastPos(); if (!p) return;
    _lastPing = Date.now();
    await patchPlan({ last_lat: p.lat, last_lon: p.lon, last_at: new Date().toISOString() });
  }

  // 記錄開始時呼叫：設定好的留守開始生效
  async function onStart() {
    const s = st(); if (!s || s.on) return;
    s.on = true; s.started = Date.now(); save(s);
    if (s.gs && s.gs.length) { const ok = await createPlan(s); if (!ok) { const s2 = st(); if (s2) { s2.pend = true; save(s2); } } }
    scheduleLocal(st()); paintHud();
  }
  // 記錄結束時呼叫：平安下山
  async function onFinish() {
    const s = st(); if (!s) return;
    scheduleLocal(null);
    save(null); paintHud();
    if (s.planId) {
      if (!(await finishPlan(s.planId, "done"))) { try { localStorage.setItem("tt_guard_done", s.planId); } catch (e) { /* */ } }
      else if (s.gs && s.gs.length) toast(T("已通知系統你平安下山，留守結束"));
    }
  }
  async function finishPlan(id, status) {
    if (!(await ensureSocial()) || !navigator.onLine) return false;
    try { const { error } = await Supa.client().from("trip_plans").update({ status }).eq("id", id); return !error; } catch (e) { return false; }
  }
  // 斷網時結束的那一趟：有網路就補送「平安下山」（不然留守人會收到超時通知）
  async function flushDone() {
    let id = null; try { id = localStorage.getItem("tt_guard_done"); } catch (e) { /* */ }
    if (id && await finishPlan(id, "done")) { try { localStorage.removeItem("tt_guard_done"); } catch (e) { /* */ } }
  }
  async function extend(min) {
    const s = st(); if (!s) return;
    const base = Math.max(Date.now(), s.at);
    s.at = round15(base + min * 60000); _warned = 0; save(s);
    if (s.planId && !(await patchPlan({ expected_at: new Date(s.at).toISOString() }))) toast(T("延後還沒送出（沒網路），有網路會自動補送"));
    if (s.planId && !navigator.onLine) { s.pendAt = true; save(s); }
    scheduleLocal(s); paintHud();
    toast(`${T("預計下山改成")}${ttColon()}${whenText(s.at)}`);
  }
  async function cancel() {
    const s = st(); if (!s) return;
    if (s.gs && s.gs.length && s.on && !(await ttConfirm(T("取消留守？留守人就不會在你超時的時候收到通知。"), T("取消留守"), T("保留"), { danger: true }))) return;
    scheduleLocal(null); save(null); paintHud();
    if (s.planId) finishPlan(s.planId, "cancelled");
    toast(T("留守取消了"));
  }

  // 每 30 秒：補送、回報位置、到時間提醒（網頁沒有系統通知，App 開著就提醒）
  async function tick() {
    if (_busy) return; _busy = true;
    try {
      flushDone();
      const s = st(); if (!s) return;
      if (!s.on && s.at < Date.now() - 12 * 3.6e6) { save(null); return; }   // 設定了沒出發、時間早就過了 → 清掉
      if (s.on && !recording()) { onFinish(); return; }   // 記錄已不在（例如閃退後放棄）→ 收掉
      if (s.on && s.pend && navigator.onLine) { const ok = await createPlan(st()); if (ok) { scheduleLocal(st()); toast(T("留守行程送出去了")); } }
      if (s.on && s.pendAt && navigator.onLine && s.planId) { if (await patchPlan({ expected_at: new Date(s.at).toISOString() })) { const s2 = st(); if (s2) { s2.pendAt = false; save(s2); } } }
      if (s.on) await ping(false);
      if (s.on && !LN()) {
        const over = Date.now() - s.at;
        if (over >= 0 && _warned < 1) { _warned = 1; toast(T("預計下山時間到了。平安的話記得按結束")); if (typeof ttBuzz === "function") ttBuzz([200, 100, 200]); }
        if (s.planId && over >= GRACE - 10 * 60000 && _warned < 2) { _warned = 2; toast(T("10 分鐘後會通知留守人。還在走的話先延後")); if (typeof ttBuzz === "function") ttBuzz([300, 120, 300, 120, 300]); }
      }
      paintHud();
    } finally { _busy = false; }
  }

  // ───────── 記錄頁上的小條：留守中・預計 15:40 下山 ─────────
  function paintHud() {
    const box = document.getElementById("guardHud"); if (!box) return;
    const s = st();
    const tile = document.getElementById("btnGuard"); if (tile) tile.classList.toggle("on", !!s);
    if (!s) { box.hidden = true; box.innerHTML = ""; return; }
    const now = Date.now(), over = now - s.at;
    const names = (s.gs || []).map(g => g.name).slice(0, 2).join("、") + ((s.gs || []).length > 2 ? ` +${s.gs.length - 2}` : "");
    const cls = !s.on ? "set" : over >= GRACE ? "alert" : over >= 0 ? "due" : "";
    let sub;
    if (!s.on) sub = T("按開始後生效");
    else if (s.err === "nodb") sub = T("雲端留守還沒開通，只會提醒你自己");
    else if (s.pend) sub = T("還沒送出（沒網路），有網路會自動補送");
    else if (over >= GRACE && s.planId) sub = T("已經通知留守人了。平安的話按結束，他們會收到你平安下山");
    else if (over >= 0) sub = s.planId ? T("超過時間了，%d 分鐘後通知留守人").replace("%d", Math.max(1, Math.ceil((GRACE - over) / 60000))) : T("超過預計時間了，記得跟家人報平安");
    else sub = names ? `${T("留守人")}${ttColon()}${escHtml(names)}` : T("只提醒你自己（沒有雲端留守人）");
    box.className = "guard-hud " + cls;
    box.hidden = false;
    box.innerHTML = `<span class="gh-ic">${ic("shield")}</span>
      <div class="gh-t"><b><span>${T("預計下山")}</span> ${whenText(s.at)}</b><small>${sub}</small></div>
      ${s.on ? `<button class="gh-ext" id="ghExt">${T("延後 1 小時")}</button>` : ""}
      <button class="gh-more" id="ghMore" aria-label="${T("留守人")}">${ic("more")}</button>`;
    const ext = box.querySelector("#ghExt"); if (ext) ext.onclick = () => extend(60);
    box.querySelector("#ghMore").onclick = () => openSheet();
  }

  // ───────── 設定面板 ─────────
  async function friends() {
    if (!(await ensureSocial())) return null;
    const uid = await me(); if (!uid) return null;
    try {
      const c = Supa.client();
      const [{ data: fo }, { data: fr }] = await Promise.all([c.from("follows").select("following_id").eq("follower_id", uid), c.from("follows").select("follower_id").eq("following_id", uid)]);
      const following = new Set((fo || []).map(r => r.following_id));
      const mutual = (fr || []).map(r => r.follower_id).filter(id => following.has(id));
      if (!mutual.length) return [];
      const { data } = await c.from("profiles").select("id,handle,display_name,avatar_url").in("id", mutual).limit(100);
      return (data || []).map(p => ({ id: p.id, name: p.display_name || p.handle || T("山友"), avatar: p.avatar_url || null }));
    } catch (e) { return []; }
  }
  function shareText(at, trailName) {
    const p = lastPos();
    const head = trailName ? T("我今天去走「%t」，預計%w 下山。").replace("%t", T(trailName)) : T("我今天去爬山，預計%w 下山。");
    const map = p ? ` ${T("我現在的位置")}${ttColon()}https://www.google.com/maps?q=${p.lat.toFixed(5)},${p.lon.toFixed(5)}` : "";
    return `${head.replace("%w", whenText(at))}${ttSp()}${T("超過時間還沒消息，先打給我；聯絡不上請撥 112。")}${map}`;
  }
  async function shareOut(text) {
    if (navigator.share) { try { await navigator.share({ text }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
    if (navigator.clipboard) { try { await navigator.clipboard.writeText(text); toast(T("複製好了，貼給家人就行")); return; } catch (e) { /* */ } }
    if (typeof ttAlertBox === "function") ttAlertBox(text); else toast(text);
  }
  function shareLoc() {
    if (!navigator.geolocation) { toast(T("此裝置不支援定位")); return; }
    toast(T("定位中…"));
    navigator.geolocation.getCurrentPosition(pos => {
      const { latitude: la, longitude: lo } = pos.coords;
      const url = `https://www.google.com/maps?q=${la.toFixed(6)},${lo.toFixed(6)}`;
      shareOut(`${T("我現在在這裡")}${ttColon()}${url}`);
    }, () => toast(T("定位失敗，請允許定位權限")), { enableHighAccuracy: true, timeout: 10000 });
  }

  async function openSheet() {
    if (document.querySelector('[data-ov="guard"]')) return;
    const cur = st();
    const t = curTrail();
    const sug = suggest();
    let at = cur ? cur.at : (sug || round15(Date.now() + 4 * 3.6e6));
    let picked = new Map((cur && cur.gs || []).map(g => [g.id, g]));
    const ov = document.createElement("div"); ov.className = "pet-modal gd-modal"; ov.dataset.ov = "guard";
    ov.innerHTML = `<div class="pet-modal-card gd-card"><button class="sheet-close" id="gdX" aria-label="${T("關閉")}">${ic("x")}</button>
      <h2>${ic("shield")} ${T("留守人")}</h2>
      <p class="gd-intro">${T("設定預計下山時間。超過 30 分鐘還沒按結束，會通知你的留守人，附上你最後的位置。")}</p>
      <div class="gd-h">${T("預計下山")}</div>
      <div class="gd-when"><b id="gdWhen"></b><input type="time" id="gdTime" aria-label="${T("預計下山")}"></div>
      <div class="gd-chips" id="gdChips"></div>
      <div class="gd-h">${T("留守人")} <small>${T("互相追蹤的山友，最多 5 位")}</small></div>
      <div class="gd-friends" id="gdFriends"><div class="feed-loading"><span class="spin"></span></div></div>
      <div class="gd-msg auth-msg" id="gdMsg"></div>
      <button class="btn primary" id="gdGo"></button>
      ${cur ? `<button class="link-btn gd-cancel" id="gdCancel">${T("取消留守")}</button>` : ""}
      <div class="gd-h gd-h2">${T("也傳給家人")}</div>
      <div class="gd-share">
        <button class="btn ghost" id="gdSms">${ic("chat")} ${T("傳行程給家人")}</button>
        <button class="btn ghost" id="gdLoc">${ic("pin")} ${T("分享我現在的位置")}</button>
      </div></div>`;
    document.body.appendChild(ov);
    let _a11y = null;
    const close = () => { if (_a11y) _a11y(); ov.remove(); };
    if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: "#gdX" });
    ov.querySelector("#gdX").onclick = close;
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    const $o = s => ov.querySelector(s);
    const paintWhen = () => {
      $o("#gdWhen").textContent = whenText(at);
      const d = new Date(at); $o("#gdTime").value = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      const opts = [];
      if (sug) opts.push([sug, `${T("依步道估")} ${whenText(sug).split(" ").pop()}`]);
      [3, 5, 8].forEach(h => opts.push([round15(Date.now() + h * 3.6e6), `+${h} ${T("小時")}`]));
      $o("#gdChips").innerHTML = opts.map(([v, l]) => `<button class="chip${Math.abs(v - at) < 6e4 ? " active" : ""}" data-v="${v}">${l}</button>`).join("");
      $o("#gdChips").querySelectorAll(".chip").forEach(b => b.onclick = () => { at = +b.dataset.v; paintWhen(); });
    };
    $o("#gdTime").addEventListener("change", e => {
      const [h, m] = String(e.target.value || "").split(":").map(Number); if (!isFinite(h) || !isFinite(m)) return;
      const d = new Date(); d.setHours(h, m, 0, 0);
      if (d.getTime() < Date.now() + 5 * 60000) d.setDate(d.getDate() + 1);   // 比現在早 → 當成明天
      at = d.getTime(); paintWhen();
    });
    paintWhen();
    const paintGo = () => {
      const go = $o("#gdGo");
      go.innerHTML = cur ? T("更新") : recording() ? `${ic("shield")} ${T("開始留守")}` : `${ic("shield")} ${T("設定好了，開始記錄時生效")}`;
    };
    paintGo();
    // 好友清單
    const fl = await friends();
    const fbox = $o("#gdFriends"); if (!fbox) return;
    if (fl == null) fbox.innerHTML = `<div class="gd-empty">${T("登入社群就能指定好友當留守人。也可以用下面的按鈕把行程傳給家人。")}</div>`;
    else if (!fl.length) fbox.innerHTML = `<div class="gd-empty">${T("還沒有互相追蹤的山友。可以用下面的按鈕把行程傳給家人。")}</div>`;
    else {
      fbox.innerHTML = fl.map(f => `<label class="gd-f"><input type="checkbox" value="${escHtml(f.id)}"${picked.has(f.id) ? " checked" : ""}>
        <span class="gd-av">${f.avatar ? `<img src="${escHtml(f.avatar)}" alt="">` : escHtml((f.name || "?").slice(0, 1))}</span><span class="gd-fn">${escHtml(f.name)}</span>${ic("check")}</label>`).join("");
      fbox.querySelectorAll("input").forEach(inp => inp.addEventListener("change", () => {
        const f = fl.find(x => x.id === inp.value);
        if (inp.checked) { if (picked.size >= MAXG) { inp.checked = false; toast(T("留守人最多 5 位")); return; } picked.set(f.id, f); }
        else picked.delete(f.id);
      }));
    }
    $o("#gdSms").onclick = () => shareOut(shareText(at, (t && t.name) || (cur && cur.trail)));
    $o("#gdLoc").onclick = shareLoc;
    const cb = $o("#gdCancel"); if (cb) cb.onclick = async () => { close(); await cancel(); };
    $o("#gdGo").onclick = async () => {
      const go = $o("#gdGo"), msg = $o("#gdMsg");
      if (at < Date.now() + 5 * 60000) { msg.className = "gd-msg auth-msg bad"; msg.textContent = T("預計下山時間要在現在之後"); return; }
      go.disabled = true;
      const gs = [...picked.values()].map(g => ({ id: g.id, name: g.name, avatar: g.avatar }));
      const prev = st();
      const changedGs = !prev || JSON.stringify((prev.gs || []).map(g => g.id).sort()) !== JSON.stringify(gs.map(g => g.id).sort());
      const s = Object.assign({}, prev || {}, { at, gs, trail: (t && t.name) || (prev && prev.trail) || null });
      if (prev && prev.on && changedGs) { if (prev.planId) finishPlan(prev.planId, "cancelled"); s.planId = null; s.on = false; }   // 換了留守人 → 重新開一張行程
      save(s);
      if (recording() && !s.on) await onStart();
      else if (s.on && s.planId && prev && prev.at !== at) { if (!(await patchPlan({ expected_at: new Date(at).toISOString() }))) { s.pendAt = true; save(s); } scheduleLocal(s); }
      const now = st();
      close(); paintHud();
      if (now && now.err === "nodb") toast(T("雲端留守還沒開通，只會提醒你自己"));
      else if (now && now.pend) toast(T("還沒送出（沒網路），有網路會自動補送"));
      else if (!gs.length) toast(T("好了。記得把行程傳給家人"));
      else toast(recording() ? `${T("開始留守")}${ttColon()}${gs.map(g => g.name).join("、")}` : T("設定好了，開始記錄時生效"));
    };
  }

  // ───────── 留守人那一端：看行程狀態 ─────────
  async function plans(id) {
    if (!(await ensureSocial())) return null;
    try {
      const { data, error } = await Supa.client().rpc("guard_plans", id ? { p_id: id } : {});
      if (error) return null;
      return data || [];
    } catch (e) { return null; }
  }
  const STATUS = { active: "留守中", overdue: "超過預計時間", done: "平安下山了", cancelled: "取消了" };
  function planCard(p, full) {
    const pos = p.last_lat != null ? `${p.last_lat.toFixed(5)}, ${p.last_lon.toFixed(5)}` : null;
    const ago = p.last_at && typeof ttAgo === "function" ? ttAgo(Math.max(1, Math.round((Date.now() - new Date(p.last_at)) / 1000))) : "";
    return `<div class="gp-card st-${p.status}">
      <div class="gp-top"><span class="gp-av">${p.owner_avatar ? `<img src="${escHtml(p.owner_avatar)}" alt="">` : escHtml((p.owner_name || "?").slice(0, 1))}</span>
        <div class="gp-who"><b>${escHtml(p.owner_name)}</b><small>${p.trail_name ? escHtml(T(p.trail_name)) : T("自由路線")}</small></div>
        <span class="gp-st">${T(STATUS[p.status] || p.status)}</span></div>
      <div class="gp-row">${ic("clock")} <span>${T("預計下山")}</span> <b>${whenText(new Date(p.expected_at).getTime())}</b></div>
      ${pos ? `<div class="gp-row">${ic("pin")} <span>${T("最後位置")}</span> <b>${pos}</b>${ago ? `<small>${ago}</small>` : ""}</div>` : `<div class="gp-row gp-none">${ic("pin")} <span>${T("還沒有位置回報")}</span></div>`}
      ${full ? `${p.status === "overdue" ? `<div class="gp-advice">${ic("alert")}<span>${T("先打電話或傳訊息給他。聯絡不上、又過了一段時間，請撥 112，把步道名稱和最後位置告訴消防局。")}</span></div>` : ""}
        <div class="gp-btns">${pos ? `<a class="btn ghost" href="https://www.google.com/maps?q=${p.last_lat},${p.last_lon}" target="_blank" rel="noopener">${ic("map")} ${T("在地圖上看")}</a>` : ""}
        ${p.status === "overdue" ? `<a class="btn danger" href="tel:112">${ic("phone")} ${T("撥 112")}</a>` : ""}
        ${pos ? `<button class="btn ghost" data-copy="${escHtml(`${p.owner_name}｜${p.trail_name || ""}｜${pos}`)}">${ic("share")} ${T("複製位置")}</button>` : ""}</div>` : ""}
    </div>`;
  }
  async function openPlan(id) {
    if (document.querySelector('[data-ov="gplan"]')) return;
    const ov = document.createElement("div"); ov.className = "pet-modal gd-modal"; ov.dataset.ov = "gplan";
    ov.innerHTML = `<div class="pet-modal-card gd-card"><button class="sheet-close" id="gpX" aria-label="${T("關閉")}">${ic("x")}</button>
      <h2>${ic("shield")} ${T("留守")}</h2><div id="gpBody"><div class="feed-loading"><span class="spin"></span></div></div></div>`;
    document.body.appendChild(ov);
    let _a11y = null;
    const close = () => { if (_a11y) _a11y(); ov.remove(); };
    if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: "#gpX" });
    ov.querySelector("#gpX").onclick = close;
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    const rows = await plans(id);
    const body = ov.querySelector("#gpBody"); if (!body) return;
    if (rows == null) { body.innerHTML = `<div class="gd-empty">${T("載入失敗，等一下再試試")}</div>`; return; }
    if (!rows.length) { body.innerHTML = `<div class="gd-empty">${T("這趟留守已經結束了")}</div>`; return; }
    body.innerHTML = rows.map(p => planCard(p, true)).join("");
    body.querySelectorAll("[data-copy]").forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast(T("複製好了")); } catch (e) { toast(b.dataset.copy); } });
  }
  // 社群通知頁最上面：「你正在幫 N 位山友留守」
  async function bannerHtml() {
    const rows = await plans(null);
    if (!rows || !rows.length) return "";
    const live = rows.filter(p => p.status === "active" || p.status === "overdue");
    if (!live.length) return "";
    return `<div class="gp-banner">${live.map(p => `<button class="gp-b st-${p.status}" data-plan="${p.id}">${ic("shield")}<span>${(p.status === "overdue" ? T("%s 超過預計時間還沒回報") : T("你正在幫 %s 留守")).replace("%s", `<b>${escHtml(p.owner_name)}</b>`)}</span><small>${whenText(new Date(p.expected_at).getTime())}</small></button>`).join("")}</div>`;
  }
  function wireBanner(root) { (root || document).querySelectorAll(".gp-b[data-plan]").forEach(b => b.onclick = () => openPlan(b.dataset.plan)); }

  function init() {
    const btn = document.getElementById("btnGuard"); if (btn) btn.addEventListener("click", () => openSheet());
    paintHud();
    setInterval(tick, 30000);
    window.addEventListener("online", () => tick());
    setTimeout(tick, 1500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
  return { openSheet, onStart, onFinish, extend, cancel, openPlan, bannerHtml, wireBanner, paintHud, tick, state: st, _whenText: whenText };
})();
if (typeof window !== "undefined") window.Guardian = Guardian;
