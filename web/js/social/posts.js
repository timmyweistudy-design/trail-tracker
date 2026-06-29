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

  return { createFromRecord, feed, userPosts, one, likedSet, toggleLike, likeCount, followingIds, remove, followCounts };
})();
