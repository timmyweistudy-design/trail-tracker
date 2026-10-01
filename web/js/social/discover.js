// 搜尋使用者（handle/名字）、追蹤/取消、檢視他人個人頁（含其貼文）。
const Discover = (() => {
  const esc = s => Supa.esc(s);
  const T = s => (typeof ttT === "function" ? ttT(s) : s);
  const say = s => { if (typeof toast === "function") toast(T(s)); };
  const avatar = (p, cls) => p.avatar_url ? `<img class="${cls || "fc-av"}" src="${esc(p.avatar_url)}" alt="">` : `<div class="${cls || "fc-av"} fc-av-ph">${esc((p.display_name || p.handle || "?").slice(0, 1))}</div>`;
  const tags = p => `${p.pet_level ? `<span class="lv-chip lvt-${Math.min(p.pet_level, 7)}">Lv.${p.pet_level}</span>` : ""}${p.is_premium ? `<span class="pro-tag pro-id">PRO</span>` : ""}`;
  // 一列山友（搜尋、推薦、粉絲名單共用）；withFollow：右邊放追蹤鈕
  function personRow(p, fstate) {
    const btn = fstate ? `<button class="btn ${fstate === "no" ? "primary" : "ghost"} disc-follow" data-id="${p.id}" data-name="${esc(p.display_name || p.handle)}" data-fstate="${fstate}">${T(FOLLOW_LBL[fstate] || "追蹤")}</button>` : "";
    // 名字自己一行拿滿寬度；等級和 PRO 移到 @帳號那行（以前標籤擠在名字旁，名字被截成五個字）
    return `<div class="disc-row" data-id="${p.id}">${avatar(p)}<div class="disc-id"><b><span class="fc-nm">${esc(p.display_name || p.handle)}</span></b><span class="disc-sub"><span class="disc-h">@${esc(p.handle)}</span>${tags(p)}</span></div>${btn}</div>`;
  }
  // 追蹤鈕：按「已追蹤／已申請」會先問一下再取消（以前一按就取消）
  function wireFollow(root) {
    root.querySelectorAll(".disc-follow").forEach(b => { if (b._tb) return; b._tb = 1; b.addEventListener("click", async e => {
      e.stopPropagation();
      const st = b.dataset.fstate || "no", on = st === "no";
      const nm = (b.dataset.name || "").length > 16 ? b.dataset.name.slice(0, 16) + "…" : (b.dataset.name || "");   // 名字太長會把整句撐爆
      if (!on && !(await ttConfirm(st === "requested" ? T("收回追蹤請求？") : `${T("不再追蹤")}${ttSp()}${nm}${ttCJK() ? "？" : "?"}`, T(st === "requested" ? "收回請求" : "不追蹤了"), T("取消")))) return;
      b.disabled = true;
      const r = await follow(b.dataset.id, on);
      b.disabled = false;
      if (r === "blocked") { say("你們之間有封鎖，沒辦法追蹤"); return; }
      paintFollowBtn(b, r === "requested" ? "requested" : r === "followed" ? "following" : "no");
      if (r === "requested") say("請求送出了，等對方同意");
    }); });
  }
  function petLineFor(prof) {
    if (!prof.pet_name && !prof.pet_level) return "";
    const lvl = prof.pet_level || 1;
    const emoji = (typeof PET_STAGES !== "undefined" && PET_STAGES[lvl - 1]) ? PET_STAGES[lvl - 1].e : "🐾";
    const art = (typeof PET_ART !== "undefined") ? PET_ART.svg(lvl - 1) : emoji;
    return `<div class="pf-pet">${art} ${esc(prof.pet_name || "")} <span class="lv-chip lvt-${Math.min(lvl, 7)}">Lv.${lvl}</span>${prof.total_km != null ? ` · ${T("已走")} ${Math.round(prof.total_km * 10) / 10} km` : ""}</div>`;
  }

  function render(renderInto) {
    renderInto(`<div class="disc">
      <input id="discQ" class="auth-input" type="search" placeholder="${T("搜尋名字、@帳號或 #標籤")}" autocapitalize="off" enterkeyhint="search">
      <div id="discResults"></div></div>`);
    const q = document.getElementById("discQ"); let t = null;
    q.addEventListener("input", () => { clearTimeout(t); t = setTimeout(() => { const v = q.value.trim(); v.length < 2 ? showSuggestions() : search(v); }, 300); });
    showSuggestions();   // 一進來先給「推薦追蹤」，不必空白
  }

  // 推薦追蹤：近期活躍、我還沒追蹤的山友
  async function showSuggestions() {
    const box = document.getElementById("discResults"); if (!box) return;
    box.innerHTML = `<div class="feed-loading"><span class="spin"></span></div>`;
    const people = (typeof Posts !== "undefined" && Posts.suggestions) ? await Posts.suggestions() : [];
    if (!document.getElementById("discResults")) return;
    if (!people.length) { box.innerHTML = `<div class="social-empty"><span class="ee">${ic("search")}</span>${T("打名字或 @帳號找山友，打 #標籤找貼文。")}</div>`; return; }
    box.innerHTML = `<div class="disc-sec">${ic("sparkle")} ${T("可能認識的山友")}</div>` + people.map(p => personRow(p, "no")).join("");
    box.querySelectorAll(".disc-row").forEach(r => r.addEventListener("click", e => { if (e.target.closest(".disc-follow")) return; openProfile(r.dataset.id); }));
    wireFollow(box);
  }

  let _sseq = 0;
  async function search(term) {
    const box = document.getElementById("discResults"); if (!box) return;
    const my = ++_sseq;   // 打字很快時，晚回來的舊搜尋結果不能蓋掉新的
    const isTag = term.startsWith("#");
    term = term.replace(/^[@#]/, "").replace(/[%,()*\\]/g, "");   // 去除會破壞 PostgREST or() 的字元
    if (term.length < (isTag ? 1 : 2)) { box.innerHTML = `<div class="social-empty">${T("再多打一個字")}</div>`; return; }
    const tagRow = `<div class="disc-sec">${T("標籤")}</div><div class="hot-tags"><button class="hot-tag" data-tag="${esc(term)}">#${esc(term)}</button></div>`;
    const wireTags = () => box.querySelectorAll(".hot-tag").forEach(b => b.addEventListener("click", () => { if (typeof Feed !== "undefined") Feed.openTag(b.dataset.tag); }));
    if (isTag) { box.innerHTML = tagRow; wireTags(); return; }   // 打 # 開頭才當標籤找，找人時不再每次都多一排 #關鍵字
    box.innerHTML = `<div class="feed-loading"><span class="spin"></span></div>`;
    const c = Supa.client();
    const [{ data: raw }, blocked, me, following] = await Promise.all([
      c.from("profiles").select("id, handle, display_name, avatar_url, pet_level, is_premium").or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`).limit(30),
      (typeof Safety !== "undefined") ? Safety.blockedIds() : new Set(), Supa.uid(), Posts.followingIds()]);
    if (my !== _sseq || !document.body.contains(box)) return;
    const fset = new Set(following);
    const data = (raw || []).filter(p => !blocked.has(p.id) && p.id !== me);   // 過濾已封鎖的人和自己
    if (!data.length) {
      box.innerHTML = `<div class="social-empty">${T("找不到這位山友。")}</div>` + tagRow;
      wireTags(); return;
    }
    box.innerHTML = `<div class="disc-sec">${T("山友")}</div>` + data.map(p => personRow(p, fset.has(p.id) ? "following" : "no")).join("");
    box.querySelectorAll(".disc-row").forEach(r => r.addEventListener("click", e => { if (e.target.closest(".disc-follow")) return; openProfile(r.dataset.id); }));
    wireFollow(box);
  }

  async function isFollowing(targetId) {
    const c = Supa.client(); const { data: u } = await Supa.meUser(); if (!u || !u.user) return false;
    const { data } = await c.from("follows").select("following_id").eq("follower_id", u.user.id).eq("following_id", targetId).maybeSingle();
    return !!data;
  }
  // 追蹤狀態：'no' | 'following' | 'requested'（requested＝已送出請求、等對方同意）
  async function followState(targetId) {
    const c = Supa.client(); const { data: u } = await Supa.meUser(); if (!u || !u.user) return "no";
    const [f, rq] = await Promise.all([isFollowing(targetId),   // 兩個一起查
      c.from("follow_requests").select("id").eq("requester_id", u.user.id).eq("target_id", targetId).maybeSingle().then(r => r, () => ({}))]);
    if (f) return "following";
    if (rq && rq.data) return "requested";   // phase18 未跑 → 沒有請求表 → 當沒有
    return "no";
  }
  // 追蹤（預設需對方同意）。回傳 'followed' | 'requested' | 'unfollowed'
  async function follow(targetId, on) {
    const c = Supa.client(); const { data: u } = await Supa.meUser(); if (!u || !u.user) return "no";
    if (on) {
      const { data, error } = await c.rpc("request_follow", { p_target: targetId });
      if (error) {   // 資料庫未升級 phase18 → 退回舊行為直接追蹤
        await c.from("follows").insert({ follower_id: u.user.id, following_id: targetId });
        return "followed";
      }
      if (data === "blocked") return "blocked";   // 任一方封鎖 → 後端不建立追蹤也不發通知
      return data === "requested" ? "requested" : "followed";
    }
    await c.from("follows").delete().eq("follower_id", u.user.id).eq("following_id", targetId);
    try { await c.from("follow_requests").delete().eq("requester_id", u.user.id).eq("target_id", targetId); } catch (e) { /* 無請求表 */ }
    return "unfollowed";
  }
  const FOLLOW_LBL = { no: "追蹤", following: "已追蹤", requested: "已申請" };
  function paintFollowBtn(b, state) {
    b.dataset.fstate = state;
    b.textContent = T(FOLLOW_LBL[state] || "追蹤");
    b.className = b.className.replace(/\b(primary|ghost)\b/g, "").trim() + (state === "no" ? " primary" : " ghost");
  }

  async function openProfile(userId) {
    if (typeof ttBusy === "function" && ttBusy("profile-" + userId)) return;   // 防連點（含抓資料空窗）
    if (document.querySelector(`[data-ov="profile-${userId}"]`)) return;   // 防連點疊層（不同人的頁面仍可堆疊）
    // 先出框和轉圈，再抓資料（以前要等 3 個查詢跑完才有畫面）
    const wrap = document.createElement("div");
    wrap.className = "pv-mask"; wrap.dataset.ov = "profile-" + userId;
    wrap.innerHTML = `<div class="pv"><div class="pv-head"><button class="comp-x" aria-label="${T("關閉")}" id="dpX">${ic("x")}</button><b id="dpTitle"></b><span></span></div>
      <div class="pv-body" id="dpBody"><div class="feed-loading"><span class="spin"></span></div></div></div>`;
    document.body.appendChild(wrap);
    let tabMap = null;
    const close = () => { if (tabMap) { try { tabMap.remove(); } catch (e) { } } wrap.remove(); };
    wrap.querySelector("#dpX").addEventListener("click", close);
    const c = Supa.client();
    // 全部一起發出去，但個人資料一回來就先把頭像、名字畫上（以前要等貼文、追蹤數、追蹤狀態全部跑完才有畫面）
    const profP = c.from("profiles").select("*").eq("id", userId).maybeSingle(), meP = Supa.uid();
    const postsP = Posts.userPosts(userId), countsP = Posts.followCounts(userId), totalP = Posts.postCount(userId);
    const [{ data: prof }, me] = await Promise.all([profP, meP]);
    if (!document.body.contains(wrap)) return;
    if (!prof) { close(); say("找不到這位山友"); return; }
    const isMe = me === userId;
    const fstateP = isMe ? "no" : followState(userId), blockedP = isMe ? false : Safety.isBlocked(userId);
    wrap.querySelector("#dpTitle").textContent = "@" + prof.handle;
    const body = wrap.querySelector("#dpBody");
    if (prof.cover_url) body.classList.add("has-cover");
    const top = () => `
        ${prof.cover_url ? `<div class="pf-cover" style="background-image:url('${esc(prof.cover_url)}')"></div>` : ""}
        <div class="pf-top">${avatar(prof, "pf-av" + (prof.is_premium ? " pro-av" : ""))}
          <div class="pf-id"><div class="pf-name"><span class="fc-nm">${esc(prof.display_name || prof.handle)}</span>${prof.is_premium ? `<span class="pro-tag pro-id">PRO</span>` : ""}</div><div class="pf-handle">@${esc(prof.handle)}</div></div></div>
        ${petLineFor(prof)}`;
    body.innerHTML = top() + `${prof.bio ? `<div class="pf-bio">${esc(prof.bio)}</div>` : ""}<div class="feed-loading"><span class="spin"></span></div>`;
    const [posts, counts, total, fstate, blocked] = await Promise.all([postsP, countsP, totalP, fstateP, blockedP]);
    const liked = await Posts.likedSet(posts.map(p => p.id));
    if (!document.body.contains(wrap)) return;
    body.innerHTML = `${top()}
        <div class="pf-counts"><span class="cnt"><b>${total == null ? posts.length : total}</b> ${T("篇")}</span><button class="cnt-link" data-mode="followers"><b>${counts.followers}</b> ${T("粉絲")}</button><button class="cnt-link" data-mode="following"><b>${counts.following}</b> ${T("追蹤中")}</button></div>
        ${prof.bio ? `<div class="pf-bio">${esc(prof.bio)}</div>` : ""}
        ${isMe ? "" : `<div class="dp-acts"><button class="btn ${fstate === "no" ? "primary" : "ghost"} disc-follow" id="dpFollow" data-id="${userId}" data-name="${esc(prof.display_name || prof.handle)}" data-fstate="${fstate}">${T(FOLLOW_LBL[fstate])}</button>
          <button class="btn ghost dp-more" id="dpMore" aria-label="${T("更多")}">${ic("more")}</button></div>`}
        <div class="pf-tabs"><button class="pf-tab on" data-pt="posts">${T("貼文")}</button><button class="pf-tab" data-pt="photos">${T("相片")}</button><button class="pf-tab" data-pt="map">${T("足跡")}</button></div>
        <div id="dpTabBody"></div>`;
    body.querySelectorAll(".cnt-link").forEach(s2 => s2.addEventListener("click", () => openUserList(userId, s2.dataset.mode)));
    wireFollow(body);
    // 檢舉／封鎖收進「⋯」（以前是兩個小框框字，看起來不像按鈕）；封鎖狀態記在變數，不再讀按鈕文字判斷（翻成英文就壞）
    let isBlocked = !!blocked;
    const mb = body.querySelector("#dpMore");
    if (mb) mb.addEventListener("click", async () => {
      const act = await ttChoice(`@${esc(prof.handle)}`, [
        { label: T("檢舉這位山友"), value: "report", cls: "ghost" },
        { label: T(isBlocked ? "解除封鎖" : "封鎖"), value: "block", cls: "ghost danger" },
        { label: T("取消"), value: null, cls: "primary" }]);
      if (act === "report") {
        const reason = await Safety.pickReason(); if (reason === null) return;
        const rr = await Safety.reportUser(userId, reason);
        say(rr && rr.error ? Supa.errText(rr.error) : "收到，謝謝你回報");
      } else if (act === "block") {
        // 封鎖／解除都看結果再講（以前沒成功也說「封鎖了」）
        if (isBlocked) { const ur = await Safety.unblock(userId); if (ur && ur.error) { say(Supa.errText(ur.error)); return; } isBlocked = false; say("解除封鎖了"); return; }
        if (!(await ttConfirm(T("封鎖之後你們看不到彼此的貼文，互相追蹤也會解除。"), T("封鎖"), T("取消"), { danger: true }))) return;
        const br = await Safety.block(userId); if (br && br.error) { say(Supa.errText(br.error)); return; }
        say("封鎖了"); close(); if (typeof SocialUI !== "undefined") SocialUI.refresh();
      }
    });
    const photos = [];
    posts.forEach(p => (p.post_media || []).filter(m => m.kind === "photo").forEach(m => photos.push(m)));
    const tb = body.querySelector("#dpTabBody");
    const empty = (icon, t) => `<div class="social-empty"><span class="ee">${ic(icon)}</span>${T(t)}</div>`;

    function showTab(t) {
      body.querySelectorAll(".pf-tab").forEach(b2 => b2.classList.toggle("on", b2.dataset.pt === t));
      if (tabMap) { try { tabMap.remove(); } catch (e) { } tabMap = null; }
      if (t === "posts") {
        tb.className = "feed-list";
        tb.innerHTML = posts.length ? posts.map(p => Feed.card(p, liked.has(p.id))).join("") : empty("pencil", "還沒有貼文。");
        Feed.bindCards(tb);   // 以前這裡按讚沒反應、影片放不出來
      } else if (t === "photos") {
        tb.className = "";
        if (!photos.length) { tb.innerHTML = empty("camera", "還沒有相片。"); return; }
        const urls = photos.map(m => Media.publicUrl(m.path));
        tb.innerHTML = `<div class="pf-photos">${photos.map((m, idx) => `<div class="pf-ph" data-idx="${idx}"><img loading="lazy" decoding="async" src="${esc(Media.publicUrl(m.thumb_path || m.path))}" alt=""></div>`).join("")}</div>`;
        tb.querySelectorAll(".pf-ph").forEach(el => el.addEventListener("click", () => { if (typeof Lightbox !== "undefined") Lightbox.openGallery(urls, +el.dataset.idx); }));
      } else {
        tb.className = "";
        const withTrack = posts.filter(p => p.track_thumb && p.track_thumb.length > 1);
        if (!withTrack.length || typeof L === "undefined") { tb.innerHTML = empty("map", "還沒有可顯示的路線。"); return; }
        tb.innerHTML = `<div class="pf-map" id="pfMap"></div>`;
        setTimeout(() => {
          try {
            tabMap = L.map("pfMap", { zoomControl: false, attributionControl: false });
            (typeof baseTopo === "function" ? baseTopo() : L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")).addTo(tabMap);
            const lines = withTrack.map(p => L.polyline(p.track_thumb.map(c2 => [c2[1], c2[0]]), { color: "#c2683d", weight: 3, opacity: .85 }).addTo(tabMap));
            tabMap.fitBounds(L.featureGroup(lines).getBounds(), { padding: [22, 22] });
          } catch (e) { tb.innerHTML = empty("map", "地圖載入失敗。"); }
        }, 60);
      }
    }
    body.querySelectorAll(".pf-tab").forEach(b2 => b2.addEventListener("click", () => showTab(b2.dataset.pt)));
    showTab("posts");
  }

  // 由 handle 開啟個人頁（@提及點擊用）
  async function openByHandle(handle) {
    const c = Supa.client(); if (!c || !handle) return;
    const { data } = await c.from("profiles").select("id").eq("handle", handle.toLowerCase()).maybeSingle();
    if (data && data.id) openProfile(data.id);
    else if (typeof toast === "function") toast(T("找不到這位山友") + " @" + handle);
  }

  async function profilesByIds(ids) {
    if (!ids.length) return [];
    const c = Supa.client();
    const { data } = await c.from("profiles").select("id, handle, display_name, avatar_url, pet_level, is_premium").in("id", ids).limit(200);
    return data || [];
  }
  async function listFollowers(uid) {
    const c = Supa.client();
    const { data } = await c.from("follows").select("follower_id").eq("following_id", uid);
    return profilesByIds((data || []).map(r => r.follower_id));
  }
  async function listFollowing(uid) {
    const c = Supa.client();
    const { data } = await c.from("follows").select("following_id").eq("follower_id", uid);
    return profilesByIds((data || []).map(r => r.following_id));
  }
  // 粉絲 / 追蹤中 名單覆蓋層
  async function openUserList(uid, mode) {
    if (typeof ttBusy === "function" && ttBusy("ulist")) return;   // 防連點
    const title = T(mode === "followers" ? "粉絲" : "追蹤中");
    if (document.querySelector('[data-ov="ulist"]')) return;   // 防連點疊層
    const wrap = document.createElement("div"); wrap.className = "pv-mask"; wrap.dataset.ov = "ulist";
    wrap.innerHTML = `<div class="pv"><div class="pv-head"><button class="comp-x" aria-label="${T("關閉")}" id="ulX">${ic("x")}</button><b>${title}</b><span></span></div>
      <div class="pv-body" id="ulBody"><div class="feed-loading"><span class="spin"></span></div></div></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector("#ulX").addEventListener("click", () => wrap.remove());
    // 每一列都有追蹤鈕：粉絲名單可以直接回追（以前只能點進個人頁再按）
    const [people, me, following] = await Promise.all([mode === "followers" ? listFollowers(uid) : listFollowing(uid), Supa.uid(), Posts.followingIds()]);
    const body = wrap.querySelector("#ulBody"); if (!body) return;
    const fset = new Set(following);
    body.innerHTML = people.length ? people.map(p => personRow(p, p.id === me ? null : (fset.has(p.id) ? "following" : "no"))).join("") : `<div class="social-empty">${T(mode === "followers" ? "還沒有粉絲。" : "還沒追蹤任何人。")}</div>`;
    body.querySelectorAll(".disc-row").forEach(r => r.addEventListener("click", e => { if (e.target.closest(".disc-follow")) return; wrap.remove(); openProfile(r.dataset.id); }));
    wireFollow(body);
  }

  return { render, openProfile, openByHandle, follow, isFollowing, followState, openUserList };
})();
