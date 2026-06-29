// 內容安全：封鎖/解除封鎖、是否已封鎖、檢舉貼文/使用者。
const Safety = (() => {
  async function me() { const c = Supa.client(); if (!c) return null; const { data } = await c.auth.getUser(); return data && data.user ? data.user.id : null; }

  async function isBlocked(uid) {
    const c = Supa.client(); const m = await me(); if (!m) return false;
    const { data } = await c.from("blocks").select("blocked_id").eq("blocker_id", m).eq("blocked_id", uid).maybeSingle();
    return !!data;
  }
  async function blockedIds() {
    const c = Supa.client(); const m = await me(); if (!m) return new Set();
    const { data } = await c.from("blocks").select("blocked_id").eq("blocker_id", m);
    return new Set((data || []).map(r => r.blocked_id));
  }
  async function block(uid) {
    const c = Supa.client(); const m = await me(); if (!m) return { error: "not-signed-in" };
    const { error } = await c.from("blocks").insert({ blocker_id: m, blocked_id: uid });
    // 解除雙向追蹤
    await c.from("follows").delete().eq("follower_id", m).eq("following_id", uid);
    await c.from("follows").delete().eq("follower_id", uid).eq("following_id", m);
    return { error: error && error.message };
  }
  async function unblock(uid) {
    const c = Supa.client(); const m = await me(); if (!m) return { error: "not-signed-in" };
    const { error } = await c.from("blocks").delete().eq("blocker_id", m).eq("blocked_id", uid);
    return { error: error && error.message };
  }
  async function reportPost(postId, reason) {
    const c = Supa.client(); const m = await me(); if (!m) return { error: "not-signed-in" };
    const { error } = await c.from("reports").insert({ reporter_id: m, post_id: postId, reason: reason || null });
    return { error: error && error.message };
  }
  async function reportUser(uid, reason) {
    const c = Supa.client(); const m = await me(); if (!m) return { error: "not-signed-in" };
    const { error } = await c.from("reports").insert({ reporter_id: m, reported_user: uid, reason: reason || null });
    return { error: error && error.message };
  }
  return { isBlocked, blockedIds, block, unblock, reportPost, reportUser };
})();
