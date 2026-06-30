// 貼文資料層：從健行記錄建立貼文（含上傳照片）、取動態牆、使用者貼文、按讚。
const Posts = (() => {
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  function toGeo(track) {
    if (!track || !track.length) return null;
    return { type: "LineString", coordinates: track.map(p => [p.lon, p.lat]) };
  }
  // 降取樣成 ≤40 點的輕量縮圖（動態牆卡片畫路線形狀用，不必傳整條軌跡）
  function thumbOf(track) {
    if (!track || track.length < 2) return null;
    const step = Math.max(1, Math.ceil(track.length / 40)), pts = [];
    for (let i = 0; i < track.length; i += step) pts.push([+track[i].lon.toFixed(5), +track[i].lat.toFixed(5)]);
    const last = track[track.length - 1]; pts.push([+last.lon.toFixed(5), +last.lat.toFixed(5)]);
    return pts;
  }

  // 從健行記錄 rec + 選好的檔案建立貼文。回傳 { id } 或 { error }。
  async function createFromRecord(rec, opts) {
    const { caption, visibility, files, video, rating } = opts || {};
    const c = Supa.client(); if (!c) return { error: "no-client" };
    const { data: u } = await c.auth.getUser(); if (!u || !u.user) return { error: "not-signed-in" };
    const uid = u.user.id, postId = uuid();
    const { error: pe } = await c.from("posts").insert({
      id: postId, author_id: uid,
      trail_id: rec.trailId || null, trail_name: rec.trailName || "自由路線",
      distance_km: rec.distanceKm != null ? rec.distanceKm : null,
      duration_ms: rec.elapsedMs != null ? rec.elapsedMs : null,
      ascent: rec.ascent != null ? rec.ascent : null,
      hiked_on: (rec.date || new Date().toISOString()).slice(0, 10),
      caption: caption || null,
      visibility: visibility === "public" ? "public" : "friends",
      track: toGeo(rec.track),
      track_thumb: thumbOf(rec.track),
      rating: (rating && rating > 0) ? rating : null,
    });
    if (pe) return { error: pe.message };

    const media = [];
    const list = (files || []).slice(0, 9);
    for (let i = 0; i < list.length; i++) {
      const item = list[i], file = (item && item.file) || item;   // 相容：{file,t,km} 或純 File
      try {
        const { main, thumb, w, h } = await Media.compressImage(file);
        const base = uuid();
        const path = await Media.upload(uid, postId, main, base + ".jpg");
        const thumb_path = await Media.upload(uid, postId, thumb, base + "_thumb.jpg");
        media.push({ post_id: postId, kind: "photo", path, thumb_path, w, h, ord: i,
          taken_at: (item && item.t) ? new Date(item.t).toISOString() : null,
          km: (item && item.km != null) ? item.km : null });
      } catch (e) { console.warn("media upload failed", e && e.message); }
    }
    if (video && video.file) {
      try {
        const v = await Media.uploadVideo(uid, postId, video.file, video.dur);
        media.push({ post_id: postId, kind: "video", path: v.path, thumb_path: v.thumb_path, dur: v.dur, ord: media.length });
      } catch (e) { console.warn("video upload failed", e && e.message); }
    }
    if (media.length) { const { error: me } = await c.from("post_media").insert(media); if (me) console.warn(me.message); }
    notifyMentions(caption, postId);   // @提及通知（migration 未跑則靜默）
    return { id: postId };
  }

  const SELECT = `
    id, author_id, trail_id, trail_name, distance_km, duration_ms, ascent, hiked_on, caption, visibility, created_at, track_thumb, rating,
    author:profiles!posts_author_profile_fk(handle, display_name, avatar_url, pet_level),
    post_media(kind, path, thumb_path, ord, taken_at, km),
    likes(count), comments(count)`;

  async function followingIds() {
    const c = Supa.client(); const { data: u } = await c.auth.getUser(); if (!u || !u.user) return [];
    const { data } = await c.from("follows").select("following_id").eq("follower_id", u.user.id);
    return (data || []).map(r => r.following_id);
  }

  // mode: "friends"（我追蹤的人）| "explore"（公開）。beforeISO 供分頁。
  async function feed(mode, beforeISO) {
    const c = Supa.client(); if (!c) return [];
    let q = c.from("posts").select(SELECT).order("created_at", { ascending: false }).limit(20);
    if (beforeISO) q = q.lt("created_at", beforeISO);
    if (mode === "explore") {
      q = q.eq("visibility", "public");
    } else {
      // 動態＝我追蹤的人 + 我自己（首頁也看得到自己發的貼文）
      const ids = await followingIds();
      const { data: u } = await c.auth.getUser();
      if (u && u.user) ids.push(u.user.id);
      if (!ids.length) return [];
      q = q.in("author_id", ids);
    }
    const { data, error } = await q;
    if (error) { console.warn("feed", error.message); return []; }
    return data || [];
  }

  async function userPosts(userId) {
    const c = Supa.client(); if (!c) return [];
    const { data, error } = await c.from("posts").select(SELECT).eq("author_id", userId)
      .order("created_at", { ascending: false }).limit(40);
    if (error) { console.warn("userPosts", error.message); return []; }
    return data || [];
  }

  // 某步道的公開貼文（步道詳情頁「山友的旅行」用）
  async function byTrail(trailId, limit) {
    const c = Supa.client(); if (!c || !trailId) return [];
    const { data, error } = await c.from("posts").select(SELECT).eq("trail_id", String(trailId))
      .eq("visibility", "public").order("created_at", { ascending: false }).limit(limit || 12);
    if (error) { console.warn("byTrail", error.message); return []; }
    return data || [];
  }

  // 熱門探索：抓近期公開貼文，依「互動數＋時間衰減」排序（趨勢牆）
  async function trending() {
    const c = Supa.client(); if (!c) return [];
    const { data, error } = await c.from("posts").select(SELECT).eq("visibility", "public")
      .order("created_at", { ascending: false }).limit(60);
    if (error) { console.warn("trending", error.message); return []; }
    const score = p => {
      const eng = count(p.likes) + 2 * count(p.comments);
      const hrs = (Date.now() - new Date(p.created_at).getTime()) / 3600000;
      return (eng + 1) / Math.pow(hrs + 2, 0.6);   // 新且互動高 → 分數高
    };
    return (data || []).slice().sort((a, b) => score(b) - score(a)).slice(0, 30);
  }
  function count(arr) { return (arr && arr[0] && arr[0].count) || 0; }

  // 推薦追蹤：近期活躍且我還沒追蹤的山友
  async function suggestions() {
    const c = Supa.client(); if (!c) return [];
    const { data: u } = await c.auth.getUser(); if (!u || !u.user) return [];
    const me = u.user.id;
    const { data: recent } = await c.from("posts").select("author_id, created_at")
      .eq("visibility", "public").order("created_at", { ascending: false }).limit(120);
    const followed = new Set(await followingIds());
    const blocked = (typeof Safety !== "undefined") ? await Safety.blockedIds() : new Set();
    const seen = new Set(), ids = [];
    for (const r of (recent || [])) {
      const a = r.author_id;
      if (a === me || followed.has(a) || blocked.has(a) || seen.has(a)) continue;
      seen.add(a); ids.push(a); if (ids.length >= 12) break;
    }
    if (!ids.length) return [];
    const { data: profs } = await c.from("profiles").select("id, handle, display_name, avatar_url, pet_level").in("id", ids);
    return profs || [];
  }

  async function one(postId) {
    const c = Supa.client(); if (!c) return null;
    const { data } = await c.from("posts").select(SELECT + ", track").eq("id", postId).maybeSingle();
    return data || null;
  }

  // 我對哪些 postId 按過讚 → Set
  async function likedSet(postIds) {
    const c = Supa.client(); const { data: u } = await c.auth.getUser();
    if (!u || !u.user || !postIds.length) return new Set();
    const { data } = await c.from("likes").select("post_id").eq("user_id", u.user.id).in("post_id", postIds);
    return new Set((data || []).map(r => r.post_id));
  }

  async function toggleLike(postId, on) {
    const c = Supa.client(); const { data: u } = await c.auth.getUser(); if (!u || !u.user) return { error: "not-signed-in" };
    if (on) { const { error } = await c.from("likes").insert({ post_id: postId, user_id: u.user.id }); return { error: error && error.message }; }
    const { error } = await c.from("likes").delete().eq("post_id", postId).eq("user_id", u.user.id);
    return { error: error && error.message };
  }

  async function remove(postId) {
    const c = Supa.client(); const { error } = await c.from("posts").delete().eq("id", postId);
    return { error: error && error.message };
  }

  // ===== #主題標籤 =====
  function parseTags(text) {
    const out = []; const re = /#([^\s#@.,!?；，。、]{1,30})/g; let m;
    while ((m = re.exec(text || "")) && out.length < 10) if (!out.includes(m[1])) out.push(m[1]);
    return out;
  }
  // 以標籤找公開貼文（用 caption 比對，免依賴新欄位）
  async function byTag(tag) {
    const c = Supa.client(); if (!c || !tag) return [];
    const safe = tag.replace(/[%,()*\\]/g, "");
    const { data, error } = await c.from("posts").select(SELECT).eq("visibility", "public")
      .ilike("caption", `%#${safe}%`).order("created_at", { ascending: false }).limit(30);
    if (error) { console.warn("byTag", error.message); return []; }
    return data || [];
  }

  // 近期熱門標籤（掃描最新公開貼文的 caption）
  let _hotCache = null, _hotAt = 0;
  async function hotTags(limit) {
    if (_hotCache && Date.now() - _hotAt < 120000) return _hotCache.slice(0, limit || 12);
    const c = Supa.client(); if (!c) return [];
    const { data } = await c.from("posts").select("caption").eq("visibility", "public").order("created_at", { ascending: false }).limit(120);
    const counts = {};
    for (const p of (data || [])) for (const t of parseTags(p.caption)) counts[t] = (counts[t] || 0) + 1;
    const sorted = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).map(t => ({ tag: t, n: counts[t] }));
    _hotCache = sorted; _hotAt = Date.now();
    return sorted.slice(0, limit || 12);
  }

  // ===== @提及通知（需 phase11；失敗則靜默） =====
  async function notifyMentions(text, postId) {
    try {
      const c = Supa.client(); if (!c) return;
      const handles = []; const re = /@([a-z0-9_]{3,20})/gi; let m;
      while ((m = re.exec(text || "")) && handles.length < 10) handles.push(m[1].toLowerCase());
      if (!handles.length) return;
      const { data: profs } = await c.from("profiles").select("id, handle").in("handle", handles);
      for (const p of (profs || [])) await c.rpc("notify_mention", { p_user: p.id, p_post: postId || null });
    } catch (e) { /* 尚未跑 migration → 略過 */ }
  }

  // ===== 表情回應（需 phase11；失敗回空） =====
  async function reactions(postId) {
    try { const c = Supa.client(); const { data } = await c.from("reactions").select("user_id, emoji").eq("post_id", postId); return data || []; }
    catch (e) { return []; }
  }
  async function setReaction(postId, emoji) {
    const c = Supa.client(); const { data: u } = await c.auth.getUser(); if (!u || !u.user) return { error: "not-signed-in" };
    const { error } = await c.from("reactions").upsert({ post_id: postId, user_id: u.user.id, emoji }, { onConflict: "post_id,user_id" });
    return { error: error && error.message };
  }
  async function clearReaction(postId) {
    const c = Supa.client(); const { data: u } = await c.auth.getUser(); if (!u || !u.user) return;
    await c.from("reactions").delete().eq("post_id", postId).eq("user_id", u.user.id);
  }

  // ===== 留言按讚（需 phase11；失敗回空） =====
  async function commentLikes(commentIds) {
    try {
      const c = Supa.client(); const { data: u } = await c.auth.getUser();
      if (!commentIds.length) return { counts: {}, mine: new Set() };
      const { data } = await c.from("comment_likes").select("comment_id, user_id").in("comment_id", commentIds);
      const counts = {}, mine = new Set();
      for (const r of (data || [])) { counts[r.comment_id] = (counts[r.comment_id] || 0) + 1; if (u && u.user && r.user_id === u.user.id) mine.add(r.comment_id); }
      return { counts, mine };
    } catch (e) { return { counts: {}, mine: new Set() }; }
  }
  async function toggleCommentLike(commentId, on) {
    const c = Supa.client(); const { data: u } = await c.auth.getUser(); if (!u || !u.user) return;
    if (on) await c.from("comment_likes").insert({ comment_id: commentId, user_id: u.user.id });
    else await c.from("comment_likes").delete().eq("comment_id", commentId).eq("user_id", u.user.id);
  }

  // ===== 轉發（需 phase11 的 repost_of 欄位） =====
  async function createRepost(original, quote) {
    const c = Supa.client(); const { data: u } = await c.auth.getUser(); if (!u || !u.user) return { error: "not-signed-in" };
    const id = uuid();
    const handle = original.author && original.author.handle;
    const head = handle ? `🔁 轉發 @${handle}` : "🔁 轉發";
    const caption = quote ? head + "\n" + quote : head;
    const { error } = await c.from("posts").insert({
      id, author_id: u.user.id, repost_of: original.id,
      trail_id: original.trail_id || null, trail_name: original.trail_name || "自由路線",
      distance_km: original.distance_km, ascent: original.ascent,
      hiked_on: (original.hiked_on || new Date().toISOString().slice(0, 10)),
      caption, track_thumb: original.track_thumb || null,
      visibility: "public", rating: original.rating || null,
    });
    if (error) return { error: error.message };
    notifyMentions(caption, id);
    return { id };
  }

  async function likeCount(postId) {
    const c = Supa.client(); if (!c) return 0;
    const { count } = await c.from("likes").select("*", { count: "exact", head: true }).eq("post_id", postId);
    return count || 0;
  }

  // 追蹤數（我追蹤幾人）與粉絲數（幾人追蹤我）
  async function followCounts(uid) {
    const c = Supa.client(); if (!c) return { followers: 0, following: 0 };
    const fr = await c.from("follows").select("*", { count: "exact", head: true }).eq("following_id", uid);
    const fg = await c.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", uid);
    return { followers: fr.count || 0, following: fg.count || 0 };
  }

  // ===== 收藏貼文（本機書籤） =====
  function savedIds() { try { return JSON.parse(localStorage.getItem("tt_saved") || "[]"); } catch { return []; } }
  function isSaved(id) { return savedIds().includes(id); }
  function toggleSaved(id) {
    const a = savedIds(); const i = a.indexOf(id);
    if (i === -1) a.unshift(id); else a.splice(i, 1);
    try { localStorage.setItem("tt_saved", JSON.stringify(a.slice(0, 200))); } catch (e) { }
    return i === -1;
  }
  async function savedPosts() {
    const ids = savedIds(); if (!ids.length) return [];
    const c = Supa.client(); if (!c) return [];
    const { data } = await c.from("posts").select(SELECT).in("id", ids);
    const order = new Map(ids.map((id, i) => [id, i]));   // 維持收藏順序
    return (data || []).sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
  }

  // 依 handle 字首搜尋使用者（@ 自動完成用）
  async function searchHandles(prefix) {
    const c = Supa.client(); if (!c || !prefix) return [];
    const safe = prefix.replace(/[%,()*\\]/g, "");
    const { data } = await c.from("profiles").select("handle, display_name, avatar_url").ilike("handle", `${safe}%`).limit(6);
    return data || [];
  }

  return { createFromRecord, feed, userPosts, byTrail, byTag, trending, suggestions, hotTags, searchHandles, one, likedSet, toggleLike, likeCount, followingIds, remove, followCounts,
    parseTags, notifyMentions, reactions, setReaction, clearReaction, commentLikes, toggleCommentLike, createRepost,
    savedIds, isSaved, toggleSaved, savedPosts };
})();
