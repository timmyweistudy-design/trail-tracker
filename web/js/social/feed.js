// 動態牆：渲染好友/探索貼文清單與卡片；按讚切換；點卡片進詳情。
const Feed = (() => {
  const esc = s => Supa.esc(s);
  const fmtAgo = iso => Supa.ago(iso);
  const T = s => (typeof ttT === "function" ? ttT(s) : s);
  // 轉發：舊資料把「🔁 轉發 @誰」寫在內文開頭 → 拆出來另外畫成一行（emoji 在部分裝置是方框，也不能翻譯）
  const REPOST_RE = /^🔁 轉發(?: @([a-z0-9_]{3,20}))?\n?/i;
  function splitRepost(cap) {
    const m = (cap || "").match(REPOST_RE);
    return m ? { from: m[1] || "", rest: cap.slice(m[0].length) } : null;
  }
  // 里程/爬升/星等：「6.42 km · ↑512 m」，星等顯示滿 5 顆（空的淡色）
  function statsHtml(p) {
    const parts = [];
    if (p.distance_km != null) parts.push(`${(+p.distance_km).toFixed(2)} km`);
    if (p.ascent != null) parts.push(`↑${Math.round(p.ascent)} m`);
    const stars = p.rating ? `<span class="fc-rate" aria-label="${p.rating}/5">${"★".repeat(p.rating)}<i>${"★".repeat(5 - p.rating)}</i></span>` : "";
    return (parts.length ? `<span class="fc-stats">${parts.join(" · ")}</span>` : "") + stars;
  }
  function heart(on) { return `<svg class="ic ic-heart${on ? " on" : ""}" viewBox="0 0 24 24">${typeof ICON !== "undefined" ? ICON.heart : ""}</svg>`; }
  function count(arr) { return (arr && arr[0] && arr[0].count) || 0; }
  // 內文：先轉義，再把 #標籤 / @提及 變成可點的連結
  function richText(s) {
    return esc(s || "")
      .replace(/#([^\s#@.,!?；，。、]{1,30})/g, '<span class="ht" data-tag="$1">#$1</span>')
      .replace(/@([a-z0-9_]{3,20})/gi, '<span class="mention" data-handle="$1">@$1</span>')
      .replace(/\n/g, "<br>");
  }
  // 用降取樣的軌跡縮圖畫出路線形狀（純 SVG，不載地圖、很輕）
  function routeSvg(thumb) {
    if (!thumb || thumb.length < 2) return "";
    let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    for (const p of thumb) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
    const w = 100, h = 46, pad = 5, sx = (maxX - minX) || 1e-6, sy = (maxY - minY) || 1e-6;
    const co = thumb.map(p => [pad + (p[0] - minX) / sx * (w - 2 * pad), pad + (1 - (p[1] - minY) / sy) * (h - 2 * pad)]);
    const pts = co.map(c => c[0].toFixed(1) + "," + c[1].toFixed(1)).join(" ");
    const a = co[0], b = co[co.length - 1];
    return `<svg class="fc-route" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">` +
      `<polyline points="${pts}" fill="none" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>` +
      `<circle class="s" cx="${a[0].toFixed(1)}" cy="${a[1].toFixed(1)}" r="2.6"/>` +
      `<circle class="e" cx="${b[0].toFixed(1)}" cy="${b[1].toFixed(1)}" r="2.6"/></svg>`;
  }

  function card(post, liked) {
    const a = post.author || {};
    const pa = a.is_premium ? " pro-av" : "";
    const av = a.avatar_url ? `<img class="fc-av${pa}" src="${esc(a.avatar_url)}" alt="">`
      : `<div class="fc-av fc-av-ph${pa}">${esc((a.display_name || a.handle || "?").slice(0, 1))}</div>`;
    const media = (post.post_media || []).slice().sort((x, y) => x.ord - y.ord);
    const shown = media.slice(0, 4), extra = media.length - 4;
    const imgs = media.length
      ? `<div class="fc-media fc-media-${Math.min(media.length, 4)}">${shown.map((m, idx) => {
          const more = (idx === 3 && extra > 0) ? `<span class="fc-more">+${extra}</span>` : "";
          return m.kind === "video"
            ? `<div class="fc-vid" data-vsrc="${esc(Media.publicUrl(m.path))}"><img loading="lazy" decoding="async" src="${esc(Media.publicUrl(m.thumb_path || ""))}" alt=""><span class="fc-play">▶</span>${more}</div>`
            : `<div class="fc-shot"><img loading="lazy" decoding="async" src="${esc(Media.publicUrl(m.thumb_path || m.path))}" alt="">${m.km != null ? `<span class="fc-shot-km">${(+m.km).toFixed(1)}km</span>` : ""}${more}</div>`;
        }).join("")}</div>` : "";
    // 沒照片的貼文：畫路線形狀（原本 routeSvg 寫好了卻沒用上）
    const route = (!media.length && post.track_thumb) ? routeSvg(post.track_thumb) : "";
    const rp = splitRepost(post.caption), cap = rp ? rp.rest : post.caption;
    const trailName = post.trail_id
      ? `<span class="fc-traillink" data-trail="${esc(post.trail_id)}">${ic("mountain")} ${esc(post.trail_name || "自由路線")}</span>`
      : `${ic("mountain")} ${esc(post.trail_name || "自由路線")}`;
    if (liked == null) liked = !!post._liked;   // 快取裡記著上次的讚，第一眼不會全部變空心再跳回來
    return `<article class="feed-card" data-id="${post.id}">
      <div class="fc-top fc-author" data-uid="${post.author_id}">${av}<div class="fc-who"><div class="fc-name"><span class="fc-nm">${esc(a.display_name || a.handle || "山友")}</span>${a.pet_level ? `<span class="lv-chip lvt-${Math.min(a.pet_level,7)}">Lv.${a.pet_level}</span>` : ""}${a.is_premium ? `<span class="pro-tag pro-id">PRO</span>` : ""}</div>
        <div class="fc-sub">${fmtAgo(post.created_at)}${post.visibility === "friends" ? ` · ${T("好友")}` : ""}</div></div></div>
      ${rp ? `<div class="fc-repost">${ic("repeat")} ${T("轉發")}${rp.from ? ` <span class="mention" data-handle="${esc(rp.from)}">@${esc(rp.from)}</span>` : ""}</div>` : ""}
      <div class="fc-trail">${trailName}</div>
      <div class="fc-meta">${statsHtml(post)}</div>
      ${cap ? `<div class="fc-cap">${richText(cap)}</div>` : ""}
      ${imgs}${route}
      <div class="fc-actions">
        <button class="fc-like ${liked ? "on" : ""}" data-id="${post.id}" aria-label="${T("讚")}">${heart(liked)}<span>${count(post.likes)}</span></button>
        <button class="fc-comment" data-id="${post.id}" aria-label="${T("留言")}">${ic("chat")}<span>${count(post.comments)}</span></button>
      </div>
    </article>`;
  }

  // 載入骨架（取代轉圈圈，減少版面跳動）
  function skeletonCards(n) {
    let s = "";
    for (let k = 0; k < n; k++) s += `<div class="skel-card"><div class="skel skel-av"></div><div class="skel skel-line w60"></div><div class="skel skel-line w90"></div><div class="skel skel-media"></div></div>`;
    return `<div class="skel-list">${s}</div>`;
  }

  let _mode = "friends", _posts = [], _into = null, _gen = 0;
  // 我檢舉過的貼文 → 立即在我的畫面隱藏（伺服器端達門檻會真正隱藏）
  function reportedSet() { try { return new Set(JSON.parse(localStorage.getItem("tt_reported") || "[]")); } catch { return new Set(); } }
  function dropReported(arr) { const r = reportedSet(); return r.size ? arr.filter(p => !r.has(p.id)) : arr; }

  // 上次看到的最新貼文時間（用來插「新動態」分隔線）
  function seenKey(mode) { return "tt_feed_seen_" + mode; }
  function lastSeen(mode) { return localStorage.getItem(seenKey(mode)) || ""; }
  function markSeen(mode, iso) { if (iso) try { localStorage.setItem(seenKey(mode), iso); } catch (e) { } }

  // 離線快取：存下最近一次的動態，下次秒開（再背景更新）
  function cacheKey(mode) { return "tt_feedcache_" + mode; }
  function readCache(mode) { try { return JSON.parse(localStorage.getItem(cacheKey(mode))) || []; } catch { return []; } }
  function writeCache(mode, posts, liked) {
    try { localStorage.setItem(cacheKey(mode), JSON.stringify(posts.slice(0, 20).map(p => Object.assign({}, p, { _liked: !!(liked && liked.has(p.id)) })))); } catch (e) { }
  }
  const box = () => document.getElementById("subBody");

  async function render(renderInto, mode) {
    const g = ++_gen;   // 世代：切分頁/刷新後，舊查詢結果作廢
    _into = renderInto; _mode = mode; _posts = [];
    const cached = readCache(mode);
    if (cached.length) {   // 先用快取秒開，背景再更新
      renderInto(`<div class="feed-list">${cached.map(p => card(p)).join("")}</div>`);
      bindCards(box());
    } else renderInto(skeletonCards(3));
    if (mode === "explore") await loadTrending(g);
    else await loadMore(true, g);
  }

  // 依步道難度過濾（用全域 TRAILS 對照 post.trail_id）
  let _exDiff = 0, _trailMap = null;
  function trailDiff(trailId) {
    if (!trailId || typeof TRAILS === "undefined") return null;
    if (!_trailMap) { _trailMap = new Map(); TRAILS.forEach(t => _trailMap.set(String(t.id), t.difficulty)); }
    return _trailMap.get(String(trailId)) ?? null;
  }
  const DIFFS = [[0, "全部"], [1, "輕鬆"], [2, "一般"], [3, "進階"], [4, "挑戰"]];

  async function loadTrending(g) {
    if (g == null) g = _gen;
    // 難度篩選交給 trending 在排序前做（原本先取 30 篇再篩，常常篩到只剩 0～2 篇）
    const want = _exDiff ? (p => { const d = trailDiff(p.trail_id); return _exDiff === 4 ? (d >= 4) : d === _exDiff; }) : null;
    const batch = dropReported(await Posts.trending(want));
    if (g !== _gen) return;
    _posts = batch;
    const refresh = `<button class="feed-refresh" id="feedRefresh">${ic("refresh")} ${T("重新整理")}</button>`;
    const diffRow = `<div class="ex-diff">${DIFFS.map(([v, l]) => `<button class="ex-diff-b ${v === _exDiff ? "on" : ""}" data-d="${v}">${l}</button>`).join("")}</div>`;
    const wireCommon = () => {
      wireRefresh();
      document.querySelectorAll(".ex-diff-b").forEach(b => b.addEventListener("click", () => { _exDiff = +b.dataset.d; loadTrending(); }));
    };
    if (!_posts.length) {
      _into(`${refresh}<div class="feed-trending-h">${ic("flame")} ${T("熱門趨勢")}</div>${diffRow}<div class="social-empty"><span class="ee">${ic("mountain")}</span>${_exDiff ? T("這個難度還沒有公開貼文。") : T("目前還沒有公開貼文。")}</div>`);
      wireCommon(); return;
    }
    const [liked, hot] = await Promise.all([Posts.likedSet(_posts.map(p => p.id)), Posts.hotTags(10)]);   // 兩個查詢同時跑
    if (g !== _gen) return;
    const hotRow = hot.length ? `<div class="hot-tags">${hot.map(h => `<button class="hot-tag" data-tag="${esc(h.tag)}">#${esc(h.tag)}</button>`).join("")}</div>` : "";
    _into(`${refresh}<div class="feed-trending-h">${ic("flame")} ${T("熱門趨勢")}</div>${hotRow}${diffRow}<div class="feed-list">${_posts.map(p => card(p, liked.has(p.id))).join("")}</div>`);
    bindCards(box()); wireCommon(); writeCache(_mode, _posts, liked);
    document.querySelectorAll(".hot-tag").forEach(b => b.addEventListener("click", () => openTag(b.dataset.tag)));
  }

  async function loadMore(first, g) {
    if (g == null) g = _gen;
    const before = (!first && _posts.length) ? _posts[_posts.length - 1].created_at : null;
    const raw = await Posts.feed(_mode, before);
    if (g !== _gen) return;   // 已切到別的分頁/刷新 → 丟棄
    const batch = dropReported(raw);
    const refresh = `<button class="feed-refresh" id="feedRefresh">${ic("refresh")} ${T("重新整理")}</button>`;
    const moreBtn = raw.length >= 20 ? `<button class="btn ghost" id="feedMore">${T("載入更多")}</button>` : "";   // 用過濾前的數量判斷還有沒有下一頁
    if (!first) {   // 載入更多：只把新的接在後面，不重畫整串（原本整串重畫，圖片全部重載、捲動位置會跳）
      const old = _posts.map(p => p.id);
      _posts = _posts.concat(batch);
      const liked = await Posts.likedSet(batch.map(p => p.id));
      if (g !== _gen) return;
      const list = document.querySelector("#subBody .feed-list"), mb = document.getElementById("feedMore");
      if (list) list.insertAdjacentHTML("beforeend", batch.filter(p => !old.includes(p.id)).map(p => card(p, liked.has(p.id))).join(""));
      if (mb) { if (moreBtn) { mb.disabled = false; mb.textContent = T("載入更多"); } else mb.remove(); }
      bindCards(box());
      return;
    }
    _posts = batch;
    if (!_posts.length) {
      _into(`${refresh}<div class="social-empty"><span class="ee">${ic("users")}</span>${T("追蹤山友後，這裡會出現他們的步道旅行（你自己的也會在這）。")}<br><button class="btn primary feed-find" id="feedFind">${ic("search")} ${T("去找山友")}</button></div>`);
      wireRefresh();
      const ff = document.getElementById("feedFind"); if (ff) ff.addEventListener("click", () => { if (typeof SocialUI !== "undefined" && SocialUI.go) SocialUI.go("search"); });
      return;
    }
    const liked = await Posts.likedSet(_posts.map(p => p.id));
    if (g !== _gen) return;
    const more = moreBtn;
    // 新動態分隔線：比上次看到還新的貼文歸為「新」
    const seen = first ? lastSeen(_mode) : "__skip__";
    let newCount = 0;
    if (first && seen) newCount = _posts.filter(p => p.created_at > seen).length;
    const items = _posts.map((p, i) => {
      const div = (first && newCount && i === newCount) ? `<div class="feed-divider">${T("以上是新的")}</div>` : "";
      return div + card(p, liked.has(p.id));
    }).join("");
    _into(`${refresh}<div class="feed-list">${items}</div>${more}`);
    bindCards(box()); wireRefresh();
    writeCache(_mode, _posts, liked);
    if (_posts.length) markSeen(_mode, _posts[0].created_at);   // 記住這次最新
    const mb = document.getElementById("feedMore"); if (mb) mb.addEventListener("click", () => { mb.disabled = true; mb.innerHTML = `<span class="spin"></span>`; loadMore(false); });
  }

  function wireRefresh() {
    const rb = document.getElementById("feedRefresh"); if (rb) rb.addEventListener("click", () => render(_into, _mode));
  }

  // 綁定一批貼文卡片的互動（讚、留言、作者、步道、影片、#標籤、@提及、點卡片看詳情）。
  // 動態牆、個人頁、收藏、#標籤、別人的個人頁都用這一個——以前只有動態牆有綁，其他地方按讚沒反應、影片放不出來。
  // 只綁 root 裡「還沒綁過」的元素，所以載入更多後可以再呼叫一次。
  function bindCards(root) {
    if (!root) return;
    const once = (sel, ev, fn) => root.querySelectorAll(sel).forEach(el => { if (el._tb) return; el._tb = 1; el.addEventListener(ev, fn); });
    once(".feed-card .fc-like", "click", async function (e) {
      e.stopPropagation();
      const b = this; if (b._busy) return;   // 連點會送出多個 insert/delete，回應順序不保證
      b._busy = true;
      const on = !b.classList.contains("on"), span = b.querySelector("span");
      const paint = v => { b.classList.toggle("on", v); const h = b.querySelector(".ic-heart"); if (h) h.classList.toggle("on", v); };
      paint(on); span.textContent = Math.max(0, +span.textContent + (on ? 1 : -1));
      if (on && window.ttFloat) window.ttFloat(b, "❤️");
      const r = await Posts.toggleLike(b.dataset.id, on).catch(e2 => ({ error: e2 && e2.message }));
      if (r && r.error) { paint(!on); span.textContent = Math.max(0, +span.textContent + (on ? -1 : 1)); if (typeof toast === "function") toast(T("沒按到，等一下再試")); }
      b._busy = false;
    });
    const openDetail = id => { if (typeof PostView !== "undefined") PostView.open(id); };
    once(".feed-card .fc-comment", "click", function (e) { e.stopPropagation(); openDetail(this.dataset.id); });
    once(".feed-card .fc-author", "click", function (e) { e.stopPropagation(); if (typeof Discover !== "undefined") Discover.openProfile(this.dataset.uid); });
    once(".feed-card .fc-traillink", "click", function (e) { e.stopPropagation(); if (typeof window.openDetail === "function") window.openDetail(this.dataset.trail); });
    once(".feed-card .fc-vid", "click", function (e) {
      e.stopPropagation();
      const src = this.dataset.vsrc; if (!src) return;
      this.innerHTML = `<video controls autoplay playsinline preload="metadata" src="${esc(src)}"></video>`;
    });
    once(".feed-card .ht", "click", function (e) { e.stopPropagation(); openTag(this.dataset.tag); });
    once(".feed-card .mention", "click", function (e) { e.stopPropagation(); if (typeof Discover !== "undefined") Discover.openByHandle(this.dataset.handle); });
    once(".feed-card", "click", function () { openDetail(this.dataset.id); });
  }

  // #標籤 動態：列出含此標籤的公開貼文
  async function openTag(tag) {
    if (document.querySelector(`[data-ov="tag-${CSS.escape(tag)}"]`)) return;   // 防連點疊層
    const wrap = document.createElement("div"); wrap.className = "pv-mask"; wrap.dataset.ov = "tag-" + tag;   // data-ov：全域 Esc 會關它
    wrap.innerHTML = `<div class="pv"><div class="pv-head"><button class="comp-x" id="tagX" aria-label="關閉">${ic("x")}</button><b>#${esc(tag)}</b><span></span></div>
      <div class="pv-body" id="tagBody"><div class="feed-loading"><span class="spin"></span></div></div></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector("#tagX").addEventListener("click", () => wrap.remove());
    const posts = await Posts.byTag(tag);
    const body = wrap.querySelector("#tagBody"); if (!body) return;
    if (!posts.length) { body.innerHTML = `<div class="social-empty">${T("還沒有這個標籤的公開貼文。")}</div>`; return; }
    const liked = await Posts.likedSet(posts.map(p => p.id));
    body.className = "pv-body feed-list";
    body.innerHTML = posts.map(p => card(p, liked.has(p.id))).join("");
    bindCards(body);
  }

  return { render, card, bindCards, richText, openTag, splitRepost, statsHtml, heart, _fmtAgo: fmtAgo };
})();
