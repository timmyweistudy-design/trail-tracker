// 搜尋使用者（handle/名字）、追蹤/取消、檢視他人個人頁（含其貼文）。
const Discover = (() => {
  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }
  function petLineFor(prof) {
    if (!prof.pet_name && !prof.pet_level) return "";
    const lvl = prof.pet_level || 1;
    const emoji = (typeof PET_STAGES !== "undefined" && PET_STAGES[lvl - 1]) ? PET_STAGES[lvl - 1].e : "🐾";
    return `<div class="pf-pet">${emoji} ${esc(prof.pet_name || "")} <span class="lv-chip lvt-${Math.min(lvl, 7)}">Lv.${lvl}</span>${prof.total_km != null ? `　·　已走 ${prof.total_km} km` : ""}</div>`;
  }

  function render(renderInto) {
    renderInto(`<div class="disc">
      <input id="discQ" class="auth-input" placeholder="搜尋 handle 或名字" autocapitalize="off">
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
    if (!people.length) { box.innerHTML = `<div class="social-empty">輸入 handle 或名字搜尋山友。</div>`; return; }
    box.innerHTML = `<div class="disc-sec">✨ 推薦追蹤</div>` + people.map(p => `<div class="disc-row" data-id="${p.id}">
      ${p.avatar_url ? `<img class="fc-av" src="${esc(p.avatar_url)}">` : `<div class="fc-av fc-av-ph">${esc((p.display_name || p.handle).slice(0, 1))}</div>`}
      <div class="disc-id"><b>${esc(p.display_name || p.handle)}${p.pet_level ? ` <span class="lv-chip lvt-${Math.min(p.pet_level,7)}">Lv.${p.pet_level}</span>` : ""}${p.is_premium ? ` <span class="pro-tag">PRO</span>` : ""}</b><span>@${esc(p.handle)}</span></div>
      <button class="btn primary disc-follow" data-id="${p.id}">追蹤</button></div>`).join("");
    box.querySelectorAll(".disc-row").forEach(r => r.addEventListener("click", e => { if (e.target.closest(".disc-follow")) return; openProfile(r.dataset.id); }));
    box.querySelectorAll(".disc-follow").forEach(b => b.addEventListener("click", async e => {
      e.stopPropagation();
      const on = b.textContent === "追蹤";
      b.textContent = on ? "已追蹤" : "追蹤"; b.className = "btn disc-follow " + (on ? "ghost" : "primary");
      await follow(b.dataset.id, on);
    }));
  }

  async function search(term) {
    const box = document.getElementById("discResults"); if (!box) return;
    term = term.replace(/[%,()*\\]/g, "");   // 去除會破壞 PostgREST or() 的字元
    if (term.length < 2) { box.innerHTML = `<div class="social-empty">輸入至少 2 個字搜尋山友。</div>`; return; }
    const c = Supa.client();
    const { data: raw } = await c.from("profiles").select("id, handle, display_name, avatar_url, is_premium")
      .or(`handle.ilike.%${term}%,display_name.ilike.%${term}%`).limit(30);
    const blocked = (typeof Safety !== "undefined") ? await Safety.blockedIds() : new Set();
    const data = (raw || []).filter(p => !blocked.has(p.id));   // 過濾已封鎖的人
    const cleanTag = term.replace(/^#/, "");
    const tagRow = `<div class="disc-sec">標籤</div><div class="hot-tags"><button class="hot-tag" data-tag="${esc(cleanTag)}">#${esc(cleanTag)}</button></div>`;
    if (!data.length) {
      box.innerHTML = tagRow + `<div class="social-empty">找不到符合的山友。</div>`;
      box.querySelectorAll(".hot-tag").forEach(b => b.addEventListener("click", () => { if (typeof Feed !== "undefined") Feed.openTag(b.dataset.tag); }));
      return;
    }
    box.innerHTML = tagRow + `<div class="disc-sec">山友</div>` + data.map(p => `<div class="disc-row" data-id="${p.id}">
      ${p.avatar_url ? `<img class="fc-av" src="${esc(p.avatar_url)}">` : `<div class="fc-av fc-av-ph">${esc((p.display_name || p.handle).slice(0, 1))}</div>`}
      <div class="disc-id"><b>${esc(p.display_name || p.handle)}${p.is_premium ? ` <span class="pro-tag">PRO</span>` : ""}</b><span>@${esc(p.handle)}</span></div></div>`).join("");
    box.querySelectorAll(".disc-row").forEach(r => r.addEventListener("click", () => openProfile(r.dataset.id)));
    box.querySelectorAll(".hot-tag").forEach(b => b.addEventListener("click", () => { if (typeof Feed !== "undefined") Feed.openTag(b.dataset.tag); }));
  }

  async function isFollowing(targetId) {
    const c = Supa.client(); const { data: u } = await c.auth.getUser(); if (!u || !u.user) return false;
    const { data } = await c.from("follows").select("following_id").eq("follower_id", u.user.id).eq("following_id", targetId).maybeSingle();
    return !!data;
  }
  async function follow(targetId, on) {
    const c = Supa.client(); const { data: u } = await c.auth.getUser(); if (!u || !u.user) return;
    if (on) await c.from("follows").insert({ follower_id: u.user.id, following_id: targetId });
    else await c.from("follows").delete().eq("follower_id", u.user.id).eq("following_id", targetId);
  }

  async function openProfile(userId) {
    const c = Supa.client();
    const { data: prof } = await c.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (!prof) return;
    const { data: me } = await c.auth.getUser();
    const isMe = me && me.user && me.user.id === userId;
    const following = isMe ? false : await isFollowing(userId);
    const wrap = document.createElement("div");
    wrap.className = "pv-mask";
    wrap.innerHTML = `<div class="pv"><div class="pv-head"><button class="comp-x" aria-label="關閉" id="dpX">✕</button><b>@${esc(prof.handle)}</b><span></span></div>
      <div class="pv-body${prof.cover_url ? " has-cover" : ""}">
        ${prof.cover_url ? `<div class="pf-cover" style="background-image:url('${esc(prof.cover_url)}')"></div>` : ""}
        <div class="pf-top">${prof.avatar_url ? `<img class="pf-av${prof.is_premium ? " pro-av" : ""}" src="${esc(prof.avatar_url)}">` : `<div class="pf-av pf-av-ph${prof.is_premium ? " pro-av" : ""}">${esc((prof.display_name || prof.handle).slice(0, 1))}</div>`}
          <div class="pf-id"><div class="pf-name">${esc(prof.display_name || prof.handle)}${prof.is_premium ? ` <span class="pro-tag">PRO</span>` : ""}</div><div class="pf-handle">@${esc(prof.handle)}</div></div></div>
        ${petLineFor(prof)}
        <div class="pf-counts" id="dpCounts"></div>
        ${prof.bio ? `<div class="pf-bio">${esc(prof.bio)}</div>` : ""}
        ${isMe ? "" : `<button class="btn ${following ? "ghost" : "primary"}" id="dpFollow">${following ? "已追蹤" : "追蹤"}</button>
        <div class="pf-safety">${isMe ? "" : `<button class="link-btn" id="dpReport">檢舉</button><button class="link-btn" id="dpBlock">封鎖</button>`}</div>`}
        <div class="pf-tabs"><button class="pf-tab on" data-pt="posts">貼文</button><button class="pf-tab" data-pt="photos">相片</button><button class="pf-tab" data-pt="map">足跡</button></div>
        <div id="dpTabBody"><div class="feed-loading"><span class="spin"></span></div></div>
      </div></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector("#dpX").addEventListener("click", () => wrap.remove());
    Posts.followCounts(userId).then(c2 => {
      const el = wrap.querySelector("#dpCounts"); if (!el) return;
      el.innerHTML = `<span class="cnt-link" data-mode="followers"><b>${c2.followers}</b> 粉絲</span>　<span class="cnt-link" data-mode="following"><b>${c2.following}</b> 追蹤中</span>`;
      el.querySelectorAll(".cnt-link").forEach(s => s.addEventListener("click", () => openUserList(userId, s.dataset.mode)));
    });
    const fb = wrap.querySelector("#dpFollow");
    if (fb) fb.addEventListener("click", async () => {
      const on = fb.textContent === "追蹤";
      fb.textContent = on ? "已追蹤" : "追蹤"; fb.className = "btn " + (on ? "ghost" : "primary");
      await follow(userId, on);
    });
    const rb = wrap.querySelector("#dpReport");
    if (rb) rb.addEventListener("click", async () => {
      const reason = await Safety.pickReason(); if (reason === null) return;
      await Safety.reportUser(userId, reason);
      if (typeof toast === "function") toast("已檢舉，感謝回報");
    });
    const bb = wrap.querySelector("#dpBlock");
    if (bb) {
      Safety.isBlocked(userId).then(b => { bb.textContent = b ? "解除封鎖" : "封鎖"; });
      bb.addEventListener("click", async () => {
        const blocked = bb.textContent === "解除封鎖";
        if (!blocked && !confirm("封鎖後你們將看不到彼此的貼文，並解除互相追蹤。確定？")) return;
        if (blocked) { await Safety.unblock(userId); bb.textContent = "封鎖"; if (typeof toast === "function") toast("已解除封鎖"); }
        else { await Safety.block(userId); if (typeof toast === "function") toast("已封鎖"); wrap.remove(); if (typeof SocialUI !== "undefined") SocialUI.route(); }
      });
    }
    const posts = await Posts.userPosts(userId);
    const liked = await Posts.likedSet(posts.map(p => p.id));
    const photos = [];
    posts.forEach(p => (p.post_media || []).filter(m => m.kind === "photo").forEach(m => photos.push(m)));
    const body = wrap.querySelector("#dpTabBody"); if (!body) return;
    let tabMap = null;

    function showTab(t) {
      wrap.querySelectorAll(".pf-tab").forEach(b => b.classList.toggle("on", b.dataset.pt === t));
      if (tabMap) { try { tabMap.remove(); } catch (e) { } tabMap = null; }
      if (t === "posts") {
        body.className = "feed-list";
        body.innerHTML = posts.length ? posts.map(p => Feed.card(p, liked.has(p.id))).join("") : `<div class="social-empty"><span class="ee">📝</span>尚無貼文。</div>`;
        body.querySelectorAll(".feed-card").forEach(card => card.addEventListener("click", e => {
          if (e.target.closest(".fc-author") || e.target.closest(".fc-traillink") || e.target.closest(".fc-like") || e.target.closest(".fc-vid")) return;
          if (typeof PostView !== "undefined") PostView.open(card.dataset.id);
        }));
      } else if (t === "photos") {
        body.className = "";
        if (!photos.length) { body.innerHTML = `<div class="social-empty"><span class="ee">📷</span>還沒有相片。</div>`; return; }
        const urls = photos.map(m => Media.publicUrl(m.path));
        body.innerHTML = `<div class="pf-photos">${photos.map((m, idx) => `<div class="pf-ph" data-idx="${idx}"><img loading="lazy" src="${esc(Media.publicUrl(m.thumb_path || m.path))}" alt=""></div>`).join("")}</div>`;
        body.querySelectorAll(".pf-ph").forEach(el => el.addEventListener("click", () => { if (typeof Lightbox !== "undefined") Lightbox.openGallery(urls, +el.dataset.idx); }));
      } else {
        body.className = "";
        const withTrack = posts.filter(p => p.track_thumb && p.track_thumb.length > 1);
        if (!withTrack.length || typeof L === "undefined") { body.innerHTML = `<div class="social-empty"><span class="ee">🗺️</span>還沒有可顯示的路線。</div>`; return; }
        body.innerHTML = `<div class="pf-map" id="pfMap"></div>`;
        setTimeout(() => {
          try {
            tabMap = L.map("pfMap", { zoomControl: false, attributionControl: false });
            (typeof baseTopo === "function" ? baseTopo() : L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")).addTo(tabMap);
            const lines = withTrack.map(p => L.polyline(p.track_thumb.map(c => [c[1], c[0]]), { color: "#c2683d", weight: 3, opacity: .85 }).addTo(tabMap));
            tabMap.fitBounds(L.featureGroup(lines).getBounds(), { padding: [22, 22] });
          } catch (e) { body.innerHTML = `<div class="social-empty">地圖載入失敗。</div>`; }
        }, 60);
      }
    }
    wrap.querySelectorAll(".pf-tab").forEach(b => b.addEventListener("click", () => showTab(b.dataset.pt)));
    showTab("posts");
  }

  // 由 handle 開啟個人頁（@提及點擊用）
  async function openByHandle(handle) {
    const c = Supa.client(); if (!c || !handle) return;
    const { data } = await c.from("profiles").select("id").eq("handle", handle.toLowerCase()).maybeSingle();
    if (data && data.id) openProfile(data.id);
    else if (typeof toast === "function") toast("找不到 @" + handle);
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
  function userRow(p) {
    return `<div class="disc-row" data-id="${p.id}">${p.avatar_url ? `<img class="fc-av" src="${esc(p.avatar_url)}">` : `<div class="fc-av fc-av-ph">${esc((p.display_name || p.handle).slice(0, 1))}</div>`}<div class="disc-id"><b>${esc(p.display_name || p.handle)}${p.pet_level ? ` <span class="lv-chip lvt-${Math.min(p.pet_level,7)}">Lv.${p.pet_level}</span>` : ""}${p.is_premium ? ` <span class="pro-tag">PRO</span>` : ""}</b><span>@${esc(p.handle)}</span></div></div>`;
  }
  // 粉絲 / 追蹤中 名單覆蓋層
  async function openUserList(uid, mode) {
    const title = mode === "followers" ? "粉絲" : "追蹤中";
    const wrap = document.createElement("div"); wrap.className = "pv-mask";
    wrap.innerHTML = `<div class="pv"><div class="pv-head"><button class="comp-x" aria-label="關閉" id="ulX">✕</button><b>${title}</b><span></span></div>
      <div class="pv-body" id="ulBody"><div class="feed-loading"><span class="spin"></span></div></div></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector("#ulX").addEventListener("click", () => wrap.remove());
    const people = mode === "followers" ? await listFollowers(uid) : await listFollowing(uid);
    const body = wrap.querySelector("#ulBody"); if (!body) return;
    body.innerHTML = people.length ? people.map(userRow).join("") : `<div class="social-empty">還沒有${title}。</div>`;
    body.querySelectorAll(".disc-row").forEach(r => r.addEventListener("click", () => { wrap.remove(); openProfile(r.dataset.id); }));
  }

  return { render, openProfile, openByHandle, follow, isFollowing, openUserList };
})();
