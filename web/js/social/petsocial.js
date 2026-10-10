// 社群寵物互動：看好友的夥伴、送果實、領取別人送的果實。
const Pets = (() => {
  const esc = s => Supa.esc(s);
  const T = s => (typeof ttT === "function" ? ttT(s) : s);
  const say = s => { if (typeof toast === "function") toast(s); };
  async function me() { const c = Supa.client(); if (!c) return null; const { data } = await Supa.meUser(); return data && data.user ? data.user.id : null; }

  // 3 分鐘內重開夥伴頁沿用上一次的好友清單（以前每切一次分頁就查三次）；查失敗（斷網）不快取。
  // friendsPets 失敗回空清單；夥伴頁用 loadFriends，失敗回 null——「讀不到」跟「還沒有好友」要分開講
  let _fpCache = null;
  async function loadFriends(uid) {
    const c = Supa.client(); uid = uid || await me(); if (!uid) return [];
    if (_fpCache && _fpCache.uid === uid && Date.now() - _fpCache.t < 180000) return _fpCache.list;
    try { const list = await _friendsPets(c, uid); if (list) _fpCache = { uid, t: Date.now(), list }; return list; } catch (e) { return null; }
  }
  async function friendsPets(uid) { return (await loadFriends(uid)) || []; }
  async function _friendsPets(c, uid) {
    // 兩邊的追蹤一起查（以前一個等一個）
    const [{ data: fo, error: e1 }, { data: fr, error: e2 }] = await Promise.all([
      c.from("follows").select("following_id").eq("follower_id", uid),
      c.from("follows").select("follower_id").eq("following_id", uid),
    ]);
    if (e1 || e2) return null;
    const following = new Set((fo || []).map(r => r.following_id));
    const mutual = (fr || []).map(r => r.follower_id).filter(id => following.has(id));
    if (!mutual.length) return [];
    const cols = "id,handle,display_name,avatar_url,pet_name,pet_level,total_km";
    let { data, error } = await c.from("profiles").select(cols + ",pet_hat,pet_decor,pet_state,pet_acc").in("id", mutual).limit(100);
    if (error) ({ data, error } = await c.from("profiles").select(cols + ",pet_hat,pet_decor,pet_state").in("id", mutual).limit(100));   // 還沒跑 phase40
    if (error) ({ data, error } = await c.from("profiles").select(cols + ",pet_hat,pet_decor").in("id", mutual).limit(100));   // 還沒跑 phase39
    if (error) ({ data, error } = await c.from("profiles").select(cols).in("id", mutual).limit(100));   // 還沒跑 phase38
    return error ? null : data || [];
  }

  // RPC 回 false＝今天已送過（或送給自己）；有 error 才是真的失敗（斷網、資料庫錯）——兩種要分開講
  async function sendGift(toId, n) {
    try {
      const c = Supa.client(); const { data, error } = await c.rpc("send_pet_gift", { p_to: toId, p_n: n });
      return { ok: !error && !!data, dup: !error && !data, error: error && error.message };
    } catch (e) { return { ok: false, dup: false, error: (e && e.message) || "network" }; }
  }

  // 領取別人送來的果實 → 加進本機 berryBonus
  let _claiming = false;   // 快速切換「夥伴」分頁會重入：兩次 SELECT 都讀到同一批未領取禮物 → 果實重複入帳
  async function claimGifts() {
    if (_claiming) return 0;
    _claiming = true;
    try { return await _claimGifts(); } finally { _claiming = false; }
  }
  async function _claimGifts() {
    const c = Supa.client(); const uid = await me(); if (!uid) return 0;
    const { data } = await c.from("pet_gifts").select("id,berries").eq("to_user", uid).eq("claimed", false).limit(200);
    if (!data || !data.length) return 0;
    // 只標記「剛才讀到的那幾筆」：以前整批標「所有未領」，讀完到標記之間剛好送來的果實會被標成已領卻沒算到
    // 2026-10-08 修正案 A4：只算「這一次真的從未領改成已領」的那幾筆（update 回傳的列）——兩台手機同時領，另一台已經標走的不會再算一次
    const { data: got, error } = await c.from("pet_gifts").update({ claimed: true }).in("id", data.map(g => g.id)).eq("claimed", false).select("id,berries");
    if (error) return 0;
    const sum = (Array.isArray(got) ? got : []).reduce((s, g) => s + (g.berries || 0), 0);
    if (sum > 0 && typeof addBerryBonus === "function") addBerryBonus(sum);
    return sum;
  }

  // 今天(本地)已送過果實的好友 id（送果實每天限一次/每人）
  async function giftedTodayIds(uid) {
    const c = Supa.client(); uid = uid || await me(); if (!uid) return new Set();
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const { data } = await c.from("pet_gifts").select("to_user").eq("from_user", uid).gte("created_at", start.toISOString());
    return new Set((data || []).map(r => r.to_user));
  }

  async function renderFriends() {
    const box = document.getElementById("petFriends"); if (!box) return;
    if (typeof Supa === "undefined" || !Supa.ready()) { box.innerHTML = ""; return; }
    const sess = typeof Auth !== "undefined" ? await Auth.session().catch(() => null) : null;
    const H = `<div class="section-title"><svg class="ic" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.2A3 3 0 0 1 16 11M21 20a6 6 0 0 0-4-5.7"/></svg>${T("好友的夥伴")}</div>`;
    if (!sess) { box.innerHTML = `<button class="fp-login" id="fpLogin">${T("登入社群，就能看到好友的夥伴、互送果實 ›")}</button>`; const b = document.getElementById("fpLogin"); if (b) b.addEventListener("click", () => { const t = document.querySelector('.tab[data-view="social"]'); if (t) t.click(); }); return; }
    const uid = await me(); if (!uid) { box.innerHTML = ""; return; }   // 查一次就好，下面兩個查詢共用
    const [list, sentToday] = await Promise.all([loadFriends(uid), giftedTodayIds(uid).catch(() => new Set())]);
    if (!list) { box.innerHTML = `${H}<div class="social-empty" style="padding:14px">${T("暫時讀不到好友的夥伴，等一下再試")}</div>`; return; }   /* 斷網：不畫成「還沒有好友」，也不觸發串門子 */
    if (!list.length) { box.innerHTML = `${H}<div class="social-empty" style="padding:14px">${T("在社群互相追蹤山友後，這裡會出現他們的夥伴，可以送果實打氣。")}</div>`; return; }
    const berry = typeof BERRY_SVG !== "undefined" ? BERRY_SVG : "🍓";   // 跟餵食鈕同一顆果實圖示
    const giftLbl = `${T("送出")} 3 ${berry}`;
    const rv = returnable(list);   // R12：今天來串門子的朋友 → 回訪
    const rvHtml = rv ? `<button class="fp-return" id="fpReturn" data-id="${rv.id}">${ic("footprints")}<span>${esc(T("{pet} 今天來過，帶你的夥伴去回訪")).replace("{pet}", `<span data-raw>${esc(friendName(rv))}</span>`)}</span><b>›</b></button>` : "";
    box.innerHTML = `${H}${rvHtml}<div class="friend-pets">${list.map(p => {
      const lvl = p.pet_level || 1, emoji = (typeof PET_STAGES !== "undefined" && PET_STAGES[lvl - 1]) ? PET_STAGES[lvl - 1].e : "🥚";
      const art = (typeof PET_ART !== "undefined") ? petSvg(p, lvl - 1) : emoji;   // 好友夥伴也用 SVG 角色，戴著對方的頭飾＋配件
      const sent = sentToday.has(p.id);
      return `<div class="fp"><button class="fp-visit" data-id="${p.id}" aria-label="${esc(T("去拜訪"))}"><span class="fp-pet">${art}</span><span class="fp-info"><b>${esc(p.pet_name ? T(p.pet_name) : (p.display_name || p.handle))}</b> <span class="lv-chip lvt-${Math.min(lvl, 7)}">Lv.${lvl}</span><span class="fp-by">@${esc(p.handle)}</span>${fresh(p) ? `<span class="fp-fresh${fresh(p).stale ? " stale" : ""}">${esc(fresh(p).t)}</span>` : ""}</span></button><button class="btn ghost fp-gift" data-id="${p.id}" data-name="${esc(p.display_name || p.handle)}"${sent ? " disabled" : ""}>${sent ? T("今天已送") : giftLbl}</button></div>`;
    }).join("")}</div>`;
    box.querySelectorAll(".fp-visit").forEach(b => b.addEventListener("click", () => { const p = list.find(x => x.id === b.dataset.id); if (p) visit(p, sentToday.has(p.id), () => renderFriends()); }));
    box.querySelectorAll(".fp-gift").forEach(b => b.addEventListener("click", () => giftClick(b, giftLbl)));
    const rb = box.querySelector("#fpReturn"); if (rb) rb.addEventListener("click", () => returnVisit(rv, sentToday.has(rv.id), rb));
    guestVisit(list);
  }
  // 朋友的夥伴來串門子（2026-10-07 寵物新一輪 #19）：一天最多一次，打開夥伴頁幾秒後隨機一位好友的夥伴走進舞台、待一會兒再走
  function guestVisit(list) {
    if (!list.length || typeof PetStage === "undefined" || !PetStage.guest || typeof PET_ART === "undefined") return;
    const day = typeof todayStr === "function" ? todayStr() : new Date().toDateString();
    if (localStorage.getItem("tt_pet_guest_day") === day && !window.__petGuestForce) return;
    const p = list[Math.floor(Math.random() * list.length)], lvl = Math.max(1, Math.min(7, p.pet_level || 1));
    const nm = p.pet_name ? T(p.pet_name) : (p.display_name || p.handle || T("好友的夥伴")), who = p.display_name || p.handle || "";
    setTimeout(async () => {
      if (document.body.dataset.view !== "pet") return;
      const ok = await PetStage.guest({ svg: petSvg(p, lvl - 1), stay: 3600 });
      if (ok) { localStorage.setItem("tt_pet_guest_day", day); localStorage.setItem("tt_pet_guest_who", JSON.stringify({ id: p.id, day })); }   // 記住是誰來過（回訪用）
    }, 2500);
    setTimeout(() => { if (document.body.dataset.view === "pet" && typeof petSay === "function" && document.querySelector(".ps-guest")) petSay(T("{who} 的 {pet} 來串門子了！").replace("{who}", who).replace("{pet}", nm), 3200); }, 4300);
  }
  async function giftClick(b, giftLbl) {
    if (b._busy || b.disabled) return;   // 鎖要在第一個 await 之前上，連點不會送兩次
    if (typeof berriesBalance === "function" && berriesBalance() < 3) { say(T("果實不夠，再多走一點就有")); return; }
    b._busy = true; b.disabled = true; b.textContent = T("送出中…");
    const r = await sendGift(b.dataset.id, 3);
    b._busy = false;
    if (r.dup) { b.textContent = T("今天已送"); say(T("今天送過這位了，明天再來")); return; }
    if (!r.ok) {   // 真的失敗：恢復按鈕可以再按，果實不扣
      b.disabled = false; b.innerHTML = giftLbl;
      say(T(Supa.errText(r.error)));
      return;
    }
    if (typeof addBerryBonus === "function") addBerryBonus(-3);   // 扣自己 3 顆
    b.textContent = T("今天已送");
    say(T("果實送出去了，對方會很開心"));
    if (typeof renderPet === "function") renderPet();
    return true;
  }

  // ───────── 拜訪好友的夥伴 ─────────
  // 摸摸頭：每位好友每天第一次摸，自己的夥伴親密度 +2（只記在本機，不用資料庫）
  const PAT_KEY = "tt_pet_pats";
  function patsToday() {
    try { const o = JSON.parse(localStorage.getItem(PAT_KEY) || "{}"); return o.d === localDayOf(new Date()) ? new Set(o.ids || []) : new Set(); } catch (e) { return new Set(); }
  }
  function markPat(id) {
    const s = patsToday(); s.add(id);
    try { localStorage.setItem(PAT_KEY, JSON.stringify({ d: localDayOf(new Date()), ids: [...s].slice(-200) })); } catch (e) { /* */ }
  }
  function friendName(p) { return p.pet_name ? T(p.pet_name) : (p.display_name || p.handle || T("山友")); }
  function hearts(stage) {
    for (let i = 0; i < 5; i++) {
      const h = document.createElement("span"); h.className = "fv-heart";
      if (typeof PET_HEART_SVG !== "undefined") h.innerHTML = PET_HEART_SVG; else h.textContent = "♥";   // emoji 愛心在部分裝置是空框
      h.style.left = (30 + Math.random() * 40) + "%"; h.style.animationDelay = (i * 90) + "ms";
      stage.appendChild(h); setTimeout(() => h.remove(), 1600);
    }
  }
  // 好友的夥伴舞台：跟對方自己的夥伴卡同一套（pet-stage.js 的 2.5D 場景＋腳下的葉子／雲＋影子），
  // 配件、走過的風景照對方同步上來的（phase38）；時段、季節跟著現在（你們在同一個台灣）
  const HAT_OK = id => typeof PET_ART !== "undefined" && PET_ART.HAT_IDS.includes(id);
  const ACC_OK = id => typeof PET_ART !== "undefined" && !!PET_ART.ACC_IDS && id !== "none" && PET_ART.ACC_IDS.includes(id);
  const petHatOf = p => HAT_OK(p.pet_hat) ? p.pet_hat : undefined, petAccOf = p => ACC_OK(p.pet_acc) ? p.pet_acc : undefined;   // 舊版沒有 pet_acc：照舊只畫頭飾
  const VOK = ["deep", "sea", "alpine"];
  const petVarOf = p => { const v = p && p.pet_state && typeof p.pet_state === "object" ? p.pet_state.v : ""; return VOK.includes(v) ? v : ""; };   // R15：好友的近親物種（舊版沒有＝原本的）
  const asV = (p, f) => (PET_ART.as ? PET_ART.as(petVarOf(p), f) : f());
  const petSvg = (p, i) => asV(p, () => PET_ART.svg(i, "", petHatOf(p), undefined, petAccOf(p)));
  // 好友狀態多久以前同步（R11，原26）：pet_state.at 是對方 App 上次寫上來的時間；超過 24 小時就不假裝知道牠現在的心情
  function fresh(p) {
    const st = p && p.pet_state && typeof p.pet_state === "object" ? p.pet_state : null, at = st && st.at ? new Date(st.at) : null;
    if (!at || isNaN(at)) return null;   // 舊版 App 沒寫同步時間：不顯示
    const h = Math.max(0, Math.floor((Date.now() - at.getTime()) / 3600e3));
    if (h >= 24) return { stale: true, t: T("超過一天沒同步") };
    return { stale: false, t: h < 1 ? T("剛剛同步") : T("{n} 小時前同步").replace("{n}", h) };
  }
  const DECOR_OK = ["fall", "sea", "old", "forest", "lake"];
  // 好友夥伴「當下」的心情：用對方最近一次走路的時間、跟自己夥伴卡同一套規則（pet.js 的 petMood）現在算，
  // 不存心情本身（存了會過時）；天氣是對方那邊的，超過 3 小時就不用（避免一直顯示早上的雨）
  const MOOD = [[1, "happy", "剛運動完，活力滿滿！"], [4, "content", "狀態不錯，隨時能出發"], [9, "longing", "有點想念山林了…"], [1e9, "sleepy", "好久沒出門，懶洋洋的"]];
  function friendMood(st) {
    const last = st && st.last ? new Date(st.last) : null;
    if (!last || isNaN(last)) return null;   // 對方還沒同步過狀態（舊版 App）：不亂猜
    const d = typeof daysSince === "function" ? daysSince(st.last) : Math.floor((Date.now() - last.getTime()) / 864e5);   // 跟對方自己的夥伴卡同一個算法
    const m = MOOD.find(([n]) => d <= n); return { k: m[1], t: m[2] };
  }
  function friendWx(st) {
    if (!st || !["rain", "snow", "cloud"].includes(st.wx) || !st.wxAt) return "";
    const at = new Date(st.wxAt.length <= 13 ? st.wxAt + ":00:00Z" : st.wxAt);
    return Date.now() - at.getTime() < 3 * 3600e3 ? st.wx : "";
  }
  function scene(p, i) {
    const hat = petHatOf(p) || "none";
    const decor = String(p.pet_decor || "").split(",").filter(d => DECOR_OK.includes(d)).slice(0, 2);
    const st = p.pet_state && typeof p.pet_state === "object" ? p.pet_state : null, f = fresh(p), stale = !!(f && f.stale);
    const mood = stale ? null : friendMood(st), wx = stale ? "" : friendWx(st);   // 太久沒同步：心情、天氣都不畫（不假裝即時）
    const fx = mood && typeof petMoodFx === "function" ? petMoodFx(mood.k) : "";
    const bub = mood ? T(mood.t) : stale ? T("不知道牠現在在做什麼") : "";
    const actor = `${bub ? `<div class="pet-bubble">${esc(bub)}</div>` : ""}<div class="fv-critter${mood ? ` pet-m-${mood.k}` : ""}">${PET_ART.prop ? PET_ART.prop(i) : ""}${asV(p, () => PET_ART.svg(i, "", hat, undefined, petAccOf(p)))}${fx}</div><div class="pet-shadow"></div>`;
    if (typeof PetStage === "undefined") return `${PET_ART.habitat(i)}${actor}`;
    return PetStage.html(i, actor, { decor, wx });
  }
  function visit(p, sent, onChange, together) {
    if (document.querySelector('[data-ov="petvisit"]')) return;
    const lvl = p.pet_level || 1, i = lvl - 1, berry = typeof BERRY_SVG !== "undefined" ? BERRY_SVG : "";
    const giftLbl = `${T("送出")} 3 ${berry}`;
    const ov = document.createElement("div"); ov.className = "pet-modal"; ov.dataset.ov = "petvisit";
    ov.innerHTML = `<div class="pet-modal-card fv-card" role="dialog" aria-label="${esc(T("拜訪夥伴"))}">
      <button class="sheet-close" id="pvX" aria-label="${esc(T("關閉"))}">${ic("x")}</button>
      <div class="fv-stage">${scene(p, i)}</div>
      <h2 class="fv-name">${esc(friendName(p))} <span class="lv-chip lvt-${Math.min(lvl, 7)}">Lv.${lvl}</span></h2>
      <div class="fv-by">${esc(T("%s 的夥伴").replace("%s", "@" + (p.handle || "")))}${p.total_km != null ? ` · ${T("已走")} ${Math.round(p.total_km * 10) / 10} km` : ""}</div>${fresh(p) ? `<div class="fv-fresh${fresh(p).stale ? " stale" : ""}">${esc(fresh(p).t)}</div>` : ""}
      <div class="fv-acts">
        <button class="btn fv-pat" id="pvPat">${ic("heart")}${T("摸摸頭")}</button>
        <button class="btn ghost fp-gift" id="pvGift" data-id="${p.id}"${sent ? " disabled" : ""}>${sent ? T("今天已送") : giftLbl}</button>
        <button class="btn ghost fv-photo" id="pvPhoto">${ic("camera")}${T("合照")}${!isPro() ? ` <span class="pro-tag">PRO</span>` : ""}</button>
      </div>
      <button class="link-btn fv-item" id="pvItem"${navigator.onLine === false ? " disabled" : ""}>${ic("leaf")}${navigator.onLine === false ? T("離線時不能送小東西") : T("送一個小東西")}</button></div>`;
    document.body.appendChild(ov);
    let _a11y = null;
    const close = () => { if (_a11y) _a11y(); ov.remove(); };
    if (typeof ttModalA11y === "function") _a11y = ttModalA11y(ov, close, { focus: "#pvPat" });
    ov.querySelector("#pvX").onclick = close;
    ov.addEventListener("click", e => { if (e.target === ov) close(); });
    const stage = ov.querySelector(".fv-stage"), actor = ov.querySelector(".fv-critter");
    ov.querySelector("#pvPat").onclick = () => {
      // 跟摸自己的夥伴同一個反應（pb-pat：以腳底為原點壓扁再彈回＋開心瞇眼）；只動角色，腳下的葉子／雲不動。
      // 以前用 fv-bounce，關鍵影格裡還留著舊排版的 translateX(-50%)，角色會先往左滑半個身體再回來
      clearTimeout(actor._t); actor.classList.remove("pb-pat"); void actor.offsetWidth; actor.classList.add("pb-pat");
      actor._t = setTimeout(() => actor.classList.remove("pb-pat"), 850);
      hearts(stage); if (typeof petBuzz === "function") petBuzz(20);
      if (patsToday().has(p.id)) { say(T("%s 蹭了蹭你的手").replace("%s", friendName(p))); return; }
      markPat(p.id);
      if (typeof bumpAffinity === "function") bumpAffinity(2);
      say(T("%s 很開心，你的夥伴也跟著開心了（親密度 +2）").replace("%s", friendName(p)));
      if (typeof renderPet === "function") renderPet();
    };
    ov.querySelector("#pvGift").onclick = async e => { if (await giftClick(e.currentTarget, giftLbl) && onChange) onChange(); };
    ov.querySelector("#pvPhoto").onclick = () => { if (!_proGate("petphoto")) return; photo(p); };
    ov.querySelector("#pvItem").onclick = e => giveItem(p, e.currentTarget);
    if (together) playTogether(stage);
  }

  // 合照：自己的夥伴（戴著配件）跟好友的夥伴站在一起，存成 1080×1350 圖
  const img = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  async function drawPhoto(p) {
    const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d"), F = "'TaipeiSans', 'PingFang TC', sans-serif";
    const mine = typeof petStats === "function" ? petStats() : { name: "", level: 1 };
    const mi = mine.level - 1, fi = (p.pet_level || 1) - 1, top = Math.max(mi, fi);
    const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#132c1d"); g.addColorStop(.7, "#22452e"); g.addColorStop(1, "#1b3620");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    try { await document.fonts.ready; } catch (e) { /* */ }
    const [hab, a, b] = await Promise.all([img(PET_ART.habitatUri(top, 1080, 520)), img(PET_ART.dataUri(mi, 500, petHat(), undefined, typeof petAcc === "function" ? petAcc() : undefined)), img(asV(p, () => PET_ART.dataUri(fi, 500, petHatOf(p), undefined, petAccOf(p))))]);   // 好友的配件也一起入鏡
    x.drawImage(hab, 0, 360, 1080, 520);
    x.fillStyle = "#1b3620"; x.fillRect(0, 878, W, H - 878);
    x.drawImage(a, 50, 380, 500, 500); x.drawImage(b, 530, 380, 500, 500);
    // 拍立得風的細框
    x.strokeStyle = "rgba(226,180,85,.55)"; x.lineWidth = 4; x.beginPath();
    if (x.roundRect) x.roundRect(40, 40, W - 80, H - 80, 36); else x.rect(40, 40, W - 80, H - 80);
    x.stroke();
    x.textAlign = "center"; x.fillStyle = "#f6efd9";
    x.font = `800 76px ${F}`; x.fillText(T("一起去爬山吧"), W / 2, 230, W - 160);
    x.font = `500 38px ${F}`; x.fillStyle = "rgba(246,239,217,.7)"; x.fillText(new Date().toLocaleDateString(typeof ttLocale === "function" ? ttLocale() : "zh-TW"), W / 2, 300);
    x.font = `700 50px ${F}`; x.fillStyle = "#f6efd9";
    x.fillText(T(mine.name || ""), 305, 990, 420); x.fillText(friendName(p), 775, 990, 420);
    x.font = `500 34px ${F}`; x.fillStyle = "rgba(246,239,217,.65)";
    x.fillText(`Lv.${mine.level}`, 305, 1046); x.fillText(`Lv.${p.pet_level || 1} · @${p.handle || ""}`, 775, 1046, 420);
    x.font = `700 40px ${F}`; x.fillStyle = "#e2b455"; x.fillText(T("循徑拾光 · Gather the Trail"), W / 2, H - 110);
    return c;
  }
  async function photo(p) {
    try {
      const c = await drawPhoto(p);
      const blob = await new Promise(r => c.toBlob(r, "image/png"));
      if (!blob) throw new Error("blob");
      const how = await saveBlob(blob, ttCJK() ? "循徑拾光-夥伴合照.png" : "gather-the-trail-pets.png", T("夥伴合照"));
      if (how === "saved") say(T("已存成圖片"));
    } catch (e) { say(T("產生圖片失敗")); }
  }

  // ── R12：送小東西（give_pet_item）──
  // 收藏只在手機上，伺服器擋重送、限次、封鎖；送出成功才從手冊拿掉。離線不能按（不做本機排隊，免得重送）。
  const GIVE_MSG = { dup: "這件已經送過 %s 了", daily: "今天已經送過 %s 一件了，明天再送", blocked: "沒辦法送給 %s", not_friend: "要互相追蹤才能送", self: "不能送給自己" };
  async function giveItem(p, btn) {
    if (navigator.onLine === false) { say(T("離線時不能送小東西")); return false; }
    const own = (typeof petGiftsOwned === "function" ? petGiftsOwned() : []).filter(o => typeof PET_GIFTS !== "undefined" && PET_GIFTS[o.id] && !o.dbg);
    if (!own.length) { say(T("手冊裡還沒有小東西可以送（親密滿 5 顆心，牠會自己出門撿）")); return false; }
    if (typeof ttChoice !== "function") return false;
    const ids = [...new Set(own.map(o => o.id))];
    const id = await ttChoice({ html: `<p><b>${esc(T("送一個小東西給 %s").replace("%s", friendName(p)))}</b></p><p class="ah-n">${esc(T("送出去之後，你的手冊就少這一件"))}</p>` },
      ids.map(k => ({ label: `${petGiftIcon(k, "pg-ic")} ${esc(T(PET_GIFTS[k][0]))}`, value: k })).concat([{ label: esc(T("取消")), value: null }]));
    if (!id) return false;
    if (btn) btn.disabled = true;
    let r = null;
    try { const { data, error } = await Supa.client().rpc("give_pet_item", { p_to: p.id, p_item: id }); if (error) throw error; r = data; }
    catch (e) { r = await itemReached(p.id, id) ? "ok" : null; }   // 送出了但回應斷掉：查一次對方是不是已經收到，免得「對方拿到了、我這邊沒扣」
    if (btn) btn.disabled = false;
    if (r === "ok") {
      if (typeof petGiftRemove === "function") petGiftRemove(id);
      if (typeof petDiarySocial === "function") petDiarySocial("give", id, friendName(p));
      say(T("送給 %s 了").replace("%s", friendName(p))); if (typeof petBuzz === "function") petBuzz(20);
      return true;
    }
    say(r && GIVE_MSG[r] ? T(GIVE_MSG[r]).replace("%s", friendName(p)) : T("沒送出去，等一下再試"));
    return false;
  }
  async function itemReached(to, item) {
    try { const uid = await me(); const { data } = await Supa.client().from("pet_item_gifts").select("item").eq("from_user", uid).eq("to_user", to).eq("item", item).limit(1); return !!(data && data.length); } catch (e) { return false; }
  }
  // 領取別人送的小東西：手冊沒有就收進去，已經有了就換成 3 顆果實；伺服器一次領完（兩台手機不會重複領）
  // 領取（小東西、回訪）共用的保護：要登入、同時只領一次、60 秒內不重打；資料庫沒有這支函式（還沒跑 phase41）就這次開 App 不再試
  const _claimAt = {}, _claimOff = {};
  async function claimRpc(fn) {
    if (_claimOff[fn] || Date.now() - (_claimAt[fn] || 0) < 60000) return null;
    _claimAt[fn] = Date.now();
    const uid = await me(); if (!uid) { _claimAt[fn] = 0; return null; }
    const { data, error } = await Supa.client().rpc(fn);
    if (error) { if (/PGRST202|does not exist|Could not find/.test((error.code || "") + " " + (error.message || ""))) _claimOff[fn] = true; else _claimAt[fn] = 0; return null; }
    return data;
  }
  async function claimItems() {
    try {
      const data = await claimRpc("claim_pet_items"); if (!data || !data.length) return 0;
      let berries = 0;
      for (const r of data) {
        const who = r.from_name || T("好友");
        const has = typeof petGiftsOwned === "function" && petGiftsOwned().some(o => o.id === r.item);
        if (typeof PET_GIFTS === "undefined" || !PET_GIFTS[r.item] || has) { berries += 3; continue; }   // 已經有了／這版還不認得
        if (typeof petGiftAdd === "function") petGiftAdd(r.item, who);
        if (typeof petDiarySocial === "function") petDiarySocial("got", r.item, who);
        say(T("%s 送你一個小東西：").replace("%s", who) + T(PET_GIFTS[r.item][0]));
      }
      if (berries && typeof addBerryBonus === "function") { addBerryBonus(berries); say(T("收到好友送的小東西（手冊裡已經有了，換成 {n} 顆果實）").replace("{n}", berries)); }
      return data.length;
    } catch (e) { return 0; }
  }

  // ── R12：回訪（pet_return_visit）──
  // 朋友的夥伴今天來串門子過 → 夥伴頁出現「回訪」：你的夥伴走進對方的舞台，兩隻一起玩一次松果；雙方各記一筆日記。每天每位好友一次（伺服器擋）
  const today = () => (typeof todayStr === "function" ? todayStr() : new Date().toDateString());
  function returnable(list) {
    let g = null; try { g = JSON.parse(localStorage.getItem("tt_pet_guest_who") || "null"); } catch (e) { /* */ }
    if (!g || g.day !== today() || localStorage.getItem("tt_pet_rv_" + g.id) === today()) return null;
    return list.find(p => p.id === g.id) || null;
  }
  async function returnVisit(p, sent, btn) {
    if (navigator.onLine === false) { say(T("離線時不能回訪")); return; }
    if (btn) btn.disabled = true;
    let r = null; try { const { data, error } = await Supa.client().rpc("pet_return_visit", { p_to: p.id }); if (!error) r = data; } catch (e) { /* */ }
    if (btn) btn.disabled = false;
    if (r === "ok" || r === "daily") localStorage.setItem("tt_pet_rv_" + p.id, today());
    if (r === "ok") {
      if (typeof petDiarySocial === "function") petDiarySocial("visit", "", friendName(p));
      visit(p, sent, () => renderFriends(), true);
      if (btn) btn.remove();
      return;
    }
    say(r === "daily" ? T("今天已經去過 %s 家了").replace("%s", friendName(p)) : r === "blocked" || r === "not_friend" ? T("沒辦法回訪 %s").replace("%s", friendName(p)) : T("回訪沒送出，等一下再試"));
  }
  // 兩隻一起玩一次松果：你的夥伴從左邊走進來，松果在兩隻之間拋一個來回，玩完就停（不重複播）
  function playTogether(stage) {
    const box = stage.querySelector(".ps-box") || stage; if (!box || typeof PET_ART === "undefined") return;
    const i = typeof petStageIndex === "function" && typeof totalKm === "function" ? petStageIndex(totalKm()) : 3;
    const mine = document.createElement("div"); mine.className = "fv-me"; mine.setAttribute("aria-hidden", "true");
    mine.innerHTML = PET_ART.own(() => PET_ART.svg(i, "", typeof petHat === "function" ? petHat() : "none", undefined, typeof petAcc === "function" ? petAcc() : "none"));
    const cone = document.createElement("i"); cone.className = "fv-cone"; cone.setAttribute("aria-hidden", "true");
    cone.innerHTML = typeof petGiftIcon === "function" ? petGiftIcon("pine", "pg-ic") : "";
    stage.classList.add("fv-together"); box.appendChild(mine); box.appendChild(cone);
    clearTimeout(stage._pt); stage._pt = setTimeout(() => { cone.remove(); stage.dataset.played = "1"; }, 3600);
  }

  async function claimVisits() {
    try {
      const data = await claimRpc("claim_pet_visits"); if (!data || !data.length) return 0;
      for (const r of data) {
        const who = r.pet_name ? T(r.pet_name) : (r.from_name || T("好友的夥伴"));
        if (typeof petDiarySocial === "function") petDiarySocial("visited", "", who);
        say(T("%s 回訪了你家！").replace("%s", who));
      }
      return data.length;
    } catch (e) { return 0; }
  }

  return { friendsPets, sendGift, claimGifts, claimItems, claimVisits, renderFriends, visit, giveItem, returnVisit, _drawPhoto: drawPhoto, _claimReset: () => { for (const k in _claimAt) delete _claimAt[k]; for (const k in _claimOff) delete _claimOff[k]; } };
})();
