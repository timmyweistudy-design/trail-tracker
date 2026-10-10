// 貼文詳情：路線地圖 + 照片/影片 + 按讚 + 表情 + 步道連結 + 作者操作（置頂/編輯/刪除）。留言在 comments.js。
const PostView = (() => {
  const esc = s => Supa.esc(s);
  const T = s => (typeof ttT === "function" ? ttT(s) : s);
  const say = s => { if (typeof toast === "function") toast(T(s)); };

  async function open(postId) {
    if (document.querySelector(`[data-ov="post-${postId}"]`)) return;   // 防連點疊層
    if (typeof ttBusy === "function" && ttBusy("pv-open-" + postId)) return;   // 同步鎖：抓資料的空窗期連點也擋
    // 先把外框和轉圈圈放上去，再去抓資料——以前要等 3～4 個查詢跑完畫面才有反應，點了像沒點到
    const wrap = document.createElement("div");
    wrap.className = "pv-mask"; wrap.dataset.ov = "post-" + postId;
    wrap.innerHTML = `<div class="pv"><div class="pv-head"><button class="comp-x" aria-label="關閉" id="pvX">${ic("x")}</button><b>${T("貼文")}</b><span class="pv-head-r"></span></div>
      <div class="pv-body" id="pvBody"><div class="feed-loading"><span class="spin"></span></div></div></div>`;
    document.body.appendChild(wrap);
    let alive = true, channel = null;
    const c = Supa.client();
    const close = () => {
      alive = false;
      try { if (channel) c.removeChannel(channel); } catch (e) { }
      if (wrap._map) { try { wrap._map.remove(); } catch (e) { } wrap._map = null; }
      wrap.remove();
    };
    wrap._close = close;
    wrap.querySelector("#pvX").addEventListener("click", close);

    const [post, myId, liked] = await Promise.all([Posts.one(postId), Supa.uid(), Posts.likedSet([postId])]);   // 同時抓
    if (!alive) return;
    if (!post) { close(); say("這篇貼文不見了，可能被刪掉了"); return; }
    const isMine = !!(myId && post.author_id === myId);
    wrap.dataset.me = myId || ""; wrap.dataset.author = post.author_id;
    const likeCount = (post.likes && post.likes[0] && post.likes[0].count) || 0;

    // 頂列：收藏、分享、⋯（轉發/置頂/編輯/刪除/檢舉收進去，不再一排 6 顆圖示）
    wrap.querySelector(".pv-head-r").innerHTML = `<button class="comp-x ${Posts.isSaved(postId) ? "on" : ""}" id="pvSave" aria-label="${T("收藏")}">${ic("bookmark")}</button>`
      + `<button class="comp-x" id="pvShare" aria-label="${T("分享")}">${ic("share")}</button>`
      + `<button class="comp-x" id="pvMore" aria-label="${T("更多")}">${ic("more")}</button>`;
    wrap.querySelector(".pv").insertAdjacentHTML("beforeend", `<div class="pv-add"><input id="pvInput" class="auth-input" placeholder="${T("留言…")}" maxlength="1000" enterkeyhint="send"><button class="btn primary" id="pvSend">${T("送出")}</button></div>`);

    wrap.querySelector("#pvSave").addEventListener("click", () => {
      const on = Posts.toggleSaved(postId);
      wrap.querySelector("#pvSave").classList.toggle("on", on);
      say(on ? "收進收藏了" : "從收藏拿掉了");
    });
    wrap.querySelector("#pvShare").addEventListener("click", () => share(post));
    wrap.querySelector("#pvMore").addEventListener("click", async () => {
      const opts = [{ label: T("轉發到我的動態"), value: "repost", cls: "ghost" }];
      if (isMine) opts.push({ label: T(post.pinned ? "取消置頂" : "置頂到個人頁"), value: "pin", cls: "ghost" },
        { label: T("編輯內文"), value: "edit", cls: "ghost" }, { label: T("刪除貼文"), value: "del", cls: "ghost danger" });
      else opts.push({ label: T("檢舉這篇"), value: "report", cls: "ghost" });
      opts.push({ label: T("取消"), value: null, cls: "primary" });
      const act = await ttChoice(T("這篇貼文"), opts);
      if (act === "repost") repost(post, close);
      else if (act === "pin") pin(post);
      else if (act === "edit") edit(post, wrap);
      else if (act === "del") del(post, close);
      else if (act === "report") report(post, close);
    });

    renderBody(wrap, post, liked.has(postId), likeCount);
    if (typeof PostComments !== "undefined") PostComments.mount(wrap, postId);

    // 即時：新留言、讚數變動（等半秒再抓，一次進來很多則時不會連續重抓）
    let tc = null, tl = null;
    channel = c.channel("post-" + postId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments", filter: `post_id=eq.${postId}` }, () => { clearTimeout(tc); tc = setTimeout(() => { if (alive && typeof PostComments !== "undefined") PostComments.load(wrap, postId); }, 500); })
      .on("postgres_changes", { event: "*", schema: "public", table: "likes", filter: `post_id=eq.${postId}` }, () => { clearTimeout(tl); tl = setTimeout(() => { if (alive) refreshLikeCount(wrap, postId); }, 500); })
      .subscribe();
  }

  function share(post) {
    const a = post.author || {};
    const text = `${a.display_name || a.handle || T("山友")}・${post.trail_name || T("自由路線")}${post.distance_km != null ? ` ${(+post.distance_km).toFixed(1)} km` : ""}`;
    const url = Supa.webLink("?post=" + post.id);   // App 裡沒有別人打得開的網址 → 只分享文字
    const full = url ? text + "\n" + url : text;
    // 系統分享叫不出來就複製；剪貼簿也被擋（以前這裡直接報錯、使用者什麼都沒看到）就把文字秀出來讓人自己複製
    const fallback = () => { if (navigator.clipboard) navigator.clipboard.writeText(full).then(() => say("複製好了")).catch(() => ttAlertBox(full)); else ttAlertBox(full); };
    if (navigator.share) navigator.share(url ? { title: "循徑拾光", text, url } : { title: "循徑拾光", text }).catch(e => { if (!e || e.name !== "AbortError") fallback(); });
    else fallback();
  }
  async function repost(post, close) {
    const quote = await ttPrompt(T("轉發這篇（想說點什麼也可以，選填）"), ""); if (quote === null) return;
    if (!ttCleanOk(quote)) return;
    const r = await Posts.createRepost(post, quote.trim());
    if (r.error) { say(Supa.errText(r.error)); return; }
    say("轉發到你的動態了");
    close(); if (typeof SocialUI !== "undefined") SocialUI.refresh();
  }
  async function pin(post) {
    const np = !post.pinned;
    const { error } = await Supa.client().from("posts").update({ pinned: np }).eq("id", post.id);
    if (error) { say(Supa.errText(error.message)); return; }
    post.pinned = np;
    say(np ? "置頂到個人頁了" : "取消置頂了");
  }
  async function edit(post, wrap) {
    const v = await ttPrompt(T("編輯內文"), post.caption || ""); if (v === null) return;
    if (!ttCleanOk(v)) return;
    const { error } = await Supa.client().from("posts").update({ caption: v.trim() || null }).eq("id", post.id);
    if (error) { say(Supa.errText(error.message)); return; }
    post.caption = v.trim();
    const lb = wrap.querySelector("#pvLike");
    renderBody(wrap, post, lb.classList.contains("on"), +lb.querySelector("span").textContent);
    if (typeof PostComments !== "undefined") PostComments.load(wrap, post.id);
    say("改好了");
  }
  async function del(post, close) {
    if (!(await ttConfirm(T("刪掉這篇貼文？留言和讚也會一起不見。"), T("刪除"), T("取消"), { danger: true }))) return;
    const r = await Posts.remove(post.id);
    if (r.error) { say(Supa.errText(r.error)); return; }
    close(); say("刪掉了");
    if (typeof SocialUI !== "undefined") SocialUI.refresh();
  }
  async function report(post, close) {
    const reason = await Safety.pickReason(); if (reason === null) return;
    const rr = await Safety.reportPost(post.id, reason);
    if (rr && rr.error) { say(Supa.errText(rr.error)); return; }   // 沒送出去就別說收到、也別藏貼文
    try { const k = "tt_reported"; const s = new Set(JSON.parse(localStorage.getItem(k) || "[]")); s.add(post.id); localStorage.setItem(k, JSON.stringify([...s])); } catch (e) { }
    say("收到，這篇先幫你藏起來了");
    close();
    if (typeof SocialUI !== "undefined") SocialUI.refresh();
  }

  function renderBody(wrap, post, likedByMe, likeCount) {
    const a = post.author || {};
    const media = (post.post_media || []).slice().sort((x, y) => x.ord - y.ord);
    const trailName = post.trail_id
      ? `<span class="fc-traillink" data-trail="${esc(post.trail_id)}">${ic("mountain")} ${esc(post.trail_name || T("自由路線"))}</span>`
      : `${ic("mountain")} ${esc(post.trail_name || T("自由路線"))}`;
    const rp = Feed.splitRepost(post.caption), cap = rp ? rp.rest : post.caption;
    wrap.querySelector("#pvBody").innerHTML = `
      <div class="fc-name fc-author pv-author" data-uid="${post.author_id}" style="cursor:pointer">${a.avatar_url ? `<img class="fc-av${a.is_premium ? " pro-av" : ""}" src="${esc(a.avatar_url)}" alt="">` : `<div class="fc-av fc-av-ph${a.is_premium ? " pro-av" : ""}">${esc((a.display_name || a.handle || "?").slice(0, 1))}</div>`}<span class="fc-nm">${esc(a.display_name || a.handle || T("山友"))}</span>${a.pet_level ? `<span class="lv-chip lvt-${Math.min(a.pet_level,7)}">Lv.${a.pet_level}</span>` : ""}${a.is_premium ? `<span class="pro-tag pro-id">PRO</span>` : ""}<span class="fc-sub">@${esc(a.handle || "")}</span></div>
      <div class="fc-sub pv-when">${Supa.ago(post.created_at)}</div>
      ${rp ? `<div class="fc-repost">${ic("repeat")} ${T("轉發")}${rp.from ? ` <span class="mention" data-handle="${esc(rp.from)}">@${esc(rp.from)}</span>` : ""}</div>` : ""}
      <div class="fc-trail">${trailName}</div>
      <div class="fc-meta">${Feed.statsHtml(post)}</div>
      ${(post.track && post.track.coordinates && post.track.coordinates.length > 1) ? `<div class="pv-map"></div><button class="btn ghost pv-follow" id="pvFollow">${ic("compass")} ${T("跟著這條路線走")}</button>` : ""}
      ${cap ? `<div class="fc-cap">${Feed.richText(cap)}</div>
      ${ttSameLang(cap) ? "" : `<div class="pv-tr-row"><button class="pv-tr-btn" id="pvTranslate">${ic("translate")} <span>${T("翻譯年糕")}</span></button></div>
      <div class="fc-cap pv-cap-tr" id="pvCapTr" hidden></div>`}` : ""}
      ${media.map(m => {
        if (m.kind === "video") return `<video class="pv-img" controls playsinline preload="metadata" poster="${esc(Media.publicUrl(m.thumb_path || ""))}" src="${esc(Media.publicUrl(m.path))}"></video>`;
        const img = `<img class="pv-img pv-photo" loading="lazy" decoding="async" src="${esc(Media.publicUrl(m.path))}" alt="">`;
        const meta = (m.taken_at || m.km != null)
          ? `<figcaption>${m.taken_at ? new Date(m.taken_at).toLocaleTimeString(ttLocale(), { hour: "2-digit", minute: "2-digit" }) : ""}${m.km != null ? (m.taken_at ? " · " : "") + (+m.km).toFixed(1) + " km" : ""}</figcaption>` : "";
        return meta ? `<figure class="pv-shot">${img}${meta}</figure>` : img;
      }).join("")}
      <div class="pv-actions"><button class="fc-like ${likedByMe ? "on" : ""}" id="pvLike" aria-label="${T("讚")}">${Feed.heart(likedByMe)}<span>${likeCount}</span></button></div>
      <div class="pv-react" id="pvReact"></div>
      <div class="pv-comments" id="pvComments"><div class="feed-loading"><span class="spin"></span></div></div>`;
    loadReactions(wrap, post.id);
    bindLike(wrap, post.id);
    const photoEls = [...wrap.querySelectorAll(".pv-photo")];
    const photoSrcs = photoEls.map(el => el.src);
    photoEls.forEach((el, idx) => el.addEventListener("click", () => { if (typeof Lightbox !== "undefined") Lightbox.openGallery(photoSrcs, idx); }));
    wrap.querySelectorAll("#pvBody > .fc-cap .ht").forEach(b => b.addEventListener("click", () => { if (wrap._close) wrap._close(); Feed.openTag(b.dataset.tag); }));
    wrap.querySelectorAll("#pvBody > .fc-cap .mention, #pvBody > .fc-repost .mention").forEach(b => b.addEventListener("click", () => { if (typeof Discover !== "undefined") Discover.openByHandle(b.dataset.handle); }));
    const au = wrap.querySelector(".fc-author"); if (au) au.addEventListener("click", () => { if (typeof Discover !== "undefined") Discover.openProfile(au.dataset.uid); });
    const tl = wrap.querySelector(".fc-traillink"); if (tl) tl.addEventListener("click", () => { if (typeof window.openDetail === "function") window.openDetail(tl.dataset.trail); });
    const fl = wrap.querySelector("#pvFollow"); if (fl) fl.addEventListener("click", () => {
      const coords = (post.track && post.track.coordinates) ? post.track.coordinates.map(p => [p[1], p[0]]) : [];
      if (wrap._close) wrap._close();   // 走正常關閉流程（清掉地圖/頻道）
      const tab = document.querySelector('.tab[data-view="record"]'); if (tab) tab.click();
      setTimeout(() => { if (typeof window.followRoute === "function") window.followRoute(coords, post.trail_name); }, 250);
    });
    // 翻譯年糕：把內文翻成介面語言（原文保留、翻譯顯示在下方，可收合）
    const trBtn = wrap.querySelector("#pvTranslate");
    if (trBtn) trBtn.addEventListener("click", async () => {
      const out = wrap.querySelector("#pvCapTr"); if (!out) return;
      const lbl = s => { trBtn.innerHTML = `${ic("translate")} <span>${T(s)}</span>`; };   // 圖示一直留著
      if (!out.hidden) { out.hidden = true; lbl("翻譯年糕"); return; }
      if (out.dataset.done) { out.hidden = false; lbl("收合翻譯"); return; }
      trBtn.disabled = true; lbl("翻譯中…");
      const t = await translateText(cap, (typeof ttTrTarget === "function") ? ttTrTarget() : "zh-TW");
      trBtn.disabled = false;
      if (!t) { lbl("翻譯失敗，點此重試"); return; }
      out.textContent = t; out.dataset.done = "1"; out.hidden = false;
      lbl("收合翻譯");
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
    let busy = false;
    const paint = on => { b.classList.toggle("on", on); const h = b.querySelector(".ic-heart"); if (h) h.classList.toggle("on", on); };
    b.addEventListener("click", async () => {
      if (busy) return;                       // 連點會送出多個 insert/delete，回應順序不保證→最後狀態可能與畫面相反
      busy = true;
      const on = !b.classList.contains("on"), span = b.querySelector("span");
      paint(on); span.textContent = Math.max(0, +span.textContent + (on ? 1 : -1));
      if (on && window.ttFloat) window.ttFloat(b, "❤️");
      const r = await Posts.toggleLike(postId, on).catch(e => ({ error: e && e.message }));
      if (r && r.error) { paint(!on); span.textContent = Math.max(0, +span.textContent + (on ? -1 : 1)); say("沒按到，等一下再試"); }
      busy = false;
    });
  }
  // 別人按讚：只更新數字（自己的讚已在畫面上），一個查詢就好
  async function refreshLikeCount(wrap, postId) {
    const b = wrap.querySelector("#pvLike"); if (!b) return;
    b.querySelector("span").textContent = await Posts.likeCount(postId);
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
    const pro = isPro();
    // 平常只放：有人用過的表情（依人數排）＋基本 6 個裡還沒用的；PRO 的 24 個收進「＋」展開（以前一次攤開 30 顆、佔四排）
    const used = Object.keys(counts).sort((x, y) => counts[y] - counts[x]);
    const all = [...new Set([...REACT_EMOJI, ...(pro ? REACT_PRO : [])])];
    const open = !!box.dataset.open;
    const list = open ? [...new Set([...used, ...all])] : [...new Set([...used, ...REACT_EMOJI])];
    const moreN = all.filter(e => !list.includes(e)).length;
    box.innerHTML = list.map(e => `<button class="pv-react-b ${mine === e ? "on" : ""}${REACT_PRO.includes(e) ? " pro" : ""}" data-e="${e}">${e}${counts[e] ? ` <span>${counts[e]}</span>` : ""}</button>`).join("")
      + (moreN ? `<button class="pv-react-more" aria-label="${T("更多表情")}">${ic("plus")}</button>` : (open && pro ? `<button class="pv-react-more on" aria-label="${T("收合")}">${ic("chevron")}</button>` : ""));
    const mb = box.querySelector(".pv-react-more");
    if (mb) mb.addEventListener("click", () => { if (box.dataset.open) delete box.dataset.open; else box.dataset.open = "1"; loadReactions(wrap, postId); });
    let busy = false;
    box.querySelectorAll(".pv-react-b").forEach(b => b.addEventListener("click", async () => {
      if (busy) return; busy = true;
      const e = b.dataset.e;
      if (mine === e) { await Posts.clearReaction(postId); }
      else { const r = await Posts.setReaction(postId, e); if (r && r.error) { busy = false; say("回應沒送出，等一下再試"); return; } if (window.ttFloat) window.ttFloat(b, e); }
      busy = false;
      loadReactions(wrap, postId);
    }));
  }

  // 翻譯內文：共用 i18n.js 的全域 ttTranslate
  function translateText(text, target) { return (typeof ttTranslate === "function") ? ttTranslate(text, target) : Promise.resolve(null); }

  return { open, translateText };
})();
