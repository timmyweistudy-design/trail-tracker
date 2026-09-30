// 社群寵物互動：看好友的夥伴、送果實、領取別人送的果實。
const Pets = (() => {
  function esc(s) { return (s || "").replace(/[<>&"]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c])); }
  async function me() { const c = Supa.client(); if (!c) return null; const { data } = await c.auth.getUser(); return data && data.user ? data.user.id : null; }

  async function friendsPets() {
    const c = Supa.client(); const uid = await me(); if (!uid) return [];
    const { data: fo } = await c.from("follows").select("following_id").eq("follower_id", uid);
    const { data: fr } = await c.from("follows").select("follower_id").eq("following_id", uid);
    const following = new Set((fo || []).map(r => r.following_id));
    const mutual = (fr || []).map(r => r.follower_id).filter(id => following.has(id));
    if (!mutual.length) return [];
    const { data } = await c.from("profiles").select("id,handle,display_name,avatar_url,pet_name,pet_level").in("id", mutual).limit(100);
    return data || [];
  }

  async function sendGift(toId, n) {
    const c = Supa.client(); const { data, error } = await c.rpc("send_pet_gift", { p_to: toId, p_n: n });
    return { ok: !error && data, error: error && error.message };
  }

  // 領取別人送來的果實 → 加進本機 berryBonus
  let _claiming = false;   // 快速切換「夥伴」分頁會重入：兩次 SELECT 都讀到同一批未領取禮物 → 果實重複入帳
  async function claimGifts() {
    if (_claiming) return 0;
    _claiming = true;
    try { return await _claimGifts(); } finally { _claiming = false; }
  }
  async function _claimGifts() {
    const c = Supa.client(); const uid = await me(); if (!uid) return 0;
    const { data } = await c.from("pet_gifts").select("id,berries").eq("to_user", uid).eq("claimed", false).limit(200);
    if (!data || !data.length) return 0;
    const sum = data.reduce((s, g) => s + (g.berries || 0), 0);
    // 只標記「剛才讀到的那幾筆」：以前整批標「所有未領」，讀完到標記之間剛好送來的果實會被標成已領卻沒算到
    const { error } = await c.from("pet_gifts").update({ claimed: true }).in("id", data.map(g => g.id)).eq("claimed", false);
    if (error) return 0;
    if (sum > 0 && typeof addBerryBonus === "function") addBerryBonus(sum);
    return sum;
  }

  // 今天(本地)已送過果實的好友 id（送果實每天限一次/每人）
  async function giftedTodayIds() {
    const c = Supa.client(); const uid = await me(); if (!uid) return new Set();
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const { data } = await c.from("pet_gifts").select("to_user").eq("from_user", uid).gte("created_at", start.toISOString());
    return new Set((data || []).map(r => r.to_user));
  }

  async function renderFriends() {
    const box = document.getElementById("petFriends"); if (!box) return;
    if (typeof Supa === "undefined" || !Supa.ready()) { box.innerHTML = ""; return; }
    const sess = typeof Auth !== "undefined" ? await Auth.session().catch(() => null) : null;
    const H = `<div class="section-title"><svg class="ic" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M16 5.2A3 3 0 0 1 16 11M21 20a6 6 0 0 0-4-5.7"/></svg>好友的夥伴</div>`;
    if (!sess) { box.innerHTML = `<button class="fp-login" id="fpLogin">登入社群，就能看到好友的夥伴、互送果實 ›</button>`; const b = document.getElementById("fpLogin"); if (b) b.addEventListener("click", () => { const t = document.querySelector('.tab[data-view="social"]'); if (t) t.click(); }); return; }
    const [list, sentToday] = await Promise.all([friendsPets(), giftedTodayIds()]);
    if (!list.length) { box.innerHTML = `${H}<div class="social-empty" style="padding:14px">在社群互相追蹤山友後，這裡會出現他們的夥伴，可以送果實打氣。</div>`; return; }
    box.innerHTML = `${H}<div class="friend-pets">${list.map(p => {
      const lvl = p.pet_level || 1, emoji = (typeof PET_STAGES !== "undefined" && PET_STAGES[lvl - 1]) ? PET_STAGES[lvl - 1].e : "🥚";
      const art = (typeof PET_ART !== "undefined") ? PET_ART.svg(lvl - 1) : emoji;   // 好友夥伴也用 SVG 角色
      const sent = sentToday.has(p.id);
      return `<div class="fp"><span class="fp-pet">${art}</span><div class="fp-info"><b>${esc(p.pet_name || p.display_name || p.handle)}</b> <span class="lv-chip lvt-${Math.min(lvl, 7)}">Lv.${lvl}</span><div class="fp-by">@${esc(p.handle)}</div></div><button class="btn ghost fp-gift" data-id="${p.id}" data-name="${esc(p.display_name || p.handle)}"${sent ? " disabled" : ""}>${sent ? "今天已送" : "送 3🍓"}</button></div>`;
    }).join("")}</div>`;
    box.querySelectorAll(".fp-gift").forEach(b => b.addEventListener("click", async () => {
      if (typeof berriesBalance === "function" && berriesBalance() < 3) { if (typeof toast === "function") toast("果實不夠，再多走一點就有"); return; }
      b.disabled = true; b.textContent = "送出中…";
      const r = await sendGift(b.dataset.id, 3);
      if (!r.ok) { b.textContent = "今天已送"; if (typeof toast === "function") toast("今天送過這位了，明天再來"); return; }   // RPC 擋下＝今天已送
      if (typeof addBerryBonus === "function") addBerryBonus(-3);   // 扣自己 3 顆
      b.textContent = "今天已送";
      if (typeof toast === "function") toast("果實送出去了，對方會很開心");
      if (typeof renderPet === "function") renderPet();
    }));
  }

  return { friendsPets, sendGift, claimGifts, renderFriends };
})();
