// 動態牆：渲染好友/探索貼文清單與卡片；按讚切換；點卡片進詳情。
const Feed = (() => {
  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }
  function fmtAgo(iso) {
    const d = (Date.now() - new Date(iso).getTime()) / 1000;
    if (d < 60) return "剛剛"; if (d < 3600) return Math.floor(d / 60) + " 分鐘前";
    if (d < 86400) return Math.floor(d / 3600) + " 小時前"; return Math.floor(d / 86400) + " 天前";
  }
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
    const av = a.avatar_url ? `<img class="fc-av" src="${esc(a.avatar_url)}" alt="">`
      : `<div class="fc-av fc-av-ph">${esc((a.display_name || a.handle || "?").slice(0, 1))}</div>`;
    const media = (post.post_media || []).slice().sort((x, y) => x.ord - y.ord);
    const shown = media.slice(0, 4), extra = media.length - 4;
    const imgs = media.length
      ? `<div class="fc-media fc-media-${Math.min(media.length, 4)}">${shown.map((m, idx) => {
          const more = (idx === 3 && extra > 0) ? `<span class="fc-more">+${extra}</span>` : "";
          return m.kind === "video"
            ? `<div class="fc-vid" data-vsrc="${esc(Media.publicUrl(m.path))}"><img loading="lazy" src="${esc(Media.publicUrl(m.thumb_path || ""))}" alt=""><span class="fc-play">▶</span>${more}</div>`
            : `<div class="fc-shot"><img loading="lazy" src="${esc(Media.publicUrl(m.thumb_path || m.path))}" alt="">${m.km != null ? `<span class="fc-shot-km">${(+m.km).toFixed(1)}km</span>` : ""}${more}</div>`;
        }).join("")}</div>` : "";
    const stats = `${(post.distance_km != null ? post.distance_km.toFixed(2) + "km" : "")}${post.ascent != null ? "　↑" + post.ascent + "m" : ""}`;
    const trailName = post.trail_id
      ? `<span class="fc-traillink" data-trail="${esc(post.trail_id)}">${ic("mountain")} ${esc(post.trail_name || "自由路線")}</span>`
      : `${ic("mountain")} ${esc(post.trail_name || "自由路線")}`;
    return `<article class="feed-card" data-id="${post.id}">
      <div class="fc-top fc-author" data-uid="${post.author_id}">${av}<div><div class="fc-name">${esc(a.display_name || a.handle || "山友")}${a.pet_level ? ` <span class="lv-chip lvt-${Math.min(a.pet_level,7)}">Lv.${a.pet_level}</span>` : ""}${a.is_premium ? ` <span class="pro-tag">PRO</span>` : ""}</div>
        <div class="fc-sub">${fmtAgo(post.created_at)}${post.visibility === "friends" ? " · 好友" : ""}</div></div></div>
      <div class="fc-trail">${trailName}　<span class="fc-stats">${stats}</span>${post.rating ? ` <span class="fc-rate">${"★".repeat(post.rating)}</span>` : ""}</div>
      ${routeSvg(post.track_thumb)}
      ${post.caption ? `<div class="fc-cap">${richText(post.caption)}</div>` : ""}
      ${imgs}
      <div class="fc-actions">
        <button class="fc-like ${liked ? "on" : ""}" data-id="${post.id}">${liked ? "❤️" : "🤍"} <span>${count(post.likes)}</span></button>
        <button class="fc-comment" data-id="${post.id}">${ic("chat")} ${count(post.comments)}</button>
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
  function writeCache(mode, posts) { try { localStorage.setItem(cacheKey(mode), JSON.stringify(posts.slice(0, 20))); } catch (e) { } }

  async function render(renderInto, mode) {
    const g = ++_gen;   // 世代：切分頁/刷新後，舊查詢結果作廢
    _into = renderInto; _mode = mode; _posts = [];
    const cached = readCache(mode);
    if (cached.length) {   // 先用快取秒開，背景再更新
      renderInto(`<div class="feed-list">${cached.map(p => card(p, false)).join("")}</div>`);
      bind();
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
    let batch = dropReported(await Posts.trending());
    if (g !== _gen) return;
    if (_exDiff) batch = batch.filter(p => { const d = trailDiff(p.trail_id); return _exDiff === 4 ? (d >= 4) : d === _exDiff; });
    _posts = batch;
    const refresh = `<button class="feed-refresh" id="feedRefresh">${ic("refresh")} 重新整理</button>`;
    const diffRow = `<div class="ex-diff">${DIFFS.map(([v, l]) => `<button class="ex-diff-b ${v === _exDiff ? "on" : ""}" data-d="${v}">${l}</button>`).join("")}</div>`;
    const wireCommon = () => {
      wireRefresh();
      document.querySelectorAll(".ex-diff-b").forEach(b => b.addEventListener("click", () => { _exDiff = +b.dataset.d; loadTrending(); }));
    };
    if (!_posts.length) {
      _into(`${refresh}<div class="feed-trending-h">${ic("flame")} 熱門趨勢</div>${diffRow}<div class="social-empty"><span class="ee">🏔️</span>${_exDiff ? "這個難度還沒有公開貼文。" : "目前還沒有公開貼文。"}</div>`);
      wireCommon(); return;
    }
    const liked = await Posts.likedSet(_posts.map(p => p.id));
    const hot = await Posts.hotTags(10);
    const hotRow = hot.length ? `<div class="hot-tags">${hot.map(h => `<button class="hot-tag" data-tag="${esc(h.tag)}">#${esc(h.tag)}</button>`).join("")}</div>` : "";
    _into(`${refresh}<div class="feed-trending-h">${ic("flame")} 熱門趨勢</div>${hotRow}${diffRow}<div class="feed-list">${_posts.map(p => card(p, liked.has(p.id))).join("")}</div>`);
    bind(); wireCommon(); writeCache(_mode, _posts);
    document.querySelectorAll(".hot-tag").forEach(b => b.addEventListener("click", () => openTag(b.dataset.tag)));
  }

  async function loadMore(first, g) {
    if (g == null) g = _gen;
    const before = (!first && _posts.length) ? _posts[_posts.length - 1].created_at : null;
    const batch = dropReported(await Posts.feed(_mode, before));
    if (g !== _gen) return;   // 已切到別的分頁/刷新 → 丟棄
    _posts = _posts.concat(batch);
    const refresh = `<button class="feed-refresh" id="feedRefresh">${ic("refresh")} 重新整理</button>`;
    if (!_posts.length) {
      _into(`${refresh}<div class="social-empty"><span class="ee">🏞️</span>追蹤山友後，這裡會出現他們的步道旅行（你自己的也會在這）。</div>`);
      wireRefresh();
      return;
    }
    const liked = await Posts.likedSet(_posts.map(p => p.id));
    const more = batch.length >= 20 ? `<button class="btn ghost" id="feedMore">載入更多</button>` : "";
    // 新動態分隔線：比上次看到還新的貼文歸為「新」
    const seen = first ? lastSeen(_mode) : "__skip__";
    let newCount = 0;
    if (first && seen) newCount = _posts.filter(p => p.created_at > seen).length;
    const items = _posts.map((p, i) => {
      const div = (first && newCount && i === newCount) ? `<div class="feed-divider">— 以上為新動態 —</div>` : "";
      return div + card(p, liked.has(p.id));
    }).join("");
    _into(`${refresh}<div class="feed-list">${items}</div>${more}`);
    bind(); wireRefresh();
    if (first) writeCache(_mode, _posts);
    if (first && _posts.length) markSeen(_mode, _posts[0].created_at);   // 記住這次最新
    const mb = document.getElementById("feedMore"); if (mb) mb.addEventListener("click", () => loadMore(false));
  }

  function wireRefresh() {
    const rb = document.getElementById("feedRefresh"); if (rb) rb.addEventListener("click", () => render(_into, _mode));
    attachPTR();
  }

  // 下拉刷新：列表捲到頂時往下拉超過門檻 → 重新整理
  function attachPTR() {
    const sc = document.getElementById("view-social"); if (!sc || sc._ptr) return; sc._ptr = true;
    let startY = 0, pulling = false;
    sc.addEventListener("touchstart", e => { pulling = sc.scrollTop <= 0; startY = e.touches[0].clientY; }, { passive: true });
    sc.addEventListener("touchmove", e => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      // 僅在動態牆畫面（有重新整理鈕）時觸發，避免在搜尋/通知分頁誤刷
      if (dy > 90 && _into && document.getElementById("feedRefresh")) { pulling = false; if (typeof toast === "function") toast("重新整理中…"); render(_into, _mode); }
    }, { passive: true });
    sc.addEventListener("touchend", () => { pulling = false; }, { passive: true });
  }

  function bind() {
    document.querySelectorAll(".feed-card .fc-like").forEach(b => b.addEventListener("click", async (e) => {
      e.stopPropagation();
      const on = !b.classList.contains("on");
      b.classList.toggle("on", on);
      const span = b.querySelector("span"); const n = +span.textContent + (on ? 1 : -1); span.textContent = Math.max(0, n);
      b.firstChild.textContent = on ? "❤️ " : "🤍 ";
      if (on && window.ttFloat) window.ttFloat(b, "❤️");
      await Posts.toggleLike(b.dataset.id, on);
    }));
    const openDetail = id => { if (typeof PostView !== "undefined") PostView.open(id); };
    document.querySelectorAll(".feed-card .fc-comment").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); openDetail(b.dataset.id); }));
    document.querySelectorAll(".feed-card .fc-author").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); if (typeof Discover !== "undefined") Discover.openProfile(b.dataset.uid); }));
    document.querySelectorAll(".feed-card .fc-traillink").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); if (typeof window.openDetail === "function") window.openDetail(b.dataset.trail); }));
    document.querySelectorAll(".feed-card .fc-vid").forEach(v => v.addEventListener("click", e => {
      e.stopPropagation();
      const src = v.dataset.vsrc; if (!src) return;
      v.innerHTML = `<video controls autoplay playsinline preload="metadata" src="${esc(src)}"></video>`;
    }));
    document.querySelectorAll(".feed-card .ht").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); openTag(b.dataset.tag); }));
    document.querySelectorAll(".feed-card .mention").forEach(b => b.addEventListener("click", e => { e.stopPropagation(); if (typeof Discover !== "undefined") Discover.openByHandle(b.dataset.handle); }));
    document.querySelectorAll(".feed-card").forEach(c => c.addEventListener("click", () => openDetail(c.dataset.id)));
  }

  // #標籤 動態：列出含此標籤的公開貼文
  async function openTag(tag) {
    const wrap = document.createElement("div"); wrap.className = "pv-mask";
    wrap.innerHTML = `<div class="pv"><div class="pv-head"><button class="comp-x" id="tagX" aria-label="關閉">✕</button><b>#${esc(tag)}</b><span></span></div>
      <div class="pv-body" id="tagBody"><div class="feed-loading"><span class="spin"></span></div></div></div>`;
    document.body.appendChild(wrap);
    wrap.querySelector("#tagX").addEventListener("click", () => wrap.remove());
    const posts = await Posts.byTag(tag);
    const body = wrap.querySelector("#tagBody"); if (!body) return;
    if (!posts.length) { body.innerHTML = `<div class="social-empty">還沒有 #${esc(tag)} 的公開貼文。</div>`; return; }
    const liked = await Posts.likedSet(posts.map(p => p.id));
    body.className = "pv-body feed-list";
    body.innerHTML = posts.map(p => card(p, liked.has(p.id))).join("");
    body.querySelectorAll(".feed-card").forEach(cd => cd.addEventListener("click", e => {
      if (e.target.closest(".fc-author") || e.target.closest(".fc-traillink") || e.target.closest(".ht") || e.target.closest(".mention") || e.target.closest(".fc-like")) return;
      if (typeof PostView !== "undefined") PostView.open(cd.dataset.id);
    }));
  }

  return { render, card, richText, openTag, _fmtAgo: fmtAgo };
})();
