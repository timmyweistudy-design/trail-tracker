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
  // 檢舉理由選單（取代純文字輸入）。回傳所選理由字串，取消則 null。
  function pickReason() {
    return new Promise(resolve => {
      const reasons = ["騷擾或霸凌", "不實或詐騙", "色情或不雅", "暴力或危險", "垃圾訊息 / 廣告", "其他"];
      const m = document.createElement("div"); m.className = "pv-mask report-mask";
      m.innerHTML = `<div class="report-sheet"><h3>檢舉原因</h3>${reasons.map(r => `<button class="report-opt" data-r="${r}">${r}</button>`).join("")}<button class="btn ghost" id="reportCancel">取消</button></div>`;
      document.body.appendChild(m);
      const done = v => { m.remove(); resolve(v); };
      m.querySelectorAll(".report-opt").forEach(b => b.addEventListener("click", () => done(b.dataset.r)));
      m.querySelector("#reportCancel").addEventListener("click", () => done(null));
      m.addEventListener("click", e => { if (e.target === m) done(null); });
    });
  }
  // 已封鎖的人（含 profile）供管理頁
  async function blockedProfiles() {
    const c = Supa.client(); const m = await me(); if (!m) return [];
    const { data } = await c.from("blocks").select("blocked_id").eq("blocker_id", m);
    const ids = (data || []).map(r => r.blocked_id); if (!ids.length) return [];
    const { data: profs } = await c.from("profiles").select("id, handle, display_name, avatar_url").in("id", ids);
    return profs || [];
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
  return { isBlocked, blockedIds, blockedProfiles, block, unblock, reportPost, reportUser, pickReason };
})();
