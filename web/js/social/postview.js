// 貼文詳情：路線地圖 + 照片/影片 + 按讚 + 留言(Realtime) + 步道連結 + 作者編輯/刪文/刪留言。
const PostView = (() => {
  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }

  async function open(postId) {
    const post = await Posts.one(postId);
    if (!post) { if (typeof toast === "function") toast("貼文不存在或無權限"); return; }
    const c = Supa.client();
    const { data: u } = await c.auth.getUser();
    const myId = u && u.user ? u.user.id : "";
    const isMine = myId && post.author_id === myId;
    const likeCount = (post.likes && post.likes[0] && post.likes[0].count) || 0;
    const likedByMe = (await Posts.likedSet([postId])).has(postId);

    const wrap = document.createElement("div");
    wrap.className = "pv-mask";
    wrap.dataset.me = myId; wrap.dataset.author = post.author_id;
    wrap.innerHTML = `<div class="pv"><div class="pv-head"><button class="comp-x" aria-label="關閉" id="pvX">✕</button><b>貼文</b><span class="pv-head-r"><button class="comp-x ${Posts.isSaved(postId) ? "on" : ""}" id="pvSave" title="收藏" aria-label="收藏">${ic("bookmark")}</button><button class="comp-x" id="pvRepost" title="轉發" aria-label="轉發">${ic("repeat")}</button><button class="comp-x" id="pvShare" title="分享" aria-label="分享">${ic("share")}</button>${isMine ? `<button class="comp-x ${post.pinned ? "on" : ""}" id="pvPin" title="置頂" aria-label="置頂">${ic("pin")}</button><button class="comp-x" id="pvEdit" title="編輯" aria-label="編輯">${ic("pencil")}</button><button class="comp-x" id="pvDel" title="刪除" aria-label="刪除">${ic("trash")}</button>` : ""}</span></div>
      <div class="pv-body" id="pvBody"></div>
      <div class="pv-add"><input id="pvInput" class="auth-input" placeholder="留言…" maxlength="1000"><button class="btn primary" id="pvSend">送出</button></div></div>`;
    document.body.appendChild(wrap);

    const channel = c.channel("post-" + postId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments", filter: `post_id=eq.${postId}` }, () => loadComments(wrap, postId))
      .on("postgres_changes", { event: "*", schema: "public", table: "likes", filter: `post_id=eq.${postId}` }, () => refreshLikes(wrap, postId))
      .subscribe();
    const close = () => { try { c.removeChannel(channel); } catch (e) { } if (wrap._map) { try { wrap._map.remove(); } catch (e) { } wrap._map = null; } wrap.remove(); };
    wrap.querySelector("#pvX").addEventListener("click", close);
    wrap.querySelector("#pvSave").addEventListener("click", () => {
      const on = Posts.toggleSaved(postId);
      wrap.querySelector("#pvSave").classList.toggle("on", on);
      if (typeof toast === "function") toast(on ? "已收藏" : "已取消收藏");
    });
    wrap.querySelector("#pvRepost").addEventListener("click", async () => {
      const quote = prompt("轉發這篇貼文（可加上你的想法，選填）：", ""); if (quote === null) return;
      const r = await Posts.createRepost(post, quote.trim());
      if (r.error) { if (typeof toast === "function") toast("轉發失敗：" + r.error); return; }
      if (typeof toast === "function") toast("已轉發到你的動態");
      close(); if (typeof SocialUI !== "undefined") SocialUI.route();
    });
    wrap.querySelector("#pvShare").addEventListener("click", () => {
      const url = location.origin + location.pathname + "?post=" + postId;
      if (navigator.share) navigator.share({ title: "循徑拾光 · 步道旅行", url }).catch(() => { });
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(() => { if (typeof toast === "function") toast("已複製貼文連結"); });
      else if (typeof toast === "function") toast(url);
    });

    if (isMine) {
      wrap.querySelector("#pvPin").addEventListener("click", async () => {
        const np = !post.pinned;
        const { error } = await c.from("posts").update({ pinned: np }).eq("id", postId);
        if (error) { if (typeof toast === "function") toast("置頂失敗：" + error.message); return; }
        post.pinned = np; wrap.querySelector("#pvPin").classList.toggle("on", np);
        if (typeof toast === "function") toast(np ? "已置頂到個人頁" : "已取消置頂");
      });
      wrap.querySelector("#pvDel").addEventListener("click", async () => {
        if (!confirm("確定刪除這篇貼文？")) return;
        const r = await Posts.remove(postId);
        if (r.error) { if (typeof toast === "function") toast("刪除失敗：" + r.error); return; }
        close(); if (typeof toast === "function") toast("已刪除");
        if (typeof SocialUI !== "undefined") SocialUI.route();
      });
      wrap.querySelector("#pvEdit").addEventListener("click", async () => {
        const v = prompt("編輯內文：", post.caption || ""); if (v === null) return;
        const { error } = await c.from("posts").update({ caption: v.trim() || null }).eq("id", postId);
        if (error) { if (typeof toast === "function") toast("更新失敗：" + error.message); return; }
        post.caption = v.trim();
        const lb = wrap.querySelector("#pvLike");
        renderBody(wrap, post, lb.classList.contains("on"), +lb.querySelector("span").textContent, isMine);
        bindLike(wrap, postId); loadComments(wrap, postId);
      });
    }

    renderBody(wrap, post, likedByMe, likeCount, isMine);
    bindLike(wrap, postId);
    if (typeof Autocomplete !== "undefined") Autocomplete.attach(wrap.querySelector("#pvInput"));
    wrap.querySelector("#pvSend").addEventListener("click", () => send(wrap, postId));
    loadComments(wrap, postId);
  }

  function renderBody(wrap, post, likedByMe, likeCount, isMine) {
    const a = post.author || {};
    const media = (post.post_media || []).slice().sort((x, y) => x.ord - y.ord);
    const trailName = post.trail_id
      ? `<span class="fc-traillink" data-trail="${esc(post.trail_id)}">${ic("mountain")} ${esc(post.trail_name || "自由路線")}</span>`
      : `${ic("mountain")} ${esc(post.trail_name || "自由路線")}`;
    wrap.querySelector("#pvBody").innerHTML = `
      <div class="fc-name fc-author" data-uid="${post.author_id}" style="cursor:pointer">${esc(a.display_name || a.handle || "山友")}${a.pet_level ? ` <span class="lv-chip lvt-${Math.min(a.pet_level,7)}">Lv.${a.pet_level}</span>` : ""}${a.is_premium ? ` <span class="pro-tag">PRO</span>` : ""} <span class="fc-sub">@${esc(a.handle || "")}</span></div>
      <div class="fc-trail">${trailName}　<span class="fc-stats">${post.distance_km != null ? post.distance_km.toFixed(2) + "km" : ""}${post.ascent != null ? "　↑" + post.ascent + "m" : ""}</span>${post.rating ? ` <span class="fc-rate">${"★".repeat(post.rating)}</span>` : ""}</div>
      ${(post.track && post.track.coordinates && post.track.coordinates.length > 1) ? `<div class="pv-map"></div><button class="btn ghost pv-follow" id="pvFollow">${ic("compass")} 跟著這條路線走</button>` : ""}
      ${post.caption ? `<div class="fc-cap">${(typeof Feed !== "undefined" && Feed.richText) ? Feed.richText(post.caption) : esc(post.caption)}</div>` : ""}
      ${media.map(m => {
        if (m.kind === "video") return `<video class="pv-img" controls preload="metadata" poster="${esc(Media.publicUrl(m.thumb_path || ""))}" src="${esc(Media.publicUrl(m.path))}"></video>`;
        const img = `<img class="pv-img pv-photo" loading="lazy" src="${esc(Media.publicUrl(m.path))}" alt="">`;
        const meta = (m.taken_at || m.km != null)
          ? `<figcaption>${m.taken_at ? new Date(m.taken_at).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" }) : ""}${m.km != null ? (m.taken_at ? " · " : "") + (+m.km).toFixed(2) + "km" : ""}</figcaption>` : "";
        return meta ? `<figure class="pv-shot">${img}${meta}</figure>` : img;
      }).join("")}
      <div class="pv-actions"><button class="fc-like ${likedByMe ? "on" : ""}" id="pvLike">${likedByMe ? "❤️" : "🤍"} <span>${likeCount}</span></button>${isMine ? "" : `<button class="link-btn" id="pvReport">檢舉</button>`}</div>
      <div class="pv-react" id="pvReact"></div>
      <div class="pv-comments" id="pvComments"><div class="feed-loading"><span class="spin"></span></div></div>`;
    loadReactions(wrap, post.id);
    const photoEls = [...wrap.querySelectorAll(".pv-photo")];
    const photoSrcs = photoEls.map(el => el.src);
    photoEls.forEach((el, idx) => el.addEventListener("click", () => { if (typeof Lightbox !== "undefined") Lightbox.openGallery(photoSrcs, idx); }));
    wrap.querySelectorAll(".fc-cap .ht").forEach(b => b.addEventListener("click", () => { const x = wrap.querySelector("#pvX"); if (x) x.click(); if (typeof Feed !== "undefined") Feed.openTag(b.dataset.tag); }));
    wrap.querySelectorAll(".fc-cap .mention").forEach(b => b.addEventListener("click", () => { if (typeof Discover !== "undefined") Discover.openByHandle(b.dataset.handle); }));
    const au = wrap.querySelector(".fc-author"); if (au) au.addEventListener("click", () => { if (typeof Discover !== "undefined") Discover.openProfile(au.dataset.uid); });
    const tl = wrap.querySelector(".fc-traillink"); if (tl) tl.addEventListener("click", () => { if (typeof window.openDetail === "function") window.openDetail(tl.dataset.trail); });
    const fl = wrap.querySelector("#pvFollow"); if (fl) fl.addEventListener("click", () => {
      const coords = (post.track && post.track.coordinates) ? post.track.coordinates.map(p => [p[1], p[0]]) : [];
      const x = wrap.querySelector("#pvX"); if (x) x.click(); else wrap.remove();   // 走正常關閉流程（清掉地圖/頻道）
      const tab = document.querySelector('.tab[data-view="record"]'); if (tab) tab.click();
      setTimeout(() => { if (typeof window.followRoute === "function") window.followRoute(coords); }, 250);
    });
    const rep = wrap.querySelector("#pvReport"); if (rep) rep.addEventListener("click", async () => {
      const reason = await Safety.pickReason(); if (reason === null) return;
      await Safety.reportPost(post.id, reason);
      try { const k = "tt_reported"; const s = new Set(JSON.parse(localStorage.getItem(k) || "[]")); s.add(post.id); localStorage.setItem(k, JSON.stringify([...s])); } catch (e) { }
      if (typeof toast === "function") toast("已檢舉並隱藏，感謝回報");
      const x = wrap.querySelector("#pvX"); if (x) x.click();
      if (typeof SocialUI !== "undefined") SocialUI.route();
    });
    // 路線地圖
    const mapEl = wrap.querySelector(".pv-map");
    if (mapEl && post.track && post.track.coordinates && typeof L !== "undefined") {
      const coords = post.track.coordinates.map(p => [p[1], p[0]]);
      setTimeout(() => {
        try {
          if (wrap._map) { try { wrap._map.remove(); } catch (e) { } }
          const map = L.map(mapEl, { zoomControl: false, attributionControl: false, scrollWheelZoom: false });
          wrap._map = map;
          (typeof baseTopo === "function" ? baseTopo() : L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png")).addTo(map);
          const line = L.polyline(coords, { color: "#c2683d", weight: 4 }).addTo(map);
          map.fitBounds(line.getBounds(), { padding: [18, 18] });
        } catch (e) { /* */ }
      }, 60);
    }
  }

  function bindLike(wrap, postId) {
    const b = wrap.querySelector("#pvLike"); if (!b) return;
    b.addEventListener("click", async () => {
      const on = !b.classList.contains("on");
      b.classList.toggle("on", on);
      const span = b.querySelector("span"); span.textContent = Math.max(0, +span.textContent + (on ? 1 : -1));
      b.firstChild.textContent = on ? "❤️ " : "🤍 ";
      if (on && window.ttFloat) window.ttFloat(b, "❤️");
      await Posts.toggleLike(postId, on);
    });
  }

  async function refreshLikes(wrap, postId) {
    const b = wrap.querySelector("#pvLike"); if (!b) return;
    const count = await Posts.likeCount(postId);
    const liked = (await Posts.likedSet([postId])).has(postId);
    b.classList.toggle("on", liked);
    b.querySelector("span").textContent = count;
    b.firstChild.textContent = liked ? "❤️ " : "🤍 ";
  }

  // 表情回應列（需 phase11；無資料則只顯示可點的表情）
  const REACT_EMOJI = ["❤️", "👍", "🔥", "😮", "💪", "😂"];
  const REACT_PRO = ["🥰", "🤩", "😍", "😎", "🥳", "😆", "🤗", "😲", "😅", "🫡", "😤", "🥹",
    "🏔️", "🦌", "⛺", "🌟", "🐻", "🦅", "🍂", "❄️", "🌄", "🥾", "🌲", "🏕️"];   // PRO 專屬反應：臉部表情＋山林系
  async function loadReactions(wrap, postId) {
    const box = wrap.querySelector("#pvReact"); if (!box) return;
    const rows = await Posts.reactions(postId);
    const myId = wrap.dataset.me;
    const counts = {}; let mine = null;
    for (const r of rows) { counts[r.emoji] = (counts[r.emoji] || 0) + 1; if (r.user_id === myId) mine = r.emoji; }
    const pro = (typeof Premium !== "undefined") && Premium.isOn();
    // 顯示：基本表情 +（會員才有的）PRO 表情 + 任何已被使用過的表情
    const list = [...new Set([...REACT_EMOJI, ...(pro ? REACT_PRO : []), ...rows.map(r => r.emoji)])];
    box.innerHTML = list.map(e => `<button class="pv-react-b ${mine === e ? "on" : ""}${REACT_PRO.includes(e) ? " pro" : ""}" data-e="${e}">${e}${counts[e] ? ` <span>${counts[e]}</span>` : ""}</button>`).join("");
    box.querySelectorAll(".pv-react-b").forEach(b => b.addEventListener("click", async () => {
      const e = b.dataset.e;
      if (mine === e) { await Posts.clearReaction(postId); }
      else { const r = await Posts.setReaction(postId, e); if (r && r.error) { if (typeof toast === "function") toast("回應失敗，請先更新資料庫"); return; } if (window.ttFloat) window.ttFloat(b, e); }
      loadReactions(wrap, postId);
    }));
  }

  function cmName(cm) { return esc((cm.author && (cm.author.display_name || cm.author.handle)) || "山友"); }
  function cmBody(b) { return (typeof Feed !== "undefined" && Feed.richText) ? Feed.richText(b) : esc(b); }

  async function loadComments(wrap, postId) {
    const c = Supa.client();
    const me = wrap.dataset.me, postAuthor = wrap.dataset.author;
    let data, threaded = true;
    let res = await c.from("comments")
      .select("id, body, author_id, parent_id, created_at, author:profiles!comments_author_profile_fk(handle, display_name)")
      .eq("post_id", postId).order("created_at", { ascending: true }).limit(300);
    if (res.error) {   // phase11 未跑（無 parent_id）→ 退回基本留言
      threaded = false;
      res = await c.from("comments")
        .select("id, body, author_id, created_at, author:profiles!comments_author_profile_fk(handle, display_name)")
        .eq("post_id", postId).order("created_at", { ascending: true }).limit(300);
    }
    data = res.data || [];
    const box = wrap.querySelector("#pvComments"); if (!box) return;
    if (!data.length) { box.innerHTML = `<div class="social-empty">還沒有留言，當第一個。</div>`; return; }

    const cl = await Posts.commentLikes(data.map(cm => cm.id));
    const tops = threaded ? data.filter(cm => !cm.parent_id) : data;
    const childrenOf = id => threaded ? data.filter(cm => cm.parent_id === id) : [];
    const row = (cm, isReply) => {
      const canDel = cm.author_id === me || postAuthor === me;
      const n = cl.counts[cm.id] || 0, liked = cl.mine.has(cm.id);
      return `<div class="pv-cm ${isReply ? "pv-cm-reply" : ""}" data-id="${cm.id}">
        <div class="pv-cm-main"><b>${cmName(cm)}</b> ${cmBody(cm.body)}</div>
        <div class="pv-cm-act">
          <button class="cm-like ${liked ? "on" : ""}" data-id="${cm.id}">${liked ? "❤️" : "🤍"}<span>${n || ""}</span></button>
          ${!isReply ? `<button class="cm-reply" data-id="${cm.id}" data-name="${cmName(cm)}">回覆</button>` : ""}
          ${canDel ? `<button class="cm-del" data-id="${cm.id}" aria-label="刪除">✕</button>` : ""}
        </div></div>`;
    };
    box.innerHTML = tops.map(cm => row(cm, false) + childrenOf(cm.id).map(r => row(r, true)).join("")).join("");

    box.querySelectorAll(".cm-del").forEach(b => b.addEventListener("click", async () => {
      await c.from("comments").delete().eq("id", b.dataset.id); loadComments(wrap, postId);
    }));
    box.querySelectorAll(".cm-like").forEach(b => b.addEventListener("click", async () => {
      const on = !b.classList.contains("on");
      b.classList.toggle("on", on); b.firstChild.textContent = on ? "❤️" : "🤍";
      const span = b.querySelector("span"); span.textContent = Math.max(0, (+span.textContent || 0) + (on ? 1 : -1)) || "";
      await Posts.toggleCommentLike(b.dataset.id, on);
    }));
    box.querySelectorAll(".cm-reply").forEach(b => b.addEventListener("click", () => setReplyTarget(wrap, b.dataset.id, b.dataset.name)));
    box.querySelectorAll(".pv-cm .mention").forEach(b => b.addEventListener("click", () => { if (typeof Discover !== "undefined") Discover.openByHandle(b.dataset.handle); }));
    box.querySelectorAll(".pv-cm .ht").forEach(b => b.addEventListener("click", () => { const x = wrap.querySelector("#pvX"); if (x) x.click(); if (typeof Feed !== "undefined") Feed.openTag(b.dataset.tag); }));
  }

  function setReplyTarget(wrap, parentId, name) {
    wrap.dataset.reply = parentId || "";
    const add = wrap.querySelector(".pv-add"); if (!add) return;
    let hint = wrap.querySelector("#pvReplyHint");
    if (parentId) {
      if (!hint) { hint = document.createElement("div"); hint.id = "pvReplyHint"; hint.className = "pv-reply-hint"; add.parentNode.insertBefore(hint, add); }
      hint.innerHTML = `回覆 <b>${esc(name || "")}</b> <button id="pvReplyX">✕</button>`;
      hint.querySelector("#pvReplyX").addEventListener("click", () => setReplyTarget(wrap, "", ""));
      const input = wrap.querySelector("#pvInput"); if (input) input.focus();
    } else if (hint) hint.remove();
  }

  async function send(wrap, postId) {
    const input = wrap.querySelector("#pvInput"); const body = input.value.trim();
    if (!body) return;
    const c = Supa.client(); const { data: u } = await c.auth.getUser(); if (!u || !u.user) { alert("請先登入"); return; }
    const parent = wrap.dataset.reply || null;
    input.disabled = true;
    const rec = { post_id: postId, author_id: u.user.id, body };
    if (parent) rec.parent_id = parent;
    let { error } = await c.from("comments").insert(rec);
    if (error && parent) { delete rec.parent_id; ({ error } = await c.from("comments").insert(rec)); }   // 無 parent_id 欄位→當一般留言
    input.disabled = false;
    if (error) { if (typeof toast === "function") toast("留言失敗：" + error.message); return; }
    input.value = ""; setReplyTarget(wrap, "", ""); Posts.notifyMentions(body, postId); loadComments(wrap, postId);
  }

  return { open };
})();
